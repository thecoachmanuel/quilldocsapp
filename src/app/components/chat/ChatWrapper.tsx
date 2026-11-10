"use client";
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
}

function ChatWrapper({
  fileId,
  fileIds,
  isExpanded = false,
}: ChatWrapperProps) {
  const { data, isLoading } = trpc.getFileUploadStatus.useQuery(
    {
      fileId,
    },
    {
      refetchInterval: (data) =>
        data?.status === "SUCCESS" || data?.status === "FAILED" ? false : 500,
    }
  );

  if (isLoading)
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

  if (data?.status === "PROCESSING")
    return (
      <div className="relative h-full max-h-full bg-zinc-50 flex flex-col justify-between overflow-hidden">
        <div className="flex-1 min-h-0 flex justify-center items-center flex-col p-4">
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
            <h3 className="font-semibold text-xl">Processing document...</h3>
            <p className="text-zinc-500 text-sm">This won&apos;t take long</p>
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
              Your <span className="font-medium">Free</span> plan supports documents
              up to 5 pages or slides.
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
