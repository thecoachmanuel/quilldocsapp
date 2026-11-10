import DocumentViewLayout from "@/app/components/DocumentViewLayout";
import { db } from "@/db";
import { getKindeServerSession } from "@/lib/kinde";
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

  let dbUser = await db.user.findFirst({
    where: { id: user.id },
  });

  if (!dbUser) {
    await db.user.create({
      data: {
        id: user.id,
        email: user.email || `${user.id}@kinde.user`,
      },
    });
  }
  const file = await db.file.findFirst({
    where: {
      id: fileId,
      userId: user.id,
    },
  });

  if (!file) notFound();

  return (
    <DocumentViewLayout
      fileId={fileId}
      url={file.url}
      fileName={file.name}
    />
  );
}

export default Page;
