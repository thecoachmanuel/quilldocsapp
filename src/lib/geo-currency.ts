import { cookies, headers } from "next/headers";
import {
  BillingCurrency,
  COUNTRY_HEADER_NAMES,
  CURRENCY_COOKIE_NAME,
  CurrencyResolutionSource,
  extractClientIpFromHeaders,
  isPublicIp,
  isValidCountryCode,
  normalizeCurrency,
  resolveCurrencyFromCountry,
} from "./currency";

export interface GeoCurrencyResult {
  currency: BillingCurrency;
  countryCode: string | null;
  source: CurrencyResolutionSource;
}

const GEO_IP_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const GEO_IP_CACHE_MAX_ENTRIES = 2000;

interface CachedCountryEntry {
  countryCode: string;
  expiresAt: number;
}

const ipCountryCache = new Map<string, CachedCountryEntry>();
const inFlightIpLookups = new Map<string, Promise<string | null>>();

function getCachedCountry(ip: string): string | null {
  const entry = ipCountryCache.get(ip);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    ipCountryCache.delete(ip);
    return null;
  }
  return entry.countryCode;
}

function setCachedCountry(ip: string, countryCode: string): void {
  if (ipCountryCache.size >= GEO_IP_CACHE_MAX_ENTRIES) {
    const oldestKey = ipCountryCache.keys().next().value;
    if (oldestKey) ipCountryCache.delete(oldestKey);
  }
  ipCountryCache.set(ip, {
    countryCode,
    expiresAt: Date.now() + GEO_IP_CACHE_TTL_MS,
  });
}

async function fetchJsonWithTimeout(
  url: string,
  timeoutMs = 1500
): Promise<any | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Resolves a public IP address to an ISO 3166-1 alpha-2 country code using fast
 * lightweight endpoints, with in-memory TTL caching and request deduplication.
 */
export async function lookupCountryByIp(ip: string): Promise<string | null> {
  if (!isPublicIp(ip)) return null;

  const cached = getCachedCountry(ip);
  if (cached) return cached;

  const existing = inFlightIpLookups.get(ip);
  if (existing) return existing;

  const pending = (async (): Promise<string | null> => {
    const encoded = encodeURIComponent(ip);

    const primary = await fetchJsonWithTimeout(
      `https://api.country.is/${encoded}`
    );
    if (isValidCountryCode(primary?.country)) {
      const code = String(primary.country).trim().toUpperCase();
      setCachedCountry(ip, code);
      return code;
    }

    const secondary = await fetchJsonWithTimeout(
      `https://ipwho.is/${encoded}?fields=success,country_code`
    );
    if (secondary?.success !== false && isValidCountryCode(secondary?.country_code)) {
      const code = String(secondary.country_code).trim().toUpperCase();
      setCachedCountry(ip, code);
      return code;
    }

    return null;
  })();

  inFlightIpLookups.set(ip, pending);
  try {
    return await pending;
  } finally {
    inFlightIpLookups.delete(ip);
  }
}

export function clearGeoIpCacheForTests(): void {
  ipCountryCache.clear();
  inFlightIpLookups.clear();
}

/**
 * Resolves visitor billing currency synchronously from:
 * 1. Explicit user preference cookie (`quill_currency`)
 * 2. Edge/CDN geo-IP country headers (`NG` -> `NGN`, any other country -> `USD`)
 * 3. Nigerian Accept-Language tag (`*-NG`) fallback
 * 4. Global default (`USD`) when location headers are absent
 */
export function getServerGeoCurrency(): GeoCurrencyResult {
  try {
    const cookieStore = cookies();
    const cookiePref = normalizeCurrency(
      cookieStore.get(CURRENCY_COOKIE_NAME)?.value
    );
    if (cookiePref) {
      return {
        currency: cookiePref,
        countryCode: null,
        source: "cookie",
      };
    }
  } catch {
    // Ignore outside active Next request lifecycle
  }

  try {
    const headerStore = headers();
    for (const headerName of COUNTRY_HEADER_NAMES) {
      const val = headerStore.get(headerName);
      if (isValidCountryCode(val)) {
        const countryCode = val!.trim().toUpperCase();
        const currency = resolveCurrencyFromCountry(countryCode) || "USD";
        return {
          currency,
          countryCode,
          source: "geo",
        };
      }
    }

    const acceptLang = headerStore.get("accept-language") || "";
    if (/(?:^|,)\s*[a-z]{2,3}-NG\b/i.test(acceptLang)) {
      return {
        currency: "NGN",
        countryCode: "NG",
        source: "locale",
      };
    }
  } catch {
    // Ignore outside active Next request lifecycle
  }

  return {
    currency: "USD",
    countryCode: null,
    source: "default",
  };
}

/**
 * Full async server-side visitor region detection.
 * Falls back to IP-based geolocation on forwarded/client IP headers when
 * hosting platform CDN country headers are unavailable.
 */
export async function resolveServerGeoCurrency(): Promise<GeoCurrencyResult> {
  const syncResult = getServerGeoCurrency();
  if (syncResult.source === "cookie" || syncResult.source === "geo") {
    return syncResult;
  }

  try {
    const headerStore = headers();
    const clientIp = extractClientIpFromHeaders((name) => headerStore.get(name));
    if (clientIp) {
      const countryCode = await lookupCountryByIp(clientIp);
      if (countryCode) {
        return {
          currency: resolveCurrencyFromCountry(countryCode) || "USD",
          countryCode,
          source: "geo",
        };
      }
    }
  } catch {
    // Ignore outside active Next request lifecycle
  }

  return syncResult;
}
