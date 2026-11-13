import { getKindeServerSession } from "@/lib/kinde";
import { getUserSessionWithRBAC } from "@/lib/auth-rbac";
import {
  router,
  publicProcedure,
  privateProcedure,
  adminProcedure,
} from "./trpc";
import { TRPCError } from "@trpc/server";
import { revalidatePath } from "next/cache";
import { db, DEFAULT_PLAN_CONFIGS } from "@/db";
import z from "zod";
import { INFINITE_QUERY_LIMIT } from "@/config/infinite-query";
import { absoluteUrl } from "@/lib/utils";
import { syncPlanFeatureBullets } from "@/lib/plan-utils";
import { headers } from "next/headers";
import {
  getUserSubscriptionPlan,
  getDynamicPlans,
  resolveUserPlanFromPlans,
} from "@/lib/subscription";
import {
  isPaystackConfigured,
  initializePaystackTransaction,
  verifyPaystackTransaction,
  grantUserProAccess,
  PAYSTACK_PRO_AMOUNT_KOBO,
  PAYSTACK_PRO_AMOUNT_USD_CENTS,
} from "@/lib/paystack";
import { resolveServerGeoCurrency } from "@/lib/geo-currency";
import { pinecone, isPineconeConfigured } from "@/lib/pinecone";
import { isAiConfigured } from "@/lib/ai";
import { deleteDocumentBuffer } from "@/lib/document-storage";
import fs from "fs";
import path from "path";

function revalidatePlanPaths() {
  try {
    revalidatePath("/pricing");
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/billing");
    revalidatePath("/dashboard/multi");
    revalidatePath("/admin");
    revalidatePath("/admin/plans");
  } catch {
    // Safe fallback if invoked outside Next request scope
  }
}

function resolveAppUrl(appPath: string): string {
  try {
    const reqHeaders = headers();
    const forwardedHost = reqHeaders
      .get("x-forwarded-host")
      ?.split(",")[0]
      ?.trim();
    const host = forwardedHost || reqHeaders.get("host")?.trim();
    const forwardedProto = reqHeaders
      .get("x-forwarded-proto")
      ?.split(",")[0]
      ?.trim();

    if (host) {
      const proto =
        forwardedProto ||
        (host.startsWith("localhost") || host.startsWith("127.0.0.1")
          ? "http"
          : "https");
      return `${proto}://${host}${appPath}`;
    }
  } catch {
    // Fallback cleanly outside an active HTTP request context
  }

  return absoluteUrl(appPath);
}

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

  getVisitorRegion: publicProcedure.query(async () => {
    return resolveServerGeoCurrency();
  }),

  createPaystackSession: privateProcedure
    .input(
      z
        .object({
          renew: z.boolean().optional(),
          planSlug: z.string().optional(),
          currency: z.enum(["USD", "NGN"]).optional(),
        })
        .optional()
    )
    .mutation(async ({ ctx, input }) => {
    const { userId } = ctx;

    const billingUrl = resolveAppUrl("/dashboard/billing");

    if (!userId) throw new TRPCError({ code: "UNAUTHORIZED" });

    const dbUser = await db.user.findFirst({
      where: {
        id: userId,
      },
    });

    if (!dbUser) throw new TRPCError({ code: "UNAUTHORIZED" });

    const subscriptionPlan = await getUserSubscriptionPlan();
    const dynamicPlans = await getDynamicPlans();
    const requestedSlug =
      input?.planSlug ||
      (input?.renew && subscriptionPlan.isSubscribed
        ? subscriptionPlan.slug
        : undefined);
    const targetPaidPlan =
      (requestedSlug
        ? dynamicPlans.find(
            (p) => p.slug === requestedSlug && p.slug !== "free"
          )
        : undefined) ||
      dynamicPlans.find((p) => p.slug === "pro") ||
      dynamicPlans.find((p) => p.slug !== "free" && p.price.amount > 0) ||
      dynamicPlans.find((p) => p.slug !== "free") ||
      dynamicPlans[0];

    // 1. Paystack Gateway
    if (isPaystackConfigured()) {
      if (subscriptionPlan.isSubscribed && !input?.renew && !input?.planSlug) {
        return { url: `${billingUrl}?status=active` };
      }

      const serverGeo = await resolveServerGeoCurrency();
      const targetCurrency = input?.currency ?? serverGeo.currency;
      const usdPrice = targetPaidPlan?.price.amount ?? 0;
      const ngnPrice = targetPaidPlan?.price.amountNgn ?? 0;
      const ngnKobo =
        ngnPrice > 0 ? Math.round(ngnPrice * 100) : PAYSTACK_PRO_AMOUNT_KOBO;

      const useUsd = targetCurrency === "USD" && (usdPrice > 0 || ngnPrice <= 0);
      const amountSubunits = useUsd
        ? usdPrice > 0
          ? Math.round(usdPrice * 100)
          : PAYSTACK_PRO_AMOUNT_USD_CENTS
        : ngnKobo;

      try {
        const paystackSession = await initializePaystackTransaction({
          email: dbUser.email,
          userId: userId,
          currency: useUsd ? "USD" : "NGN",
          amountSubunits,
          fallbackAmountKobo: ngnKobo,
          callbackUrl: billingUrl,
          planSlug: targetPaidPlan?.slug || "pro",
          planName: targetPaidPlan?.name || "Pro",
        });

        return { url: paystackSession.authorization_url };
      } catch (paystackErr: any) {
        console.error(
          "[createPaystackSession] Paystack initialization failed:",
          paystackErr?.message || paystackErr
        );
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            paystackErr?.message ||
            "Unable to start Paystack payment. Please verify your Paystack configuration and try again.",
        });
      }
    }

    // 2. Local Dev Simulation ONLY when Paystack is NOT configured locally
    const isProductionEnv =
      process.env.VERCEL === "1" || process.env.NODE_ENV === "production";
    if (isProductionEnv) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message:
          "Paystack payment gateway is not configured. Please configure PAYSTACK_SECRET_KEY.",
      });
    }

    const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    if (subscriptionPlan.isSubscribed && !input?.renew && !input?.planSlug) {
      await db.user.update({
        where: { id: userId },
        data: {
          planPriceId: null,
          subscriptionId: null,
          currentPeriodEnd: null,
        },
      });
      return { url: `${billingUrl}?canceled=true` };
    } else {
      await db.user.update({
        where: { id: userId },
        data: {
          customerId:
            dbUser.customerId || `cus_test_${userId.slice(0, 8)}`,
          subscriptionId: `sub_test_${Date.now()}`,
          planPriceId: targetPaidPlan?.slug || "pro",
          currentPeriodEnd: thirtyDaysFromNow,
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
        return {
          success: false as const,
          reason: "not_configured",
          message: "Paystack is not configured on this server.",
        };
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
              txData.customer?.customer_code,
              txData.metadata?.planSlug
            );
            revalidatePlanPaths();
            return { success: true as const, verified: true };
          }

          return {
            success: false as const,
            reason: "user_mismatch",
            message: "Payment reference does not belong to your account.",
          };
        }
        return {
          success: false as const,
          reason: String(txData?.status || "unpaid"),
          message:
            String(
              txData?.gateway_response ||
                `Payment status: ${txData?.status || "incomplete"}`
            ),
        };
      } catch (err: any) {
        console.warn("[verifyPaystackPayment] error:", err.message);
        return {
          success: false as const,
          reason: "error",
          error: String(err?.message || "Verification failed"),
          message: String(err?.message || "Verification failed"),
        };
      }
    }),

  cancelSubscription: privateProcedure.mutation(async ({ ctx }) => {
    const { userId } = ctx;
    if (!userId) throw new TRPCError({ code: "UNAUTHORIZED" });

    const dbUser = await db.user.findFirst({
      where: { id: userId },
    });

    if (!dbUser) throw new TRPCError({ code: "UNAUTHORIZED" });

    await db.user.update({
      where: { id: userId },
      data: {
        planPriceId: null,
        subscriptionId: null,
        currentPeriodEnd: null,
      },
    });

    return { success: true };
  }),

  getFileUploadStatus: privateProcedure
    .input(z.object({ fileId: z.string() }))
    .query(async ({ input, ctx }) => {
      if (input.fileId.startsWith("multi_")) {
        return { status: "SUCCESS" as const };
      }

      const file = await db.file.findFirst({
        where: ctx.isAdmin
          ? { id: input.fileId }
          : {
              id: input.fileId,
              userId: ctx.userId,
            },
      });

      if (!file) return { status: "PENDING" as const };

      // Auto-heal: If file is stuck in PROCESSING for more than 4 seconds, mark SUCCESS so chat is accessible
      if (
        file.uploadStatus === "PROCESSING" &&
        file.createdAt &&
        Date.now() - new Date(file.createdAt).getTime() > 4000
      ) {
        await db.file.update({
          where: { id: file.id },
          data: { uploadStatus: "SUCCESS" },
        });
        return { status: "SUCCESS" as const };
      }

      return { status: file.uploadStatus };
    }),

  getFile: privateProcedure
    .input(z.object({ key: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { userId, isAdmin } = ctx;
      const file = await db.file.findFirst({
        where: isAdmin
          ? { key: input.key }
          : {
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
      const { userId, isAdmin } = ctx;
      const { fileId, cursor } = input;
      const limit = input.limit ?? INFINITE_QUERY_LIMIT;

      let inspectedOwnerId: string | null = null;

      if (!fileId.startsWith("multi_")) {
        const file = await db.file.findFirst({
          where: isAdmin
            ? { id: fileId }
            : {
                id: fileId,
                userId,
              },
        });
        if (!file) throw new TRPCError({ code: "NOT_FOUND" });
        inspectedOwnerId = file.userId;
      } else if (!isAdmin) {
        const userFiles = await db.file.findMany({
          where: { userId },
        });
        const sessionBody = `_${fileId.slice("multi_".length)}_`;
        const ownsAny = userFiles.some((f: any) =>
          sessionBody.includes(`_${f.id}_`)
        );
        if (!ownsAny && userFiles.length > 0) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
      }
      const messages = await db.message.findMany({
        take: limit + 1,
        where: isAdmin
          ? inspectedOwnerId && inspectedOwnerId !== userId
            ? {
                fileId,
                userId: { in: [userId, inspectedOwnerId] },
              }
            : { fileId }
          : {
              fileId,
              userId,
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
    const [allUsers, allFiles, allMessages, dynamicPlans, unreadContactCount] =
      await Promise.all([
        db.user.findMany({ orderBy: { createdAt: "desc" } }),
        db.file.findMany({ orderBy: { createdAt: "desc" } }),
        db.message.findMany({ orderBy: { createdAt: "desc" } }),
        getDynamicPlans(),
        db.contactMessage
          .count({ where: { status: "UNREAD" } })
          .catch(() => 0),
      ]);

    let subscribedCount = 0;
    let adminCount = 0;
    let suspendedCount = 0;
    let estimatedMrr = 0;

    const enrichedUsers = allUsers.map((u: any) => {
      const { plan: matchedPlan, isSubscribed } = resolveUserPlanFromPlans(
        u,
        dynamicPlans
      );

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
        unreadContactCount,
      },
      activityEvents: {
        userDates: allUsers
          .map((u: any) =>
            u.createdAt ? new Date(u.createdAt).toISOString() : null
          )
          .filter(Boolean) as string[],
        fileDates: allFiles
          .map((f: any) =>
            f.createdAt ? new Date(f.createdAt).toISOString() : null
          )
          .filter(Boolean) as string[],
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

    return allUsers.map((u: any) => {
      const { plan: matchedPlan, isSubscribed } = resolveUserPlanFromPlans(
        u,
        dynamicPlans
      );

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
        customerId: u.customerId || null,
        subscriptionId: u.subscriptionId || null,
        planPriceId: u.planPriceId || null,
        currentPeriodEnd: u.currentPeriodEnd || null,
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
          customerId: isPaidPlan ? `cus_admin_${Date.now()}` : null,
          subscriptionId: isPaidPlan ? `sub_admin_${Date.now()}` : null,
          planPriceId: isPaidPlan ? targetPlan.slug : null,
          currentPeriodEnd: periodEnd,
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
        const updated = await db.user.update({
          where: { id: input.userId },
          data: {
            planPriceId: null,
            subscriptionId: null,
            currentPeriodEnd: null,
          },
        });
        revalidatePlanPaths();
        return updated;
      }

      const dynamicPlans = await getDynamicPlans();
      const targetPlan =
        dynamicPlans.find((p) => p.slug === (input.planSlug || "pro")) ||
        dynamicPlans.find((p) => p.slug === "pro") ||
        dynamicPlans.find((p) => p.slug !== "free");

      if (!targetPlan || targetPlan.slug === "free") {
        const updated = await db.user.update({
          where: { id: input.userId },
          data: {
            planPriceId: null,
            subscriptionId: null,
            currentPeriodEnd: null,
          },
        });
        revalidatePlanPaths();
        return updated;
      }

      const currentEnd =
        input.action === "EXTEND" &&
        user.currentPeriodEnd &&
        new Date(user.currentPeriodEnd).getTime() > Date.now()
          ? new Date(user.currentPeriodEnd).getTime()
          : Date.now();

      const newPeriodEnd = new Date(
        currentEnd + input.durationDays * 24 * 60 * 60 * 1000
      );

      const hasRealSubscription =
        user.subscriptionId &&
        !user.subscriptionId.startsWith("sub_test_");

      const updated = await db.user.update({
        where: { id: input.userId },
        data: {
          customerId:
            user.customerId ||
            `cus_admin_${input.userId.slice(0, 8)}`,
          subscriptionId:
            input.action === "EXTEND" && hasRealSubscription
              ? user.subscriptionId
              : `sub_admin_${Date.now()}`,
          planPriceId: targetPlan.slug,
          currentPeriodEnd: newPeriodEnd,
        },
      });
      revalidatePlanPaths();
      return updated;
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

    return plans.map((plan) => {
      const subscribersCount = allUsers.filter((u: any) => {
        const { plan: matchedPlan, isSubscribed } = resolveUserPlanFromPlans(
          u,
          plans
        );
        if (plan.slug === "free") {
          return !isSubscribed;
        }
        return isSubscribed && matchedPlan?.slug === plan.slug;
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

      const syncedFeatures = syncPlanFeatureBullets(input.features, {
        quota: input.quota,
        pagesPerPdf: input.pagesPerPdf,
        maxFileSizeMB: input.maxFileSizeMB,
      });

      const created = await db.planConfig.create({
        data: {
          ...input,
          features: syncedFeatures,
          slug: cleanSlug,
        },
      });
      revalidatePlanPaths();
      return created;
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
      })
    )
    .mutation(async ({ input }) => {
      const syncedFeatures = syncPlanFeatureBullets(input.features, {
        quota: input.quota,
        pagesPerPdf: input.pagesPerPdf,
        maxFileSizeMB: input.maxFileSizeMB,
      });

      const updated = await db.planConfig.upsert({
        where: { slug: input.slug },
        update: {
          name: input.name,
          tagline: input.tagline ?? "",
          price: input.price,
          priceNgn: input.priceNgn !== undefined ? input.priceNgn : undefined,
          quota: input.quota,
          pagesPerPdf: input.pagesPerPdf,
          maxFileSizeMB: input.maxFileSizeMB,
          features: syncedFeatures,
          isPopular: Boolean(input.isPopular),
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
          features: syncedFeatures,
          isPopular: Boolean(input.isPopular),
        },
      });
      revalidatePlanPaths();
      return updated;
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
      const deleted = await db.planConfig.delete({
        where: { slug: input.slug },
      });
      revalidatePlanPaths();
      return deleted;
    }),

  adminResetDefaultPlans: adminProcedure.mutation(async () => {
    if (typeof db.planConfig?.resetDefaults === "function") {
      const reset = await db.planConfig.resetDefaults();
      revalidatePlanPaths();
      return reset;
    }

    for (const def of DEFAULT_PLAN_CONFIGS) {
      await db.planConfig.upsert({
        where: { slug: def.slug },
        update: {
          name: def.name,
          tagline: def.tagline,
          price: def.price,
          priceNgn: def.priceNgn,
          quota: def.quota,
          pagesPerPdf: def.pagesPerPdf,
          maxFileSizeMB: def.maxFileSizeMB,
          features: def.features,
          isPopular: def.isPopular,
        },
        create: {
          slug: def.slug,
          name: def.name,
          tagline: def.tagline,
          price: def.price,
          priceNgn: def.priceNgn,
          quota: def.quota,
          pagesPerPdf: def.pagesPerPdf,
          maxFileSizeMB: def.maxFileSizeMB,
          features: def.features,
          isPopular: def.isPopular,
        },
      });
    }
    revalidatePlanPaths();
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
