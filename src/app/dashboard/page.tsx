import { db } from "@/db";
import { getKindeServerSession } from "@/lib/kinde";
import { redirect } from "next/navigation";
import Dashboard from "../components/Dashboard";
import { getUserSubscriptionPlan } from "@/lib/stripe";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function page() {
  const { getUser } = getKindeServerSession();
  const user = await getUser();

  if (!user || !user.id) {
    redirect("/api/auth/login?post_login_redirect_url=/dashboard");
  }

  let dbUser = await db.user.findFirst({
    where: { id: user.id },
  });

  if (!dbUser) {
    dbUser = await db.user.create({
      data: {
        id: user.id,
        email: user.email || `${user.id}@kinde.user`,
      },
    });
  }

  const subscriptionPlan = await getUserSubscriptionPlan();

  return <Dashboard subscriptionPlan={subscriptionPlan} />;
}

export default page;
