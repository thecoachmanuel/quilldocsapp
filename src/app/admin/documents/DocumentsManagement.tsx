"use client";

import { useState, useMemo } from "react";
import { trpc } from "@/app/_trpc/client";
import Link from "next/link";
import { format } from "date-fns";
import {
  FileText,
  File,
  Presentation,
  Trash2,
  ExternalLink,
  RefreshCw,
  MessageSquare,
  Loader2,
  CheckCircle2,
  Clock,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
  ORANGE_CARD_CLASS,
  ORANGE_CARD_HEADER_CLASS,
  ORANGE_OUTLINE_BTN_CLASS,
  ORANGE_TABLE_BODY_ROW_CLASS,
  ORANGE_TABLE_HEAD_ROW_CLASS,
} from "../AdminComponents";

export default function DocumentsManagement() {
  const { toast } = useToast();
  const utils = trpc.useContext();

  const {
    data: files,
    isLoading,
    isFetching,
  } = trpc.adminGetFiles.useQuery(undefined, {
    refetchOnMount: "always",
  });

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "ALL" | "SUCCESS" | "PROCESSING" | "FAILED"
  >("ALL");
  const [typeFilter, setTypeFilter] = useState<"ALL" | "PDF" | "DOCX" | "PPTX">(
    "ALL"
  );

  const [deletingFile, setDeletingFile] = useState<any | null>(null);

  const invalidateAll = () => {
    utils.adminGetFiles.invalidate();
    utils.adminGetOverview.invalidate();
    utils.getUserFiles.invalidate();
  };

  const updateStatusMutation = trpc.adminUpdateFileStatus.useMutation({
    onSuccess: (updated) => {
      toast({
        title: "Document status updated",
        description: `${updated.name} is now marked as ${updated.uploadStatus}.`,
      });
      invalidateAll();
    },
    onError: (err) => {
      toast({
        title: "Could not update status",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const deleteFileMutation = trpc.adminDeleteFile.useMutation({
    onSuccess: () => {
      toast({
        title: "Document deleted",
        description:
          "Document, chat history, and Pinecone vector embeddings were removed.",
      });
      setDeletingFile(null);
      invalidateAll();
    },
    onError: (err) => {
      toast({
        title: "Failed to delete document",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const summary = useMemo(() => {
    const list = files || [];
    return {
      total: list.length,
      success: list.filter((f: any) => f.uploadStatus === "SUCCESS").length,
      processing: list.filter(
        (f: any) =>
          f.uploadStatus === "PROCESSING" || f.uploadStatus === "PENDING"
      ).length,
      failed: list.filter((f: any) => f.uploadStatus === "FAILED").length,
    };
  }, [files]);

  const filteredFiles = useMemo(() => {
    if (!files) return [];
    return files.filter((f: any) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        (f.name || "").toLowerCase().includes(q) ||
        (f.ownerEmail || "").toLowerCase().includes(q) ||
        (f.id || "").toLowerCase().includes(q);

      const matchesStatus =
        statusFilter === "ALL" || f.uploadStatus === statusFilter;

      const ext = (f.fileType || "").toUpperCase();
      const matchesType =
        typeFilter === "ALL" ||
        (typeFilter === "DOCX" && (ext === "DOCX" || ext === "DOC")) ||
        (typeFilter === "PPTX" && (ext === "PPTX" || ext === "PPT")) ||
        ext === typeFilter;

      return matchesSearch && matchesStatus && matchesType;
    });
  }, [files, searchQuery, statusFilter, typeFilter]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#141010]">
            Uploaded Documents
          </h1>
          <p className="mt-0.5 text-xs sm:text-sm text-zinc-500">
            Inspect, moderate, and manage all uploaded PDFs, Word documents, and
            PowerPoint decks across users.
          </p>
        </div>

        <button
          type="button"
          onClick={invalidateAll}
          disabled={isFetching}
          className={cn(ORANGE_OUTLINE_BTN_CLASS, "self-start sm:self-auto")}
        >
          <RefreshCw
            className={cn("h-3.5 w-3.5", isFetching && "animate-spin")}
          />
          Refresh
        </button>
      </div>

      {/* KPI Row (.card-statistic-4) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <AdminStatCard
          title="All Documents"
          value={summary.total}
          subtitle="Total uploaded files"
          icon={FileText}
        />
        <AdminStatCard
          title="Indexed Ready"
          value={summary.success}
          valueClassName="text-emerald-600"
          subtitle="Searchable & ready for AI chat"
          icon={CheckCircle2}
        />
        <AdminStatCard
          title="Processing Queue"
          value={summary.processing}
          valueClassName="text-amber-600"
          subtitle="Currently indexing vectors"
          icon={Clock}
        />
        <AdminStatCard
          title="Failed Uploads"
          value={summary.failed}
          valueClassName={summary.failed > 0 ? "text-red-600" : undefined}
          subtitle="Exceeded limit or errored"
          icon={AlertCircle}
        />
      </div>

      {/* Main Card Table (matches orange-backend users/page card + nav-pills + filter + striped table) */}
      {isLoading ? (
        <Skeleton height={380} borderRadius={17} />
      ) : (
        <div className={cn(ORANGE_CARD_CLASS, "overflow-hidden")}>
          <div className={ORANGE_CARD_HEADER_CLASS}>
            <AdminFilterPills
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { label: "All Status", value: "ALL", count: summary.total },
                { label: "Success", value: "SUCCESS", count: summary.success },
                {
                  label: "Processing",
                  value: "PROCESSING",
                  count: summary.processing,
                },
                { label: "Failed", value: "FAILED", count: summary.failed },
              ]}
            />

            <AdminFilterPills
              value={typeFilter}
              onChange={setTypeFilter}
              options={[
                { label: "All Formats", value: "ALL" },
                { label: "PDF", value: "PDF" },
                { label: "DOCX", value: "DOCX" },
                { label: "PPTX", value: "PPTX" },
              ]}
            />
          </div>

          <AdminTableControls
            showingLabel={`Showing ${filteredFiles.length} of ${summary.total} documents`}
            searchPlaceholder="Search file name, owner email, or ID..."
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
          />

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className={ORANGE_TABLE_HEAD_ROW_CLASS}>
                  <th className="py-3.5 px-5">Document</th>
                  <th className="py-3.5 px-4">Owner</th>
                  <th className="py-3.5 px-4">Indexing Status</th>
                  <th className="py-3.5 px-4">Chat Activity</th>
                  <th className="py-3.5 px-4">Uploaded</th>
                  <th className="py-3.5 px-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {filteredFiles.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="py-12 text-center text-zinc-500"
                    >
                      No documents match the current filters.
                    </td>
                  </tr>
                ) : (
                  filteredFiles.map((f: any) => {
                    const ext = (f.fileType || "").toUpperCase();
                    const isPpt = ext === "PPTX" || ext === "PPT";
                    const isDoc = ext === "DOCX" || ext === "DOC";

                    return (
                      <tr key={f.id} className={ORANGE_TABLE_BODY_ROW_CLASS}>
                        <td className="py-4 px-5">
                          <div className="flex items-center gap-3">
                            <div
                              className={cn(
                                "flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border",
                                isPpt
                                  ? "bg-orange-50 text-[#FE1B03] border-orange-200"
                                  : isDoc
                                    ? "bg-blue-50 text-blue-600 border-blue-200"
                                    : "bg-red-50 text-red-600 border-red-200"
                              )}
                            >
                              {isPpt ? (
                                <Presentation className="h-4 w-4" />
                              ) : isDoc ? (
                                <FileText className="h-4 w-4" />
                              ) : (
                                <File className="h-4 w-4" />
                              )}
                            </div>
                            <div className="min-w-0 max-w-xs sm:max-w-sm">
                              <Link
                                href={`/dashboard/${f.id}`}
                                className="font-semibold text-[#141010] hover:text-[#FE1B03] truncate block"
                              >
                                {f.name}
                              </Link>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="rounded bg-[#f4f6f9] px-1.5 py-0.2 text-[10px] font-semibold text-zinc-600">
                                  {ext}
                                </span>
                                <code className="text-[10px] font-mono text-zinc-400 truncate">
                                  {f.id}
                                </code>
                              </div>
                            </div>
                          </div>
                        </td>

                        <td className="py-4 px-4">
                          <p className="font-medium text-[#141010] truncate max-w-[180px]">
                            {f.ownerName}
                          </p>
                          <p className="text-xs text-zinc-500 truncate max-w-[180px]">
                            {f.ownerEmail}
                          </p>
                        </td>

                        <td className="py-4 px-4">
                          <select
                            value={f.uploadStatus}
                            onChange={(e) =>
                              updateStatusMutation.mutate({
                                id: f.id,
                                uploadStatus: e.target.value as any,
                              })
                            }
                            className={cn(
                              "rounded-full px-3 py-1 text-xs font-semibold border cursor-pointer focus:outline-none",
                              f.uploadStatus === "SUCCESS"
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                : f.uploadStatus === "FAILED"
                                  ? "bg-red-50 text-red-700 border-red-200"
                                  : "bg-amber-50 text-amber-700 border-amber-200"
                            )}
                          >
                            <option value="SUCCESS">SUCCESS</option>
                            <option value="PROCESSING">PROCESSING</option>
                            <option value="FAILED">FAILED</option>
                          </select>
                        </td>

                        <td className="py-4 px-4">
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-700">
                            <MessageSquare className="h-3.5 w-3.5 text-[#FE1B03]" />
                            {f.messagesCount} messages
                          </span>
                        </td>

                        <td className="py-4 px-4 text-xs text-zinc-500 whitespace-nowrap">
                          {f.createdAt
                            ? format(new Date(f.createdAt), "MMM d, yyyy HH:mm")
                            : "—"}
                        </td>

                        <td className="py-4 px-5 text-right">
                          <div className="inline-flex items-center justify-end gap-1.5">
                            <Link
                              href={`/dashboard/${f.id}`}
                              className="inline-flex items-center gap-1 rounded-full border border-[#ebebeb] bg-white px-3 py-1.5 text-xs font-medium text-[#141010] hover:border-[#FF6F43] hover:text-[#FE1B03] transition-colors"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                              Inspect
                            </Link>
                            <button
                              type="button"
                              onClick={() => setDeletingFile(f)}
                              className="inline-flex items-center justify-center h-8 w-8 rounded-full border border-[#ebebeb] bg-white text-red-600 hover:bg-red-50 hover:border-red-200 transition-colors"
                              title="Delete Document"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={Boolean(deletingFile)}
        onOpenChange={(open) => !open && setDeletingFile(null)}
      >
        <DialogContent className="sm:max-w-md rounded-[17px]">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-red-600 flex items-center gap-2">
              <Trash2 className="h-5 w-5" />
              Delete Document
            </DialogTitle>
          </DialogHeader>

          {deletingFile && (
            <div className="space-y-4 mt-2">
              <p className="text-sm text-zinc-600">
                Are you sure you want to delete{" "}
                <strong className="text-zinc-900">{deletingFile.name}</strong>{" "}
                (owned by {deletingFile.ownerEmail})?
              </p>
              <p className="text-xs text-zinc-500">
                This will remove the file record, {deletingFile.messagesCount}{" "}
                chat message(s), and its Pinecone vector embeddings.
              </p>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDeletingFile(null)}
                  className="rounded-full"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={deleteFileMutation.isLoading}
                  onClick={() =>
                    deleteFileMutation.mutate({ id: deletingFile.id })
                  }
                  className="rounded-full"
                >
                  {deleteFileMutation.isLoading && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Delete Document
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
