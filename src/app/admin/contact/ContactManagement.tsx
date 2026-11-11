"use client";

import { useState, useEffect, useMemo } from "react";
import { format } from "date-fns";
import {
  Mail,
  Phone,
  MapPin,
  Clock,
  Search,
  CheckCircle2,
  Trash2,
  Reply,
  RefreshCw,
  Loader2,
  Inbox,
  Check,
  Eye,
  Settings,
  AlertCircle,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import Skeleton from "react-loading-skeleton";
import {
  AdminFilterPills,
  AdminStatCard,
  AdminTableControls,
  ORANGE_BTN_CLASS,
  ORANGE_CARD_CLASS,
  ORANGE_CARD_HEADER_CLASS,
  ORANGE_OUTLINE_BTN_CLASS,
  ORANGE_TABLE_BODY_ROW_CLASS,
  ORANGE_TABLE_HEAD_ROW_CLASS,
} from "../AdminComponents";

interface ContactMessageItem {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  status: "UNREAD" | "READ" | "RESOLVED";
  createdAt: string;
}

interface ContactInfoData {
  email: string;
  phone: string;
  address: string;
  hours: string;
}

export default function ContactManagement() {
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<"inquiries" | "info">("inquiries");
  const [messages, setMessages] = useState<ContactMessageItem[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "UNREAD" | "READ" | "RESOLVED">("ALL");

  // Selected message for details view
  const [selectedMessage, setSelectedMessage] = useState<ContactMessageItem | null>(null);

  // Contact Info state
  const [contactInfo, setContactInfo] = useState<ContactInfoData>({
    email: "support@quilldocs.com",
    phone: "+2347038587375",
    address: "Lagos, Nigeria",
    hours: "Monday - Friday: 9:00 AM - 6:00 PM (UTC+1)",
  });
  const [isLoadingInfo, setIsLoadingInfo] = useState(true);
  const [isSavingInfo, setIsSavingInfo] = useState(false);

  // Load Messages
  const fetchMessages = async (silent = false) => {
    if (!silent) setIsLoadingMessages(true);
    else setIsRefreshing(true);
    try {
      const res = await fetch("/api/admin/contact-messages");
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
      }
    } catch (err) {
      console.error("Failed to load contact messages:", err);
    } finally {
      setIsLoadingMessages(false);
      setIsRefreshing(false);
    }
  };

  // Load Contact Info
  const fetchContactInfo = async () => {
    setIsLoadingInfo(true);
    try {
      const res = await fetch("/api/admin/contact-info");
      if (res.ok) {
        const data = await res.json();
        if (data.contactInfo) {
          setContactInfo({
            email: data.contactInfo.email || "",
            phone: data.contactInfo.phone || "",
            address: data.contactInfo.address || "",
            hours: data.contactInfo.hours || "",
          });
        }
      }
    } catch (err) {
      console.error("Failed to load contact info:", err);
    } finally {
      setIsLoadingInfo(false);
    }
  };

  useEffect(() => {
    fetchMessages();
    fetchContactInfo();
  }, []);

  // Update Status
  const handleUpdateStatus = async (id: string, newStatus: "UNREAD" | "READ" | "RESOLVED") => {
    try {
      const res = await fetch("/api/admin/contact-messages", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: newStatus }),
      });

      if (!res.ok) throw new Error("Failed to update status");

      setMessages((prev) =>
        prev.map((m) => (m.id === id ? { ...m, status: newStatus } : m))
      );

      if (selectedMessage && selectedMessage.id === id) {
        setSelectedMessage((prev) => (prev ? { ...prev, status: newStatus } : null));
      }

      toast({
        title: "Status Updated",
        description: `Message marked as ${newStatus.toLowerCase()}.`,
      });
    } catch (err: any) {
      toast({
        title: "Update Failed",
        description: err.message,
        variant: "destructive",
      });
    }
  };

  // Delete Message
  const handleDeleteMessage = async (id: string) => {
    if (!confirm("Are you sure you want to permanently delete this message?")) return;

    try {
      const res = await fetch(`/api/admin/contact-messages?id=${id}`, {
        method: "DELETE",
      });

      if (!res.ok) throw new Error("Failed to delete message");

      setMessages((prev) => prev.filter((m) => m.id !== id));
      if (selectedMessage?.id === id) {
        setSelectedMessage(null);
      }

      toast({
        title: "Message Deleted",
        description: "The inquiry has been permanently removed.",
      });
    } catch (err: any) {
      toast({
        title: "Delete Failed",
        description: err.message,
        variant: "destructive",
      });
    }
  };

  // Save Contact Info
  const handleSaveContactInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingInfo(true);
    try {
      const res = await fetch("/api/admin/contact-info", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(contactInfo),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update contact info");

      toast({
        title: "Contact Info Updated!",
        description: "Public contact details on the Contact page have been saved successfully.",
      });
    } catch (err: any) {
      toast({
        title: "Save Failed",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setIsSavingInfo(false);
    }
  };

  // Filtered Messages
  const filteredMessages = useMemo(() => {
    return messages.filter((m) => {
      if (statusFilter !== "ALL" && m.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = m.name.toLowerCase().includes(q);
        const matchEmail = m.email.toLowerCase().includes(q);
        const matchSubject = (m.subject || "").toLowerCase().includes(q);
        const matchMsg = m.message.toLowerCase().includes(q);
        if (!matchName && !matchEmail && !matchSubject && !matchMsg) return false;
      }
      return true;
    });
  }, [messages, statusFilter, searchQuery]);

  const stats = useMemo(() => {
    return {
      total: messages.length,
      unread: messages.filter((m) => m.status === "UNREAD").length,
      resolved: messages.filter((m) => m.status === "RESOLVED").length,
    };
  }, [messages]);

  return (
    <div className="space-y-6">
      {/* Top Banner & Tab Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#141010]">
            Contact &amp; Support Center
          </h1>
          <p className="mt-0.5 text-xs sm:text-sm text-zinc-500">
            Review user inquiries and manage official public contact
            information.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-full bg-white p-1 border border-[#ebebeb]">
            <button
              type="button"
              onClick={() => setActiveTab("inquiries")}
              className={cn(
                "flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold transition-all",
                activeTab === "inquiries"
                  ? "bg-gradient-to-b from-[#FF6F43] to-[#FE1B03] text-white shadow-sm"
                  : "text-zinc-600 hover:text-[#141010]"
              )}
            >
              <Inbox className="h-3.5 w-3.5" />
              <span>Inquiries</span>
              {stats.unread > 0 && (
                <span
                  className={cn(
                    "ml-0.5 rounded-full px-1.5 py-0.2 text-[10px]",
                    activeTab === "inquiries"
                      ? "bg-white text-[#FE1B03]"
                      : "bg-[#FE1B03] text-white"
                  )}
                >
                  {stats.unread}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("info")}
              className={cn(
                "flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold transition-all",
                activeTab === "info"
                  ? "bg-gradient-to-b from-[#FF6F43] to-[#FE1B03] text-white shadow-sm"
                  : "text-zinc-600 hover:text-[#141010]"
              )}
            >
              <Settings className="h-3.5 w-3.5" />
              <span>Edit Contact Info</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => fetchMessages(true)}
            disabled={isRefreshing}
            className={cn(ORANGE_OUTLINE_BTN_CLASS, "h-9 px-3.5")}
            title="Refresh Inquiries"
          >
            <RefreshCw
              className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")}
            />
            Refresh
          </button>
        </div>
      </div>

      {activeTab === "inquiries" ? (
        <>
          {/* KPI Stats Row (.card-statistic-4) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <AdminStatCard
              title="Total Inquiries"
              value={stats.total}
              subtitle="All contact submissions"
              icon={Mail}
            />

            <AdminStatCard
              title="Unread Messages"
              value={stats.unread}
              valueClassName={stats.unread > 0 ? "text-[#FE1B03]" : undefined}
              subtitle="Awaiting admin review"
              icon={AlertCircle}
            />

            <AdminStatCard
              title="Resolved"
              value={stats.resolved}
              valueClassName="text-emerald-600"
              subtitle="Completed support inquiries"
              icon={CheckCircle2}
            />
          </div>

          {/* Inquiries Table Card */}
          <div className={cn(ORANGE_CARD_CLASS, "overflow-hidden")}>
            <div className={ORANGE_CARD_HEADER_CLASS}>
              <AdminFilterPills
                value={statusFilter}
                onChange={setStatusFilter}
                options={[
                  { label: "All Inquiries", value: "ALL", count: stats.total },
                  { label: "Unread", value: "UNREAD", count: stats.unread },
                  { label: "Read", value: "READ" },
                  {
                    label: "Resolved",
                    value: "RESOLVED",
                    count: stats.resolved,
                  },
                ]}
              />
            </div>

            <AdminTableControls
              showingLabel={`Showing ${filteredMessages.length} of ${stats.total} messages`}
              searchPlaceholder="Search name, email, subject, or message..."
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
            />

            {isLoadingMessages ? (
              <div className="p-6 space-y-4">
                <Skeleton height={40} />
                <Skeleton height={40} />
                <Skeleton height={40} />
              </div>
            ) : filteredMessages.length === 0 ? (
              <div className="py-16 text-center text-zinc-500">
                <Mail className="h-10 w-10 text-zinc-300 mx-auto mb-3" />
                <h3 className="text-base font-semibold text-zinc-800">
                  No contact messages found
                </h3>
                <p className="text-xs text-zinc-500 mt-1 max-w-sm mx-auto">
                  {searchQuery || statusFilter !== "ALL"
                    ? "Try adjusting your search query or status filter."
                    : "When users submit inquiries through the contact page, they will appear here."}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className={ORANGE_TABLE_HEAD_ROW_CLASS}>
                      <th className="px-5 py-3.5">Sender</th>
                      <th className="px-4 py-3.5">Subject</th>
                      <th className="px-4 py-3.5 hidden md:table-cell">
                        Message Snippet
                      </th>
                      <th className="px-4 py-3.5">Date</th>
                      <th className="px-4 py-3.5">Status</th>
                      <th className="px-5 py-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMessages.map((msg) => {
                      const isUnread = msg.status === "UNREAD";
                      const isResolved = msg.status === "RESOLVED";

                      return (
                        <tr
                          key={msg.id}
                          className={cn(
                            ORANGE_TABLE_BODY_ROW_CLASS,
                            isUnread && "font-medium bg-[#fff8f6]/70"
                          )}
                        >
                          <td className="px-5 py-3.5 whitespace-nowrap">
                            <div className="font-semibold text-[#141010]">
                              {msg.name}
                            </div>
                            <a
                              href={`mailto:${msg.email}?subject=Re: ${encodeURIComponent(msg.subject || "QuillDocs Inquiry")}`}
                              className="text-xs text-[#FE1B03] hover:underline"
                            >
                              {msg.email}
                            </a>
                          </td>

                          <td className="px-4 py-3.5 whitespace-nowrap">
                            <span className="font-medium text-[#141010] truncate max-w-[180px] sm:max-w-xs block">
                              {msg.subject || "General Inquiry"}
                            </span>
                          </td>

                          <td className="px-4 py-3.5 hidden md:table-cell text-zinc-500 max-w-xs truncate">
                            {msg.message}
                          </td>

                          <td className="px-4 py-3.5 whitespace-nowrap text-xs text-zinc-500">
                            {format(new Date(msg.createdAt), "MMM d, yyyy")}
                          </td>

                          <td className="px-4 py-3.5 whitespace-nowrap">
                            <span
                              className={cn(
                                "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border",
                                isUnread
                                  ? "bg-[#fff3ef] text-[#FE1B03] border-[#ffd2c4]"
                                  : isResolved
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                  : "bg-zinc-100 text-zinc-700 border-zinc-200"
                              )}
                            >
                              {msg.status}
                            </span>
                          </td>

                          <td className="px-5 py-3.5 whitespace-nowrap text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* View Details */}
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedMessage(msg);
                                  if (msg.status === "UNREAD") {
                                    handleUpdateStatus(msg.id, "READ");
                                  }
                                }}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#ebebeb] bg-white text-zinc-600 hover:border-[#FF6F43] hover:text-[#FE1B03] transition-colors"
                                title="View Full Message"
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </button>

                              {/* Quick Reply Email */}
                              <a
                                href={`mailto:${msg.email}?subject=Re: ${encodeURIComponent(msg.subject || "QuillDocs Inquiry")}`}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#ebebeb] bg-white text-[#FE1B03] hover:bg-[#fff5f2] transition-colors"
                                title="Reply via Email"
                              >
                                <Reply className="h-3.5 w-3.5" />
                              </a>

                              {/* Toggle Resolved */}
                              <button
                                type="button"
                                onClick={() =>
                                  handleUpdateStatus(
                                    msg.id,
                                    isResolved ? "READ" : "RESOLVED"
                                  )
                                }
                                className={cn(
                                  "inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#ebebeb] bg-white transition-colors",
                                  isResolved
                                    ? "text-emerald-600 border-emerald-200 bg-emerald-50"
                                    : "text-zinc-400 hover:text-emerald-600 hover:border-emerald-200"
                                )}
                                title={
                                  isResolved
                                    ? "Mark as Open"
                                    : "Mark as Resolved"
                                }
                              >
                                <Check className="h-3.5 w-3.5" />
                              </button>

                              {/* Delete */}
                              <button
                                type="button"
                                onClick={() => handleDeleteMessage(msg.id)}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#ebebeb] bg-white text-red-500 hover:text-red-700 hover:bg-red-50 hover:border-red-200 transition-colors"
                                title="Delete Inquiry"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : (
        /* Edit Contact Information Tab */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7">
            <div className={cn(ORANGE_CARD_CLASS, "p-6 sm:p-8 space-y-6")}>
              <div>
                <h2 className="text-lg font-bold text-[#141010] tracking-tight">
                  Public Contact Settings
                </h2>
                <p className="mt-1 text-sm text-zinc-500">
                  Update the official contact information displayed on the
                  public Contact page and in the footer.
                </p>
              </div>

              {isLoadingInfo ? (
                <div className="space-y-4">
                  <Skeleton height={40} />
                  <Skeleton height={40} />
                  <Skeleton height={40} />
                </div>
              ) : (
                <form onSubmit={handleSaveContactInfo} className="space-y-5">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-zinc-700 flex items-center gap-1.5">
                      <Mail className="h-3.5 w-3.5 text-[#FE1B03]" />
                      Support Email
                    </label>
                    <Input
                      type="email"
                      required
                      value={contactInfo.email}
                      onChange={(e) =>
                        setContactInfo((prev) => ({
                          ...prev,
                          email: e.target.value,
                        }))
                      }
                      placeholder="support@quilldocs.com"
                      className="h-10 text-sm"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-zinc-700 flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5 text-[#FE1B03]" />
                      Support Phone Number
                    </label>
                    <Input
                      required
                      value={contactInfo.phone}
                      onChange={(e) =>
                        setContactInfo((prev) => ({
                          ...prev,
                          phone: e.target.value,
                        }))
                      }
                      placeholder="+2347038587375"
                      className="h-10 text-sm"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-zinc-700 flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 text-[#FE1B03]" />
                      Office / Mailing Address
                    </label>
                    <Input
                      required
                      value={contactInfo.address}
                      onChange={(e) =>
                        setContactInfo((prev) => ({
                          ...prev,
                          address: e.target.value,
                        }))
                      }
                      placeholder="Lagos, Nigeria"
                      className="h-10 text-sm"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-zinc-700 flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-[#FE1B03]" />
                      Support Hours
                    </label>
                    <Input
                      required
                      value={contactInfo.hours}
                      onChange={(e) =>
                        setContactInfo((prev) => ({
                          ...prev,
                          hours: e.target.value,
                        }))
                      }
                      placeholder="Monday - Friday: 9:00 AM - 6:00 PM (UTC+1)"
                      className="h-10 text-sm"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isSavingInfo}
                    className={cn(ORANGE_BTN_CLASS, "w-full h-10")}
                  >
                    {isSavingInfo ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving contact details...
                      </>
                    ) : (
                      "Save Contact Information"
                    )}
                  </button>
                </form>
              )}
            </div>
          </div>

          {/* Live Preview Card */}
          <div className="lg:col-span-5 space-y-4">
            <div className={cn(ORANGE_CARD_CLASS, "p-6 space-y-4")}>
              <div className="flex items-center justify-between border-b border-[#ebebeb] pb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                  Live Preview on Contact Page
                </span>
                <a
                  href="/contact"
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-[#FE1B03] font-semibold hover:underline flex items-center gap-1"
                >
                  View Page <ExternalLink className="h-3 w-3" />
                </a>
              </div>

              <div className="space-y-4 text-sm">
                <div>
                  <p className="text-xs text-zinc-400">Email</p>
                  <p className="font-semibold text-[#FE1B03]">{contactInfo.email}</p>
                </div>
                <div>
                  <p className="text-xs text-zinc-400">Phone</p>
                  <p className="font-medium text-zinc-800">{contactInfo.phone}</p>
                </div>
                <div>
                  <p className="text-xs text-zinc-400">Office</p>
                  <p className="font-medium text-zinc-800 leading-snug">{contactInfo.address}</p>
                </div>
                <div>
                  <p className="text-xs text-zinc-400">Hours</p>
                  <p className="font-medium text-zinc-800">{contactInfo.hours}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Message Detail Modal */}
      {selectedMessage && (
        <Dialog open={!!selectedMessage} onOpenChange={() => setSelectedMessage(null)}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold text-zinc-900">
                Inquiry Details
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-3 text-xs bg-zinc-50 p-3.5 rounded-lg border border-zinc-200">
                <div>
                  <span className="text-zinc-500">From:</span>
                  <p className="font-semibold text-zinc-900">{selectedMessage.name}</p>
                  <a
                    href={`mailto:${selectedMessage.email}`}
                    className="text-blue-600 hover:underline"
                  >
                    {selectedMessage.email}
                  </a>
                </div>

                <div>
                  <span className="text-zinc-500">Received On:</span>
                  <p className="font-semibold text-zinc-900">
                    {format(new Date(selectedMessage.createdAt), "MMMM d, yyyy 'at' h:mm a")}
                  </p>
                  <span
                    className={cn(
                      "inline-flex items-center px-2 py-0.5 mt-1 rounded-full text-[11px] font-semibold border",
                      selectedMessage.status === "RESOLVED"
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : "bg-blue-50 text-blue-700 border-blue-200"
                    )}
                  >
                    {selectedMessage.status}
                  </span>
                </div>
              </div>

              <div>
                <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                  Subject
                </span>
                <p className="font-bold text-zinc-900 text-base mt-0.5">
                  {selectedMessage.subject || "General Inquiry"}
                </p>
              </div>

              <div>
                <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                  Message Content
                </span>
                <div className="mt-1 p-4 rounded-lg bg-zinc-50 border border-zinc-200 text-zinc-800 text-sm whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto">
                  {selectedMessage.message}
                </div>
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-between pt-3 border-t border-zinc-200">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    handleUpdateStatus(
                      selectedMessage.id,
                      selectedMessage.status === "RESOLVED" ? "READ" : "RESOLVED"
                    )
                  }
                  className="gap-1.5"
                >
                  <Check className="h-4 w-4" />
                  {selectedMessage.status === "RESOLVED" ? "Mark as Open" : "Mark as Resolved"}
                </Button>

                <div className="flex items-center gap-2">
                  <a
                    href={`mailto:${selectedMessage.email}?subject=Re: ${encodeURIComponent(selectedMessage.subject || "QuillDocs Inquiry")}`}
                    className={ORANGE_BTN_CLASS}
                  >
                    <Reply className="h-3.5 w-3.5" />
                    Reply via Email
                  </a>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

