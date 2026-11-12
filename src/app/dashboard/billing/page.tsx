import BillingForm from "@/app/components/BillingForm";
import { isPaystackConfigured } from "@/lib/paystack";
import { getUserSubscriptionPlan, getDynamicPlans } from "@/lib/subscription";
import { getServerGeoCurrency } from "@/lib/geo-currency";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function Page() {
  const [subscriptionPlan, plans] = await Promise.all([
    getUserSubscriptionPlan(),
    getDynamicPlans(),
  ]);
  const billingGateway = isPaystackConfigured() ? "paystack" : "none";
  const geo = getServerGeoCurrency();

  return (
    <BillingForm
      subscriptionPlan={subscriptionPlan}
      plans={plans}
      billingGateway={billingGateway}
      initialCurrency={geo.currency}
      initialSource={geo.source}
    />
  );
}

export default Page;
