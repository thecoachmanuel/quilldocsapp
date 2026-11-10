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

/**
 * Smart context selector: retrieves the most relevant content from the document
 * If document is small enough to fit in the context window (up to 40,000 chars ~ 10k tokens), returns the whole text.
 * Otherwise, performs high-density section extraction based on question keywords.
 */
export function getSmartContext(fullText: string, query: string, maxChars = 35000): string {
  if (!fullText) return "";
  if (fullText.length <= maxChars) {
    return fullText;
  }

  // Split into paragraphs / sections
  const paragraphs = fullText.split(/\n\s*\n/).filter((p) => p.trim().length > 30);
  const queryTerms = query
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .split(" ")
    .filter((w) => w.length > 2);

  // Score each paragraph by query term matches
  const scored = paragraphs.map((para) => {
    const lower = para.toLowerCase();
    let score = 0;
    for (const term of queryTerms) {
      if (lower.includes(term)) score += 1;
    }
    return { para, score };
  });

  // Sort by score
  scored.sort((a, b) => b.score - a.score);

  let result = "";
  for (const item of scored) {
    if (result.length + item.para.length > maxChars) break;
    result += item.para + "\n\n";
  }

  return result || fullText.slice(0, maxChars);
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
