"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { trpc } from "../_trpc/client";
import { Loader2 } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { useState } from "react";

function Page() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const origin = searchParams.get("origin");
  const [authError, setAuthError] = useState<boolean>(false);

  trpc.authCallback.useQuery(undefined, {
    onSuccess: ({ success }) => {
      if (success) {
        const target = origin
          ? origin.startsWith("/")
            ? origin
            : `/${origin}`
          : "/dashboard";
        router.push(target);
      }
    },
    onError: (err) => {
      if (err.data?.code === "UNAUTHORIZED") {
        setAuthError(true);
      }
    },
    retry: 3,
    retryDelay: 800,
  });

  if (authError) {
    return (
      <div className="w-full mt-24 flex justify-center">
        <div className="flex flex-col items-center gap-3 text-center px-4">
          <h3 className="font-semibold text-xl text-zinc-900">
            Authentication Required
          </h3>
          <p className="text-zinc-600 max-w-sm text-sm">
            We couldn&apos;t verify your session. Please sign in to access your account.
          </p>
          <a
            href={`/api/auth/login${
              origin ? `?post_login_redirect_url=${encodeURIComponent(origin)}` : ""
            }`}
            className={buttonVariants({
              className: "mt-2",
            })}
          >
            Sign in
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full mt-24 flex justify-center">
      <div className="flex flex-col items-center gap-2">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-800" />
        <h3 className="font-semibold text-xl">Setting up your account...</h3>
        <p className="text-zinc-500 text-sm">You will be redirected automatically.</p>
      </div>
    </div>
  );
}

export default Page;
