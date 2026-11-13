"use client";

import React, { useContext, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ChatContext } from "./ChatContext";
import { cn } from "@/lib/utils";
import { FileText, GraduationCap, Loader2 } from "lucide-react";

interface ExamBuilderModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ExamBuilderModal: React.FC<ExamBuilderModalProps> = ({
  open,
  onOpenChange,
}) => {
  const { submitPrompt, isLoading } = useContext(ChatContext);

  const [examTitle, setExamTitle] = useState<string>("");
  const [mcqCount, setMcqCount] = useState<number>(10);
  const [theoryCount, setTheoryCount] = useState<number>(4);
  const [exportFormat, setExportFormat] = useState<"docx" | "pdf">("docx");
  const [includeSolutions, setIncludeSolutions] = useState<boolean>(true);
  const [duration, setDuration] = useState<string>("2 Hours");
  const [notes, setNotes] = useState<string>("");

  const safeMcq = Math.max(0, Math.min(30, Number(mcqCount) || 0));
  const safeTheory = Math.max(0, Math.min(15, Number(theoryCount) || 0));
  const canGenerate = (safeMcq > 0 || safeTheory > 0) && !isLoading;

  const handleGenerate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canGenerate || isLoading) return;

    const formatInstruction =
      exportFormat === "pdf"
        ? 'Export ONLY as PDF (.pdf) (set "requestedFormats": ["pdf"]).'
        : 'Export ONLY as Word Document (.docx) (set "requestedFormats": ["docx"]).';

    const parts: string[] = [
      `Generate ONE standard examination paper grounded strictly in my uploaded document(s). Respond ONLY with a single valid \`\`\`exam JSON block (no intro or outro prose) for fast generation, formatted for Times New Roman, 12pt font, 1.5 line spacing. ${formatInstruction}`,
    ];

    if (examTitle.trim()) {
      parts.push(`Exam Title: "${examTitle.trim()}".`);
    }
    if (duration.trim()) {
      parts.push(`Time Allowed: "${duration.trim()}".`);
    }

    parts.push(
      `Include EXACTLY ${safeMcq} multiple-choice question(s) (4 options A-D each) and EXACTLY ${safeTheory} theory/essay question(s) with mark allocations.`
    );

    if (includeSolutions) {
      parts.push(
        "Include concise separate solutions/marking points for each question (set includeSolutions: true)."
      );
    } else {
      parts.push(
        "Do NOT include separate solutions (set includeSolutions: false)."
      );
    }

    if (notes.trim()) {
      parts.push(`Focus/Instructions: ${notes.trim()}`);
    }

    onOpenChange(false);
    submitPrompt(parts.join(" "));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto bg-white border border-zinc-200 rounded-xl shadow-lg p-6 font-sans">
        <DialogHeader className="space-y-2 border-b border-gray-200 pb-4 text-left">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 flex-shrink-0 rounded-full flex items-center justify-center bg-gradient-to-r from-blue-600 to-indigo-600 shadow-sm">
              <GraduationCap className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <DialogTitle className="text-xl font-bold text-gray-900">
                  Create Exam Paper
                </DialogTitle>
                <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-semibold text-blue-700 border border-blue-200">
                  A4 Standard
                </span>
              </div>
              <DialogDescription className="text-xs sm:text-sm text-zinc-500 mt-0.5">
                Times New Roman · 12pt Font · 1.5 Line Spacing
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleGenerate} className="space-y-4 pt-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="exam-title-input"
                className="block text-xs font-semibold text-zinc-700 mb-1.5"
              >
                Exam Title (Optional)
              </label>
              <input
                id="exam-title-input"
                type="text"
                value={examTitle}
                onChange={(e) => setExamTitle(e.target.value)}
                placeholder="e.g. Midterm Examination"
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-zinc-400 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
              />
            </div>

            <div>
              <label
                htmlFor="exam-duration-input"
                className="block text-xs font-semibold text-zinc-700 mb-1.5"
              >
                Time Allowed
              </label>
              <input
                id="exam-duration-input"
                type="text"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                placeholder="e.g. 2 Hours"
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-zinc-400 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
              />
            </div>
          </div>

          {/* Question Counts */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-lg border border-zinc-200 bg-zinc-50/60 p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="mcq-count-input"
                  className="text-xs font-semibold text-gray-900"
                >
                  Multiple Choice
                </label>
                <input
                  id="mcq-count-input"
                  type="number"
                  min={0}
                  max={30}
                  value={mcqCount}
                  onChange={(e) => setMcqCount(Number(e.target.value))}
                  className="w-14 rounded-md border border-zinc-200 bg-white px-2 py-1 text-sm font-semibold text-center text-gray-900 focus:border-blue-600 focus:outline-none"
                />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[0, 5, 10, 15, 20].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setMcqCount(n)}
                    className={cn(
                      "px-2.5 py-0.5 rounded-md text-xs font-semibold border transition",
                      safeMcq === n
                        ? "bg-blue-600 text-white border-blue-600"
                        : "bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-100"
                    )}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-zinc-200 bg-zinc-50/60 p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="theory-count-input"
                  className="text-xs font-semibold text-gray-900"
                >
                  Theory / Essay
                </label>
                <input
                  id="theory-count-input"
                  type="number"
                  min={0}
                  max={15}
                  value={theoryCount}
                  onChange={(e) => setTheoryCount(Number(e.target.value))}
                  className="w-14 rounded-md border border-zinc-200 bg-white px-2 py-1 text-sm font-semibold text-center text-gray-900 focus:border-blue-600 focus:outline-none"
                />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[0, 2, 4, 5, 6].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setTheoryCount(n)}
                    className={cn(
                      "px-2.5 py-0.5 rounded-md text-xs font-semibold border transition",
                      safeTheory === n
                        ? "bg-blue-600 text-white border-blue-600"
                        : "bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-100"
                    )}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Single Output Format Selector */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-700">
                File Format
              </span>
              <span className="text-[11px] text-zinc-500">
                One format at a time
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setExportFormat("docx")}
                className={cn(
                  "flex items-center justify-between rounded-lg border px-3 py-2.5 text-left transition",
                  exportFormat === "docx"
                    ? "border-blue-600 bg-blue-50/50 ring-2 ring-blue-500/20"
                    : "border-zinc-200 bg-white hover:bg-zinc-50"
                )}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <FileText
                    className={cn(
                      "h-4 w-4 shrink-0",
                      exportFormat === "docx"
                        ? "text-blue-600"
                        : "text-zinc-500"
                    )}
                  />
                  <span className="text-sm font-semibold text-gray-900 truncate">
                    Word (.docx)
                  </span>
                </div>
                <span
                  className={cn(
                    "text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase",
                    exportFormat === "docx"
                      ? "bg-blue-600 text-white"
                      : "bg-zinc-100 text-zinc-600"
                  )}
                >
                  Default
                </span>
              </button>

              <button
                type="button"
                onClick={() => setExportFormat("pdf")}
                className={cn(
                  "flex items-center justify-between rounded-lg border px-3 py-2.5 text-left transition",
                  exportFormat === "pdf"
                    ? "border-blue-600 bg-blue-50/50 ring-2 ring-blue-500/20"
                    : "border-zinc-200 bg-white hover:bg-zinc-50"
                )}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <FileText
                    className={cn(
                      "h-4 w-4 shrink-0",
                      exportFormat === "pdf"
                        ? "text-blue-600"
                        : "text-zinc-500"
                    )}
                  />
                  <span className="text-sm font-semibold text-gray-900 truncate">
                    PDF (.pdf)
                  </span>
                </div>
                <span
                  className={cn(
                    "text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase",
                    exportFormat === "pdf"
                      ? "bg-blue-600 text-white"
                      : "bg-zinc-100 text-zinc-600"
                  )}
                >
                  PDF
                </span>
              </button>
            </div>
          </div>

          {/* Separate Solutions Option */}
          <label className="flex items-start gap-3 rounded-lg border border-zinc-200 bg-white p-3.5 cursor-pointer hover:bg-zinc-50/60 transition">
            <input
              type="checkbox"
              checked={includeSolutions}
              onChange={(e) => setIncludeSolutions(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-600"
            />
            <div className="text-sm">
              <span className="font-semibold text-gray-900 block">
                Include Separate Solutions File
              </span>
              <span className="block text-xs text-zinc-500 mt-0.5">
                Creates a separate downloadable{" "}
                {exportFormat === "pdf" ? ".PDF" : ".DOCX"} marking guide
                alongside your questions.
              </span>
            </div>
          </label>

          {/* Focus / Instructions */}
          <div>
            <label
              htmlFor="exam-focus-notes"
              className="block text-xs font-semibold text-zinc-700 mb-1.5"
            >
              Topics or Instructions (Optional)
            </label>
            <textarea
              id="exam-focus-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Focus on Chapters 2-4, include calculations..."
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-zinc-400 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600 resize-none"
            />
          </div>

          <DialogFooter className="gap-2 pt-2 border-t border-gray-200">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="border-zinc-200 text-zinc-700 hover:bg-zinc-50"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!canGenerate}
              className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                `Generate ${exportFormat === "pdf" ? "PDF" : "Word"} Exam`
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default ExamBuilderModal;
