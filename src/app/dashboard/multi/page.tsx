import MultiDocumentViewLayout, {
  DocumentInfo,
} from "@/app/components/MultiDocumentViewLayout";
import { db } from "@/db";
import { getKindeServerSession } from "@/lib/kinde";
import { notFound, redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface PageProps {
  searchParams: {
    files?: string;
  };
}

export default async function MultiDocChatPage({ searchParams }: PageProps) {
  const { getUser } = getKindeServerSession();
  const user = await getUser();

  if (!user || !user.id) {
    redirect(
      `/api/auth/login?post_login_redirect_url=/dashboard/multi?files=${
        searchParams.files || ""
      }`
    );
  }

  // Retrieve all files belonging to this user
  const allUserFiles = await db.file.findMany({
    where: {
      userId: user.id,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  if (allUserFiles.length === 0) {
    redirect("/dashboard");
  }

  const requestedParam = searchParams?.files || "";
  let initialIds: string[] = [];

  if (requestedParam === "all") {
    initialIds = allUserFiles.map((f: any) => f.id);
  } else if (requestedParam) {
    initialIds = requestedParam.split(",").map((s) => s.trim()).filter(Boolean);
  }

  // Filter valid files owned by user
  let initialFiles = allUserFiles.filter((f: any) =>
    initialIds.includes(f.id)
  );

  // If none matched or empty, select the first 2 files (or all available if only 1)
  if (initialFiles.length === 0) {
    initialFiles = allUserFiles.slice(0, Math.min(2, allUserFiles.length));
  }

  const sanitizedInitial: DocumentInfo[] = initialFiles.map((f: any) => ({
    id: f.id,
    name: f.name,
    url: f.url,
    uploadStatus: f.uploadStatus,
  }));

  const sanitizedAll: DocumentInfo[] = allUserFiles.map((f: any) => ({
    id: f.id,
    name: f.name,
    url: f.url,
    uploadStatus: f.uploadStatus,
  }));

  return (
    <MultiDocumentViewLayout
      initialFiles={sanitizedInitial}
      allUserFiles={sanitizedAll}
    />
  );
}

