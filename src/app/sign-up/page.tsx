import { redirect } from "next/navigation";

interface PageProps {
  searchParams?: {
    origin?: string;
    post_login_redirect_url?: string;
  };
}

export default function SignUpPage({ searchParams }: PageProps) {
  const origin = searchParams?.origin || searchParams?.post_login_redirect_url;
  if (origin) {
    redirect(`/api/auth/register?post_login_redirect_url=${encodeURIComponent(origin)}`);
  }
  redirect("/api/auth/register");
}

