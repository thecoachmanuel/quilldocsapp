import BillingForm from "@/app/components/BillingForm";
import { isPaystackConfigured } from "@/lib/paystack";
import { getUserSubscriptionPlan, isStripeConfigured } from "@/lib/stripe";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function Page() {
  const subscriptionPlan = await getUserSubscriptionPlan();
  const billingGateway = isPaystackConfigured()
    ? "paystack"
    : isStripeConfigured()
    ? "stripe"
    : "none";

  return (
    <BillingForm
      subscriptionPlan={subscriptionPlan}
      billingGateway={billingGateway}
    />
  );
}

export default Page;
