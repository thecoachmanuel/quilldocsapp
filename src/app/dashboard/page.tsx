import { getKindeServerSession } from "@/lib/kinde";
import { redirect } from "next/navigation";
import Dashboard from "../components/Dashboard";
import { getUserSubscriptionPlan, getDynamicPlans } from "@/lib/subscription";
import { ensureDbUser } from "@/lib/auth-rbac";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function page() {
  const { getUser } = getKindeServerSession();
  const user = await getUser();

  if (!user || !user.id) {
    redirect("/api/auth/login?post_login_redirect_url=/dashboard");
  }

  await ensureDbUser(user);

  const [subscriptionPlan, dynamicPlans] = await Promise.all([
    getUserSubscriptionPlan(),
    getDynamicPlans(),
  ]);

  const upgradePlan =
    dynamicPlans.find((p) => p.slug === "pro") ||
    dynamicPlans.find((p) => p.slug !== "free") ||
    null;

  return (
    <Dashboard
      subscriptionPlan={subscriptionPlan}
      upgradePlan={upgradePlan}
    />
  );
}

export default page;
