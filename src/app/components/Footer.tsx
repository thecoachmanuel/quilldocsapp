import Link from "next/link";
import MaxWidthWrapper from "./MaxWidthWrapper";

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t border-zinc-200 bg-white/90 backdrop-blur-sm transition-all mt-auto">
      <MaxWidthWrapper className="pt-12 pb-8 md:pt-16 md:pb-10">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-4 lg:gap-12">
          {/* Brand Info */}
          <div className="space-y-4 md:col-span-1">
            <Link href="/" className="flex items-center font-bold text-lg text-zinc-900 tracking-tight">
              <span>Quill<span className="text-blue-600">Docs</span></span>
            </Link>
            <p className="text-sm text-zinc-500 leading-relaxed">
              Intelligent document conversations. Chat with PDFs, Word documents, and presentations with high-precision page-level citations.
            </p>
          </div>

          {/* Product Links */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-900">
              Product
            </h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link
                  href="/dashboard"
                  className="text-zinc-600 hover:text-zinc-900 transition-colors"
                >
                  Dashboard
                </Link>
              </li>
              <li>
                <Link
                  href="/pricing"
                  className="text-zinc-600 hover:text-zinc-900 transition-colors"
                >
                  Pricing & Plans
                </Link>
              </li>
              <li>
                <Link
                  href="/dashboard/multi"
                  className="text-zinc-600 hover:text-zinc-900 transition-colors"
                >
                  Multi-Doc Synthesis
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal Links */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-900">
              Legal
            </h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link
                  href="/privacy"
                  className="text-zinc-600 hover:text-zinc-900 transition-colors"
                >
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link
                  href="/terms"
                  className="text-zinc-600 hover:text-zinc-900 transition-colors"
                >
                  Terms of Service
                </Link>
              </li>
            </ul>
          </div>

          {/* Support & Contact Links */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-900">
              Support
            </h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link
                  href="/contact"
                  className="text-zinc-600 hover:text-zinc-900 transition-colors font-medium text-blue-600 hover:text-blue-700"
                >
                  Contact Us & Support
                </Link>
              </li>
              <li>
                <a
                  href="mailto:support@quilldocs.com"
                  className="text-zinc-600 hover:text-zinc-900 transition-colors"
                >
                  support@quilldocs.com
                </a>
              </li>
              <li>
                <a
                  href="tel:+2347038587375"
                  className="text-zinc-600 hover:text-zinc-900 transition-colors"
                >
                  +2347038587375
                </a>
              </li>
              <li className="text-xs text-zinc-400 pt-1">
                Lagos, Nigeria
              </li>
              <li className="text-xs text-zinc-400">
                Mon - Fri, 9am - 6pm (UTC+1)
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 border-t border-zinc-200/80 pt-6">
          <p className="text-xs text-zinc-400 text-center md:text-left">
            © {currentYear} QuillDocs. All rights reserved.
          </p>
        </div>
      </MaxWidthWrapper>
    </footer>
  );
}

