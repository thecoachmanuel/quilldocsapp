import { cn, constructMetadata } from "@/lib/utils";
import "./globals.css";
import "katex/dist/katex.min.css";
import type { Viewport } from "next";
import Navbar from "./components/Navbar";
import Providers from "./components/Providers";
import "react-loading-skeleton/dist/skeleton.css";
import { Toaster } from "@/components/ui/toaster";
import "simplebar-react/dist/simplebar.min.css";

export const metadata = constructMetadata();

export const viewport: Viewport = {
  themeColor: "#FFF",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.addEventListener('error', function(e) {
                if (e.message && (e.message.indexOf('ChunkLoadError') !== -1 || e.message.indexOf('Loading chunk') !== -1)) {
                  window.location.reload();
                }
              });
            `,
          }}
        />
      </head>
      <Providers>
        <body className={cn("min-h-screen font-sans antialiased grainy")}>
          <Toaster />
          <Navbar />
          {children}
        </body>
      </Providers>
    </html>
  );
}
