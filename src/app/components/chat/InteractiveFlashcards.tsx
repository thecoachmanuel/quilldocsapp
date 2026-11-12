import React, { useState, useEffect, useCallback } from "react";
import { FlashcardsData } from "@/lib/interactive-content";
import MathMarkdown from "./MathMarkdown";
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
} from "lucide-react";

interface InteractiveFlashcardsProps {
  data: FlashcardsData;
}

export const InteractiveFlashcards: React.FC<InteractiveFlashcardsProps> = ({
  data,
}) => {
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [isFlipped, setIsFlipped] = useState<boolean>(false);
  const [showHint, setShowHint] = useState<boolean>(false);
  const [masteredIds, setMasteredIds] = useState<Set<string | number>>(new Set());
  const [reviewIds, setReviewIds] = useState<Set<string | number>>(new Set());
  const [isCompleted, setIsCompleted] = useState<boolean>(false);

  const totalCards = data.cards.length;
  const currentCard = data.cards[currentIndex] || data.cards[0];

  const handleFlip = () => {
    setIsFlipped((prev) => !prev);
  };

  const handleNext = useCallback(() => {
    if (currentIndex < totalCards - 1) {
      setCurrentIndex((prev) => prev + 1);
      setIsFlipped(false);
      setShowHint(false);
    } else {
      setIsCompleted(true);
    }
  }, [currentIndex, totalCards]);

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
      setIsFlipped(false);
      setShowHint(false);
      setIsCompleted(false);
    }
  }, [currentIndex]);

  const markMastered = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!currentCard) return;
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
    handleNext();
  };

  const markReview = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!currentCard) return;
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
    handleNext();
  };

  const handleRestart = (onlyReview = false) => {
    if (!onlyReview) {
      setMasteredIds(new Set());
      setReviewIds(new Set());
    }
    setCurrentIndex(0);
    setIsFlipped(false);
    setShowHint(false);
    setIsCompleted(false);
  };

  // Keyboard navigation when user is focused on the flashcard component
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      if (
        activeEl instanceof HTMLInputElement ||
        activeEl instanceof HTMLTextAreaElement
      ) {
        return; // Don't intercept while typing in chat
      }

      if (e.key === " " || e.key === "Enter") {
        // Space / Enter flips
        e.preventDefault();
        setIsFlipped((prev) => !prev);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        handleNext();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        handlePrev();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleNext, handlePrev]);

  const progressPercent = Math.round(((currentIndex + 1) / totalCards) * 100);

  return (
    <div
      data-interactive-flashcards="true"
      className="my-3 w-full max-w-full rounded-xl border border-zinc-200/90 bg-white shadow-xs overflow-hidden not-prose transition-all font-sans"
    >
      {/* Header */}
      <div className="bg-linear-to-r from-blue-50/80 via-white to-indigo-50/60 border-b border-zinc-200/80 p-3.5 sm:p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white shrink-0 shadow-xs">
            <Layers className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h4 className="text-sm sm:text-base font-bold text-zinc-900 truncate">
              {data.title || "Study Flashcards"}
            </h4>
            <p className="text-xs text-zinc-500 font-medium">
              Card {currentIndex + 1} of {totalCards} • Tap card to flip & reveal answer
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-xs font-semibold">
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-100/90 text-emerald-800 border border-emerald-300">
            <CheckCircle2 className="h-3 w-3" />
            <span>{masteredIds.size} Mastered</span>
          </span>
          {reviewIds.size > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-100/90 text-amber-800 border border-amber-300">
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
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Flashcard Body */}
      <div className="p-3.5 sm:p-5">
        {!isCompleted && currentCard ? (
          <div>
            {/* The Flippable Card */}
            <div
              tabIndex={0}
              role="button"
              aria-label="Flashcard - click to flip"
              onClick={handleFlip}
              className={cn(
                "relative min-h-[220px] sm:min-h-[240px] w-full rounded-2xl border p-5 sm:p-6 transition-all duration-300 flex flex-col justify-between cursor-pointer select-none outline-hidden focus:ring-2 focus:ring-blue-500 shadow-xs hover:shadow-md",
                !isFlipped
                  ? "bg-linear-to-b from-white to-zinc-50/70 border-zinc-200"
                  : "bg-linear-to-b from-blue-50/40 via-white to-indigo-50/40 border-blue-300"
              )}
            >
              {/* Card Top Label */}
              <div className="flex items-center justify-between gap-2 mb-3">
                <span
                  className={cn(
                    "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wide uppercase",
                    !isFlipped
                      ? "bg-blue-100 text-blue-800 border border-blue-200"
                      : "bg-emerald-100 text-emerald-800 border border-emerald-200"
                  )}
                >
                  <BookOpen className="h-3 w-3" />
                  {!isFlipped ? "Question / Term" : "Answer & Explanation"}
                </span>

                <span className="text-xs font-semibold text-zinc-400">
                  {currentIndex + 1} / {totalCards}
                </span>
              </div>

              {/* Card Main Content */}
              <div className="flex-1 flex flex-col justify-center my-3 text-center">
                {!isFlipped ? (
                  <div className="text-base sm:text-lg font-semibold text-zinc-900 leading-snug">
                    <MathMarkdown content={currentCard.front} />
                  </div>
                ) : (
                  <div className="text-sm sm:text-base text-zinc-800 leading-relaxed text-left sm:text-center">
                    <MathMarkdown content={currentCard.back} />
                  </div>
                )}

                {/* Optional Hint on Front */}
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
                        <span>Need a hint?</span>
                      </button>
                    ) : (
                      <div className="inline-block max-w-md mx-auto text-xs bg-amber-50 text-amber-900 border border-amber-200/80 rounded-lg p-2 mt-1">
                        <span className="font-bold">Hint: </span>
                        <span>{currentCard.hint}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Card Flip Prompt */}
              <div className="flex items-center justify-center gap-1.5 text-xs text-zinc-400 font-medium pt-2 border-t border-zinc-100">
                <RotateCw className="h-3.5 w-3.5 text-blue-500 animate-spin-reverse" />
                <span>Click card or press Space to {isFlipped ? "flip back" : "flip answer"}</span>
              </div>
            </div>

            {/* Answer & Self-Scoring Controls (visible when flipped) */}
            {isFlipped && (
              <div className="mt-3 flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={markReview}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs transition active:scale-95"
                >
                  <XCircle className="h-4 w-4 text-amber-600" />
                  <span>Still Learning (Review)</span>
                </button>
                <button
                  type="button"
                  onClick={markMastered}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-300 shadow-2xs transition active:scale-95"
                >
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <span>Mastered (Got it!)</span>
                </button>
              </div>
            )}
          </div>
        ) : (
          /* Deck Completed Screen */
          <div className="py-8 px-4 text-center flex flex-col items-center justify-center gap-3">
            <div className="h-14 w-14 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shadow-xs">
              <Trophy className="h-8 w-8" />
            </div>
            <h4 className="text-lg font-bold text-zinc-900">
              Deck Completed! 🎓
            </h4>
            <p className="text-sm text-zinc-600 max-w-sm">
              You reviewed all {totalCards} flashcards. You mastered{" "}
              <strong className="text-emerald-700">{masteredIds.size}</strong> and have{" "}
              <strong className="text-amber-700">{reviewIds.size}</strong> marked for review.
            </p>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => handleRestart(false)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white transition active:scale-95 shadow-xs"
              >
                <RotateCcw className="h-4 w-4" />
                <span>Restart All Cards</span>
              </button>
              {reviewIds.size > 0 && (
                <button
                  type="button"
                  onClick={() => handleRestart(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-white hover:bg-zinc-50 text-zinc-800 border border-zinc-300 transition active:scale-95 shadow-xs"
                >
                  <Sparkles className="h-4 w-4 text-amber-600" />
                  <span>Practice Review Cards</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer Navigation Bar */}
      {!isCompleted && (
        <div className="p-3 sm:p-3.5 bg-zinc-50 border-t border-zinc-200/80 flex items-center justify-between gap-2">
          <button
            type="button"
            disabled={currentIndex === 0}
            onClick={handlePrev}
            className={cn(
              "inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border transition active:scale-95",
              currentIndex === 0
                ? "bg-zinc-100 text-zinc-400 border-zinc-200 cursor-not-allowed"
                : "bg-white hover:bg-zinc-100 text-zinc-700 border-zinc-300 shadow-2xs"
            )}
          >
            <ChevronLeft className="h-4 w-4" />
            <span>Previous</span>
          </button>

          <button
            type="button"
            onClick={handleFlip}
            className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-white hover:bg-blue-50 text-blue-700 border border-blue-200 shadow-2xs transition active:scale-95"
          >
            <RotateCw className="h-3.5 w-3.5" />
            <span>{isFlipped ? "Show Question" : "Reveal Answer"}</span>
          </button>

          <button
            type="button"
            onClick={handleNext}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-2xs transition active:scale-95"
          >
            <span>{currentIndex < totalCards - 1 ? "Next" : "Finish"}</span>
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
};

export default InteractiveFlashcards;

