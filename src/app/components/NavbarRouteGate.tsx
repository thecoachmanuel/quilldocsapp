"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export default function NavbarRouteGate({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();
  if (pathname?.startsWith("/admin")) {
    return null;
  }
  return <>{children}</>;
}
