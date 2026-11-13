import OpenAI from "openai";
import fs from "fs";
import path from "path";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const GEMINI_OPENAI_BASE_URL =
  "https://generativelanguage.googleapis.com/v1beta/openai/";

function parseKeyList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[\r\n,;]+/)
    .map((k) => k.trim().replace(/^["']|["']$/g, ""))
    .filter((k) => Boolean(k) && !k.includes("<your"));
}

function collectEnvKeys(baseNames: string[]): string[] {
  const collected: string[] = [];
  for (const name of baseNames) {
    collected.push(...parseKeyList(process.env[name]));
    collected.push(...parseKeyList(process.env[`${name}S`]));
    for (let i = 1; i <= 15; i++) {
      collected.push(...parseKeyList(process.env[`${name}_${i}`]));
    }
  }
  return Array.from(new Set(collected));
}

export function getOpenRouterKeys(): string[] {
  return collectEnvKeys(["OPENROUTER_API_KEY"]);
}

export function getGeminiKeys(): string[] {
  return collectEnvKeys([
    "GEMINI_API_KEY",
    "GOOGLE_API_KEY",
    "GOOGLE_GENERATIVE_AI_API_KEY",
  ]);
}

export function getOpenAiKeys(): string[] {
  return collectEnvKeys(["OPENAI_API_KEY"]);
}

export const isOpenRouterActive = getOpenRouterKeys().length > 0;
export const isGeminiActive = getGeminiKeys().length > 0;
export const isOpenAiActive = getOpenAiKeys().length > 0;

export const isAiConfigured =
  isOpenRouterActive || isGeminiActive || isOpenAiActive;

export const OPENROUTER_FREE_ROUTER = "openrouter/free";

// High-capacity, cost-efficient models ranked for document QA and throughput
const rawPrimaryModels = [
  process.env.AI_MODEL?.trim(),
  "google/gemini-2.5-flash",
  "openai/gpt-4o-mini",
  "deepseek/deepseek-chat",
].filter((m): m is string => Boolean(m));

export const FALLBACK_MODELS = Array.from(new Set(rawPrimaryModels));

const rawGeminiFreeModels = [
  process.env.GEMINI_MODEL?.trim(),
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
].filter((m): m is string => Boolean(m));

export const GEMINI_FREE_MODELS = Array.from(new Set(rawGeminiFreeModels));

const BACKUP_FREE_OPENROUTER_MODELS = [
  OPENROUTER_FREE_ROUTER,
  "google/gemma-3-27b-it:free",
  "meta-llama/llama-3.3-70b-instruct:free",
  "mistralai/mistral-small-3.1-24b-instruct:free",
  "qwen/qwen-2.5-72b-instruct:free",
];

let cachedFreeModels: { models: string[]; expiresAt: number } | null = null;
const FREE_MODELS_CACHE_TTL_MS = 30 * 60 * 1000;

export function getAiClient(
  provider?: "openrouter" | "gemini" | "openai",
  apiKeyOverride?: string
) {
  const orKeys = getOpenRouterKeys();
  const gmKeys = getGeminiKeys();
  const oaKeys = getOpenAiKeys();

  const resolvedProvider =
    provider ||
    (orKeys.length > 0 ? "openrouter" : gmKeys.length > 0 ? "gemini" : "openai");

  if (resolvedProvider === "openrouter") {
    return new OpenAI({
      apiKey: apiKeyOverride || orKeys[0] || "dummy-key",
      baseURL: OPENROUTER_BASE_URL,
      maxRetries: 0,
      timeout: 22000,
      defaultHeaders: {
        "HTTP-Referer":
          process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
        "X-Title": "Quill - AI PDF Assistant",
      },
    });
  }

  if (resolvedProvider === "gemini") {
    return new OpenAI({
      apiKey: apiKeyOverride || gmKeys[0] || "dummy-key",
      baseURL: GEMINI_OPENAI_BASE_URL,
      maxRetries: 0,
      timeout: 22000,
    });
  }

  return new OpenAI({
    apiKey: apiKeyOverride || oaKeys[0] || "dummy-key",
    maxRetries: 0,
    timeout: 22000,
  });
}

export function getEmbeddingsConfig(): {
  apiKey: string;
  isOpenRouter: boolean;
  modelName: string;
  basePath?: string;
} | null {
  const openAiKey = getOpenAiKeys()[0];
  if (openAiKey) {
    return {
      apiKey: openAiKey,
      isOpenRouter: false,
      modelName: "text-embedding-ada-002",
    };
  }
  const openRouterKey = getOpenRouterKeys()[0];
  if (openRouterKey) {
    return {
      apiKey: openRouterKey,
      isOpenRouter: true,
      modelName: "openai/text-embedding-ada-002",
      basePath: OPENROUTER_BASE_URL,
    };
  }
  return null;
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
    /rate[- ]limit|too many requests|quota exceeded|temporarily rate-limited|resource_exhausted/i.test(
      msg
    )
  );
}

function isAuthError(status: number | null, msg: string): boolean {
  return (
    status === 401 ||
    status === 403 ||
    /invalid[_ ]api[_ ]key|api key not valid|api_key_invalid|incorrect api key|unauthorized|permission_denied/i.test(
      msg
    )
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
          if (/r1|qwq|thinking|reasoning/i.test(id)) return false;
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

type AiProvider = "openrouter" | "gemini" | "openai";

type KeyCooldownBucket = {
  rateLimitedUntil: number;
  paidBlockedUntil: number;
  invalidUntil: number;
};

const RATE_LIMIT_COOLDOWN_MS = 45 * 1000;
const PAID_BLOCKED_COOLDOWN_MS = 5 * 60 * 1000;
const INVALID_KEY_COOLDOWN_MS = 10 * 60 * 1000;

const keyCooldowns = new Map<string, KeyCooldownBucket>();
const providerCursors: Record<AiProvider, number> = {
  openrouter: 0,
  gemini: 0,
  openai: 0,
};

export function resetAiKeyStateForTests() {
  keyCooldowns.clear();
  cachedFreeModels = null;
  providerCursors.openrouter = 0;
  providerCursors.gemini = 0;
  providerCursors.openai = 0;
}

function maskKey(key: string): string {
  if (key.length <= 8) return "***";
  return `${key.slice(0, 5)}...${key.slice(-4)}`;
}

function markKeyCooldown(
  key: string,
  kind: "rateLimitedUntil" | "paidBlockedUntil" | "invalidUntil",
  durationMs: number
) {
  const existing = keyCooldowns.get(key) || {
    rateLimitedUntil: 0,
    paidBlockedUntil: 0,
    invalidUntil: 0,
  };
  existing[kind] = Math.max(existing[kind], Date.now() + durationMs);
  keyCooldowns.set(key, existing);
}

function getOrderedKeys(
  provider: AiProvider,
  keys: string[],
  options?: { excludePaidBlocked?: boolean }
): string[] {
  if (keys.length === 0) return [];

  const start = providerCursors[provider] % keys.length;
  providerCursors[provider] = (providerCursors[provider] + 1) % keys.length;
  const rotated = [...keys.slice(start), ...keys.slice(0, start)];

  const now = Date.now();
  const ready: string[] = [];
  const rateCooled: string[] = [];

  for (const key of rotated) {
    const b = keyCooldowns.get(key);
    if (b?.invalidUntil && b.invalidUntil > now) {
      continue;
    }
    if (options?.excludePaidBlocked && b?.paidBlockedUntil && b.paidBlockedUntil > now) {
      continue;
    }
    if (b?.rateLimitedUntil && b.rateLimitedUntil > now) {
      rateCooled.push(key);
    } else {
      ready.push(key);
    }
  }

  if (ready.length > 0 || rateCooled.length > 0) {
    return [...ready, ...rateCooled];
  }

  // If every key was excluded only for auth errors, avoid returning blocked paid keys
  if (options?.excludePaidBlocked) {
    return rotated.filter((k) => {
      const b = keyCooldowns.get(k);
      return !(b?.paidBlockedUntil && b.paidBlockedUntil > now);
    });
  }
  return rotated;
}

function recordKeyFailure(key: string, status: number | null, msg: string) {
  if (isAuthError(status, msg)) {
    markKeyCooldown(key, "invalidUntil", INVALID_KEY_COOLDOWN_MS);
  } else if (isCreditOrUpgradeError(status, msg)) {
    markKeyCooldown(key, "paidBlockedUntil", PAID_BLOCKED_COOLDOWN_MS);
  } else if (isRateLimitError(status, msg)) {
    markKeyCooldown(key, "rateLimitedUntil", RATE_LIMIT_COOLDOWN_MS);
  }
}

async function runProviderModelFallback({
  provider,
  providerLabel,
  keys,
  models,
  messages,
  temperature,
  maxTokens,
  compactContextChars,
  compactHistoryTurns,
}: {
  provider: AiProvider;
  providerLabel: string;
  keys: string[];
  models: string[];
  messages: ChatMessageParam[];
  temperature: number;
  maxTokens: number;
  compactContextChars: number;
  compactHistoryTurns: number;
}): Promise<{ response?: any; activeModel?: string; lastError: any }> {
  let lastError: any = null;
  let currentMessages = compactMessagesForBudget(
    messages,
    compactContextChars,
    compactHistoryTurns
  );
  let currentMaxTokens = maxTokens;

  for (const model of models) {
    const orderedKeys = getOrderedKeys(provider, keys);
    let modelHadRateLimitOnly = true;

    for (const key of orderedKeys) {
      const client = getAiClient(provider, key);
      try {
        console.log(
          `[AI] Attempting ${providerLabel} model ${model} (key ${maskKey(key)})`
        );
        const response = await attemptCompletionStream(client, {
          model,
          messages: currentMessages,
          temperature,
          max_tokens: currentMaxTokens,
        });
        return { response, activeModel: model, lastError: null };
      } catch (err: any) {
        const msg = getErrorMessage(err);
        const status = extractErrorStatus(err, msg);
        console.warn(
          `[AI] ${providerLabel} ${model} failed on key ${maskKey(key)} (${status ?? "err"}):`,
          msg
        );
        lastError = err;
        recordKeyFailure(key, status, msg);

        if (isContextTooLongError(status, msg)) {
          modelHadRateLimitOnly = false;
          currentMessages = compactMessagesForBudget(
            messages,
            Math.min(9000, Math.floor(compactContextChars / 2)),
            2
          );
          currentMaxTokens = Math.min(currentMaxTokens, 900);
          try {
            const retryRes = await attemptCompletionStream(client, {
              model,
              messages: currentMessages,
              temperature,
              max_tokens: currentMaxTokens,
            });
            return { response: retryRes, activeModel: model, lastError: null };
          } catch (retryErr: any) {
            const retryMsg = getErrorMessage(retryErr);
            const retryStatus = extractErrorStatus(retryErr, retryMsg);
            lastError = retryErr;
            recordKeyFailure(key, retryStatus, retryMsg);
          }
        } else if (!isRateLimitError(status, msg)) {
          modelHadRateLimitOnly = false;
        }
      }
    }

    if (modelHadRateLimitOnly && models.length > 1) {
      await sleep(250);
    }
  }

  return { lastError };
}

/**
 * Robust chat completion with multi-key round-robin & cooldown rotation,
 * adaptive OpenRouter credit/token clamping, OpenRouter `:free` router fallback,
 * free Google Gemini API key pool fallback, and optional direct OpenAI fallback.
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
  const openRouterKeys = getOpenRouterKeys();
  const geminiKeys = getGeminiKeys();
  const openAiKeys = getOpenAiKeys();

  if (openRouterKeys.length > 0) {
    let currentMessages = messages;
    const currentMaxTokens = max_tokens;

    // 1. Primary/cost-efficient OpenRouter models across all OpenRouter keys
    for (const model of FALLBACK_MODELS) {
      const paidKeys = getOrderedKeys("openrouter", openRouterKeys, {
        excludePaidBlocked: true,
      });
      if (paidKeys.length === 0) break;

      for (const key of paidKeys) {
        const openRouter = getAiClient("openrouter", key);
        try {
          console.log(
            `[AI] Attempting OpenRouter model: ${model} (key ${maskKey(key)})`
          );
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
          console.warn(
            `[AI] Model ${model} failed on key ${maskKey(key)} (${status ?? "err"}):`,
            msg
          );
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
                  `[AI] Retrying ${model} on key ${maskKey(key)} with clamped max_tokens=${clampedTokens}`
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
                recordKeyFailure(key, retryStatus, retryMsg);
              }
            } else {
              markKeyCooldown(key, "paidBlockedUntil", PAID_BLOCKED_COOLDOWN_MS);
            }
          } else if (isContextTooLongError(status, msg)) {
            const compactedMsgs = compactMessagesForBudget(
              currentMessages,
              14000,
              4
            );
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
              const retryMsg = getErrorMessage(retryErr);
              const retryStatus = extractErrorStatus(retryErr, retryMsg);
              lastError = retryErr;
              recordKeyFailure(key, retryStatus, retryMsg);
            }
          } else {
            recordKeyFailure(key, status, msg);
          }
        }
      }
    }

    // 2. Zero-credit OpenRouter `:free` router & models across ALL OpenRouter keys
    const freeCandidates = await getFreeOpenRouterCandidates();
    const freeRes = await runProviderModelFallback({
      provider: "openrouter",
      providerLabel: "OpenRouter free",
      keys: openRouterKeys,
      models: freeCandidates,
      messages,
      temperature,
      maxTokens: Math.min(max_tokens, 3200),
      compactContextChars: 20000,
      compactHistoryTurns: 6,
    });
    if (freeRes.response && freeRes.activeModel) {
      return { response: freeRes.response, activeModel: freeRes.activeModel };
    }
    if (freeRes.lastError) lastError = freeRes.lastError;
  }

  // 3. Google Gemini Free Tier fallback across multiple Gemini API keys
  if (geminiKeys.length > 0) {
    const geminiRes = await runProviderModelFallback({
      provider: "gemini",
      providerLabel: "Gemini free",
      keys: geminiKeys,
      models: GEMINI_FREE_MODELS,
      messages,
      temperature,
      maxTokens: Math.min(max_tokens, 3600),
      compactContextChars: 36000,
      compactHistoryTurns: 8,
    });
    if (geminiRes.response && geminiRes.activeModel) {
      return {
        response: geminiRes.response,
        activeModel: geminiRes.activeModel,
      };
    }
    if (geminiRes.lastError) lastError = geminiRes.lastError;
  }

  // 4. Direct OpenAI fallback (across any configured OPENAI_API_KEY / _1..N)
  if (openAiKeys.length > 0) {
    const openAiRes = await runProviderModelFallback({
      provider: "openai",
      providerLabel: "Direct OpenAI",
      keys: openAiKeys,
      models: ["gpt-4o-mini", "gpt-3.5-turbo"],
      messages,
      temperature,
      maxTokens: Math.min(max_tokens, 3200),
      compactContextChars: 24000,
      compactHistoryTurns: 6,
    });
    if (openAiRes.response && openAiRes.activeModel) {
      return {
        response: openAiRes.response,
        activeModel: openAiRes.activeModel,
      };
    }
    if (openAiRes.lastError) lastError = openAiRes.lastError;
  }

  throw (
    lastError || new Error("All AI models in the fallback chain were unavailable.")
  );
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
