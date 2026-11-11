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
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import Skeleton from "react-loading-skeleton";

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
          <Skeleton width={260} height={36} />
          <Skeleton width={120} height={36} />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Skeleton height={130} className="rounded-xl" />
          <Skeleton height={130} className="rounded-xl" />
          <Skeleton height={130} className="rounded-xl" />
          <Skeleton height={130} className="rounded-xl" />
        </div>
        <Skeleton height={90} className="rounded-xl" />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Skeleton height={320} className="rounded-xl" />
          <Skeleton height={320} className="rounded-xl" />
        </div>
      </div>
    );
  }

  const { metrics, recentUsers, recentFiles, plans, systemHealth } = data;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-200 pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900">
            Platform Overview
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Real-time metrics for users, subscriptions, plan configurations, and AI document activity.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => utils.adminGetOverview.invalidate()}
            disabled={isFetching}
            className="h-9 gap-1.5 bg-white border-zinc-200 text-zinc-700"
          >
            <RefreshCw
              className={cn("h-3.5 w-3.5", isFetching && "animate-spin")}
            />
            Refresh
          </Button>
          <Link
            href="/admin/plans"
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "h-9 gap-1.5 bg-white border-zinc-200 text-zinc-700"
            )}
          >
            <CreditCard className="h-3.5 w-3.5 text-blue-600" />
            Configure Plans
          </Link>
          <Link
            href="/admin/users"
            className={cn(
              buttonVariants({ size: "sm" }),
              "h-9 gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
            )}
          >
            <Plus className="h-3.5 w-3.5" />
            Manage Users
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: Total Users */}
        <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Total Users
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600 border border-blue-100">
              <Users className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-zinc-900">
              {metrics.totalUsers}
            </span>
            <span className="text-xs font-medium text-zinc-500">
              accounts
            </span>
          </div>
          <div className="mt-3 flex items-center gap-2 text-xs text-zinc-600 border-t border-zinc-100 pt-2.5">
            <span className="inline-flex items-center gap-1 font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">
              <ShieldCheck className="h-3 w-3" />
              {metrics.adminUsers} Admin{metrics.adminUsers === 1 ? "" : "s"}
            </span>
            <span className="text-zinc-400">•</span>
            <span>
              {metrics.totalUsers - metrics.suspendedUsers} Active
            </span>
          </div>
        </div>

        {/* Card 2: Subscriptions & Revenue */}
        <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Monthly Recurring Rev
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-100">
              <TrendingUp className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-zinc-900">
              ${metrics.estimatedMrr}
            </span>
            <span className="text-xs font-medium text-emerald-600">
              /mo (${metrics.estimatedArr}/yr)
            </span>
          </div>
          <div className="mt-3 flex items-center gap-2 text-xs text-zinc-600 border-t border-zinc-100 pt-2.5">
            <span className="inline-flex items-center gap-1 font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
              <Gem className="h-3 w-3" />
              {metrics.subscribedUsers} Pro
            </span>
            <span className="text-zinc-400">•</span>
            <span>{metrics.freeUsers} Free tier</span>
          </div>
        </div>

        {/* Card 3: Uploaded Documents */}
        <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Uploaded Documents
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-100">
              <FileText className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-zinc-900">
              {metrics.totalFiles}
            </span>
            <span className="text-xs font-medium text-zinc-500">
              {metrics.successFiles} indexed
            </span>
          </div>
          <div className="mt-3 flex items-center gap-1.5 text-xs text-zinc-600 border-t border-zinc-100 pt-2.5">
            <span className="rounded bg-red-50 px-1.5 py-0.5 font-medium text-red-700">
              {metrics.pdfCount} PDF
            </span>
            <span className="rounded bg-blue-50 px-1.5 py-0.5 font-medium text-blue-700">
              {metrics.docxCount} DOCX
            </span>
            <span className="rounded bg-orange-50 px-1.5 py-0.5 font-medium text-orange-700">
              {metrics.pptxCount} PPTX
            </span>
          </div>
        </div>

        {/* Card 4: AI Chat Messages */}
        <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              AI Chat Activity
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-50 text-violet-600 border border-violet-100">
              <MessageSquare className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-zinc-900">
              {metrics.totalMessages}
            </span>
            <span className="text-xs font-medium text-zinc-500">
              messages
            </span>
          </div>
          <div className="mt-3 flex items-center gap-2 text-xs text-zinc-600 border-t border-zinc-100 pt-2.5">
            <span>{metrics.userQuestionsCount} prompts</span>
            <span className="text-zinc-400">•</span>
            <span>{metrics.aiResponsesCount} AI responses</span>
          </div>
        </div>
      </div>

      {/* System Infrastructure & RBAC Status Bar */}
      <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-700">
              System & RBAC Infrastructure Status
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-50 border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-700">
              <KeyRound className="h-3.5 w-3.5 text-blue-600" />
              Kinde Auth:{" "}
              <strong className="text-emerald-600">
                {systemHealth.kindeConfigured ? "Connected" : "Local"}
              </strong>
            </span>

            <span className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-50 border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-700">
              <Cpu className="h-3.5 w-3.5 text-violet-600" />
              AI Engine:{" "}
              <strong
                className={
                  systemHealth.aiConfigured
                    ? "text-emerald-600"
                    : "text-amber-600"
                }
              >
                {systemHealth.aiConfigured ? "AI Engine Online" : "Not Set"}
              </strong>
            </span>

            <span className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-50 border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-700">
              <Layers className="h-3.5 w-3.5 text-indigo-600" />
              Vector DB:{" "}
              <strong
                className={
                  systemHealth.pineconeConfigured
                    ? "text-emerald-600"
                    : "text-amber-600"
                }
              >
                {systemHealth.pineconeConfigured
                  ? "Pinecone (quill)"
                  : "Fallback"}
              </strong>
            </span>

            <span className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-50 border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-700">
              <Database className="h-3.5 w-3.5 text-blue-600" />
              Storage:{" "}
              <strong className="text-zinc-900">
                {systemHealth.databaseMode}
              </strong>
            </span>

            <span className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-50 border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-700">
              <CreditCard className="h-3.5 w-3.5 text-emerald-600" />
              Paystack Billing:{" "}
              <strong className="text-zinc-900">
                {systemHealth.paystackMode}
              </strong>
            </span>
          </div>
        </div>
      </div>

      {/* Live Plans Snapshot */}
      <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4">
          <div>
            <h2 className="text-base font-bold text-zinc-900">
              Active Subscription Plans & Quotas
            </h2>
            <p className="text-xs text-zinc-500">
              Changes made in Plans & Features immediately update the Pricing page and upload limits.
            </p>
          </div>
          <Link
            href="/admin/plans"
            className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700"
          >
            Edit Plans & Features <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {plans.map((plan: any) => (
            <div
              key={plan.slug}
              className={cn(
                "rounded-xl border p-4 transition",
                plan.isPopular
                  ? "border-blue-200 bg-blue-50/30"
                  : "border-zinc-200 bg-zinc-50/50"
              )}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-zinc-900">{plan.name}</span>
                  <code className="rounded bg-zinc-200/70 px-1.5 py-0.5 text-[10px] font-mono text-zinc-700">
                    {plan.slug}
                  </code>
                </div>
                <span className="text-lg font-bold text-zinc-900">
                  ${plan.price.amount}
                  <span className="text-xs font-normal text-zinc-500">/mo</span>
                </span>
              </div>
              <p className="mt-1 text-xs text-zinc-500 line-clamp-1">
                {plan.tagline}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] font-medium text-zinc-700">
                <span className="rounded-md bg-white border border-zinc-200 px-2 py-0.5">
                  {plan.quota} files quota
                </span>
                <span className="rounded-md bg-white border border-zinc-200 px-2 py-0.5">
                  {plan.pagesPerPdf} pages/doc
                </span>
                <span className="rounded-md bg-white border border-zinc-200 px-2 py-0.5">
                  {plan.maxFileSizeMB}MB max
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom 2 Columns: Recent Users & Recent Documents */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Recent Users */}
        <div className="rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden flex flex-col">
          <div className="flex items-center justify-between border-b border-zinc-100 px-6 py-4">
            <div>
              <h2 className="text-base font-bold text-zinc-900">
                Recent Users
              </h2>
              <p className="text-xs text-zinc-500">
                Latest accounts synced via Kinde & Admin Console
              </p>
            </div>
            <Link
              href="/admin/users"
              className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700"
            >
              View all <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="divide-y divide-zinc-100 flex-1">
            {recentUsers.length === 0 ? (
              <div className="p-8 text-center text-sm text-zinc-500">
                No users registered yet.
              </div>
            ) : (
              recentUsers.map((u: any) => (
                <div
                  key={u.id}
                  className="flex items-center justify-between px-6 py-3.5 hover:bg-zinc-50/80 transition"
                >
                  <div className="min-w-0 flex-1 pr-3">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold text-zinc-900">
                        {u.name || u.email?.split("@")[0]}
                      </p>
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold",
                          u.role === "ADMIN"
                            ? "bg-blue-100 text-blue-700 border border-blue-200"
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
                    <p className="truncate text-xs text-zinc-500">{u.email}</p>
                  </div>

                  <div className="flex items-center gap-3">
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
                    <span className="text-xs text-zinc-400 whitespace-nowrap">
                      {u.filesCount} files
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent Documents */}
        <div className="rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden flex flex-col">
          <div className="flex items-center justify-between border-b border-zinc-100 px-6 py-4">
            <div>
              <h2 className="text-base font-bold text-zinc-900">
                Recent Documents
              </h2>
              <p className="text-xs text-zinc-500">
                Latest uploaded PDFs, Word docs, and PowerPoint decks
              </p>
            </div>
            <Link
              href="/admin/documents"
              className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700"
            >
              Manage files <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="divide-y divide-zinc-100 flex-1">
            {recentFiles.length === 0 ? (
              <div className="p-8 text-center text-sm text-zinc-500">
                No documents uploaded yet.
              </div>
            ) : (
              recentFiles.map((f: any) => (
                <div
                  key={f.id}
                  className="flex items-center justify-between px-6 py-3.5 hover:bg-zinc-50/80 transition"
                >
                  <div className="min-w-0 flex-1 pr-3">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/dashboard/${f.id}`}
                        className="truncate text-sm font-semibold text-zinc-900 hover:text-blue-600 flex items-center gap-1"
                      >
                        {f.name}
                        <ExternalLink className="h-3 w-3 text-zinc-400 shrink-0" />
                      </Link>
                    </div>
                    <p className="truncate text-xs text-zinc-500">
                      Owner: {f.ownerEmail} •{" "}
                      {f.createdAt
                        ? format(new Date(f.createdAt), "MMM d, yyyy")
                        : "Recent"}
                    </p>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
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
                    <span className="text-xs text-zinc-400 whitespace-nowrap">
                      {f.messagesCount} msgs
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

