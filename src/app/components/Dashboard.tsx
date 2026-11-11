"use client";

import { trpc } from "@/app/_trpc/client";
import UploadButton from "./UploadButton";
import {
  ArrowRight,
  File,
  FileText,
  Gem,
  Ghost,
  Loader2,
  MessageSquare,
  Plus,
  Presentation,
  Trash,
  Check,
  Layers,
  X,
} from "lucide-react";
import Skeleton from "react-loading-skeleton";
import Link from "next/link";
import { format } from "date-fns";
import { useState } from "react";
import { getUserSubscriptionPlan, DynamicPlan } from "@/lib/subscription";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";

interface PageProps {
  subscriptionPlan: Awaited<ReturnType<typeof getUserSubscriptionPlan>>;
  upgradePlan?: DynamicPlan | null;
}

const Dashboard = ({ subscriptionPlan, upgradePlan = null }: PageProps) => {
  const router = useRouter();
  const [currentlyDeletingFile, setCurrentlyDeletingFile] = useState<
    string | null
  >(null);
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);

  const utils = trpc.useContext();

  const { data: livePlans } = trpc.getPublicPlans.useQuery(undefined, {
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  const liveUserPlan = livePlans?.find(
    (p) =>
      p.slug === (subscriptionPlan as { slug?: string }).slug ||
      (!((subscriptionPlan as { slug?: string }).slug) &&
        p.name === subscriptionPlan.name)
  );
  const activePlan = liveUserPlan
    ? { ...subscriptionPlan, ...liveUserPlan }
    : subscriptionPlan;
  const activeUpgradePlan =
    livePlans?.find((p) => p.slug === "pro") ||
    livePlans?.find(
      (p) =>
        p.slug !== "free" &&
        ((p.price?.amount ?? 0) > 0 || (p.price?.amountNgn ?? 0) > 0)
    ) ||
    upgradePlan;

  const { data: files, isLoading } = trpc.getUserFiles.useQuery(undefined, {
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  const { mutate: deleteFile } = trpc.deleteFile.useMutation({
    onSuccess: () => {
      utils.getUserFiles.invalidate();
    },
    onMutate({ id }) {
      setCurrentlyDeletingFile(id);
    },
    onSettled() {
      setCurrentlyDeletingFile(null);
    },
  });

  const toggleSelectFile = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedFileIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const selectAll = () => {
    if (!files) return;
    setSelectedFileIds(files.map((f: any) => f.id));
  };

  const clearSelection = () => {
    setSelectedFileIds([]);
  };

  const startMultiChat = () => {
    if (selectedFileIds.length === 0) return;
    router.push(`/dashboard/multi?files=${selectedFileIds.join(",")}`);
  };

  return (
    <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 md:p-10 pb-24">
      <div className="mt-8 flex flex-col items-start justify-between gap-4 border-b border-gray-200 pb-5 sm:flex-row sm:items-center sm:gap-0">
        <div>
          <h1 className="font-bold text-4xl sm:text-5xl text-gray-900">
            My Files
          </h1>
          <div className="mt-2 flex items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold",
                subscriptionPlan.isSubscribed
                  ? "bg-blue-100 text-blue-700 border border-blue-200"
                  : "bg-zinc-100 text-zinc-700 border border-zinc-200"
              )}
            >
              {subscriptionPlan.isSubscribed ? (
                <>
                  <Gem className="h-3.5 w-3.5 text-blue-600" />
                  {activePlan.name} Plan ({files?.length ?? 0}/{activePlan.quota} files)
                </>
              ) : (
                <>
                  {activePlan.name} Plan ({files?.length ?? 0}/{activePlan.quota} files)
                </>
              )}
            </span>

            {!subscriptionPlan.isSubscribed && (
              <Link
                href="/pricing"
                className={buttonVariants({
                  variant: "ghost",
                  size: "sm",
                  className:
                    "text-blue-600 hover:text-blue-700 text-xs h-7 px-2 font-medium",
                })}
              >
                Upgrade to {activeUpgradePlan?.name || "Pro"} <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {files && files.length >= 2 && (
            <Link
              href="/dashboard/multi?files=all"
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "h-10 gap-1.5 bg-white border-blue-200 text-blue-700 hover:bg-blue-50 font-medium"
              )}
              title="Chat with all your uploaded documents at once"
            >
              <Layers className="h-4 w-4 text-blue-600" />
              <span>Chat with All Files</span>
            </Link>
          )}

          <UploadButton
            isSubscribed={subscriptionPlan.isSubscribed}
            currentFilesCount={files?.length ?? 0}
            maxQuota={activePlan.quota}
            maxFileSizeMB={activePlan.maxFileSizeMB}
            planName={activePlan.name}
            upgradePlan={activeUpgradePlan}
          />
        </div>
      </div>

      {/* display all user files */}
      {files && files?.length !== 0 ? (
        <ul className="mt-8 grid grid-cols-1 gap-6 divide-y divide-zinc-200 md:grid-cols-2 lg:grid-cols-3">
          {files
            .sort(
              (a: any, b: any) =>
                new Date(b.createdAt).getTime() -
                new Date(a.createdAt).getTime()
            )
            .map((file: any) => {
              const isSelected = selectedFileIds.includes(file.id);

              return (
                <li
                  key={file.id}
                  className={cn(
                    "col-span-1 divide-y divide-gray-200 rounded-lg bg-white shadow transition hover:shadow-lg relative border",
                    isSelected
                      ? "border-blue-500 ring-2 ring-blue-500/20"
                      : "border-transparent"
                  )}
                >
                  {/* Select Checkbox */}
                  <div
                    onClick={(e) => toggleSelectFile(file.id, e)}
                    className="absolute top-3 right-3 z-10 cursor-pointer p-1"
                    title={
                      isSelected
                        ? "Deselect document"
                        : "Select document for multi-doc chat"
                    }
                  >
                    <div
                      className={cn(
                        "h-5 w-5 rounded-md border flex items-center justify-center transition-all",
                        isSelected
                          ? "bg-blue-600 border-blue-600 text-white"
                          : "border-zinc-300 bg-white/90 hover:border-zinc-400"
                      )}
                    >
                      {isSelected && <Check className="h-3.5 w-3.5" />}
                    </div>
                  </div>

                  <Link
                    href={`/dashboard/${file.id}`}
                    className="flex flex-col gap-2"
                  >
                    <div className="pt-6 px-6 flex w-full items-center justify-between space-x-6 pr-10">
                      {file.name.endsWith(".docx") ||
                      file.name.endsWith(".doc") ? (
                        <div className="h-10 w-10 flex-shrink-0 rounded-full flex items-center justify-center bg-gradient-to-r from-blue-600 to-indigo-600 shadow-sm">
                          <FileText className="h-5 w-5 text-white" />
                        </div>
                      ) : file.name.endsWith(".pptx") ||
                        file.name.endsWith(".ppt") ? (
                        <div className="h-10 w-10 flex-shrink-0 rounded-full flex items-center justify-center bg-gradient-to-r from-orange-500 to-amber-500 shadow-sm">
                          <Presentation className="h-5 w-5 text-white" />
                        </div>
                      ) : (
                        <div className="h-10 w-10 flex-shrink-0 rounded-full flex items-center justify-center bg-gradient-to-r from-cyan-500 to-blue-500 shadow-sm">
                          <File className="h-5 w-5 text-white" />
                        </div>
                      )}
                      <div className="flex-1 truncate">
                        <div className="flex items-center space-x-2.5">
                          <h3 className="truncate text-lg font-medium text-zinc-900">
                            {file.name}
                          </h3>
                          {file.name.endsWith(".docx") ||
                          file.name.endsWith(".doc") ? (
                            <span className="shrink-0 text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                              DOCX
                            </span>
                          ) : file.name.endsWith(".pptx") ||
                            file.name.endsWith(".ppt") ? (
                            <span className="shrink-0 text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-orange-50 text-orange-700 border border-orange-200">
                              PPTX
                            </span>
                          ) : (
                            <span className="shrink-0 text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-cyan-50 text-cyan-700 border border-cyan-200">
                              PDF
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </Link>

                  <div className="px-6 mt-4 grid grid-cols-3 place-items-center py-2 gap-6 text-xs text-zinc-500">
                    <div className="flex items-center gap-2">
                      <Plus className="h-4 w-4" />
                      {format(new Date(file.createdAt), "MMM yyyy")}
                    </div>

                    <button
                      type="button"
                      onClick={(e) => toggleSelectFile(file.id, e)}
                      className={cn(
                        "inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs transition",
                        isSelected
                          ? "bg-blue-50 text-blue-700 font-semibold"
                          : "text-zinc-500 hover:text-zinc-900"
                      )}
                    >
                      <Layers className="h-3.5 w-3.5" />
                      {isSelected ? "Selected" : "Select"}
                    </button>

                    <Button
                      onClick={() => deleteFile({ id: file.id })}
                      size="sm"
                      className="w-full"
                      variant="destructive"
                    >
                      {currentlyDeletingFile === file.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </li>
              );
            })}
        </ul>
      ) : isLoading ? (
        <Skeleton height={100} className="my-2" count={3} />
      ) : (
        <div className="mt-16 flex flex-col items-center gap-2">
          <Ghost className="h-8 w-8 text-zinc-800" />
          <h3 className="font-semibold text-xl">Pretty empty around here</h3>
          <p>Let&apos;s upload your first document.</p>
        </div>
      )}

      {/* Floating Action Bar when documents are selected */}
      {selectedFileIds.length > 0 && (
        <div className="fixed bottom-6 inset-x-0 mx-auto max-w-xl z-50 px-4 animate-in slide-in-from-bottom-5">
          <div className="flex items-center justify-between rounded-2xl bg-zinc-900 text-white px-5 py-3.5 shadow-2xl border border-zinc-700 gap-3">
            <div className="flex items-center gap-2.5">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                {selectedFileIds.length}
              </span>
              <span className="text-sm font-medium">
                document{selectedFileIds.length === 1 ? "" : "s"} selected
              </span>
            </div>

            <div className="flex items-center gap-2">
              {files && selectedFileIds.length < files.length && (
                <button
                  type="button"
                  onClick={selectAll}
                  className="text-xs text-zinc-400 hover:text-white px-2 py-1 transition"
                >
                  Select All
                </button>
              )}
              <button
                type="button"
                onClick={clearSelection}
                className="text-xs text-zinc-400 hover:text-white px-2 py-1 transition"
              >
                Clear
              </button>
              <Button
                size="sm"
                onClick={startMultiChat}
                className="bg-blue-600 hover:bg-blue-500 text-white gap-1.5 shadow-md"
              >
                <MessageSquare className="h-3.5 w-3.5" />
                <span>Chat with Selected</span>
              </Button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
};

export default Dashboard;
