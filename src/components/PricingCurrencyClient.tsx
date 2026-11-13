"use client";

import { CurrencyToggle } from "@/components/CurrencyToggle";
import { useVisitorCurrency } from "@/hooks/useVisitorCurrency";
import {
  BillingCurrency,
  CurrencyResolutionSource,
  formatCurrencyAmount,
} from "@/lib/currency";

interface PricingCurrencyProps {
  initialCurrency: BillingCurrency;
  initialCountryCode?: string | null;
  initialSource: CurrencyResolutionSource;
}

export function PricingCurrencyBar({
  initialCurrency,
  initialCountryCode,
  initialSource,
}: PricingCurrencyProps) {
  const { currency, countryCode, source, setCurrency } = useVisitorCurrency({
    initialCurrency,
    initialCountryCode,
    initialSource,
  });

  const locationHint =
    currency === "NGN"
      ? countryCode === "NG" && source !== "cookie"
        ? "Nigeria detected — prices shown in Naira (₦)"
        : "Prices shown in Naira (₦ NGN)"
      : countryCode && countryCode !== "NG" && source !== "cookie"
        ? "International region detected — prices shown in USD ($)"
        : "Prices shown in USD ($)";

  return (
    <div className="mt-6 flex flex-col items-center gap-2">
      <CurrencyToggle currency={currency} onChange={setCurrency} />
      <p className="text-xs text-zinc-500">{locationHint}</p>
    </div>
  );
}

interface PlanPriceDisplayProps extends PricingCurrencyProps {
  isFree: boolean;
  priceUsd: number;
  priceNgn: number;
}

export function PlanPriceDisplay({
  isFree,
  priceUsd,
  priceNgn,
  initialCurrency,
  initialCountryCode,
  initialSource,
}: PlanPriceDisplayProps) {
  const { currency } = useVisitorCurrency({
    initialCurrency,
    initialCountryCode,
    initialSource,
  });

  const primaryLabel = isFree
    ? "Free"
    : formatCurrencyAmount(currency === "USD" ? priceUsd : priceNgn, currency);

  return (
    <div className="my-5 flex flex-col items-center">
      <div className="flex items-baseline justify-center gap-1">
        <span className="font-display text-5xl sm:text-6xl font-bold tracking-tight">
          {primaryLabel}
        </span>
        {!isFree && (
          <span className="text-gray-500 font-medium text-lg">/mo</span>
        )}
      </div>
    </div>
  );
}
