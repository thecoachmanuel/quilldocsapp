import React, { useState } from "react";
import { ExamPaperData } from "@/lib/interactive-content";
import {
  downloadExamDocx,
  downloadExamPdf,
  ExamExportKind,
} from "@/lib/exam-export";
import MathMarkdown from "./MathMarkdown";
import { cn } from "@/lib/utils";
import {
  ChevronDown,
  ChevronUp,
  Download,
  GraduationCap,
  Loader2,
} from "lucide-react";

interface InteractiveExamProps {
  data: ExamPaperData;
}

const OPTION_LETTERS = ["A", "B", "C", "D", "E", "F"];

export const InteractiveExam: React.FC<InteractiveExamProps> = ({ data }) => {
  const [activeTab, setActiveTab] = useState<"questions" | "solutions">(
    "questions"
  );
  const [showPreview, setShowPreview] = useState<boolean>(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const mcqCount = data.mcqQuestions.length;
  const theoryCount = data.theoryQuestions.length;
  const totalMarks =
    data.mcqQuestions.reduce((acc, q) => acc + (q.marks || 1), 0) +
    data.theoryQuestions.reduce((acc, q) => acc + (q.marks || 10), 0);

  const hasSolutions =
    data.includeSolutions ||
    data.theoryQuestions.some((q) => Boolean(q.solution)) ||
    data.mcqQuestions.some((q) => Boolean(q.explanation));

  const activeFormat: "docx" | "pdf" =
    data.requestedFormats?.[0] === "pdf" ? "pdf" : "docx";
  const extLabel = activeFormat === "pdf" ? ".PDF" : ".DOCX";

  const handleDownload = async (
    kind: ExamExportKind,
    format: "docx" | "pdf"
  ) => {
    const key = `${kind}-${format}`;
    setBusyKey(key);
    setExportError(null);
    try {
      if (format === "docx") {
        await downloadExamDocx(data, kind);
      } else {
        downloadExamPdf(data, kind);
      }
    } catch (err) {
      console.error("[InteractiveExam] Export failed:", err);
      setExportError("Could not generate file. Please try again.");
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div
      data-interactive-exam="true"
      className="my-3 w-full max-w-full rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden not-prose font-sans"
    >
      {/* Simple Header */}
      <div className="p-4 border-b border-zinc-200 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white shrink-0">
            <GraduationCap className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h4 className="text-base font-bold text-gray-900 break-words">
              {data.title || "Examination Paper"}
            </h4>
            <p className="text-xs text-zinc-500 mt-0.5">
              {[
                mcqCount > 0 ? `${mcqCount} MCQ` : null,
                theoryCount > 0 ? `${theoryCount} Theory` : null,
                `${totalMarks} Marks`,
                data.duration || null,
                "Times New Roman · 12pt",
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowPreview((prev) => !prev)}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-zinc-700 hover:bg-zinc-100 border border-zinc-200 transition shrink-0"
        >
          <span>{showPreview ? "Hide Preview" : "Show Preview"}</span>
          {showPreview ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
        </button>
      </div>

      {/* Download Buttons */}
      <div className="px-4 py-3 bg-zinc-50/70 border-b border-zinc-200 flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          disabled={busyKey !== null}
          onClick={() => handleDownload("questions", activeFormat)}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition active:scale-95 disabled:opacity-60"
        >
          {busyKey === `questions-${activeFormat}` ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          <span>Download Questions ({extLabel})</span>
        </button>

        {hasSolutions && (
          <button
            type="button"
            disabled={busyKey !== null}
            onClick={() => handleDownload("solutions", activeFormat)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-semibold bg-white hover:bg-zinc-50 text-gray-800 border border-zinc-300 shadow-sm transition active:scale-95 disabled:opacity-60"
          >
            {busyKey === `solutions-${activeFormat}` ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4 text-blue-600" />
            )}
            <span>Download Solutions ({extLabel})</span>
          </button>
        )}

        {exportError && (
          <p className="text-xs font-medium text-rose-600 w-full">
            {exportError}
          </p>
        )}
      </div>

      {/* Preview */}
      {showPreview && (
        <div className="p-4 space-y-3">
          {hasSolutions && (
            <div className="flex items-center gap-1.5 border-b border-zinc-200 pb-2.5">
              <button
                type="button"
                onClick={() => setActiveTab("questions")}
                className={cn(
                  "px-3 py-1 rounded-md text-xs font-semibold transition",
                  activeTab === "questions"
                    ? "bg-blue-600 text-white"
                    : "text-zinc-600 hover:bg-zinc-100"
                )}
              >
                Questions
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("solutions")}
                className={cn(
                  "px-3 py-1 rounded-md text-xs font-semibold transition",
                  activeTab === "solutions"
                    ? "bg-blue-600 text-white"
                    : "text-zinc-600 hover:bg-zinc-100"
                )}
              >
                Solutions
              </button>
            </div>
          )}

          <div
            className="rounded-lg border border-zinc-200 bg-white p-4 sm:p-6 text-zinc-900 space-y-4 max-h-[460px] overflow-y-auto leading-relaxed"
            style={{ fontFamily: '"Times New Roman", Times, Georgia, serif' }}
          >
            <div className="text-center border-b border-zinc-300 pb-2.5 space-y-0.5">
              {data.courseCode && (
                <p className="text-sm font-bold uppercase">{data.courseCode}</p>
              )}
              <h5 className="text-base font-bold uppercase">
                {activeTab === "solutions"
                  ? `${data.title} — SOLUTIONS`
                  : data.title}
              </h5>
              <p className="text-xs font-semibold text-zinc-700">
                {[
                  data.duration ? `Time: ${data.duration}` : null,
                  `Total Marks: ${totalMarks}`,
                ]
                  .filter(Boolean)
                  .join(" | ")}
              </p>
            </div>

            {activeTab === "questions" ? (
              <>
                {mcqCount > 0 && (
                  <div className="space-y-3">
                    <h6 className="text-sm font-bold underline uppercase">
                      Section A: Multiple Choice
                    </h6>
                    {data.mcqQuestions.map((q, idx) => (
                      <div key={`${q.id}-${idx}`} className="space-y-1 text-sm">
                        <div className="flex items-start gap-2">
                          <span className="font-bold shrink-0">{idx + 1}.</span>
                          <div className="flex-1 min-w-0">
                            <MathMarkdown content={q.question} size="normal" />
                          </div>
                        </div>
                        <div className="pl-5 space-y-0.5">
                          {q.options.map((opt, oIdx) => (
                            <div key={oIdx} className="flex items-start gap-2">
                              <span className="font-bold shrink-0">
                                {OPTION_LETTERS[oIdx] || oIdx + 1}.
                              </span>
                              <div className="flex-1 min-w-0">
                                <MathMarkdown
                                  content={opt}
                                  size="normal"
                                  className="[&_p]:my-0"
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {theoryCount > 0 && (
                  <div className="space-y-3 pt-2">
                    <h6 className="text-sm font-bold underline uppercase">
                      Section B: Theory Questions
                    </h6>
                    {data.theoryQuestions.map((q, idx) => (
                      <div key={`${q.id}-${idx}`} className="space-y-1 text-sm">
                        <div className="flex items-start gap-2">
                          <span className="font-bold shrink-0">
                            Q{idx + 1}.
                          </span>
                          <div className="flex-1 min-w-0">
                            <MathMarkdown content={q.question} size="normal" />
                            <span className="font-bold">
                              {" "}
                              [{q.marks || 10} Marks]
                            </span>
                          </div>
                        </div>
                        {q.subQuestions && q.subQuestions.length > 0 && (
                          <div className="pl-6 space-y-0.5">
                            {q.subQuestions.map((sub, sIdx) => (
                              <div key={sIdx}>
                                <MathMarkdown
                                  content={sub}
                                  size="normal"
                                  className="[&_p]:my-0"
                                />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="space-y-3 text-sm">
                {mcqCount > 0 && (
                  <div className="space-y-2">
                    <h6 className="font-bold underline uppercase">
                      Section A: Answers
                    </h6>
                    {data.mcqQuestions.map((q, idx) => {
                      const letter =
                        q.correctIndex >= 0 && q.correctIndex < q.options.length
                          ? OPTION_LETTERS[q.correctIndex] ||
                            String(q.correctIndex + 1)
                          : "-";
                      const ans =
                        q.correctIndex >= 0 && q.correctIndex < q.options.length
                          ? q.options[q.correctIndex]
                          : "";
                      return (
                        <div key={`${q.id}-${idx}`} className="space-y-0.5">
                          <p className="font-bold">
                            {idx + 1}. {letter}
                            {ans ? ` — ${ans}` : ""}
                          </p>
                          {q.explanation && (
                            <div className="text-zinc-700 pl-3">
                              <MathMarkdown
                                content={q.explanation}
                                size="normal"
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {theoryCount > 0 && (
                  <div className="space-y-2 pt-2">
                    <h6 className="font-bold underline uppercase">
                      Section B: Solutions
                    </h6>
                    {data.theoryQuestions.map((q, idx) => (
                      <div key={`${q.id}-${idx}`} className="space-y-0.5">
                        <p className="font-bold">
                          Q{idx + 1} [{q.marks || 10} Marks]:
                        </p>
                        <div className="text-zinc-800 pl-3">
                          <MathMarkdown
                            content={
                              q.solution || "See document for solution steps."
                            }
                            size="normal"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default InteractiveExam;
