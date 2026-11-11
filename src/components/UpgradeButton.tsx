"use client";

import { ArrowRight, Loader2 } from "lucide-react";
import { Button } from "./ui/button";
import { trpc } from "@/app/_trpc/client";
import { useToast } from "./ui/use-toast";

function UpgradeButton({
  planSlug,
  planName,
}: {
  planSlug?: string;
  planName?: string;
} = {}) {
  const { toast } = useToast();

  const { mutate: createPaystackSession, isLoading } =
    trpc.createPaystackSession.useMutation({
      onSuccess: ({ url }) => {
        if (url) {
          window.location.href = url;
        } else {
          toast({
            title: "Unable to start checkout",
            description: "Please try again in a moment.",
            variant: "destructive",
          });
        }
      },
      onError: (err) => {
        toast({
          title: "Checkout initialization failed",
          description:
            err.message || "Could not start payment. Please try again.",
          variant: "destructive",
        });
      },
    });

  return (
    <Button
      disabled={isLoading}
      onClick={() =>
        createPaystackSession(planSlug ? { planSlug } : undefined)
      }
      className="w-full"
    >
      {isLoading ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : null}
      {planName ? `Upgrade to ${planName}` : "Upgrade now"}{" "}
      <ArrowRight className="h-5 w-5 ml-1.5" />
    </Button>
  );
}

export default UpgradeButton;
