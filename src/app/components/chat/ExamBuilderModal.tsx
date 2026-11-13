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
import { GraduationCap, CheckCircle2, FileText } from "lucide-react";

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
  const [includeSolutions, setIncludeSolutions] = useState<boolean>(true);
  const [duration, setDuration] = useState<string>("2 Hours");
  const [notes, setNotes] = useState<string>("");

  const safeMcq = Math.max(0, Math.min(30, Number(mcqCount) || 0));
  const safeTheory = Math.max(0, Math.min(15, Number(theoryCount) || 0));
  const canGenerate = safeMcq > 0 || safeTheory > 0;

  const handleGenerate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canGenerate || isLoading) return;

    const parts: string[] = [
      "Generate a formal standard examination paper grounded strictly in my uploaded document(s) inside a ```exam JSON block ready for DOCX and PDF export (Times New Roman, 12pt font, 1.5 line spacing).",
    ];

    if (examTitle.trim()) {
      parts.push(`Exam Title: "${examTitle.trim()}".`);
    }
    if (duration.trim()) {
      parts.push(`Time Allowed: "${duration.trim()}".`);
    }

    parts.push(
      `Include EXACTLY ${safeMcq} multiple-choice question(s) (each with 4 clear options A-D) and EXACTLY ${safeTheory} theory/essay question(s) with clear mark allocations.`
    );

    if (includeSolutions) {
      parts.push(
        "Include separate detailed solutions and marking-scheme explanations for every MCQ and theory question (set includeSolutions: true)."
      );
    } else {
      parts.push(
        "Do NOT include a separate solutions sheet (set includeSolutions: false)."
      );
    }

    if (notes.trim()) {
      parts.push(`Additional Focus / Instructions: ${notes.trim()}`);
    }

    onOpenChange(false);
    submitPrompt(parts.join(" "));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px] font-sans">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-bold text-zinc-900">
            <GraduationCap className="h-5 w-5 text-blue-600" />
            <span>Generate Standard Exam Paper</span>
          </DialogTitle>
          <DialogDescription className="text-sm text-zinc-600">
            Create downloadable <strong>.DOCX</strong> and{" "}
            <strong>.PDF</strong> exam files formatted in{" "}
            <strong>Times New Roman, 12pt, 1.5 line spacing</strong>.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleGenerate} className="space-y-4 pt-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="exam-title-input"
                className="block text-xs font-semibold text-zinc-700 mb-1"
              >
                Exam Title (Optional)
              </label>
              <input
                id="exam-title-input"
                type="text"
                value={examTitle}
                onChange={(e) => setExamTitle(e.target.value)}
                placeholder="e.g. Midterm Examination"
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label
                htmlFor="exam-duration-input"
                className="block text-xs font-semibold text-zinc-700 mb-1"
              >
                Time Allowed
              </label>
              <input
                id="exam-duration-input"
                type="text"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                placeholder="e.g. 2 Hours"
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-lg border border-zinc-200 bg-zinc-50/70 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="mcq-count-input"
                  className="text-xs font-bold text-zinc-800"
                >
                  Multiple Choice (MCQ)
                </label>
                <input
                  id="mcq-count-input"
                  type="number"
                  min={0}
                  max={30}
                  value={mcqCount}
                  onChange={(e) => setMcqCount(Number(e.target.value))}
                  className="w-16 rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm font-semibold text-center text-zinc-900 focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div className="flex flex-wrap gap-1">
                {[0, 5, 10, 15, 20].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setMcqCount(n)}
                    className={cn(
                      "px-2 py-0.5 rounded text-xs font-semibold border transition",
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
                  className="text-xs font-bold text-zinc-800"
                >
                  Theory / Essay Questions
                </label>
                <input
                  id="theory-count-input"
                  type="number"
                  min={0}
                  max={15}
                  value={theoryCount}
                  onChange={(e) => setTheoryCount(Number(e.target.value))}
                  className="w-16 rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm font-semibold text-center text-zinc-900 focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div className="flex flex-wrap gap-1">
                {[0, 2, 4, 5, 6].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setTheoryCount(n)}
                    className={cn(
                      "px-2 py-0.5 rounded text-xs font-semibold border transition",
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

          <label className="flex items-start gap-2.5 rounded-lg border border-zinc-200 bg-emerald-50/50 p-3 cursor-pointer">
            <input
              type="checkbox"
              checked={includeSolutions}
              onChange={(e) => setIncludeSolutions(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500"
            />
            <div className="text-sm">
              <span className="font-semibold text-zinc-900 flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                Include Separate Solutions &amp; Marking Guide
              </span>
              <span className="block text-xs text-zinc-600 mt-0.5">
                Creates separate downloadable Solution (.DOCX &amp; .PDF) files
                alongside the Question Paper.
              </span>
            </div>
          </label>

          <div>
            <label
              htmlFor="exam-focus-notes"
              className="block text-xs font-semibold text-zinc-700 mb-1"
            >
              Topics, Difficulty, or Instructions (Optional)
            </label>
            <textarea
              id="exam-focus-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Focus on statistical inference, include calculations, university undergraduate level..."
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
            />
          </div>

          <div className="rounded-md bg-blue-50/70 border border-blue-200 px-3 py-2 flex items-center gap-2 text-xs text-blue-900">
            <FileText className="h-4 w-4 text-blue-600 shrink-0" />
            <span>
              Output standard: <strong>Times New Roman</strong>,{" "}
              <strong>12pt font</strong>, <strong>1.5 line spacing</strong> in
              both Word (.docx) and PDF.
            </span>
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!canGenerate || isLoading}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              Generate Exam Paper
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default ExamBuilderModal;

