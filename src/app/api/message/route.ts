import { db } from "@/db";
import { SendMessageValidator } from "@/lib/validators/SendMessageValidator";
import { getKindeServerSession } from "@/lib/kinde";
import { getUserSubscriptionPlan } from "@/lib/subscription";
import { pinecone, isPineconeConfigured } from "@/lib/pinecone";
import { OpenAIEmbeddings } from "langchain/embeddings/openai";
import { PineconeStore } from "langchain/vectorstores/pinecone";
import {
  buildStructuredDocumentContext,
  createCompletionWithFallback,
  isAiConfigured,
} from "@/lib/ai";
import { parseDocument } from "@/lib/document-parser";
import {
  isHolisticMultiDocQuery,
  resolveMultiDocumentIntent,
} from "@/lib/multi-doc";
import { NextRequest } from "next/server";
import { OpenAIStream, StreamingTextResponse } from "ai";

interface PerDocContextResult {
  file: any;
  context: string;
  totalPages: number | null;
  unitLabel: "Page" | "Slide";
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { getUser } = getKindeServerSession();
    const user = await getUser();
    const userId = user?.id;

    if (!userId) {
      console.log("[message/route] Unauthorized: No user found");
      return new Response("Unauthorized", { status: 401 });
    }

    const subscriptionPlan = await getUserSubscriptionPlan();
    const isPro = Boolean(subscriptionPlan?.isSubscribed);

    const { fileId, message, fileIds: explicitFileIds } =
      SendMessageValidator.parse(body);

    if (!message.trim()) {
      return new Response("Message cannot be empty", { status: 400 });
    }

    const isMultiSession = fileId.startsWith("multi_");

    // Retrieve all user files ordered newest-first for ownership checks and multi-doc resolution
    const allUserFiles = await db.file.findMany({
      where: {
        userId,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    let activeFiles: any[] = [];
    if (explicitFileIds && explicitFileIds.length > 0) {
      // Preserve explicit ordering from client while verifying ownership
      const fileById = new Map(allUserFiles.map((f: any) => [f.id, f]));
      activeFiles = explicitFileIds
        .map((id) => fileById.get(id))
        .filter(Boolean);
    } else if (isMultiSession) {
      // File IDs may themselves contain "_", so match each owned ID with delimiter guards
      const sessionBody = `_${fileId.slice("multi_".length)}_`;
      activeFiles = allUserFiles.filter((f: any) =>
        sessionBody.includes(`_${f.id}_`)
      );
    } else {
      activeFiles = allUserFiles.filter((f: any) => f.id === fileId);
    }

    if (activeFiles.length === 0) {
      console.log(`[message/route] Files not found for: ${fileId}`);
      return new Response("Files not found", { status: 404 });
    }

    // Retrieve the most recent conversation history BEFORE saving the new message
    // (avoids duplicating the current prompt and preserves newest turns)
    const rawRecentMessages = await db.message.findMany({
      where: {
        fileId,
        userId,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: isPro ? 10 : 6,
    });
    const recentHistory = [...rawRecentMessages].reverse();

    // Auto-detect when a user asks to chat across multiple documents from a single-doc chat
    let autoMultiDocInfo: {
      isAutoMultiDoc: boolean;
      reason: string;
    } = { isAutoMultiDoc: false, reason: "single" };

    if (!isMultiSession && activeFiles.length === 1) {
      const resolution = resolveMultiDocumentIntent({
        message,
        prevMessages: recentHistory,
        primaryFile: activeFiles[0],
        allUserFiles,
        maxAutoFiles: isPro ? 6 : 4,
      });

      if (resolution.isAutoMultiDoc) {
        activeFiles = resolution.activeFiles;
        autoMultiDocInfo = {
          isAutoMultiDoc: true,
          reason: resolution.reason,
        };
      }
    }

    const isMultiDoc = activeFiles.length > 1;
    const holisticQuery = isHolisticMultiDocQuery(message);

    console.log(
      `[message/route] Query for fileId: ${fileId} (${activeFiles.length} active files, autoMulti=${autoMultiDocInfo.isAutoMultiDoc}:${autoMultiDocInfo.reason}, holistic=${holisticQuery}, Plan: ${isPro ? "Pro" : "Free"})`
    );

    // 1. Save user message to database
    await db.message.create({
      data: {
        text: message,
        isUserMessage: true,
        userId,
        fileId,
      },
    });

    // 2. Hybrid Per-Document Retrieval:
    // Every participating document is guaranteed structured context even if Pinecone has
    // partial or empty vectors for some files or the query is holistic ("compare/summarize").
    const totalContextBudget = isPro ? 72000 : 28000;
    const maxCharsPerDoc = Math.max(
      4500,
      Math.floor(totalContextBudget / activeFiles.length)
    );
    const maxVectorMatchesPerDoc = isMultiDoc
      ? Math.max(3, Math.floor((isPro ? 18 : 10) / activeFiles.length))
      : isPro
      ? 8
      : 5;

    let embeddings: OpenAIEmbeddings | null = null;
    let pineconeIndex: any = null;

    if (isPineconeConfigured) {
      const apiKey =
        process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY;
      const isUsingOpenRouter =
        !process.env.OPENAI_API_KEY && Boolean(process.env.OPENROUTER_API_KEY);

      if (apiKey) {
        try {
          embeddings = new OpenAIEmbeddings(
            {
              openAIApiKey: apiKey,
              modelName: isUsingOpenRouter
                ? "openai/text-embedding-ada-002"
                : "text-embedding-ada-002",
            },
            isUsingOpenRouter
              ? { basePath: "https://openrouter.ai/api/v1" }
              : undefined
          );
          pineconeIndex = pinecone.Index("quill");
        } catch (embedInitErr) {
          console.warn(
            "[message/route] Embeddings init warning, using document extraction:",
            embedInitErr
          );
        }
      }
    }

    const perDocResults: PerDocContextResult[] = await Promise.all(
      activeFiles.map(async (docFile: any) => {
        const parsedMeta = await parseDocument(docFile.url).catch(() => null);
        const totalPages =
          parsedMeta?.totalPages ||
          parsedMeta?.totalSlides ||
          (parsedMeta?.pages ? parsedMeta.pages.length : null) ||
          (parsedMeta?.slides ? parsedMeta.slides.length : null);
        const unitLabel: "Page" | "Slide" =
          parsedMeta?.fileType === "pptx" ? "Slide" : "Page";

        let vectorChunks: string[] = [];

        if (embeddings && pineconeIndex) {
          try {
            const pineconeStore = await PineconeStore.fromExistingIndex(
              embeddings,
              {
                pineconeIndex,
                namespace: docFile.id,
              }
            );
            const matches = await pineconeStore.similaritySearch(
              message,
              maxVectorMatchesPerDoc
            );

            vectorChunks = matches
              .filter((m) => m.pageContent && m.pageContent.trim().length > 0)
              .map((m) => {
                let pageNum = Number(m.metadata?.pageNumber) || null;
                if (pageNum && totalPages && pageNum > totalPages) {
                  pageNum = totalPages;
                }
                const unit = m.metadata?.type || unitLabel;
                const tag = isMultiDoc
                  ? pageNum
                    ? `[Source: ${docFile.name} • ${unit} ${pageNum}]`
                    : `[Source: ${docFile.name}]`
                  : pageNum
                  ? `[${unit} ${pageNum}]`
                  : "";
                return tag ? `${tag}\n${m.pageContent}` : m.pageContent;
              });
          } catch (vecErr) {
            console.warn(
              `[message/route] Vector search fallback for ${docFile.name} (${docFile.id}):`,
              vecErr
            );
          }
        }

        const vectorText = vectorChunks.join("\n\n---\n\n");

        // Use structured extraction whenever vector hits are missing, too short,
        // or the user asked a holistic/comparative question requiring full coverage.
        if (vectorChunks.length === 0 || holisticQuery || vectorText.length < 500) {
          const structured = await buildStructuredDocumentContext({
            fileUrl: docFile.url,
            fileName: docFile.name,
            query: message,
            maxChars: maxCharsPerDoc,
            isMultiDoc,
            holistic: holisticQuery,
          });

          let combinedDocContext = structured.context;
          if (
            vectorChunks.length > 0 &&
            structured.context.length < maxCharsPerDoc * 0.75
          ) {
            const remainingBudget = maxCharsPerDoc - structured.context.length - 40;
            const extraVector = vectorChunks
              .filter((chunk) => {
                const snippet = chunk.split("\n")[1]?.slice(0, 80) || "";
                return snippet && !structured.context.includes(snippet);
              })
              .join("\n\n---\n\n")
              .slice(0, Math.max(0, remainingBudget));

            if (extraVector.trim()) {
              combinedDocContext = combinedDocContext
                ? `${combinedDocContext}\n\n---\n\n${extraVector}`
                : extraVector;
            }
          }

          return {
            file: docFile,
            context:
              combinedDocContext ||
              vectorText ||
              "No readable text could be extracted from this document.",
            totalPages: totalPages ?? structured.totalPages,
            unitLabel: parsedMeta ? unitLabel : structured.unitLabel,
          };
        }

        return {
          file: docFile,
          context: vectorText,
          totalPages,
          unitLabel,
        };
      })
    );

    const context = isMultiDoc
      ? perDocResults
          .map((res, idx) => {
            const countText = res.totalPages
              ? ` (${res.totalPages} ${res.unitLabel.toLowerCase()}${
                  res.totalPages === 1 ? "" : "s"
                })`
              : "";
            return `=== DOCUMENT ${idx + 1} of ${perDocResults.length}: "${
              res.file.name
            }"${countText} ===\n${res.context}\n=== END DOCUMENT ${idx + 1} ===`;
          })
          .join("\n\n")
      : perDocResults[0]?.context || "";

    console.log(
      `[message/route] Built context (${context.length} chars across ${perDocResults.length} docs)`
    );

    const formattedPrevMessages = recentHistory.map((msg: any) => ({
      role: msg.isUserMessage ? ("user" as const) : ("assistant" as const),
      content: msg.text,
    }));

    // 3. Local preview fallback if AI credentials are missing
    if (!isAiConfigured) {
      const preview = context
        ? context.slice(0, 300).replace(/\s+/g, " ") + "..."
        : "Document loaded.";

      const devReply = `**[QuillDocs AI]** I received your question: *"${message}"*\n\nDocument text preview:\n> "${preview}"\n\nAI service is currently initializing. Please try again in a few moments.`;

      await db.message.create({
        data: {
          text: devReply,
          isUserMessage: false,
          fileId,
          userId,
        },
      });

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(devReply));
          controller.close();
        },
      });
      return new StreamingTextResponse(stream);
    }

    // 4. Build system prompt with complete document awareness & citation constraints
    const docInventoryLines = perDocResults
      .map((res, idx) => {
        const pageInfo = res.totalPages
          ? ` — ${res.totalPages} ${res.unitLabel.toLowerCase()}${
              res.totalPages === 1 ? "" : "s"
            }`
          : "";
        return `${idx + 1}. "${res.file.name}"${pageInfo}`;
      })
      .join("\n");

    const unloadedLibraryFiles = allUserFiles.filter(
      (f: any) =>
        f.uploadStatus !== "FAILED" &&
        !activeFiles.some((active: any) => active.id === f.id)
    );

    const unloadedLibraryNote =
      unloadedLibraryFiles.length > 0
        ? `\nOther uploaded documents in user's library (NOT loaded in this context): ${unloadedLibraryFiles
            .slice(0, 12)
            .map((f: any) => `"${f.name}"`)
            .join(", ")}.`
        : "";

    const primaryResult = perDocResults[0];
    const singlePageConstraint =
      !isMultiDoc && primaryResult?.totalPages
        ? `- Exact length: "${primaryResult.file.name}" has exactly ${
            primaryResult.totalPages
          } ${primaryResult.unitLabel.toLowerCase()}${
            primaryResult.totalPages === 1 ? "" : "s"
          }. Never cite any ${primaryResult.unitLabel.toLowerCase()} number greater than ${
            primaryResult.totalPages
          }.`
        : "";

    const autoMultiNote = autoMultiDocInfo.isAutoMultiDoc
      ? `\n- Multi-Doc Auto-Activation: The user initiated this question from a single-document view, and you automatically brought in their relevant uploaded document(s) so you can answer seamlessly across all of them.`
      : "";

    const systemPrompt = isMultiDoc
      ? `You are Quill, an expert AI research assistant operating in Multi-Document Synthesis mode (${
          isPro ? "PRO Tier" : "Standard Tier"
        }).
You are analyzing ${perDocResults.length} participating documents simultaneously:
${docInventoryLines}${unloadedLibraryNote}

Your strict instructions:
- Cross-Document Synthesis: Address EVERY relevant participating document when comparing, summarizing, contrasting, or synthesizing answers. Highlight agreements, contradictions, differences, and complementary insights clearly.
- Attribution Accuracy: Keep facts cleanly attributed to the exact document they come from—never blend or misattribute details between documents.
- Precision Clickable Citations: Always cite claims using the exact filename and page/slide number formatted as [ExactFileName.ext • Page X] or [ExactFileName.ext • Slide Y] (matching the headers in context). Never cite a page/slide number higher than a document's stated total.
- Single-Source Questions in Multi-Doc Mode: If a question only appears in some of the documents, state clearly which document(s) contain the answer and which do not.
- Library Awareness: If the user asks about another library file listed above that is NOT loaded, tell them its exact name and suggest clicking "Add Document" / asking directly by filename.${autoMultiNote}
- Ground all facts strictly in the provided document contexts.`
      : isPro
      ? `You are Quill, an advanced expert AI document tutor operating in PRO High-Quality mode.
Current Document: "${primaryResult?.file?.name || "Document"}"${
          primaryResult?.totalPages
            ? ` (${
                primaryResult.totalPages
              } ${primaryResult.unitLabel.toLowerCase()}${
                primaryResult.totalPages === 1 ? "" : "s"
              })`
            : ""
        }${unloadedLibraryNote}

Your goal is to provide exceptional, comprehensive, and deeply analytical insights from the provided document:
- Deliver thorough, structured explanations with key takeaways, deep technical context, and precise details.
- Formatting & Citations: Always format with clean Markdown. Include clickable citations like [${
          primaryResult?.unitLabel || "Page"
        } X] whenever available so the user can jump directly to the source.
${singlePageConstraint}
- Other Documents Awareness: Stay focused on the current document unless the user explicitly asks about another uploaded document. If they ask about an unloaded library document listed above, mention it by name and let them know they can ask directly by its name or click "Add Docs" to enter Multi-Doc Chat.
- Ground all facts strictly in the document context.`
      : `You are Quill, an expert AI document assistant.
Current Document: "${primaryResult?.file?.name || "Document"}"${
          primaryResult?.totalPages
            ? ` (${
                primaryResult.totalPages
              } ${primaryResult.unitLabel.toLowerCase()}${
                primaryResult.totalPages === 1 ? "" : "s"
              })`
            : ""
        }${unloadedLibraryNote}

Your goal is to help the user understand their uploaded document:
- Provide clear, direct, and concise answers based strictly on the document context.
- Formatting & Citations: Use Markdown and cite references like [${
          primaryResult?.unitLabel || "Page"
        } X] where identifiable.
${singlePageConstraint}
- Other Documents Awareness: If the user asks about an unloaded library document listed above, mention it by exact name and let them know they can reference it directly or tap "Add Docs" for Multi-Doc Chat.`;

    const messages = [
      {
        role: "system" as const,
        content: systemPrompt,
      },
      ...formattedPrevMessages,
      {
        role: "user" as const,
        content: `DOCUMENT CONTEXT:\n${context || "No text available."}\n\nUSER QUESTION: ${message}`,
      },
    ];

    const { response, activeModel } = await createCompletionWithFallback({
      messages,
      temperature: isPro ? 0.15 : 0.2,
      max_tokens: isPro ? 3200 : 1400,
    });

    console.log(
      `[message/route] Generating answer with model: ${activeModel} (multiDoc=${isMultiDoc}, autoMulti=${autoMultiDocInfo.isAutoMultiDoc}, ${
        isPro ? "PRO Tier" : "Free Tier"
      })`
    );

    const stream = OpenAIStream(response as any, {
      async onCompletion(completion) {
        await db.message.create({
          data: {
            text: completion,
            isUserMessage: false,
            fileId,
            userId,
          },
        });
      },
    });

    const responseHeaders: Record<string, string> = {};
    if (autoMultiDocInfo.isAutoMultiDoc) {
      responseHeaders["X-Quill-Multi-Docs"] = activeFiles
        .map((f: any) => f.id)
        .join(",");
      responseHeaders["X-Quill-Multi-Names"] = encodeURIComponent(
        JSON.stringify(activeFiles.map((f: any) => f.name))
      );
    }

    return new StreamingTextResponse(stream, { headers: responseHeaders });
  } catch (error: any) {
    console.error("[message/route] Error:", error);
    return new Response(
      `Error generating AI response: ${error?.message || "Internal server error"}`,
      { status: 500 }
    );
  }
}
