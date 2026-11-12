import React, { useContext, useState } from "react";
import { QuizData } from "@/lib/interactive-content";
import MathMarkdown from "./MathMarkdown";
import { ChatContext } from "./ChatContext";
import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  XCircle,
  HelpCircle,
  RotateCcw,
  Award,
  Sparkles,
  Lightbulb,
  Check,
  ChevronDown,
  ChevronUp,
  Send,
} from "lucide-react";

interface InteractiveQuizProps {
  data: QuizData;
}

export const InteractiveQuiz: React.FC<InteractiveQuizProps> = ({ data }) => {
  const { submitPrompt, isLoading } = useContext(ChatContext);
  const [selectedAnswers, setSelectedAnswers] = useState<
    Record<string | number, number>
  >({});
  const [isSubmitted, setIsSubmitted] = useState<boolean>(false);
  const [showAllExplanations, setShowAllExplanations] = useState<boolean>(true);
  const [aiReviewRequested, setAiReviewRequested] = useState<boolean>(false);

  const totalQuestions = data.questions.length;
  const answeredCount = Object.keys(selectedAnswers).length;
  const optionLetters = ["A", "B", "C", "D", "E", "F"];

  const handleSelectOption = (
    questionId: string | number,
    optionIndex: number
  ) => {
    if (isSubmitted) return;
    setSelectedAnswers((prev) => ({
      ...prev,
      [questionId]: optionIndex,
    }));
  };

  let score = 0;
  data.questions.forEach((q) => {
    if (selectedAnswers[q.id] === q.correctIndex) {
      score++;
    }
  });
  const percentage = Math.round((score / Math.max(1, totalQuestions)) * 100);

  const handleSubmit = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsSubmitted(true);
    setShowAllExplanations(true);
  };

  const handleRetake = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedAnswers({});
    setIsSubmitted(false);
    setAiReviewRequested(false);
  };

  const handleRequestAiReview = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isLoading || aiReviewRequested) return;

    const lines = data.questions.map((q, idx) => {
      const pickedIdx = selectedAnswers[q.id];
      const pickedLabel =
        typeof pickedIdx === "number"
          ? `${optionLetters[pickedIdx] || pickedIdx + 1}) ${q.options[pickedIdx]}`
          : "No answer selected";
      const correctLabel = `${optionLetters[q.correctIndex] || q.correctIndex + 1}) ${q.options[q.correctIndex]
        }`;
      const status = pickedIdx === q.correctIndex ? "CORRECT" : "INCORRECT";
      return `Q${idx + 1}: ${q.question}\n- User picked: ${pickedLabel} [${status}]\n- Correct answer: ${correctLabel}`;
    });

    const prompt = `QUIZ SUBMISSION — Please review my quiz results, confirm my score (${score}/${totalQuestions}, ${percentage}%), and walk me step-by-step through the solutions (especially any questions I missed or skipped):\n\nQuiz: ${data.title}\n${lines.join("\n\n")}`;
    setAiReviewRequested(true);
    submitPrompt(prompt);
  };

  return (
    <div
      data-interactive-quiz="true"
      className="my-3 w-full max-w-full rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden not-prose transition-all font-sans"
    >
      {/* Quiz Header */}
      <div className="bg-gradient-to-r from-blue-50 via-white to-indigo-50/70 border-b border-zinc-200 p-3.5 sm:p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white shrink-0 shadow-sm">
            <HelpCircle className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h4 className="text-sm sm:text-base font-bold text-zinc-900 truncate">
              {data.title || "Interactive Practice Quiz"}
            </h4>
            <p className="text-xs text-zinc-500 font-medium">
              {totalQuestions} question{totalQuestions === 1 ? "" : "s"} • Pick
              your options &amp; submit for score + solutions
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!isSubmitted ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-200">
              <Sparkles className="h-3 w-3" />
              <span>
                {answeredCount}/{totalQuestions} answered
              </span>
            </span>
          ) : (
            <span
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border shadow-sm",
                percentage >= 80
                  ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                  : percentage >= 50
                    ? "bg-blue-100 text-blue-800 border-blue-300"
                    : "bg-amber-100 text-amber-800 border-amber-300"
              )}
            >
              <Award className="h-3.5 w-3.5" />
              <span>
                Score: {score}/{totalQuestions} ({percentage}%)
              </span>
            </span>
          )}
        </div>
      </div>

      {/* Score Banner (After Submit) */}
      {isSubmitted && (
        <div
          className={cn(
            "p-4 border-b transition-all flex flex-col sm:flex-row items-center justify-between gap-3",
            percentage >= 80
              ? "bg-emerald-50 border-emerald-200"
              : percentage >= 50
                ? "bg-blue-50 border-blue-200"
                : "bg-amber-50 border-amber-200"
          )}
        >
          <div className="flex items-center gap-3 text-center sm:text-left">
            <div
              className={cn(
                "h-12 w-12 rounded-full flex items-center justify-center font-extrabold text-base shadow-sm shrink-0",
                percentage >= 80
                  ? "bg-emerald-600 text-white"
                  : percentage >= 50
                    ? "bg-blue-600 text-white"
                    : "bg-amber-600 text-white"
              )}
            >
              {percentage}%
            </div>
            <div>
              <h5 className="text-sm font-bold text-zinc-900">
                {percentage === 100
                  ? "Outstanding! Perfect Score"
                  : percentage >= 80
                    ? "Great job! Strong comprehension"
                    : percentage >= 50
                      ? "Good effort! Review the solutions below"
                      : "Keep practicing! Study the solutions below and retake"}
              </h5>
              <p className="text-xs text-zinc-600 font-medium">
                You scored {score} out of {totalQuestions} ({percentage}%).
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2 shrink-0">
            <button
              type="button"
              disabled={isLoading || aiReviewRequested}
              onClick={handleRequestAiReview}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold shadow-sm transition active:scale-95",
                aiReviewRequested
                  ? "bg-emerald-600 text-white cursor-default"
                  : "bg-blue-600 hover:bg-blue-700 text-white"
              )}
            >
              <Send className="h-3.5 w-3.5" />
              <span>
                {aiReviewRequested
                  ? "Sent to AI Tutor"
                  : "Get AI Review & Solutions"}
              </span>
            </button>
            <button
              type="button"
              onClick={handleRetake}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white hover:bg-zinc-50 text-zinc-800 border border-zinc-300 shadow-sm transition active:scale-95"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Retake</span>
            </button>
            <button
              type="button"
              onClick={() => setShowAllExplanations((prev) => !prev)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 transition"
            >
              {showAllExplanations ? (
                <>
                  <ChevronUp className="h-3.5 w-3.5" />
                  <span>Hide Solutions</span>
                </>
              ) : (
                <>
                  <ChevronDown className="h-3.5 w-3.5" />
                  <span>Show Solutions</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Questions List */}
      <div className="p-3.5 sm:p-5 space-y-5">
        {data.questions.map((q, qIdx) => {
          const userSelectedIdx = selectedAnswers[q.id];
          const isAnswered = typeof userSelectedIdx === "number";
          const isCorrect = isSubmitted && userSelectedIdx === q.correctIndex;
          const isUnanswered = isSubmitted && !isAnswered;

          return (
            <div
              key={q.id ?? qIdx}
              className={cn(
                "rounded-xl border p-3.5 sm:p-4 transition-all duration-200",
                !isSubmitted
                  ? "border-zinc-200 bg-white"
                  : isCorrect
                    ? "border-emerald-300 bg-emerald-50/30"
                    : "border-rose-200 bg-rose-50/30"
              )}
            >
              {/* Question Header */}
              <div className="flex items-start justify-between gap-2 mb-2.5">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-zinc-100 text-zinc-700 border border-zinc-200">
                    Question {qIdx + 1}
                  </span>
                  {isSubmitted && (
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md",
                        isCorrect
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-rose-100 text-rose-800"
                      )}
                    >
                      {isCorrect ? (
                        <>
                          <CheckCircle2 className="h-3 w-3" /> Correct (+1)
                        </>
                      ) : isUnanswered ? (
                        <>
                          <XCircle className="h-3 w-3" /> Skipped (0)
                        </>
                      ) : (
                        <>
                          <XCircle className="h-3 w-3" /> Incorrect (0)
                        </>
                      )}
                    </span>
                  )}
                </div>
              </div>

              {/* Question Text with KaTeX math */}
              <div className="text-sm sm:text-base font-semibold text-zinc-900 mb-3 leading-snug">
                <MathMarkdown content={q.question} />
              </div>

              {/* Options Stack */}
              <div className="space-y-2">
                {q.options.map((optionText, optIdx) => {
                  const isSelected = userSelectedIdx === optIdx;
                  const isThisOptionCorrect =
                    isSubmitted && optIdx === q.correctIndex;
                  const isThisOptionUserWrong =
                    isSubmitted && isSelected && !isThisOptionCorrect;

                  return (
                    <button
                      key={optIdx}
                      type="button"
                      disabled={isSubmitted}
                      onClick={() => handleSelectOption(q.id, optIdx)}
                      className={cn(
                        "w-full text-left flex items-start gap-3 p-2.5 sm:p-3 rounded-lg border transition-all duration-150 relative",
                        !isSubmitted
                          ? isSelected
                            ? "border-blue-600 bg-blue-50 text-blue-950 ring-1 ring-blue-600 shadow-sm"
                            : "border-zinc-200 bg-white hover:bg-zinc-50 hover:border-zinc-300 text-zinc-800 cursor-pointer"
                          : isThisOptionCorrect
                            ? "border-emerald-500 bg-emerald-50 text-emerald-950 ring-1 ring-emerald-500 font-medium"
                            : isThisOptionUserWrong
                              ? "border-rose-400 bg-rose-50 text-rose-950 ring-1 ring-rose-400"
                              : "border-zinc-200 bg-zinc-50/50 text-zinc-500 opacity-75"
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-6 w-6 items-center justify-center rounded-md text-xs font-bold shrink-0 transition-colors mt-0.5",
                          !isSubmitted
                            ? isSelected
                              ? "bg-blue-600 text-white"
                              : "bg-zinc-100 text-zinc-600 border border-zinc-300"
                            : isThisOptionCorrect
                              ? "bg-emerald-600 text-white"
                              : isThisOptionUserWrong
                                ? "bg-rose-600 text-white"
                                : "bg-zinc-100 text-zinc-400"
                        )}
                      >
                        {optionLetters[optIdx] || optIdx + 1}
                      </span>

                      <div className="flex-1 text-xs sm:text-sm leading-relaxed min-w-0">
                        <MathMarkdown content={optionText} />
                      </div>

                      {isSubmitted && (
                        <div className="shrink-0 flex items-center gap-1 self-center">
                          {isThisOptionCorrect && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                              <Check className="h-3 w-3" /> Correct
                            </span>
                          )}
                          {isThisOptionUserWrong && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded-full">
                              <XCircle className="h-3 w-3" /> Your choice
                            </span>
                          )}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Solution & Explanation (Revealed after submit) */}
              {isSubmitted && showAllExplanations && q.explanation && (
                <div className="mt-3 pt-3 border-t border-zinc-200 bg-blue-50/70 rounded-lg p-3 text-xs sm:text-sm text-zinc-800">
                  <div className="flex items-center gap-1.5 font-bold text-blue-900 mb-1">
                    <Lightbulb className="h-4 w-4 text-blue-600 shrink-0" />
                    <span>Solution &amp; Explanation:</span>
                  </div>
                  <div className="text-zinc-700 leading-relaxed">
                    <MathMarkdown content={q.explanation} />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Quiz Footer Actions */}
      <div className="p-3.5 sm:p-4 bg-zinc-50 border-t border-zinc-200 flex flex-wrap items-center justify-between gap-3">
        {!isSubmitted ? (
          <>
            <span className="text-xs text-zinc-500 font-medium">
              {answeredCount === totalQuestions
                ? "All questions answered! Click submit to see your score & solutions."
                : `${totalQuestions - answeredCount} question${totalQuestions - answeredCount === 1 ? "" : "s"
                } remaining.`}
            </span>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={answeredCount === 0}
              className={cn(
                "inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition active:scale-95 shadow-sm",
                answeredCount > 0
                  ? "bg-blue-600 hover:bg-blue-700 text-white cursor-pointer"
                  : "bg-zinc-200 text-zinc-400 cursor-not-allowed"
              )}
            >
              <CheckCircle2 className="h-4 w-4" />
              <span>Submit &amp; Score Quiz</span>
            </button>
          </>
        ) : (
          <div className="w-full flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-zinc-500 font-medium">
              Want deeper coaching? Send your score to the AI tutor or retake.
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={isLoading || aiReviewRequested}
                onClick={handleRequestAiReview}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-semibold transition active:scale-95 shadow-sm",
                  aiReviewRequested
                    ? "bg-emerald-600 text-white cursor-default"
                    : "bg-white hover:bg-blue-50 text-blue-700 border border-blue-300"
                )}
              >
                <Send className="h-3.5 w-3.5" />
                <span>
                  {aiReviewRequested ? "Sent to AI Tutor" : "Ask AI to Explain"}
                </span>
              </button>
              <button
                type="button"
                onClick={handleRetake}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white transition active:scale-95 shadow-sm"
              >
                <RotateCcw className="h-4 w-4" />
                <span>Practice Again</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default InteractiveQuiz;
