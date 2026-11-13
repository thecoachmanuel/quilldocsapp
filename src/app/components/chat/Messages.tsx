import { trpc } from "@/app/_trpc/client";
import { INFINITE_QUERY_LIMIT } from "@/config/infinite-query";
import {
  Loader2,
  MessageSquare,
  Layers,
  Globe,
  HelpCircle,
  BookOpen,
  Sigma,
  GraduationCap,
} from "lucide-react";
import Skeleton from "react-loading-skeleton";
import Message, { DocSourceRef } from "./Message";
import { useContext, useEffect, useRef } from "react";
import { ChatContext } from "./ChatContext";
import { useIntersection } from "@mantine/hooks";
import { cn } from "@/lib/utils";
import { handleChatSelectionCopy } from "@/lib/word-clipboard";

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
    docSources && docSources.length > 1
      ? docSources
      : autoMultiDocs && autoMultiDocs.ids.length > 0
      ? autoMultiDocs.ids.map((id, idx) => ({
          id,
          name: autoMultiDocs.names[idx] || `Document ${idx + 1}`,
        }))
      : docSources && docSources.length > 0
      ? docSources
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
  const hasStreamingReply = Boolean(
    messages?.some((m: any) => m.id === "ai-response" && Boolean(m.text))
  );
  const combinedMessages = [
    ...(isAiThinking && !hasStreamingReply ? [loadingMessage] : []),
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
    <div
      onCopy={handleChatSelectionCopy}
      className="flex flex-1 min-h-0 min-w-0 w-full max-w-full h-full border-zinc-200 flex-col-reverse overflow-y-auto overflow-x-hidden scrollbar-thumb-blue scrollbar-thumb-rounded scrollbar-track-blue-lighter scrollbar-w-2 scrolling-touch"
    >
      <div
        data-messages-order="reverse"
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
                  isStreaming={message.id === "ai-response" && isAiThinking}
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
                  isStreaming={message.id === "ai-response" && isAiThinking}
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
                <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5 max-w-md">
                  {[
                    {
                      text: "Generate exam paper",
                      icon: GraduationCap,
                      opensModal: true,
                    },
                    { text: "Quiz me across these documents", icon: HelpCircle },
                    { text: "Create comparative flashcards", icon: BookOpen },
                    { text: "Compare key statistics & data", icon: Sigma },
                    { text: "Synthesize key points step-by-step", icon: Globe },
                  ].map(({ text: promptText, icon: PromptIcon, opensModal }) => (
                    <button
                      key={promptText}
                      type="button"
                      onClick={() => {
                        if (opensModal) {
                          window.dispatchEvent(
                            new CustomEvent("quill:open-exam-modal")
                          );
                        } else {
                          setInputValue(promptText);
                        }
                      }}
                      className="inline-flex items-center gap-1 rounded-full bg-white border border-zinc-200 px-2.5 py-1 text-[11px] font-medium text-zinc-700 hover:border-blue-300 hover:bg-blue-50/70 hover:text-blue-700 transition shadow-sm"
                    >
                      <PromptIcon className="h-3 w-3 text-blue-600 shrink-0" />
                      <span>{promptText}</span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <MessageSquare className="h-8 w-8 text-blue-500" />
                <h3 className="font-semibold text-xl">You&apos;re all set!</h3>
                <p className="text-zinc-500 text-sm max-w-xs">
                  Ask your AI tutor to teach concepts, test your understanding, or practice with flashcards.
                </p>
                <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5 max-w-md">
                  {[
                    {
                      text: "Generate exam paper",
                      icon: GraduationCap,
                      opensModal: true,
                    },
                    { text: "Quiz me on this document", icon: HelpCircle },
                    { text: "Create study flashcards", icon: BookOpen },
                    { text: "Explain key formulas & statistics", icon: Sigma },
                    { text: "Teach me this document step-by-step", icon: Globe },
                  ].map(({ text: promptText, icon: PromptIcon, opensModal }) => (
                    <button
                      key={promptText}
                      type="button"
                      onClick={() => {
                        if (opensModal) {
                          window.dispatchEvent(
                            new CustomEvent("quill:open-exam-modal")
                          );
                        } else {
                          setInputValue(promptText);
                        }
                      }}
                      className="inline-flex items-center gap-1 rounded-full bg-white border border-zinc-200 px-2.5 py-1 text-[11px] font-medium text-zinc-700 hover:border-blue-300 hover:bg-blue-50/70 hover:text-blue-700 transition shadow-sm"
                    >
                      <PromptIcon className="h-3 w-3 text-blue-600 shrink-0" />
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
