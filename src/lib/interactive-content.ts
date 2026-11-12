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

/**
 * Recovers complete question/card objects if an LLM hit max_tokens right before closing the JSON array.
 */
function recoverTruncatedPayload(jsonStr: string): any {
  const isQuiz = /"questions"\s*:\s*\[/i.test(jsonStr);
  const isFlash = /"cards"\s*:\s*\[/i.test(jsonStr);
  if (!isQuiz && !isFlash) return null;

  const titleMatch = jsonStr.match(/"title"\s*:\s*"([^"]*)"/i);
  const title = titleMatch ? titleMatch[1] : undefined;

  const arrayKey = isQuiz ? "questions" : "cards";
  const arrStart = jsonStr.search(new RegExp(`"${arrayKey}"\\s*:\\s*\\[`, "i"));
  if (arrStart === -1) return null;

  const bracketIdx = jsonStr.indexOf("[", arrStart);
  if (bracketIdx === -1) return null;

  // Walk character-by-character to collect complete top-level objects inside the array
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
    }
  }

  if (items.length === 0) return null;
  return { title, [arrayKey]: items };
}

/**
 * Detects an unclosed ```quiz or ```flashcards fenced block during streaming
 * so the UI can show a clean loading skeleton instead of flickering partial JSON.
 */
export function detectStreamingInteractiveFence(rawText: string): {
  type: "quiz" | "flashcards" | null;
  prefixText: string;
} {
  const openRe = /```(quiz|json:quiz|quiz-json|flashcards|flashcard|json:flashcards|cards)\b/gi;
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
  const type = lang.includes("flash") || lang === "cards" ? "flashcards" : "quiz";
  return {
    type,
    prefixText: rawText.slice(0, lastMatch.index).trimEnd(),
  };
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

  const parsed = safeJsonParse(candidateJsonStr);
  if (parsed && Array.isArray(parsed.questions) && parsed.questions.length > 0) {
    const questions: QuizQuestion[] = parsed.questions
      .map((q: any, idx: number) => {
        const questionText = String(q.question || q.prompt || "").trim();
        const rawOptions: string[] = Array.isArray(q.options)
          ? q.options.map((o: any) => cleanOptionPrefix(String(o).trim()))
          : [];
        if (!questionText || rawOptions.length < 2) return null;

        const correctIdx = resolveCorrectOptionIndex(q, rawOptions);

        return {
          id: q.id ?? idx + 1,
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
      };
    }
  }

  return parseMarkdownQuiz(trimmed);
}

function parseMarkdownQuiz(text: string): QuizData | null {
  const questionBlocks = text.split(
    /(?=(?:^|\n)(?:###?\s*)?(?:\*{0,2}Question\s*\d+|\d+\.\s*\*{0,2}(?:Question|Which|What|How|Calculate|Identify|Define|In|According)))/i
  );
  const questions: QuizQuestion[] = [];
  let sawExplicitAnswer = false;

  for (const block of questionBlocks) {
    const lines = block
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length < 3) continue;

    const firstLine = lines[0]
      .replace(/^#{1,4}\s*/, "")
      .replace(/^\*{0,2}Question\s*\d+[:.]?\*{0,2}\s*/i, "")
      .replace(/^\d+[\.\)]\s*/, "")
      .trim();

    const options: string[] = [];
    let correctIdx = -1;
    let explanation = "";

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      const optMatch = line.match(/^[-\*•]?\s*([A-Fa-f])[\.\)]\s*(.*)$/);
      if (optMatch) {
        options.push(optMatch[2].trim());
        continue;
      }

      const ansMatch = line.match(
        /(?:\*{0,2}Correct Answer|\*{0,2}Answer)[:\s*]+([A-Fa-f]|\d+)/i
      );
      if (ansMatch) {
        sawExplicitAnswer = true;
        const idx = parseLetterToIndex(ansMatch[1]);
        if (idx !== null) correctIdx = idx;
        continue;
      }

      const expMatch = line.match(
        /(?:\*{0,2}Explanation|\*{0,2}Solution|\*{0,2}Rationale)[:\s*]+(.*)$/i
      );
      if (expMatch) {
        explanation = expMatch[1].trim();
        continue;
      }

      if (explanation) {
        explanation += ` ${line}`;
      }
    }

    if (firstLine && options.length >= 2) {
      questions.push({
        id: questions.length + 1,
        question: firstLine,
        options,
        correctIndex:
          correctIdx >= 0 && correctIdx < options.length ? correctIdx : 0,
        explanation:
          explanation ||
          "Review the referenced document section for the complete explanation.",
      });
    }
  }

  if (questions.length >= 2 && sawExplicitAnswer) {
    return {
      title: "Document Practice Quiz",
      questions,
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
      /```(?:flashcards|flashcard|json:flashcards|cards|json)?\s*([\s\S]*?)```/i
    ) || trimmed.match(/<flashcards>([\s\S]*?)<\/flashcards>/i);

  const candidateJsonStr = fenceMatch
    ? fenceMatch[1].trim()
    : trimmed.replace(/^```[\w:-]*\s*\n?/, "").trim();

  const parsed = safeJsonParse(candidateJsonStr);
  if (parsed && Array.isArray(parsed.cards) && parsed.cards.length > 0) {
    const cards: FlashcardItem[] = parsed.cards
      .map((c: any, idx: number) => {
        const front = String(
          c.front || c.question || c.term || c.prompt || ""
        ).trim();
        const back = String(
          c.back || c.answer || c.solution || c.definition || ""
        ).trim();
        const hint = c.hint ? String(c.hint).trim() : undefined;
        if (!front || !back) return null;
        return {
          id: c.id ?? idx + 1,
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
    /(?=(?:^|\n)(?:###?\s*)?(?:\*{0,2}Card\s*\d+|\*{0,2}Flashcard\s*\d+|\d+\.\s*\*{0,2}(?:Card|Flashcard)))/i
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
