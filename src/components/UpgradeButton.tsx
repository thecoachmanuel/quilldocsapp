"use client";

import { ArrowRight, Loader2 } from "lucide-react";
import { Button } from "./ui/button";
import { trpc } from "@/app/_trpc/client";
import { useToast } from "./ui/use-toast";

function UpgradeButton() {
  const { toast } = useToast();

  const { mutate: createStripeSession, isLoading } =
    trpc.createStripeSession.useMutation({
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
