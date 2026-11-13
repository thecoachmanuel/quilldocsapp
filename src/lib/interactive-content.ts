export interface QuizQuestion {
  id: number | string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export interface QuizData {
  title: string;
  questions: QuizQuestion[];
  hasAnswerKey?: boolean;
}

export interface FlashcardItem {
  id: number | string;
  front: string;
  back: string;
  hint?: string;
}

export interface FlashcardsData {
  title: string;
  cards: FlashcardItem[];
}

export interface ExamMcqQuestion {
  id: number | string;
  question: string;
  options: string[];
  correctIndex: number;
  marks: number;
  explanation: string;
}

export interface ExamTheoryQuestion {
  id: number | string;
  question: string;
  subQuestions?: string[];
  marks: number;
  solution: string;
}

export interface ExamPaperData {
  title: string;
  courseCode?: string;
  duration?: string;
  instructions: string[];
  includeSolutions: boolean;
  requestedFormats?: Array<"docx" | "pdf">;
  mcqQuestions: ExamMcqQuestion[];
  theoryQuestions: ExamTheoryQuestion[];
}

export interface FlashcardEvaluation {
  status: "correct" | "partial" | "incorrect";
  score: number; // 1 for correct, 0.5 for partial, 0 for incorrect
  reason: string;
}

function cleanOptionPrefix(opt: string): string {
  return opt.replace(/^[A-Fa-f][\.\)]\s*/, "").trim();
}

function parseLetterToIndex(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Match formats like "B", "B)", "(B)", "Option B", "Answer: C", "2"
  const numOnly = trimmed.match(/^([1-6])$/);
  if (numOnly) {
    return parseInt(numOnly[1], 10) - 1;
  }

  const letterMatch = trimmed.match(
    /^(?:(?:correct\s*)?(?:answer|option|choice)\s*[:\-]?\s*)?\(?([A-Fa-f])\)?(?:[\.\)\:\s\-]|$)/i
  );
  if (letterMatch) {
    return letterMatch[1].toUpperCase().charCodeAt(0) - 65;
  }

  return null;
}

function resolveCorrectOptionIndex(q: any, rawOptions: string[]): number {
  const candidates = [
    q.correctIndex,
    q.correct_index,
    q.correctOptionIndex,
    q.answerIndex,
    q.correctAnswer,
    q.correct_answer,
    q.answer,
  ];

  for (const val of candidates) {
    if (typeof val === "number" && !isNaN(val)) {
      if (val >= 0 && val < rawOptions.length) return val;
    }
    if (typeof val === "string") {
      const s = val.trim();
      if (!s) continue;

      // Exact or normalized text match against one of the options
      const normalizedS = cleanOptionPrefix(s).toLowerCase();
      const textMatchIdx = rawOptions.findIndex(
        (opt) => opt.trim().toLowerCase() === normalizedS
      );
      if (textMatchIdx !== -1) return textMatchIdx;

      // Numeric index inside string ("0", "1", etc.)
      if (/^\d+$/.test(s)) {
        const n = parseInt(s, 10);
        // Only treat 0..options.length-1 directly if explicit *Index field, otherwise letter parser
        if (
          (val === q.correctIndex ||
            val === q.correct_index ||
            val === q.correctOptionIndex ||
            val === q.answerIndex) &&
          n >= 0 &&
          n < rawOptions.length
        ) {
          return n;
        }
      }

      const letterIdx = parseLetterToIndex(s);
      if (letterIdx !== null && letterIdx >= 0 && letterIdx < rawOptions.length) {
        return letterIdx;
      }
    }
  }

  return 0;
}

/**
 * Safely parses JSON strings produced by LLMs that may contain LaTeX backslashes
 * (e.g. `\alpha`, `\sigma`, `\frac`), trailing commas, or minor truncation.
 */
function safeJsonParse(rawJson: string): any {
  const cleaned = rawJson
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/,\s*([}\]])/g, "$1")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const escaped = cleaned.replace(
      /(\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))|\\/g,
      (_match, validEscape) => validEscape || "\\\\"
    );
    try {
      return JSON.parse(escaped);
    } catch {
      return recoverTruncatedPayload(escaped);
    }
  }
}

function collectCompleteArrayObjects(jsonStr: string, arrayKey: string): any[] {
  const arrStart = jsonStr.search(new RegExp(`"${arrayKey}"\\s*:\\s*\\[`, "i"));
  if (arrStart === -1) return [];

  const bracketIdx = jsonStr.indexOf("[", arrStart);
  if (bracketIdx === -1) return [];

  const items: any[] = [];
  let depth = 0;
  let inString = false;
  let escapeNext = false;
  let objStart = -1;

  for (let i = bracketIdx + 1; i < jsonStr.length; i++) {
    const ch = jsonStr[i];
    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    if (ch === "\\" && inString) {
      escapeNext = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (ch === "{") {
      if (depth === 0) objStart = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && objStart !== -1) {
        const chunk = jsonStr.slice(objStart, i + 1);
        try {
          items.push(JSON.parse(chunk));
        } catch {
          // Skip malformed partial object
        }
        objStart = -1;
      }
    } else if (ch === "]" && depth === 0) {
      break;
    }
  }

  return items;
}

/**
 * Recovers complete question/card/exam objects if an LLM hit max_tokens right before closing the JSON array.
 */
function recoverTruncatedPayload(jsonStr: string): any {
  const titleMatch = jsonStr.match(/"title"\s*:\s*"([^"]*)"/i);
  const title = titleMatch ? titleMatch[1] : undefined;

  const isExam =
    /"mcqQuestions"\s*:\s*\[/i.test(jsonStr) ||
    /"theoryQuestions"\s*:\s*\[/i.test(jsonStr) ||
    /"multipleChoice"\s*:\s*\[/i.test(jsonStr) ||
    /"essayQuestions"\s*:\s*\[/i.test(jsonStr) ||
    /"objectiveQuestions"\s*:\s*\[/i.test(jsonStr) ||
    /"section[AB]"\s*:\s*\[/i.test(jsonStr);

  if (isExam) {
    const mcqQuestions = [
      ...collectCompleteArrayObjects(jsonStr, "mcqQuestions"),
      ...collectCompleteArrayObjects(jsonStr, "multipleChoice"),
      ...collectCompleteArrayObjects(jsonStr, "mcqs"),
      ...collectCompleteArrayObjects(jsonStr, "objectiveQuestions"),
      ...collectCompleteArrayObjects(jsonStr, "objectives"),
      ...collectCompleteArrayObjects(jsonStr, "sectionA"),
    ];
    const theoryQuestions = [
      ...collectCompleteArrayObjects(jsonStr, "theoryQuestions"),
      ...collectCompleteArrayObjects(jsonStr, "essayQuestions"),
      ...collectCompleteArrayObjects(jsonStr, "theory"),
      ...collectCompleteArrayObjects(jsonStr, "sectionB"),
    ];
    if (mcqQuestions.length === 0 && theoryQuestions.length === 0) return null;

    const courseMatch = jsonStr.match(/"courseCode"\s*:\s*"([^"]*)"/i);
    const durationMatch = jsonStr.match(/"duration"\s*:\s*"([^"]*)"/i);
    const includeSolMatch = jsonStr.match(
      /"includeSolutions"\s*:\s*(true|false)/i
    );
    return {
      title,
      courseCode: courseMatch ? courseMatch[1] : undefined,
      duration: durationMatch ? durationMatch[1] : undefined,
      includeSolutions: includeSolMatch
        ? includeSolMatch[1].toLowerCase() === "true"
        : true,
      mcqQuestions,
      theoryQuestions,
    };
  }

  const isQuiz = /"questions"\s*:\s*\[/i.test(jsonStr);
  const isFlash = /"cards"\s*:\s*\[/i.test(jsonStr);
  if (!isQuiz && !isFlash) return null;

  const arrayKey = isQuiz ? "questions" : "cards";
  const items = collectCompleteArrayObjects(jsonStr, arrayKey);
  if (items.length === 0) return null;
  return { title, [arrayKey]: items };
}

/**
 * Detects an unclosed ```quiz, ```flashcards, or ```exam fenced block during streaming
 * so the UI can show a clean loading skeleton instead of flickering partial JSON.
 */
export function detectStreamingInteractiveFence(rawText: string): {
  type: "quiz" | "flashcards" | "exam" | null;
  prefixText: string;
} {
  const openRe =
    /```(quiz|json:quiz|quiz-json|flashcards|flashcard|json:flashcards|cards|exam|json:exam|exam-json)\b/gi;
  let lastMatch: RegExpExecArray | null = null;
  let m: RegExpExecArray | null;
  while ((m = openRe.exec(rawText)) !== null) {
    lastMatch = m;
  }
  if (!lastMatch) return { type: null, prefixText: rawText };

  const afterOpen = rawText.slice(lastMatch.index + lastMatch[0].length);
  const hasClose = /\n\s*```/.test(afterOpen) || afterOpen.trimEnd().endsWith("```");
  if (hasClose) {
    return { type: null, prefixText: rawText };
  }

  const lang = lastMatch[1].toLowerCase();
  const type = lang.includes("exam")
    ? "exam"
    : lang.includes("flash") || lang === "cards"
      ? "flashcards"
      : "quiz";
  return {
    type,
    prefixText: rawText.slice(0, lastMatch.index).trimEnd(),
  };
}

function extractOptionsList(rawOptions: any): string[] {
  if (Array.isArray(rawOptions)) {
    return rawOptions
      .map((o: any) => {
        if (typeof o === "string" || typeof o === "number") {
          return cleanOptionPrefix(String(o).trim());
        }
        if (o && typeof o === "object") {
          const text = o.text ?? o.label ?? o.value ?? o.option ?? o.content ?? "";
          return cleanOptionPrefix(String(text).trim());
        }
        return "";
      })
      .filter(Boolean);
  }

  if (rawOptions && typeof rawOptions === "object") {
    return Object.entries(rawOptions)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, val]) => cleanOptionPrefix(String(val ?? "").trim()))
      .filter(Boolean);
  }

  return [];
}

function makeUniqueId(
  rawId: any,
  idx: number,
  seen: Set<string>
): string | number {
  const base =
    rawId !== undefined && rawId !== null && String(rawId).trim() !== ""
      ? rawId
      : idx + 1;
  const key = String(base);
  if (!seen.has(key)) {
    seen.add(key);
    return base;
  }
  const unique = `${key}-${idx + 1}`;
  seen.add(unique);
  return unique;
}

/**
 * Parses structured JSON quiz or falls back to parsing Markdown questions.
 */
export function parseQuizData(raw: string): QuizData | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const fenceMatch =
    trimmed.match(/```(?:quiz|json:quiz|quiz-json|json)?\s*([\s\S]*?)```/i) ||
    trimmed.match(/<quiz>([\s\S]*?)<\/quiz>/i);

  const candidateJsonStr = fenceMatch
    ? fenceMatch[1].trim()
    : trimmed.replace(/^```[\w:-]*\s*\n?/, "").trim();

  const parsedRaw = safeJsonParse(candidateJsonStr);
  const parsed = Array.isArray(parsedRaw)
    ? { questions: parsedRaw }
    : parsedRaw?.quiz && Array.isArray(parsedRaw.quiz.questions)
      ? parsedRaw.quiz
      : parsedRaw?.data && Array.isArray(parsedRaw.data.questions)
        ? parsedRaw.data
        : parsedRaw;

  if (parsed && Array.isArray(parsed.questions) && parsed.questions.length > 0) {
    const seenIds = new Set<string>();
    const questions: QuizQuestion[] = parsed.questions
      .map((q: any, idx: number) => {
        if (!q || typeof q !== "object") return null;
        const questionText = String(q.question || q.prompt || "").trim();
        const rawOptions = extractOptionsList(
          q.options ?? q.choices ?? q.answers
        );
        if (!questionText || rawOptions.length < 2) return null;

        const correctIdx = resolveCorrectOptionIndex(q, rawOptions);

        return {
          id: makeUniqueId(q.id, idx, seenIds),
          question: questionText,
          options: rawOptions,
          correctIndex: correctIdx,
          explanation: String(
            q.explanation || q.solution || q.rationale || ""
          ).trim(),
        };
      })
      .filter((q: QuizQuestion | null): q is QuizQuestion => q !== null);

    if (questions.length > 0) {
      return {
        title: String(parsed.title || "Interactive Practice Quiz").trim(),
        questions,
        hasAnswerKey: true,
      };
    }
  }

  return parseMarkdownQuiz(trimmed);
}

function parseMarkdownQuiz(text: string): QuizData | null {
  // Check if there is a trailing Answer Key section so we can attach answers cleanly
  const keySectionMatch = text.match(
    /(?:^|\n)(?:#{1,4}\s*|\*{0,2})(?:Answer\s*Key|Answers|Solutions)\s*:?\*{0,2}\s*\n([\s\S]+)$/i
  );
  const quizBody = keySectionMatch
    ? text.slice(0, keySectionMatch.index).trim()
    : text;

  const keyMap = new Map<number, { index: number; explanation?: string }>();
  if (keySectionMatch) {
    const keyLines = keySectionMatch[1].split("\n");
    for (const rawLine of keyLines) {
      const m = rawLine
        .trim()
        .match(
          /^(?:Q(?:uestion)?\s*)?(\d+)\s*[\.\):\-]\s*\(?([A-Fa-f]|[1-6])\)?(?:[\.\)\s:\-–—]+(.*))?$/i
        );
      if (m) {
        const qNum = parseInt(m[1], 10);
        const ansIdx = parseLetterToIndex(m[2]);
        if (ansIdx !== null) {
          keyMap.set(qNum, {
            index: ansIdx,
            explanation: m[3]?.trim() || undefined,
          });
        }
      }
    }
  }

  const questionBlocks = quizBody.split(
    /(?=(?:^|\n)(?:###?\s*)?(?:\*{0,2}(?:Question|Q)\s*\d+[:.\)\s*]|\*{0,2}\d+[\.\)]\s+))/i
  );
  const questions: QuizQuestion[] = [];
  let sawExplicitAnswer = keyMap.size > 0;

  for (const block of questionBlocks) {
    const lines = block
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length < 3) continue;

    const firstLine = lines[0]
      .replace(/^#{1,4}\s*/, "")
      .replace(/^\*{0,2}(?:Question|Q)\s*\d+[:.]?\*{0,2}\s*/i, "")
      .replace(/^\*{0,2}\d+[\.\)]\*{0,2}\s*/, "")
      .trim();

    // Support wrapped multi-line question text before the first A) / B) option
    const promptParts: string[] = [firstLine];
    const options: string[] = [];
    let correctIdx = -1;
    let explanation = "";

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      const optMatch = line.match(
        /^[-\*•]?\s*\*{0,2}\(?([A-Fa-f])\)?[\.\)]\*{0,2}\s*(.*)$/
      );
      if (optMatch) {
        options.push(optMatch[2].trim());
        continue;
      }

      const ansMatch = line.match(
        /^(?:[-*•]\s*)?(?:\*{0,2}Correct(?:\s+Answer|\s+Option)?|\*{0,2}Answer)\*{0,2}\s*[:\-]\s*\*{0,2}\(?([A-Fa-f]|[1-6])\)?/i
      );
      if (ansMatch) {
        sawExplicitAnswer = true;
        const idx = parseLetterToIndex(ansMatch[1]);
        if (idx !== null) correctIdx = idx;
        continue;
      }

      const expMatch = line.match(
        /^(?:[-*•]\s*)?(?:\*{0,2}Explanation|\*{0,2}Solution|\*{0,2}Rationale)\*{0,2}\s*[:\-]\s*(.*)$/i
      );
      if (expMatch) {
        explanation = expMatch[1].trim();
        continue;
      }

      if (explanation) {
        explanation += ` ${line}`;
      } else if (options.length === 0) {
        promptParts.push(line);
      }
    }

    const qNum = questions.length + 1;
    const fromKey = keyMap.get(qNum);
    if (correctIdx === -1 && fromKey && fromKey.index < options.length) {
      correctIdx = fromKey.index;
      if (!explanation && fromKey.explanation) {
        explanation = fromKey.explanation;
      }
    }

    const fullQuestion = promptParts.join(" ").trim();
    if (fullQuestion && options.length >= 2) {
      questions.push({
        id: qNum,
        question: fullQuestion,
        options,
        correctIndex:
          correctIdx >= 0 && correctIdx < options.length
            ? correctIdx
            : sawExplicitAnswer
              ? 0
              : -1,
        explanation:
          explanation ||
          (sawExplicitAnswer
            ? "Review the referenced document section for the complete explanation."
            : ""),
      });
    }
  }

  if (questions.length >= 2) {
    return {
      title: "Document Practice Quiz",
      questions,
      hasAnswerKey: sawExplicitAnswer,
    };
  }

  return null;
}

/**
 * Parses structured JSON flashcards or falls back to parsing Markdown flashcards.
 */
export function parseFlashcardsData(raw: string): FlashcardsData | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const fenceMatch =
    trimmed.match(
      /```(?:flashcards|flashcard|json:flashcards|flashcards-json|cards|json)?\s*([\s\S]*?)```/i
    ) || trimmed.match(/<flashcards>([\s\S]*?)<\/flashcards>/i);

  const candidateJsonStr = fenceMatch
    ? fenceMatch[1].trim()
    : trimmed.replace(/^```[\w:-]*\s*\n?/, "").trim();

  const parsedRaw = safeJsonParse(candidateJsonStr);
  const parsed = Array.isArray(parsedRaw)
    ? { cards: parsedRaw }
    : parsedRaw?.flashcards && Array.isArray(parsedRaw.flashcards.cards)
      ? parsedRaw.flashcards
      : parsedRaw?.data && Array.isArray(parsedRaw.data.cards)
        ? parsedRaw.data
        : parsedRaw;

  if (parsed && Array.isArray(parsed.cards) && parsed.cards.length > 0) {
    const seenIds = new Set<string>();
    const cards: FlashcardItem[] = parsed.cards
      .map((c: any, idx: number) => {
        if (!c || typeof c !== "object") return null;
        const front = String(
          c.front || c.question || c.term || c.prompt || ""
        ).trim();
        const back = String(
          c.back || c.answer || c.solution || c.definition || ""
        ).trim();
        const hint = c.hint ? String(c.hint).trim() : undefined;
        if (!front || !back) return null;
        return {
          id: makeUniqueId(c.id, idx, seenIds),
          front,
          back,
          hint,
        };
      })
      .filter((c: FlashcardItem | null): c is FlashcardItem => c !== null);

    if (cards.length > 0) {
      return {
        title: String(parsed.title || "Study Flashcards").trim(),
        cards,
      };
    }
  }

  return parseMarkdownFlashcards(trimmed);
}

function parseMarkdownFlashcards(text: string): FlashcardsData | null {
  const cardBlocks = text.split(
    /(?=(?:^|\n)(?:###?\s*)?(?:[-*•]\s*)?(?:\*{0,2}(?:Card|Flashcard)\s*\d+|\d+[\.\)]\s*\*{0,2}(?:Card|Flashcard|Front|Term|Question)|\*{0,2}(?:Front|Term)\*{0,2}\s*:))/i
  );
  const cards: FlashcardItem[] = [];

  for (const block of cardBlocks) {
    const frontMatch = block.match(
      /(?:Front|Question|Term|Prompt)\s*[:*]+\s*([^\n]+(?:\n(?!(?:Back|Answer|Solution|Definition|Hint)).+)*)/i
    );
    const backMatch = block.match(
      /(?:Back|Answer|Solution|Definition|Explanation)\s*[:*]+\s*([^\n]+(?:\n(?!(?:Front|Card|Flashcard|Hint)).+)*)/i
    );
    const hintMatch = block.match(/Hint\s*[:*]+\s*([^\n]+)/i);

    if (frontMatch && backMatch) {
      const front = frontMatch[1].replace(/^\*\*|\*\*$/g, "").trim();
      const back = backMatch[1].replace(/^\*\*|\*\*$/g, "").trim();
      if (front && back) {
        cards.push({
          id: cards.length + 1,
          front,
          back,
          hint: hintMatch ? hintMatch[1].replace(/^\*\*|\*\*$/g, "").trim() : undefined,
        });
      }
    }
  }

  if (cards.length > 0) {
    return {
      title: "Document Study Flashcards",
      cards,
    };
  }

  return null;
}

function normalizeMathAndText(input: string): string {
  return input
    .toLowerCase()
    .replace(/\$\$/g, "")
    .replace(/\$/g, "")
    .replace(/\\(?:text|mathrm|mathbf)\{([^}]*)\}/g, "$1")
    .replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, "$1/$2")
    .replace(/\\sqrt\{([^}]*)\}/g, "sqrt($1)")
    .replace(/[\\{}]/g, "")
    .replace(/,/g, "")
    .replace(/[^\w./+\-=<>%\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "to",
  "of",
  "in",
  "for",
  "on",
  "with",
  "at",
  "by",
  "from",
  "as",
  "into",
  "that",
  "this",
  "it",
  "its",
  "and",
  "or",
  "but",
  "if",
  "then",
  "than",
  "so",
  "because",
  "which",
  "what",
  "when",
  "where",
  "who",
  "how",
]);

/**
 * Evaluates a learner's typed flashcard response against the official solution
 * using numeric comparison, normalized formula matching, and key-concept overlap.
 */
export function evaluateFlashcardAnswer(
  userAnswer: string,
  officialAnswer: string
): FlashcardEvaluation {
  const normUser = normalizeMathAndText(userAnswer);
  const normExpected = normalizeMathAndText(officialAnswer);

  if (!normUser) {
    return {
      status: "incorrect",
      score: 0,
      reason: "No answer submitted.",
    };
  }

  if (normUser === normExpected) {
    return {
      status: "correct",
      score: 1,
      reason: "Exact match with the solution.",
    };
  }

  // Direct numeric / percentage match (e.g. "0.05", "68%", "24")
  const userNumMatch = normUser.match(/^-?\d+(?:\.\d+)?%?$/);
  if (userNumMatch) {
    const userVal = parseFloat(userNumMatch[0].replace("%", ""));
    const expectedNums = (normExpected.match(/-?\d+(?:\.\d+)?/g) || []).map(
      parseFloat
    );
    if (
      expectedNums.some(
        (ev) => !isNaN(ev) && Math.abs(ev - userVal) <= Math.max(0.01, Math.abs(ev) * 0.02)
      )
    ) {
      return {
        status: "correct",
        score: 1,
        reason: "Numeric answer matches the solution.",
      };
    }
  }

  // Containment check when user's concise answer captures the core value/phrase
  if (normUser.length >= 4 && normExpected.includes(normUser)) {
    const ratio = normUser.length / Math.max(1, normExpected.length);
    if (ratio >= 0.45) {
      return {
        status: "correct",
        score: 1,
        reason: "Matches the core answer.",
      };
    }
    return {
      status: "partial",
      score: 0.5,
      reason: "Partially captures the solution — review the full explanation.",
    };
  }

  // Key-concept token overlap
  const tokenize = (s: string) =>
    s
      .split(/\s+/)
      .map((w) => w.replace(/^\.+|\.+$/g, ""))
      .filter((w) => w.length > 1 && !STOP_WORDS.has(w));

  const expectedTokens = Array.from(new Set(tokenize(normExpected)));
  const userTokens = new Set(tokenize(normUser));

  if (expectedTokens.length === 0) {
    return {
      status: "partial",
      score: 0.5,
      reason: "Compare your answer with the official solution below.",
    };
  }

  let matched = 0;
  for (const tok of expectedTokens) {
    if (userTokens.has(tok)) matched++;
  }
  const recall = matched / expectedTokens.length;

  if (recall >= 0.65) {
    return {
      status: "correct",
      score: 1,
      reason: "Covers the key concepts in the solution.",
    };
  }
  if (recall >= 0.3 || matched >= 2) {
    return {
      status: "partial",
      score: 0.5,
      reason: "Covers some key points — check the full solution or ask AI to grade.",
    };
  }

  return {
    status: "incorrect",
    score: 0,
    reason: "Does not match the official solution — review below or ask AI.",
  };
}

/**
 * Parses structured JSON exam paper containing Multiple-Choice and/or Theory questions
 * plus optional separate marking-scheme solutions.
 */
export function parseExamData(raw: string): ExamPaperData | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const fenceMatch =
    trimmed.match(
      /```(?:exam|json:exam|exam-json|json)?\s*([\s\S]*?)```/i
    ) || trimmed.match(/<exam>([\s\S]*?)<\/exam>/i);

  const candidateJsonStr = fenceMatch
    ? fenceMatch[1].trim()
    : trimmed.replace(/^```[\w:-]*\s*\n?/, "").trim();

  const parsedRaw = safeJsonParse(candidateJsonStr);
  const parsed =
    parsedRaw?.exam && typeof parsedRaw.exam === "object"
      ? parsedRaw.exam
      : parsedRaw?.data &&
          typeof parsedRaw.data === "object" &&
          (parsedRaw.data.mcqQuestions ||
            parsedRaw.data.theoryQuestions ||
            parsedRaw.data.sectionA ||
            parsedRaw.data.sectionB)
        ? parsedRaw.data
        : parsedRaw;

  if (!parsed || typeof parsed !== "object") {
    return parseMarkdownExam(trimmed);
  }

  const rawMcqs =
    parsed.mcqQuestions ??
    parsed.multipleChoice ??
    parsed.mcqs ??
    parsed.objectiveQuestions ??
    parsed.objectives ??
    parsed.sectionA ??
    [];

  const rawTheory =
    parsed.theoryQuestions ??
    parsed.essayQuestions ??
    parsed.theory ??
    parsed.structuredQuestions ??
    parsed.sectionB ??
    [];

  if (
    (!Array.isArray(rawMcqs) || rawMcqs.length === 0) &&
    (!Array.isArray(rawTheory) || rawTheory.length === 0)
  ) {
    return parseMarkdownExam(trimmed);
  }

  const seenMcqIds = new Set<string>();
  const mcqQuestions: ExamMcqQuestion[] = rawMcqs
    .map((q: any, idx: number) => {
      if (!q || typeof q !== "object") return null;
      const questionText = String(q.question || q.prompt || "").trim();
      const options = extractOptionsList(q.options ?? q.choices ?? q.answers);
      if (!questionText || options.length < 2) return null;

      const marksNum = Number(q.marks);
      return {
        id: makeUniqueId(q.id, idx, seenMcqIds),
        question: questionText,
        options,
        correctIndex: resolveCorrectOptionIndex(q, options),
        marks: !isNaN(marksNum) && marksNum > 0 ? marksNum : 1,
        explanation: String(
          q.explanation || q.solution || q.rationale || ""
        ).trim(),
      };
    })
    .filter((q: ExamMcqQuestion | null): q is ExamMcqQuestion => q !== null);

  const seenTheoryIds = new Set<string>();
  const theoryQuestions: ExamTheoryQuestion[] = rawTheory
    .map((q: any, idx: number) => {
      if (!q || typeof q !== "object") return null;
      const questionText = String(q.question || q.prompt || "").trim();
      if (!questionText) return null;

      const subQuestions = Array.isArray(q.subQuestions ?? q.parts)
        ? (q.subQuestions ?? q.parts)
            .map((p: any) => String(p ?? "").trim())
            .filter(Boolean)
        : undefined;

      const marksNum = Number(q.marks);
      return {
        id: makeUniqueId(q.id, idx, seenTheoryIds),
        question: questionText,
        subQuestions:
          subQuestions && subQuestions.length > 0 ? subQuestions : undefined,
        marks: !isNaN(marksNum) && marksNum > 0 ? marksNum : 10,
        solution: String(
          q.solution || q.answer || q.markingScheme || q.explanation || ""
        ).trim(),
      };
    })
    .filter(
      (q: ExamTheoryQuestion | null): q is ExamTheoryQuestion => q !== null
    );

  if (mcqQuestions.length === 0 && theoryQuestions.length === 0) {
    return parseMarkdownExam(trimmed);
  }

  const instructions = Array.isArray(parsed.instructions)
    ? parsed.instructions.map((s: any) => String(s ?? "").trim()).filter(Boolean)
    : [];

  const hasAnySolutions =
    mcqQuestions.some((q) => Boolean(q.explanation)) ||
    theoryQuestions.some((q) => Boolean(q.solution));

  const includeSolutions =
    typeof parsed.includeSolutions === "boolean"
      ? parsed.includeSolutions && (hasAnySolutions || mcqQuestions.length > 0)
      : hasAnySolutions;

  const rawFormats = Array.isArray(parsed.requestedFormats)
    ? parsed.requestedFormats
        .map((f: any) => String(f ?? "").toLowerCase().trim())
        .filter((f: string): f is "docx" | "pdf" => f === "docx" || f === "pdf")
    : undefined;

  return {
    title: String(parsed.title || "Standard Examination Paper").trim(),
    courseCode: parsed.courseCode ? String(parsed.courseCode).trim() : undefined,
    duration: parsed.duration ? String(parsed.duration).trim() : undefined,
    instructions:
      instructions.length > 0
        ? instructions
        : [
            mcqQuestions.length > 0 && theoryQuestions.length > 0
              ? "Attempt ALL questions in Section A and follow instructions in Section B."
              : "Attempt ALL questions clearly and concisely.",
            "Show all relevant workings, formulas, and units where applicable.",
          ],
    includeSolutions,
    requestedFormats:
      rawFormats && rawFormats.length > 0 ? rawFormats : ["docx", "pdf"],
    mcqQuestions,
    theoryQuestions,
  };
}

/**
 * Fallback parser when an LLM formats a standard exam in Markdown sections
 * (Section A MCQs + Section B Theory + optional Solutions) without ```exam JSON.
 */
function parseMarkdownExam(text: string): ExamPaperData | null {
  const hasExamMarker =
    /(?:SECTION\s+[AB]|THEORY\s*(?:\/|\s*AND\s*|\s*&\s*)?\s*(?:ESSAY\s*)?QUESTIONS?|ESSAY\s+QUESTIONS?|MARKING\s+(?:SCHEME|GUIDE))/i.test(
      text
    );
  if (!hasExamMarker) return null;

  const solSplit = text.match(
    /(?:^|\n)(?:#{1,4}\s*|\*{0,2})(?:SEPARATE\s+SOLUTIONS?|SOLUTIONS?|MARKING\s+(?:SCHEME|GUIDE)|ANSWER\s+KEY)\s*:?\*{0,2}\s*\n([\s\S]+)$/i
  );
  const questionsArea = solSplit ? text.slice(0, solSplit.index).trim() : text;
  const solutionsArea = solSplit ? solSplit[1].trim() : "";

  const sectionBMatch = questionsArea.match(
    /(?:^|\n)(?:#{1,4}\s*|\*{0,2})SECTION\s*B\b[^\n]*\n([\s\S]+)$/i
  );

  const mcqSource = sectionBMatch
    ? questionsArea.slice(0, sectionBMatch.index).trim()
    : questionsArea;
  const theorySource = sectionBMatch ? sectionBMatch[1].trim() : "";

  const parsedMcq = parseMarkdownQuiz(mcqSource);
  const mcqQuestions: ExamMcqQuestion[] = parsedMcq
    ? parsedMcq.questions.map((q) => ({
        id: q.id,
        question: q.question,
        options: q.options,
        correctIndex: q.correctIndex >= 0 ? q.correctIndex : 0,
        marks: 1,
        explanation: q.explanation || "",
      }))
    : [];

  const theoryQuestions: ExamTheoryQuestion[] = [];
  if (theorySource) {
    const theoryBlocks = theorySource.split(
      /(?=(?:^|\n)(?:###?\s*)?(?:\*{0,2}(?:Question|Q)\s*\d+[:.\)\s*]|\*{0,2}\d+[\.\)]\s+))/i
    );

    for (const block of theoryBlocks) {
      const lines = block
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      if (lines.length === 0) continue;

      // Skip Section B instruction line
      if (/^instruction\s*:/i.test(lines[0])) continue;

      const headerLine = lines[0]
        .replace(/^#{1,4}\s*/, "")
        .replace(/^\*{0,2}(?:Question|Q)\s*\d+[:.]?\*{0,2}\s*/i, "")
        .replace(/^\*{0,2}\d+[\.\)]\*{0,2}\s*/, "")
        .trim();

      if (!headerLine) continue;

      const marksMatch = block.match(/\[(\d+)\s*marks?\]/i);
      const marks = marksMatch ? parseInt(marksMatch[1], 10) : 10;
      const cleanQuestion = headerLine.replace(/\[\d+\s*marks?\]/gi, "").trim();

      const subQuestions: string[] = [];
      let solution = "";
      for (let i = 1; i < lines.length; i++) {
        const l = lines[i];
        if (/^(?:\([a-z]\)|[a-z]\))/i.test(l)) {
          subQuestions.push(l);
        } else if (/^(?:Solution|Answer|Marking)\s*[:\-]/i.test(l)) {
          solution = l.replace(/^(?:Solution|Answer|Marking(?:\s*Guide)?)\s*[:\-]\s*/i, "").trim();
        } else if (solution) {
          solution += ` ${l}`;
        }
      }

      theoryQuestions.push({
        id: theoryQuestions.length + 1,
        question: cleanQuestion,
        subQuestions: subQuestions.length > 0 ? subQuestions : undefined,
        marks,
        solution,
      });
    }
  }

  // Attach any solutions from trailing Marking Scheme block
  if (solutionsArea && theoryQuestions.length > 0) {
    const theorySolMatch = solutionsArea.match(
      /(?:SECTION\s*B[^\n]*\n)([\s\S]+)$/i
    );
    const theorySolArea = theorySolMatch ? theorySolMatch[1] : solutionsArea;
    theoryQuestions.forEach((tq, idx) => {
      if (tq.solution) return;
      const m = theorySolArea.match(
        new RegExp(
          `(?:Question|Q)?\\s*${idx + 1}[\\.:\\)]\\s*([\\s\\S]*?)(?=(?:\\n(?:Question|Q)?\\s*${idx + 2}[\\.:\\)]|$))`,
          "i"
        )
      );
      if (m && m[1].trim()) {
        tq.solution = m[1].trim();
      }
    });
  }

  if (mcqQuestions.length === 0 && theoryQuestions.length === 0) return null;

  const titleMatch = text.match(/^(?:#{1,3}\s*|\*\*)(.+?)(?:\*\*)?\n/);
  const includeSolutions =
    Boolean(solutionsArea) ||
    theoryQuestions.some((q) => Boolean(q.solution)) ||
    Boolean(parsedMcq?.hasAnswerKey);

  return {
    title: titleMatch
      ? titleMatch[1].replace(/[#*]/g, "").trim()
      : "Standard Examination Paper",
    instructions: [
      mcqQuestions.length > 0 && theoryQuestions.length > 0
        ? "Attempt ALL questions in Section A and answer all questions in Section B."
        : "Attempt ALL questions clearly and concisely.",
      "Show all relevant workings, formulas, and units where applicable.",
    ],
    includeSolutions,
    requestedFormats: ["docx", "pdf"],
    mcqQuestions,
    theoryQuestions,
  };
}
