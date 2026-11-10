import { withAuth } from "@kinde-oss/kinde-auth-nextjs/middleware";
import { NextRequest } from "next/server";

export default function middleware(req: NextRequest) {
  if (!process.env.KINDE_SITE_URL) {
    process.env.KINDE_SITE_URL = req.nextUrl.origin;
  }
  return withAuth(req);
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
