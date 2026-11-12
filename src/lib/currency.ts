export type BillingCurrency = "USD" | "NGN";

export type CurrencyResolutionSource =
  | "cookie"
  | "geo"
  | "locale"
  | "timezone"
  | "default";

export const CURRENCY_COOKIE_NAME = "quill_currency";
export const CURRENCY_CHANGE_EVENT = "quill:currency-change";

export function normalizeCurrency(value?: string | null): BillingCurrency | null {
  if (!value) return null;
  const upper = value.trim().toUpperCase();
  if (upper === "USD" || upper === "NGN") return upper;
  return null;
}

export function isValidCountryCode(code?: string | null): boolean {
  if (!code) return false;
  const upper = code.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(upper) && upper !== "XX" && upper !== "T1" && upper !== "ZZ";
}

export function resolveCurrencyFromCountry(
  countryCode?: string | null
): BillingCurrency | null {
  if (!isValidCountryCode(countryCode)) return null;
  return countryCode!.trim().toUpperCase() === "NG" ? "NGN" : "USD";
}

/**
 * Browser-only timezone check used strictly as a secondary signal when
 * CDN/proxy geo-IP headers are unavailable (e.g., localhost development).
 */
export function detectClientTimezoneCurrency(): BillingCurrency | null {
  if (typeof Intl === "undefined" || typeof Intl.DateTimeFormat !== "function") {
    return null;
  }
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!tz) return null;
    if (tz === "Africa/Lagos") return "NGN";
    return "USD";
  } catch {
    return null;
  }
}

export function getClientCurrencyCookie(): BillingCurrency | null {
  if (typeof document === "undefined") return null;
  try {
    const parts = document.cookie ? document.cookie.split(";") : [];
    for (const part of parts) {
      const [rawKey, ...rawVal] = part.split("=");
      if (rawKey?.trim() === CURRENCY_COOKIE_NAME) {
        return normalizeCurrency(decodeURIComponent(rawVal.join("=")));
      }
    }
  } catch {
    return null;
  }
  return null;
}

export function setClientCurrencyCookie(currency: BillingCurrency): void {
  if (typeof document !== "undefined") {
    document.cookie = `${CURRENCY_COOKIE_NAME}=${currency}; path=/; max-age=2592000; SameSite=Lax`;
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent<BillingCurrency>(CURRENCY_CHANGE_EVENT, { detail: currency })
    );
  }
}

export function formatCurrencyAmount(
  amount: number,
  currency: BillingCurrency
): string {
  const safeAmount = Number.isFinite(amount) ? Math.max(0, amount) : 0;
  if (currency === "NGN") {
    return `₦${Math.round(safeAmount).toLocaleString("en-US")}`;
  }
  const formatted = Number.isInteger(safeAmount)
    ? safeAmount.toLocaleString("en-US")
    : safeAmount.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
  return `$${formatted}`;
}
