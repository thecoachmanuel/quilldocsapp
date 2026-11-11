import OpenAI from "openai";
import fs from "fs";
import path from "path";

// OpenRouter API client
const openRouterKey = process.env.OPENROUTER_API_KEY;
const openAiKey = process.env.OPENAI_API_KEY;

export const isOpenRouterActive = Boolean(
  openRouterKey && !openRouterKey.includes("<your")
);

export const isAiConfigured = Boolean(
  (openRouterKey && !openRouterKey.includes("<your")) ||
  (openAiKey && !openAiKey.includes("<your"))
);

// High-capacity, intelligent models ranked for document QA and throughput
export const FALLBACK_MODELS = [
  process.env.AI_MODEL || "google/gemini-2.5-flash",
  "openai/gpt-4o-mini",
  "deepseek/deepseek-chat",
];

export function getAiClient() {
  if (isOpenRouterActive) {
    return new OpenAI({
      apiKey: openRouterKey,
      baseURL: "https://openrouter.ai/api/v1",
      defaultHeaders: {
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
        "X-Title": "Quill - AI PDF Assistant",
      },
    });
  }

  // Fallback to direct OpenAI if only OPENAI_API_KEY is supplied
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
export async function extractPdfText(fileUrl: string): Promise<string> {
  if (docTextCache.has(fileUrl)) {
    return docTextCache.get(fileUrl)!;
  }

  try {
    const parsed = await parseDocument(fileUrl);
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
    const parsed = await parseDocument(fileUrl);
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

/**
 * Robust chat completion with automated fallback to alternative models
 * Ensures million-user scale without quota crashes or single-provider outages.
 */
export async function createCompletionWithFallback({
  messages,
  temperature = 0.2,
  max_tokens = 2000,
}: {
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  temperature?: number;
  max_tokens?: number;
}) {
  const ai = getAiClient();
  const modelsToTry = isOpenRouterActive ? FALLBACK_MODELS : ["gpt-3.5-turbo"];

  let lastError: any = null;

  for (const model of modelsToTry) {
    try {
      console.log(`[AI] Attempting completion with model: ${model}`);

      // At most 3 models in fallback array as required by OpenRouter
      const extraParams: any = {};
      if (isOpenRouterActive) {
        extraParams.models = modelsToTry.slice(0, 3);
      }

      const response = await ai.chat.completions.create({
        model,
        messages,
        temperature,
        max_tokens,
        stream: true,
        ...extraParams,
      });

      return { response, activeModel: model };
    } catch (err: any) {
      console.warn(`[AI] Model ${model} error:`, err?.message || err);
      lastError = err;
    }
  }

  throw lastError || new Error("All AI models in the fallback chain were unavailable.");
}
