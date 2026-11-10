import MaxWidthWrapper from "@/app/components/MaxWidthWrapper";
import Footer from "@/app/components/Footer";
import { BookOpen, CheckCircle2, AlertCircle, Scale, CreditCard } from "lucide-react";

export const metadata = {
  title: "Terms of Service | QuillDocs",
  description: "Read the terms and conditions for using QuillDocs.",
};

export default function TermsOfServicePage() {
  const lastUpdated = "November 10, 2026";

  return (
    <>
      <main className="min-h-[calc(100vh-3.5rem)] py-12 md:py-20 bg-gradient-to-b from-white via-zinc-50/50 to-white">
        <MaxWidthWrapper className="max-w-4xl">
          {/* Header */}
          <div className="mb-12 text-center md:text-left">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 mb-4">
              <Scale className="h-3.5 w-3.5" />
              <span>User Agreement</span>
            </div>
            <h1 className="text-4xl sm:text-5xl font-extrabold text-zinc-900 tracking-tight">
              Terms of Service
            </h1>
            <p className="mt-3 text-sm text-zinc-500">
              Last updated on <span className="font-medium text-zinc-700">{lastUpdated}</span>
            </p>
          </div>

          {/* Terms Content */}
          <div className="space-y-10 text-zinc-700 leading-relaxed text-base">
            <section className="bg-white p-6 sm:p-8 rounded-xl border border-zinc-200 shadow-sm space-y-4">
              <div className="flex items-center gap-2.5 text-zinc-900 font-bold text-lg">
                <BookOpen className="h-5 w-5 text-blue-600 shrink-0" />
                <h2>1. Acceptance of Terms</h2>
              </div>
              <p>
                By creating an account, uploading files, or interacting with <strong>QuillDocs</strong> (&quot;the Service&quot;), you agree to be bound by these Terms of Service. If you do not agree to these terms, please refrain from using the Service.
              </p>
            </section>

            <section className="bg-white p-6 sm:p-8 rounded-xl border border-zinc-200 shadow-sm space-y-4">
              <div className="flex items-center gap-2.5 text-zinc-900 font-bold text-lg">
                <CheckCircle2 className="h-5 w-5 text-blue-600 shrink-0" />
                <h2>2. User Accounts & Responsibilities</h2>
              </div>
              <p>
                You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account. You agree not to upload:
              </p>
              <ul className="list-disc pl-5 space-y-2 text-zinc-600">
                <li>Content that violates copyright, trademark, or intellectual property rights.</li>
                <li>Malicious software, infected documents, or files designed to disrupt the platform.</li>
                <li>Harmful, abusive, or unlawful content in breach of applicable regulations.</li>
              </ul>
            </section>

            <section className="bg-white p-6 sm:p-8 rounded-xl border border-zinc-200 shadow-sm space-y-4">
              <div className="flex items-center gap-2.5 text-zinc-900 font-bold text-lg">
                <CreditCard className="h-5 w-5 text-blue-600 shrink-0" />
                <h2>3. Subscription Plans, Billing & Refunds</h2>
              </div>
              <p>
                QuillDocs offers both Free and Paid (Pro) plans. Paid subscriptions are billed in advance on a recurring monthly or annual basis via Stripe.
              </p>
              <ul className="list-disc pl-5 space-y-2 text-zinc-600">
                <li>
                  <strong>Cancellation:</strong> You may cancel your Pro subscription at any time through the Billing Portal in your account. You will retain Pro access until the end of the current billing cycle.
                </li>
                <li>
                  <strong>Plan Quotas:</strong> Each plan features documented limits on file size, page counts, and total files. Attempting to artificially bypass quotas is a violation of these terms.
                </li>
              </ul>
            </section>

            <section className="bg-white p-6 sm:p-8 rounded-xl border border-zinc-200 shadow-sm space-y-4">
              <div className="flex items-center gap-2.5 text-zinc-900 font-bold text-lg">
                <AlertCircle className="h-5 w-5 text-blue-600 shrink-0" />
                <h2>4. AI-Generated Output Disclaimer</h2>
              </div>
              <p>
                QuillDocs uses modern artificial intelligence to retrieve context and summarize your documents. While QuillDocs cites specific document pages, AI responses should be verified for academic, medical, or legal applications. QuillDocs does not warrant that AI answers are 100% error-free.
              </p>
            </section>

            <section className="bg-white p-6 sm:p-8 rounded-xl border border-zinc-200 shadow-sm space-y-4">
              <div className="flex items-center gap-2.5 text-zinc-900 font-bold text-lg">
                <Scale className="h-5 w-5 text-blue-600 shrink-0" />
                <h2>5. Contact Information</h2>
              </div>
              <p>
                For legal inquiries, dispute resolution, or billing support, please reach out via our{" "}
                <a href="/contact" className="text-blue-600 font-semibold underline underline-offset-2 hover:text-blue-700">
                  Contact Page
                </a>{" "}
                or email{" "}
                <a href="mailto:support@quilldocs.com" className="text-blue-600 font-semibold underline underline-offset-2 hover:text-blue-700">
                  support@quilldocs.com
                </a>.
              </p>
            </section>
          </div>
        </MaxWidthWrapper>
      </main>
      <Footer />
    </>
  );
}

