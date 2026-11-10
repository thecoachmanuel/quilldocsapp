"use client";

import { ArrowRight, Menu, ShieldCheck, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  LoginLink,
  RegisterLink,
  LogoutLink,
} from "@kinde-oss/kinde-auth-nextjs/components";

const MobileNav = ({
  isAuth,
  isAdmin = false,
}: {
  isAuth: boolean;
  isAdmin?: boolean;
}) => {
  const [isOpen, setOpen] = useState<boolean>(false);
  const [mounted, setMounted] = useState<boolean>(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const toggleOpen = () => setOpen((prev) => !prev);

  const pathname = usePathname();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div className="sm:hidden">
      <button
        type="button"
        onClick={toggleOpen}
        aria-label={isOpen ? "Close navigation menu" : "Open navigation menu"}
        className="relative z-[10001] p-1.5 rounded-md text-zinc-700 hover:text-zinc-900 hover:bg-zinc-100 transition-colors"
      >
        {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {mounted && isOpen
        ? createPortal(
            <div className="fixed inset-0 z-[10000] w-full sm:hidden animate-in fade-in-20">
              {/* Backdrop to close menu when tapping outside */}
              <div
                className="fixed inset-0 bg-black/40 backdrop-blur-[2px]"
                onClick={() => setOpen(false)}
              />

              {/* Floating top bar with Brand and Close button so it's always visible above all layers */}
              <div className="relative z-[10001] flex h-14 items-center justify-between px-4 border-b border-zinc-200 bg-white/95 backdrop-blur-lg">
                <Link
                  href="/"
                  onClick={() => setOpen(false)}
                  className="flex font-semibold items-center gap-1"
                >
                  <span className="text-zinc-900 font-bold tracking-tight text-lg">
                    Quill<span className="text-blue-600">Docs</span>
                  </span>
                </Link>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close navigation menu"
                  className="p-1.5 rounded-md text-zinc-700 hover:text-zinc-900 hover:bg-zinc-100 transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <ul className="relative z-[10001] bg-white border-b border-zinc-200 shadow-2xl grid w-full gap-3 px-8 pt-6 pb-8 animate-in slide-in-from-top-2">
                {!isAuth ? (
                  <>
                    <li>
                      <RegisterLink
                        onClick={() => setOpen(false)}
                        className="flex items-center w-full font-semibold text-blue-600 py-1"
                      >
                        Get started
                        <ArrowRight className="ml-2 h-5 w-5" />
                      </RegisterLink>
                    </li>
                    <li className="my-2 h-px w-full bg-zinc-200" />
                    <li>
                      <LoginLink
                        onClick={() => setOpen(false)}
                        className="flex items-center w-full font-semibold text-zinc-800 py-1"
                      >
                        Sign in
                      </LoginLink>
                    </li>
                    <li className="my-2 h-px w-full bg-zinc-200" />
                    <li>
                      <Link
                        onClick={() => setOpen(false)}
                        className="flex items-center w-full font-semibold text-zinc-800 py-1"
                        href="/pricing"
                      >
                        Pricing
                      </Link>
                    </li>
                    <li className="my-2 h-px w-full bg-zinc-200" />
                    <li>
                      <Link
                        onClick={() => setOpen(false)}
                        className="flex items-center w-full font-semibold text-zinc-800 py-1"
                        href="/contact"
                      >
                        Contact & Support
                      </Link>
                    </li>
                  </>
                ) : (
                  <>
                    <li>
                      <Link
                        onClick={() => setOpen(false)}
                        className="flex items-center w-full font-semibold text-zinc-900 py-1"
                        href="/dashboard"
                      >
                        Dashboard
                      </Link>
                    </li>
                    {isAdmin && (
                      <>
                        <li className="my-2 h-px w-full bg-zinc-200" />
                        <li>
                          <Link
                            onClick={() => setOpen(false)}
                            className="flex items-center gap-2 w-full font-semibold text-blue-600 py-1"
                            href="/admin"
                          >
                            <ShieldCheck className="h-4 w-4 text-blue-600" />
                            Admin Console
                          </Link>
                        </li>
                      </>
                    )}
                    <li className="my-2 h-px w-full bg-zinc-200" />
                    <li>
                      <LogoutLink
                        onClick={() => setOpen(false)}
                        className="flex items-center w-full font-semibold text-red-600 py-1 cursor-pointer"
                      >
                        Log out
                      </LogoutLink>
                    </li>
                  </>
                )}
              </ul>
            </div>,
            document.body
          )
        : null}
    </div>
  );
};

export default MobileNav;
