import BillingForm from "@/app/components/BillingForm";
import { getUserSubscriptionPlan } from "@/lib/stripe";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function Page() {
  const subscriptionPlan = await getUserSubscriptionPlan();
  return <BillingForm subscriptionPlan={subscriptionPlan} />;
}

export default Page;
