"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Attaches a non-passive wheel listener to a horizontally scrollable toolbar so
 * rolling a standard vertical mouse wheel scrolls the toolbar horizontally
 * whenever its content overflows. Works with conditional/portal-mounted elements.
 */
export function useHorizontalWheelScroll<T extends HTMLElement>() {
  const [element, setElement] = useState<T | null>(null);

  const ref = useCallback((node: T | null) => {
    setElement(node);
  }, []);

  useEffect(() => {
    if (!element) return;

    const handleWheel = (e: WheelEvent) => {
      // Allow browser zoom (Ctrl/Meta + wheel) and pure horizontal trackpad gestures
      if (e.ctrlKey || e.metaKey) return;
      if (element.scrollWidth <= element.clientWidth + 1) return;

      if (e.deltaY !== 0 && Math.abs(e.deltaY) >= Math.abs(e.deltaX)) {
        const lineHeightPx = 24;
        const deltaPx =
          e.deltaMode === 1
            ? e.deltaY * lineHeightPx
            : e.deltaMode === 2
              ? e.deltaY * element.clientWidth
              : e.deltaY;

        if (deltaPx === 0) return;
        e.preventDefault();
        element.scrollLeft += deltaPx;
      }
    };

    element.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      element.removeEventListener("wheel", handleWheel);
    };
  }, [element]);

  return ref;
}

