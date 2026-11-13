import React, { useContext, useEffect, useMemo, useState } from "react";
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

interface PersistedQuizState {
  selectedAnswers: Record<number, number>;
  isSubmitted: boolean;
  showAllExplanations: boolean;
  aiReviewRequested: boolean;
}

const quizMemoryStore = new Map<string, PersistedQuizState>();

function buildQuizKey(data: QuizData): string {
  const sig = `${data.title}|${data.questions
    .map((q) => `${q.question}:${q.options.length}`)
    .join("|")}`;
  let hash = 5381;
  for (let i = 0; i < sig.length; i++) {
    hash = (hash * 33) ^ sig.charCodeAt(i);
  }
  return `quill-quiz-${(hash >>> 0).toString(36)}`;
}

function loadQuizState(key: string): PersistedQuizState | null {
  const inMem = quizMemoryStore.get(key);
  if (inMem) return inMem;
  if (typeof window !== "undefined") {
    try {
      const raw = window.sessionStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw) as PersistedQuizState;
        quizMemoryStore.set(key, parsed);
        return parsed;
      }
    } catch {
      // Ignore storage restrictions
    }
  }
  return null;
}

function saveQuizState(key: string, state: PersistedQuizState) {
  quizMemoryStore.set(key, state);
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.setItem(key, JSON.stringify(state));
    } catch {
      // Ignore storage quota / privacy errors
    }
  }
}

export const InteractiveQuiz: React.FC<InteractiveQuizProps> = ({ data }) => {
  const { submitPrompt, isLoading } = useContext(ChatContext);
  const storageKey = useMemo(() => buildQuizKey(data), [data]);

  const initialState = useMemo(
    () =>
      loadQuizState(storageKey) ?? {
        selectedAnswers: {},
        isSubmitted: false,
        showAllExplanations: true,
        aiReviewRequested: false,
      },
    [storageKey]
  );

  const [selectedAnswers, setSelectedAnswers] = useState<
    Record<number, number>
  >(initialState.selectedAnswers);
  const [isSubmitted, setIsSubmitted] = useState<boolean>(
    initialState.isSubmitted
  );
  const [showAllExplanations, setShowAllExplanations] = useState<boolean>(
    initialState.showAllExplanations
  );
  const [aiReviewRequested, setAiReviewRequested] = useState<boolean>(
    initialState.aiReviewRequested
  );

  useEffect(() => {
    saveQuizState(storageKey, {
      selectedAnswers,
      isSubmitted,
      showAllExplanations,
      aiReviewRequested,
    });
  }, [
    storageKey,
    selectedAnswers,
    isSubmitted,
    showAllExplanations,
    aiReviewRequested,
  ]);

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
      className="my-3 w-full max-w-full rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden not-prose font-sans"
    >
      {/* Simple Header */}
      <div className="p-4 border-b border-zinc-200 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white shrink-0">
            <HelpCircle className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h4 className="text-base font-bold text-gray-900 truncate">
              {data.title || "Practice Quiz"}
            </h4>
            <p className="text-xs text-zinc-500">
              {totalQuestions} question{totalQuestions === 1 ? "" : "s"}
            </p>
          </div>
        </div>

        <div>
          {!isSubmitted ? (
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-zinc-100 text-zinc-700">
              {answeredCount}/{totalQuestions} answered
            </span>
          ) : hasAnswerKey ? (
            <span
              className={cn(
                "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border",
                percentage >= 70
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : percentage >= 50
                    ? "bg-blue-50 text-blue-700 border-blue-200"
                    : "bg-amber-50 text-amber-800 border-amber-200"
              )}
            >
              <Award className="h-3.5 w-3.5" />
              <span>
                {score}/{totalQuestions} ({percentage}%)
              </span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>Submitted</span>
            </span>
          )}
        </div>
      </div>

      {/* Questions */}
      <div className="divide-y divide-zinc-200">
        {data.questions.map((q, qIdx) => {
          const userSelectedIdx = selectedAnswers[qIdx];
          const isAnswered = typeof userSelectedIdx === "number";
          const hasCorrect = hasAnswerKey && q.correctIndex >= 0;
          const isCorrect =
            isSubmitted && hasCorrect && userSelectedIdx === q.correctIndex;

          return (
            <div
              key={`${q.id ?? qIdx}-${qIdx}`}
              className="p-4 sm:p-5 space-y-3 bg-white"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2 min-w-0 flex-1">
                  <span className="text-sm sm:text-base font-bold text-gray-900 shrink-0">
                    {qIdx + 1}.
                  </span>
                  <div className="text-sm sm:text-base font-medium text-gray-900 leading-relaxed min-w-0 flex-1">
                    <MathMarkdown
                      content={q.question}
                      size="normal"
                      className="font-medium text-gray-900 [&_p]:my-0"
                    />
                  </div>
                </div>
                {isSubmitted && hasCorrect && (
                  <span
                    className={cn(
                      "shrink-0 inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full",
                      isCorrect
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-rose-50 text-rose-700"
                    )}
                  >
                    {isCorrect ? (
                      <>
                        <CheckCircle2 className="h-3.5 w-3.5" /> Correct
                      </>
                    ) : (
                      <>
                        <XCircle className="h-3.5 w-3.5" />{" "}
                        {!isAnswered ? "Skipped" : "Wrong"}
                      </>
                    )}
                  </span>
                )}
              </div>

              {/* Options */}
              <div
                role="radiogroup"
                aria-label={`Options for Question ${qIdx + 1}`}
                className="space-y-2 pl-0 sm:pl-5"
              >
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
                      data-selected={isSelected ? "true" : "false"}
                      disabled={isSubmitted}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleSelectOption(qIdx, optIdx);
                      }}
                      className={cn(
                        "w-full text-left flex items-center gap-3 px-3.5 py-2.5 rounded-lg border transition-all text-sm sm:text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
                        !isSubmitted
                          ? isSelected
                            ? "border-blue-600 bg-blue-50 text-blue-950 font-medium ring-1 ring-blue-600"
                            : "border-zinc-200 bg-white hover:bg-zinc-50 hover:border-zinc-300 text-gray-800 cursor-pointer"
                          : !hasCorrect
                            ? isSelected
                              ? "border-blue-600 bg-blue-50 text-blue-950 font-medium"
                              : "border-zinc-200 bg-zinc-50/50 text-zinc-500"
                            : isThisOptionCorrect
                              ? "border-emerald-500 bg-emerald-50/70 text-emerald-950 font-medium"
                              : isThisOptionUserWrong
                                ? "border-rose-400 bg-rose-50/70 text-rose-950"
                                : "border-zinc-200 bg-white text-zinc-500 opacity-75"
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-6 w-6 items-center justify-center rounded text-xs font-bold shrink-0 border",
                          !isSubmitted || !hasCorrect
                            ? isSelected
                              ? "bg-blue-600 text-white border-blue-600"
                              : "bg-zinc-100 text-zinc-700 border-zinc-200"
                            : isThisOptionCorrect
                              ? "bg-emerald-600 text-white border-emerald-600"
                              : isThisOptionUserWrong
                                ? "bg-rose-600 text-white border-rose-600"
                                : "bg-zinc-100 text-zinc-400 border-zinc-200"
                        )}
                      >
                        {optionLetters[optIdx] || optIdx + 1}
                      </span>

                      <div className="flex-1 min-w-0 leading-relaxed [&_a]:pointer-events-none">
                        <MathMarkdown
                          content={optionText}
                          size="normal"
                          className="font-normal text-inherit [&_p]:my-0"
                        />
                      </div>

                      {!isSubmitted && isSelected && (
                        <Check className="h-4 w-4 text-blue-600 shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Explanation */}
              {isSubmitted && showAllExplanations && q.explanation && (
                <div className="sm:ml-5 rounded-lg bg-zinc-50 border border-zinc-200 px-3.5 py-2.5 text-sm text-zinc-800">
                  <div className="flex items-center gap-1.5 font-semibold text-gray-900 mb-1 text-xs">
                    <Lightbulb className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                    <span>Solution</span>
                  </div>
                  <MathMarkdown
                    content={q.explanation}
                    size="normal"
                    className="[&_p]:my-0"
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Simple Footer */}
      <div className="px-4 py-3 bg-zinc-50 border-t border-zinc-200 flex flex-wrap items-center justify-between gap-2.5">
        {!isSubmitted ? (
          <>
            <span className="text-xs text-zinc-500">
              {answeredCount}/{totalQuestions} answered
            </span>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={answeredCount === 0}
              className={cn(
                "inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition active:scale-95",
                answeredCount > 0
                  ? "bg-blue-600 hover:bg-blue-700 text-white shadow-sm cursor-pointer"
                  : "bg-zinc-200 text-zinc-400 cursor-not-allowed"
              )}
            >
              <CheckCircle2 className="h-4 w-4" />
              <span>{hasAnswerKey ? "Submit & Score" : "Submit"}</span>
            </button>
          </>
        ) : (
          <div className="w-full flex flex-wrap items-center justify-between gap-2">
            {hasAnswerKey && (
              <button
                type="button"
                onClick={() => setShowAllExplanations((prev) => !prev)}
                className="inline-flex items-center gap-1 text-xs font-medium text-zinc-600 hover:text-gray-900"
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
            )}
            <div className="flex items-center gap-2 ml-auto">
              <button
                type="button"
                disabled={isLoading || aiReviewRequested}
                onClick={handleRequestAiReview}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition",
                  aiReviewRequested
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : "bg-white hover:bg-zinc-50 text-zinc-700 border-zinc-300"
                )}
              >
                <Send className="h-3.5 w-3.5" />
                <span>
                  {aiReviewRequested ? "Sent to AI" : "Ask AI Tutor"}
                </span>
              </button>
              <button
                type="button"
                onClick={handleRetake}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white transition"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Retake</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default InteractiveQuiz;
