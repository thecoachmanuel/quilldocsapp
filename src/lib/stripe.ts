import { PLANS } from "@/config/stripe";
import { db, DEFAULT_PLAN_CONFIGS } from "@/db";
import { getKindeServerSession } from "@/lib/kinde";
import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "", {
  apiVersion: "2023-08-16",
  typescript: true,
});

export interface DynamicPlan {
  id: string;
  name: string;
  slug: string;
  tagline: string;
  quota: number;
  pagesPerPdf: number;
  maxFileSizeMB: number;
  features: string[];
  isPopular: boolean;
  price: {
    amount: number;
    amountNgn: number;
    priceIds: {
      test: string;
      production: string;
    };
  };
}

/**
 * Fetches dynamic plans configured via Admin Dashboard (with fallback to default PLANS)
 */
export async function getDynamicPlans(): Promise<DynamicPlan[]> {
  try {
    if (db.planConfig && typeof db.planConfig.findMany === "function") {
      let configs = await db.planConfig.findMany();
      if (!configs || configs.length === 0) {
        configs = DEFAULT_PLAN_CONFIGS;
      }
      return configs.map((c: any) => ({
        id: c.id || `plan_${c.slug}`,
        name: c.name,
        slug: c.slug,
        tagline:
          c.tagline ||
          (c.slug === "pro"
            ? "For larger research projects, theses, and higher needs."
            : "For small side projects and quick study notes."),
        quota: Number(c.quota) || 10,
        pagesPerPdf: Number(c.pagesPerPdf) || 5,
        maxFileSizeMB:
          Number(c.maxFileSizeMB) || (c.slug === "pro" ? 16 : 4),
        features: Array.isArray(c.features) ? c.features : [],
        isPopular: Boolean(c.isPopular ?? c.slug === "pro"),
        price: {
          amount: Number(c.price) || 0,
          amountNgn:
            c.priceNgn !== undefined && c.priceNgn !== null
              ? Number(c.priceNgn)
              : c.slug === "pro"
              ? 18000
              : 0,
          priceIds: {
            test: c.stripePriceId || (c.slug === "pro" ? "price_1OQrcuKMJjiqL9lYEEU1nxSz" : ""),
            production: c.stripePriceId || "",
          },
        },
      }));
    }
  } catch (err) {
    console.warn("[stripe] Fallback to static PLANS:", err);
  }

  return PLANS.map((p) => ({
    id: `plan_${p.slug}`,
    name: p.name,
    slug: p.slug,
    tagline:
      p.slug === "pro"
        ? "For larger projects with higher needs."
        : "For small side projects.",
    quota: p.quota,
    pagesPerPdf: p.pagesPerPdf,
    maxFileSizeMB: p.slug === "pro" ? 16 : 4,
    features:
      p.slug === "pro"
        ? [
            `${p.pagesPerPdf} pages per PDF / Slide`,
            "16MB file size limit",
            "Mobile-friendly interface",
            "High-precision 4x context responses",
            "Priority support",
          ]
        : [
            `${p.pagesPerPdf} pages per PDF / Slide`,
            "4MB file size limit",
            "Mobile-friendly interface",
          ],
    isPopular: p.slug === "pro",
    price: {
      amount: p.price.amount,
      amountNgn: p.slug === "pro" ? 18000 : 0,
      priceIds: p.price.priceIds,
    },
  }));
}

export async function getUserSubscriptionPlan() {
  const { getUser } = getKindeServerSession();
  const user = await getUser();
  const dynamicPlans = await getDynamicPlans();
  const freePlan =
    dynamicPlans.find((p) => p.slug === "free") || dynamicPlans[0];
  const proPlan =
    dynamicPlans.find((p) => p.slug === "pro") ||
    dynamicPlans[1] ||
    freePlan;

  if (!user?.id) {
    return {
      ...freePlan,
      isSubscribed: false,
      isCanceled: false,
      stripeCurrentPeriodEnd: null,
    };
  }

  const dbUser = await db.user.findFirst({
    where: {
      id: user?.id,
    },
  });

  if (!dbUser) {
    return {
      ...freePlan,
      isSubscribed: false,
      isCanceled: false,
      stripeCurrentPeriodEnd: null,
    };
  }

  const periodEnd = dbUser.stripeCurrentPeriodEnd
    ? new Date(dbUser.stripeCurrentPeriodEnd)
    : null;

  const isSubscribed = Boolean(
    dbUser.stripePriceId &&
      periodEnd &&
      periodEnd.getTime() + 86_400_000 > Date.now()
  );

  const plan = isSubscribed
    ? dynamicPlans.find(
        (p) =>
          p.slug === dbUser.stripePriceId ||
          p.price.priceIds.test === dbUser.stripePriceId ||
          p.price.priceIds.production === dbUser.stripePriceId ||
          (dbUser.stripePriceId === "pro" && p.slug === "pro")
      ) || proPlan
    : freePlan;

  let isCanceled = false;
  if (
    isSubscribed &&
    dbUser.stripeSubscriptionId &&
    process.env.STRIPE_SECRET_KEY &&
    !dbUser.stripeSubscriptionId.startsWith("sub_test_") &&
    !dbUser.stripeSubscriptionId.startsWith("sub_admin_")
  ) {
    try {
      const stripePlan = await stripe.subscriptions.retrieve(
        dbUser.stripeSubscriptionId
      );
      isCanceled = stripePlan.cancel_at_period_end;
    } catch {
      isCanceled = false;
    }
  }

  return {
    ...plan,
    stripeSubscriptionId: dbUser.stripeSubscriptionId,
    stripeCurrentPeriodEnd: periodEnd,
    stripeCustomerId: dbUser.stripeCustomerId,
    isSubscribed,
    isCanceled,
  };
}
