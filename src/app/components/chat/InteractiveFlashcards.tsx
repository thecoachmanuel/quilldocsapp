import React, { useContext, useMemo, useState } from "react";
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

  const [reviewFilterIds, setReviewFilterIds] = useState<Set<
    string | number
  > | null>(null);
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

  const activeCards: FlashcardItem[] = useMemo(() => {
    if (!reviewFilterIds) return data.cards;
    const filtered = data.cards.filter((c) => reviewFilterIds.has(c.id));
    return filtered.length > 0 ? filtered : data.cards;
  }, [data.cards, reviewFilterIds]);

  const totalCards = activeCards.length;
  const safeIndex = Math.min(currentIndex, Math.max(0, totalCards - 1));
  const currentCard = activeCards[safeIndex];
  const currentDraft = currentCard ? typedAnswers[currentCard.id] ?? "" : "";
  const currentEval = currentCard ? evaluations[currentCard.id] : undefined;

  const totalScore = data.cards.reduce((acc, card) => {
    if (masteredIds.has(card.id)) return acc + 1;
    const ev = evaluations[card.id];
    if (ev) return acc + ev.score;
    return acc;
  }, 0);
  const overallTotal = data.cards.length;
  const scorePercent = Math.round(
    (totalScore / Math.max(1, overallTotal)) * 100
  );

  const goToCard = (idx: number) => {
    const clamped = Math.max(0, Math.min(idx, totalCards - 1));
    setCurrentIndex(clamped);
    setIsFlipped(false);
    setShowHint(false);
    setIsCompleted(false);
  };

  const handleFlip = () => {
    setIsFlipped((prev) => !prev);
  };

  const handleNext = () => {
    if (safeIndex < totalCards - 1) {
      goToCard(safeIndex + 1);
    } else {
      setIsCompleted(true);
    }
  };

  const handlePrev = () => {
    if (safeIndex > 0) {
      goToCard(safeIndex - 1);
    }
  };

  const handleCheckOrReveal = (e?: React.FormEvent | React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!currentCard) return;

    const trimmedDraft = currentDraft.trim();
    if (!trimmedDraft) {
      // Blank answer: flip smoothly to reveal solution without penalizing score
      setIsFlipped(true);
      return;
    }

    const evalResult = evaluateFlashcardAnswer(trimmedDraft, currentCard.back);
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
      const toPracticeIds = data.cards
        .filter((c) => reviewIds.has(c.id) || !masteredIds.has(c.id))
        .map((c) => c.id);
      if (toPracticeIds.length > 0) {
        setReviewFilterIds(new Set(toPracticeIds));
      } else {
        setReviewFilterIds(null);
      }
    } else {
      setReviewFilterIds(null);
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
    ((safeIndex + 1) / Math.max(1, totalCards)) * 100
  );
  const answeredTotalCount = Object.keys(typedAnswers).filter((k) =>
    typedAnswers[k]?.trim()
  ).length;
  const formattedTotalScore = Number.isInteger(totalScore)
    ? totalScore
    : totalScore.toFixed(1);

  return (
    <div
      data-interactive-flashcards="true"
      tabIndex={0}
      onKeyDown={handleContainerKeyDown}
      className="my-3 w-full max-w-full rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden not-prose transition-all font-sans focus:outline-none focus:ring-2 focus:ring-blue-500/40"
    >
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-50 via-white to-indigo-50/70 border-b border-zinc-200 p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-white shrink-0 shadow-sm">
            <Layers className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h4 className="text-base sm:text-lg font-bold text-zinc-900 truncate">
              {data.title || "Study Flashcards"}
            </h4>
            <p className="text-xs sm:text-sm text-zinc-600 font-medium">
              {isCompleted
                ? `Completed ${overallTotal} card${overallTotal === 1 ? "" : "s"}`
                : `Card ${safeIndex + 1} of ${totalCards} • Answer & check solution, or click card to flip`}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm font-semibold">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-100 text-blue-800 border border-blue-200">
            <Award className="h-3.5 w-3.5" />
            <span>
              Score: {formattedTotalScore}/{overallTotal}
            </span>
          </span>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>{masteredIds.size} Correct</span>
          </span>
          {reviewIds.size > 0 && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 border border-amber-300">
              <XCircle className="h-3.5 w-3.5" />
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

      {/* Quick Card Navigator */}
      {!isCompleted && totalCards > 1 && (
        <div className="px-4 sm:px-5 pt-3 flex flex-wrap items-center gap-1.5">
          {activeCards.map((c, idx) => {
            const isCurrent = idx === safeIndex;
            const isCardMastered = masteredIds.has(c.id);
            const isCardReview = reviewIds.has(c.id);
            return (
              <button
                key={`${c.id}-${idx}`}
                type="button"
                onClick={() => goToCard(idx)}
                title={`Go to Card ${idx + 1}`}
                className={cn(
                  "h-7 min-w-[28px] px-2 rounded-md text-xs font-bold border transition",
                  isCurrent
                    ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                    : isCardMastered
                      ? "bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100"
                      : isCardReview
                        ? "bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100"
                        : "bg-zinc-50 text-zinc-600 border-zinc-200 hover:bg-zinc-100"
                )}
              >
                {idx + 1}
              </button>
            );
          })}
        </div>
      )}

      {/* Flashcard Body */}
      <div className="p-4 sm:p-5">
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
                "relative min-h-[210px] sm:min-h-[230px] w-full rounded-2xl border p-5 sm:p-6 transition-all duration-200 flex flex-col justify-between cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm hover:shadow-md",
                !isFlipped
                  ? "bg-gradient-to-b from-white to-zinc-50 border-zinc-200"
                  : "bg-gradient-to-b from-emerald-50/50 via-white to-blue-50/40 border-emerald-300"
              )}
            >
              {/* Top Row */}
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold tracking-wide uppercase",
                      !isFlipped
                        ? "bg-blue-100 text-blue-800 border border-blue-200"
                        : "bg-emerald-100 text-emerald-800 border border-emerald-200"
                    )}
                  >
                    <BookOpen className="h-3.5 w-3.5" />
                    {!isFlipped ? "Question / Prompt" : "Official Solution"}
                  </span>

                  {masteredIds.has(currentCard.id) && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Correct (+1)
                    </span>
                  )}
                  {!masteredIds.has(currentCard.id) &&
                    currentEval?.status === "partial" && (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800">
                        Partial (+0.5)
                      </span>
                    )}
                  {reviewIds.has(currentCard.id) &&
                    currentEval?.status !== "partial" && (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800">
                        Needs Review
                      </span>
                    )}
                </div>

                <span className="text-xs sm:text-sm font-semibold text-zinc-500">
                  {safeIndex + 1} / {totalCards}
                </span>
              </div>

              {/* Front or Back Content */}
              <div className="flex-1 flex flex-col justify-center my-2">
                {!isFlipped ? (
                  <div className="text-base sm:text-lg font-semibold text-zinc-900 leading-relaxed text-left sm:text-center">
                    <MathMarkdown
                      content={currentCard.front}
                      size="large"
                      className="font-semibold text-zinc-900"
                    />
                  </div>
                ) : (
                  <div className="space-y-3 text-left">
                    <div className="text-sm sm:text-base text-zinc-900 leading-relaxed font-medium">
                      <MathMarkdown
                        content={currentCard.back}
                        size="normal"
                        className="text-zinc-900"
                      />
                    </div>
                    {currentDraft.trim() && (
                      <div className="w-full text-left rounded-lg bg-zinc-100/90 border border-zinc-200 px-3.5 py-2.5 text-sm text-zinc-800">
                        <span className="font-bold text-zinc-900">
                          Your answer:{" "}
                        </span>
                        <span>{currentDraft}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Hint on Front */}
                {!isFlipped && currentCard.hint && (
                  <div className="mt-3 text-center">
                    {!showHint ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowHint(true);
                        }}
                        className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 hover:text-blue-800 underline transition"
                      >
                        <HelpCircle className="h-4 w-4" />
                        <span>Show Hint</span>
                      </button>
                    ) : (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="inline-block max-w-lg mx-auto text-sm bg-amber-50 text-amber-900 border border-amber-200 rounded-lg px-3.5 py-2 mt-1 text-left"
                      >
                        <span className="font-bold">Hint: </span>
                        <span>{currentCard.hint}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Flip prompt */}
              <div className="flex items-center justify-center gap-1.5 text-xs sm:text-sm text-zinc-500 font-medium pt-3 border-t border-zinc-100">
                <RotateCw className="h-3.5 w-3.5 text-blue-600" />
                <span>
                  Click card to{" "}
                  {isFlipped ? "see question again" : "flip & reveal solution"}
                </span>
              </div>
            </div>

            {/* Type Your Answer Box & Check Solution Controls */}
            {!isFlipped ? (
              <form
                onSubmit={handleCheckOrReveal}
                className="mt-3.5 flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-end"
              >
                <div className="flex-1 min-w-0">
                  <label
                    htmlFor={`fc-answer-${currentCard.id}`}
                    className="block text-xs sm:text-sm font-semibold text-zinc-700 mb-1.5"
                  >
                    Your Answer (type to auto-check, or flip to study solution)
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
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleCheckOrReveal();
                      }
                    }}
                    placeholder="Type your answer and press Enter to check..."
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm sm:text-base text-zinc-900 placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                  />
                </div>
                <button
                  type="submit"
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-3 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition active:scale-95 shrink-0"
                >
                  {currentDraft.trim() ? (
                    <>
                      <Check className="h-4 w-4" />
                      <span>Check Answer</span>
                    </>
                  ) : (
                    <>
                      <RotateCw className="h-4 w-4" />
                      <span>Reveal Solution</span>
                    </>
                  )}
                </button>
              </form>
            ) : (
              <div className="mt-3.5 space-y-3">
                {/* Auto-evaluation banner when user typed an answer */}
                {currentEval && currentDraft.trim() && (
                  <div
                    className={cn(
                      "rounded-lg border px-3.5 py-2.5 text-sm flex flex-wrap items-center justify-between gap-2",
                      currentEval.status === "correct"
                        ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                        : currentEval.status === "partial"
                          ? "bg-blue-50 border-blue-200 text-blue-900"
                          : "bg-amber-50 border-amber-200 text-amber-900"
                    )}
                  >
                    <div className="flex items-center gap-2 font-semibold">
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
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-2.5">
                  <button
                    type="button"
                    onClick={(e) => markCardStatus(currentCard.id, false, true, e)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 shadow-sm transition active:scale-95"
                  >
                    <XCircle className="h-4 w-4 text-amber-600" />
                    <span>Needs Review (0)</span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => markCardStatus(currentCard.id, true, true, e)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-300 shadow-sm transition active:scale-95"
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
          <div className="py-4 px-1 sm:px-2 space-y-4">
            <div className="text-center flex flex-col items-center justify-center gap-2">
              <div className="h-12 w-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shadow-sm">
                <Trophy className="h-6 w-6" />
              </div>
              <h4 className="text-base sm:text-lg font-bold text-zinc-900">
                Deck Completed — Score: {formattedTotalScore}/{overallTotal} (
                {scorePercent}%)
              </h4>
              <p className="text-sm text-zinc-600 max-w-md">
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
            <div className="max-h-96 overflow-y-auto space-y-3 pr-1">
              {data.cards.map((c, idx) => {
                const userAns = (typedAnswers[c.id] || "").trim();
                const isRight = masteredIds.has(c.id);
                const ev = evaluations[c.id];
                const isPartial = !isRight && ev?.status === "partial";
                return (
                  <div
                    key={`${c.id}-${idx}`}
                    className={cn(
                      "rounded-xl border p-3.5 sm:p-4 text-sm sm:text-base space-y-2",
                      isRight
                        ? "border-emerald-200 bg-emerald-50/40"
                        : isPartial
                          ? "border-blue-200 bg-blue-50/40"
                          : "border-zinc-200 bg-zinc-50/70"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-zinc-900 text-sm">
                        Card {idx + 1}
                      </span>
                      <span
                        className={cn(
                          "px-2.5 py-0.5 rounded-full text-xs font-bold",
                          isRight
                            ? "bg-emerald-100 text-emerald-800"
                            : isPartial
                              ? "bg-blue-100 text-blue-800"
                              : "bg-amber-100 text-amber-800"
                        )}
                      >
                        {isRight
                          ? "Correct (+1)"
                          : isPartial
                            ? "Partial (+0.5)"
                            : "Review"}
                      </span>
                    </div>
                    <div className="text-zinc-900 font-semibold">
                      <MathMarkdown content={c.front} size="normal" />
                    </div>
                    {userAns && (
                      <div className="text-sm text-zinc-700">
                        <span className="font-semibold text-zinc-900">
                          Your answer:{" "}
                        </span>
                        {userAns}
                      </div>
                    )}
                    <div className="text-zinc-800 bg-white border border-zinc-200/80 rounded-lg p-3">
                      <span className="block text-xs font-bold uppercase tracking-wide text-blue-800 mb-1">
                        Solution
                      </span>
                      <MathMarkdown content={c.back} size="normal" />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="pt-2 flex flex-wrap items-center justify-center gap-2.5">
              <button
                type="button"
                disabled={isLoading || aiReviewRequested}
                onClick={handleRequestAiGrading}
                className={cn(
                  "inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-semibold transition active:scale-95 shadow-sm",
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
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-semibold bg-white hover:bg-zinc-50 text-zinc-800 border border-zinc-300 transition active:scale-95 shadow-sm"
              >
                <RotateCcw className="h-4 w-4" />
                <span>Restart Deck</span>
              </button>
              {reviewIds.size > 0 && (
                <button
                  type="button"
                  onClick={() => handleRestart(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-semibold bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 transition active:scale-95 shadow-sm"
                >
                  <RotateCcw className="h-4 w-4 text-amber-600" />
                  <span>Practice Review Cards ({reviewIds.size})</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer Navigation Bar */}
      {!isCompleted && (
        <div className="p-3.5 sm:p-4 bg-zinc-50 border-t border-zinc-200 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            disabled={safeIndex === 0}
            onClick={handlePrev}
            className={cn(
              "inline-flex items-center gap-1 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-semibold border transition active:scale-95",
              safeIndex === 0
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
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold bg-white hover:bg-blue-50 text-blue-700 border border-blue-200 shadow-sm transition active:scale-95"
          >
            <RotateCw className="h-4 w-4" />
            <span>{isFlipped ? "Show Question" : "Flip Answer"}</span>
          </button>

          <button
            type="button"
            onClick={handleNext}
            className="inline-flex items-center gap-1 px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition active:scale-95"
          >
            <span>
              {safeIndex < totalCards - 1 ? "Next Card" : "Finish & Score"}
            </span>
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
};

export default InteractiveFlashcards;
