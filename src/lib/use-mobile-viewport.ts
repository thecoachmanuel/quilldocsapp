"use client";

import { useState, useEffect, useCallback } from "react";

export interface MobileViewportMetrics {
  isMobile: boolean;
  isKeyboardVisible: boolean;
  viewportHeight: number;
  viewportWidth: number;
  offsetTop: number;
}

export function useMobileViewport() {
  const [metrics, setMetrics] = useState<MobileViewportMetrics>({
    isMobile: false,
    isKeyboardVisible: false,
    viewportHeight: typeof window !== "undefined" ? window.innerHeight : 0,
    viewportWidth: typeof window !== "undefined" ? window.innerWidth : 0,
    offsetTop: 0,
  });

  const updateMetrics = useCallback(() => {
    if (typeof window === "undefined") return;

    const isMobile = window.innerWidth < 1024;
    const vv = window.visualViewport;

    if (!isMobile) {
      setMetrics((prev) => ({
        ...prev,
        isMobile: false,
        isKeyboardVisible: false,
        viewportHeight: window.innerHeight,
        viewportWidth: window.innerWidth,
        offsetTop: 0,
      }));
      return;
    }

    const viewportHeight = vv ? vv.height : window.innerHeight;
    const viewportWidth = vv ? vv.width : window.innerWidth;
    const offsetTop = vv ? vv.offsetTop || 0 : 0;

    // Detect virtual keypad:
    // 1. Visual viewport height significantly shorter than layout viewport
    // 2. Or active element is an input/textarea and available height is reduced
    const activeElement = document.activeElement;
    const isInputFocused =
      activeElement instanceof HTMLInputElement ||
      activeElement instanceof HTMLTextAreaElement;

    const heightDiff = window.innerHeight - viewportHeight;
    const isKeyboardVisible =
      heightDiff > 60 ||
      (isInputFocused && viewportHeight < window.innerHeight * 0.88);

    setMetrics({
      isMobile: true,
      isKeyboardVisible,
      viewportHeight,
      viewportWidth,
      offsetTop,
    });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    updateMetrics();

    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener("resize", updateMetrics);
      vv.addEventListener("scroll", updateMetrics);
    }

    window.addEventListener("resize", updateMetrics);
    window.addEventListener("orientationchange", updateMetrics);
    document.addEventListener("focusin", updateMetrics);
    document.addEventListener("focusout", updateMetrics);

    return () => {
      if (vv) {
        vv.removeEventListener("resize", updateMetrics);
        vv.removeEventListener("scroll", updateMetrics);
      }
      window.removeEventListener("resize", updateMetrics);
      window.removeEventListener("orientationchange", updateMetrics);
      document.removeEventListener("focusin", updateMetrics);
      document.removeEventListener("focusout", updateMetrics);
    };
  }, [updateMetrics]);

  return metrics;
}

