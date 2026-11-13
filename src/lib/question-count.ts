import {
  ExamMcqQuestion,
  ExamPaperData,
  ExamTheoryQuestion,
  FlashcardItem,
  FlashcardsData,
  QuizData,
  QuizQuestion,
} from "./interactive-content";

export interface RequestedQuestionCounts {
  kind: "exam" | "quiz" | "flashcards";
  mcqCount: number | null;
  theoryCount: number | null;
  totalCount: number | null;
  hasExplicitCount: boolean;
}

const NUMBER_WORDS: Record<string, number> = {
  zero: 0,
  none: 0,
  no: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  "twenty-one": 21,
  "twenty-two": 22,
  "twenty-three": 23,
  "twenty-four": 24,
  "twenty-five": 25,
  "twenty-six": 26,
  "twenty-seven": 27,
  "twenty-eight": 28,
  "twenty-nine": 29,
  thirty: 30,
  "thirty-five": 35,
  forty: 40,
  "forty-five": 45,
  fifty: 50,
};

const NUM_TOKEN_PATTERN =
  "(?:\\d+|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty(?:[-\\s](?:one|two|three|four|five|six|seven|eight|nine))?|thirty(?:[-\\s]five)?|forty(?:[-\\s]five)?|fifty)";

export const MAX_EXAM_MCQ = 20;
export const MAX_EXAM_THEORY = 4;
export const MAX_EXAM_TOTAL = 20;
export const MAX_QUIZ_QUESTIONS = 20;
export const MAX_FLASHCARDS = 12;

function parseNumberToken(raw: string | undefined): number | null {
  if (!raw) return null;
  const normalized = raw.trim().toLowerCase().replace(/\s+/g, "-");
  if (/^\d+$/.test(normalized)) {
    const val = parseInt(normalized, 10);
    return isNaN(val) ? null : val;
  }
  return normalized in NUMBER_WORDS ? NUMBER_WORDS[normalized] : null;
}

function clampCount(n: number, max: number): number {
  return Math.max(0, Math.min(max, n));
}

/**
 * Extracts explicit requested counts for Exams (MCQ + Theory), Quizzes, or Flashcards
 * from natural-language user prompts and ExamBuilderModal instructions.
 */
export function extractRequestedQuestionCounts(
  message: string,
  options?: { isExamRequest?: boolean }
): RequestedQuestionCounts | null {
  const text = (message || "").trim();
  if (!text) return null;

  const isGradingSubmission =
    /\b(?:QUIZ SUBMISSION|FLASHCARD SUBMISSION FOR AI GRADING)\b/i.test(text);
  if (isGradingSubmission) return null;

  const isFlashcards =
    !options?.isExamRequest &&
    /\b(?:flashcards?|study\s+cards?)\b/i.test(text);
  const isExam =
    Boolean(options?.isExamRequest) ||
    /\b(?:exam|examination|theory|essay|objective|obj|past\s+questions?|test\s+paper|mock\s+(?:exam|test)|midterm|marking\s+(?:scheme|guide))\b/i.test(
      text
    );
  const isQuiz =
    !isExam &&
    !isFlashcards &&
    /\b(?:quiz|practice\s+questions?|practice\s+test|test\s+me|questions?|mcqs?|multiple[- ]choice)\b/i.test(
      text
    );

  if (!isExam && !isFlashcards && !isQuiz) {
    return null;
  }

  const mcqNoun =
    "(?:multiple[- ]choice(?:\\s+questions?)?|mcqs?|objectives?(?:\\s+questions?)?|obj(?:\\s+questions?)?)";
  const theoryNoun =
    "(?:theory(?:\\s*(?:\\/|and|&|or)\\s*essay)?(?:\\s+questions?)?|essay(?:\\s+questions?)?|structured(?:\\s+questions?)?|long[- ]answer(?:\\s+questions?)?)";

  let mcqCount: number | null = null;
  let theoryCount: number | null = null;
  let totalCount: number | null = null;

  // Explicit "no / zero / without" exclusions
  if (
    new RegExp(
      `\\b(?:no|zero|without)\\s+${mcqNoun}\\b|\\b0\\s+${mcqNoun}\\b`,
      "i"
    ).test(text)
  ) {
    mcqCount = 0;
  }
  if (
    new RegExp(
      `\\b(?:no|zero|without)\\s+${theoryNoun}\\b|\\b0\\s+${theoryNoun}\\b`,
      "i"
    ).test(text)
  ) {
    theoryCount = 0;
  }

  // Number before MCQ/Theory noun (e.g., "10 multiple-choice questions", "EXACTLY 8 mcqs")
  if (mcqCount === null) {
    const m =
      text.match(
        new RegExp(`\\b(${NUM_TOKEN_PATTERN})\\s+(?:of\\s+)?${mcqNoun}\\b`, "i")
      ) ||
      text.match(new RegExp(`\\b${mcqNoun}\\s*[:\\-=]\\s*(${NUM_TOKEN_PATTERN})\\b`, "i"));
    const parsed = parseNumberToken(m?.[1]);
    if (parsed !== null) mcqCount = clampCount(parsed, MAX_EXAM_MCQ);
  }

  if (theoryCount === null) {
    const m =
      text.match(
        new RegExp(`\\b(${NUM_TOKEN_PATTERN})\\s+(?:of\\s+)?${theoryNoun}\\b`, "i")
      ) ||
      text.match(new RegExp(`\\b${theoryNoun}\\s*[:\\-=]\\s*(${NUM_TOKEN_PATTERN})\\b`, "i"));
    const parsed = parseNumberToken(m?.[1]);
    if (parsed !== null) theoryCount = clampCount(parsed, MAX_EXAM_THEORY);
  }

  // Only one section explicitly asked ("only theory", "only mcq")
  if (
    mcqCount === null &&
    theoryCount !== null &&
    /\b(?:only|just)\b/i.test(text) &&
    !new RegExp(mcqNoun, "i").test(text)
  ) {
    mcqCount = 0;
  }
  if (
    theoryCount === null &&
    mcqCount !== null &&
    /\b(?:only|just)\b/i.test(text) &&
    !new RegExp(theoryNoun, "i").test(text)
  ) {
    theoryCount = 0;
  }

  // If manual exam prompt gave ONLY mcq count (and never mentioned theory) -> theoryCount = 0
  if (isExam && mcqCount !== null && theoryCount === null && !new RegExp(theoryNoun, "i").test(text)) {
    theoryCount = 0;
  }
  // If manual exam prompt gave ONLY theory count (and never mentioned mcq/objective) -> mcqCount = 0
  if (isExam && theoryCount !== null && mcqCount === null && !new RegExp(mcqNoun, "i").test(text)) {
    mcqCount = 0;
  }

  if (isFlashcards) {
    const m =
      text.match(
        new RegExp(
          `\\b(${NUM_TOKEN_PATTERN})\\s+(?:study\\s+)?(?:flashcards?|cards?)\\b`,
          "i"
        )
      ) ||
      text.match(
        new RegExp(`\\b(?:flashcards?|cards?)\\s*[:\\-=]\\s*(${NUM_TOKEN_PATTERN})\\b`, "i")
      );
    const parsed = parseNumberToken(m?.[1]);
    if (parsed !== null && parsed > 0) {
      totalCount = clampCount(parsed, MAX_FLASHCARDS);
    }
    return {
      kind: "flashcards",
      mcqCount: null,
      theoryCount: null,
      totalCount,
      hasExplicitCount: totalCount !== null,
    };
  }

  if (isExam) {
    if (mcqCount === null && theoryCount === null) {
      const m =
        text.match(
          new RegExp(
            `\\b(${NUM_TOKEN_PATTERN})(?:[-\\s]+)?(?:standard\\s+|exam(?:ination)?\\s+|practice\\s+|test\\s+)?questions?\\b`,
            "i"
          )
        ) ||
        text.match(
          new RegExp(`\\bquestions?\\s*[:\\-=]\\s*(${NUM_TOKEN_PATTERN})\\b`, "i")
        );
      const parsed = parseNumberToken(m?.[1]);
      if (parsed !== null && parsed > 0) {
        totalCount = clampCount(parsed, MAX_EXAM_TOTAL);
      }
    }
    return {
      kind: "exam",
      mcqCount,
      theoryCount,
      totalCount,
      hasExplicitCount:
        mcqCount !== null || theoryCount !== null || totalCount !== null,
    };
  }

  // Quiz
  const qMatch =
    text.match(
      new RegExp(
        `\\b(${NUM_TOKEN_PATTERN})(?:[-\\s]+)?(?:quiz|practice|multiple[- ]choice|mcqs?|test)?\\s*questions?\\b`,
        "i"
      )
    ) ||
    text.match(
      new RegExp(`\\b(${NUM_TOKEN_PATTERN})\\s+${mcqNoun}\\b`, "i")
    ) ||
    text.match(
      new RegExp(`\\b(?:quiz|questions?)\\s*[:\\-=]\\s*(${NUM_TOKEN_PATTERN})\\b`, "i")
    );
  const qParsed = parseNumberToken(qMatch?.[1]);
  if (qParsed !== null && qParsed > 0) {
    totalCount = clampCount(qParsed, MAX_QUIZ_QUESTIONS);
  } else if (mcqCount !== null && mcqCount > 0) {
    totalCount = clampCount(mcqCount, MAX_QUIZ_QUESTIONS);
  }

  return {
    kind: "quiz",
    mcqCount: null,
    theoryCount: null,
    totalCount,
    hasExplicitCount: totalCount !== null,
  };
}

function normStem(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function mergeAndFitExamCounts(
  base: ExamPaperData,
  extra: ExamPaperData | null,
  targetMcq: number | null,
  targetTheory: number | null,
  targetTotal: number | null
): ExamPaperData {
  const seenMcq = new Set<string>();
  const combinedMcq: ExamMcqQuestion[] = [];
  for (const q of [...base.mcqQuestions, ...(extra?.mcqQuestions || [])]) {
    const key = normStem(q.question);
    if (!key || seenMcq.has(key)) continue;
    seenMcq.add(key);
    combinedMcq.push(q);
  }

  const seenTheory = new Set<string>();
  const combinedTheory: ExamTheoryQuestion[] = [];
  for (const q of [...base.theoryQuestions, ...(extra?.theoryQuestions || [])]) {
    const key = normStem(q.question);
    if (!key || seenTheory.has(key)) continue;
    seenTheory.add(key);
    combinedTheory.push(q);
  }

  let finalMcq =
    targetMcq !== null ? combinedMcq.slice(0, targetMcq) : combinedMcq;
  let finalTheory =
    targetTheory !== null ? combinedTheory.slice(0, targetTheory) : combinedTheory;

  if (targetMcq === null && targetTheory === null && targetTotal !== null) {
    const totalNow = finalMcq.length + finalTheory.length;
    if (totalNow > targetTotal) {
      const keepMcq = Math.min(finalMcq.length, targetTotal);
      finalMcq = finalMcq.slice(0, keepMcq);
      finalTheory = finalTheory.slice(0, Math.max(0, targetTotal - keepMcq));
    }
  }

  return {
    ...base,
    mcqQuestions: finalMcq.map((q, idx) => ({ ...q, id: idx + 1 })),
    theoryQuestions: finalTheory.map((q, idx) => ({ ...q, id: idx + 1 })),
  };
}

export function mergeAndFitQuizCounts(
  base: QuizData,
  extra: QuizData | null,
  targetCount: number | null
): QuizData {
  const seen = new Set<string>();
  const merged: QuizQuestion[] = [];
  for (const q of [...base.questions, ...(extra?.questions || [])]) {
    const key = normStem(q.question);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(q);
  }
  const trimmed =
    targetCount !== null ? merged.slice(0, targetCount) : merged;
  return {
    ...base,
    questions: trimmed.map((q, idx) => ({ ...q, id: idx + 1 })),
  };
}

export function mergeAndFitFlashcardCounts(
  base: FlashcardsData,
  extra: FlashcardsData | null,
  targetCount: number | null
): FlashcardsData {
  const seen = new Set<string>();
  const merged: FlashcardItem[] = [];
  for (const c of [...base.cards, ...(extra?.cards || [])]) {
    const key = normStem(c.front);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(c);
  }
  const trimmed =
    targetCount !== null ? merged.slice(0, targetCount) : merged;
  return {
    ...base,
    cards: trimmed.map((c, idx) => ({ ...c, id: idx + 1 })),
  };
}

export function computeExamMissingCounts(
  exam: ExamPaperData,
  counts: RequestedQuestionCounts
): { missingMcq: number; missingTheory: number } {
  if (counts.mcqCount !== null || counts.theoryCount !== null) {
    return {
      missingMcq:
        counts.mcqCount !== null
          ? Math.max(0, counts.mcqCount - exam.mcqQuestions.length)
          : 0,
      missingTheory:
        counts.theoryCount !== null
          ? Math.max(0, counts.theoryCount - exam.theoryQuestions.length)
          : 0,
    };
  }
  if (counts.totalCount !== null) {
    const totalHave = exam.mcqQuestions.length + exam.theoryQuestions.length;
    return {
      missingMcq: Math.max(0, counts.totalCount - totalHave),
      missingTheory: 0,
    };
  }
  return { missingMcq: 0, missingTheory: 0 };
}

