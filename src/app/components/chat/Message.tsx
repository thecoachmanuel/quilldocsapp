import { cn } from "@/lib/utils";
import { ExtendedMessage } from "@/types/message";
import { Icons } from "../Icons";
import ReactMarkdown from "react-markdown";
import { format } from "date-fns";
import { forwardRef, useState } from "react";
import { Check, Copy, FileText } from "lucide-react";

export interface DocSourceRef {
  id?: string;
  name: string;
}

interface MessageProps {
  message: ExtendedMessage;
  isNextMessageSamePerson: boolean;
  isExpanded?: boolean;
  docSources?: DocSourceRef[];
}

interface ParsedMessageCitations {
  formattedText: string | JSX.Element;
  effectiveSources: DocSourceRef[];
  citedIndices: number[];
}

function parseSourcesFooter(rawText: string): {
  bodyText: string;
  footerSources: DocSourceRef[];
} {
  const footerMatch = rawText.match(
    /\n+(?:\*\*)?Sources:(?:\*\*)?\s*((?:\[\d+\][\s\S]+?))$/i
  );
  if (!footerMatch) {
    return { bodyText: rawText, footerSources: [] };
  }

  const footerStr = footerMatch[1].trim();
  const entries: Array<{ idx: number; name: string }> = [];
  const itemRegex = /\[(\d+)\]\s*([^|\n]+?)(?=\s*(?:[|·]\s*)?\[\d+\]|$)/g;
  let m: RegExpExecArray | null;
  while ((m = itemRegex.exec(footerStr)) !== null) {
    const idx = parseInt(m[1], 10);
    const name = m[2].trim();
    if (!isNaN(idx) && idx > 0 && name) {
      entries.push({ idx, name });
    }
  }

  if (entries.length === 0) {
    return { bodyText: rawText, footerSources: [] };
  }

  const maxIdx = Math.max(...entries.map((e) => e.idx));
  const footerSources: DocSourceRef[] = Array.from(
    { length: maxIdx },
    (_, i) => {
      const found = entries.find((e) => e.idx === i + 1);
      return { id: "", name: found?.name || `Document ${i + 1}` };
    }
  );

  return {
    bodyText: rawText.slice(0, footerMatch.index).trimEnd(),
    footerSources,
  };
}

function formatMessageCitations(
  rawText: string,
  propSources: DocSourceRef[] = []
): ParsedMessageCitations {
  const { bodyText, footerSources } = parseSourcesFooter(rawText);

  const effectiveSources: DocSourceRef[] =
    propSources.length >= footerSources.length
      ? propSources
      : footerSources.map((fs, i) => ({
        id: propSources[i]?.id || fs.id || "",
        name: propSources[i]?.name || fs.name,
      }));

  const citedSet = new Set<number>();

  // Match priority in a single left-to-right pass to prevent nested replacement:
  // 1) Compact indexed citations: [1 · p.4], [1, Page 4], [Doc 2 · s.5], (1 · p.3-4)
  // 2) Full filename citations: [Report.pdf • Page 4], [Source: Deck.pptx, Slide 2]
  // 3) Single-doc citations: [Page 4], [Slide 2]
  // 4) Bare multi-doc index citations (only when multi-doc sources exist): [1], [Doc 2]
  const combinedRegex = new RegExp(
    [
      "(?:\\[|\\()(?:Doc(?:ument)?\\s*|D)?([0-9]{1,2})\\s*(?:•|·|\\||-|–|,|:)?\\s*(?:(p\\.?|pages?|pp\\.?)|(s\\.?|slides?))\\s*([0-9]+)(?:\\s*[-–]\\s*([0-9]+))?(?:\\]|\\))",
      "(?:\\[|\\()(?:Source:\\s*)?([^\\]\\)]+?\\.(?:pdf|docx?|pptx?))\\s*(?:•|·|\\||-|–|,|:)\\s*(?:(p\\.?|pages?)|(s\\.?|slides?))\\s*([0-9]+)(?:\\s*[-–]\\s*[0-9]+)?(?:\\]|\\))",
      "(?:\\[|\\()?(Page|Slide)s?\\s*([0-9]+)(?:\\]|\\))?",
      "(^|[^\\w\\]])\\[(?:Doc(?:ument)?\\s*)?([1-9][0-9]?)\\](?!\\()",
    ].join("|"),
    "gi"
  );

  const formattedText = bodyText.replace(
    combinedRegex,
    (
      match,
      idxNum,
      idxPageUnit,
      idxSlideUnit,
      idxStartPage,
      idxEndPage,
      docName,
      docPageUnit,
      docSlideUnit,
      docPageNum,
      singleUnit,
      singleNum,
      barePrefix,
      bareIdx
    ) => {
      // Branch 1: Indexed citation [1 · p.4]
      if (idxNum && idxStartPage) {
        const docIdx = parseInt(idxNum, 10);
        if (docIdx >= 1 && docIdx <= effectiveSources.length) {
          citedSet.add(docIdx);
          const isSlide = Boolean(idxSlideUnit);
          const unit = isSlide ? "slide" : "page";
          const unitShort = isSlide ? "s" : "p";
          const rangeLabel = idxEndPage
            ? `${idxStartPage}-${idxEndPage}`
            : idxStartPage;
          return `[${docIdx} · ${unitShort}.${rangeLabel}](#jump-idx-${docIdx}-${unit}-${idxStartPage})`;
        }
        return match;
      }

      // Branch 2: Legacy/explicit filename citation [Report.pdf • Page 4]
      if (docName && docPageNum) {
        const cleanDoc = docName.trim();
        const isSlide = Boolean(docSlideUnit);
        const unit = isSlide ? "slide" : "page";
        const unitShort = isSlide ? "s" : "p";

        const matchedIndex = effectiveSources.findIndex(
          (s) =>
            s.name.toLowerCase() === cleanDoc.toLowerCase() ||
            s.name.toLowerCase().includes(cleanDoc.toLowerCase()) ||
            cleanDoc.toLowerCase().includes(s.name.toLowerCase())
        );

        if (matchedIndex !== -1 && effectiveSources.length > 1) {
          const docIdx = matchedIndex + 1;
          citedSet.add(docIdx);
          return `[${docIdx} · ${unitShort}.${docPageNum}](#jump-idx-${docIdx}-${unit}-${docPageNum})`;
        }

        const displayUnit = isSlide ? "Slide" : "Page";
        return `[${cleanDoc} • ${displayUnit} ${docPageNum}](#jump-doc-${encodeURIComponent(
          cleanDoc
        )}-${unit}-${docPageNum})`;
      }

      // Branch 3: Single-document citation [Page 4] / [Slide 2]
      if (singleUnit && singleNum) {
        const unitTitle =
          singleUnit.charAt(0).toUpperCase() +
          singleUnit.slice(1).toLowerCase();
        return `[${unitTitle} ${singleNum}](#jump-${singleUnit.toLowerCase()}-${singleNum})`;
      }

      // Branch 4: Bare multi-doc reference [1] / [Doc 2]
      if (bareIdx) {
        const docIdx = parseInt(bareIdx, 10);
        if (
          effectiveSources.length > 1 &&
          docIdx >= 1 &&
          docIdx <= effectiveSources.length
        ) {
          citedSet.add(docIdx);
          return `${barePrefix || ""}[${docIdx}](#jump-idx-${docIdx}-page-0)`;
        }
        return match;
      }

      return match;
    }
  );

  // Include footer sources in legend whenever multi-doc response used footer mapping
  if (footerSources.length > 1 && citedSet.size === 0) {
    footerSources.forEach((_, idx) => citedSet.add(idx + 1));
  }

  return {
    formattedText,
    effectiveSources,
    citedIndices: Array.from(citedSet).sort((a, b) => a - b),
  };
}

const Message = forwardRef<HTMLDivElement, MessageProps>(
  (
    { message, isNextMessageSamePerson, isExpanded = false, docSources = [] },
    ref
  ) => {
    const [hasCopied, setHasCopied] = useState<boolean>(false);

    const handleCopy = () => {
      if (typeof message.text === "string") {
        navigator.clipboard.writeText(message.text);
        setHasCopied(true);
        setTimeout(() => setHasCopied(false), 2000);
      }
    };

    const parsed: ParsedMessageCitations =
      typeof message.text === "string" && !message.isUserMessage
        ? formatMessageCitations(message.text, docSources)
        : {
          formattedText: message.text,
          effectiveSources: docSources,
          citedIndices: [],
        };

    const { formattedText, effectiveSources, citedIndices } = parsed;

    return (
      <div
        ref={ref}
        className={cn("flex items-end gap-2 w-full max-w-full min-w-0", {
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
            "flex flex-col space-y-2 text-base min-w-0 group relative transition-all duration-300",
            message.isUserMessage
              ? cn(
                "order-1 items-end",
                isExpanded
                  ? "max-w-[calc(100%-2.25rem)] sm:max-w-[85%] lg:max-w-4xl xl:max-w-5xl"
                  : "max-w-[calc(100%-2.25rem)] sm:max-w-[78%] lg:max-w-2xl"
              )
              : cn(
                "order-2 items-start",
                isExpanded
                  ? "max-w-[calc(100%-2.25rem)] sm:max-w-[92%] lg:max-w-5xl xl:max-w-6xl"
                  : "max-w-[calc(100%-2.25rem)] sm:max-w-[88%] lg:max-w-[88%] xl:max-w-[86%]"
              )
          )}
        >
          <div
            className={cn(
              "px-3.5 sm:px-4 py-2.5 rounded-lg inline-block w-fit max-w-full min-w-0 overflow-hidden transition-all duration-200",
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
                className={cn(
                  "prose prose-sm sm:prose-base max-w-full min-w-0 break-words [overflow-wrap:anywhere] [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_code]:break-words [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto [&_a]:break-all [&_img]:max-w-full",
                  {
                    "text-zinc-50 prose-invert": message.isUserMessage,
                  }
                )}
                components={{
                  a: ({ href, children, ...props }) => {
                    if (href?.startsWith("#jump-idx-")) {
                      const parts = href.replace("#jump-idx-", "").split("-");
                      const docIdx = parseInt(parts[0], 10);
                      const type = parts[1] || "page";
                      const num = parseInt(parts[2], 10);
                      const source = effectiveSources[docIdx - 1];
                      const validPage = !isNaN(num) && num > 0 ? num : undefined;

                      return (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            window.dispatchEvent(
                              new CustomEvent("quill:jump-to-doc", {
                                detail: {
                                  docId: source?.id || undefined,
                                  docName:
                                    source?.name || `Document ${docIdx}`,
                                  page: validPage,
                                  type,
                                },
                              })
                            );
                          }}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 mx-0.5 rounded-md text-[11px] font-semibold bg-blue-100/90 hover:bg-blue-200 text-blue-800 border border-blue-300/80 transition-all cursor-pointer not-prose align-baseline active:scale-95 select-none"
                          title={
                            source?.name
                              ? validPage
                                ? `${source.name} — ${type === "slide" ? "Slide" : "Page"
                                } ${validPage}`
                                : `Switch to ${source.name}`
                              : undefined
                          }
                        >
                          <span>{children}</span>
                        </button>
                      );
                    }

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
                                detail: {
                                  docName,
                                  page: isNaN(num) ? undefined : num,
                                  type,
                                },
                              })
                            );
                          }}
                          className="inline-flex items-center gap-1 px-2 py-0.5 mx-0.5 rounded text-xs font-semibold bg-blue-100 hover:bg-blue-200 text-blue-800 border border-blue-300 transition-all cursor-pointer not-prose align-baseline shadow-xs active:scale-95 select-none max-w-full min-w-0"
                          title={`Switch to ${docName} - ${type} ${num}`}
                        >
                          <FileText className="h-3 w-3 text-blue-600 shrink-0" />
                          <span className="truncate">{children}</span>
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
              formattedText
            )}

            {/* Compact Multi-Document Sources Key */}
            {!message.isUserMessage &&
              effectiveSources.length > 1 &&
              citedIndices.length > 0 && (
                <div className="mt-2 pt-2 border-t border-zinc-300/80 flex flex-wrap items-center gap-1.5 not-prose min-w-0 max-w-full">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mr-0.5">
                    Sources:
                  </span>
                  {citedIndices.map((docIdx) => {
                    const src = effectiveSources[docIdx - 1];
                    if (!src) return null;
                    return (
                      <button
                        key={`${docIdx}-${src.name}`}
                        type="button"
                        onClick={() => {
                          window.dispatchEvent(
                            new CustomEvent("quill:jump-to-doc", {
                              detail: {
                                docId: src.id || undefined,
                                docName: src.name,
                              },
                            })
                          );
                        }}
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-white hover:bg-blue-50 text-zinc-700 hover:text-blue-700 border border-zinc-300 hover:border-blue-300 text-[11px] font-medium transition-colors max-w-full sm:max-w-[190px] min-w-0"
                        title={`Open ${src.name}`}
                      >
                        <span className="inline-flex h-3.5 min-w-[14px] items-center justify-center rounded bg-blue-600 text-white text-[9px] font-bold px-0.5 shrink-0">
                          {docIdx}
                        </span>
                        <span className="truncate">{src.name}</span>
                      </button>
                    );
                  })}
                </div>
              )}

            {message.id !== "loading-message" ? (
              <div
                className={cn(
                  "text-xs select-none mt-2 w-full flex items-center justify-between gap-2",
                  {
                    "text-zinc-500": !message.isUserMessage,
                    "text-blue-300 justify-end": message.isUserMessage,
                  }
                )}
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
                        <span className="text-green-700 font-semibold">
                          Copied
                        </span>
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
