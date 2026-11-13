"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BillingCurrency,
  CURRENCY_CHANGE_EVENT,
  CurrencyResolutionSource,
  detectClientTimezoneCurrency,
  getClientCurrencyCookie,
  isValidCountryCode,
  resolveCurrencyFromCountry,
  setClientCurrencyCookie,
} from "@/lib/currency";

interface UseVisitorCurrencyOptions {
  initialCurrency?: BillingCurrency;
  initialCountryCode?: string | null;
  initialSource?: CurrencyResolutionSource;
  skipQuery?: boolean;
}

interface DetectedRegion {
  currency: BillingCurrency;
  countryCode: string | null;
  source: CurrencyResolutionSource;
}

const SESSION_GEO_KEY = "quill_visitor_geo_v1";
const SESSION_GEO_TTL_MS = 30 * 60 * 1000;

let inFlightClientGeoPromise: Promise<DetectedRegion | null> | null = null;

function readSessionGeoCache(): DetectedRegion | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(SESSION_GEO_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      typeof parsed?.ts === "number" &&
      Date.now() - parsed.ts < SESSION_GEO_TTL_MS &&
      (parsed.currency === "USD" || parsed.currency === "NGN")
    ) {
      return {
        currency: parsed.currency,
        countryCode:
          typeof parsed.countryCode === "string" ? parsed.countryCode : null,
        source: parsed.source || "geo",
      };
    }
  } catch {
    // Ignore storage access errors
  }
  return null;
}

function writeSessionGeoCache(region: DetectedRegion): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      SESSION_GEO_KEY,
      JSON.stringify({ ...region, ts: Date.now() })
    );
  } catch {
    // Ignore storage access errors
  }
}

async function fetchJsonTimeout(url: string, timeoutMs = 2000): Promise<any | null> {
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

function detectBrowserVisitorRegionOnce(): Promise<DetectedRegion | null> {
  const cached = readSessionGeoCache();
  if (cached) return Promise.resolve(cached);

  if (inFlightClientGeoPromise) return inFlightClientGeoPromise;

  inFlightClientGeoPromise = (async (): Promise<DetectedRegion | null> => {
    // 1. Try app's /api/geo first (uses server headers + server IP lookup)
    const serverGeo = await fetchJsonTimeout("/api/geo", 2000);
    if (
      serverGeo &&
      (serverGeo.currency === "USD" || serverGeo.currency === "NGN") &&
      serverGeo.source === "geo"
    ) {
      const resolved: DetectedRegion = {
        currency: serverGeo.currency,
        countryCode: serverGeo.countryCode || null,
        source: "geo",
      };
      writeSessionGeoCache(resolved);
      return resolved;
    }

    // 2. Fallback to browser public IP lookup when server couldn't inspect WAN IP (e.g. localhost)
    const primary = await fetchJsonTimeout("https://api.country.is/", 2500);
    if (isValidCountryCode(primary?.country)) {
      const code = String(primary.country).trim().toUpperCase();
      const resolved: DetectedRegion = {
        currency: resolveCurrencyFromCountry(code) || "USD",
        countryCode: code,
        source: "geo",
      };
      writeSessionGeoCache(resolved);
      return resolved;
    }

    const secondary = await fetchJsonTimeout(
      "https://ipwho.is/?fields=success,country_code",
      2500
    );
    if (
      secondary?.success !== false &&
      isValidCountryCode(secondary?.country_code)
    ) {
      const code = String(secondary.country_code).trim().toUpperCase();
      const resolved: DetectedRegion = {
        currency: resolveCurrencyFromCountry(code) || "USD",
        countryCode: code,
        source: "geo",
      };
      writeSessionGeoCache(resolved);
      return resolved;
    }

    return null;
  })();

  return inFlightClientGeoPromise.finally(() => {
    inFlightClientGeoPromise = null;
  });
}

export function useVisitorCurrency(options: UseVisitorCurrencyOptions = {}) {
  const {
    initialCurrency,
    initialCountryCode = null,
    initialSource,
    skipQuery = false,
  } = options;

  const [currency, setCurrencyState] = useState<BillingCurrency>(
    initialCurrency || "USD"
  );
  const [countryCode, setCountryCode] = useState<string | null>(
    initialCountryCode
  );
  const [source, setSource] = useState<CurrencyResolutionSource>(
    initialSource || "default"
  );

  useEffect(() => {
    let active = true;

    const cookiePref = getClientCurrencyCookie();
    if (cookiePref) {
      setCurrencyState(cookiePref);
      setSource("cookie");
      return;
    }

    // Server already confirmed country via geo-IP or headers
    if (initialSource === "cookie" || initialSource === "geo") {
      if (initialCurrency) setCurrencyState(initialCurrency);
      if (initialCountryCode) setCountryCode(initialCountryCode);
      setSource(initialSource);
      return;
    }

    // Apply session cache or fast timezone signal immediately while confirming geo-IP
    const cached = readSessionGeoCache();
    if (cached) {
      setCurrencyState(cached.currency);
      setCountryCode(cached.countryCode);
      setSource(cached.source);
      return;
    }

    const tzCurrency = detectClientTimezoneCurrency();
    if (tzCurrency) {
      setCurrencyState(tzCurrency);
      setCountryCode(tzCurrency === "NGN" ? "NG" : null);
      setSource("timezone");
    }

    if (skipQuery && initialSource && initialSource !== "default") {
      return;
    }

    detectBrowserVisitorRegionOnce().then((detected) => {
      if (!active || !detected) return;
      if (getClientCurrencyCookie()) return;
      setCurrencyState(detected.currency);
      setCountryCode(detected.countryCode);
      setSource(detected.source);
    });

    return () => {
      active = false;
    };
  }, [initialCurrency, initialCountryCode, initialSource, skipQuery]);

  useEffect(() => {
    const onCurrencyChange = (ev: Event) => {
      const next = (ev as CustomEvent<BillingCurrency>).detail;
      if (next === "USD" || next === "NGN") {
        setCurrencyState(next);
        setSource("cookie");
      }
    };
    window.addEventListener(CURRENCY_CHANGE_EVENT, onCurrencyChange);
    return () => {
      window.removeEventListener(CURRENCY_CHANGE_EVENT, onCurrencyChange);
    };
  }, []);

  const setCurrency = useCallback((next: BillingCurrency) => {
    setCurrencyState(next);
    setSource("cookie");
    setClientCurrencyCookie(next);
  }, []);

  return {
    currency,
    countryCode,
    source,
    setCurrency,
  };
}
