import { cn } from "@/lib/utils";
import { ExtendedMessage } from "@/types/message";
import { Icons } from "../Icons";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import remarkGfm from "remark-gfm";
import rehypeKatex from "rehype-katex";
import InteractiveQuiz from "./InteractiveQuiz";
import InteractiveFlashcards from "./InteractiveFlashcards";
import {
  parseQuizData,
  parseFlashcardsData,
  detectStreamingInteractiveFence,
} from "@/lib/interactive-content";
import { format } from "date-fns";
import { Children, forwardRef, isValidElement, useState } from "react";
import { Check, Copy, FileText, Loader2 } from "lucide-react";
import { dispatchPageJump } from "@/lib/page-jump";
import { copyMessageForWord } from "@/lib/word-clipboard";

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

function encodeJumpSegment(value: string): string {
  return encodeURIComponent(value).replace(/\(/g, "%28").replace(/\)/g, "%29");
}

function parseSourcesFooter(rawText: string): {
  bodyText: string;
  footerSources: DocSourceRef[];
} {
  const footerMatch = rawText.match(
    /\n+(?:\*\*)?Sources:(?:\*\*)?\s*(?:[-•*]\s*)?((?:\[\d+\][\s\S]+?))$/i
  );
  if (!footerMatch) {
    return { bodyText: rawText, footerSources: [] };
  }

  const footerStr = footerMatch[1].trim();
  const entries: Array<{ idx: number; name: string }> = [];
  const itemRegex = /\[(\d+)\]\s*([^|\n]+?)(?=\s*(?:[|·]\s*|[-•*]\s*)?\[\d+\]|$)/g;
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

  // Preserve mathematical formulas ($$...$$ and $...$) so equations with brackets/indices are never altered by citations
  const mathPlaceholders: string[] = [];
  let protectedBody = bodyText.replace(/\$\$[\s\S]*?\$\$/g, (block) => {
    const token = `\u0000MATHBLK_${mathPlaceholders.length}\u0000`;
    mathPlaceholders.push(block);
    return token;
  });

  protectedBody = protectedBody.replace(/(?<!\\)\$(?!\$)([^\$\n]+?)(?<!\\)\$/g, (block) => {
    const token = `\u0000MATHBLK_${mathPlaceholders.length}\u0000`;
    mathPlaceholders.push(block);
    return token;
  });

  // Preserve fenced code blocks & non-citation inline code; unwrap citation-only backticks like `[Slide 5]`
  const codePlaceholders: string[] = [];
  const citationOnlyCodeRegex =
    /^`((?:[\[(]?(?:Doc(?:ument)?\s*\d+|Source:[^\n`]+|Page|Slide|Diapositiva|Diapositive|Folie|s\.|p\.)[^\n`]*[\])]?))`$/i;
  protectedBody = protectedBody
    .replace(/```[\s\S]*?```/g, (block) => {
      const token = `\u0000CODEBLK_${codePlaceholders.length}\u0000`;
      codePlaceholders.push(block);
      return token;
    })
    .replace(/`([^`\n]+)`/g, (full, inner) => {
      if (citationOnlyCodeRegex.test(full)) {
        return inner.trim();
      }
      const token = `\u0000CODEBLK_${codePlaceholders.length}\u0000`;
      codePlaceholders.push(full);
      return token;
    });

  const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const knownDocNames = effectiveSources
    .flatMap((s) => {
      const n = (s.name || "").trim();
      if (!n) return [];
      const base = n.replace(/\.(pdf|docx?|pptx?)$/i, "").trim();
      return base && base.length >= 2 && base !== n ? [n, base] : [n];
    })
    .filter((n) => n.length >= 2)
    .sort((a, b) => b.length - a.length)
    .map(escapeRegex);

  const docNameMatcher =
    knownDocNames.length > 0
      ? `(?:[^\\]\\)\\n]+?\\.(?:pdf|docx?|pptx?)|${knownDocNames.join("|")})`
      : "[^\\]\\)\\n]+?\\.(?:pdf|docx?|pptx?)";

  const slideWordRe = "(?:slides?|diapositivas?|diapositives?|folien?)";
  const unitWordRe = `(?:pages?|${slideWordRe})`;
  const isSlideUnit = (u: string) =>
    /^(?:s\.?|slides?|diapositivas?|diapositives?|folien?)$/i.test(u.trim());

  // Priority-ordered patterns using single left-to-right pass so Markdown links never nest
  const branch1Indexed = new RegExp(
    `^[\\[(](?:Doc(?:ument)?\\s*|D)?([0-9]{1,2})\\s*(?:•|·|\\||-|–|,|:)?\\s*((?:p\\.?|pages?|pp\\.?)|(?:s\\.?|${slideWordRe}))\\s*#?([0-9]+)(?:\\s*[-–]\\s*([0-9]+))?(?:\\s*[:—–-]\\s*([^\\]\\)\\n]{1,60}))?[\\])]$`,
    "i"
  );
  const branch2Doc = new RegExp(
    `^[\\[(](?:Source:\\s*)?(${docNameMatcher})\\s*(?:•|·|\\||-|–|,|:)\\s*((?:p\\.?|pages?|pp\\.?)|(?:s\\.?|${slideWordRe}))\\s*#?([0-9]+)(?:\\s*[-–]\\s*([0-9]+))?(?:\\s*[:—–-]\\s*[^\\]\\)\\n]{1,60})?[\\])]$`,
    "i"
  );
  const branch3BracketUnit = new RegExp(
    `^[\\[(](${unitWordRe})\\s*#?([0-9]+(?:\\s*(?:[-–&,]|and)\\s*#?[0-9]+)*)(?:\\s*[:—–-]\\s*([^\\]\\)\\n]{1,60}))?[\\])]$`,
    "i"
  );
  const branch4ShortUnit =
    /^[\[(](s\.?|p\.?)\s*#?([0-9]+)(?:\s*[-–]\s*([0-9]+))?[\])]$/i;
  const branch5BareUnit = new RegExp(
    `^(${unitWordRe})\\s*#?([0-9]+(?:\\s*(?:[-–&,]|and)\\s*#?[0-9]+)*)$`,
    "i"
  );
  const branch6BareIdx =
    /^(^|[^\w\]])\[(?:Doc(?:ument)?\s*)?([1-9][0-9]?)\]$/i;

  const combinedRegex = new RegExp(
    [
      `(?:\\[|\\()(?:Doc(?:ument)?\\s*|D)?[0-9]{1,2}\\s*(?:•|·|\\||-|–|,|:)?\\s*(?:p\\.?|pages?|pp\\.?|s\\.?|${slideWordRe})\\s*#?[0-9]+(?:\\s*[-–]\\s*[0-9]+)?(?:\\s*[:—–-]\\s*[^\\]\\)\\n]{1,60})?(?:\\]|\\))(?!\\()`,
      `(?:\\[|\\()(?:Source:\\s*)?${docNameMatcher}\\s*(?:•|·|\\||-|–|,|:)\\s*(?:p\\.?|pages?|pp\\.?|s\\.?|${slideWordRe})\\s*#?[0-9]+(?:\\s*[-–]\\s*[0-9]+)?(?:\\s*[:—–-]\\s*[^\\]\\)\\n]{1,60})?(?:\\]|\\))(?!\\()`,
      `(?:\\[|\\()${unitWordRe}\\s*#?[0-9]+(?:\\s*(?:[-–&,]|and)\\s*#?[0-9]+)*(?:\\s*[:—–-]\\s*[^\\]\\)\\n]{1,60})?(?:\\]|\\))(?!\\()`,
      "(?:\\[|\\()(?:s\\.?|p\\.?)\\s*#?[0-9]+(?:\\s*[-–]\\s*[0-9]+)?(?:\\]|\\))(?!\\()",
      `\\b${unitWordRe}\\s*#?[0-9]+(?:\\s*(?:[-–&,]|\\band\\b)\\s*#?[0-9]+)*(?![\\]\\w])(?!\\s*\\()`,
      "(?:^|[^\\w\\]])\\[(?:Doc(?:ument)?\\s*)?[1-9][0-9]?\\](?!\\()",
    ].join("|"),
    "gi"
  );

  const linkifyMultiNumbers = (
    rawUnit: string,
    numsSpec: string,
    trailingTitle?: string
  ): string => {
    const slide = isSlideUnit(rawUnit);
    const unitLower = slide ? "slide" : "page";
    const unitTitle = slide ? "Slide" : "Page";

    // Single range (e.g. "3-5" or "3–5") -> single button pointing to start slide/page
    const rangeOnly = numsSpec.match(/^#?([0-9]+)\s*[-–]\s*#?([0-9]+)$/);
    if (rangeOnly) {
      const label = trailingTitle
        ? `${unitTitle}s ${rangeOnly[1]}–${rangeOnly[2]}: ${trailingTitle.trim()}`
        : `${unitTitle}s ${rangeOnly[1]}–${rangeOnly[2]}`;
      return `[${label}](#jump-${unitLower}-${rangeOnly[1]})`;
    }

    // List of numbers (e.g. "3, 5, and 7" or "3 & 5") -> each number clickable!
    if (/[,&]|\band\b/i.test(numsSpec)) {
      const replaced = numsSpec.replace(/#?([0-9]+)/g, (num) => {
        const cleanNum = num.replace("#", "");
        return `[${unitTitle} ${cleanNum}](#jump-${unitLower}-${cleanNum})`;
      });
      return trailingTitle ? `${replaced}: ${trailingTitle.trim()}` : replaced;
    }

    const singleNum = numsSpec.replace(/^#/, "").trim();
    const label = trailingTitle
      ? `${unitTitle} ${singleNum}: ${trailingTitle.trim()}`
      : `${unitTitle} ${singleNum}`;
    return `[${label}](#jump-${unitLower}-${singleNum})`;
  };

  let formattedText = protectedBody.replace(combinedRegex, (match) => {
    // 1. Indexed citation [1 · s.5]
    const m1 = match.match(branch1Indexed);
    if (m1) {
      const docIdx = parseInt(m1[1], 10);
      const unitStr = m1[2];
      const startPage = m1[3];
      const endPage = m1[4];
      if (docIdx >= 1 && docIdx <= effectiveSources.length) {
        citedSet.add(docIdx);
        const slide = isSlideUnit(unitStr);
        const unit = slide ? "slide" : "page";
        const unitShort = slide ? "s" : "p";
        const rangeLabel = endPage ? `${startPage}-${endPage}` : startPage;
        return `[${docIdx} · ${unitShort}.${rangeLabel}](#jump-idx-${docIdx}-${unit}-${startPage})`;
      }
      return match;
    }

    // 2. Filename citation [Report.pptx • Slide 5]
    const m2 = match.match(branch2Doc);
    if (m2) {
      const cleanDoc = m2[1].trim();
      const slide = isSlideUnit(m2[2]);
      const unit = slide ? "slide" : "page";
      const unitShort = slide ? "s" : "p";
      const pageNum = m2[3];
      const endNum = m2[4];
      const lowerClean = cleanDoc.toLowerCase();

      const matchedIndex = effectiveSources.findIndex((s) => {
        const sLower = (s.name || "").toLowerCase();
        const sBase = sLower.replace(/\.(pdf|docx?|pptx?)$/i, "").trim();
        return (
          sLower === lowerClean ||
          sBase === lowerClean ||
          sLower.includes(lowerClean) ||
          lowerClean.includes(sLower)
        );
      });

      if (matchedIndex !== -1 && effectiveSources.length > 1) {
        const docIdx = matchedIndex + 1;
        citedSet.add(docIdx);
        const label = endNum ? `${pageNum}-${endNum}` : pageNum;
        return `[${docIdx} · ${unitShort}.${label}](#jump-idx-${docIdx}-${unit}-${pageNum})`;
      }

      const resolvedName =
        matchedIndex !== -1 ? effectiveSources[matchedIndex].name : cleanDoc;
      const displayUnit = slide ? "Slide" : "Page";
      const displayRange = endNum ? `${pageNum}–${endNum}` : pageNum;
      return `[${cleanDoc} • ${displayUnit} ${displayRange}](#jump-doc-${encodeJumpSegment(
        resolvedName
      )}-${unit}-${pageNum})`;
    }

    // 3. Bracketed [Slide 5], [Slide 5: Topic], [Slides 3-5], (Slide 4)
    const m3 = match.match(branch3BracketUnit);
    if (m3) {
      return linkifyMultiNumbers(m3[1], m3[2], m3[3]);
    }

    // 4. Shorthand [s.5], [p.3-4]
    const m4 = match.match(branch4ShortUnit);
    if (m4) {
      const slide = isSlideUnit(m4[1]);
      const unit = slide ? "slide" : "page";
      const displayUnit = slide ? "Slide" : "Page";
      const label = m4[3]
        ? `${displayUnit}s ${m4[2]}–${m4[3]}`
        : `${displayUnit} ${m4[2]}`;
      return `[${label}](#jump-${unit}-${m4[2]})`;
    }

    // 5. Bare Slide 5 / Slides 3, 5, and 7 / Slides 3-5
    const m5 = match.match(branch5BareUnit);
    if (m5) {
      return linkifyMultiNumbers(m5[1], m5[2]);
    }

    // 6. Bare [1] / [Doc 2]
    const m6 = match.match(branch6BareIdx);
    if (m6) {
      const barePrefix = m6[1] || "";
      const docIdx = parseInt(m6[2], 10);
      if (
        effectiveSources.length > 1 &&
        docIdx >= 1 &&
        docIdx <= effectiveSources.length
      ) {
        citedSet.add(docIdx);
        return `${barePrefix}[${docIdx}](#jump-idx-${docIdx}-page-0)`;
      }
      return match;
    }

    return match;
  });

  // Restore protected code blocks & mathematical equations
  formattedText = formattedText.replace(/\u0000CODEBLK_(\d+)\u0000/g, (_, idx) => {
    return codePlaceholders[Number(idx)] ?? "";
  });
  formattedText = formattedText.replace(/\u0000MATHBLK_(\d+)\u0000/g, (_, idx) => {
    return mathPlaceholders[Number(idx)] ?? "";
  });

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

    const parsed: ParsedMessageCitations =
      typeof message.text === "string" && !message.isUserMessage
        ? formatMessageCitations(message.text, docSources)
        : {
          formattedText: message.text,
          effectiveSources: docSources,
          citedIndices: [],
        };

    const { formattedText, effectiveSources, citedIndices } = parsed;

    const handleCopy = async () => {
      if (typeof message.text === "string") {
        const copied = await copyMessageForWord(message.text, {
          effectiveSources,
          citedIndices,
        });
        if (copied) {
          setHasCopied(true);
          setTimeout(() => setHasCopied(false), 2000);
        }
      }
    };

    return (
      <div
        ref={ref}
        data-chat-message="true"
        className={cn("flex items-end gap-2 w-full max-w-full min-w-0", {
          "justify-end": message.isUserMessage,
        })}
      >
        <div
          data-copy-ignore="true"
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
            data-chat-message-content="true"
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
            {(() => {
              if (typeof formattedText !== "string") {
                return formattedText;
              }

              const streamingFence = !message.isUserMessage
                ? detectStreamingInteractiveFence(formattedText)
                : { type: null, prefixText: "" };

              if (
                !message.isUserMessage &&
                !streamingFence.type &&
                !formattedText.includes("```")
              ) {
                const standaloneQuiz = parseQuizData(formattedText);
                if (standaloneQuiz && standaloneQuiz.questions.length >= 2) {
                  return <InteractiveQuiz data={standaloneQuiz} />;
                }
                const standaloneFlashcards = parseFlashcardsData(formattedText);
                if (standaloneFlashcards && standaloneFlashcards.cards.length >= 2) {
                  return <InteractiveFlashcards data={standaloneFlashcards} />;
                }
              }

              const markdownSource = streamingFence.type
                ? streamingFence.prefixText
                : formattedText;

              const renderInteractiveBlock = (
                lang: string,
                codeString: string
              ) => {
                if (
                  lang === "quiz" ||
                  lang === "quiz-json" ||
                  lang === "json:quiz"
                ) {
                  const quizData = parseQuizData(codeString);
                  if (quizData) return <InteractiveQuiz data={quizData} />;
                }

                if (
                  lang === "flashcards" ||
                  lang === "flashcard" ||
                  lang === "cards" ||
                  lang === "flashcards-json" ||
                  lang === "json:flashcards"
                ) {
                  const flashcardsData = parseFlashcardsData(codeString);
                  if (flashcardsData) {
                    return <InteractiveFlashcards data={flashcardsData} />;
                  }
                }

                if (lang === "json") {
                  const quizData = parseQuizData(codeString);
                  if (quizData) return <InteractiveQuiz data={quizData} />;
                  const flashData = parseFlashcardsData(codeString);
                  if (flashData) return <InteractiveFlashcards data={flashData} />;
                }

                return null;
              };

              return (
                <>
                  {markdownSource ? (
                    <ReactMarkdown
                      className={cn(
                        "prose prose-sm sm:prose-base max-w-full min-w-0 break-words [overflow-wrap:anywhere] [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_code]:break-words [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto [&_a]:break-all [&_img]:max-w-full",
                        {
                          "text-zinc-50 prose-invert": message.isUserMessage,
                        }
                      )}
                      remarkPlugins={[remarkMath, remarkGfm]}
                      rehypePlugins={[rehypeKatex]}
                      components={{
                        pre: ({ children, ...props }) => {
                          const firstChild = Children.toArray(children)[0];
                          if (isValidElement(firstChild)) {
                            const childProps = firstChild.props as {
                              className?: string;
                              children?: unknown;
                            };
                            const match = /language-([\w:-]+)/.exec(
                              childProps.className || ""
                            );
                            const lang = match ? match[1].toLowerCase() : "";
                            const codeString = String(
                              childProps.children || ""
                            ).replace(/\n$/, "");

                            if (lang && renderInteractiveBlock(lang, codeString)) {
                              return <>{children}</>;
                            }
                          }
                          return <pre {...props}>{children}</pre>;
                        },
                        code: ({ node, inline, className, children, ...props }: any) => {
                          const match = /language-([\w:-]+)/.exec(className || "");
                          const lang = match ? match[1].toLowerCase() : "";
                          const codeString = String(children || "").replace(/\n$/, "");

                          if (!inline && lang) {
                            const interactiveWidget = renderInteractiveBlock(
                              lang,
                              codeString
                            );
                            if (interactiveWidget) {
                              return interactiveWidget;
                            }
                          }

                          return (
                            <code className={className} {...props}>
                              {children}
                            </code>
                          );
                        },
                        table: ({ children, ...props }) => (
                          <div className="my-3 w-full max-w-full overflow-x-auto rounded-lg border border-zinc-200/90 bg-white shadow-sm">
                            <table className="w-full border-collapse text-left text-xs sm:text-sm font-sans" {...props}>
                              {children}
                            </table>
                          </div>
                        ),
                      th: ({ children, ...props }) => (
                        <th className="border-b border-zinc-200 bg-zinc-100/90 px-3 py-2 font-bold text-zinc-900 text-xs sm:text-sm" {...props}>
                          {children}
                        </th>
                      ),
                      td: ({ children, ...props }) => (
                        <td className="border-b border-zinc-100 px-3 py-2 text-zinc-800 text-xs sm:text-sm" {...props}>
                          {children}
                        </td>
                      ),
                      tr: ({ children, ...props }) => (
                        <tr className="hover:bg-zinc-50/70 transition-colors" {...props}>
                          {children}
                        </tr>
                      ),
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
                          data-copy-citation="true"
                          data-copy-brackets="true"
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
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 mx-0.5 rounded-md text-[11px] font-semibold bg-blue-100/90 hover:bg-blue-200 text-blue-800 border border-blue-300/80 transition-all cursor-pointer not-prose align-baseline active:scale-95"
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
                          data-copy-citation="true"
                          data-copy-brackets="true"
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
                          className="inline-flex items-center gap-1 px-2 py-0.5 mx-0.5 rounded text-xs font-semibold bg-blue-100 hover:bg-blue-200 text-blue-800 border border-blue-300 transition-all cursor-pointer not-prose align-baseline shadow-xs active:scale-95 max-w-full min-w-0"
                          title={`Switch to ${docName} - ${type} ${num}`}
                        >
                          <FileText
                            aria-hidden="true"
                            data-copy-ignore="true"
                            className="h-3 w-3 text-blue-600 shrink-0"
                          />
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
                          data-copy-citation="true"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (!isNaN(num) && num > 0) {
                              if (effectiveSources.length > 1 && type === "slide") {
                                const pptxSources = effectiveSources.filter((s) =>
                                  /\.(pptx?|PPTX?)$/i.test(s.name || "")
                                );
                                if (pptxSources.length === 1) {
                                  window.dispatchEvent(
                                    new CustomEvent("quill:jump-to-doc", {
                                      detail: {
                                        docId: pptxSources[0].id || undefined,
                                        docName: pptxSources[0].name,
                                        page: num,
                                        type,
                                      },
                                    })
                                  );
                                  return;
                                }
                              }
                              const singleTargetId =
                                effectiveSources.length === 1 && effectiveSources[0]?.id
                                  ? effectiveSources[0].id
                                  : undefined;
                              dispatchPageJump({
                                fileId: singleTargetId,
                                page: num,
                                type,
                              });
                            }
                          }}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 mx-0.5 rounded text-xs font-semibold bg-blue-100 hover:bg-blue-200 text-blue-800 border border-blue-300 transition-all cursor-pointer not-prose align-baseline shadow-xs active:scale-95"
                          title={`Jump to ${type} ${num}`}
                        >
                          <FileText
                            aria-hidden="true"
                            data-copy-ignore="true"
                            className="h-3 w-3 text-blue-600 shrink-0"
                          />
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
                {markdownSource}
              </ReactMarkdown>
                  ) : null}
                  {streamingFence.type ? (
                    <div className="not-prose my-2.5 flex items-center gap-3 rounded-xl border border-blue-200/80 bg-blue-50/70 px-4 py-3.5 text-sm font-sans text-zinc-700 shadow-sm">
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-blue-600" />
                      <div>
                        <p className="font-semibold text-zinc-900">
                          {streamingFence.type === "quiz"
                            ? "Designing your interactive practice quiz..."
                            : "Preparing your interactive study flashcards..."}
                        </p>
                        <p className="text-xs text-zinc-500 mt-0.5">
                          Formatting questions, options, and solutions
                        </p>
                      </div>
                    </div>
                  ) : null}
                </>
              );
            })()}

            {/* Compact Multi-Document Sources Key */}
            {!message.isUserMessage &&
              effectiveSources.length > 1 &&
              citedIndices.length > 0 && (
                <div
                  data-copy-sources="true"
                  className="mt-2 pt-2 border-t border-zinc-300/80 flex flex-wrap items-center gap-1.5 not-prose min-w-0 max-w-full"
                >
                  <span
                    data-copy-ignore="true"
                    className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mr-0.5"
                  >
                    Sources:
                  </span>
                  {citedIndices.map((docIdx) => {
                    const src = effectiveSources[docIdx - 1];
                    if (!src) return null;
                    return (
                      <button
                        key={`${docIdx}-${src.name}`}
                        type="button"
                        data-copy-source-item={`[${docIdx}] ${src.name}`}
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
                data-copy-ignore="true"
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
