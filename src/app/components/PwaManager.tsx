"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Download, Share, X } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

const DISMISS_KEY = "quilldocs_pwa_install_dismissed_v1";

function isStandaloneMode(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    Boolean((window.navigator as unknown as { standalone?: boolean }).standalone)
  );
}

function isIosSafariBrowser(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent || "";
  const isIos =
    /iPhone|iPad|iPod/i.test(ua) ||
    (window.navigator.platform === "MacIntel" &&
      window.navigator.maxTouchPoints > 1);
  // Show iOS Add-to-Home-Screen guide on iOS browsers (Safari / iOS Chrome use WebKit)
  return isIos;
}

export default function PwaManager() {
  const pathname = usePathname() || "";
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [showIosGuide, setShowIosGuide] = useState(false);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    // Register service worker on all routes for Android WebAPK / Chrome installability
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .catch((err) => {
          console.warn("[PWA] Service worker registration failed:", err);
        });
    }

    if (isStandaloneMode()) {
      setDismissed(true);
      return;
    }

    let wasDismissed = false;
    try {
      wasDismissed = window.localStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      wasDismissed = false;
    }
    setDismissed(wasDismissed);

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowIosGuide(false);
    };

    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setShowIosGuide(false);
      setDismissed(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    if (!wasDismissed && isIosSafariBrowser()) {
      setShowIosGuide(true);
    }

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt
      );
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const handleDismiss = () => {
    setDismissed(true);
    setShowIosGuide(false);
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Ignore storage failures in private browsing
    }
  };

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === "accepted") {
        setDeferredPrompt(null);
        setDismissed(true);
      }
    } catch (err) {
      console.warn("[PWA] Install prompt failed:", err);
    }
  };

  // Avoid overlapping mobile chat FAB inside active document/multi-doc viewers
  const isViewerRoute =
    pathname.startsWith("/dashboard/multi") ||
    /^\/dashboard\/[^/]+/.test(pathname);
  const hiddenViewerSubroutes =
    !pathname.startsWith("/dashboard/billing") && isViewerRoute;

  if (dismissed || hiddenViewerSubroutes) {
    return null;
  }

  if (!deferredPrompt && !showIosGuide) {
    return null;
  }

  return (
    <div
      role="dialog"
      aria-label="Install QuillDocs App"
      className="fixed bottom-4 left-3 right-3 sm:left-auto sm:right-5 sm:w-[22rem] z-50 rounded-xl border border-zinc-200 bg-white/95 backdrop-blur-md p-3.5 shadow-xl shadow-zinc-900/10"
    >
      <div className="flex items-start gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/icons/icon-192x192.png"
          alt="QuillDocs"
          className="h-10 w-10 rounded-lg shrink-0 border border-zinc-200"
        />

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold text-zinc-900 leading-tight">
              Install Quill<span className="text-blue-600">Docs</span>
            </p>
            <button
              type="button"
              onClick={handleDismiss}
              aria-label="Dismiss install prompt"
              className="p-0.5 rounded text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors shrink-0"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {deferredPrompt ? (
            <>
              <p className="mt-1 text-xs text-zinc-600 leading-snug">
                Add QuillDocs to your home screen for quick full-screen access.
              </p>
              <div className="mt-2.5 flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleInstallClick}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 transition-colors"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Install App</span>
                </button>
                <button
                  type="button"
                  onClick={handleDismiss}
                  className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100 transition-colors"
                >
                  Not now
                </button>
              </div>
            </>
          ) : (
            <p className="mt-1 text-xs text-zinc-600 leading-relaxed">
              On iPhone/iPad: tap{" "}
              <span className="inline-flex items-center gap-0.5 font-semibold text-zinc-800">
                Share <Share className="h-3 w-3 text-blue-600 inline" />
              </span>{" "}
              at the bottom of Safari, then{" "}
              <span className="font-semibold text-zinc-800">
                Add to Home Screen
              </span>
              .
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

