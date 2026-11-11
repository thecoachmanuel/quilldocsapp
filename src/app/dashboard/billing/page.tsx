import BillingForm from "@/app/components/BillingForm";
import { isPaystackConfigured } from "@/lib/paystack";
import { getUserSubscriptionPlan, getDynamicPlans } from "@/lib/subscription";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function Page() {
  const [subscriptionPlan, plans] = await Promise.all([
    getUserSubscriptionPlan(),
    getDynamicPlans(),
  ]);
  const billingGateway = isPaystackConfigured() ? "paystack" : "none";

  return (
    <BillingForm
      subscriptionPlan={subscriptionPlan}
      plans={plans}
      billingGateway={billingGateway}
    />
  );
}

export default Page;
