import OpenAI from "openai";
import fs from "fs";
import path from "path";

// OpenRouter & OpenAI API keys (trimmed cleanly)
const openRouterKey = process.env.OPENROUTER_API_KEY?.trim();
const openAiKey = process.env.OPENAI_API_KEY?.trim();

export const isOpenRouterActive = Boolean(
  openRouterKey && !openRouterKey.includes("<your")
);

export const isOpenAiActive = Boolean(
  openAiKey && !openAiKey.includes("<your")
);

export const isAiConfigured = isOpenRouterActive || isOpenAiActive;

export const OPENROUTER_FREE_ROUTER = "openrouter/free";

// High-capacity, cost-efficient models ranked for document QA and throughput
const rawPrimaryModels = [
  process.env.AI_MODEL?.trim(),
  "google/gemini-2.5-flash",
  "openai/gpt-4o-mini",
  "deepseek/deepseek-chat",
].filter((m): m is string => Boolean(m));

export const FALLBACK_MODELS = Array.from(new Set(rawPrimaryModels));

const BACKUP_FREE_OPENROUTER_MODELS = [
  OPENROUTER_FREE_ROUTER,
  "google/gemma-3-27b-it:free",
  "meta-llama/llama-3.3-70b-instruct:free",
  "mistralai/mistral-small-3.1-24b-instruct:free",
  "qwen/qwen-2.5-72b-instruct:free",
];

let cachedFreeModels: { models: string[]; expiresAt: number } | null = null;
const FREE_MODELS_CACHE_TTL_MS = 30 * 60 * 1000;

export function getAiClient(provider?: "openrouter" | "openai") {
  const useOpenRouter =
    provider === "openrouter" || (provider !== "openai" && isOpenRouterActive);

  if (useOpenRouter && isOpenRouterActive) {
    return new OpenAI({
      apiKey: openRouterKey,
      baseURL: "https://openrouter.ai/api/v1",
      defaultHeaders: {
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
        "X-Title": "Quill - AI PDF Assistant",
      },
    });
  }

  // Fallback to direct OpenAI if OPENAI_API_KEY is supplied
  return new OpenAI({
    apiKey: openAiKey || "dummy-key",
  });
}

import { parseDocument } from "@/lib/document-parser";

// In-memory cache for extracted document text to avoid re-parsing
const docTextCache = new Map<string, string>();

/**
 * Extract clean text from a document (PDF, Word DOCX, or PowerPoint PPTX)
 */
export async function extractPdfText(
  fileUrl: string,
  fileName?: string
): Promise<string> {
  if (docTextCache.has(fileUrl)) {
    return docTextCache.get(fileUrl)!;
  }

  try {
    const parsed = await parseDocument(fileUrl, fileName);
    const text = parsed.text || "";

    if (text) {
      docTextCache.set(fileUrl, text);
    }

    return text;
  } catch (err) {
    console.error("Failed to extract document text:", err);
    return "";
  }
}

function splitIntoReadableChunks(text: string, targetChunkSize = 950): string[] {
  const cleaned = text.trim();
  if (!cleaned) return [];
  if (cleaned.length <= targetChunkSize) return [cleaned];

  const blocks = cleaned.split(/\n\s*\n/).filter((p) => p.trim().length > 20);
  // If paragraphs are missing or overly huge, split cleanly by single lines
  const units =
    blocks.length >= 2 && blocks.every((b) => b.length <= targetChunkSize * 2)
      ? blocks
      : cleaned.split(/\n/).filter((line) => line.trim().length > 0);

  const chunks: string[] = [];
  let current = "";

  for (const unit of units) {
    const trimmed = unit.trim();
    if (!trimmed) continue;

    if (current && current.length + trimmed.length + 2 > targetChunkSize) {
      chunks.push(current);
      current = trimmed.length > targetChunkSize ? trimmed.slice(0, targetChunkSize) : trimmed;
    } else {
      current = current ? `${current}\n${trimmed}` : trimmed;
    }
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}

/**
 * Smart context selector: retrieves the most relevant content from the document
 * If document is small enough to fit in the context window, returns the whole text.
 * Otherwise, performs high-density section extraction based on question keywords
 * plus evenly distributed sampling in reading order.
 */
export function getSmartContext(fullText: string, query: string, maxChars = 35000): string {
  if (!fullText) return "";
  if (fullText.length <= maxChars) {
    return fullText;
  }

  const chunks = splitIntoReadableChunks(fullText, 950);
  if (chunks.length === 0) {
    return fullText.slice(0, maxChars);
  }

  const queryTerms = query
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);

  const scored = chunks.map((chunk, idx) => {
    const lower = chunk.toLowerCase();
    let score = 0;
    for (const term of queryTerms) {
      if (lower.includes(term)) score += 1;
    }
    return { idx, chunk, score };
  });

  const chosen = new Map<number, string>();
  let totalLen = 0;

  const tryAdd = (idx: number, chunk: string) => {
    if (chosen.has(idx)) return false;
    const needed = chunk.length + 2;
    if (totalLen + needed > maxChars) return false;
    chosen.set(idx, chunk);
    totalLen += needed;
    return true;
  };

  // Always retain the opening chunk so document title/overview stays anchored
  tryAdd(0, chunks[0]);

  // Prefer highest-scoring chunks first
  const byRelevance = [...scored].sort((a, b) => b.score - a.score || a.idx - b.idx);
  for (const item of byRelevance) {
    if (item.score === 0) break;
    tryAdd(item.idx, item.chunk);
  }

  // Fill remaining budget with evenly distributed chunks across start, middle, end
  const stride = Math.max(1, Math.floor(chunks.length / 8));
  for (let i = stride; i < chunks.length && totalLen < maxChars * 0.9; i += stride) {
    tryAdd(i, chunks[i]);
  }
  for (let i = 1; i < chunks.length && totalLen < maxChars * 0.9; i++) {
    tryAdd(i, chunks[i]);
  }

  if (chosen.size === 0) {
    return fullText.slice(0, maxChars);
  }

  return Array.from(chosen.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([, text]) => text)
    .join("\n\n");
}

interface StructuredSegment {
  order: number;
  label: string;
  body: string;
}

/**
 * Extracts structured, page/slide-labeled context for a document using parseDocument,
 * preserving exact citations and distributed multi-section coverage even when exceeding maxChars.
 */
export async function buildStructuredDocumentContext({
  fileUrl,
  fileName,
  query,
  maxChars = 25000,
  isMultiDoc = false,
  docIndex,
  holistic = false,
}: {
  fileUrl: string;
  fileName: string;
  query: string;
  maxChars?: number;
  isMultiDoc?: boolean;
  docIndex?: number;
  holistic?: boolean;
}): Promise<{
  context: string;
  totalPages: number | null;
  unitLabel: "Page" | "Slide";
}> {
  try {
    const parsed = await parseDocument(fileUrl, fileName);
    const unitLabel: "Page" | "Slide" = parsed.fileType === "pptx" ? "Slide" : "Page";
    const totalPages =
      parsed.totalPages ||
      parsed.totalSlides ||
      (parsed.pages ? parsed.pages.length : null) ||
      (parsed.slides ? parsed.slides.length : null);

    const formatTag = (unit: "Page" | "Slide", num: number) =>
      isMultiDoc && docIndex
        ? `[${docIndex} · ${unit === "Slide" ? "s" : "p"}.${num}]`
        : isMultiDoc
          ? `[Source: ${fileName} • ${unit} ${num}]`
          : `[${unit} ${num}]`;

    const segments: StructuredSegment[] = [];
    let orderCounter = 0;

    if (parsed.slides && parsed.slides.length > 0) {
      for (const slide of parsed.slides) {
        const text = (slide.rawText || (slide.content || []).join("\n")).trim();
        if (!text) continue;
        segments.push({
          order: orderCounter++,
          label: formatTag("Slide", slide.slideNumber),
          body: text,
        });
      }
    } else if (parsed.pages && parsed.pages.length > 0) {
      for (const page of parsed.pages) {
        const text = page.text.trim();
        if (!text) continue;
        const pageChunks = splitIntoReadableChunks(text, 1200);
        for (const chunk of pageChunks) {
          segments.push({
            order: orderCounter++,
            label: formatTag("Page", page.pageNumber),
            body: chunk,
          });
        }
      }
    } else if (parsed.text) {
      const textChunks = splitIntoReadableChunks(parsed.text, 1100);
      const estPages = totalPages || Math.max(1, Math.ceil((parsed.totalWords || 450) / 450));
      textChunks.forEach((chunk, idx) => {
        const estPage = Math.min(
          estPages,
          Math.max(1, Math.floor((idx / Math.max(1, textChunks.length)) * estPages) + 1)
        );
        segments.push({
          order: orderCounter++,
          label: formatTag("Page", estPage),
          body: chunk,
        });
      });
    }

    if (segments.length === 0) {
      return { context: "", totalPages, unitLabel };
    }

    const formattedAll = segments.map((s) => `${s.label}\n${s.body}`);
    const fullJoined = formattedAll.join("\n\n---\n\n");
    if (fullJoined.length <= maxChars) {
      return { context: fullJoined, totalPages, unitLabel };
    }

    const queryTerms = query
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2);

    const chosenIndices = new Set<number>();
    let currentLen = 0;

    const addSegment = (idx: number) => {
      if (chosenIndices.has(idx)) return false;
      const entryLen = formattedAll[idx].length + 7;
      if (currentLen + entryLen > maxChars) return false;
      chosenIndices.add(idx);
      currentLen += entryLen;
      return true;
    };

    // Always anchor opening page/slide and final page/slide for holistic questions
    addSegment(0);
    if (holistic && segments.length > 1) {
      addSegment(segments.length - 1);
    }

    if (holistic) {
      // Sample evenly distributed segments across the whole document, then supplement by keyword hits
      const targetSampleCount = Math.min(segments.length, 10);
      const step = Math.max(1, Math.floor(segments.length / targetSampleCount));
      for (let i = step; i < segments.length; i += step) {
        addSegment(i);
      }
    }

    // Score segments by keyword hits
    if (queryTerms.length > 0) {
      const scored = segments
        .map((seg, idx) => {
          const lower = seg.body.toLowerCase();
          let score = 0;
          for (const term of queryTerms) {
            if (lower.includes(term)) score += 1;
          }
          return { idx, score };
        })
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score || a.idx - b.idx);

      for (const item of scored) {
        addSegment(item.idx);
      }
    }

    // Fill any leftover budget with remaining evenly spaced segments
    const fallbackStep = Math.max(1, Math.floor(segments.length / 8));
    for (let i = 1; i < segments.length && currentLen < maxChars * 0.9; i += fallbackStep) {
      addSegment(i);
    }
    for (let i = 1; i < segments.length && currentLen < maxChars * 0.9; i++) {
      addSegment(i);
    }

    if (chosenIndices.size === 0) {
      return {
        context: fullJoined.slice(0, maxChars),
        totalPages,
        unitLabel,
      };
    }

    const orderedContext = Array.from(chosenIndices)
      .sort((a, b) => a - b)
      .map((idx) => formattedAll[idx])
      .join("\n\n---\n\n");

    return {
      context: orderedContext,
      totalPages,
      unitLabel,
    };
  } catch (err) {
    console.error(`[buildStructuredDocumentContext] Failed for ${fileName}:`, err);
    return {
      context: "",
      totalPages: null,
      unitLabel: "Page",
    };
  }
}

type ChatMessageParam = {
  role: "system" | "user" | "assistant";
  content: string;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getErrorMessage(err: any): string {
  return String(
    err?.error?.message || err?.message || err?.toString?.() || "Unknown AI error"
  );
}

function extractErrorStatus(err: any, msg: string): number | null {
  const num = Number(err?.status ?? err?.response?.status ?? err?.code);
  if (!isNaN(num) && num >= 400 && num < 600) return num;
  const m = msg.match(/\b(400|401|402|403|404|413|429|500|502|503|504)\b/);
  return m ? Number(m[1]) : null;
}

export function extractAffordableTokens(msg: string): number | null {
  const m =
    msg.match(/can only afford\s+(\d+)/i) ||
    msg.match(/afford\s+(\d+)\s+tokens/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return !isNaN(n) && n > 0 ? n : null;
}

export function isCreditOrUpgradeError(status: number | null, msg: string): boolean {
  return (
    status === 402 ||
    /insufficient credits|more credits|fewer max_tokens|can only afford|add credits|openrouter\.ai\/settings\/credits|upgrade to a paid/i.test(
      msg
    )
  );
}

function isRateLimitError(status: number | null, msg: string): boolean {
  return (
    status === 429 ||
    /rate[- ]limit|too many requests|quota exceeded|temporarily rate-limited/i.test(msg)
  );
}

function isContextTooLongError(status: number | null, msg: string): boolean {
  return (
    status === 413 ||
    /context length|maximum context|too many tokens|prompt is too long|exceeds the maximum|reduce the length/i.test(
      msg
    )
  );
}

/**
 * Compacts chat history and document context cleanly while preserving
 * the system prompt and the user's current question intact.
 */
export function compactMessagesForBudget(
  messages: ChatMessageParam[],
  maxDocContextChars: number,
  maxHistoryTurns: number
): ChatMessageParam[] {
  if (messages.length === 0) return messages;

  const systemMsg = messages[0]?.role === "system" ? messages[0] : null;
  const rest = systemMsg ? messages.slice(1) : messages;
  const lastUserMsg = rest[rest.length - 1];
  const history = rest.slice(0, -1).slice(-maxHistoryTurns);

  let updatedLastUser = lastUserMsg;
  if (lastUserMsg && lastUserMsg.role === "user") {
    const qMarker = "\n\nUSER QUESTION:";
    const qIdx = lastUserMsg.content.lastIndexOf(qMarker);
    if (qIdx !== -1) {
      const ctxPart = lastUserMsg.content.slice(0, qIdx);
      const qPart = lastUserMsg.content.slice(qIdx);
      if (ctxPart.length > maxDocContextChars) {
        updatedLastUser = {
          ...lastUserMsg,
          content: `${ctxPart.slice(0, maxDocContextChars)}\n...[truncated for compact context]${qPart}`,
        };
      }
    } else if (lastUserMsg.content.length > maxDocContextChars) {
      updatedLastUser = {
        ...lastUserMsg,
        content: lastUserMsg.content.slice(-maxDocContextChars),
      };
    }
  }

  return [
    ...(systemMsg ? [systemMsg] : []),
    ...history.map((m) => ({
      ...m,
      content: m.content.length > 2000 ? `${m.content.slice(0, 2000)}...` : m.content,
    })),
    ...(updatedLastUser ? [updatedLastUser] : []),
  ];
}

/**
 * Fetches active zero-cost `:free` OpenRouter text models and caches them
 * alongside `openrouter/free` so fallback never relies on stale paid credits.
 */
async function getFreeOpenRouterCandidates(): Promise<string[]> {
  if (cachedFreeModels && cachedFreeModels.expiresAt > Date.now()) {
    return cachedFreeModels.models;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const res = await fetch("https://openrouter.ai/api/v1/models", {
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timer);

    if (res.ok) {
      const payload = await res.json().catch(() => null);
      const data: any[] = Array.isArray(payload?.data) ? payload.data : [];

      const freeScored = data
        .filter((m) => {
          const id = String(m?.id || "");
          if (!id.endsWith(":free")) return false;
          const promptCost = Number(m?.pricing?.prompt ?? 1);
          const compCost = Number(m?.pricing?.completion ?? 1);
          if (promptCost !== 0 || compCost !== 0) return false;
          const modality = String(m?.architecture?.modality || "text->text");
          return modality.includes("->text");
        })
        .map((m) => {
          const id = String(m.id);
          const ctx = Number(m?.context_length) || 0;
          let score = ctx >= 64000 ? 30 : ctx >= 32000 ? 20 : 10;
          if (/gemini|llama-3\.3|qwen|deepseek|mistral|gemma/i.test(id)) {
            score += 25;
          }
          return { id, score };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 6)
        .map((m) => m.id);

      const merged = Array.from(
        new Set([OPENROUTER_FREE_ROUTER, ...freeScored, ...BACKUP_FREE_OPENROUTER_MODELS])
      ).slice(0, 7);

      cachedFreeModels = {
        models: merged,
        expiresAt: Date.now() + FREE_MODELS_CACHE_TTL_MS,
      };
      return merged;
    }
  } catch {
    // Use router + static backup list cleanly if model catalog fetch times out
  }

  return BACKUP_FREE_OPENROUTER_MODELS;
}

async function attemptCompletionStream(
  client: OpenAI,
  params: {
    model: string;
    messages: ChatMessageParam[];
    temperature: number;
    max_tokens: number;
  }
) {
  return client.chat.completions.create({
    model: params.model,
    messages: params.messages,
    temperature: params.temperature,
    max_tokens: params.max_tokens,
    stream: true,
  });
}

/**
 * Robust chat completion with dynamic credit/token adaptation, automatic
 * OpenRouter `:free` router fallback, and optional direct OpenAI fallback.
 */
export async function createCompletionWithFallback({
  messages,
  temperature = 0.2,
  max_tokens = 1800,
}: {
  messages: ChatMessageParam[];
  temperature?: number;
  max_tokens?: number;
}) {
  let lastError: any = null;

  if (isOpenRouterActive) {
    const openRouter = getAiClient("openrouter");
    let currentMessages = messages;
    let currentMaxTokens = max_tokens;
    let paidCreditsExhausted = false;

    // 1. Primary/cost-efficient OpenRouter models with adaptive 402 & context recovery
    for (const model of FALLBACK_MODELS) {
      if (paidCreditsExhausted) break;

      try {
        console.log(`[AI] Attempting OpenRouter model: ${model}`);
        const response = await attemptCompletionStream(openRouter, {
          model,
          messages: currentMessages,
          temperature,
          max_tokens: currentMaxTokens,
        });
        return { response, activeModel: model };
      } catch (err: any) {
        const msg = getErrorMessage(err);
        const status = extractErrorStatus(err, msg);
        console.warn(`[AI] Model ${model} failed (${status ?? "err"}):`, msg);
        lastError = err;

        if (isCreditOrUpgradeError(status, msg)) {
          const affordable = extractAffordableTokens(msg);
          if (affordable !== null && affordable >= 240) {
            const clampedTokens = Math.max(
              220,
              Math.min(currentMaxTokens - 100, Math.floor(affordable * 0.85))
            );
            const compactedMsgs = compactMessagesForBudget(
              currentMessages,
              affordable < 800 ? 10000 : 18000,
              4
            );
            try {
              console.log(
                `[AI] Retrying ${model} with clamped max_tokens=${clampedTokens}`
              );
              const retryRes = await attemptCompletionStream(openRouter, {
                model,
                messages: compactedMsgs,
                temperature,
                max_tokens: clampedTokens,
              });
              return { response: retryRes, activeModel: model };
            } catch (retryErr: any) {
              const retryMsg = getErrorMessage(retryErr);
              const retryStatus = extractErrorStatus(retryErr, retryMsg);
              lastError = retryErr;
              if (isCreditOrUpgradeError(retryStatus, retryMsg)) {
                paidCreditsExhausted = true;
              }
            }
          } else {
            paidCreditsExhausted = true;
          }
        } else if (isContextTooLongError(status, msg)) {
          const compactedMsgs = compactMessagesForBudget(currentMessages, 14000, 4);
          currentMessages = compactedMsgs;
          try {
            const retryRes = await attemptCompletionStream(openRouter, {
              model,
              messages: compactedMsgs,
              temperature,
              max_tokens: Math.min(currentMaxTokens, 1200),
            });
            return { response: retryRes, activeModel: model };
          } catch (retryErr: any) {
            lastError = retryErr;
          }
        }
      }
    }

    // 2. Zero-credit OpenRouter `:free` tier router & discovered free models fallback
    const freeCandidates = await getFreeOpenRouterCandidates();
    let freeMessages = compactMessagesForBudget(messages, 20000, 6);
    let freeMaxTokens = Math.min(max_tokens, 1400);

    for (const freeModel of freeCandidates) {
      try {
        console.log(`[AI] Attempting OpenRouter free fallback: ${freeModel}`);
        const response = await attemptCompletionStream(openRouter, {
          model: freeModel,
          messages: freeMessages,
          temperature,
          max_tokens: freeMaxTokens,
        });
        return { response, activeModel: freeModel };
      } catch (err: any) {
        const msg = getErrorMessage(err);
        const status = extractErrorStatus(err, msg);
        console.warn(`[AI] Free model ${freeModel} failed (${status ?? "err"}):`, msg);
        lastError = err;

        if (isContextTooLongError(status, msg)) {
          freeMessages = compactMessagesForBudget(messages, 9000, 2);
          freeMaxTokens = Math.min(freeMaxTokens, 900);
          try {
            const retryRes = await attemptCompletionStream(openRouter, {
              model: freeModel,
              messages: freeMessages,
              temperature,
              max_tokens: freeMaxTokens,
            });
            return { response: retryRes, activeModel: freeModel };
          } catch (retryErr: any) {
            lastError = retryErr;
          }
        } else if (isRateLimitError(status, msg)) {
          await sleep(450);
        }
      }
    }
  }

  // 3. Direct OpenAI fallback (if OPENAI_API_KEY is configured cleanly)
  if (isOpenAiActive) {
    const openAiClient = getAiClient("openai");
    const openAiModels = ["gpt-4o-mini", "gpt-3.5-turbo"];
    const directMessages = compactMessagesForBudget(messages, 24000, 6);

    for (const model of openAiModels) {
      try {
        console.log(`[AI] Attempting direct OpenAI fallback: ${model}`);
        const response = await attemptCompletionStream(openAiClient, {
          model,
          messages: directMessages,
          temperature,
          max_tokens: Math.min(max_tokens, 1600),
        });
        return { response, activeModel: model };
      } catch (err: any) {
        console.warn(`[AI] Direct OpenAI ${model} failed:`, getErrorMessage(err));
        lastError = err;
      }
    }
  }

  throw lastError || new Error("All AI models in the fallback chain were unavailable.");
}

export function toFriendlyAiErrorMessage(err: any): string {
  const msg = getErrorMessage(err);
  const status = extractErrorStatus(err, msg);

  if (isCreditOrUpgradeError(status, msg) || isRateLimitError(status, msg)) {
    return "The AI tutor is currently experiencing high traffic. Please wait a few seconds and try again.";
  }

  if (isContextTooLongError(status, msg)) {
    return "Your request was a bit too long for the AI to process at once. Please try a shorter question.";
  }

  return "Unable to reach the AI tutor right now. Please try again in a moment.";
}
