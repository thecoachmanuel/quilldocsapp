"use client";

import { useState, useMemo } from "react";
import { trpc } from "@/app/_trpc/client";
import Link from "next/link";
import { format } from "date-fns";
import {
  FileText,
  File,
  Presentation,
  Search,
  Trash2,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Clock,
  RefreshCw,
  MessageSquare,
  Loader2,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import Skeleton from "react-loading-skeleton";

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

  const filteredFiles = useMemo(() => {
    if (!files) return [];
    return files.filter((f: any) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        f.name?.toLowerCase().includes(q) ||
        f.ownerEmail?.toLowerCase().includes(q) ||
        f.id?.toLowerCase().includes(q);

      const matchesStatus =
        statusFilter === "ALL" ||
        (statusFilter === "PROCESSING"
          ? f.uploadStatus === "PROCESSING" || f.uploadStatus === "PENDING"
          : f.uploadStatus === statusFilter);

      const ext = (f.fileType || "").toUpperCase();
      const matchesType =
        typeFilter === "ALL" ||
        (typeFilter === "PDF" && ext === "PDF") ||
        (typeFilter === "DOCX" && (ext === "DOCX" || ext === "DOC")) ||
        (typeFilter === "PPTX" && (ext === "PPTX" || ext === "PPT"));

      return matchesSearch && matchesStatus && matchesType;
    });
  }, [files, searchQuery, statusFilter, typeFilter]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-200 pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900">
            Uploaded Documents
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Inspect, moderate, and manage all uploaded PDFs, Word documents, and PowerPoint decks across users.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={invalidateAll}
          disabled={isFetching}
          className="h-9 gap-1.5 bg-white border-zinc-200 text-zinc-700 self-start sm:self-auto"
        >
          <RefreshCw
            className={cn("h-3.5 w-3.5", isFetching && "animate-spin")}
          />
          Refresh
        </Button>
      </div>

      {/* Search & Filters */}
      <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
            <Input
              placeholder="Search by file name, owner email, or file ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 text-sm"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Format Filter */}
            <div className="flex items-center rounded-lg bg-zinc-100 p-0.5 border border-zinc-200">
              {(["ALL", "PDF", "DOCX", "PPTX"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTypeFilter(t)}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-medium transition",
                    typeFilter === t
                      ? "bg-white text-blue-600 shadow-sm font-semibold"
                      : "text-zinc-600 hover:text-zinc-900"
                  )}
                >
                  {t === "ALL" ? "All Formats" : t}
                </button>
              ))}
            </div>

            {/* Status Filter */}
            <div className="flex items-center rounded-lg bg-zinc-100 p-0.5 border border-zinc-200">
              {(["ALL", "SUCCESS", "PROCESSING", "FAILED"] as const).map(
                (s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatusFilter(s)}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-xs font-medium transition",
                      statusFilter === s
                        ? "bg-white text-blue-600 shadow-sm font-semibold"
                        : "text-zinc-600 hover:text-zinc-900"
                    )}
                  >
                    {s === "ALL" ? "All Status" : s}
                  </button>
                )
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Documents Table */}
      {isLoading ? (
        <Skeleton height={340} className="rounded-xl" />
      ) : (
        <div className="rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50/80 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                  <th className="py-3.5 px-5">Document</th>
                  <th className="py-3.5 px-4">Owner</th>
                  <th className="py-3.5 px-4">Indexing Status</th>
                  <th className="py-3.5 px-4">Chat Activity</th>
                  <th className="py-3.5 px-4">Uploaded</th>
                  <th className="py-3.5 px-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 text-sm">
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
                      <tr
                        key={f.id}
                        className="hover:bg-zinc-50/70 transition-colors"
                      >
                        <td className="py-4 px-5">
                          <div className="flex items-center gap-3">
                            <div
                              className={cn(
                                "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border",
                                isPpt
                                  ? "bg-orange-50 text-orange-600 border-orange-200"
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
                                className="font-semibold text-zinc-900 hover:text-blue-600 truncate block"
                              >
                                {f.name}
                              </Link>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="rounded bg-zinc-100 px-1.5 py-0.2 text-[10px] font-semibold text-zinc-600">
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
                          <p className="font-medium text-zinc-900 truncate max-w-[180px]">
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
                              "rounded-full px-2.5 py-1 text-xs font-semibold border cursor-pointer",
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
                            <MessageSquare className="h-3.5 w-3.5 text-blue-600" />
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
                              className={cn(
                                buttonVariants({
                                  variant: "outline",
                                  size: "sm",
                                }),
                                "h-8 px-2.5 text-xs gap-1 border-zinc-200 text-zinc-700"
                              )}
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                              Inspect
                            </Link>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setDeletingFile(f)}
                              className="h-8 px-2 text-xs border-zinc-200 text-red-600 hover:bg-red-50 hover:border-red-200"
                              title="Delete Document"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
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
        <DialogContent className="sm:max-w-md">
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

