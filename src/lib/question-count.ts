import {
  ExamMcqQuestion,
  ExamPaperData,
  ExamTheoryQuestion,
  FlashcardItem,
  FlashcardsData,
  QuizData,
  QuizQuestion,
} from "./interactive-content";

export type ChatTurnIntent = "exam" | "quiz" | "flashcards" | "grading" | "chat";

export interface RequestedQuestionCounts {
  kind: "exam" | "quiz" | "flashcards";
  mcqCount: number | null;
  theoryCount: number | null;
  totalCount: number | null;
  hasExplicitCount: boolean;
  wantsMcq?: boolean;
  wantsTheory?: boolean;
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
 * Classifies whether the user message is requesting interactive exam, quiz, or
 * flashcard generation, grading a submission, or normal conversational chat.
 * Prevents conceptual keywords ("theory", "objective", "essay", "question 2")
 * in normal document queries from hijacking normal chat into JSON generation.
 */
export function classifyChatIntent(message: string): ChatTurnIntent {
  const text = (message || "").trim();
  if (!text) return "chat";

  if (/\b(?:QUIZ SUBMISSION|FLASHCARD SUBMISSION FOR AI GRADING)\b/i.test(text)) {
    return "grading";
  }

  const hasGenerationVerb =
    /\b(?:generate|create|make|build|prepare|draft|compile|produce|design|set|give\s+me|give\s+us|provide(?:\s+me|\s+us)?(?:\s+with)?|write(?:\s+me)?|send(?:\s+me)?|ask\s+me|output|export|download|print)\b/i.test(
      text
    );

  // User asking AI to answer/solve/explain existing questions or content in the document
  const asksToAnswerOrExplainExisting =
    /\b(?:answers?|solutions?|explanations?|summary|summaries|meanings?|definitions?)\s+(?:to|for|of)\s+(?:all\s+|the\s+|these\s+|those\s+|my\s+)?(?:\d+\s+)?(?:review\s+|study\s+|practice\s+)?(?:questions?|qs?|exam|quiz|test|flashcards?|essay|theory|objectives?)\b/i.test(
      text
    ) ||
    /\b(?:answer|solve|explain|summarize|summarise|describe|define|clarify|discuss|compare|contrast|analyze|analyse|outline|interpret|translate|continue(?:\s+explaining)?)\s+(?:all\s+|the\s+|these\s+|those\s+|this\s+)?(?:\d+\s+)?(?:past\s+|theory\s+|essay\s+|objective\s+|mcq\s+|review\s+|study\s+|chapter\s+)?(?:questions?\s*(?:\d|#)|questions?\b(?!\s+(?:for\s+me|on\s+this|about\s+this|to\s+test))|theory|theories|essay|essays|objectives?|flashcards?|quiz|exam)\b/i.test(
      text
    );

  const hasFlashcardTerm = /\b(?:flashcards?|study\s+cards?)\b/i.test(text);
  const hasFlashcardCount = new RegExp(
    `\\b(?:${NUM_TOKEN_PATTERN})\\s+(?:study\\s+)?(?:flashcards?|cards?)\\b|\\b(?:flashcards?|cards?)\\s*[:\\-=]\\s*(?:${NUM_TOKEN_PATTERN})\\b`,
    "i"
  ).test(text);

  // Explicit exam formatting/structure signals (e.g. ExamBuilderModal or explicit exam paper requests)
  const hasExplicitExamSpec =
    /\b(?:examination\s+paper|test\s+paper|mock\s+(?:exam|test)|marking\s+(?:scheme|guide)|times\s+new\s+roman|1\.5\s*(?:line)?\s*spacing|font\s*12|12\s*pt|separate\s+(?:solutions|answers)|(?:mcq|mcqs|multiple[- ]choice)\b[\s\S]*\b(?:theory|essay|subjective|written)|(?:theory|essay|subjective|written)\b[\s\S]*\b(?:mcq|mcqs|multiple[- ]choice)|obj\s*(?:and|&|\+)\s*theory|theory\s*(?:and|&|\+)\s*obj)\b/i.test(
      text
    ) ||
    new RegExp(
      `\\b(?:${NUM_TOKEN_PATTERN})\\s+(?:of\\s+)?(?:theory|essay|subjective|objective|obj)(?:\\s+questions?)?\\b|\\b(?:only|just)\\s+(?:theory|essay|objective|obj)\\b`,
      "i"
    ).test(text);

  const hasExplicitExamQuestionNoun =
    /\b(?:past\s+questions?|exam(?:ination)?\s+questions?|written\s+questions?|long[- ]answer\s+questions?|(?:theory|essay|subjective|objective|obj)\s+questions?)\b/i.test(
      text
    );

  const hasExamWord = /\b(?:exam|examination|midterm)\b/i.test(text);
  const hasExportableFormatWithQuestions =
    /\b(?:questions?|quiz|test)\b/i.test(text) &&
    /\b(?:docx|word\s*(?:doc|document|file)|(?:as|to|in|into|export|download)\s+pdf|pdf\s+(?:format|version|file|export|paper))\b/i.test(
      text
    ) &&
    !asksToAnswerOrExplainExisting;

  if (
    hasExplicitExamSpec ||
    hasExportableFormatWithQuestions ||
    (hasExplicitExamQuestionNoun && (hasGenerationVerb || !asksToAnswerOrExplainExisting)) ||
    (hasExamWord &&
      !hasFlashcardTerm &&
      (hasGenerationVerb ||
        /\b(?:exam|examination|midterm)\s+(?:on|for|from|covering)\b/i.test(text) ||
        /^\s*(?:an?\s+)?(?:mock\s+)?(?:exam|examination|midterm)\b/i.test(text)) &&
      !asksToAnswerOrExplainExisting)
  ) {
    return "exam";
  }

  if (
    hasFlashcardTerm &&
    (hasGenerationVerb ||
      hasFlashcardCount ||
      (!asksToAnswerOrExplainExisting &&
        /^\s*(?:please\s+|can\s+you\s+|could\s+you\s+)?(?:create|make|generate|give|build|do)?\s*(?:me\s+|us\s+)?(?:some\s+)?(?:flashcards?|study\s+cards?)\b/i.test(
          text
        )))
  ) {
    return "flashcards";
  }

  const hasDirectQuizPhrase =
    /\b(?:quiz\s+me|test\s+me|practice\s+quiz|practice\s+test|practice\s+questions?)\b/i.test(
      text
    );
  const hasQuizCount = new RegExp(
    `\\b(?:${NUM_TOKEN_PATTERN})(?:[-\\s]+)?(?:quiz|practice|multiple[- ]choice|mcqs?|objectives?|test)?\\s*(?:questions?|mcqs?)\\b|\\b(?:quiz|mcqs?|questions?)\\s*[:\\-=]\\s*(?:${NUM_TOKEN_PATTERN})\\b`,
    "i"
  ).test(text);
  const hasQuestionTarget =
    /\b(?:quiz|mcqs?|multiple[- ]choice|questions?)\b/i.test(text);

  if (
    hasDirectQuizPhrase ||
    ((hasGenerationVerb || hasQuizCount) &&
      hasQuestionTarget &&
      !asksToAnswerOrExplainExisting &&
      !/\b(?:the\s+\d+\s+questions?\s+(?:in|on|from)\s+(?:the|this|my)\s+(?:doc|document|pdf|page|chapter|section))\b/i.test(
        text
      ))
  ) {
    return "quiz";
  }

  return "chat";
}

/**
 * Converts a previous assistant interactive JSON block (```exam / ```quiz / ```flashcards)
 * into a concise plain-text summary for follow-up normal chat turns so the model remembers
 * what was generated without getting locked into outputting JSON fences again.
 */
export function summarizeInteractiveHistoryContent(content: string): string {
  const fenceRegex = /```(exam|quiz|flashcards)\s*([\s\S]*?)```/gi;
  if (!fenceRegex.test(content)) return content;

  return content
    .replace(/```(exam|quiz|flashcards)\s*([\s\S]*?)```/gi, (_m, kindRaw, body) => {
      const kind = String(kindRaw || "interactive").toLowerCase();
      try {
        const parsed = JSON.parse(String(body).trim());
        const title =
          typeof parsed?.title === "string" && parsed.title.trim()
            ? parsed.title.trim()
            : kind;
        const lines: string[] = [];

        if (Array.isArray(parsed?.mcqQuestions)) {
          parsed.mcqQuestions.slice(0, 10).forEach((q: any, i: number) => {
            if (typeof q?.question === "string") {
              lines.push(`MCQ ${i + 1}: ${q.question.trim().slice(0, 140)}`);
            }
          });
        }
        if (Array.isArray(parsed?.theoryQuestions)) {
          parsed.theoryQuestions.slice(0, 6).forEach((q: any, i: number) => {
            if (typeof q?.question === "string") {
              lines.push(`Theory ${i + 1}: ${q.question.trim().slice(0, 140)}`);
            }
          });
        }
        if (Array.isArray(parsed?.questions)) {
          parsed.questions.slice(0, 10).forEach((q: any, i: number) => {
            if (typeof q?.question === "string") {
              lines.push(`Q${i + 1}: ${q.question.trim().slice(0, 140)}`);
            }
          });
        }
        if (Array.isArray(parsed?.cards)) {
          parsed.cards.slice(0, 10).forEach((c: any, i: number) => {
            if (typeof c?.front === "string") {
              lines.push(`Card ${i + 1}: ${c.front.trim().slice(0, 120)}`);
            }
          });
        }

        const detail = lines.length > 0 ? ` — Items: ${lines.join(" | ")}` : "";
        return `[Previously generated ${kind}: "${title}"${detail}]`.slice(0, 1200);
      } catch {
        return `[Previously generated interactive ${kind} omitted]`;
      }
    })
    .trim();
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

  const intent = options?.isExamRequest ? "exam" : classifyChatIntent(text);
  if (intent === "chat" || intent === "grading") {
    return null;
  }

  const isFlashcards = intent === "flashcards";
  const isExam = intent === "exam";
  const isQuiz = intent === "quiz";

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

    const wantsMcq =
      mcqCount !== null
        ? mcqCount > 0
        : theoryCount !== null
          ? new RegExp(mcqNoun, "i").test(text)
          : true;
    const wantsTheory =
      theoryCount !== null
        ? theoryCount > 0
        : mcqCount !== null
          ? new RegExp(theoryNoun, "i").test(text)
          : true;

    return {
      kind: "exam",
      mcqCount,
      theoryCount,
      totalCount,
      hasExplicitCount:
        mcqCount !== null || theoryCount !== null || totalCount !== null,
      wantsMcq,
      wantsTheory,
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
      const keepTheory = Math.min(
        finalTheory.length,
        finalMcq.length > 0 ? Math.max(1, targetTotal - 1) : targetTotal
      );
      const keepMcq = Math.min(
        finalMcq.length,
        Math.max(0, targetTotal - keepTheory)
      );
      finalMcq = finalMcq.slice(0, keepMcq);
      finalTheory = finalTheory.slice(0, keepTheory);
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
    let missingMcq =
      counts.mcqCount !== null
        ? Math.max(0, counts.mcqCount - exam.mcqQuestions.length)
        : 0;
    let missingTheory =
      counts.theoryCount !== null
        ? Math.max(0, counts.theoryCount - exam.theoryQuestions.length)
        : 0;
    // If prompt requested both obj + theory without an explicit number on one side,
    // still ensure that side is non-empty.
    if (counts.wantsMcq && counts.mcqCount === null && exam.mcqQuestions.length === 0) {
      missingMcq = 5;
    }
    if (counts.wantsTheory && counts.theoryCount === null && exam.theoryQuestions.length === 0) {
      missingTheory = 2;
    }
    return { missingMcq, missingTheory };
  }
  if (counts.totalCount !== null) {
    const totalHave = exam.mcqQuestions.length + exam.theoryQuestions.length;
    const missingTheory =
      counts.wantsTheory && exam.theoryQuestions.length === 0
        ? Math.min(2, Math.max(1, Math.round(counts.totalCount * 0.3)))
        : 0;
    const missingMcq = Math.max(
      0,
      counts.totalCount - totalHave - missingTheory
    );
    return {
      missingMcq,
      missingTheory,
    };
  }
  return {
    missingMcq:
      counts.wantsMcq && exam.mcqQuestions.length === 0 ? 8 : 0,
    missingTheory:
      counts.wantsTheory && exam.theoryQuestions.length === 0 ? 2 : 0,
  };
}

