export interface MultiDocFileCandidate {
  id: string;
  name: string;
  url: string;
  uploadStatus?: string | null;
  createdAt?: string | Date;
}

export interface MultiDocHistoryMessage {
  text: string;
  isUserMessage: boolean;
}

export interface MultiDocResolution<T extends MultiDocFileCandidate> {
  activeFiles: T[];
  isAutoMultiDoc: boolean;
  reason: "explicit_files" | "library_wide" | "followup_context" | "single";
  matchedFileIds: string[];
}

const FILE_EXT_REGEX = /\.(pdf|docx?|pptx?)$/i;

/**
 * Normalizes text or filenames into space-separated lowercase alphanumeric tokens
 * so matches work regardless of underscores, hyphens, or extensions.
 */
function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(FILE_EXT_REGEX, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsWholePhrase(haystackNormalized: string, needleNormalized: string): boolean {
  if (!needleNormalized || needleNormalized.length < 4) return false;
  const pattern = new RegExp(`(?:^|\\s)${escapeRegex(needleNormalized)}(?:$|\\s)`, "i");
  return pattern.test(haystackNormalized);
}

/**
 * Checks whether a single candidate file is explicitly referenced in raw or normalized text.
 */
export function doesTextReferenceFile(
  rawText: string,
  normalizedText: string,
  fileName: string
): boolean {
  const rawLower = rawText.toLowerCase();
  const fullFileLower = fileName.toLowerCase().trim();
  if (fullFileLower.length >= 4 && rawLower.includes(fullFileLower)) {
    return true;
  }

  const normalizedStem = normalizeText(fileName);
  if (normalizedStem.length >= 4 && containsWholePhrase(normalizedText, normalizedStem)) {
    return true;
  }

  // Also check distinctive multi-word stems (e.g. "lecture 2" matching "Lecture 2 Physics.pdf")
  const tokens = normalizedStem.split(" ").filter((t) => t.length >= 2);
  if (tokens.length >= 2) {
    const firstTwo = `${tokens[0]} ${tokens[1]}`;
    if (firstTwo.length >= 6 && containsWholePhrase(normalizedText, firstTwo)) {
      return true;
    }
  }

  return false;
}

const LIBRARY_WIDE_INTENT_REGEX =
  /\b(all (?:of )?(?:my |the |uploaded )?(?:documents?|docs?|files?|pdfs?|slides?|presentations?)|every (?:document|doc|file|pdf)|across (?:all )?(?:my |the )?(?:documents?|docs?|files?|pdfs?)|multiple (?:documents?|docs?|files?)|multi[- ]?doc|in my (?:library|dashboard|uploads|account)|which (?:document|doc|file|pdf)|what (?:documents?|docs?|files?) (?:do i have|mention|cover|contain|talk about|discuss)|(?:my |the |another )?other (?:documents?|docs?|files?|pdfs?|decks?)|compare (?:this |it )?(?:to|with) (?:my |the |another )?(?:other )?(?:documents?|docs?|files?|pdfs?)|both (?:documents?|docs?|files?|pdfs?)|cross[- ]?reference)\b/i;

const FOLLOWUP_COMPARATIVE_REGEX =
  /\b(compare|comparison|contrast|differ(?:ence|ences)?|similarit(?:y|ies)|both|between them|these (?:two |three )?(?:documents?|docs?|files?|pdfs?)|those (?:documents?|docs?|files?|pdfs?)|(?:the )?other (?:one|document|doc|file|pdf)|which (?:one|doc|document|file)|all of them|either (?:one|doc|document|file))\b/i;

const HOLISTIC_QUERY_REGEX =
  /\b(summar(?:y|ize|ise)|overview|compare|comparison|contrast|differ(?:ence|ences)?|similarit(?:y|ies)|both|all (?:the )?(?:documents?|docs?|files?)|study guide|key (?:points?|takeaways?)|outline|topics covered|synthesize|synthesis|main (?:ideas?|themes?)|compare and contrast)\b/i;

/**
 * Determines whether the user's question requires broad, distributed context
 * across each participating document (e.g., summaries, comparisons, overviews).
 */
export function isHolisticMultiDocQuery(message: string): boolean {
  return HOLISTIC_QUERY_REGEX.test(message);
}

/**
 * Automatically detects when a chat turn requires multi-document context even when
 * initiated from a single-document session, while preserving strict focus in normal single-doc Q&A.
 */
export function resolveMultiDocumentIntent<T extends MultiDocFileCandidate>({
  message,
  prevMessages = [],
  primaryFile,
  allUserFiles,
  maxAutoFiles = 5,
}: {
  message: string;
  prevMessages?: MultiDocHistoryMessage[];
  primaryFile: T;
  allUserFiles: T[];
  maxAutoFiles?: number;
}): MultiDocResolution<T> {
  const readyOthers = allUserFiles.filter(
    (f) => f.id !== primaryFile.id && f.uploadStatus !== "FAILED"
  );

  if (readyOthers.length === 0) {
    return {
      activeFiles: [primaryFile],
      isAutoMultiDoc: false,
      reason: "single",
      matchedFileIds: [],
    };
  }

  const normalizedMsg = normalizeText(message);

  // 1. Direct filename/title references to other documents in the user's library
  const explicitlyReferenced = readyOthers.filter((f) =>
    doesTextReferenceFile(message, normalizedMsg, f.name)
  );

  if (explicitlyReferenced.length > 0) {
    const selected = [primaryFile, ...explicitlyReferenced].slice(0, maxAutoFiles);
    return {
      activeFiles: selected,
      isAutoMultiDoc: selected.length > 1,
      reason: "explicit_files",
      matchedFileIds: explicitlyReferenced.map((f) => f.id),
    };
  }

  // 2. Explicit cross-document or library-wide intent ("all my documents", "compare with other file", etc.)
  if (LIBRARY_WIDE_INTENT_REGEX.test(message)) {
    // Rank other files by any shared query words in filenames first, then recency
    const queryWords = normalizedMsg.split(" ").filter((w) => w.length >= 3);
    const rankedOthers = [...readyOthers].sort((a, b) => {
      const aNorm = normalizeText(a.name);
      const bNorm = normalizeText(b.name);
      const aScore = queryWords.filter((w) => aNorm.includes(w)).length;
      const bScore = queryWords.filter((w) => bNorm.includes(w)).length;
      if (bScore !== aScore) return bScore - aScore;
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bTime - aTime;
    });

    const selected = [
      primaryFile,
      ...rankedOthers.slice(0, Math.max(1, maxAutoFiles - 1)),
    ];
    return {
      activeFiles: selected,
      isAutoMultiDoc: selected.length > 1,
      reason: "library_wide",
      matchedFileIds: selected.slice(1).map((f) => f.id),
    };
  }

  // 3. Multi-turn follow-up continuity if recent turns already referenced other docs
  if (FOLLOWUP_COMPARATIVE_REGEX.test(message) && prevMessages.length > 0) {
    const recentSlice = prevMessages.slice(-4);
    const referencedEarlier = readyOthers.filter((f) =>
      recentSlice.some((m) =>
        doesTextReferenceFile(m.text || "", normalizeText(m.text || ""), f.name)
      )
    );

    if (referencedEarlier.length > 0) {
      const selected = [primaryFile, ...referencedEarlier].slice(0, maxAutoFiles);
      return {
        activeFiles: selected,
        isAutoMultiDoc: selected.length > 1,
        reason: "followup_context",
        matchedFileIds: referencedEarlier.map((f) => f.id),
      };
    }
  }

  return {
    activeFiles: [primaryFile],
    isAutoMultiDoc: false,
    reason: "single",
    matchedFileIds: [],
  };
}

