"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoutLink } from "@kinde-oss/kinde-auth-nextjs/components";
import {
  LayoutDashboard,
  Users,
  CreditCard,
  FileText,
  Mail,
  ArrowLeft,
  Gem,
  Bell,
  AlignLeft,
  LogOut,
  ShieldCheck,
  ChevronDown,
  AlertCircle,
  Clock,
  CheckCircle2,
  X,
  BookOpen,
} from "lucide-react";
import { trpc } from "@/app/_trpc/client";
import { cn } from "@/lib/utils";

interface AdminSidebarProps {
  adminEmail: string;
  adminName: string;
  kindeId: string;
  children?: ReactNode;
}

const navGroups = [
  {
    header: "Main",
    items: [
      {
        name: "Dashboard",
        href: "/admin",
        icon: LayoutDashboard,
      },
    ],
  },
  {
    header: "Management",
    items: [
      {
        name: "Users",
        href: "/admin/users",
        icon: Users,
      },
      {
        name: "Plans & Quotas",
        href: "/admin/plans",
        icon: CreditCard,
      },
      {
        name: "Documents",
        href: "/admin/documents",
        icon: FileText,
      },
      {
        name: "Contact Inbox",
        href: "/admin/contact",
        icon: Mail,
        badgeKey: "unreadContactCount" as const,
      },
    ],
  },
  {
    header: "Application",
    items: [
      {
        name: "User Workspace",
        href: "/dashboard",
        icon: BookOpen,
      },
      {
        name: "Public Pricing",
        href: "/pricing",
        icon: Gem,
      },
    ],
  },
];

export default function AdminSidebar({
  adminEmail,
  adminName,
  children,
}: AdminSidebarProps) {
  const pathname = usePathname();
  const [isMini, setIsMini] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  const notifRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Pull live counts for the top navbar bell & inbox badge
  const { data: overviewData } = trpc.adminGetOverview.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  const unreadContactCount = overviewData?.metrics?.unreadContactCount ?? 0;
  const failedFiles = overviewData?.metrics?.failedFiles ?? 0;
  const processingFiles = overviewData?.metrics?.processingFiles ?? 0;
  const totalAlerts = unreadContactCount + failedFiles + processingFiles;

  // Close mobile drawer on route change
  useEffect(() => {
    setIsMobileOpen(false);
    setIsNotifOpen(false);
    setIsUserMenuOpen(false);
  }, [pathname]);

  // Click-outside closes dropdown popovers
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setIsNotifOpen(false);
      }
      if (
        userMenuRef.current &&
        !userMenuRef.current.contains(e.target as Node)
      ) {
        setIsUserMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleToggleSidebar = () => {
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      setIsMobileOpen((prev) => !prev);
    } else {
      setIsMini((prev) => !prev);
    }
  };

  const activeTitle =
    pathname === "/admin"
      ? "Dashboard Overview"
      : pathname.startsWith("/admin/users")
      ? "Users & Subscriptions"
      : pathname.startsWith("/admin/plans")
      ? "Plans & Features"
      : pathname.startsWith("/admin/documents")
      ? "Uploaded Documents"
      : pathname.startsWith("/admin/contact")
      ? "Contact & Support"
      : "Admin Console";

  const initials = (adminName || adminEmail || "A")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || "")
    .join("");

  return (
    <div className="min-h-screen bg-[#f4f6f9] text-[#141010] flex flex-col">
      {/* Mobile Sidebar Backdrop Overlay */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-[890] bg-black/45 lg:hidden transition-opacity"
          onClick={() => setIsMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Fixed White Left Sidebar (Otika / orange-backend structure) */}
      <aside
        className={cn(
          "fixed top-0 left-0 bottom-0 bg-white border-r-2 border-[#ebebeb] flex flex-col transition-all duration-300",
          // Mobile slide-out vs Desktop fixed width
          isMobileOpen
            ? "translate-x-0 w-[250px] z-[891]"
            : "-translate-x-full lg:translate-x-0 z-40",
          isMini ? "lg:w-[68px]" : "lg:w-[250px]"
        )}
      >
        {/* Sticky Sidebar Brand Header (70px height matching top navbar) */}
        <div className="sticky top-0 z-20 h-[70px] shrink-0 bg-white border-b-2 border-[#ebebeb] shadow-[0_2px_4px_rgba(0,0,0,0.04)] flex items-center justify-between px-4">
          <Link
            href="/admin"
            className={cn(
              "flex items-center gap-2.5 overflow-hidden",
              isMini && "lg:mx-auto lg:justify-center"
            )}
          >
            <span className="h-9 w-9 shrink-0 rounded-[10px] bg-gradient-to-b from-[#FF6F43] to-[#FE1B03] shadow-[2px_2px_8px_rgba(254,27,3,0.3)] flex items-center justify-center text-white font-bold text-lg">
              Q
            </span>
            <span
              className={cn(
                "text-xl font-bold tracking-tight text-[#141010] whitespace-nowrap transition-opacity duration-200",
                isMini && "lg:hidden"
              )}
            >
              Quill
              <span className="bg-gradient-to-b from-[#FF6F43] to-[#FE1B03] bg-clip-text text-transparent">
                Docs
              </span>
            </span>
          </Link>

          <button
            type="button"
            onClick={() => setIsMobileOpen(false)}
            className="lg:hidden p-1.5 rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
            aria-label="Close navigation menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable Sidebar Links */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-3 space-y-2">
          {navGroups.map((group, gIdx) => (
            <div key={group.header}>
              {gIdx > 0 && <hr className="my-2.5 border-[#ebebeb]" />}
              {!isMini && (
                <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[1.3px] text-[#868e96]">
                  {group.header}
                </div>
              )}
              <ul className="space-y-1.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive =
                    item.href === "/admin"
                      ? pathname === "/admin"
                      : item.href.startsWith("/admin")
                      ? pathname.startsWith(item.href)
                      : false;

                  const badgeValue =
                    item.badgeKey === "unreadContactCount"
                      ? unreadContactCount
                      : 0;

                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        title={isMini ? item.name : undefined}
                        className={cn(
                          "group flex items-center h-[42px] rounded-[10px] text-[14px] font-medium transition-all duration-200",
                          isMini
                            ? "lg:justify-center lg:px-0 px-3.5 gap-3"
                            : "px-3.5 gap-3",
                          isActive
                            ? "bg-gradient-to-b from-[#FF6F43] to-[#FE1B03] text-white shadow-[0_4px_12px_rgba(254,27,3,0.22)]"
                            : "text-[#141010] hover:bg-gradient-to-b hover:from-[#FF6F43] hover:to-[#FE1B03] hover:text-white"
                        )}
                      >
                        <Icon
                          className={cn(
                            "h-[18px] w-[18px] shrink-0 transition-colors",
                            isActive
                              ? "text-white"
                              : "text-zinc-600 group-hover:text-white"
                          )}
                        />
                        <span
                          className={cn(
                            "flex-1 truncate whitespace-nowrap",
                            isMini && "lg:hidden"
                          )}
                        >
                          {item.name}
                        </span>
                        {badgeValue > 0 && !isMini && (
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-[10px] font-bold leading-none",
                              isActive
                                ? "bg-white text-[#FE1B03]"
                                : "bg-[#FE1B03] text-white group-hover:bg-white group-hover:text-[#FE1B03]"
                            )}
                          >
                            {badgeValue}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom Admin Badge in Sidebar */}
        <div className="p-3 border-t-2 border-[#ebebeb] bg-[#fafafa]">
          <div
            className={cn(
              "flex items-center gap-2.5",
              isMini && "lg:justify-center"
            )}
          >
            <div className="h-8 w-8 shrink-0 rounded-full bg-gradient-to-b from-[#FF6F43] to-[#FE1B03] text-white text-xs font-bold flex items-center justify-center">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <div className={cn("min-w-0 flex-1", isMini && "lg:hidden")}>
              <p className="text-xs font-semibold text-[#141010] truncate">
                {adminName || "Administrator"}
              </p>
              <p className="text-[11px] text-zinc-500 truncate">{adminEmail}</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Wrapper Right of Sidebar */}
      <div
        className={cn(
          "flex-1 flex flex-col min-h-screen transition-all duration-300 w-full min-w-0",
          isMini ? "lg:pl-[68px]" : "lg:pl-[250px]"
        )}
      >
        {/* Sticky Top Navbar (Otika style) */}
        <header className="sticky top-0 z-30 h-[70px] bg-white border-b-2 border-[#ebebeb] px-4 sm:px-6 flex items-center justify-between gap-3">
          {/* Left: Sidebar Toggle + Route Title */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={handleToggleSidebar}
              aria-label="Toggle admin sidebar"
              className="h-9 w-9 rounded-lg flex items-center justify-center text-[#141010] hover:bg-[#f4f6f9] hover:text-[#FE1B03] transition-colors shrink-0"
            >
              <AlignLeft className="h-5 w-5" />
            </button>

            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm sm:text-base font-bold text-[#141010] truncate">
                {activeTitle}
              </span>
              <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-[#fff3ef] border border-[#ffd2c4] px-2.5 py-0.5 text-[11px] font-semibold text-[#FE1B03]">
                <ShieldCheck className="h-3 w-3" />
                Kinde RBAC
              </span>
            </div>
          </div>

          {/* Right: App Link, Notification Bell, Admin Account Dropdown */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <Link
              href="/dashboard"
              className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-[#ebebeb] bg-[#fafafa] px-3.5 py-1.5 text-xs font-semibold text-[#141010] hover:border-[#FF6F43] hover:text-[#FE1B03] transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Workspace
            </Link>

            {/* Bell Notifications Popover */}
            <div className="relative" ref={notifRef}>
              <button
                type="button"
                onClick={() => {
                  setIsNotifOpen((prev) => !prev);
                  setIsUserMenuOpen(false);
                }}
                aria-label="Admin notifications"
                className="relative h-9 w-9 rounded-full bg-[#f4f6f9] border border-[#ebebeb] flex items-center justify-center text-[#141010] hover:border-[#FF6F43] hover:text-[#FE1B03] transition-colors"
              >
                <Bell className="h-4 w-4" />
                {totalAlerts > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-gradient-to-b from-[#FF6F43] to-[#FE1B03] text-white text-[10px] font-bold flex items-center justify-center shadow-sm">
                    {totalAlerts > 99 ? "99+" : totalAlerts}
                  </span>
                )}
              </button>

              {isNotifOpen && (
                <div className="absolute right-0 mt-2 w-72 sm:w-80 rounded-[15px] bg-white border-2 border-[#ebebeb] shadow-[0_10px_30px_rgba(0,0,0,0.12)] z-50 overflow-hidden">
                  <div className="px-4 py-3 border-b border-[#ebebeb] flex items-center justify-between bg-[#fafafa]">
                    <span className="text-xs font-bold uppercase tracking-wider text-[#141010]">
                      System Alerts
                    </span>
                    <span className="rounded-full bg-[#fff3ef] px-2 py-0.5 text-[11px] font-semibold text-[#FE1B03]">
                      {totalAlerts} active
                    </span>
                  </div>

                  <div className="divide-y divide-[#f2f2f2] max-h-72 overflow-y-auto">
                    {totalAlerts === 0 ? (
                      <div className="px-4 py-6 text-center text-xs text-zinc-500 flex flex-col items-center gap-2">
                        <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                        <span>Everything looks healthy. No pending alerts.</span>
                      </div>
                    ) : (
                      <>
                        {unreadContactCount > 0 && (
                          <Link
                            href="/admin/contact"
                            onClick={() => setIsNotifOpen(false)}
                            className="flex items-start gap-3 px-4 py-3 hover:bg-[#fff5f2]/60 transition-colors"
                          >
                            <div className="h-8 w-8 shrink-0 rounded-lg bg-gradient-to-b from-[#FF6F43] to-[#FE1B03] text-white flex items-center justify-center">
                              <Mail className="h-4 w-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-semibold text-[#141010]">
                                {unreadContactCount} unread support{" "}
                                {unreadContactCount === 1
                                  ? "message"
                                  : "messages"}
                              </p>
                              <p className="text-[11px] text-zinc-500 mt-0.5">
                                Click to inspect and reply in Contact Inbox
                              </p>
                            </div>
                          </Link>
                        )}
                        {failedFiles > 0 && (
                          <Link
                            href="/admin/documents"
                            onClick={() => setIsNotifOpen(false)}
                            className="flex items-start gap-3 px-4 py-3 hover:bg-[#fff5f2]/60 transition-colors"
                          >
                            <div className="h-8 w-8 shrink-0 rounded-lg bg-red-100 text-red-600 flex items-center justify-center">
                              <AlertCircle className="h-4 w-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-semibold text-[#141010]">
                                {failedFiles} failed document{" "}
                                {failedFiles === 1 ? "upload" : "uploads"}
                              </p>
                              <p className="text-[11px] text-zinc-500 mt-0.5">
                                Review failed indexing jobs in Documents
                              </p>
                            </div>
                          </Link>
                        )}
                        {processingFiles > 0 && (
                          <Link
                            href="/admin/documents"
                            onClick={() => setIsNotifOpen(false)}
                            className="flex items-start gap-3 px-4 py-3 hover:bg-[#fff5f2]/60 transition-colors"
                          >
                            <div className="h-8 w-8 shrink-0 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center">
                              <Clock className="h-4 w-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-semibold text-[#141010]">
                                {processingFiles}{" "}
                                {processingFiles === 1
                                  ? "document is"
                                  : "documents are"}{" "}
                                processing
                              </p>
                              <p className="text-[11px] text-zinc-500 mt-0.5">
                                Monitor status in Documents Console
                              </p>
                            </div>
                          </Link>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Admin User Menu Dropdown */}
            <div className="relative" ref={userMenuRef}>
              <button
                type="button"
                onClick={() => {
                  setIsUserMenuOpen((prev) => !prev);
                  setIsNotifOpen(false);
                }}
                className="flex items-center gap-2 rounded-full border border-[#ebebeb] bg-white pl-1.5 pr-2.5 py-1 hover:border-[#FF6F43] transition-colors"
              >
                <span className="h-7 w-7 rounded-full bg-gradient-to-b from-[#FF6F43] to-[#FE1B03] text-white text-xs font-bold flex items-center justify-center">
                  {initials || "A"}
                </span>
                <span className="hidden md:inline text-xs font-semibold text-[#141010] max-w-[120px] truncate">
                  {adminName || "Admin"}
                </span>
                <ChevronDown className="h-3.5 w-3.5 text-zinc-500" />
              </button>

              {isUserMenuOpen && (
                <div className="absolute right-0 mt-2 w-60 rounded-[15px] bg-white border-2 border-[#ebebeb] shadow-[0_10px_30px_rgba(0,0,0,0.12)] z-50 overflow-hidden">
                  <div className="px-4 py-3 border-b border-[#ebebeb] bg-[#fafafa]">
                    <p className="text-xs font-bold text-[#141010] truncate">
                      {adminName || "Administrator"}
                    </p>
                    <p className="text-[11px] text-zinc-500 truncate">
                      {adminEmail}
                    </p>
                  </div>

                  <div className="p-1.5 space-y-0.5 text-xs">
                    <Link
                      href="/admin/plans"
                      className="flex items-center gap-2 rounded-lg px-3 py-2 text-[#141010] hover:bg-[#fff5f2] hover:text-[#FE1B03] font-medium transition-colors"
                    >
                      <CreditCard className="h-3.5 w-3.5" />
                      Plans & Billing Rules
                    </Link>
                    <Link
                      href="/dashboard"
                      className="flex items-center gap-2 rounded-lg px-3 py-2 text-[#141010] hover:bg-[#fff5f2] hover:text-[#FE1B03] font-medium transition-colors"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" />
                      Return to Workspace
                    </Link>
                    <div className="my-1 border-t border-[#f0f0f0]" />
                    <LogoutLink className="flex items-center gap-2 rounded-lg px-3 py-2 text-red-600 hover:bg-red-50 font-semibold transition-colors w-full">
                      <LogOut className="h-3.5 w-3.5" />
                      Log out
                    </LogoutLink>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Main Admin Page Content */}
        <main className="flex-1 w-full max-w-full min-w-0 px-4 py-6 sm:px-6 lg:px-7">
          {children}
        </main>

        {/* Footer matching Otika .main-footer */}
        <footer className="bg-white border-t border-[#e3eaef] px-4 sm:px-7 py-4 text-[11px] font-semibold uppercase tracking-wider text-[#98a6ad] flex flex-wrap items-center justify-between gap-2">
          <span>&copy; 2026 QuillDocs • Admin Console</span>
          <span>Synchronized Plan Engine</span>
        </footer>
      </div>
    </div>
  );
}
