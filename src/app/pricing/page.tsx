import MaxWidthWrapper from "@/app/components/MaxWidthWrapper";
import Footer from "@/app/components/Footer";
import UpgradeButton from "@/components/UpgradeButton";
import { buttonVariants } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { getKindeServerSession, RegisterLink } from "@/lib/kinde";
import { getUserSubscriptionPlan, getDynamicPlans } from "@/lib/subscription";

import { ArrowRight, Check, HelpCircle } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function Page() {
  const { getUser } = getKindeServerSession();
  const user = await getUser();
  const [subscriptionPlan, dynamicPlans] = await Promise.all([
    getUserSubscriptionPlan(),
    getDynamicPlans(),
  ]);

  return (
    <>
      <MaxWidthWrapper className="mb-8 mt-24 text-center max-w-5xl">
        <div className="mx-auto mb-10 sm:max-w-lg">
          <h1 className="text-6xl font-bold sm:text-7xl">Pricing</h1>
          <p className="mt-5 text-gray-600 sm:text-lg">
            Whether you&apos;re just trying out our service or need more,
            we&apos;ve got you covered.
          </p>
        </div>

        <div
          className={cn(
            "pt-12 grid grid-cols-1 gap-10",
            dynamicPlans.length >= 3 ? "lg:grid-cols-3" : "lg:grid-cols-2"
          )}
        >
          <TooltipProvider>
            {dynamicPlans.map((planItem) => {
              const isFree = planItem.slug === "free";
              const isHighlighted =
                Boolean(planItem.isPopular) || planItem.slug === "pro";
              const price = planItem.price?.amount ?? 0;

              return (
                <div
                  key={planItem.slug}
                  className={cn(
                    "relative flex flex-col justify-between rounded-2xl bg-white shadow-lg",
                    {
                      "border-2 border-blue-600 shadow-blue-200": isHighlighted,
                      "border border-gray-200": !isHighlighted,
                    }
                  )}
                >
                  {isHighlighted && (
                    <div className="absolute -top-5 left-0 right-0 mx-auto w-32 rounded-full bg-gradient-to-r from-blue-600 to-cyan-600 px-3 py-2 text-sm font-medium text-white text-center shadow-md">
                      {subscriptionPlan.isSubscribed &&
                      subscriptionPlan.slug === planItem.slug
                        ? "Active Plan"
                        : "Upgrade now"}
                    </div>
                  )}

                  {isFree && user && !subscriptionPlan.isSubscribed && (
                    <div className="absolute -top-5 left-0 right-0 mx-auto w-32 rounded-full bg-zinc-700 px-3 py-2 text-sm font-medium text-white text-center shadow-md">
                      Current Plan
                    </div>
                  )}

                  <div>
                    <div className="p-5">
                      <h3 className="my-3 text-center font-display text-3xl font-bold">
                        {planItem.name}
                      </h3>
                      <p className="text-gray-500 text-sm">{planItem.tagline}</p>
                      <div className="my-5 flex flex-col items-center">
                        <div className="flex items-baseline justify-center gap-1">
                          <span className="font-display text-5xl sm:text-6xl font-bold tracking-tight">
                            {isFree
                              ? "Free"
                              : `₦${(
                                  planItem.price?.amountNgn ?? 18000
                                ).toLocaleString()}`}
                          </span>
                          {!isFree && (
                            <span className="text-gray-500 font-medium text-lg">
                              /mo
                            </span>
                          )}
                        </div>
                        {!isFree ? (
                          <span className="text-xs font-medium text-zinc-500 mt-1">
                            (~ ${price} USD &bull; Automatic bank FX conversion)
                          </span>
                        ) : (
                          <span className="text-xs font-medium text-zinc-500 mt-1">
                            $0 USD &bull; Free forever
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex h-20 items-center justify-center border-b border-t border-gray-200 bg-gray-50">
                      <div className="flex items-center space-x-1">
                        <p>
                          {planItem.quota.toLocaleString()} documents/mo
                          included
                        </p>

                        <Tooltip delayDuration={300}>
                          <TooltipTrigger className="cursor-default ml-1.5">
                            <HelpCircle className="h-4 w-4 text-zinc-500" />
                          </TooltipTrigger>
                          <TooltipContent className="w-80 p-2">
                            Up to {planItem.pagesPerPdf} pages/slides per
                            document ({planItem.maxFileSizeMB}MB max file size).
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </div>

                    <ul className="my-10 space-y-5 px-8 text-left">
                      {(planItem.features || []).map(
                        (featureText: string, idx: number) => (
                          <li key={idx} className="flex space-x-5">
                            <div className="flex-shrink-0">
                              <Check className="h-6 w-6 text-blue-500" />
                            </div>
                            <p className="text-gray-600">{featureText}</p>
                          </li>
                        )
                      )}
                    </ul>
                  </div>

                  <div>
                    <div className="border-t border-gray-200" />
                    <div className="p-5">
                      {isFree ? (
                        user ? (
                          <Link
                            href="/dashboard"
                            className={buttonVariants({
                              className: "w-full",
                              variant: "secondary",
                            })}
                          >
                            {subscriptionPlan.isSubscribed
                              ? "Go to Dashboard"
                              : "Current Plan"}
                            <ArrowRight className="h-5 w-5 ml-1.5" />
                          </Link>
                        ) : (
                          <RegisterLink
                            className={buttonVariants({
                              className: "w-full",
                              variant: "secondary",
                            })}
                          >
                            Sign up
                            <ArrowRight className="h-5 w-5 ml-1.5" />
                          </RegisterLink>
                        )
                      ) : user ? (
                        subscriptionPlan.isSubscribed &&
                        subscriptionPlan.slug === planItem.slug ? (
                          <Link
                            href="/dashboard/billing?manage=true"
                            className={buttonVariants({
                              className: "w-full",
                            })}
                          >
                            Manage Subscription
                            <ArrowRight className="h-5 w-5 ml-1.5" />
                          </Link>
                        ) : (
                          <UpgradeButton
                            planSlug={planItem.slug}
                            planName={planItem.name}
                          />
                        )
                      ) : (
                        <RegisterLink
                          className={buttonVariants({
                            className: "w-full",
                          })}
                        >
                          Sign up
                          <ArrowRight className="h-5 w-5 ml-1.5" />
                        </RegisterLink>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </TooltipProvider>
        </div>
      </MaxWidthWrapper>
      <Footer />
    </>
  );
}

export default Page;
