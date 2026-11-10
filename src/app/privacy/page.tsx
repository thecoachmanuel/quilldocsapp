import MaxWidthWrapper from "@/app/components/MaxWidthWrapper";
import Footer from "@/app/components/Footer";
import { ShieldCheck, Lock, Eye, FileText, Database, RefreshCw } from "lucide-react";

export const metadata = {
  title: "Privacy Policy | QuillDocs",
  description: "Learn how QuillDocs protects your personal data, files, and conversations.",
};

export default function PrivacyPolicyPage() {
  const lastUpdated = "November 10, 2026";

  return (
    <>
      <main className="min-h-[calc(100vh-3.5rem)] py-12 md:py-20 bg-gradient-to-b from-white via-zinc-50/50 to-white">
        <MaxWidthWrapper className="max-w-4xl">
          {/* Header */}
          <div className="mb-12 text-center md:text-left">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 mb-4">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Your Privacy Matters</span>
            </div>
            <h1 className="text-4xl sm:text-5xl font-extrabold text-zinc-900 tracking-tight">
              Privacy Policy
            </h1>
            <p className="mt-3 text-sm text-zinc-500">
              Last updated on <span className="font-medium text-zinc-700">{lastUpdated}</span>
            </p>
          </div>

          {/* Policy Body */}
          <div className="space-y-10 text-zinc-700 leading-relaxed text-base">
            <section className="bg-white p-6 sm:p-8 rounded-xl border border-zinc-200 shadow-sm space-y-4">
              <div className="flex items-center gap-2.5 text-zinc-900 font-bold text-lg">
                <Lock className="h-5 w-5 text-blue-600 shrink-0" />
                <h2>1. Information We Collect</h2>
              </div>
              <p>
                When you create an account with <strong>QuillDocs</strong>, we receive your basic account details through our secure authentication partner (Kinde), including your name and email address.
              </p>
              <p>
                When you upload files (PDFs, Word documents, PowerPoint slides), we temporarily store and process the text content to generate mathematical vector embeddings for our semantic search and citation index.
              </p>
            </section>

            <section className="bg-white p-6 sm:p-8 rounded-xl border border-zinc-200 shadow-sm space-y-4">
              <div className="flex items-center gap-2.5 text-zinc-900 font-bold text-lg">
                <Database className="h-5 w-5 text-blue-600 shrink-0" />
                <h2>2. How We Use and Protect Your Documents</h2>
              </div>
              <p>
                Your uploaded documents and messages are strictly private to your account. We never sell, rent, or monetize your documents or query data.
              </p>
              <ul className="list-disc pl-5 space-y-2 text-zinc-600">
                <li>
                  <strong>No Training on Your Data:</strong> Your uploaded documents and chat prompts are never used to train generalized foundation AI models.
                </li>
                <li>
                  <strong>Isolated Vector Indexing:</strong> Embeddings generated for your documents are tagged with unique file and user identifiers and stored in isolated Pinecone vector namespaces.
                </li>
                <li>
                  <strong>Encrypted Transmission:</strong> All data is transmitted using modern TLS 1.3 encryption in transit and AES-256 encryption at rest.
                </li>
              </ul>
            </section>

            <section className="bg-white p-6 sm:p-8 rounded-xl border border-zinc-200 shadow-sm space-y-4">
              <div className="flex items-center gap-2.5 text-zinc-900 font-bold text-lg">
                <Eye className="h-5 w-5 text-blue-600 shrink-0" />
                <h2>3. Third-Party Service Providers</h2>
              </div>
              <p>
                To provide high-speed parsing, secure billing, and intelligent AI responses, QuillDocs partners with trusted industry-standard infrastructure providers:
              </p>
              <ul className="list-disc pl-5 space-y-2 text-zinc-600">
                <li><strong>Kinde:</strong> Enterprise-grade identity verification and role-based access control.</li>
                <li><strong>Stripe:</strong> PCI-DSS certified payment processing (we never store raw credit card numbers).</li>
                <li><strong>Pinecone:</strong> Managed vector database for real-time document semantic retrieval.</li>
                <li><strong>Cloud AI Inference Providers:</strong> High-performance, SOC 2 compliant inference infrastructure for context synthesis and document analysis.</li>
              </ul>
            </section>

            <section className="bg-white p-6 sm:p-8 rounded-xl border border-zinc-200 shadow-sm space-y-4">
              <div className="flex items-center gap-2.5 text-zinc-900 font-bold text-lg">
                <RefreshCw className="h-5 w-5 text-blue-600 shrink-0" />
                <h2>4. Data Retention & Your Rights</h2>
              </div>
              <p>
                You retain complete ownership over your files. You can delete any uploaded file or message history at any time from your Dashboard. When a document is deleted, all corresponding vector embeddings and chat entries are permanently purged from our databases.
              </p>
            </section>

            <section className="bg-white p-6 sm:p-8 rounded-xl border border-zinc-200 shadow-sm space-y-4">
              <div className="flex items-center gap-2.5 text-zinc-900 font-bold text-lg">
                <FileText className="h-5 w-5 text-blue-600 shrink-0" />
                <h2>5. Contact Our Privacy Team</h2>
              </div>
              <p>
                If you have questions regarding this Privacy Policy or wish to request data export or deletion, please visit our{" "}
                <a href="/contact" className="text-blue-600 font-semibold underline underline-offset-2 hover:text-blue-700">
                  Contact & Support Page
                </a>{" "}
                or email us directly at{" "}
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

