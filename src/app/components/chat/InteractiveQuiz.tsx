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
    Record<number, number>
  >({});
  const [isSubmitted, setIsSubmitted] = useState<boolean>(false);
  const [showAllExplanations, setShowAllExplanations] = useState<boolean>(true);
  const [aiReviewRequested, setAiReviewRequested] = useState<boolean>(false);

  const hasAnswerKey = data.hasAnswerKey !== false;
  const totalQuestions = data.questions.length;
  const answeredCount = Object.keys(selectedAnswers).length;
  const optionLetters = ["A", "B", "C", "D", "E", "F"];

  const handleSelectOption = (questionIdx: number, optionIndex: number) => {
    if (isSubmitted) return;
    setSelectedAnswers((prev) => ({
      ...prev,
      [questionIdx]: optionIndex,
    }));
  };

  let score = 0;
  if (hasAnswerKey) {
    data.questions.forEach((q, qIdx) => {
      if (selectedAnswers[qIdx] === q.correctIndex) {
        score++;
      }
    });
  }
  const percentage = Math.round((score / Math.max(1, totalQuestions)) * 100);

  const buildAiReviewPrompt = () => {
    const lines = data.questions.map((q, idx) => {
      const pickedIdx = selectedAnswers[idx];
      const pickedLabel =
        typeof pickedIdx === "number"
          ? `${optionLetters[pickedIdx] || pickedIdx + 1}) ${q.options[pickedIdx]}`
          : "No answer selected";
      if (!hasAnswerKey || q.correctIndex < 0) {
        return `Q${idx + 1}: ${q.question}\n- Options:\n${q.options
          .map((opt, oi) => `  ${optionLetters[oi] || oi + 1}) ${opt}`)
          .join("\n")}\n- User picked: ${pickedLabel}`;
      }
      const correctLabel = `${optionLetters[q.correctIndex] || q.correctIndex + 1}) ${
        q.options[q.correctIndex]
      }`;
      const status = pickedIdx === q.correctIndex ? "CORRECT" : "INCORRECT";
      return `Q${idx + 1}: ${q.question}\n- User picked: ${pickedLabel} [${status}]\n- Correct answer: ${correctLabel}`;
    });

    if (!hasAnswerKey) {
      return `QUIZ SUBMISSION — Please grade my answers below out of ${totalQuestions}, state my score clearly, and walk me step-by-step through the solutions for every question:\n\nQuiz: ${data.title}\n\n${lines.join("\n\n")}`;
    }

    return `QUIZ SUBMISSION — Please review my quiz results, confirm my score (${score}/${totalQuestions}, ${percentage}%), and walk me step-by-step through the solutions (especially any questions I missed or skipped):\n\nQuiz: ${data.title}\n\n${lines.join("\n\n")}`;
  };

  const handleRequestAiReview = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (isLoading || aiReviewRequested) return;
    setAiReviewRequested(true);
    submitPrompt(buildAiReviewPrompt());
  };

  const handleSubmit = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsSubmitted(true);
    setShowAllExplanations(true);
    if (!hasAnswerKey) {
      handleRequestAiReview();
    }
  };

  const handleRetake = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedAnswers({});
    setIsSubmitted(false);
    setAiReviewRequested(false);
  };

  return (
    <div
      data-interactive-quiz="true"
      className="my-3 w-full max-w-full rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden not-prose transition-all font-sans"
    >
      {/* Quiz Header */}
      <div className="bg-gradient-to-r from-blue-50 via-white to-indigo-50/70 border-b border-zinc-200 p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-white shrink-0 shadow-sm">
            <HelpCircle className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h4 className="text-base sm:text-lg font-bold text-zinc-900 truncate">
              {data.title || "Interactive Practice Quiz"}
            </h4>
            <p className="text-xs sm:text-sm text-zinc-600 font-medium">
              {totalQuestions} question{totalQuestions === 1 ? "" : "s"} • Tap an
              option for each question, then submit
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!isSubmitted ? (
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs sm:text-sm font-semibold bg-blue-100 text-blue-800 border border-blue-200">
              {answeredCount}/{totalQuestions} answered
            </span>
          ) : hasAnswerKey ? (
            <span
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs sm:text-sm font-bold border shadow-sm",
                percentage >= 80
                  ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                  : percentage >= 50
                    ? "bg-blue-100 text-blue-800 border-blue-300"
                    : "bg-amber-100 text-amber-800 border-amber-300"
              )}
            >
              <Award className="h-4 w-4" />
              <span>
                Score: {score}/{totalQuestions} ({percentage}%)
              </span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs sm:text-sm font-bold border bg-blue-100 text-blue-800 border-blue-300">
              <CheckCircle2 className="h-4 w-4" />
              <span>Sent for AI Grading</span>
            </span>
          )}
        </div>
      </div>

      {/* Score Banner (After Submit) */}
      {isSubmitted && hasAnswerKey && (
        <div
          className={cn(
            "p-4 sm:p-5 border-b transition-all flex flex-col sm:flex-row items-center justify-between gap-3",
            percentage >= 80
              ? "bg-emerald-50 border-emerald-200"
              : percentage >= 50
                ? "bg-blue-50 border-blue-200"
                : "bg-amber-50 border-amber-200"
          )}
        >
          <div className="flex items-center gap-3.5 text-center sm:text-left">
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
              <h5 className="text-sm sm:text-base font-bold text-zinc-900">
                {percentage === 100
                  ? "Outstanding! Perfect Score"
                  : percentage >= 80
                    ? "Great job! Strong comprehension"
                    : percentage >= 50
                      ? "Good effort! Review the solutions below"
                      : "Keep practicing! Study the solutions below and retake"}
              </h5>
              <p className="text-xs sm:text-sm text-zinc-600 font-medium">
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
                "inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-semibold shadow-sm transition active:scale-95",
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
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-semibold bg-white hover:bg-zinc-50 text-zinc-800 border border-zinc-300 shadow-sm transition active:scale-95"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Retake</span>
            </button>
            <button
              type="button"
              onClick={() => setShowAllExplanations((prev) => !prev)}
              className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-xs sm:text-sm font-medium text-zinc-700 hover:text-zinc-900 hover:bg-zinc-100 transition"
            >
              {showAllExplanations ? (
                <>
                  <ChevronUp className="h-4 w-4" />
                  <span>Hide Solutions</span>
                </>
              ) : (
                <>
                  <ChevronDown className="h-4 w-4" />
                  <span>Show Solutions</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Questions List */}
      <div className="p-4 sm:p-5 space-y-5">
        {data.questions.map((q, qIdx) => {
          const userSelectedIdx = selectedAnswers[qIdx];
          const isAnswered = typeof userSelectedIdx === "number";
          const hasCorrect = hasAnswerKey && q.correctIndex >= 0;
          const isCorrect =
            isSubmitted && hasCorrect && userSelectedIdx === q.correctIndex;
          const isUnanswered = isSubmitted && !isAnswered;

          return (
            <div
              key={`${q.id ?? qIdx}-${qIdx}`}
              className={cn(
                "rounded-xl border p-4 sm:p-5 transition-all duration-200",
                !isSubmitted || !hasCorrect
                  ? "border-zinc-200 bg-white"
                  : isCorrect
                    ? "border-emerald-300 bg-emerald-50/30"
                    : "border-rose-200 bg-rose-50/30"
              )}
            >
              {/* Question Header */}
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center justify-center px-2.5 py-0.5 rounded-md text-xs font-bold bg-zinc-100 text-zinc-700 border border-zinc-200">
                    Question {qIdx + 1}
                  </span>
                  {isSubmitted && hasCorrect && (
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 text-xs font-bold px-2.5 py-0.5 rounded-md",
                        isCorrect
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-rose-100 text-rose-800"
                      )}
                    >
                      {isCorrect ? (
                        <>
                          <CheckCircle2 className="h-3.5 w-3.5" /> Correct (+1)
                        </>
                      ) : isUnanswered ? (
                        <>
                          <XCircle className="h-3.5 w-3.5" /> Skipped (0)
                        </>
                      ) : (
                        <>
                          <XCircle className="h-3.5 w-3.5" /> Incorrect (0)
                        </>
                      )}
                    </span>
                  )}
                </div>
              </div>

              {/* Question Text with KaTeX math */}
              <div className="text-sm sm:text-base font-semibold text-zinc-900 mb-3.5 leading-relaxed">
                <MathMarkdown
                  content={q.question}
                  size="normal"
                  className="font-semibold text-zinc-900"
                />
              </div>

              {/* Options Stack */}
              <div role="radiogroup" aria-label={`Options for Question ${qIdx + 1}`} className="space-y-2.5">
                {q.options.map((optionText, optIdx) => {
                  const isSelected = userSelectedIdx === optIdx;
                  const isThisOptionCorrect =
                    isSubmitted && hasCorrect && optIdx === q.correctIndex;
                  const isThisOptionUserWrong =
                    isSubmitted &&
                    hasCorrect &&
                    isSelected &&
                    !isThisOptionCorrect;

                  return (
                    <button
                      key={optIdx}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      disabled={isSubmitted}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleSelectOption(qIdx, optIdx);
                      }}
                      className={cn(
                        "w-full text-left flex items-start gap-3 p-3 sm:p-3.5 rounded-xl border transition-all duration-150 relative",
                        !isSubmitted
                          ? isSelected
                            ? "border-blue-600 bg-blue-50 text-blue-950 ring-1 ring-blue-600 shadow-sm cursor-pointer"
                            : "border-zinc-200 bg-white hover:bg-zinc-50 hover:border-blue-300 text-zinc-800 cursor-pointer"
                          : !hasCorrect
                            ? isSelected
                              ? "border-blue-600 bg-blue-50 text-blue-950 ring-1 ring-blue-600"
                              : "border-zinc-200 bg-zinc-50/50 text-zinc-600"
                            : isThisOptionCorrect
                              ? "border-emerald-500 bg-emerald-50 text-emerald-950 ring-1 ring-emerald-500 font-medium"
                              : isThisOptionUserWrong
                                ? "border-rose-400 bg-rose-50 text-rose-950 ring-1 ring-rose-400"
                                : "border-zinc-200 bg-zinc-50/50 text-zinc-500 opacity-80"
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-7 w-7 items-center justify-center rounded-md text-xs sm:text-sm font-bold shrink-0 transition-colors mt-0.5",
                          !isSubmitted || !hasCorrect
                            ? isSelected
                              ? "bg-blue-600 text-white"
                              : "bg-zinc-100 text-zinc-700 border border-zinc-300"
                            : isThisOptionCorrect
                              ? "bg-emerald-600 text-white"
                              : isThisOptionUserWrong
                                ? "bg-rose-600 text-white"
                                : "bg-zinc-100 text-zinc-400"
                        )}
                      >
                        {optionLetters[optIdx] || optIdx + 1}
                      </span>

                      <div className="flex-1 text-sm sm:text-base leading-relaxed min-w-0 [&_a]:pointer-events-none">
                        <MathMarkdown
                          content={optionText}
                          size="normal"
                          className="font-normal text-inherit [&_p]:my-0"
                        />
                      </div>

                      {isSubmitted && hasCorrect && (
                        <div className="shrink-0 flex items-center gap-1 self-center">
                          {isThisOptionCorrect && (
                            <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-100 px-2.5 py-0.5 rounded-full">
                              <Check className="h-3.5 w-3.5" /> Correct
                            </span>
                          )}
                          {isThisOptionUserWrong && (
                            <span className="inline-flex items-center gap-1 text-xs font-bold text-rose-700 bg-rose-100 px-2.5 py-0.5 rounded-full">
                              <XCircle className="h-3.5 w-3.5" /> Your choice
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
                <div className="mt-3.5 pt-3 border-t border-zinc-200 bg-blue-50/70 rounded-lg p-3.5 text-sm sm:text-base text-zinc-800">
                  <div className="flex items-center gap-1.5 font-bold text-blue-900 mb-1.5 text-sm sm:text-base">
                    <Lightbulb className="h-4 w-4 text-blue-600 shrink-0" />
                    <span>Solution &amp; Explanation:</span>
                  </div>
                  <div className="text-zinc-800 leading-relaxed">
                    <MathMarkdown content={q.explanation} size="normal" />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Quiz Footer Actions */}
      <div className="p-4 sm:p-5 bg-zinc-50 border-t border-zinc-200 flex flex-wrap items-center justify-between gap-3">
        {!isSubmitted ? (
          <>
            <span className="text-xs sm:text-sm text-zinc-600 font-medium">
              {answeredCount === totalQuestions
                ? "All questions answered! Click submit to see your score & solutions."
                : `${totalQuestions - answeredCount} question${
                    totalQuestions - answeredCount === 1 ? "" : "s"
                  } remaining.`}
            </span>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={answeredCount === 0}
              className={cn(
                "inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition active:scale-95 shadow-sm",
                answeredCount > 0
                  ? "bg-blue-600 hover:bg-blue-700 text-white cursor-pointer"
                  : "bg-zinc-200 text-zinc-400 cursor-not-allowed"
              )}
            >
              <CheckCircle2 className="h-4 w-4" />
              <span>
                {hasAnswerKey
                  ? "Submit & Score Quiz"
                  : "Submit & Get AI Solutions"}
              </span>
            </button>
          </>
        ) : (
          <div className="w-full flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs sm:text-sm text-zinc-600 font-medium">
              {hasAnswerKey
                ? "Want deeper coaching? Send your score to the AI tutor or retake."
                : "Your answers have been sent to the AI tutor for grading & solutions."}
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
