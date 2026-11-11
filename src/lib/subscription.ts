import { PLANS } from "@/config/plans";
import { db, DEFAULT_PLAN_CONFIGS } from "@/db";
import { getKindeServerSession } from "@/lib/kinde";
import { isPaystackConfigured } from "@/lib/paystack";

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
  };
}

export interface SubscriptionRecordFields {
  planPriceId?: string | null;
  subscriptionId?: string | null;
  currentPeriodEnd?: string | Date | null;
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
        },
      }));
    }
  } catch (err) {
    console.warn("[subscription] Fallback to static PLANS:", err);
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
    maxFileSizeMB: p.maxFileSizeMB ?? (p.slug === "pro" ? 16 : 4),
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
      amountNgn: p.price.amountNgn ?? (p.slug === "pro" ? 18000 : 0),
    },
  }));
}

export function isUserRecordSubscribed(
  userRecord: SubscriptionRecordFields
): boolean {
  const periodEnd = userRecord.currentPeriodEnd
    ? new Date(userRecord.currentPeriodEnd)
    : null;

  const isSimulatedSub = Boolean(
    userRecord.subscriptionId?.startsWith("sub_test_")
  );
  const ignoreSimulatedSub =
    isSimulatedSub &&
    (isPaystackConfigured() ||
      process.env.VERCEL === "1" ||
      process.env.NODE_ENV === "production");

  return Boolean(
    !ignoreSimulatedSub &&
      userRecord.planPriceId &&
      periodEnd &&
      periodEnd.getTime() + 86_400_000 > Date.now()
  );
}

export function resolveUserPlanFromPlans(
  userRecord: SubscriptionRecordFields,
  dynamicPlans: DynamicPlan[]
): { plan: DynamicPlan; isSubscribed: boolean } {
  const freePlan =
    dynamicPlans.find((p) => p.slug === "free") || dynamicPlans[0];
  const proPlan =
    dynamicPlans.find((p) => p.slug === "pro") || dynamicPlans[1] || freePlan;

  const isSubscribed = isUserRecordSubscribed(userRecord);
  const plan = isSubscribed
    ? dynamicPlans.find(
        (p) =>
          p.slug === userRecord.planPriceId ||
          ((userRecord.planPriceId === "pro" ||
            userRecord.planPriceId?.startsWith("price_")) &&
            p.slug === "pro")
      ) || proPlan
    : freePlan;

  return { plan, isSubscribed };
}

export async function getUserSubscriptionPlan() {
  const { getUser } = getKindeServerSession();
  const user = await getUser();
  const dynamicPlans = await getDynamicPlans();
  const freePlan =
    dynamicPlans.find((p) => p.slug === "free") || dynamicPlans[0];

  if (!user?.id) {
    return {
      ...freePlan,
      subscriptionId: null,
      currentPeriodEnd: null,
      customerId: null,
      isSubscribed: false,
      isCanceled: false,
    };
  }

  const dbUser = await db.user.findFirst({
    where: {
      id: user.id,
    },
  });

  if (!dbUser) {
    return {
      ...freePlan,
      subscriptionId: null,
      currentPeriodEnd: null,
      customerId: null,
      isSubscribed: false,
      isCanceled: false,
    };
  }

  const periodEnd = dbUser.currentPeriodEnd
    ? new Date(dbUser.currentPeriodEnd)
    : null;

  const { plan, isSubscribed } = resolveUserPlanFromPlans(dbUser, dynamicPlans);

  return {
    ...plan,
    subscriptionId: dbUser.subscriptionId,
    currentPeriodEnd: periodEnd,
    customerId: dbUser.customerId,
    isSubscribed,
    isCanceled: false,
  };
}

