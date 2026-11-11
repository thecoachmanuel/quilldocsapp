"use client";
import { useState, useEffect } from "react";
import { trpc } from "@/app/_trpc/client";
import ChatInput from "./ChatInput";
import Messages from "./Messages";
import { ChevronLeft, Loader2, XCircle } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { ChatContextProvider } from "./ChatContext";

interface ChatWrapperProps {
  fileId: string;
  fileIds?: string[];
  isExpanded?: boolean;
  planName?: string;
  pagesPerPdf?: number;
}

function ChatWrapper({
  fileId,
  fileIds,
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
      <div className="relative h-full max-h-full bg-zinc-50 flex flex-col justify-between overflow-hidden">
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
      <div className="relative h-full max-h-full bg-zinc-50 flex flex-col justify-between overflow-hidden">
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
      <div className="relative h-full max-h-full bg-zinc-50 flex flex-col justify-between overflow-hidden">
        <div className="flex-1 min-h-0 flex justify-center items-center flex-col p-4 text-center">
          <div className="flex flex-col items-center gap-2">
            <XCircle className="h-8 w-8 text-red-500 " />
            <h3 className="font-semibold text-xl">Document exceeds plan limit</h3>
            <p className="text-zinc-500 text-sm">
              Your <span className="font-medium">{planName}</span> plan supports
              documents up to {pagesPerPdf} pages or slides.
            </p>
            <Link
              href="/dashboard"
              className={buttonVariants({
                variant: "secondary",
                className: "mt-4",
              })}
            >
              <ChevronLeft className="h-3 w-3 mr-1.5" /> Back
            </Link>
          </div>
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
      <div className="relative h-full max-h-full bg-zinc-50 flex flex-col justify-between overflow-hidden">
        <div className="flex-1 min-h-0 justify-between flex flex-col overflow-hidden">
          <Messages fileId={fileId} isExpanded={isExpanded} />
        </div>

        <ChatInput isExpanded={isExpanded} />
      </div>
    </ChatContextProvider>
  );
}

export default ChatWrapper;
