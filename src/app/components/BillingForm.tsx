"use client";

import { getUserSubscriptionPlan } from "@/lib/stripe";
import { trpc } from "@/app/_trpc/client";
import MaxWidthWrapper from "./MaxWidthWrapper";
import { Check, Gem, Loader2, Sparkles, ShieldCheck } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/components/ui/use-toast";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

interface BillingFormProps {
  subscriptionPlan: Awaited<ReturnType<typeof getUserSubscriptionPlan>>;
}

const BillingForm = ({ subscriptionPlan }: BillingFormProps) => {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [isVerifying, setIsVerifying] = useState(false);
  const verifiedRef = useRef<string | null>(null);

  const { mutate: verifyPayment } = trpc.verifyPaystackPayment.useMutation({
    onSuccess: (data) => {
      setIsVerifying(false);
      if (data.success) {
        toast({
          title: "Payment confirmed! 🎉",
          description: "Your account is now upgraded with all QuillDocs PRO features.",
        });
        window.history.replaceState({}, "", "/dashboard/billing?upgraded=true");
        router.refresh();
      } else {
        window.history.replaceState({}, "", "/dashboard/billing");
        toast({
          title: "Payment not completed",
          description:
            data.message ||
            "Your payment could not be verified yet. Please try again if no debit occurred.",
          variant: "destructive",
        });
      }
    },
    onError: (err) => {
      setIsVerifying(false);
      window.history.replaceState({}, "", "/dashboard/billing");
      toast({
        title: "Payment verification failed",
        description:
          err.message || "Could not verify Paystack payment reference.",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    const ref = searchParams.get("reference") || searchParams.get("trxref");
    if (ref && !subscriptionPlan.isSubscribed && verifiedRef.current !== ref) {
      verifiedRef.current = ref;
      setIsVerifying(true);
      verifyPayment({ reference: ref });
    } else if (searchParams.get("upgraded") === "true") {
      toast({
        title: "Welcome to QuillDocs PRO! 🎉",
        description: "Your account has been upgraded with all PRO features.",
      });
    } else if (searchParams.get("canceled") === "true") {
      toast({
        title: "Plan updated",
        description: "Your subscription has been switched back to the Free plan.",
      });
    } else if (searchParams.get("status") === "active") {
      toast({
        title: "Subscription Active",
        description: "You are currently enjoying full PRO benefits.",
      });
    }
  }, [searchParams, subscriptionPlan.isSubscribed, toast, verifyPayment]);

  const { mutate: createStripeSession, isLoading } =
    trpc.createStripeSession.useMutation({
      onSuccess: ({ url }) => {
        if (url) window.location.href = url;
        if (!url) {
          toast({
            title: "There was a problem...",
            description: "Please try again in a moment",
            variant: "destructive",
          });
        }
      },
      onError: (err) => {
        toast({
          title: "Checkout initialization failed",
          description:
            err.message || "Unable to start Paystack payment. Please try again.",
          variant: "destructive",
        });
      },
    });

  const displayPriceNgn =
    (subscriptionPlan as any)?.price?.amountNgn || 18000;
  const displayPriceUsd =
    (subscriptionPlan as any)?.price?.amount || 14;

  const isPro = subscriptionPlan.isSubscribed;

  const currentFeatures = isPro
    ? [
        "50 documents included per month",
        "Up to 25 pages per document",
        "16MB maximum file size limit",
        "Higher-quality AI responses with deep context (60k chars)",
        "Priority processing and instant model fallback",
      ]
    : [
        "10 documents included per month",
        "Up to 5 pages per document",
        "4MB maximum file size limit",
        "Standard AI responses (15k chars context)",
        "Standard processing",
      ];

  const proFeatures = [
    "50 documents included per month (5x increase)",
    "Up to 25 pages per PDF / presentation",
    "16MB maximum file size limit",
    "High-precision 4x context AI inference",
    "Automated study guides & mock exam questions",
    "Priority support & fastest processing queue",
  ];

  return (
    <MaxWidthWrapper className="max-w-5xl">
      <form
        className="mt-12"
        onSubmit={(e) => {
          e.preventDefault();
          createStripeSession();
        }}
      >
        <Card className="border border-zinc-200 shadow-sm">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-2xl font-bold flex items-center gap-2">
                  Subscription Plan
                  {isPro && (
                    <span className="inline-flex items-center gap-1 bg-blue-100 text-blue-700 text-xs px-2.5 py-0.5 rounded-full font-semibold">
                      <Gem className="h-3 w-3" /> PRO
                    </span>
                  )}
                </CardTitle>
                <CardDescription className="mt-1.5 text-zinc-600">
                  You are currently on the{" "}
                  <strong className="text-zinc-900 font-semibold">
                    {subscriptionPlan.name}
                  </strong>{" "}
                  plan.
                </CardDescription>
              </div>

              {!isPro && (
                <div className="hidden sm:flex items-center gap-1.5 text-xs text-blue-600 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-full font-medium">
                  <Sparkles className="h-3.5 w-3.5" />
                  Upgrade available
                </div>
              )}
            </div>
          </CardHeader>

          <CardContent className="space-y-5">
            <div className="rounded-lg bg-zinc-50 border border-zinc-200/80 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">
                Included with your {subscriptionPlan.name} plan:
              </p>
              <ul className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {currentFeatures.map((feat) => (
                  <li
                    key={feat}
                    className="flex items-center gap-2 text-sm text-zinc-700"
                  >
                    <Check className="h-4 w-4 text-blue-600 flex-shrink-0" />
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>
            </div>

            {!isPro && (
              <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-4">
                <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-zinc-900">
                      ₦{displayPriceNgn.toLocaleString()}
                    </span>
                    <span className="text-xs text-zinc-500 font-medium">
                      / month (~ ${displayPriceUsd} USD billed in NGN)
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-emerald-700 font-medium bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Secure Paystack Checkout
                  </div>
                </div>

                <p className="text-xs text-zinc-600 mb-3">
                  Unlock everything QuillDocs has to offer for deep document
                  research and high-volume studying:
                </p>

                <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {proFeatures.map((feat) => (
                    <li
                      key={feat}
                      className="flex items-center gap-2 text-xs text-zinc-700 font-medium"
                    >
                      <Check className="h-3.5 w-3.5 text-blue-600 flex-shrink-0" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>

          <CardFooter className="flex flex-col items-start space-y-3 sm:flex-row sm:justify-between sm:space-y-0 pt-2 pb-6 border-t border-zinc-100">
            <Button type="submit" disabled={isLoading || isVerifying}>
              {isLoading || isVerifying ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {isVerifying
                ? "Verifying Payment..."
                : isPro
                ? "Manage Subscription"
                : `Upgrade to PRO (₦${displayPriceNgn.toLocaleString()} / mo)`}
            </Button>

            {subscriptionPlan.isSubscribed ? (
              <p className="text-xs font-medium text-zinc-600">
                {subscriptionPlan.isCanceled
                  ? "Your plan will be canceled on "
                  : "Your plan renews on "}
                {subscriptionPlan.stripeCurrentPeriodEnd
                  ? format(
                      subscriptionPlan.stripeCurrentPeriodEnd,
                      "dd.MM.yyyy"
                    )
                  : "N/A"}
                .
              </p>
            ) : (
              <p className="text-xs text-zinc-500">
                Cancel anytime. Instant activation upon payment.
              </p>
            )}
          </CardFooter>
        </Card>
      </form>
    </MaxWidthWrapper>
  );
};

export default BillingForm;
