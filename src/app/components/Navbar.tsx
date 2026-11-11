import Link from "next/link";
import {
  LoginLink,
  RegisterLink,
  getKindeServerSession,
} from "@/lib/kinde";
import { getUserSessionWithRBAC } from "@/lib/auth-rbac";
import { ArrowRight, ShieldCheck } from "lucide-react";
import UserAccountNav from "./UserAccountNav";
import MaxWidthWrapper from "./MaxWidthWrapper";
import { buttonVariants } from "@/components/ui/button";
import MobileNav from "./MobileNav";
import NavbarRouteGate from "./NavbarRouteGate";

const Navbar = async () => {
  const { getUser } = getKindeServerSession();
  const [user, rbac] = await Promise.all([
    getUser(),
    getUserSessionWithRBAC(),
  ]);

  return (
    <NavbarRouteGate>
      <nav className="sticky h-14 inset-x-0 top-0 z-40 w-full border-b border-gray-200 bg-white/95 backdrop-blur-lg transition-all">
      <MaxWidthWrapper>
        <div className="flex h-14 items-center justify-between">
          <Link href="/" className="flex z-[110] font-semibold items-center gap-1">
            <span className="text-zinc-900 font-bold tracking-tight text-lg">
              Quill<span className="text-blue-600">Docs</span>
            </span>
          </Link>

          <div className="flex items-center gap-2.5 sm:gap-4">
            <div className="hidden items-center space-x-4 sm:flex">
              {!user ? (
                <>
                  <Link
                    href="/pricing"
                    className={buttonVariants({
                      variant: "ghost",
                      size: "sm",
                    })}
                  >
                    Pricing
                  </Link>
                  <Link
                    href="/contact"
                    className={buttonVariants({
                      variant: "ghost",
                      size: "sm",
                    })}
                  >
                    Contact
                  </Link>
                  <LoginLink
                    className={buttonVariants({
                      variant: "ghost",
                      size: "sm",
                    })}
                  >
                    Sign in
                  </LoginLink>
                  <RegisterLink
                    className={buttonVariants({
                      size: "sm",
                    })}
                  >
                    Get started <ArrowRight className="ml-1.5 h-5 w-5" />
                  </RegisterLink>
                </>
              ) : (
                <>
                  {rbac.isAdmin && (
                    <Link
                      href="/admin"
                      className={buttonVariants({
                        variant: "ghost",
                        size: "sm",
                        className:
                          "text-blue-600 hover:text-blue-700 hover:bg-blue-50/70 gap-1.5 font-medium",
                      })}
                    >
                      <ShieldCheck className="h-4 w-4 text-blue-600" />
                      Admin
                    </Link>
                  )}

                  <Link
                    href="/dashboard"
                    className={buttonVariants({
                      variant: "ghost",
                      size: "sm",
                    })}
                  >
                    Dashboard
                  </Link>
                </>
              )}
            </div>

            {user && (
              <UserAccountNav
                name={
                  !user?.given_name || !user?.family_name
                    ? rbac.user?.name || "Your Account"
                    : `${user.given_name} ${user.family_name}`
                }
                email={user?.email ?? ""}
                imageUrl={user?.picture ?? ""}
                isAdmin={rbac.isAdmin}
              />
            )}

            <MobileNav isAuth={!!user} isAdmin={rbac.isAdmin} />
          </div>
        </div>
      </MaxWidthWrapper>
    </nav>
    </NavbarRouteGate>
  );
};

export default Navbar;
