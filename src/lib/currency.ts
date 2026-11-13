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

export const COUNTRY_HEADER_NAMES = [
  "x-vercel-ip-country",
  "cf-ipcountry",
  "cloudfront-viewer-country",
  "fly-client-country",
  "x-nf-country",
  "x-country-code",
  "x-country",
  "x-geo-country",
  "x-client-country",
  "x-geoip-country",
  "x-appengine-country",
] as const;

export function isValidCountryCode(code?: string | null): boolean {
  if (!code) return false;
  const upper = code.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(upper) && upper !== "XX" && upper !== "T1" && upper !== "ZZ";
}

function cleanIpCandidate(raw?: string | null): string | null {
  if (!raw) return null;
  let ip = raw.trim().replace(/^["']|["']$/g, "");
  if (!ip || ip.toLowerCase() === "unknown") return null;

  // Handle bracketed IPv6 like [2001:db8::1]:1234
  const bracketed = ip.match(/^\[([^\]]+)\](?::\d+)?$/);
  if (bracketed) {
    ip = bracketed[1];
  } else if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(ip)) {
    // Strip port from IPv4:port
    ip = ip.replace(/:\d+$/, "");
  }

  if (ip.toLowerCase().startsWith("::ffff:")) {
    ip = ip.slice(7);
  }
  return ip.trim() || null;
}

export function isPublicIp(rawIp?: string | null): boolean {
  const ip = cleanIpCandidate(rawIp);
  if (!ip) return false;

  // IPv4 validation + private/reserved range exclusion
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip)) {
    const octets = ip.split(".").map(Number);
    if (octets.some((n) => isNaN(n) || n < 0 || n > 255)) return false;
    const [a, b] = octets;
    if (a === 0 || a === 10 || a === 127) return false;
    if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT
    if (a === 169 && b === 254) return false; // link-local
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a >= 224) return false;
    return true;
  }

  // Basic IPv6 validation + loopback/ULA/link-local exclusion
  if (ip.includes(":")) {
    const lower = ip.toLowerCase();
    if (lower === "::" || lower === "::1") return false;
    if (/^(?:fc|fd|fe8|fe9|fea|feb)/i.test(lower)) return false;
    return /^[0-9a-f:]+$/i.test(lower);
  }

  return false;
}

export function extractClientIpFromHeaders(
  getHeader: (name: string) => string | null | undefined
): string | null {
  const singleHeaders = [
    "cf-connecting-ip",
    "true-client-ip",
    "x-real-ip",
    "x-client-ip",
    "fastly-client-ip",
  ];
  for (const name of singleHeaders) {
    const cleaned = cleanIpCandidate(getHeader(name));
    if (cleaned && isPublicIp(cleaned)) return cleaned;
  }

  const forwardedListHeaders = ["x-vercel-forwarded-for", "x-forwarded-for"];
  for (const name of forwardedListHeaders) {
    const raw = getHeader(name);
    if (!raw) continue;
    for (const part of raw.split(",")) {
      const cleaned = cleanIpCandidate(part);
      if (cleaned && isPublicIp(cleaned)) return cleaned;
    }
  }

  const forwarded = getHeader("forwarded");
  if (forwarded) {
    const forwardedPattern = /for=([^;,\s]+)/gi;
    let m: RegExpExecArray | null;
    while ((m = forwardedPattern.exec(forwarded)) !== null) {
      const cleaned = cleanIpCandidate(m[1]);
      if (cleaned && isPublicIp(cleaned)) return cleaned;
    }
  }

  return null;
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

