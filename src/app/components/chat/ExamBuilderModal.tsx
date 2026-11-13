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
import { MAX_EXAM_MCQ, MAX_EXAM_THEORY } from "@/lib/question-count";
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
  const [mcqCount, setMcqCount] = useState<number>(8);
  const [theoryCount, setTheoryCount] = useState<number>(2);
  const [exportFormat, setExportFormat] = useState<"docx" | "pdf">("docx");
  const [includeSolutions, setIncludeSolutions] = useState<boolean>(true);
  const [duration, setDuration] = useState<string>("1 Hour");
  const [notes, setNotes] = useState<string>("");

  const safeMcq = Math.max(0, Math.min(MAX_EXAM_MCQ, Number(mcqCount) || 0));
  const safeTheory = Math.max(
    0,
    Math.min(MAX_EXAM_THEORY, Number(theoryCount) || 0)
  );
  const canGenerate = (safeMcq > 0 || safeTheory > 0) && !isLoading;

  const handleGenerate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canGenerate || isLoading) return;

    const formatInstruction =
      exportFormat === "pdf"
        ? 'Export ONLY as PDF (.pdf) (set "requestedFormats": ["pdf"]).'
        : 'Export ONLY as Word Document (.docx) (set "requestedFormats": ["docx"]).';

    const parts: string[] = [
      `Generate ONE standard examination paper grounded strictly in my uploaded document(s). Respond ONLY with a single valid \`\`\`exam JSON block (no extra prose) formatted for Times New Roman, 12pt font, 1.5 line spacing. ${formatInstruction}`,
    ];

    if (examTitle.trim()) {
      parts.push(`Exam Title: "${examTitle.trim()}".`);
    }
    if (duration.trim()) {
      parts.push(`Time Allowed: "${duration.trim()}".`);
    }

    parts.push(
      `Include EXACTLY ${safeMcq} multiple-choice question(s) (4 options A-D each) and EXACTLY ${safeTheory} theory question(s) with marks.`
    );

    if (includeSolutions) {
      parts.push(
        "Include concise separate solutions (set includeSolutions: true)."
      );
    } else {
      parts.push("No separate solutions (set includeSolutions: false).");
    }

    if (notes.trim()) {
      parts.push(`Focus: ${notes.trim()}`);
    }

    onOpenChange(false);
    submitPrompt(parts.join(" "));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px] max-h-[90vh] overflow-y-auto bg-white border border-zinc-200 rounded-xl shadow-lg p-6 font-sans">
        <DialogHeader className="space-y-1 border-b border-gray-200 pb-3.5 text-left">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 flex-shrink-0 rounded-full flex items-center justify-center bg-blue-600 text-white">
              <GraduationCap className="h-4 w-4" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold text-gray-900">
                Create Exam Paper
              </DialogTitle>
              <DialogDescription className="text-xs text-zinc-500">
                Times New Roman · 12pt · 1.5 line spacing
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleGenerate} className="space-y-4 pt-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="exam-title-input"
                className="block text-xs font-medium text-zinc-700 mb-1"
              >
                Title (Optional)
              </label>
              <input
                id="exam-title-input"
                type="text"
                value={examTitle}
                onChange={(e) => setExamTitle(e.target.value)}
                placeholder="Midterm Exam"
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-zinc-400 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
              />
            </div>

            <div>
              <label
                htmlFor="exam-duration-input"
                className="block text-xs font-medium text-zinc-700 mb-1"
              >
                Duration
              </label>
              <input
                id="exam-duration-input"
                type="text"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                placeholder="1 Hour"
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-zinc-400 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-zinc-200 bg-zinc-50/70 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="mcq-count-input"
                  className="text-xs font-semibold text-gray-900"
                >
                  MCQ (max {MAX_EXAM_MCQ})
                </label>
                <input
                  id="mcq-count-input"
                  type="number"
                  min={0}
                  max={MAX_EXAM_MCQ}
                  value={mcqCount}
                  onChange={(e) => setMcqCount(Number(e.target.value))}
                  className="w-12 rounded border border-zinc-200 bg-white px-1.5 py-0.5 text-sm font-semibold text-center text-gray-900 focus:border-blue-600 focus:outline-none"
                />
              </div>
              <div className="flex flex-wrap gap-1">
                {[0, 5, 10, 15, 20].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setMcqCount(n)}
                    className={cn(
                      "px-2 py-0.5 rounded text-xs font-medium border transition",
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

            <div className="rounded-lg border border-zinc-200 bg-zinc-50/70 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="theory-count-input"
                  className="text-xs font-semibold text-gray-900"
                >
                  Theory (max {MAX_EXAM_THEORY})
                </label>
                <input
                  id="theory-count-input"
                  type="number"
                  min={0}
                  max={MAX_EXAM_THEORY}
                  value={theoryCount}
                  onChange={(e) => setTheoryCount(Number(e.target.value))}
                  className="w-12 rounded border border-zinc-200 bg-white px-1.5 py-0.5 text-sm font-semibold text-center text-gray-900 focus:border-blue-600 focus:outline-none"
                />
              </div>
              <div className="flex flex-wrap gap-1">
                {[0, 1, 2, 3, 4].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setTheoryCount(n)}
                    className={cn(
                      "px-2 py-0.5 rounded text-xs font-medium border transition",
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

          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => setExportFormat("docx")}
              className={cn(
                "flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition",
                exportFormat === "docx"
                  ? "border-blue-600 bg-blue-50 text-blue-700"
                  : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
              )}
            >
              <FileText className="h-4 w-4" />
              <span>Word (.docx)</span>
            </button>

            <button
              type="button"
              onClick={() => setExportFormat("pdf")}
              className={cn(
                "flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition",
                exportFormat === "pdf"
                  ? "border-blue-600 bg-blue-50 text-blue-700"
                  : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
              )}
            >
              <FileText className="h-4 w-4" />
              <span>PDF (.pdf)</span>
            </button>
          </div>

          <label className="flex items-center gap-2.5 text-sm text-gray-800 cursor-pointer">
            <input
              type="checkbox"
              checked={includeSolutions}
              onChange={(e) => setIncludeSolutions(e.target.checked)}
              className="h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-600"
            />
            <span className="font-medium">
              Include separate solutions file (
              {exportFormat === "pdf" ? ".pdf" : ".docx"})
            </span>
          </label>

          <div>
            <input
              id="exam-focus-notes"
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional topic or instructions..."
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-zinc-400 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
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
