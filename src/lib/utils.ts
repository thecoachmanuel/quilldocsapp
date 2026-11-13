import { type ClassValue, clsx } from "clsx";
import { Metadata } from "next";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function absoluteUrl(path: string) {
  if (typeof window !== "undefined") return path;
  const configuredUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.KINDE_SITE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : undefined) ||
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : undefined);

  if (configuredUrl) {
    const cleanBase = configuredUrl
      .replace(/^['"]|['"]$/g, "")
      .trim()
      .replace(/\/+$/, "");
    return `${cleanBase}${path}`;
  }
  return `http://localhost:${process.env.PORT ?? 3000}${path}`;
}

export function constructMetadata({
  title = "QuillDocs - Chat with your documents in seconds",
  description = "QuillDocs allows you to have intelligent conversations with your PDF, Word, and PowerPoint documents with citations.",
  image = "/thumbnail.png",
  icons = "/favicon.ico",
  noIndex = false,
}: {
  title?: string;
  description?: string;
  image?: string;
  icons?: string;
  noIndex?: boolean;
} = {}): Metadata {
  return {
    title,
    description,
    applicationName: "QuillDocs",
    manifest: "/manifest.webmanifest",
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: "QuillDocs",
    },
    formatDetection: {
      telephone: false,
    },
    openGraph: {
      title,
      description,
      images: [
        {
          url: image,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
    icons:
      icons !== "/favicon.ico"
        ? icons
        : {
            icon: [
              { url: "/favicon.ico" },
              {
                url: "/icons/icon-192x192.png",
                sizes: "192x192",
                type: "image/png",
              },
              {
                url: "/icons/icon-512x512.png",
                sizes: "512x512",
                type: "image/png",
              },
            ],
            apple: [
              {
                url: "/apple-touch-icon.png",
                sizes: "180x180",
                type: "image/png",
              },
            ],
            shortcut: ["/favicon.ico"],
          },
    metadataBase: new URL("https://quilldocs.com"),
    ...(noIndex && {
      robots: {
        index: false,
        follow: false,
      },
    }),
  };
}
