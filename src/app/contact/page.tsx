import MaxWidthWrapper from "@/app/components/MaxWidthWrapper";
import Footer from "@/app/components/Footer";
import ContactClient from "./ContactClient";
import { db, DEFAULT_CONTACT_INFO } from "@/db";
import { getKindeServerSession } from "@/lib/kinde";
import { MessageSquareQuote } from "lucide-react";

export const metadata = {
  title: "Contact & Support | QuillDocs",
  description: "Get in touch with the QuillDocs team for support, questions, and inquiries.",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ContactPage() {
  const { getUser } = getKindeServerSession();
  const user = await getUser();

  let contactInfo = DEFAULT_CONTACT_INFO;
  try {
    const fromDb = await db.contactInfo.findFirst();
    if (fromDb && fromDb.email) {
      contactInfo = fromDb;
    }
  } catch (error) {
    console.error("Failed to load contact info from db:", error);
  }

  const prefillEmail = user?.email || "";
  const prefillName =
    user?.given_name || user?.family_name
      ? `${user.given_name || ""} ${user.family_name || ""}`.trim()
      : "";

  return (
    <>
      <main className="min-h-[calc(100vh-3.5rem)] py-12 md:py-20 bg-gradient-to-b from-white via-zinc-50/50 to-white">
        <MaxWidthWrapper>
          {/* Header */}
          <div className="mb-12 text-center">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 mb-4">
              <MessageSquareQuote className="h-3.5 w-3.5" />
              <span>We&apos;re Here to Help</span>
            </div>
            <h1 className="text-4xl sm:text-5xl font-extrabold text-zinc-900 tracking-tight">
              Contact & Support
            </h1>
            <p className="mt-3 text-base text-zinc-600 max-w-xl mx-auto">
              Need assistance with document synthesis, subscription plans, or have a question? Drop us a note below.
            </p>
          </div>

          <ContactClient
            initialContactInfo={contactInfo}
            prefillEmail={prefillEmail}
            prefillName={prefillName}
          />
        </MaxWidthWrapper>
      </main>
      <Footer />
    </>
  );
}

