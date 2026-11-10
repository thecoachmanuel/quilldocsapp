import { getUserSubscriptionPlan } from "@/lib/stripe";

import Image from "next/image";
import { Icons } from "./Icons";
import Link from "next/link";
import { Gem, ShieldCheck } from "lucide-react";
import { LogoutLink } from "@/lib/kinde";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface UserAccountNavProps {
  email: string | undefined;
  name: string;
  imageUrl: string;
  isAdmin?: boolean;
}

const UserAccountNav = async ({
  email,
  imageUrl,
  name,
  isAdmin = false,
}: UserAccountNavProps) => {
  const subscriptionPlan = await getUserSubscriptionPlan();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild className="overflow-visible">
        <Button className="rounded-full h-8 w-8 aspect-square bg-slate-400">
          <Avatar className="relative w-8 h-8">
            {imageUrl ? (
              <div className="relative aspect-square h-full w-full">
                <Image
                  fill
                  src={imageUrl}
                  alt="profile picture"
                  referrerPolicy="no-referrer"
                  unoptimized
                />
              </div>
            ) : (
              <AvatarFallback>
                <span className="sr-only">{name}</span>
                <Icons.user className="h-4 w-4 text-zinc-900" />
              </AvatarFallback>
            )}
          </Avatar>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent className="bg-white" align="end">
        <div className="flex items-center justify-start gap-2 p-2">
          <div className="flex flex-col space-y-1 leading-none">
            <div className="flex items-center gap-1.5 flex-wrap">
              {name && <p className="font-medium text-sm text-black">{name}</p>}
              {isAdmin && (
                <span className="inline-flex items-center gap-0.5 bg-blue-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                  <ShieldCheck className="h-2.5 w-2.5" /> ADMIN
                </span>
              )}
              {subscriptionPlan?.isSubscribed && (
                <span className="inline-flex items-center gap-0.5 bg-blue-100 text-blue-700 text-[10px] font-bold px-1.5 py-0.5 rounded">
                  <Gem className="h-2.5 w-2.5" /> {subscriptionPlan.name?.toUpperCase() || "PRO"}
                </span>
              )}
            </div>
            {email && (
              <p className="w-[200px] truncate text-xs text-zinc-700">
                {email}
              </p>
            )}
          </div>
        </div>

        <DropdownMenuSeparator />

        <DropdownMenuItem asChild className="cursor-pointer">
          <Link href="/dashboard" className="w-full flex items-center">
            Dashboard
          </Link>
        </DropdownMenuItem>

        {isAdmin && (
          <DropdownMenuItem asChild className="cursor-pointer">
            <Link
              href="/admin"
              className="w-full flex items-center justify-between text-blue-600 font-medium"
            >
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-blue-600" />
                Admin Console
              </span>
              <span className="text-[10px] bg-blue-50 text-blue-600 font-semibold px-1.5 py-0.5 rounded border border-blue-200">
                RBAC
              </span>
            </Link>
          </DropdownMenuItem>
        )}

        <DropdownMenuItem asChild className="cursor-pointer">
          {subscriptionPlan?.isSubscribed ? (
            <Link
              href="/dashboard/billing"
              className="w-full flex items-center justify-between"
            >
              <span>Manage Subscription</span>
              <span className="text-[10px] bg-blue-50 text-blue-600 font-semibold px-1.5 py-0.5 rounded border border-blue-200">
                {subscriptionPlan.name?.toUpperCase() || "PRO"}
              </span>
            </Link>
          ) : (
            <Link href="/pricing" className="w-full flex items-center">
              Upgrade <Gem className="text-blue-600 h-4 w-4 ml-1.5" />
            </Link>
          )}
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          asChild
          className="cursor-pointer text-red-600 focus:text-red-600 focus:bg-red-50"
        >
          <LogoutLink className="w-full flex items-center">Log out</LogoutLink>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default UserAccountNav;
