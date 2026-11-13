"use client";

import Link from "next/link";
import { ArrowRight, Check, Gem, Loader2 } from "lucide-react";
import { trpc } from "@/app/_trpc/client";
import type { DynamicPlan } from "@/lib/subscription";
import { Button, buttonVariants } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import { useVisitorCurrency } from "@/hooks/useVisitorCurrency";
import { formatCurrencyAmount } from "@/lib/currency";

export type LimitType = "quota" | "fileSize" | "pages" | "generic";

interface LimitUpgradePromptProps {
  variant?: "card" | "banner";
  reasonTitle: string;
  reasonDescription: string;
  limitType?: LimitType;
  currentPlanName?: string;
  isSubscribed?: boolean;
  upgradePlan?: DynamicPlan | null;
  onNavigate?: () => void;
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
  backHref?: string;
  backLabel?: string;
  className?: string;
}

function pickTargetUpgradePlan(
  plans: DynamicPlan[],
  currentPlanName?: string,
  isSubscribed?: boolean,
  fallback?: DynamicPlan | null
): {
  currentPlan: DynamicPlan | null;
  targetPlan: DynamicPlan | null;
  userIsFree: boolean;
} {
  const normalizedCurrent = (currentPlanName || "").trim().toLowerCase();
  const matchedCurrent =
    plans.find(
      (p) =>
        p.slug.toLowerCase() === normalizedCurrent ||
        p.name.toLowerCase() === normalizedCurrent
    ) ||
    plans.find((p) => p.slug === "free") ||
    null;

  const inferredFree =
    typeof isSubscribed === "boolean"
      ? !isSubscribed
      : matchedCurrent
        ? matchedCurrent.slug === "free" ||
          ((matchedCurrent.price?.amount ?? 0) === 0 &&
            (matchedCurrent.price?.amountNgn ?? 0) === 0)
        : normalizedCurrent === "" || normalizedCurrent === "free";

  const paidPlans = plans.filter(
    (p) =>
      p.slug !== "free" &&
      ((p.price?.amount ?? 0) > 0 || (p.price?.amountNgn ?? 0) > 0)
  );

  let targetPlan: DynamicPlan | null = null;
  if (inferredFree) {
    targetPlan =
      paidPlans.find((p) => p.slug === "pro") ||
      paidPlans.find((p) => p.isPopular) ||
      paidPlans[0] ||
      fallback ||
      null;
  } else if (matchedCurrent) {
    targetPlan =
      paidPlans.find(
        (p) =>
          p.slug !== matchedCurrent.slug &&
          (p.quota > matchedCurrent.quota ||
            p.pagesPerPdf > matchedCurrent.pagesPerPdf ||
            p.maxFileSizeMB > matchedCurrent.maxFileSizeMB)
      ) || null;
  }

  return {
    currentPlan: matchedCurrent,
    targetPlan,
    userIsFree: inferredFree,
  };
}

export default function LimitUpgradePrompt({
  variant = "card",
  reasonTitle,
  reasonDescription,
  limitType = "generic",
  currentPlanName = "Free",
  isSubscribed,
  upgradePlan = null,
  onNavigate,
  secondaryAction,
  backHref,
  backLabel,
  className,
}: LimitUpgradePromptProps) {
  const { toast } = useToast();
  const { currency } = useVisitorCurrency();

  const { data: livePlans, isLoading: isLoadingPlans } =
    trpc.getPublicPlans.useQuery(undefined, {
      refetchOnMount: "always",
      refetchOnWindowFocus: true,
    });

  const { currentPlan, targetPlan, userIsFree } = pickTargetUpgradePlan(
    livePlans || [],
    currentPlanName,
    isSubscribed,
    upgradePlan
  );

  const { mutate: createPaystackSession, isLoading: isStartingCheckout } =
    trpc.createPaystackSession.useMutation({
      onSuccess: ({ url }) => {
        if (url) {
          window.location.href = url;
        } else {
          toast({
            title: "Unable to start checkout",
            description: "Please view our pricing page to complete your upgrade.",
            variant: "destructive",
          });
        }
      },
      onError: (err) => {
        toast({
          title: "Checkout initialization failed",
          description:
            err.message ||
            "Could not start payment right now. You can also upgrade from the Pricing page.",
          variant: "destructive",
        });
      },
    });

  const handleUpgrade = () => {
    createPaystackSession({
      ...(targetPlan?.slug ? { planSlug: targetPlan.slug } : {}),
      currency,
    });
  };

  const priceNgn = targetPlan?.price?.amountNgn ?? 18000;
  const priceUsd = targetPlan?.price?.amount ?? 14;
  const formattedPrimaryPrice = formatCurrencyAmount(
    currency === "USD" ? priceUsd : priceNgn,
    currency
  );
  const displayFeatures = (targetPlan?.features || []).slice(0, 3);

  if (variant === "banner") {
    if (!targetPlan) return null;

    return (
      <div
        className={cn(
          "mt-5 w-full rounded-xl border border-blue-200 bg-gradient-to-r from-blue-50/90 via-white to-blue-50/50 p-4 sm:p-5 shadow-sm",
          className
        )}
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5 min-w-0">
            <div className="h-10 w-10 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-sm">
              <Gem className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm sm:text-base font-semibold text-zinc-900">
                  {reasonTitle}
                </h3>
                <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-700 border border-blue-200">
                  {targetPlan.name} &bull; {formattedPrimaryPrice}/mo
                </span>
              </div>
              <p className="mt-1 text-xs sm:text-sm text-zinc-600 leading-relaxed">
                {reasonDescription}{" "}
                <span className="font-medium text-zinc-800">
                  Unlock {targetPlan.quota.toLocaleString()} documents,{" "}
                  {targetPlan.pagesPerPdf.toLocaleString()} pages/file, and{" "}
                  {targetPlan.maxFileSizeMB}MB uploads
                </span>{" "}
                ({currency === "USD"
                  ? `${formatCurrencyAmount(priceUsd, "USD")} USD/mo`
                  : `${formattedPrimaryPrice} NGN/mo`}).
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
            <Link
              href="/pricing"
              onClick={onNavigate}
              className={buttonVariants({
                variant: "outline",
                size: "sm",
                className: "bg-white border-zinc-300 text-zinc-700 hover:bg-zinc-50 h-9",
              })}
            >
              See Pricing
            </Link>
            <Button
              type="button"
              size="sm"
              disabled={isStartingCheckout}
              onClick={handleUpgrade}
              className="bg-blue-600 hover:bg-blue-700 text-white h-9 font-semibold shadow-sm"
            >
              {isStartingCheckout ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Starting checkout...
                </>
              ) : (
                <>
                  Upgrade to {targetPlan.name}
                  <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "w-full max-w-md mx-auto flex flex-col items-center text-center min-w-0",
        className
      )}
    >
      <div className="rounded-full bg-blue-50 border border-blue-100 p-3 mb-3">
        <Gem className="h-6 w-6 text-blue-600" />
      </div>

      <h3 className="font-semibold text-lg text-zinc-900">{reasonTitle}</h3>
      <p className="mt-1.5 text-sm text-zinc-600 leading-relaxed max-w-sm">
        {reasonDescription}
      </p>

      {!targetPlan && isLoadingPlans ? (
        <div className="mt-4 w-full space-y-2.5">
          <div className="h-36 w-full rounded-xl bg-zinc-100 animate-pulse border border-zinc-200" />
          <div className="h-10 w-full rounded-md bg-zinc-100 animate-pulse" />
        </div>
      ) : targetPlan ? (
        <div className="mt-4 w-full rounded-xl border border-blue-200 bg-gradient-to-b from-blue-50/70 to-white p-4 text-left shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <span className="inline-flex items-center rounded-full bg-blue-600 px-2.5 py-0.5 text-[11px] font-semibold text-white">
                {targetPlan.name} Plan
              </span>
              {targetPlan.tagline && (
                <p className="mt-1 text-xs text-zinc-500 line-clamp-1">
                  {targetPlan.tagline}
                </p>
              )}
            </div>
            <div className="text-right shrink-0">
              <div className="text-lg font-bold text-zinc-900 leading-tight">
                {formattedPrimaryPrice}
                <span className="text-xs font-medium text-zinc-500">/mo</span>
              </div>
              <div className="text-[11px] text-zinc-500">
                {currency === "USD" ? "Billed in USD" : "Billed in Naira (NGN)"}
              </div>
            </div>
          </div>

          {/* Highlighted limits unlocked vs current plan */}
          <div className="mt-3 grid grid-cols-3 gap-2">
            <div
              className={cn(
                "rounded-lg border px-2 py-2 text-center",
                limitType === "quota"
                  ? "border-blue-400 bg-blue-50/90 ring-1 ring-blue-300"
                  : "border-zinc-200 bg-white"
              )}
            >
              <div className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                Documents
              </div>
              <div className="mt-0.5 text-sm font-bold text-zinc-900">
                {targetPlan.quota.toLocaleString()}
              </div>
              {currentPlan && (
                <div className="text-[10px] text-zinc-400">
                  vs {currentPlan.quota}
                </div>
              )}
            </div>

            <div
              className={cn(
                "rounded-lg border px-2 py-2 text-center",
                limitType === "pages"
                  ? "border-blue-400 bg-blue-50/90 ring-1 ring-blue-300"
                  : "border-zinc-200 bg-white"
              )}
            >
              <div className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                Pages / Doc
              </div>
              <div className="mt-0.5 text-sm font-bold text-zinc-900">
                {targetPlan.pagesPerPdf.toLocaleString()}
              </div>
              {currentPlan && (
                <div className="text-[10px] text-zinc-400">
                  vs {currentPlan.pagesPerPdf}
                </div>
              )}
            </div>

            <div
              className={cn(
                "rounded-lg border px-2 py-2 text-center",
                limitType === "fileSize"
                  ? "border-blue-400 bg-blue-50/90 ring-1 ring-blue-300"
                  : "border-zinc-200 bg-white"
              )}
            >
              <div className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                Max File
              </div>
              <div className="mt-0.5 text-sm font-bold text-zinc-900">
                {targetPlan.maxFileSizeMB}MB
              </div>
              {currentPlan && (
                <div className="text-[10px] text-zinc-400">
                  vs {currentPlan.maxFileSizeMB}MB
                </div>
              )}
            </div>
          </div>

          {displayFeatures.length > 0 && (
            <ul className="mt-3 space-y-1.5 border-t border-blue-100 pt-2.5">
              {displayFeatures.map((feat, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 text-xs text-zinc-600"
                >
                  <Check className="h-3.5 w-3.5 text-blue-600 shrink-0 mt-0.5" />
                  <span>{feat}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 flex flex-col gap-2">
            <Button
              type="button"
              disabled={isStartingCheckout}
              onClick={handleUpgrade}
              className="w-full h-auto min-h-10 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-sm"
            >
              {isStartingCheckout ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin shrink-0" />
                  <span>Starting Paystack checkout...</span>
                </>
              ) : (
                <>
                  <span>
                    Upgrade to {targetPlan.name} &mdash; {formattedPrimaryPrice}/mo
                  </span>
                  <ArrowRight className="ml-1.5 h-4 w-4 shrink-0" />
                </>
              )}
            </Button>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Link
                href="/pricing"
                onClick={onNavigate}
                className={buttonVariants({
                  variant: "outline",
                  size: "sm",
                  className: "w-full bg-white text-zinc-700 border-zinc-200",
                })}
              >
                Compare All Pricing
              </Link>

              {secondaryAction ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={secondaryAction.onClick}
                  className="w-full text-zinc-600 hover:text-zinc-900"
                >
                  {secondaryAction.label}
                </Button>
              ) : backHref ? (
                <Link
                  href={backHref}
                  onClick={onNavigate}
                  className={buttonVariants({
                    variant: "ghost",
                    size: "sm",
                    className: "w-full text-zinc-600 hover:text-zinc-900",
                  })}
                >
                  {backLabel || "Back"}
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5 w-full">
          {!userIsFree && (
            <Link
              href="/dashboard/billing"
              onClick={onNavigate}
              className={buttonVariants({
                size: "sm",
                className: "bg-blue-600 hover:bg-blue-700 text-white",
              })}
            >
              Manage Plan
            </Link>
          )}
          <Link
            href="/pricing"
            onClick={onNavigate}
            className={buttonVariants({
              variant: "outline",
              size: "sm",
            })}
          >
            View Pricing
          </Link>
          {secondaryAction && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={secondaryAction.onClick}
            >
              {secondaryAction.label}
            </Button>
          )}
          {backHref && (
            <Link
              href={backHref}
              onClick={onNavigate}
              className={buttonVariants({
                variant: "secondary",
                size: "sm",
              })}
            >
              {backLabel || "Back"}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
