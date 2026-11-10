"use client";

import { ArrowRight, Loader2 } from "lucide-react";
import { Button } from "./ui/button";
import { trpc } from "@/app/_trpc/client";

function UpgradeButton() {
  const { mutate: createStripeSession, isLoading } =
    trpc.createStripeSession.useMutation({
      onSuccess: ({ url }) => {
        window.location.href = url ?? "/dashboard/billing";
      },
    });

  return (
    <Button
      disabled={isLoading}
      onClick={() => createStripeSession()}
      className="w-full"
    >
      {isLoading ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : null}
      Upgrade now <ArrowRight className="h-5 w-5 ml-1.5" />
    </Button>
  );
}

export default UpgradeButton;
