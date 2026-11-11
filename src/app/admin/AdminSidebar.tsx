"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  CreditCard,
  FileText,
  ShieldCheck,
  ArrowLeft,
  Mail,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

interface AdminSidebarProps {
  adminEmail: string;
  adminName: string;
  kindeId: string;
}

const navItems = [
  {
    name: "Overview",
    href: "/admin",
    icon: LayoutDashboard,
    description: "KPIs, Revenue & System Health",
  },
  {
    name: "Users & Subscriptions",
    href: "/admin/users",
    icon: Users,
    description: "Manage accounts, roles & billing",
  },
  {
    name: "Plans & Features",
    href: "/admin/plans",
    icon: CreditCard,
    description: "Configure tiers, quotas & perks",
  },
  {
    name: "Documents",
    href: "/admin/documents",
    icon: FileText,
    description: "Inspect & moderate uploaded files",
  },
  {
    name: "Contact & Inquiries",
    href: "/admin/contact",
    icon: Mail,
    description: "Review messages & edit contact info",
  },
];

export default function AdminSidebar({
  adminEmail,
  adminName,
}: AdminSidebarProps) {
  const pathname = usePathname();

  return (
    <div className="border-b border-zinc-200 bg-white/90 backdrop-blur-md sticky top-14 z-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 py-3.5 md:flex-row md:items-center md:justify-between">
          {/* Left: Admin Brand & Identity Badge */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold tracking-tight text-zinc-900">
                    Admin Console
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700 border border-blue-200">
                    <ShieldCheck className="h-2.5 w-2.5 text-blue-600" />
                    Kinde RBAC
                  </span>
                </div>
                <p className="text-xs text-zinc-500 truncate max-w-[240px] sm:max-w-xs">
                  Signed in as <span className="font-medium text-zinc-700">{adminName}</span> ({adminEmail})
                </p>
              </div>
            </div>

            <Link
              href="/dashboard"
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "md:hidden h-8 text-xs gap-1.5"
              )}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              App
            </Link>
          </div>

          {/* Center/Right: Navigation Tabs */}
          <div className="flex items-center justify-between gap-2 overflow-x-auto pb-1 md:pb-0 no-scrollbar">
            <nav className="flex items-center gap-1 rounded-lg bg-zinc-100/80 p-1 border border-zinc-200/80">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive =
                  item.href === "/admin"
                    ? pathname === "/admin"
                    : pathname.startsWith(item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all whitespace-nowrap",
                      isActive
                        ? "bg-white text-blue-600 shadow-sm border border-zinc-200/70 font-semibold"
                        : "text-zinc-600 hover:text-zinc-900 hover:bg-white/60"
                    )}
                  >
                    <Icon
                      className={cn(
                        "h-3.5 w-3.5",
                        isActive ? "text-blue-600" : "text-zinc-500"
                      )}
                    />
                    {item.name}
                  </Link>
                );
              })}
            </nav>

            <Link
              href="/dashboard"
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "hidden md:inline-flex h-8 text-xs gap-1.5 border-zinc-200 text-zinc-700 hover:text-zinc-900"
              )}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to Workspace
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

