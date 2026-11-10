import { cn } from "@/lib/utils";
import { ReactNode } from "react";

function MaxWidthWrapper({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "mx-auto w-full max-w-screen-xl px-4 sm:px-6 md:px-20",
        className
      )}
    >
      {children}
    </div>
  );
}

export default MaxWidthWrapper;
