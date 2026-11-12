import React, { useContext, useState } from "react";
import {
  evaluateFlashcardAnswer,
  FlashcardEvaluation,
  FlashcardItem,
  FlashcardsData,
} from "@/lib/interactive-content";
import MathMarkdown from "./MathMarkdown";
import { ChatContext } from "./ChatContext";
import { cn } from "@/lib/utils";
import {
  RotateCw,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Sparkles,
  Trophy,
  RotateCcw,
  BookOpen,
  Layers,
  Send,
  Award,
  Check,
} from "lucide-react";

interface InteractiveFlashcardsProps {
  data: FlashcardsData;
}

export const InteractiveFlashcards: React.FC<InteractiveFlashcardsProps> = ({
  data,
}) => {
  const { submitPrompt, isLoading } = useContext(ChatContext);

  const [activeCards, setActiveCards] = useState<FlashcardItem[]>(data.cards);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [isFlipped, setIsFlipped] = useState<boolean>(false);
  const [showHint, setShowHint] = useState<boolean>(false);
  const [isCompleted, setIsCompleted] = useState<boolean>(false);

  const [typedAnswers, setTypedAnswers] = useState<
    Record<string | number, string>
  >({});
  const [evaluations, setEvaluations] = useState<
    Record<string | number, FlashcardEvaluation>
  >({});
  const [masteredIds, setMasteredIds] = useState<Set<string | number>>(
    new Set()
  );
  const [reviewIds, setReviewIds] = useState<Set<string | number>>(new Set());
  const [aiReviewRequested, setAiReviewRequested] = useState<boolean>(false);

  const totalCards = activeCards.length;
  const currentCard = activeCards[currentIndex] || activeCards[0];
  const currentDraft = currentCard ? typedAnswers[currentCard.id] ?? "" : "";
  const currentEval = currentCard ? evaluations[currentCard.id] : undefined;

  const totalScore = data.cards.reduce((acc, card) => {
    if (masteredIds.has(card.id)) return acc + 1;
    const ev = evaluations[card.id];
    if (ev && !reviewIds.has(card.id)) return acc + ev.score;
    return acc;
  }, 0);
  const overallTotal = data.cards.length;
  const scorePercent = Math.round(
    (totalScore / Math.max(1, overallTotal)) * 100
  );

  const handleFlip = () => {
    setIsFlipped((prev) => !prev);
  };

  const handleNext = () => {
    if (currentIndex < totalCards - 1) {
      setCurrentIndex((prev) => prev + 1);
      setIsFlipped(false);
      setShowHint(false);
    } else {
      setIsCompleted(true);
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
      setIsFlipped(false);
      setShowHint(false);
      setIsCompleted(false);
    }
  };

  const handleCheckAnswer = (e?: React.FormEvent | React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!currentCard) return;

    const evalResult = evaluateFlashcardAnswer(currentDraft, currentCard.back);
    setEvaluations((prev) => ({
      ...prev,
      [currentCard.id]: evalResult,
    }));

    if (evalResult.status === "correct") {
      setMasteredIds((prev) => {
        const next = new Set(prev);
        next.add(currentCard.id);
        return next;
      });
      setReviewIds((prev) => {
        const next = new Set(prev);
        next.delete(currentCard.id);
        return next;
      });
    } else {
      setReviewIds((prev) => {
        const next = new Set(prev);
        next.add(currentCard.id);
        return next;
      });
      setMasteredIds((prev) => {
        const next = new Set(prev);
        next.delete(currentCard.id);
        return next;
      });
    }

    setIsFlipped(true);
  };

  const markCardStatus = (
    cardId: string | number,
    isMastered: boolean,
    advance: boolean,
    e?: React.MouseEvent
  ) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const addSet = isMastered ? setMasteredIds : setReviewIds;
    const removeSet = isMastered ? setReviewIds : setMasteredIds;
    addSet((prev) => {
      const next = new Set(prev);
      next.add(cardId);
      return next;
    });
    removeSet((prev) => {
      const next = new Set(prev);
      next.delete(cardId);
      return next;
    });
    const manualEvaluation: FlashcardEvaluation = isMastered
      ? { status: "correct", score: 1, reason: "Marked correct." }
      : { status: "incorrect", score: 0, reason: "Marked for review." };
    setEvaluations((prev) => ({
      ...prev,
      [cardId]: manualEvaluation,
    }));
    if (advance) handleNext();
  };

  const handleRestart = (onlyReview = false) => {
    if (onlyReview) {
      const toPractice = data.cards.filter(
        (c) => reviewIds.has(c.id) || !masteredIds.has(c.id)
      );
      setActiveCards(toPractice.length > 0 ? toPractice : data.cards);
    } else {
      setActiveCards(data.cards);
      setMasteredIds(new Set());
      setReviewIds(new Set());
      setTypedAnswers({});
      setEvaluations({});
      setAiReviewRequested(false);
    }
    setCurrentIndex(0);
    setIsFlipped(false);
    setShowHint(false);
    setIsCompleted(false);
  };

  const handleRequestAiGrading = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isLoading || aiReviewRequested) return;

    const cardSummaries = data.cards
      .map((card, idx) => {
        const ans = (typedAnswers[card.id] || "").trim();
        const selfStatus = masteredIds.has(card.id)
          ? "Self/Auto: Correct"
          : reviewIds.has(card.id)
          ? "Self/Auto: Needs Review"
          : "Not answered yet";
        return `Card ${idx + 1}: ${card.front}\n- User's answer: ${
          ans || "(No typed answer)"
        } [${selfStatus}]\n- Reference solution: ${card.back}`;
      })
      .join("\n\n");

    const prompt = `FLASHCARD SUBMISSION FOR AI GRADING & SOLUTIONS — Please score my flashcard answers fairly out of ${overallTotal}, verify my typed answers against the document context (accepting valid paraphrasing or equivalent math), and provide the clear step-by-step solutions for every card:\n\nDeck: ${data.title}\n\n${cardSummaries}`;
    setAiReviewRequested(true);
    submitPrompt(prompt);
  };

  const handleContainerKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.tagName === "BUTTON"
    ) {
      return;
    }
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      handleFlip();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      handleNext();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      handlePrev();
    }
  };

  const progressPercent = Math.round(
    ((currentIndex + 1) / Math.max(1, totalCards)) * 100
  );
  const answeredTotalCount = Object.keys(typedAnswers).filter((k) =>
    typedAnswers[k]?.trim()
  ).length;

  return (
    <div
      data-interactive-flashcards="true"
      tabIndex={0}
      onKeyDown={handleContainerKeyDown}
      className="my-3 w-full max-w-full rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden not-prose transition-all font-sans focus:outline-none focus:ring-2 focus:ring-blue-500/40"
    >
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-50 via-white to-indigo-50/70 border-b border-zinc-200 p-3.5 sm:p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white shrink-0 shadow-sm">
            <Layers className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h4 className="text-sm sm:text-base font-bold text-zinc-900 truncate">
              {data.title || "Study Flashcards"}
            </h4>
            <p className="text-xs text-zinc-500 font-medium">
              {isCompleted
                ? `Completed ${overallTotal} card${overallTotal === 1 ? "" : "s"}`
                : `Card ${currentIndex + 1} of ${totalCards} • Answer & check solution, or flip`}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold">
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-100 text-blue-800 border border-blue-200">
            <Award className="h-3 w-3" />
            <span>
              Score: {Number.isInteger(totalScore) ? totalScore : totalScore.toFixed(1)}/{overallTotal}
            </span>
          </span>
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
            <CheckCircle2 className="h-3 w-3" />
            <span>{masteredIds.size} Correct</span>
          </span>
          {reviewIds.size > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-100 text-amber-800 border border-amber-300">
              <XCircle className="h-3 w-3" />
              <span>{reviewIds.size} Review</span>
            </span>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-zinc-100 h-1.5 overflow-hidden">
        <div
          className="bg-blue-600 h-full transition-all duration-300"
          style={{ width: `${isCompleted ? 100 : progressPercent}%` }}
        />
      </div>

      {/* Flashcard Body */}
      <div className="p-3.5 sm:p-5">
        {!isCompleted && currentCard ? (
          <div>
            {/* Card Display */}
            <div
              role="button"
              tabIndex={0}
              aria-label="Flashcard - click to flip between question and solution"
              onClick={handleFlip}
              onKeyDown={(e) => {
                if (e.key === " " || e.key === "Enter") {
                  e.preventDefault();
                  handleFlip();
                }
              }}
              className={cn(
                "relative min-h-[190px] sm:min-h-[210px] w-full rounded-2xl border p-5 sm:p-6 transition-all duration-200 flex flex-col justify-between cursor-pointer select-none focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm hover:shadow-md",
                !isFlipped
                  ? "bg-gradient-to-b from-white to-zinc-50 border-zinc-200"
                  : "bg-gradient-to-b from-emerald-50/50 via-white to-blue-50/40 border-emerald-300"
              )}
            >
              {/* Top Row */}
              <div className="flex items-center justify-between gap-2 mb-2">
                <span
                  className={cn(
                    "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wide uppercase",
                    !isFlipped
                      ? "bg-blue-100 text-blue-800 border border-blue-200"
                      : "bg-emerald-100 text-emerald-800 border border-emerald-200"
                  )}
                >
                  <BookOpen className="h-3 w-3" />
                  {!isFlipped ? "Question / Prompt" : "Official Solution"}
                </span>

                <span className="text-xs font-semibold text-zinc-400">
                  {currentIndex + 1} / {totalCards}
                </span>
              </div>

              {/* Front or Back Content */}
              <div className="flex-1 flex flex-col justify-center my-2 text-center">
                {!isFlipped ? (
                  <div className="text-base sm:text-lg font-semibold text-zinc-900 leading-snug">
                    <MathMarkdown content={currentCard.front} />
                  </div>
                ) : (
                  <div className="space-y-3 text-left sm:text-center">
                    <div className="text-sm sm:text-base text-zinc-800 leading-relaxed font-medium">
                      <MathMarkdown content={currentCard.back} />
                    </div>
                    {currentDraft.trim() && (
                      <div className="inline-block w-full text-left rounded-lg bg-zinc-100/80 border border-zinc-200 px-3 py-2 text-xs text-zinc-700">
                        <span className="font-bold text-zinc-900">Your answer: </span>
                        <span>{currentDraft}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Hint on Front */}
                {!isFlipped && currentCard.hint && (
                  <div className="mt-3">
                    {!showHint ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowHint(true);
                        }}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800 underline transition"
                      >
                        <HelpCircle className="h-3.5 w-3.5" />
                        <span>Show Hint</span>
                      </button>
                    ) : (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="inline-block max-w-md mx-auto text-xs bg-amber-50 text-amber-900 border border-amber-200 rounded-lg p-2 mt-1"
                      >
                        <span className="font-bold">Hint: </span>
                        <span>{currentCard.hint}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Flip prompt */}
              <div className="flex items-center justify-center gap-1.5 text-xs text-zinc-400 font-medium pt-2 border-t border-zinc-100">
                <RotateCw className="h-3.5 w-3.5 text-blue-500" />
                <span>
                  Click card to {isFlipped ? "see question again" : "flip & reveal solution"}
                </span>
              </div>
            </div>

            {/* Type Your Answer Box & Check Solution Controls */}
            {!isFlipped ? (
              <form
                onSubmit={handleCheckAnswer}
                className="mt-3 flex flex-col sm:flex-row gap-2 items-stretch sm:items-end"
              >
                <div className="flex-1 min-w-0">
                  <label
                    htmlFor={`fc-answer-${currentCard.id}`}
                    className="block text-[11px] font-semibold text-zinc-600 mb-1"
                  >
                    Your Answer (optional — submit to check score &amp; solution)
                  </label>
                  <textarea
                    id={`fc-answer-${currentCard.id}`}
                    rows={2}
                    value={currentDraft}
                    onChange={(e) => {
                      const val = e.target.value;
                      setTypedAnswers((prev) => ({
                        ...prev,
                        [currentCard.id]: val,
                      }));
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                        e.preventDefault();
                        handleCheckAnswer();
                      }
                    }}
                    placeholder="Type your answer here..."
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs sm:text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                  />
                </div>
                <button
                  type="submit"
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-xs sm:text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition active:scale-95 shrink-0"
                >
                  <Check className="h-4 w-4" />
                  <span>
                    {currentDraft.trim() ? "Check Answer" : "Reveal Solution"}
                  </span>
                </button>
              </form>
            ) : (
              <div className="mt-3 space-y-2.5">
                {/* Auto-evaluation banner when user typed an answer */}
                {currentEval && currentDraft.trim() && (
                  <div
                    className={cn(
                      "rounded-lg border px-3 py-2 text-xs flex flex-wrap items-center justify-between gap-2",
                      currentEval.status === "correct"
                        ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                        : currentEval.status === "partial"
                        ? "bg-blue-50 border-blue-200 text-blue-900"
                        : "bg-amber-50 border-amber-200 text-amber-900"
                    )}
                  >
                    <div className="flex items-center gap-1.5 font-semibold">
                      {currentEval.status === "correct" ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                      ) : (
                        <HelpCircle className="h-4 w-4 text-amber-600 shrink-0" />
                      )}
                      <span>{currentEval.reason}</span>
                    </div>
                  </div>
                )}

                {/* Self-confirmation / Next controls */}
                <div className="flex items-center justify-center gap-2.5">
                  <button
                    type="button"
                    onClick={(e) => markCardStatus(currentCard.id, false, true, e)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 shadow-sm transition active:scale-95"
                  >
                    <XCircle className="h-4 w-4 text-amber-600" />
                    <span>Needs Review (0)</span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => markCardStatus(currentCard.id, true, true, e)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-300 shadow-sm transition active:scale-95"
                  >
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    <span>Got It Right (+1)</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Deck Completed Screen + Full Solutions & AI Grading */
          <div className="py-4 px-2 sm:px-3 space-y-4">
            <div className="text-center flex flex-col items-center justify-center gap-2">
              <div className="h-12 w-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shadow-sm">
                <Trophy className="h-6 w-6" />
              </div>
              <h4 className="text-base sm:text-lg font-bold text-zinc-900">
                Deck Completed — Score:{" "}
                {Number.isInteger(totalScore) ? totalScore : totalScore.toFixed(1)}
                /{overallTotal} ({scorePercent}%)
              </h4>
              <p className="text-xs sm:text-sm text-zinc-600 max-w-md">
                <strong className="text-emerald-700">{masteredIds.size}</strong>{" "}
                mastered •{" "}
                <strong className="text-amber-700">{reviewIds.size}</strong>{" "}
                marked for review
                {answeredTotalCount > 0
                  ? ` • ${answeredTotalCount} typed response${
                      answeredTotalCount === 1 ? "" : "s"
                    }`
                  : ""}
              </p>
            </div>

            {/* All Card Answers & Official Solutions Summary */}
            <div className="max-h-72 overflow-y-auto space-y-2.5 pr-1">
              {data.cards.map((c, idx) => {
                const userAns = (typedAnswers[c.id] || "").trim();
                const isRight = masteredIds.has(c.id);
                return (
                  <div
                    key={c.id ?? idx}
                    className={cn(
                      "rounded-lg border p-3 text-xs space-y-1.5",
                      isRight
                        ? "border-emerald-200 bg-emerald-50/40"
                        : "border-zinc-200 bg-zinc-50/70"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-zinc-900">
                        Card {idx + 1}
                      </span>
                      <span
                        className={cn(
                          "px-2 py-0.5 rounded-full text-[10px] font-bold",
                          isRight
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-amber-100 text-amber-800"
                        )}
                      >
                        {isRight ? "Correct (+1)" : "Review"}
                      </span>
                    </div>
                    <div className="text-zinc-800 font-medium">
                      <MathMarkdown content={c.front} />
                    </div>
                    {userAns && (
                      <div className="text-zinc-600">
                        <span className="font-semibold">Your answer: </span>
                        {userAns}
                      </div>
                    )}
                    <div className="text-zinc-700 bg-white border border-zinc-200/80 rounded p-2">
                      <span className="font-semibold text-blue-900">
                        Solution:{" "}
                      </span>
                      <MathMarkdown content={c.back} />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="pt-2 flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                disabled={isLoading || aiReviewRequested}
                onClick={handleRequestAiGrading}
                className={cn(
                  "inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition active:scale-95 shadow-sm",
                  aiReviewRequested
                    ? "bg-emerald-600 text-white cursor-default"
                    : "bg-blue-600 hover:bg-blue-700 text-white"
                )}
              >
                <Send className="h-4 w-4" />
                <span>
                  {aiReviewRequested
                    ? "Sent to AI Tutor"
                    : "Get AI Score & Solutions"}
                </span>
              </button>
              <button
                type="button"
                onClick={() => handleRestart(false)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-semibold bg-white hover:bg-zinc-50 text-zinc-800 border border-zinc-300 transition active:scale-95 shadow-sm"
              >
                <RotateCcw className="h-4 w-4" />
                <span>Restart Deck</span>
              </button>
              {reviewIds.size > 0 && (
                <button
                  type="button"
                  onClick={() => handleRestart(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-semibold bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 transition active:scale-95 shadow-sm"
                >
                  <Sparkles className="h-4 w-4 text-amber-600" />
                  <span>Practice Review Cards ({reviewIds.size})</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer Navigation Bar */}
      {!isCompleted && (
        <div className="p-3 sm:p-3.5 bg-zinc-50 border-t border-zinc-200 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            disabled={currentIndex === 0}
            onClick={handlePrev}
            className={cn(
              "inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border transition active:scale-95",
              currentIndex === 0
                ? "bg-zinc-100 text-zinc-400 border-zinc-200 cursor-not-allowed"
                : "bg-white hover:bg-zinc-100 text-zinc-700 border-zinc-300 shadow-sm"
            )}
          >
            <ChevronLeft className="h-4 w-4" />
            <span>Previous</span>
          </button>

          <button
            type="button"
            onClick={handleFlip}
            className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-white hover:bg-blue-50 text-blue-700 border border-blue-200 shadow-sm transition active:scale-95"
          >
            <RotateCw className="h-3.5 w-3.5" />
            <span>{isFlipped ? "Show Question" : "Flip Answer"}</span>
          </button>

          <button
            type="button"
            onClick={handleNext}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition active:scale-95"
          >
            <span>
              {currentIndex < totalCards - 1 ? "Next Card" : "Finish & Score"}
            </span>
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
};

export default InteractiveFlashcards;
