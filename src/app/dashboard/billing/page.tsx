import BillingForm from "@/app/components/BillingForm";
import { isPaystackConfigured } from "@/lib/paystack";
import { getUserSubscriptionPlan, getDynamicPlans } from "@/lib/subscription";
import { resolveServerGeoCurrency } from "@/lib/geo-currency";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function Page() {
  const [subscriptionPlan, plans, geo] = await Promise.all([
    getUserSubscriptionPlan(),
    getDynamicPlans(),
    resolveServerGeoCurrency(),
  ]);
  const billingGateway = isPaystackConfigured() ? "paystack" : "none";

  return (
    <BillingForm
      subscriptionPlan={subscriptionPlan}
      plans={plans}
      billingGateway={billingGateway}
      initialCurrency={geo.currency}
      initialCountryCode={geo.countryCode}
      initialSource={geo.source}
    />
  );
}

export default Page;
