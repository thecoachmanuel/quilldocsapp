import { trpc } from "@/app/_trpc/client";
import { useToast } from "@/components/ui/use-toast";
import { INFINITE_QUERY_LIMIT } from "@/config/infinite-query";
import { useMutation } from "@tanstack/react-query";
import { ReactNode, createContext, useRef, useState } from "react";

export interface AutoMultiDocInfo {
  ids: string[];
  names: string[];
}

type StreamResponse = {
  addMessage: () => void;
  message: string;
  handleInputChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  setInputValue: (value: string) => void;
  isLoading: boolean;
  isExpanded?: boolean;
  autoMultiDocs: AutoMultiDocInfo | null;
};
export const ChatContext = createContext<StreamResponse>({
  addMessage: () => {},
  message: "",
  handleInputChange: () => {},
  setInputValue: () => {},
  isLoading: false,
  isExpanded: false,
  autoMultiDocs: null,
});

interface Props {
  fileId: string;
  fileIds?: string[];
  isExpanded?: boolean;
  children: ReactNode;
}
export const ChatContextProvider = ({
  fileId,
  fileIds,
  isExpanded = false,
  children,
}: Props) => {
  const [message, setMessage] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [autoMultiDocs, setAutoMultiDocs] = useState<AutoMultiDocInfo | null>(
    null
  );
  const { toast } = useToast();
  const backUpMessage = useRef("");
  const utils = trpc.useUtils();

  const { mutate: sendMessage } = useMutation({
    mutationFn: async ({ message }: { message: string }) => {
      const response = await fetch("/api/message", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fileId,
          message,
          ...(fileIds && fileIds.length > 0 ? { fileIds } : {}),
        }),
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => "");
        throw new Error(errText || "Failed to send message");
      }

      const multiIdsHeader = response.headers.get("X-Quill-Multi-Docs");
      const multiNamesHeader = response.headers.get("X-Quill-Multi-Names");
      if (multiIdsHeader) {
        const ids = multiIdsHeader
          .split(",")
          .map((id) => id.trim())
          .filter(Boolean);
        let names: string[] = [];
        if (multiNamesHeader) {
          try {
            names = JSON.parse(decodeURIComponent(multiNamesHeader));
          } catch {
            names = [];
          }
        }
        if (ids.length > 1) {
          setAutoMultiDocs({ ids, names });
        }
      } else {
        setAutoMultiDocs(null);
      }

      return response.body;
    },

    onMutate: async ({ message }) => {
      backUpMessage.current = message;
      setMessage("");

      await utils.getFileMessages.cancel();

      const previousData = utils.getFileMessages.getInfiniteData({
        fileId,
        limit: INFINITE_QUERY_LIMIT,
      });

      utils.getFileMessages.setInfiniteData(
        { fileId, limit: INFINITE_QUERY_LIMIT },
        (old) => {
          const optimisticMessage = {
            createdAt: new Date().toISOString(),
            id: crypto.randomUUID(),
            text: message,
            isUserMessage: true,
          };

          if (!old || old.pages.length === 0) {
            return {
              pages: [{ messages: [optimisticMessage], nextCursor: undefined }],
              pageParams: [undefined],
            };
          }
          const newPages = [...old.pages];
          const latestPage = { ...newPages[0]! };

          latestPage.messages = [optimisticMessage, ...latestPage.messages];
          newPages[0] = latestPage;

          return { ...old, pages: newPages };
        }
      );

      setIsLoading(true);
      return { previousData };
    },

    onSuccess: async (stream) => {
      setIsLoading(false);

      if (!stream) {
        toast({
          title: "There was a problem sending this message",
          description: "Please refresh this page and try again.",
          variant: "destructive",
        });
        return;
      }

      const reader = stream.getReader();
      const decoder = new TextDecoder();
      let done = false;

      let accResponse = "";

      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        const chunkValue = decoder.decode(value, { stream: !done });
        accResponse += chunkValue;

        utils.getFileMessages.setInfiniteData(
          { fileId, limit: INFINITE_QUERY_LIMIT },
          (old) => {
            if (!old || old.pages.length === 0) {
              return { pages: [], pageParams: [] };
            }

            const isAiResponseCreated = old.pages.some((page) =>
              page.messages.some((message: any) => message.id === "ai-response")
            );

            const updatedPages = old.pages.map((page, idx) => {
              if (idx === 0) {
                let updatedMessages;
                if (!isAiResponseCreated) {
                  updatedMessages = [
                    {
                      createdAt: new Date().toISOString(),
                      id: "ai-response",
                      text: accResponse,
                      isUserMessage: false,
                    },

                    ...page.messages,
                  ];
                } else {
                  updatedMessages = page.messages.map((message: any) => {
                    if (message.id === "ai-response") {
                      return {
                        ...message,
                        text: accResponse,
                      };
                    }
                    return message;
                  });
                }

                return {
                  ...page,
                  messages: updatedMessages,
                };
              }

              return page;
            });

            return { ...old, pages: updatedPages };
          }
        );
      }
    },

    onError: (err: any, _, context) => {
      setMessage(backUpMessage.current);
      if (context?.previousData) {
        utils.getFileMessages.setInfiniteData(
          { fileId, limit: INFINITE_QUERY_LIMIT },
          context.previousData
        );
      }
      toast({
        title: "Failed to get AI response",
        description: err?.message || "Please try again in a moment.",
        variant: "destructive",
      });
    },

    onSettled: async () => {
      setIsLoading(false);
      await utils.getFileMessages.invalidate({ fileId });
    },
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);
  };

  const addMessage = () => {
    if (!message.trim() || isLoading) return;
    sendMessage({ message: message.trim() });
  };

  return (
    <ChatContext.Provider
      value={{
        addMessage,
        message,
        handleInputChange,
        setInputValue: setMessage,
        isLoading,
        isExpanded,
        autoMultiDocs,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
};
