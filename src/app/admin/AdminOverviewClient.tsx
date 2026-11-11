"use client";

import { trpc } from "@/app/_trpc/client";
import Link from "next/link";
import { format } from "date-fns";
import {
  Users,
  CreditCard,
  FileText,
  MessageSquare,
  TrendingUp,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Clock,
  ArrowRight,
  RefreshCw,
  Gem,
  Database,
  Cpu,
  Layers,
  KeyRound,
  Plus,
  ExternalLink,
  Mail,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Skeleton from "react-loading-skeleton";
import {
  AdminAnalyticsChart,
  AdminStatCard,
  ORANGE_BTN_CLASS,
  ORANGE_CARD_CLASS,
  ORANGE_CARD_HEADER_CLASS,
  ORANGE_OUTLINE_BTN_CLASS,
  ORANGE_TABLE_BODY_ROW_CLASS,
  ORANGE_TABLE_HEAD_ROW_CLASS,
} from "./AdminComponents";

export default function AdminOverviewClient() {
  const utils = trpc.useContext();
  const { data, isLoading, isFetching } = trpc.adminGetOverview.useQuery(
    undefined,
    {
      refetchOnMount: "always",
    }
  );

  if (isLoading || !data) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton width={240} height={34} />
          <Skeleton width={160} height={36} borderRadius={999} />
        </div>
        <Skeleton height={340} borderRadius={17} />
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <Skeleton height={155} borderRadius={17} />
          <Skeleton height={155} borderRadius={17} />
          <Skeleton height={155} borderRadius={17} />
          <Skeleton height={155} borderRadius={17} />
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Skeleton height={300} borderRadius={17} />
          <Skeleton height={300} borderRadius={17} />
        </div>
      </div>
    );
  }

  const {
    metrics,
    activityEvents,
    recentUsers,
    recentFiles,
    plans,
    systemHealth,
  } = data as any;

  const attentionCount =
    (metrics.processingFiles || 0) +
    (metrics.failedFiles || 0) +
    (metrics.unreadContactCount || 0);

  return (
    <div className="space-y-6">
      {/* Top Action Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#141010]">
            Platform Overview
          </h1>
          <p className="text-xs sm:text-sm text-zinc-500 mt-0.5">
            Real-time metrics for users, subscriptions, plan limits, and AI
            document activity.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => utils.adminGetOverview.invalidate()}
            disabled={isFetching}
            className={ORANGE_OUTLINE_BTN_CLASS}
          >
            <RefreshCw
              className={cn("h-3.5 w-3.5", isFetching && "animate-spin")}
            />
            Refresh
          </button>

          <Link href="/admin/plans" className={ORANGE_OUTLINE_BTN_CLASS}>
            <CreditCard className="h-3.5 w-3.5 text-[#FE1B03]" />
            Configure Plans
          </Link>

          <Link href="/admin/users" className={ORANGE_BTN_CLASS}>
            <Plus className="h-3.5 w-3.5" />
            Manage Users
          </Link>
        </div>
      </div>

      {/* Signature orange-backend Dual Smooth Analytics Card */}
      <AdminAnalyticsChart
        userDates={activityEvents?.userDates || []}
        fileDates={activityEvents?.fileDates || []}
      />

      {/* Row 1: Primary Revenue & User KPI Cards (.card-statistic-4 + .card-icon2) */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <AdminStatCard
          title="Monthly Recurring Rev"
          value={`$${metrics.estimatedMrr.toLocaleString()}`}
          valueClassName="text-emerald-600"
          subtitle={`$${metrics.estimatedArr.toLocaleString()}/yr projected ARR`}
          icon={TrendingUp}
        />

        <AdminStatCard
          title="Subscribed Pro Users"
          value={metrics.subscribedUsers}
          valueClassName="text-amber-600"
          subtitle="Active paid plan subscribers"
          icon={Gem}
        />

        <AdminStatCard
          title="All Users"
          value={metrics.totalUsers}
          subtitle={`${metrics.freeUsers} Free tier accounts`}
          icon={Users}
        />

        <AdminStatCard
          title="Admin & Security"
          value={`${metrics.adminUsers} Admin`}
          subtitle={`${metrics.suspendedUsers} suspended • ${
            metrics.totalUsers - metrics.suspendedUsers
          } active`}
          icon={ShieldCheck}
        />
      </div>

      {/* Row 2: Documents, Formats, AI Chat & Pending Inbox */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <AdminStatCard
          title="Total Documents"
          value={metrics.totalFiles}
          subtitle={`${metrics.successFiles} indexed & searchable`}
          icon={FileText}
        />

        <AdminStatCard
          title="PDF / Word / Slides"
          value={`${metrics.pdfCount} PDF`}
          subtitle={`${metrics.docxCount} DOCX • ${metrics.pptxCount} PPTX`}
          icon={Layers}
        />

        <AdminStatCard
          title="AI Chat Activity"
          value={metrics.totalMessages}
          subtitle={`${metrics.userQuestionsCount} prompts • ${metrics.aiResponsesCount} AI replies`}
          icon={MessageSquare}
        />

        <AdminStatCard
          title="Inbox & Queue Alerts"
          value={attentionCount}
          valueClassName={attentionCount > 0 ? "text-[#FE1B03]" : undefined}
          subtitle={`${metrics.unreadContactCount || 0} unread inbox • ${metrics.failedFiles} failed • ${metrics.processingFiles} processing`}
          icon={Mail}
        />
      </div>

      {/* System Infrastructure & RBAC Card */}
      <div className={cn(ORANGE_CARD_CLASS, "overflow-hidden")}>
        <div className={ORANGE_CARD_HEADER_CLASS}>
          <div className="flex items-center gap-2.5">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <h4 className="text-[16px] font-bold text-[#212529]">
              System & RBAC Infrastructure Status
            </h4>
          </div>
          <span className="rounded-full bg-[#fff3ef] border border-[#ffd2c4] px-3 py-1 text-[11px] font-semibold text-[#FE1B03]">
            Live Telemetry
          </span>
        </div>

        <div className="p-5 flex flex-wrap items-center gap-2.5">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#fafafa] border border-[#ebebeb] px-3 py-1.5 text-xs font-medium text-[#141010]">
            <KeyRound className="h-3.5 w-3.5 text-[#FE1B03]" />
            Kinde Auth:{" "}
            <strong className="text-emerald-600">
              {systemHealth.kindeConfigured ? "Connected" : "Local"}
            </strong>
          </span>

          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#fafafa] border border-[#ebebeb] px-3 py-1.5 text-xs font-medium text-[#141010]">
            <Cpu className="h-3.5 w-3.5 text-[#FE1B03]" />
            AI Engine:{" "}
            <strong
              className={
                systemHealth.aiConfigured
                  ? "text-emerald-600"
                  : "text-amber-600"
              }
            >
              {systemHealth.aiConfigured ? "Online" : "Not Set"}
            </strong>
          </span>

          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#fafafa] border border-[#ebebeb] px-3 py-1.5 text-xs font-medium text-[#141010]">
            <Layers className="h-3.5 w-3.5 text-[#FE1B03]" />
            Vector DB:{" "}
            <strong
              className={
                systemHealth.pineconeConfigured
                  ? "text-emerald-600"
                  : "text-amber-600"
              }
            >
              {systemHealth.pineconeConfigured ? "Pinecone (quill)" : "Fallback"}
            </strong>
          </span>

          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#fafafa] border border-[#ebebeb] px-3 py-1.5 text-xs font-medium text-[#141010]">
            <Database className="h-3.5 w-3.5 text-[#FE1B03]" />
            Storage: <strong>{systemHealth.databaseMode}</strong>
          </span>

          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#fafafa] border border-[#ebebeb] px-3 py-1.5 text-xs font-medium text-[#141010]">
            <CreditCard className="h-3.5 w-3.5 text-emerald-600" />
            Paystack Billing: <strong>{systemHealth.paystackMode}</strong>
          </span>
        </div>
      </div>

      {/* Live Plans Snapshot */}
      <div className={cn(ORANGE_CARD_CLASS, "overflow-hidden")}>
        <div className={ORANGE_CARD_HEADER_CLASS}>
          <div>
            <h4 className="text-[17px] font-bold text-[#212529]">
              Active Subscription Plans &amp; Quotas
            </h4>
            <p className="text-xs text-zinc-500 mt-0.5">
              Edits sync automatically to /pricing, upload validation, and billing pages.
            </p>
          </div>
          <Link
            href="/admin/plans"
            className="inline-flex items-center gap-1 text-xs font-semibold text-[#FE1B03] hover:underline"
          >
            Edit Plans &amp; Features <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="p-5 sm:p-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {plans.map((plan: any) => (
            <div
              key={plan.slug}
              className={cn(
                "rounded-[14px] border-2 p-4 transition-all",
                plan.isPopular
                  ? "border-[#FF6F43] bg-[#fff8f6]"
                  : "border-[#ebebeb] bg-[#fafafa]"
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-bold text-[#141010] truncate">
                    {plan.name}
                  </span>
                  <code className="rounded bg-white border border-[#ebebeb] px-1.5 py-0.5 text-[10px] font-mono text-zinc-600">
                    {plan.slug}
                  </code>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-lg font-bold text-[#141010]">
                    &#8358;{(plan.price.amountNgn ?? 0).toLocaleString()}
                  </span>
                  <span className="text-[11px] font-medium text-zinc-500 block">
                    ${plan.price.amount}/mo
                  </span>
                </div>
              </div>

              <p className="mt-1.5 text-xs text-zinc-500 line-clamp-1">
                {plan.tagline}
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-[#141010]">
                <span className="rounded-full bg-white border border-[#ebebeb] px-2.5 py-0.5">
                  {plan.quota} files
                </span>
                <span className="rounded-full bg-white border border-[#ebebeb] px-2.5 py-0.5">
                  {plan.pagesPerPdf} pages/doc
                </span>
                <span className="rounded-full bg-white border border-[#ebebeb] px-2.5 py-0.5">
                  {plan.maxFileSizeMB}MB max
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom 2 Columns: Striped Tables matching orange-backend cards */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Recent Users */}
        <div className={cn(ORANGE_CARD_CLASS, "overflow-hidden flex flex-col")}>
          <div className={ORANGE_CARD_HEADER_CLASS}>
            <div>
              <h4 className="text-[17px] font-bold text-[#212529]">
                Recent Users
              </h4>
              <p className="text-xs text-zinc-500 mt-0.5">
                Latest accounts synced via Kinde &amp; Admin Console
              </p>
            </div>
            <Link
              href="/admin/users"
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#FE1B03] hover:underline"
            >
              View all <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className={ORANGE_TABLE_HEAD_ROW_CLASS}>
                  <th className="py-3 px-5">User</th>
                  <th className="py-3 px-3">Plan</th>
                  <th className="py-3 px-5 text-right">Files</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {recentUsers.length === 0 ? (
                  <tr>
                    <td
                      colSpan={3}
                      className="p-8 text-center text-sm text-zinc-500"
                    >
                      No users registered yet.
                    </td>
                  </tr>
                ) : (
                  recentUsers.map((u: any) => (
                    <tr key={u.id} className={ORANGE_TABLE_BODY_ROW_CLASS}>
                      <td className="py-3.5 px-5 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-[#141010] truncate max-w-[160px]">
                            {u.name || u.email?.split("@")[0]}
                          </span>
                          <span
                            className={cn(
                              "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold",
                              u.role === "ADMIN"
                                ? "bg-gradient-to-b from-[#FF6F43] to-[#FE1B03] text-white"
                                : "bg-zinc-100 text-zinc-600"
                            )}
                          >
                            {u.role}
                          </span>
                          {u.status === "SUSPENDED" && (
                            <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">
                              SUSPENDED
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-zinc-500 truncate max-w-[220px]">
                          {u.email}
                        </p>
                      </td>

                      <td className="py-3.5 px-3">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold",
                            u.isSubscribed
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : "bg-zinc-100 text-zinc-700"
                          )}
                        >
                          {u.isSubscribed && <Gem className="h-3 w-3" />}
                          {u.planName}
                        </span>
                      </td>

                      <td className="py-3.5 px-5 text-right text-xs font-medium text-zinc-600 whitespace-nowrap">
                        {u.filesCount} files
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent Documents */}
        <div className={cn(ORANGE_CARD_CLASS, "overflow-hidden flex flex-col")}>
          <div className={ORANGE_CARD_HEADER_CLASS}>
            <div>
              <h4 className="text-[17px] font-bold text-[#212529]">
                Recent Documents
              </h4>
              <p className="text-xs text-zinc-500 mt-0.5">
                Latest uploaded PDFs, Word docs, and PowerPoint decks
              </p>
            </div>
            <Link
              href="/admin/documents"
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#FE1B03] hover:underline"
            >
              Manage files <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className={ORANGE_TABLE_HEAD_ROW_CLASS}>
                  <th className="py-3 px-5">Document</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-5 text-right">Msgs</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {recentFiles.length === 0 ? (
                  <tr>
                    <td
                      colSpan={3}
                      className="p-8 text-center text-sm text-zinc-500"
                    >
                      No documents uploaded yet.
                    </td>
                  </tr>
                ) : (
                  recentFiles.map((f: any) => (
                    <tr key={f.id} className={ORANGE_TABLE_BODY_ROW_CLASS}>
                      <td className="py-3.5 px-5 min-w-0">
                        <Link
                          href={`/dashboard/${f.id}`}
                          className="font-semibold text-[#141010] hover:text-[#FE1B03] flex items-center gap-1.5 max-w-[220px]"
                        >
                          <span className="truncate">{f.name}</span>
                          <ExternalLink className="h-3 w-3 text-zinc-400 shrink-0" />
                        </Link>
                        <p className="text-xs text-zinc-500 truncate max-w-[220px]">
                          {f.ownerEmail} •{" "}
                          {f.createdAt
                            ? format(new Date(f.createdAt), "MMM d, yyyy")
                            : "Recent"}
                        </p>
                      </td>

                      <td className="py-3.5 px-3">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
                            f.uploadStatus === "SUCCESS"
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : f.uploadStatus === "FAILED"
                              ? "bg-red-50 text-red-700 border border-red-200"
                              : "bg-amber-50 text-amber-700 border border-amber-200"
                          )}
                        >
                          {f.uploadStatus === "SUCCESS" ? (
                            <CheckCircle2 className="h-3 w-3" />
                          ) : f.uploadStatus === "FAILED" ? (
                            <AlertCircle className="h-3 w-3" />
                          ) : (
                            <Clock className="h-3 w-3" />
                          )}
                          {f.uploadStatus}
                        </span>
                      </td>

                      <td className="py-3.5 px-5 text-right text-xs font-medium text-zinc-600 whitespace-nowrap">
                        {f.messagesCount}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
