import { getKindeServerSession } from "@/lib/kinde";
import { getUserSessionWithRBAC } from "@/lib/auth-rbac";
import {
  router,
  publicProcedure,
  privateProcedure,
  adminProcedure,
} from "./trpc";
import { TRPCError } from "@trpc/server";
import { db } from "@/db";
import z from "zod";
import { INFINITE_QUERY_LIMIT } from "@/config/infinite-query";
import { absoluteUrl } from "@/lib/utils";
import {
  getUserSubscriptionPlan,
  getDynamicPlans,
  stripe,
} from "@/lib/stripe";
import {
  isPaystackConfigured,
  initializePaystackTransaction,
  verifyPaystackTransaction,
  grantUserProAccess,
  PAYSTACK_PRO_AMOUNT_KOBO,
} from "@/lib/paystack";
import { pinecone, isPineconeConfigured } from "@/lib/pinecone";
import { isAiConfigured } from "@/lib/ai";
import { deleteDocumentBuffer } from "@/lib/document-storage";
import fs from "fs";
import path from "path";

export const appRouter = router({
  authCallback: publicProcedure.query(async () => {
    const rbac = await getUserSessionWithRBAC();

    if (!rbac.isAuthenticated || !rbac.user?.id) {
      throw new TRPCError({ code: "UNAUTHORIZED" });
    }

    return {
      success: true,
      role: rbac.role,
      isAdmin: rbac.isAdmin,
    };
  }),

  getMyRole: publicProcedure.query(async () => {
    return await getUserSessionWithRBAC();
  }),

  getPublicPlans: publicProcedure.query(async () => {
    return await getDynamicPlans();
  }),

  getUserFiles: privateProcedure.query(async ({ ctx }) => {
    const { userId } = ctx;

    return await db.file.findMany({
      where: {
        userId,
      },
      orderBy: {
        createdAt: "desc",
      },
    });
  }),

  createStripeSession: privateProcedure.mutation(async ({ ctx }) => {
    const { userId } = ctx;

    const billingUrl = absoluteUrl("/dashboard/billing");

    if (!userId) throw new TRPCError({ code: "UNAUTHORIZED" });

    const dbUser = await db.user.findFirst({
      where: {
        id: userId,
      },
    });

    if (!dbUser) throw new TRPCError({ code: "UNAUTHORIZED" });

    const subscriptionPlan = await getUserSubscriptionPlan();
    const dynamicPlans = await getDynamicPlans();
    const proPlan =
      dynamicPlans.find((p) => p.slug === "pro") ||
      dynamicPlans.find((p) => p.price.amount > 0) ||
      dynamicPlans[0];

    const isStripeConfigured = Boolean(
      process.env.STRIPE_SECRET_KEY &&
        process.env.STRIPE_SECRET_KEY.startsWith("sk_") &&
        !process.env.STRIPE_SECRET_KEY.includes("<your")
    );

    // 1. Paystack Gateway (Prioritized: NGN Cards, Bank Transfer, USSD, OPay & International USD/GBP Cards)
    if (isPaystackConfigured()) {
      try {
        if (!subscriptionPlan.isSubscribed) {
          const dynamicKobo =
            proPlan?.price.amountNgn && proPlan.price.amountNgn > 0
              ? Math.round(proPlan.price.amountNgn * 100)
              : PAYSTACK_PRO_AMOUNT_KOBO;

          const paystackSession = await initializePaystackTransaction({
            email: dbUser.email,
            userId: userId,
            amountKobo: dynamicKobo,
            callbackUrl: billingUrl,
          });

          return { url: paystackSession.authorization_url };
        } else {
          return { url: `${billingUrl}?status=active` };
        }
      } catch (paystackErr: any) {
        console.warn(
          "Paystack initialization failed, checking secondary gateway:",
          paystackErr.message
        );
      }
    }

    // 2. Stripe Gateway (Secondary fallback if configured)
    if (isStripeConfigured) {
      try {
        if (subscriptionPlan.isSubscribed && dbUser.stripeCustomerId) {
          const stripeSession = await stripe.billingPortal.sessions.create({
            customer: dbUser.stripeCustomerId,
            return_url: billingUrl,
          });

          return { url: stripeSession.url };
        }

        const proPriceId =
          proPlan?.price.priceIds.test || proPlan?.price.priceIds.production;

        const stripeSession = await stripe.checkout.sessions.create({
          success_url: billingUrl,
          cancel_url: billingUrl,
          payment_method_types: ["card"],
          mode: "subscription",
          billing_address_collection: "auto",
          line_items: [
            {
              price: proPriceId,
              quantity: 1,
            },
          ],
          metadata: {
            userId: userId,
          },
        });

        return { url: stripeSession.url };
      } catch (stripeErr: any) {
        console.warn(
          "Stripe API failed, falling back to instant activation:",
          stripeErr.message
        );
      }
    }

    // 3. Seamless Dev / Testing Mode: Activate or toggle Pro plan directly
    const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    if (subscriptionPlan.isSubscribed) {
      await db.user.update({
        where: { id: userId },
        data: {
          stripePriceId: null,
          stripeSubscriptionId: null,
          stripeCurrentPeriodEnd: null,
        },
      });
      return { url: `${billingUrl}?canceled=true` };
    } else {
      await db.user.update({
        where: { id: userId },
        data: {
          stripeCustomerId:
            dbUser.stripeCustomerId || `cus_test_${userId.slice(0, 8)}`,
          stripeSubscriptionId: `sub_test_${Date.now()}`,
          stripePriceId: proPlan?.price.priceIds.test || proPlan?.slug || "pro",
          stripeCurrentPeriodEnd: thirtyDaysFromNow,
        },
      });
      return { url: `${billingUrl}?upgraded=true` };
    }
  }),

  verifyPaystackPayment: privateProcedure
    .input(z.object({ reference: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { userId } = ctx;
      if (!isPaystackConfigured()) {
        return { success: false, reason: "not_configured" };
      }

      try {
        const txData = await verifyPaystackTransaction(input.reference);
        if (
          txData &&
          (txData.status === "success" || txData.gateway_response === "Successful")
        ) {
          const userMetaId =
            txData.metadata?.userId ||
            txData.metadata?.user_id ||
            txData.metadata?.custom_fields?.find(
              (f: any) => f.variable_name === "user_id"
            )?.value;

          if (!userMetaId || userMetaId === userId) {
            await grantUserProAccess(
              userId,
              input.reference,
              txData.customer?.customer_code
            );
            return { success: true, verified: true };
          }
        }
        return { success: false, reason: "verification_unmatched" };
      } catch (err: any) {
        console.warn("[verifyPaystackPayment] error:", err.message);
        return { success: false, error: err.message };
      }
    }),

  getFileUploadStatus: privateProcedure
    .input(z.object({ fileId: z.string() }))
    .query(async ({ input, ctx }) => {
      if (input.fileId.startsWith("multi_")) {
        return { status: "SUCCESS" as const };
      }

      const file = await db.file.findFirst({
        where: {
          id: input.fileId,
          userId: ctx.userId,
        },
      });

      if (!file) return { status: "PENDING" as const };

      return { status: file.uploadStatus };
    }),

  getFile: privateProcedure
    .input(z.object({ key: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { userId } = ctx;
      const file = await db.file.findFirst({
        where: {
          key: input.key,
          userId,
        },
      });

      if (!file) throw new TRPCError({ code: "NOT_FOUND" });

      return file;
    }),

  deleteFile: privateProcedure
    .input(
      z.object({
        id: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { userId } = ctx;
      const file = await db.file.findFirst({
        where: {
          id: input.id,
          userId,
        },
      });

      if (!file) throw new TRPCError({ code: "NOT_FOUND" });

      await db.file.delete({
        where: {
          id: input.id,
        },
      });

      // Clear chunked document storage from MongoDB
      await deleteDocumentBuffer(input.id);

      if (isPineconeConfigured) {
        try {
          const pineconeIndex = pinecone.Index("quill");
          const ns = pineconeIndex.namespace(input.id);
          await ns.deleteAll();
          console.log(
            `[deleteFile] Cleared Pinecone vectors for file: ${input.id}`
          );
        } catch (e) {
          console.warn("[deleteFile] Could not delete Pinecone namespace:", e);
        }
      }

      return file;
    }),

  getFileMessages: privateProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).nullish(),
        cursor: z.string().nullish(),
        fileId: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { userId } = ctx;
      const { fileId, cursor } = input;
      const limit = input.limit ?? INFINITE_QUERY_LIMIT;

      if (!fileId.startsWith("multi_")) {
        const file = await db.file.findFirst({
          where: {
            id: fileId,
            userId,
          },
        });
        if (!file) throw new TRPCError({ code: "NOT_FOUND" });
      }
      const messages = await db.message.findMany({
        take: limit + 1,
        where: {
          fileId,
        },
        orderBy: {
          createdAt: "desc",
        },
        cursor: cursor ? { id: cursor } : undefined,
        select: {
          id: true,
          isUserMessage: true,
          createdAt: true,
          text: true,
        },
      });

      let nextCursor: typeof cursor | undefined = undefined;
      if (messages.length > limit) {
        const nextItem = messages.pop();
        nextCursor = nextItem?.id;
      }

      return { messages, nextCursor };
    }),

  // =========================================================================
  // ADMIN RBAC PROCEDURES (Protected by adminProcedure middleware)
  // =========================================================================

  adminGetOverview: adminProcedure.query(async () => {
    const [allUsers, allFiles, allMessages, dynamicPlans] = await Promise.all([
      db.user.findMany({ orderBy: { createdAt: "desc" } }),
      db.file.findMany({ orderBy: { createdAt: "desc" } }),
      db.message.findMany({ orderBy: { createdAt: "desc" } }),
      getDynamicPlans(),
    ]);

    const now = Date.now();
    const freePlan =
      dynamicPlans.find((p) => p.slug === "free") || dynamicPlans[0];
    const proPlan =
      dynamicPlans.find((p) => p.slug === "pro") ||
      dynamicPlans[1] ||
      freePlan;

    let subscribedCount = 0;
    let adminCount = 0;
    let suspendedCount = 0;
    let estimatedMrr = 0;

    const enrichedUsers = allUsers.map((u: any) => {
      const periodEnd = u.stripeCurrentPeriodEnd
        ? new Date(u.stripeCurrentPeriodEnd)
        : null;
      const isSubscribed = Boolean(
        u.stripePriceId && periodEnd && periodEnd.getTime() + 86_400_000 > now
      );
      const matchedPlan = isSubscribed
        ? dynamicPlans.find(
            (p) =>
              p.slug === u.stripePriceId ||
              p.price.priceIds.test === u.stripePriceId ||
              p.price.priceIds.production === u.stripePriceId ||
              (u.stripePriceId === "pro" && p.slug === "pro")
          ) || proPlan
        : freePlan;

      if (isSubscribed) {
        subscribedCount++;
        estimatedMrr += matchedPlan?.price.amount || 0;
      }
      if ((u.role || "USER") === "ADMIN") adminCount++;
      if ((u.status || "ACTIVE") === "SUSPENDED") suspendedCount++;

      const userFiles = allFiles.filter((f: any) => f.userId === u.id);
      const userMessages = allMessages.filter((m: any) => m.userId === u.id);

      return {
        ...u,
        role: u.role || "USER",
        status: u.status || "ACTIVE",
        isSubscribed,
        planName: matchedPlan?.name || "Free",
        planSlug: matchedPlan?.slug || "free",
        planQuota: matchedPlan?.quota || 10,
        filesCount: userFiles.length,
        messagesCount: userMessages.length,
      };
    });

    const successFiles = allFiles.filter(
      (f: any) => f.uploadStatus === "SUCCESS"
    ).length;
    const processingFiles = allFiles.filter(
      (f: any) =>
        f.uploadStatus === "PROCESSING" || f.uploadStatus === "PENDING"
    ).length;
    const failedFiles = allFiles.filter(
      (f: any) => f.uploadStatus === "FAILED"
    ).length;

    const pdfCount = allFiles.filter((f: any) =>
      f.name?.toLowerCase().endsWith(".pdf")
    ).length;
    const docxCount = allFiles.filter((f: any) =>
      /\.(docx|doc)$/i.test(f.name || "")
    ).length;
    const pptxCount = allFiles.filter((f: any) =>
      /\.(pptx|ppt)$/i.test(f.name || "")
    ).length;

    const userQuestionsCount = allMessages.filter(
      (m: any) => m.isUserMessage
    ).length;
    const aiResponsesCount = allMessages.filter(
      (m: any) => !m.isUserMessage
    ).length;

    return {
      metrics: {
        totalUsers: allUsers.length,
        subscribedUsers: subscribedCount,
        freeUsers: Math.max(0, allUsers.length - subscribedCount),
        adminUsers: adminCount,
        suspendedUsers: suspendedCount,
        estimatedMrr,
        estimatedArr: estimatedMrr * 12,
        totalFiles: allFiles.length,
        successFiles,
        processingFiles,
        failedFiles,
        pdfCount,
        docxCount,
        pptxCount,
        totalMessages: allMessages.length,
        userQuestionsCount,
        aiResponsesCount,
      },
      recentUsers: enrichedUsers.slice(0, 6),
      recentFiles: allFiles.slice(0, 6).map((f: any) => {
        const owner = allUsers.find((u: any) => u.id === f.userId);
        return {
          ...f,
          ownerEmail: owner?.email || "Unknown user",
          ownerName: owner?.name || null,
          messagesCount: allMessages.filter((m: any) => m.fileId === f.id)
            .length,
        };
      }),
      plans: dynamicPlans,
      systemHealth: {
        kindeConfigured: Boolean(
          process.env.KINDE_CLIENT_ID && process.env.KINDE_ISSUER_URL
        ),
        aiConfigured: isAiConfigured,
        pineconeConfigured: isPineconeConfigured,
        databaseMode: Boolean(
          process.env.DATABASE_URL && process.env.DATABASE_URL.trim() !== ""
        )
          ? "MongoDB Cloud"
          : "Local JSON Store",
        stripeMode: Boolean(
          process.env.STRIPE_SECRET_KEY &&
            process.env.STRIPE_SECRET_KEY.startsWith("sk_")
        )
          ? "Live Stripe API"
          : "Instant Test Activation",
        paystackMode: isPaystackConfigured()
          ? "Live Paystack Gateway (NGN & International Cards)"
          : "Development Test Mode",
      },
    };
  }),

  // --- ADMIN USERS & SUBSCRIPTIONS CRUD ---

  adminGetUsers: adminProcedure.query(async () => {
    const [allUsers, allFiles, allMessages, dynamicPlans] = await Promise.all([
      db.user.findMany({ orderBy: { createdAt: "desc" } }),
      db.file.findMany(),
      db.message.findMany(),
      getDynamicPlans(),
    ]);

    const now = Date.now();
    const freePlan =
      dynamicPlans.find((p) => p.slug === "free") || dynamicPlans[0];
    const proPlan =
      dynamicPlans.find((p) => p.slug === "pro") ||
      dynamicPlans[1] ||
      freePlan;

    return allUsers.map((u: any) => {
      const periodEnd = u.stripeCurrentPeriodEnd
        ? new Date(u.stripeCurrentPeriodEnd)
        : null;
      const isSubscribed = Boolean(
        u.stripePriceId && periodEnd && periodEnd.getTime() + 86_400_000 > now
      );
      const matchedPlan = isSubscribed
        ? dynamicPlans.find(
            (p) =>
              p.slug === u.stripePriceId ||
              p.price.priceIds.test === u.stripePriceId ||
              p.price.priceIds.production === u.stripePriceId ||
              (u.stripePriceId === "pro" && p.slug === "pro")
          ) || proPlan
        : freePlan;

      const userFiles = allFiles.filter((f: any) => f.userId === u.id);
      const userMessages = allMessages.filter((m: any) => m.userId === u.id);

      return {
        id: u.id,
        email: u.email,
        name: u.name || u.email?.split("@")[0] || "User",
        role: (u.role || "USER") as "ADMIN" | "USER",
        status: (u.status || "ACTIVE") as "ACTIVE" | "SUSPENDED",
        isSubscribed,
        planName: matchedPlan?.name || "Free",
        planSlug: matchedPlan?.slug || "free",
        planQuota: matchedPlan?.quota || 10,
        planPrice: matchedPlan?.price.amount || 0,
        stripeCustomerId: u.stripeCustomerId || null,
        stripeSubscriptionId: u.stripeSubscriptionId || null,
        stripePriceId: u.stripePriceId || null,
        stripeCurrentPeriodEnd: u.stripeCurrentPeriodEnd || null,
        filesCount: userFiles.length,
        messagesCount: userMessages.length,
        createdAt: u.createdAt || new Date().toISOString(),
        updatedAt: u.updatedAt || new Date().toISOString(),
      };
    });
  }),

  adminCreateUser: adminProcedure
    .input(
      z.object({
        email: z.string().email("Valid email is required"),
        name: z.string().min(1, "Name is required"),
        role: z.enum(["USER", "ADMIN"]).default("USER"),
        status: z.enum(["ACTIVE", "SUSPENDED"]).default("ACTIVE"),
        planSlug: z.string().default("free"),
        durationDays: z.number().min(1).max(3650).default(30),
      })
    )
    .mutation(async ({ input }) => {
      const existing = await db.user.findFirst({
        where: { email: input.email.toLowerCase().trim() },
      });

      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "A user with this email already exists.",
        });
      }

      const dynamicPlans = await getDynamicPlans();
      const targetPlan = dynamicPlans.find((p) => p.slug === input.planSlug);
      const isPaidPlan = targetPlan && targetPlan.slug !== "free";

      const periodEnd = isPaidPlan
        ? new Date(Date.now() + input.durationDays * 24 * 60 * 60 * 1000)
        : null;

      const created = await db.user.create({
        data: {
          id: `kp_usr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          email: input.email.toLowerCase().trim(),
          name: input.name.trim(),
          role: input.role,
          status: input.status,
          stripeCustomerId: isPaidPlan ? `cus_admin_${Date.now()}` : null,
          stripeSubscriptionId: isPaidPlan ? `sub_admin_${Date.now()}` : null,
          stripePriceId: isPaidPlan
            ? targetPlan.price.priceIds.test || targetPlan.slug
            : null,
          stripeCurrentPeriodEnd: periodEnd,
        },
      });

      return created;
    }),

  adminUpdateUser: adminProcedure
    .input(
      z.object({
        id: z.string(),
        email: z.string().email().optional(),
        name: z.string().optional(),
        role: z.enum(["USER", "ADMIN"]).optional(),
        status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Prevent admin from accidentally demoting or suspending themselves
      if (input.id === ctx.userId) {
        if (input.role && input.role !== "ADMIN") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "You cannot remove your own Administrator role.",
          });
        }
        if (input.status && input.status === "SUSPENDED") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "You cannot suspend your own account.",
          });
        }
      }

      const updates: Record<string, any> = {};
      if (input.email !== undefined)
        updates.email = input.email.toLowerCase().trim();
      if (input.name !== undefined) updates.name = input.name.trim();
      if (input.role !== undefined) updates.role = input.role;
      if (input.status !== undefined) updates.status = input.status;

      return await db.user.update({
        where: { id: input.id },
        data: updates,
      });
    }),

  adminManageSubscription: adminProcedure
    .input(
      z.object({
        userId: z.string(),
        action: z.enum(["GRANT_PLAN", "REVOKE_TO_FREE", "EXTEND"]),
        planSlug: z.string().optional(),
        durationDays: z.number().min(1).max(3650).default(30),
      })
    )
    .mutation(async ({ input }) => {
      const user = await db.user.findFirst({ where: { id: input.userId } });
      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      if (input.action === "REVOKE_TO_FREE" || input.planSlug === "free") {
        return await db.user.update({
          where: { id: input.userId },
          data: {
            stripePriceId: null,
            stripeSubscriptionId: null,
            stripeCurrentPeriodEnd: null,
          },
        });
      }

      const dynamicPlans = await getDynamicPlans();
      const targetPlan =
        dynamicPlans.find((p) => p.slug === (input.planSlug || "pro")) ||
        dynamicPlans.find((p) => p.slug === "pro") ||
        dynamicPlans[1];

      const currentEnd =
        input.action === "EXTEND" &&
        user.stripeCurrentPeriodEnd &&
        new Date(user.stripeCurrentPeriodEnd).getTime() > Date.now()
          ? new Date(user.stripeCurrentPeriodEnd).getTime()
          : Date.now();

      const newPeriodEnd = new Date(
        currentEnd + input.durationDays * 24 * 60 * 60 * 1000
      );

      return await db.user.update({
        where: { id: input.userId },
        data: {
          stripeCustomerId:
            user.stripeCustomerId ||
            `cus_admin_${input.userId.slice(0, 8)}`,
          stripeSubscriptionId:
            user.stripeSubscriptionId || `sub_admin_${Date.now()}`,
          stripePriceId:
            targetPlan?.price.priceIds.test || targetPlan?.slug || "pro",
          stripeCurrentPeriodEnd: newPeriodEnd,
        },
      });
    }),

  adminDeleteUser: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (input.id === ctx.userId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You cannot delete your own active administrator account.",
        });
      }

      const userFiles = await db.file.findMany({
        where: { userId: input.id },
      });

      // Clean up Pinecone namespaces for user's files
      if (isPineconeConfigured && userFiles.length > 0) {
        const pineconeIndex = pinecone.Index("quill");
        for (const f of userFiles) {
          try {
            await pineconeIndex.namespace(f.id).deleteAll();
          } catch {
            // ignore namespace cleanup errors
          }
        }
      }

      return await db.user.delete({
        where: { id: input.id },
      });
    }),

  // --- ADMIN PLANS & FEATURES CRUD ---

  adminGetPlans: adminProcedure.query(async () => {
    const [plans, allUsers] = await Promise.all([
      getDynamicPlans(),
      db.user.findMany(),
    ]);

    const now = Date.now();

    return plans.map((plan) => {
      const subscribersCount = allUsers.filter((u: any) => {
        const periodEnd = u.stripeCurrentPeriodEnd
          ? new Date(u.stripeCurrentPeriodEnd)
          : null;
        const isSubscribed = Boolean(
          u.stripePriceId && periodEnd && periodEnd.getTime() + 86_400_000 > now
        );
        if (plan.slug === "free") {
          return !isSubscribed;
        }
        return (
          isSubscribed &&
          (u.stripePriceId === plan.slug ||
            u.stripePriceId === plan.price.priceIds.test ||
            u.stripePriceId === plan.price.priceIds.production ||
            (plan.slug === "pro" && u.stripePriceId === "pro"))
        );
      }).length;

      return {
        ...plan,
        subscribersCount,
      };
    });
  }),

  adminCreatePlan: adminProcedure
    .input(
      z.object({
        name: z.string().min(1, "Plan name is required"),
        slug: z.string().min(1, "Plan slug is required"),
        tagline: z.string().optional(),
        price: z.number().min(0),
        priceNgn: z.number().min(0).default(0),
        quota: z.number().min(1),
        pagesPerPdf: z.number().min(1),
        maxFileSizeMB: z.number().min(1),
        features: z.array(z.string()),
        isPopular: z.boolean().default(false),
        stripePriceId: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const cleanSlug = input.slug
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9-]/g, "-");

      const existing = await db.planConfig.findFirst({
        where: { slug: cleanSlug },
      });

      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `A plan with slug "${cleanSlug}" already exists.`,
        });
      }

      return await db.planConfig.create({
        data: {
          ...input,
          slug: cleanSlug,
        },
      });
    }),

  adminUpdatePlan: adminProcedure
    .input(
      z.object({
        id: z.string().optional(),
        slug: z.string(),
        name: z.string().min(1),
        tagline: z.string().optional(),
        price: z.number().min(0),
        priceNgn: z.number().min(0).optional(),
        quota: z.number().min(1),
        pagesPerPdf: z.number().min(1),
        maxFileSizeMB: z.number().min(1),
        features: z.array(z.string()),
        isPopular: z.boolean().optional(),
        stripePriceId: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      return await db.planConfig.upsert({
        where: { slug: input.slug },
        update: {
          name: input.name,
          tagline: input.tagline ?? "",
          price: input.price,
          priceNgn: input.priceNgn !== undefined ? input.priceNgn : undefined,
          quota: input.quota,
          pagesPerPdf: input.pagesPerPdf,
          maxFileSizeMB: input.maxFileSizeMB,
          features: input.features,
          isPopular: Boolean(input.isPopular),
          stripePriceId: input.stripePriceId ?? "",
        },
        create: {
          id: input.id || `plan_${input.slug}`,
          slug: input.slug,
          name: input.name,
          tagline: input.tagline ?? "",
          price: input.price,
          priceNgn: input.priceNgn ?? 0,
          quota: input.quota,
          pagesPerPdf: input.pagesPerPdf,
          maxFileSizeMB: input.maxFileSizeMB,
          features: input.features,
          isPopular: Boolean(input.isPopular),
          stripePriceId: input.stripePriceId ?? "",
        },
      });
    }),

  adminDeletePlan: adminProcedure
    .input(z.object({ slug: z.string() }))
    .mutation(async ({ input }) => {
      if (input.slug === "free") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "The default Free tier cannot be deleted.",
        });
      }
      return await db.planConfig.delete({
        where: { slug: input.slug },
      });
    }),

  adminResetDefaultPlans: adminProcedure.mutation(async () => {
    if (typeof db.planConfig?.resetDefaults === "function") {
      return await db.planConfig.resetDefaults();
    }
    return await getDynamicPlans();
  }),

  // --- ADMIN DOCUMENTS CRUD ---

  adminGetFiles: adminProcedure.query(async () => {
    const [allFiles, allUsers, allMessages] = await Promise.all([
      db.file.findMany({ orderBy: { createdAt: "desc" } }),
      db.user.findMany(),
      db.message.findMany(),
    ]);

    return allFiles.map((f: any) => {
      const owner = allUsers.find((u: any) => u.id === f.userId);
      const messagesCount = allMessages.filter(
        (m: any) => m.fileId === f.id
      ).length;
      const ext = path.extname(f.name || "").replace(".", "").toUpperCase() || "DOC";

      return {
        ...f,
        fileType: ext,
        ownerEmail: owner?.email || "Unknown",
        ownerName: owner?.name || owner?.email?.split("@")[0] || "Unknown",
        messagesCount,
      };
    });
  }),

  adminUpdateFileStatus: adminProcedure
    .input(
      z.object({
        id: z.string(),
        uploadStatus: z.enum(["PENDING", "PROCESSING", "SUCCESS", "FAILED"]),
      })
    )
    .mutation(async ({ input }) => {
      return await db.file.update({
        where: { id: input.id },
        data: { uploadStatus: input.uploadStatus },
      });
    }),

  adminDeleteFile: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const file = await db.file.findFirst({ where: { id: input.id } });
      if (!file) {
        throw new TRPCError({ code: "NOT_FOUND", message: "File not found" });
      }

      // Remove local upload file if stored locally
      if (file.url && file.url.startsWith("/uploads/")) {
        try {
          const filePath = path.join(process.cwd(), "public", file.url);
          if (fs.existsSync(filePath)) {
            await fs.promises.unlink(filePath);
          }
        } catch {
          // ignore file unlink error
        }
      }

      // Clear Pinecone namespace
      if (isPineconeConfigured) {
        try {
          const pineconeIndex = pinecone.Index("quill");
          await pineconeIndex.namespace(input.id).deleteAll();
        } catch {
          // ignore
        }
      }

      return await db.file.delete({
        where: { id: input.id },
      });
    }),
});

export type AppRouter = typeof appRouter;
