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
  Download,
  FileText,
  GraduationCap,
  CheckCircle2,
  Eye,
  ChevronDown,
  ChevronUp,
  Loader2,
  BookOpen,
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

  // Enforce one output format at a time: Word (.docx) by default, PDF only if requested
  const activeFormat: "docx" | "pdf" =
    data.requestedFormats?.[0] === "pdf" ? "pdf" : "docx";
  const formatExtLabel = activeFormat === "pdf" ? ".PDF" : ".DOCX";
  const formatNameLabel = activeFormat === "pdf" ? "PDF" : "Word (.DOCX)";

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
      className="my-3 w-full max-w-full rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden not-prose transition-all font-sans"
    >
      {/* Header */}
      <div className="bg-white border-b border-zinc-200 p-4 sm:p-5 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white shrink-0 shadow-sm mt-0.5">
            <GraduationCap className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h4 className="text-base sm:text-lg font-bold text-gray-900 break-words">
              {data.title || "Standard Examination Paper"}
            </h4>
            <p className="text-xs sm:text-sm text-zinc-600 font-medium mt-0.5">
              {[
                mcqCount > 0 ? `${mcqCount} Multiple Choice` : null,
                theoryCount > 0 ? `${theoryCount} Theory` : null,
                `${totalMarks} Total Marks`,
                data.duration || null,
              ]
                .filter(Boolean)
                .join(" • ")}
            </p>
            <p className="text-xs text-zinc-500 mt-1">
              {formatNameLabel} · Times New Roman · 12pt Font · 1.5 Line Spacing
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowPreview((prev) => !prev)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold bg-white hover:bg-zinc-50 text-zinc-700 border border-zinc-200 shadow-sm transition shrink-0"
        >
          <Eye className="h-4 w-4 text-blue-600" />
          <span>{showPreview ? "Hide Preview" : "Show Preview"}</span>
          {showPreview ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* Export Download Action Bar (Single Format at a Time) */}
      <div className="p-4 sm:p-5 bg-zinc-50/70 border-b border-zinc-200 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <FileText className="h-4 w-4 text-blue-600 shrink-0" />
            <span>Question Paper ({formatExtLabel})</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busyKey !== null}
              onClick={() => handleDownload("questions", activeFormat)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition active:scale-95 disabled:opacity-60"
            >
              {busyKey === `questions-${activeFormat}` ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              <span>Download Questions ({formatExtLabel})</span>
            </button>
          </div>
        </div>

        {hasSolutions && (
          <div className="pt-2.5 border-t border-zinc-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
              <CheckCircle2 className="h-4 w-4 text-blue-600 shrink-0" />
              <span>Separate Solutions / Marking Guide ({formatExtLabel})</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={busyKey !== null}
                onClick={() => handleDownload("solutions", activeFormat)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold bg-white hover:bg-blue-50 text-blue-700 border border-blue-200 shadow-sm transition active:scale-95 disabled:opacity-60"
              >
                {busyKey === `solutions-${activeFormat}` ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                <span>Download Solutions ({formatExtLabel})</span>
              </button>
            </div>
          </div>
        )}

        {exportError && (
          <p className="text-xs font-medium text-rose-600">{exportError}</p>
        )}
      </div>

      {/* Interactive Paper Preview */}
      {showPreview && (
        <div className="p-4 sm:p-5 space-y-4">
          {hasSolutions && (
            <div className="flex items-center gap-2 border-b border-zinc-200 pb-3">
              <button
                type="button"
                onClick={() => setActiveTab("questions")}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition",
                  activeTab === "questions"
                    ? "bg-blue-600 text-white shadow-sm"
                    : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
                )}
              >
                <BookOpen className="h-4 w-4" />
                <span>Exam Questions Preview</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("solutions")}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition",
                  activeTab === "solutions"
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
                )}
              >
                <CheckCircle2 className="h-4 w-4" />
                <span>Separate Solutions Preview</span>
              </button>
            </div>
          )}

          {/* Simulated Times New Roman Exam Sheet Preview */}
          <div
            className="rounded-lg border border-zinc-300 bg-white p-5 sm:p-7 shadow-inner text-zinc-900 space-y-4 max-h-[520px] overflow-y-auto leading-relaxed"
            style={{ fontFamily: '"Times New Roman", Times, Georgia, serif' }}
          >
            <div className="text-center border-b border-zinc-800 pb-3 space-y-1">
              {data.courseCode && (
                <p className="text-sm sm:text-base font-bold uppercase tracking-wide">
                  {data.courseCode}
                </p>
              )}
              <h5 className="text-base font-bold uppercase">
                {activeTab === "solutions"
                  ? `${data.title} — MARKING SCHEME & SOLUTIONS`
                  : data.title}
              </h5>
              <p className="text-sm font-semibold">
                {[
                  data.duration ? `Time Allowed: ${data.duration}` : null,
                  `Total Marks: ${totalMarks}`,
                ]
                  .filter(Boolean)
                  .join("  |  ")}
              </p>
            </div>

            {activeTab === "questions" ? (
              <>
                {data.instructions.length > 0 && (
                  <div className="text-sm sm:text-base space-y-1">
                    <p className="font-bold">GENERAL INSTRUCTIONS:</p>
                    <ol className="list-decimal pl-5 space-y-0.5">
                      {data.instructions.map((inst, i) => (
                        <li key={i}>{inst}</li>
                      ))}
                    </ol>
                  </div>
                )}

                {mcqCount > 0 && (
                  <div className="space-y-3 pt-2">
                    <h6 className="text-sm sm:text-base font-bold underline uppercase">
                      Section A: Multiple Choice Questions
                    </h6>
                    <div className="space-y-3.5 text-sm sm:text-base">
                      {data.mcqQuestions.map((q, idx) => (
                        <div key={`${q.id}-${idx}`} className="space-y-1.5">
                          <div className="flex items-start gap-2">
                            <span className="font-bold shrink-0">
                              {idx + 1}.
                            </span>
                            <div className="flex-1 min-w-0">
                              <MathMarkdown content={q.question} size="normal" />
                            </div>
                          </div>
                          <div className="pl-6 space-y-1">
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
                  </div>
                )}

                {theoryCount > 0 && (
                  <div className="space-y-3 pt-3">
                    <h6 className="text-sm sm:text-base font-bold underline uppercase">
                      Section B: Theory / Essay Questions
                    </h6>
                    <div className="space-y-4 text-sm sm:text-base">
                      {data.theoryQuestions.map((q, idx) => (
                        <div key={`${q.id}-${idx}`} className="space-y-1.5">
                          <div className="flex items-start gap-2">
                            <span className="font-bold shrink-0">
                              Question {idx + 1}:
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
                            <div className="pl-6 space-y-1">
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
                  </div>
                )}
              </>
            ) : (
              /* Solutions Preview */
              <div className="space-y-4 text-sm sm:text-base">
                {mcqCount > 0 && (
                  <div className="space-y-2.5">
                    <h6 className="font-bold underline uppercase">
                      Section A: Multiple Choice Answers
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
                        <div
                          key={`${q.id}-${idx}`}
                          className="pl-2 border-l-2 border-emerald-500 py-0.5 space-y-1"
                        >
                          <p className="font-bold">
                            {idx + 1}. Option {letter}
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
                  <div className="space-y-3 pt-2">
                    <h6 className="font-bold underline uppercase">
                      Section B: Theory Model Solutions
                    </h6>
                    {data.theoryQuestions.map((q, idx) => (
                      <div
                        key={`${q.id}-${idx}`}
                        className="pl-2 border-l-2 border-emerald-500 py-0.5 space-y-1"
                      >
                        <p className="font-bold">
                          Question {idx + 1} [{q.marks || 10} Marks]:
                        </p>
                        <div className="text-zinc-800 pl-3">
                          <MathMarkdown
                            content={
                              q.solution ||
                              "See textbook/document section for full solution steps."
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

