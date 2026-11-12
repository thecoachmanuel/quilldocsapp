import { cookies, headers } from "next/headers";
import {
  BillingCurrency,
  CURRENCY_COOKIE_NAME,
  CurrencyResolutionSource,
  isValidCountryCode,
  normalizeCurrency,
  resolveCurrencyFromCountry,
} from "@/lib/currency";

export interface GeoCurrencyResult {
  currency: BillingCurrency;
  countryCode: string | null;
  source: CurrencyResolutionSource;
}

const COUNTRY_HEADER_NAMES = [
  "x-vercel-ip-country",
  "cf-ipcountry",
  "cloudfront-viewer-country",
  "x-country-code",
  "x-geo-country",
  "x-appengine-country",
];

/**
 * Resolves visitor billing currency on the server using:
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

