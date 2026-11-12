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
  initialSource: CurrencyResolutionSource;
}

export function PricingCurrencyBar({
  initialCurrency,
  initialSource,
}: PricingCurrencyProps) {
  const { currency, setCurrency } = useVisitorCurrency({
    initialCurrency,
    initialSource,
    skipQuery: true,
  });

  return (
    <div className="mt-6 flex justify-center">
      <CurrencyToggle currency={currency} onChange={setCurrency} />
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
  initialSource,
}: PlanPriceDisplayProps) {
  const { currency } = useVisitorCurrency({
    initialCurrency,
    initialSource,
    skipQuery: true,
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

