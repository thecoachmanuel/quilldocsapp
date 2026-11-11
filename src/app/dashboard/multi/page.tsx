import MultiDocumentViewLayout, {
  DocumentInfo,
} from "@/app/components/MultiDocumentViewLayout";
import { db } from "@/db";
import { getUserSessionWithRBAC } from "@/lib/auth-rbac";
import { getUserSubscriptionPlan } from "@/lib/subscription";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface PageProps {
  searchParams: {
    files?: string;
    focus?: string;
    page?: string;
  };
}

export default async function MultiDocChatPage({ searchParams }: PageProps) {
  const rbac = await getUserSessionWithRBAC();

  if (!rbac.isAuthenticated || !rbac.user?.id) {
    redirect(
      `/api/auth/login?post_login_redirect_url=/dashboard/multi?files=${
        searchParams.files || ""
      }`
    );
  }

  const user = rbac.user;
  const requestedParam = searchParams?.files || "";
  const requestedIds =
    requestedParam && requestedParam !== "all"
      ? requestedParam.split(",").map((s) => s.trim()).filter(Boolean)
      : [];

  // Retrieve user files; if admin inspects another user's document, scope to that owner's library
  const [ownUserFiles, inspectedFirstFile, subscriptionPlan] = await Promise.all([
    db.file.findMany({
      where: {
        userId: user.id,
      },
      orderBy: {
        createdAt: "desc",
      },
    }),
    rbac.isAdmin && requestedIds.length > 0
      ? db.file.findFirst({ where: { id: { in: requestedIds } } })
      : Promise.resolve(null),
    getUserSubscriptionPlan(),
  ]);

  const targetOwnerId =
    rbac.isAdmin &&
    inspectedFirstFile &&
    inspectedFirstFile.userId !== user.id
      ? inspectedFirstFile.userId
      : user.id;

  const allUserFiles =
    targetOwnerId === user.id
      ? ownUserFiles
      : await db.file.findMany({
          where: { userId: targetOwnerId },
          orderBy: { createdAt: "desc" },
        });

  if (allUserFiles.length === 0) {
    redirect("/dashboard");
  }

  let initialIds: string[] = [];

  if (requestedParam === "all") {
    initialIds = allUserFiles.map((f: any) => f.id);
  } else if (requestedParam) {
    initialIds = requestedParam.split(",").map((s) => s.trim()).filter(Boolean);
  }

  if (searchParams?.focus && !initialIds.includes(searchParams.focus)) {
    initialIds.push(searchParams.focus);
  }

  // Filter valid files owned by user
  let initialFiles = allUserFiles.filter((f: any) =>
    initialIds.includes(f.id)
  );

  // If none matched or empty, select the first 2 files (or all available if only 1)
  if (initialFiles.length === 0) {
    initialFiles = allUserFiles.slice(0, Math.min(2, allUserFiles.length));
  }

  const parsedPage = searchParams?.page
    ? parseInt(searchParams.page, 10)
    : undefined;
  const initialPage =
    parsedPage && !isNaN(parsedPage) && parsedPage > 0 ? parsedPage : undefined;

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
      initialFocusId={searchParams?.focus}
      initialPage={initialPage}
      planName={subscriptionPlan.name}
      pagesPerPdf={subscriptionPlan.pagesPerPdf}
    />
  );
}

