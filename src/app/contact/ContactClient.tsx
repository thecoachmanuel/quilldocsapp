"use client";

import { useState } from "react";
import { Mail, Phone, MapPin, Clock, Send, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";

interface ContactInfoData {
  email: string;
  phone: string;
  address: string;
  hours: string;
}

interface ContactClientProps {
  initialContactInfo: ContactInfoData;
  prefillEmail?: string;
  prefillName?: string;
}

export default function ContactClient({
  initialContactInfo,
  prefillEmail = "",
  prefillName = "",
}: ContactClientProps) {
  const { toast } = useToast();
  const [name, setName] = useState(prefillName);
  const [email, setEmail] = useState(prefillEmail);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim() || !email.trim() || !message.trim()) {
      toast({
        title: "Please complete all required fields",
        description: "Name, email, and message are required.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          subject: subject.trim() || "General Inquiry",
          message: message.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to submit message");
      }

      setIsSuccess(true);
      toast({
        title: "Message Sent Successfully!",
        description: "Thank you for reaching out. Our support team will respond shortly.",
      });

      // Clear fields
      setMessage("");
      setSubject("");
    } catch (err: any) {
      toast({
        title: "Submission Failed",
        description: err.message || "Something went wrong. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:gap-12">
      {/* Left Column: Direct Contact Info (Editable by Admin) */}
      <div className="lg:col-span-5 space-y-6">
        <div className="bg-white p-6 sm:p-8 rounded-xl border border-zinc-200 shadow-sm space-y-6">
          <div>
            <h2 className="text-xl font-bold text-zinc-900 tracking-tight">
              Get in Touch
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              Have questions about QuillDocs, custom quotas, or enterprise subscriptions? Reach out to our team directly.
            </p>
          </div>

          <div className="space-y-5 text-sm">
            <div className="flex items-start gap-3.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600 border border-blue-200 shrink-0">
                <Mail className="h-4 w-4" />
              </div>
              <div>
                <p className="font-semibold text-zinc-900">Email Support</p>
                <a
                  href={`mailto:${initialContactInfo.email}`}
                  className="text-blue-600 hover:text-blue-700 underline underline-offset-2 break-all"
                >
                  {initialContactInfo.email}
                </a>
              </div>
            </div>

            <div className="flex items-start gap-3.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600 border border-blue-200 shrink-0">
                <Phone className="h-4 w-4" />
              </div>
              <div>
                <p className="font-semibold text-zinc-900">Phone</p>
                <a
                  href={`tel:${initialContactInfo.phone.replace(/[^0-9+]/g, "")}`}
                  className="text-zinc-600 hover:text-zinc-900"
                >
                  {initialContactInfo.phone}
                </a>
              </div>
            </div>

            <div className="flex items-start gap-3.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600 border border-blue-200 shrink-0">
                <MapPin className="h-4 w-4" />
              </div>
              <div>
                <p className="font-semibold text-zinc-900">Office Location</p>
                <p className="text-zinc-600 leading-relaxed">
                  {initialContactInfo.address}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600 border border-blue-200 shrink-0">
                <Clock className="h-4 w-4" />
              </div>
              <div>
                <p className="font-semibold text-zinc-900">Operating Hours</p>
                <p className="text-zinc-600">
                  {initialContactInfo.hours}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Rapid Assistance Banner */}
        <div className="rounded-xl bg-blue-600 p-6 text-white shadow-sm">
          <h3 className="font-semibold text-base">Dedicated Account Assistance</h3>
          <p className="mt-1 text-xs sm:text-sm text-blue-100 leading-relaxed">
            Pro and Enterprise members receive priority document parsing and 24-hour turnaround SLA on all inquiries.
          </p>
        </div>
      </div>

      {/* Right Column: Contact Message Form */}
      <div className="lg:col-span-7">
        <div className="bg-white p-6 sm:p-8 rounded-xl border border-zinc-200 shadow-sm">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-zinc-900 tracking-tight">
              Send us a Message
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              Fill out the form below and an administrator will review your message promptly.
            </p>
          </div>

          {isSuccess ? (
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-6 text-center space-y-3">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-semibold text-emerald-900">
                Message Received!
              </h3>
              <p className="text-sm text-emerald-700 max-w-md mx-auto">
                Thank you for contacting QuillDocs. A copy of your inquiry has been logged for our administrators.
              </p>
              <Button
                variant="outline"
                className="mt-4 border-emerald-300 text-emerald-800 hover:bg-emerald-100"
                onClick={() => setIsSuccess(false)}
              >
                Send Another Message
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-700">
                    Your Name <span className="text-red-500">*</span>
                  </label>
                  <Input
                    required
                    placeholder="e.g. Jane Doe"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="h-10 text-sm"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-700">
                    Email Address <span className="text-red-500">*</span>
                  </label>
                  <Input
                    required
                    type="email"
                    placeholder="jane@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-10 text-sm"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-700">
                  Subject / Topic
                </label>
                <Input
                  placeholder="e.g. Question about Pro Plan / Feature Request"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="h-10 text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-700">
                  Message <span className="text-red-500">*</span>
                </label>
                <Textarea
                  required
                  rows={5}
                  placeholder="Please describe how we can assist you..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="resize-none text-sm"
                />
              </div>

              <Button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold h-11 transition-all"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending message...
                  </>
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" />
                    Submit Inquiry
                  </>
                )}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

