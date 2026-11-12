"use client";

import { BillingCurrency } from "@/lib/currency";
import { cn } from "@/lib/utils";
import { Globe } from "lucide-react";

interface CurrencyToggleProps {
  currency: BillingCurrency;
  onChange: (next: BillingCurrency) => void;
  className?: string;
}

export function CurrencyToggle({
  currency,
  onChange,
  className,
}: CurrencyToggleProps) {
  return (
    <div
      role="group"
      aria-label="Billing currency"
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-100/90 p-1 text-xs",
        className
      )}
    >
      <span className="hidden sm:inline-flex items-center pl-2 pr-1 text-zinc-500">
        <Globe className="h-3.5 w-3.5" />
      </span>
      <button
        type="button"
        onClick={() => onChange("USD")}
        aria-pressed={currency === "USD"}
        className={cn(
          "rounded-full px-3 py-1 font-medium transition-all",
          currency === "USD"
            ? "bg-white text-zinc-900 shadow-sm"
            : "text-zinc-600 hover:text-zinc-900"
        )}
      >
        USD ($)
      </button>
      <button
        type="button"
        onClick={() => onChange("NGN")}
        aria-pressed={currency === "NGN"}
        className={cn(
          "rounded-full px-3 py-1 font-medium transition-all",
          currency === "NGN"
            ? "bg-white text-zinc-900 shadow-sm"
            : "text-zinc-600 hover:text-zinc-900"
        )}
      >
        NGN (₦)
      </button>
    </div>
  );
}

