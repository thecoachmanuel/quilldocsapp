import { getKindeServerSession } from "@/lib/kinde";
import { redirect } from "next/navigation";
import Dashboard from "../components/Dashboard";
import { getUserSubscriptionPlan } from "@/lib/subscription";
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

  const subscriptionPlan = await getUserSubscriptionPlan();

  return <Dashboard subscriptionPlan={subscriptionPlan} />;
}

export default page;
