"use client";
import { useState, useEffect, useContext } from "react";
import { trpc } from "@/app/_trpc/client";
import ChatInput from "./ChatInput";
import Messages from "./Messages";
import { DocSourceRef } from "./Message";
import { Loader2, Layers } from "lucide-react";
import Link from "next/link";
import LimitUpgradePrompt from "../LimitUpgradePrompt";
import { ChatContext, ChatContextProvider } from "./ChatContext";

interface ChatWrapperProps {
  fileId: string;
  fileIds?: string[];
  docNames?: string[];
  docSources?: DocSourceRef[];
  isExpanded?: boolean;
  planName?: string;
  pagesPerPdf?: number;
}

function AutoMultiDocBanner({ hasExplicitMulti }: { hasExplicitMulti: boolean }) {
  const { autoMultiDocs } = useContext(ChatContext);
  if (hasExplicitMulti || !autoMultiDocs || autoMultiDocs.ids.length <= 1) {
    return null;
  }

  return (
    <div className="shrink-0 w-full max-w-full overflow-hidden bg-blue-50/90 border-b border-blue-200 px-3 py-1.5 flex items-center justify-between gap-2 text-xs">
      <div className="flex items-center gap-1.5 min-w-0 text-blue-900">
        <Layers className="h-3.5 w-3.5 text-blue-600 shrink-0" />
        <span className="truncate">
          Cross-referencing{" "}
          <strong>{autoMultiDocs.ids.length} documents</strong>
          {autoMultiDocs.names.length > 0
            ? ` (${autoMultiDocs.names.join(", ")})`
            : ""}
        </span>
      </div>
      <Link
        href={`/dashboard/multi?files=${autoMultiDocs.ids.join(",")}`}
        className="shrink-0 font-semibold text-blue-700 hover:text-blue-800 hover:underline whitespace-nowrap"
      >
        Open Side-by-Side
      </Link>
    </div>
  );
}

function ChatWrapper({
  fileId,
  fileIds,
  docNames,
  docSources,
  isExpanded = false,
  planName = "Free",
  pagesPerPdf = 5,
}: ChatWrapperProps) {
  const [forceReady, setForceReady] = useState(false);

  const { data, isLoading } = trpc.getFileUploadStatus.useQuery(
    {
      fileId,
    },
    {
      refetchInterval: (data) =>
        data?.status === "SUCCESS" || data?.status === "FAILED" || forceReady
          ? false
          : 1000,
    }
  );

  useEffect(() => {
    if (data?.status === "PROCESSING") {
      const timer = setTimeout(() => {
        setForceReady(true);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [data?.status]);

  if (isLoading && !forceReady)
    return (
      <div className="relative h-full max-h-full w-full max-w-full min-w-0 bg-zinc-50 flex flex-col justify-between overflow-hidden">
        <div className="flex-1 min-h-0 flex justify-center items-center flex-col p-4">
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
            <h3 className="font-semibold text-xl">Loading...</h3>
            <p className="text-zinc-500 text-sm">
              We&apos;re preparing your file
            </p>
          </div>
        </div>
        <ChatInput isDisabled />
      </div>
    );

  if (data?.status === "PROCESSING" && !forceReady)
    return (
      <div className="relative h-full max-h-full w-full max-w-full min-w-0 bg-zinc-50 flex flex-col justify-between overflow-hidden">
        <div className="flex-1 min-h-0 flex justify-center items-center flex-col p-4 text-center">
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
            <h3 className="font-semibold text-xl">Processing document...</h3>
            <p className="text-zinc-500 text-sm">Preparing your AI context</p>
            <button
              type="button"
              onClick={() => setForceReady(true)}
              className="mt-3 px-3 py-1.5 rounded-md bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition"
            >
              Start Chatting Now
            </button>
          </div>
        </div>
        <ChatInput isDisabled />
      </div>
    );

  if (data?.status === "FAILED")
    return (
      <div className="relative h-full max-h-full w-full max-w-full min-w-0 bg-zinc-50 flex flex-col justify-between overflow-hidden">
        <div className="flex-1 min-h-0 overflow-y-auto flex justify-center items-start sm:items-center p-4 sm:p-6">
          <LimitUpgradePrompt
            variant="card"
            limitType="pages"
            reasonTitle="Document exceeds plan limit"
            reasonDescription={`Your ${planName} plan supports documents up to ${pagesPerPdf} pages or slides.`}
            currentPlanName={planName}
            backHref="/dashboard"
            backLabel="Back to Files"
          />
        </div>
        <ChatInput isDisabled />
      </div>
    );

  return (
    <ChatContextProvider
      fileId={fileId}
      fileIds={fileIds}
      isExpanded={isExpanded}
    >
      <div className="relative h-full max-h-full w-full max-w-full min-w-0 bg-zinc-50 flex flex-col justify-between overflow-hidden">
        <AutoMultiDocBanner
          hasExplicitMulti={Boolean(fileIds && fileIds.length > 1)}
        />
        <div className="flex-1 min-h-0 min-w-0 w-full max-w-full justify-between flex flex-col overflow-hidden">
          <Messages
            fileId={fileId}
            isExpanded={isExpanded}
            docNames={docNames}
            docSources={docSources}
          />
        </div>

        <ChatInput isExpanded={isExpanded} />
      </div>
    </ChatContextProvider>
  );
}

export default ChatWrapper;
