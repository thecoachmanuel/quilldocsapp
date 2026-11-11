import { trpc } from "@/app/_trpc/client";
import { INFINITE_QUERY_LIMIT } from "@/config/infinite-query";
import { Loader2, MessageSquare, Layers, Globe } from "lucide-react";
import Skeleton from "react-loading-skeleton";
import Message, { DocSourceRef } from "./Message";
import { useContext, useEffect, useRef } from "react";
import { ChatContext } from "./ChatContext";
import { useIntersection } from "@mantine/hooks";
import { cn } from "@/lib/utils";

interface MessagesProps {
  fileId: string;
  isExpanded?: boolean;
  docNames?: string[];
  docSources?: DocSourceRef[];
}

function Messages({
  fileId,
  isExpanded = false,
  docNames,
  docSources,
}: MessagesProps) {
  const {
    isLoading: isAiThinking,
    isExpanded: contextExpanded,
    autoMultiDocs,
    setInputValue,
  } = useContext(ChatContext);
  const effectiveExpanded = isExpanded || contextExpanded || false;
  const effectiveDocSources: DocSourceRef[] =
    docSources && docSources.length > 0
      ? docSources
      : autoMultiDocs && autoMultiDocs.ids.length > 0
      ? autoMultiDocs.ids.map((id, idx) => ({
          id,
          name: autoMultiDocs.names[idx] || `Document ${idx + 1}`,
        }))
      : (docNames || []).map((name) => ({ name }));

  const { data, isLoading, fetchNextPage } =
    trpc.getFileMessages.useInfiniteQuery(
      {
        fileId,
        limit: INFINITE_QUERY_LIMIT,
      },
      {
        getNextPageParam: (lastPage) => lastPage?.nextCursor,
        keepPreviousData: true,
      }
    );

  const messages = data?.pages.flatMap((page) => page.messages);

  const loadingMessage = {
    createdAt: new Date().toISOString(),
    id: "loading-message",
    isUserMessage: false,
    text: (
      <span className="flex h-full items-center justify-center">
        <Loader2 className="h-4 w-4 animate-spin" />
      </span>
    ),
  };
  const combinedMessages = [
    ...(isAiThinking ? [loadingMessage] : []),
    ...(messages ?? []),
  ];

  const lastMessageRef = useRef<HTMLDivElement>(null);

  const { ref, entry } = useIntersection({
    root: lastMessageRef.current,
    threshold: 1,
  });

  useEffect(() => {
    if (entry?.isIntersecting) {
      fetchNextPage();
    }
  }, [entry, fetchNextPage]);

  return (
    <div className="flex flex-1 min-h-0 min-w-0 w-full max-w-full h-full border-zinc-200 flex-col-reverse overflow-y-auto overflow-x-hidden scrollbar-thumb-blue scrollbar-thumb-rounded scrollbar-track-blue-lighter scrollbar-w-2 scrolling-touch">
      <div
        className={cn(
          "w-full max-w-full min-w-0 flex flex-col-reverse gap-4 transition-all duration-300",
          effectiveExpanded
            ? "sm:max-w-4xl xl:max-w-5xl 2xl:max-w-6xl mx-auto px-3 sm:px-6 py-4"
            : "px-2.5 sm:px-3 py-3"
        )}
      >
        {combinedMessages && combinedMessages.length > 0 ? (
          combinedMessages.map((message, i) => {
            const isNextMessageSamePerson =
              combinedMessages[i - 1]?.isUserMessage ===
              combinedMessages[i]?.isUserMessage;
            if (i === combinedMessages.length - 1) {
              return (
                <Message
                  ref={ref}
                  message={message}
                  key={message.id}
                  isNextMessageSamePerson={isNextMessageSamePerson}
                  isExpanded={effectiveExpanded}
                  docSources={effectiveDocSources}
                />
              );
            } else {
              return (
                <Message
                  message={message}
                  key={message.id}
                  isNextMessageSamePerson={isNextMessageSamePerson}
                  isExpanded={effectiveExpanded}
                  docSources={effectiveDocSources}
                />
              );
            }
          })
        ) : isLoading ? (
          <div className="w-full flex flex-col gap-2">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 py-12 px-4 text-center">
            {docNames && docNames.length > 1 ? (
              <>
                <Layers className="h-8 w-8 text-blue-600" />
                <h3 className="font-semibold text-lg text-zinc-900">
                  Multi-Doc Synthesis Ready
                </h3>
                <p className="text-zinc-500 text-sm max-w-xs">
                  Ask to compare, summarize, or teach concepts across{" "}
                  {docNames.length} documents in any language.
                </p>
                <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5 max-w-sm">
                  {docNames.map((name, idx) => (
                    <span
                      key={`${name}-${idx}`}
                      className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-white text-zinc-700 border border-zinc-200 max-w-[185px]"
                      title={name}
                    >
                      <span className="inline-flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-blue-600 text-white text-[9px] font-bold px-0.5 shrink-0">
                        {idx + 1}
                      </span>
                      <span className="truncate">{name}</span>
                    </span>
                  ))}
                </div>
                <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-blue-50 border border-blue-200 px-2.5 py-0.5 text-[11px] font-medium text-blue-700">
                  <Globe className="h-3 w-3 shrink-0" />
                  <span>Ask your AI tutor in any language</span>
                </span>
              </>
            ) : (
              <>
                <MessageSquare className="h-8 w-8 text-blue-500" />
                <h3 className="font-semibold text-xl">You&apos;re all set!</h3>
                <p className="text-zinc-500 text-sm max-w-xs">
                  Upload in any language and ask our AI tutor to explain or
                  teach you in any language.
                </p>
                <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5 max-w-sm">
                  {[
                    "Teach me this document step-by-step",
                    "Explain this in French",
                    "Teach me this in Yoruba",
                  ].map((promptText) => (
                    <button
                      key={promptText}
                      type="button"
                      onClick={() => setInputValue(promptText)}
                      className="inline-flex items-center gap-1 rounded-full bg-white border border-zinc-200 px-2.5 py-1 text-[11px] font-medium text-zinc-700 hover:border-blue-300 hover:bg-blue-50/70 hover:text-blue-700 transition"
                    >
                      <Globe className="h-3 w-3 text-blue-600 shrink-0" />
                      <span>{promptText}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default Messages;
