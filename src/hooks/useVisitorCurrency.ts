"use client";

import { useCallback, useEffect, useState } from "react";
import { trpc } from "@/app/_trpc/client";
import {
  BillingCurrency,
  CURRENCY_CHANGE_EVENT,
  CurrencyResolutionSource,
  detectClientTimezoneCurrency,
  getClientCurrencyCookie,
  setClientCurrencyCookie,
} from "@/lib/currency";

interface UseVisitorCurrencyOptions {
  initialCurrency?: BillingCurrency;
  initialSource?: CurrencyResolutionSource;
  skipQuery?: boolean;
}

export function useVisitorCurrency(options: UseVisitorCurrencyOptions = {}) {
  const { initialCurrency, initialSource, skipQuery = false } = options;

  const [currency, setCurrencyState] = useState<BillingCurrency>(
    initialCurrency || "USD"
  );
  const [source, setSource] = useState<CurrencyResolutionSource>(
    initialSource || "default"
  );

  const shouldQuery = !initialCurrency && !skipQuery;
  const { data: regionData } = trpc.getVisitorRegion.useQuery(undefined, {
    enabled: shouldQuery,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    const cookiePref = getClientCurrencyCookie();
    if (cookiePref) {
      setCurrencyState(cookiePref);
      setSource("cookie");
      return;
    }

    if (initialCurrency && initialSource && initialSource !== "default") {
      setCurrencyState(initialCurrency);
      setSource(initialSource);
      return;
    }

    if (regionData) {
      if (regionData.source !== "default") {
        setCurrencyState(regionData.currency);
        setSource(regionData.source);
        return;
      }
      const tzCurrency = detectClientTimezoneCurrency();
      setCurrencyState(tzCurrency || regionData.currency);
      setSource(tzCurrency ? "timezone" : regionData.source);
      return;
    }

    if (!initialCurrency || initialSource === "default") {
      const tzCurrency = detectClientTimezoneCurrency();
      if (tzCurrency) {
        setCurrencyState(tzCurrency);
        setSource("timezone");
      }
    }
  }, [initialCurrency, initialSource, regionData]);

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
    source,
    setCurrency,
  };
}
