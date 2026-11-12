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

function cleanOptionPrefix(opt: string): string {
  return opt.replace(/^[A-Da-d][\.\)]\s*/, "").trim();
}

function parseLetterToIndex(letter: string): number {
  const char = letter.trim().toUpperCase();
  if (char === "A" || char === "1") return 0;
  if (char === "B" || char === "2") return 1;
  if (char === "C" || char === "3") return 2;
  if (char === "D" || char === "4") return 3;
  if (char === "E" || char === "5") return 4;
  return 0;
}

/**
 * Safely parses JSON strings produced by LLMs that may contain LaTeX backslashes
 * (e.g. `\alpha`, `\sigma`, `\frac`) which are otherwise invalid escape sequences in strict JSON.
 */
function safeJsonParse(rawJson: string): any {
  try {
    return JSON.parse(rawJson);
  } catch {
    try {
      // Escape backslashes that are not valid JSON escape sequences
      const sanitized = rawJson.replace(/\\(?!["\\/bfnrt]|u[0-9a-fA-F]{4})/g, "\\\\");
      return JSON.parse(sanitized);
    } catch {
      return null;
    }
  }
}

/**
 * Parses structured JSON quiz or falls back to parsing Markdown questions.
 */
export function parseQuizData(raw: string): QuizData | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // 1. Check for fenced code block ```quiz ... ``` or ```json:quiz ... ``` or JSON with "questions"
  const fenceMatch =
    trimmed.match(/```(?:quiz|json:quiz|json)?\s*([\s\S]*?)```/i) ||
    trimmed.match(/<quiz>([\s\S]*?)<\/quiz>/i);

  const candidateJsonStr = fenceMatch ? fenceMatch[1].trim() : trimmed;

  const parsed = safeJsonParse(candidateJsonStr);
  if (parsed && Array.isArray(parsed.questions) && parsed.questions.length > 0) {
    const questions: QuizQuestion[] = parsed.questions
      .map((q: any, idx: number) => {
        const questionText = String(q.question || q.prompt || "").trim();
        const rawOptions: string[] = Array.isArray(q.options)
          ? q.options.map((o: any) => cleanOptionPrefix(String(o).trim()))
          : [];
        if (!questionText || rawOptions.length < 2) return null;

        let correctIdx = 0;
        if (typeof q.correctIndex === "number") {
          correctIdx = q.correctIndex;
        } else if (typeof q.correctAnswer === "number") {
          correctIdx = q.correctAnswer;
        } else if (typeof q.correctAnswer === "string") {
          correctIdx = parseLetterToIndex(q.correctAnswer);
        } else if (typeof q.answer === "string") {
          correctIdx = parseLetterToIndex(q.answer);
        } else if (typeof q.answerIndex === "number") {
          correctIdx = q.answerIndex;
        }

        if (correctIdx < 0 || correctIdx >= rawOptions.length) {
          correctIdx = 0;
        }

        return {
          id: q.id ?? idx + 1,
          question: questionText,
          options: rawOptions,
          correctIndex: correctIdx,
          explanation: String(q.explanation || q.rationale || "").trim(),
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

  // 2. Parse Markdown quiz questions (e.g. Question 1: ... A) ... B) ... Answer: B)
  return parseMarkdownQuiz(trimmed);
}

function parseMarkdownQuiz(text: string): QuizData | null {
  const questionBlocks = text.split(/(?=(?:^|\n)(?:###?\s*)?(?:\*{0,2}Question\s*\d+|\d+\.\s*\*{0,2}(?:Question|Which|What|How|Calculate|Identify|Define|In|According)))/i);
  const questions: QuizQuestion[] = [];

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
      const optMatch = line.match(/^[-\*•]?\s*([A-Da-d])[\.\)]\s*(.*)$/);
      if (optMatch) {
        options.push(optMatch[2].trim());
        continue;
      }

      const ansMatch = line.match(/(?:\*{0,2}Correct Answer|\*{0,2}Answer)[:\s*]+([A-Da-d]|\d+)/i);
      if (ansMatch) {
        correctIdx = parseLetterToIndex(ansMatch[1]);
        continue;
      }

      const expMatch = line.match(/(?:\*{0,2}Explanation|\*{0,2}Rationale)[:\s*]+(.*)$/i);
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
        correctIndex: correctIdx >= 0 && correctIdx < options.length ? correctIdx : 0,
        explanation: explanation || "Review the referenced document section for more details.",
      });
    }
  }

  if (questions.length > 0) {
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

  // 1. Check for fenced code block ```flashcards ... ``` or ```json:flashcards ... ``` or JSON with "cards"
  const fenceMatch =
    trimmed.match(/```(?:flashcards|json:flashcards|json)?\s*([\s\S]*?)```/i) ||
    trimmed.match(/<flashcards>([\s\S]*?)<\/flashcards>/i);

  const candidateJsonStr = fenceMatch ? fenceMatch[1].trim() : trimmed;

  const parsed = safeJsonParse(candidateJsonStr);
  if (parsed && Array.isArray(parsed.cards) && parsed.cards.length > 0) {
    const cards: FlashcardItem[] = parsed.cards
      .map((c: any, idx: number) => {
        const front = String(c.front || c.question || c.term || "").trim();
        const back = String(c.back || c.answer || c.definition || "").trim();
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

  // 2. Parse Markdown flashcards (e.g. Card 1: Front: ... Back: ...)
  return parseMarkdownFlashcards(trimmed);
}

function parseMarkdownFlashcards(text: string): FlashcardsData | null {
  const cardBlocks = text.split(/(?=(?:^|\n)(?:###?\s*)?(?:\*{0,2}Card\s*\d+|\*{0,2}Flashcard\s*\d+|\d+\.\s*\*{0,2}Card))/i);
  const cards: FlashcardItem[] = [];

  for (const block of cardBlocks) {
    const frontMatch =
      block.match(/(?:Front|Question|Term|Prompt)[:\s*]+([^\n]+(?:\n(?!(?:Back|Answer|Definition|Hint)).+)*)/i) ||
      block.match(/\*\*([^*]+)\*\*[:\s]+([^\n]+)/);
    const backMatch = block.match(/(?:Back|Answer|Definition|Explanation)[:\s*]+([^\n]+(?:\n(?!(?:Front|Card|Hint)).+)*)/i);
    const hintMatch = block.match(/(?:Hint)[:\s*]+([^\n]+)/i);

    if (frontMatch && backMatch) {
      const front = frontMatch[1].trim();
      const back = backMatch[1].trim();
      if (front && back) {
        cards.push({
          id: cards.length + 1,
          front,
          back,
          hint: hintMatch ? hintMatch[1].trim() : undefined,
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

