import { ReactNode } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ShieldAlert, ArrowLeft, Lock, KeyRound } from "lucide-react";
import { getUserSessionWithRBAC } from "@/lib/auth-rbac";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import AdminSidebar from "./AdminSidebar";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const rbac = await getUserSessionWithRBAC();

  if (!rbac.isAuthenticated || !rbac.user) {
    redirect("/api/auth/login?post_login_redirect_url=/admin");
  }

  if (!rbac.isAdmin) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-50 border border-red-200 text-red-600">
              <ShieldAlert className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-zinc-900">
                Administrator Access Required
              </h1>
              <p className="text-sm text-zinc-500">
                Protected by Kinde Role-Based Access Control (RBAC)
              </p>
            </div>
          </div>

          <div className="mt-6 rounded-xl bg-zinc-50 border border-zinc-200 p-4 text-sm text-zinc-700 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-zinc-500">Signed-in Account:</span>
              <span className="font-medium text-zinc-900">{rbac.user.email}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-zinc-500">Kinde User ID:</span>
              <code className="rounded bg-zinc-200/70 px-1.5 py-0.5 text-xs font-mono text-zinc-800">
                {rbac.user.id}
              </code>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-zinc-500">Assigned Role:</span>
              <span className="inline-flex items-center rounded-full bg-zinc-200 px-2.5 py-0.5 text-xs font-semibold text-zinc-800">
                {rbac.role}
              </span>
            </div>
          </div>

          <div className="mt-6 space-y-3 text-sm text-zinc-600">
            <p className="font-medium text-zinc-900 flex items-center gap-1.5">
              <KeyRound className="h-4 w-4 text-blue-600" />
              How to grant Administrator privileges:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-xs sm:text-sm text-zinc-600">
              <li>
                <strong>Via Kinde Dashboard:</strong> Assign the{" "}
                <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs font-mono text-zinc-800">
                  admin
                </code>{" "}
                role or{" "}
                <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs font-mono text-zinc-800">
                  admin:access
                </code>{" "}
                permission to this user in your Kinde organization.
              </li>
              <li>
                <strong>Via Admin Console:</strong> Ask an existing administrator
                to promote your account from{" "}
                <span className="font-medium">USER</span> to{" "}
                <span className="font-medium">ADMIN</span> in{" "}
                <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs font-mono text-zinc-800">
                  /admin/users
                </code>
                .
              </li>
              <li>
                <strong>Via Environment Variable:</strong> Add your email to{" "}
                <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs font-mono text-zinc-800">
                  ADMIN_EMAILS
                </code>{" "}
                in <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs font-mono text-zinc-800">.env</code>.
              </li>
            </ul>
          </div>

          <div className="mt-8 flex items-center justify-end gap-3 border-t border-zinc-100 pt-5">
            <Link
              href="/dashboard"
              className={cn(
                buttonVariants({ variant: "default" }),
                "bg-gradient-to-b from-[#FF6F43] to-[#FE1B03] hover:opacity-95 text-white gap-1.5 rounded-full"
              )}
            >
              <ArrowLeft className="h-4 w-4" />
              Return to My Files
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <AdminSidebar
      adminEmail={rbac.user.email}
      adminName={rbac.user.name}
      kindeId={rbac.user.id}
    >
      {children}
    </AdminSidebar>
  );
}

