import React, { useContext, useEffect, useMemo, useState } from "react";
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

interface PersistedFlashcardsState {
  currentIndex: number;
  isCompleted: boolean;
  typedAnswers: Record<string | number, string>;
  evaluations: Record<string | number, FlashcardEvaluation>;
  masteredIds: Array<string | number>;
  reviewIds: Array<string | number>;
  aiReviewRequested: boolean;
}

const flashMemoryStore = new Map<string, PersistedFlashcardsState>();

function buildDeckKey(data: FlashcardsData): string {
  const sig = `${data.title}|${data.cards.map((c) => c.front).join("|")}`;
  let hash = 5381;
  for (let i = 0; i < sig.length; i++) {
    hash = (hash * 33) ^ sig.charCodeAt(i);
  }
  return `quill-fc-${(hash >>> 0).toString(36)}`;
}

function loadDeckState(key: string): PersistedFlashcardsState | null {
  const inMem = flashMemoryStore.get(key);
  if (inMem) return inMem;
  if (typeof window !== "undefined") {
    try {
      const raw = window.sessionStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw) as PersistedFlashcardsState;
        flashMemoryStore.set(key, parsed);
        return parsed;
      }
    } catch {
      // Ignore storage access errors
    }
  }
  return null;
}

function saveDeckState(key: string, state: PersistedFlashcardsState) {
  flashMemoryStore.set(key, state);
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.setItem(key, JSON.stringify(state));
    } catch {
      // Ignore storage quota errors
    }
  }
}

export const InteractiveFlashcards: React.FC<InteractiveFlashcardsProps> = ({
  data,
}) => {
  const { submitPrompt, isLoading } = useContext(ChatContext);
  const storageKey = useMemo(() => buildDeckKey(data), [data]);
  const initialState = useMemo(() => loadDeckState(storageKey), [storageKey]);

  const [reviewFilterIds, setReviewFilterIds] = useState<Set<
    string | number
  > | null>(null);
  const [currentIndex, setCurrentIndex] = useState<number>(
    initialState?.currentIndex ?? 0
  );
  const [isFlipped, setIsFlipped] = useState<boolean>(false);
  const [showHint, setShowHint] = useState<boolean>(false);
  const [isCompleted, setIsCompleted] = useState<boolean>(
    initialState?.isCompleted ?? false
  );

  const [typedAnswers, setTypedAnswers] = useState<
    Record<string | number, string>
  >(initialState?.typedAnswers ?? {});
  const [evaluations, setEvaluations] = useState<
    Record<string | number, FlashcardEvaluation>
  >(initialState?.evaluations ?? {});
  const [masteredIds, setMasteredIds] = useState<Set<string | number>>(
    () => new Set(initialState?.masteredIds ?? [])
  );
  const [reviewIds, setReviewIds] = useState<Set<string | number>>(
    () => new Set(initialState?.reviewIds ?? [])
  );
  const [aiReviewRequested, setAiReviewRequested] = useState<boolean>(
    initialState?.aiReviewRequested ?? false
  );

  useEffect(() => {
    saveDeckState(storageKey, {
      currentIndex,
      isCompleted,
      typedAnswers,
      evaluations,
      masteredIds: Array.from(masteredIds),
      reviewIds: Array.from(reviewIds),
      aiReviewRequested,
    });
  }, [
    storageKey,
    currentIndex,
    isCompleted,
    typedAnswers,
    evaluations,
    masteredIds,
    reviewIds,
    aiReviewRequested,
  ]);

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
      className="my-3 w-full max-w-full rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden not-prose font-sans focus:outline-none focus:ring-2 focus:ring-blue-500/40"
    >
      {/* Simple Header */}
      <div className="p-4 border-b border-zinc-200 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white shrink-0">
            <Layers className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h4 className="text-base font-bold text-gray-900 truncate">
              {data.title || "Study Flashcards"}
            </h4>
            <p className="text-xs text-zinc-500">
              {isCompleted
                ? `Completed ${overallTotal} card${overallTotal === 1 ? "" : "s"}`
                : `Card ${safeIndex + 1} of ${totalCards}`}
            </p>
          </div>
        </div>

        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-zinc-100 text-zinc-700">
          <Award className="h-3.5 w-3.5 text-blue-600" />
          <span>
            {formattedTotalScore}/{overallTotal}
          </span>
        </span>
      </div>

      {/* Slim Progress Bar */}
      <div className="w-full bg-zinc-100 h-1 overflow-hidden">
        <div
          className="bg-blue-600 h-full transition-all duration-300"
          style={{ width: `${isCompleted ? 100 : progressPercent}%` }}
        />
      </div>

      {/* Body */}
      <div className="p-4 sm:p-5">
        {!isCompleted && currentCard ? (
          <div>
            {/* Simple Card */}
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
                "min-h-[190px] w-full rounded-xl border p-5 sm:p-6 transition cursor-pointer flex flex-col justify-between focus:outline-none focus:ring-2 focus:ring-blue-500",
                !isFlipped
                  ? "bg-white border-zinc-200 hover:border-zinc-300"
                  : "bg-zinc-50/60 border-blue-200"
              )}
            >
              <div className="flex items-center justify-between gap-2 mb-3">
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold",
                    !isFlipped
                      ? "bg-blue-50 text-blue-700"
                      : "bg-emerald-50 text-emerald-700"
                  )}
                >
                  <BookOpen className="h-3 w-3" />
                  {!isFlipped ? "Question" : "Answer"}
                </span>

                <span className="text-xs text-zinc-400">Tap to flip</span>
              </div>

              <div className="flex-1 flex flex-col justify-center my-2">
                {!isFlipped ? (
                  <div className="text-base sm:text-lg font-semibold text-gray-900 leading-relaxed text-left sm:text-center">
                    <MathMarkdown
                      content={currentCard.front}
                      size="large"
                      className="font-semibold text-gray-900"
                    />
                  </div>
                ) : (
                  <div className="space-y-2.5 text-left">
                    <div className="text-sm sm:text-base text-gray-900 leading-relaxed font-medium">
                      <MathMarkdown
                        content={currentCard.back}
                        size="normal"
                        className="text-gray-900"
                      />
                    </div>
                    {currentDraft.trim() && (
                      <div className="rounded-lg bg-white border border-zinc-200 px-3 py-2 text-xs sm:text-sm text-zinc-700">
                        <span className="font-semibold text-gray-900">
                          Your answer:{" "}
                        </span>
                        {currentDraft}
                      </div>
                    )}
                  </div>
                )}

                {!isFlipped && currentCard.hint && (
                  <div className="mt-3 text-center">
                    {!showHint ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowHint(true);
                        }}
                        className="text-xs font-medium text-blue-600 hover:underline"
                      >
                        Show Hint
                      </button>
                    ) : (
                      <p
                        onClick={(e) => e.stopPropagation()}
                        className="inline-block text-xs bg-zinc-100 text-zinc-700 rounded-md px-3 py-1.5 mt-1"
                      >
                        <span className="font-semibold">Hint: </span>
                        {currentCard.hint}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Answer Box / Rating Controls */}
            {!isFlipped ? (
              <form
                onSubmit={handleCheckOrReveal}
                className="mt-3 flex flex-col sm:flex-row gap-2 items-stretch sm:items-center"
              >
                <input
                  id={`fc-answer-${currentCard.id}`}
                  type="text"
                  value={currentDraft}
                  onChange={(e) => {
                    const val = e.target.value;
                    setTypedAnswers((prev) => ({
                      ...prev,
                      [currentCard.id]: val,
                    }));
                  }}
                  placeholder="Type your answer (optional)..."
                  className="flex-1 rounded-lg border border-zinc-200 bg-white px-3.5 py-2.5 text-sm sm:text-base text-gray-900 placeholder:text-zinc-400 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
                />
                <button
                  type="submit"
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition active:scale-95 shrink-0"
                >
                  {currentDraft.trim() ? (
                    <>
                      <Check className="h-4 w-4" />
                      <span>Check</span>
                    </>
                  ) : (
                    <>
                      <RotateCw className="h-4 w-4" />
                      <span>Show Answer</span>
                    </>
                  )}
                </button>
              </form>
            ) : (
              <div className="mt-3 space-y-2.5">
                {currentEval && currentDraft.trim() && (
                  <div
                    className={cn(
                      "rounded-lg border px-3 py-2 text-xs sm:text-sm flex items-center gap-2 font-medium",
                      currentEval.status === "correct"
                        ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                        : currentEval.status === "partial"
                          ? "bg-blue-50 border-blue-200 text-blue-900"
                          : "bg-amber-50 border-amber-200 text-amber-900"
                    )}
                  >
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    <span>{currentEval.reason}</span>
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={(e) => markCardStatus(currentCard.id, false, true, e)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs sm:text-sm font-semibold bg-white hover:bg-amber-50 text-amber-800 border border-zinc-200 transition"
                  >
                    <XCircle className="h-4 w-4 text-amber-600" />
                    <span>Needs Review</span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => markCardStatus(currentCard.id, true, true, e)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs sm:text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Got It</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Simple Completion View */
          <div className="py-2 space-y-4">
            <div className="text-center space-y-1">
              <div className="mx-auto h-10 w-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <Trophy className="h-5 w-5" />
              </div>
              <h4 className="text-base font-bold text-gray-900">
                Score: {formattedTotalScore}/{overallTotal} ({scorePercent}%)
              </h4>
              <p className="text-xs text-zinc-500">
                {masteredIds.size} mastered · {reviewIds.size} for review
                {answeredTotalCount > 0 ? ` · ${answeredTotalCount} answered` : ""}
              </p>
            </div>

            <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
              {data.cards.map((c, idx) => {
                const isRight = masteredIds.has(c.id);
                return (
                  <div
                    key={`${c.id}-${idx}`}
                    className="rounded-lg border border-zinc-200 p-3 text-sm space-y-1 bg-zinc-50/40"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-gray-900 text-xs">
                        Card {idx + 1}
                      </span>
                      <span
                        className={cn(
                          "text-[11px] font-semibold",
                          isRight ? "text-emerald-700" : "text-amber-700"
                        )}
                      >
                        {isRight ? "Correct" : "Review"}
                      </span>
                    </div>
                    <MathMarkdown
                      content={c.front}
                      size="normal"
                      className="font-medium text-gray-900 [&_p]:my-0"
                    />
                    <div className="text-zinc-700 text-xs sm:text-sm pt-1 border-t border-zinc-200/70">
                      <MathMarkdown
                        content={c.back}
                        size="normal"
                        className="[&_p]:my-0"
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
              <button
                type="button"
                disabled={isLoading || aiReviewRequested}
                onClick={handleRequestAiGrading}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition",
                  aiReviewRequested
                    ? "bg-emerald-600 text-white"
                    : "bg-blue-600 hover:bg-blue-700 text-white"
                )}
              >
                <Send className="h-3.5 w-3.5" />
                <span>
                  {aiReviewRequested ? "Sent to AI" : "Ask AI Tutor"}
                </span>
              </button>
              <button
                type="button"
                onClick={() => handleRestart(false)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-white hover:bg-zinc-50 text-zinc-700 border border-zinc-200 transition"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Restart</span>
              </button>
              {reviewIds.size > 0 && (
                <button
                  type="button"
                  onClick={() => handleRestart(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-white hover:bg-amber-50 text-amber-800 border border-amber-200 transition"
                >
                  <span>Review ({reviewIds.size})</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Simple Footer */}
      {!isCompleted && (
        <div className="px-4 py-3 bg-zinc-50 border-t border-zinc-200 flex items-center justify-between gap-2">
          <button
            type="button"
            disabled={safeIndex === 0}
            onClick={handlePrev}
            className={cn(
              "inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border transition",
              safeIndex === 0
                ? "bg-zinc-100 text-zinc-400 border-zinc-200 cursor-not-allowed"
                : "bg-white hover:bg-zinc-50 text-zinc-700 border-zinc-200"
            )}
          >
            <ChevronLeft className="h-4 w-4" />
            <span>Prev</span>
          </button>

          <button
            type="button"
            onClick={handleFlip}
            className="text-xs font-semibold text-blue-600 hover:text-blue-700"
          >
            {isFlipped ? "Show Question" : "Flip"}
          </button>

          <button
            type="button"
            onClick={handleNext}
            className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white transition"
          >
            <span>{safeIndex < totalCards - 1 ? "Next" : "Finish"}</span>
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
};

export default InteractiveFlashcards;
