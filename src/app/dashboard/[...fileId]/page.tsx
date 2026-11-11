import DocumentViewLayout from "@/app/components/DocumentViewLayout";
import { db } from "@/db";
import { getKindeServerSession } from "@/lib/kinde";
import { ensureDbUser } from "@/lib/auth-rbac";
import { getUserSubscriptionPlan } from "@/lib/subscription";
import { notFound, redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface PageProps {
  params: {
    fileId: string | string[];
  };
}

async function Page({ params }: PageProps) {
  const rawFileId = params?.fileId;
  const fileId = Array.isArray(rawFileId)
    ? rawFileId.join("")
    : typeof rawFileId === "string"
      ? rawFileId
      : "";

  if (!fileId) notFound();

  if (fileId === "multi") {
    redirect("/dashboard/multi");
  }

  if (fileId.includes(",")) {
    redirect(`/dashboard/multi?files=${fileId}`);
  }

  const { getUser } = getKindeServerSession();
  const user = await getUser();

  if (!user || !user.id) {
    redirect(`/api/auth/login?post_login_redirect_url=/dashboard/${fileId}`);
  }

  await ensureDbUser(user);
  const [file, subscriptionPlan] = await Promise.all([
    db.file.findFirst({
      where: {
        id: fileId,
        userId: user.id,
      },
    }),
    getUserSubscriptionPlan(),
  ]);

  if (!file) notFound();

  return (
    <DocumentViewLayout
      fileId={fileId}
      url={file.url}
      fileName={file.name}
      planName={subscriptionPlan.name}
      pagesPerPdf={subscriptionPlan.pagesPerPdf}
    />
  );
}

export default Page;
