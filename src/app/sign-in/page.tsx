import { redirect } from "next/navigation";

interface PageProps {
  searchParams?: {
    origin?: string;
    post_login_redirect_url?: string;
  };
}

export default function SignInPage({ searchParams }: PageProps) {
  const origin = searchParams?.origin || searchParams?.post_login_redirect_url;
  if (origin && origin !== "/sign-in") {
    redirect(
      `/api/auth/login?post_login_redirect_url=${encodeURIComponent(origin)}`
    );
  }
  redirect("/api/auth/login");
}
