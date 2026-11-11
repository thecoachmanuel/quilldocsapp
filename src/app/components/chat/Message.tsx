import { cn } from "@/lib/utils";
import { ExtendedMessage } from "@/types/message";
import { Icons } from "../Icons";
import ReactMarkdown from "react-markdown";
import { format } from "date-fns";
import { forwardRef, useState } from "react";
import { Check, Copy, FileText } from "lucide-react";

interface MessageProps {
  message: ExtendedMessage;
  isNextMessageSamePerson: boolean;
  isExpanded?: boolean;
}

const Message = forwardRef<HTMLDivElement, MessageProps>(
  ({ message, isNextMessageSamePerson, isExpanded = false }, ref) => {
    const [hasCopied, setHasCopied] = useState<boolean>(false);

    const handleCopy = () => {
      if (typeof message.text === "string") {
        navigator.clipboard.writeText(message.text);
        setHasCopied(true);
        setTimeout(() => setHasCopied(false), 2000);
      }
    };

    // Pre-process citations in a single pass so multi-doc links aren't nested:
    // 1. Multi-doc citations: [Doc.pdf • Page 3], [Source: Doc.pdf, Slide 2]
    // 2. Single doc citations: [Page 3], [Slide 2]
    const formattedText =
      typeof message.text === "string" && !message.isUserMessage
        ? message.text.replace(
            /(?:\[|\()(?:Source:\s*)?([^\]\)]+?\.(?:pdf|docx?|pptx?))\s*(?:•|\||-|–|,|:)\s*(Page|Slide)s?\s*([0-9]+)(?:\s*[-–]\s*[0-9]+)?(?:\]|\))|(?:\[|\()?(Page|Slide)s?\s*([0-9]+)(?:\]|\))?/gi,
            (match, doc, mType, mNum, sType, sNum) => {
              if (doc && mType && mNum) {
                const cleanDoc = doc.trim();
                const unit =
                  mType.charAt(0).toUpperCase() + mType.slice(1).toLowerCase();
                return `[${cleanDoc} • ${unit} ${mNum}](#jump-doc-${encodeURIComponent(
                  cleanDoc
                )}-${mType.toLowerCase()}-${mNum})`;
              }
              if (sType && sNum) {
                const unit =
                  sType.charAt(0).toUpperCase() + sType.slice(1).toLowerCase();
                return `[${unit} ${sNum}](#jump-${sType.toLowerCase()}-${sNum})`;
              }
              return match;
            }
          )
        : message.text;

    return (
      <div
        ref={ref}
        className={cn("flex items-end w-full", {
          "justify-end": message.isUserMessage,
        })}
      >
        <div
          className={cn(
            "relative flex h-6 w-6 aspect-square items-center justify-center shrink-0",
            {
              "order-2 bg-blue-600 rounded-sm": message.isUserMessage,
              "order-1 bg-zinc-800 rounded-sm": !message.isUserMessage,
              invisible: isNextMessageSamePerson,
            }
          )}
        >
          {message.isUserMessage ? (
            <Icons.user className="fill-zinc-200 text-zinc-200 h-3/4 w-3/4" />
          ) : (
            <Icons.logo className="fill-zinc-300 h-3/4 w-3/4" />
          )}
        </div>

        <div
          className={cn(
            "flex flex-col space-y-2 text-base mx-2 group relative transition-all duration-300",
            message.isUserMessage
              ? cn(
                "order-1 items-end",
                isExpanded
                  ? "max-w-[90%] sm:max-w-[85%] lg:max-w-4xl xl:max-w-5xl"
                  : "max-w-[85%] sm:max-w-[78%] lg:max-w-2xl"
              )
              : cn(
                "order-2 items-start",
                isExpanded
                  ? "max-w-[96%] sm:max-w-[92%] lg:max-w-5xl xl:max-w-6xl"
                  : "max-w-[92%] sm:max-w-[88%] lg:max-w-[88%] xl:max-w-[86%]"
              )
          )}
        >
          <div
            className={cn(
              "px-4 py-2.5 rounded-lg inline-block w-fit max-w-full transition-all duration-200",
              {
                "bg-blue-600 text-white": message.isUserMessage,
                "bg-gray-200 text-gray-900": !message.isUserMessage,
                "rounded-br-none":
                  !isNextMessageSamePerson && message.isUserMessage,
                "rounded-bl-none":
                  !isNextMessageSamePerson && !message.isUserMessage,
              }
            )}
          >
            {typeof formattedText === "string" ? (
              <ReactMarkdown
                className={cn("prose max-w-none break-words", {
                  "text-zinc-50": message.isUserMessage,
                })}
                components={{
                  a: ({ href, children, ...props }) => {
                    if (href?.startsWith("#jump-doc-")) {
                      const rest = href.replace("#jump-doc-", "");
                      const lastHyphen = rest.lastIndexOf("-");
                      const secondLastHyphen = rest.lastIndexOf(
                        "-",
                        lastHyphen - 1
                      );
                      const encodedDoc = rest.slice(0, secondLastHyphen);
                      const docName = decodeURIComponent(encodedDoc);
                      const type = rest.slice(
                        secondLastHyphen + 1,
                        lastHyphen
                      );
                      const num = parseInt(rest.slice(lastHyphen + 1), 10);

                      return (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            window.dispatchEvent(
                              new CustomEvent("quill:jump-to-doc", {
                                detail: { docName, page: num, type },
                              })
                            );
                          }}
                          className="inline-flex items-center gap-1 px-2 py-0.5 mx-0.5 rounded text-xs font-semibold bg-blue-100 hover:bg-blue-200 text-blue-800 border border-blue-300 transition-all cursor-pointer not-prose align-baseline shadow-xs active:scale-95 select-none"
                          title={`Switch to ${docName} - ${type} ${num}`}
                        >
                          <FileText className="h-3 w-3 text-blue-600 shrink-0" />
                          <span>{children}</span>
                        </button>
                      );
                    }

                    if (href?.startsWith("#jump-")) {
                      const parts = href.replace("#jump-", "").split("-");
                      const type = parts[0];
                      const num = parseInt(parts[1], 10);
                      return (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (!isNaN(num)) {
                              window.dispatchEvent(
                                new CustomEvent("quill:jump-to-page", {
                                  detail: { page: num, type },
                                })
                              );
                            }
                          }}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 mx-0.5 rounded text-xs font-semibold bg-blue-100 hover:bg-blue-200 text-blue-800 border border-blue-300 transition-all cursor-pointer not-prose align-baseline shadow-xs active:scale-95 select-none"
                          title={`Jump to ${type} ${num}`}
                        >
                          <FileText className="h-3 w-3 text-blue-600 shrink-0" />
                          <span>{children}</span>
                        </button>
                      );
                    }
                    return (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 underline hover:text-blue-800"
                        {...props}
                      >
                        {children}
                      </a>
                    );
                  },
                }}
              >
                {formattedText}
              </ReactMarkdown>
            ) : (
              message.text
            )}
            {message.id !== "loading-message" ? (
              <div
                className={cn("text-xs select-none mt-2 w-full flex items-center justify-between gap-2", {
                  "text-zinc-500": !message.isUserMessage,
                  "text-blue-300 justify-end": message.isUserMessage,
                })}
              >
                {!message.isUserMessage ? (
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="flex items-center gap-1 text-[11px] font-medium text-zinc-500 hover:text-zinc-900 transition-colors py-0.5 px-1.5 rounded hover:bg-zinc-300/60"
                    title={hasCopied ? "Copied!" : "Copy response"}
                    aria-label="Copy AI response"
                  >
                    {hasCopied ? (
                      <>
                        <Check className="h-3 w-3 text-green-600" />
                        <span className="text-green-700 font-semibold">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                ) : null}
                <span>{format(new Date(message.createdAt), "HH:mm")}</span>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    );
  }
);

Message.displayName = "Message";

export default Message;
