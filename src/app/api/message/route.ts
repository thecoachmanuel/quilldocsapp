import { db } from "@/db";
import { SendMessageValidator } from "@/lib/validators/SendMessageValidator";
import { getKindeServerSession } from "@/lib/kinde";
import { getUserSubscriptionPlan } from "@/lib/subscription";
import { pinecone, isPineconeConfigured } from "@/lib/pinecone";
import { OpenAIEmbeddings } from "langchain/embeddings/openai";
import { PineconeStore } from "langchain/vectorstores/pinecone";
import {
  extractPdfText,
  getSmartContext,
  createCompletionWithFallback,
  isAiConfigured,
} from "@/lib/ai";
import { parseDocument } from "@/lib/document-parser";
import { NextRequest, NextResponse } from "next/server";
import { OpenAIStream, StreamingTextResponse } from "ai";

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

    const isMultiSession = fileId.startsWith("multi_");

    // Retrieve the user's files (ownership check for every participating document)
    const allUserFiles = await db.file.findMany({
      where: {
        userId,
      },
    });

    let activeFiles: any[] = [];
    if (explicitFileIds && explicitFileIds.length > 0) {
      // Preferred: client sends the exact list of participating file IDs
      activeFiles = allUserFiles.filter((f: any) =>
        explicitFileIds.includes(f.id)
      );
    } else if (isMultiSession) {
      // Fallback: file IDs may themselves contain "_" (e.g. file_123_abc),
      // so match each owned file ID against the session string instead of splitting it.
      const sessionBody = `_${fileId.slice("multi_".length)}_`;
      activeFiles = allUserFiles.filter((f: any) =>
        sessionBody.includes(`_${f.id}_`)
      );
    } else {
      activeFiles = allUserFiles.filter((f: any) => f.id === fileId);
    }

    console.log(
      `[message/route] Query for fileId: ${fileId} (${
        activeFiles.length
      } files), message: "${message}" (Plan: ${isPro ? "Pro" : "Free"})`
    );

    if (activeFiles.length === 0) {
      console.log(`[message/route] Files not found for: ${fileId}`);
      return new Response("Files not found", { status: 404 });
    }

    const isMultiDoc = activeFiles.length > 1;

    // 1. Save user message to database
    await db.message.create({
      data: {
        text: message,
        isUserMessage: true,
        userId,
        fileId,
      },
    });

    // Inspect document to obtain true total page/slide count for single file mode
    let totalDocPages: number | null = null;
    let unitLabel = "Page";

    if (!isMultiDoc) {
      const parsedDoc = await parseDocument(activeFiles[0].url).catch(
        () => null
      );
      totalDocPages =
        parsedDoc?.totalPages ||
        parsedDoc?.totalSlides ||
        (parsedDoc?.pages ? parsedDoc.pages.length : null) ||
        (parsedDoc?.slides ? parsedDoc.slides.length : null);
      unitLabel = parsedDoc?.fileType === "pptx" ? "Slide" : "Page";
    }

    // 2. Vector search in Pinecone with fallback to smart context extraction
    let context = "";
    let fullDocumentText = "";

    if (isPineconeConfigured) {
      try {
        const apiKey =
          process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY;
        const isUsingOpenRouter =
          !process.env.OPENAI_API_KEY && Boolean(process.env.OPENROUTER_API_KEY);

        if (apiKey) {
          const embeddings = new OpenAIEmbeddings(
            {
              openAIApiKey: apiKey,
              modelName: isUsingOpenRouter
                ? "openai/text-embedding-ada-002"
                : "text-embedding-ada-002",
            },
            isUsingOpenRouter
              ? {
                  basePath: "https://openrouter.ai/api/v1",
                }
              : undefined
          );

          const pineconeIndex = pinecone.Index("quill");
          const maxPerDoc = isMultiDoc
            ? Math.max(
                2,
                Math.floor((isPro ? 12 : 6) / activeFiles.length)
              )
            : isPro
            ? 8
            : 4;

          const docSearches = await Promise.all(
            activeFiles.map(async (docFile: any) => {
              try {
                const pineconeStore =
                  await PineconeStore.fromExistingIndex(embeddings, {
                    pineconeIndex,
                    namespace: docFile.id,
                  });
                const matches = await pineconeStore.similaritySearch(
                  message,
                  maxPerDoc
                );
                return matches.map((m) => ({
                  pageContent: m.pageContent,
                  metadata: {
                    ...(m.metadata as Record<string, any>),
                    fileName: docFile.name,
                    fileId: docFile.id,
                  } as Record<string, any>,
                }));
              } catch (err) {
                console.warn(
                  `[message/route] Search failed for namespace ${docFile.id}:`,
                  err
                );
                return [];
              }
            })
          );

          const allMatches = docSearches.flat();
          if (allMatches.length > 0) {
            context = allMatches
              .map((r) => {
                const docName = r.metadata?.fileName || "Document";
                let pageNum = r.metadata?.pageNumber;
                if (
                  !isMultiDoc &&
                  pageNum &&
                  totalDocPages &&
                  pageNum > totalDocPages
                ) {
                  pageNum = totalDocPages;
                }
                const unit = r.metadata?.type || "Page";
                const prefix = isMultiDoc
                  ? pageNum
                    ? `[Source: ${docName} • ${unit} ${pageNum}]`
                    : `[Source: ${docName}]`
                  : pageNum
                  ? `[${unit} ${pageNum}]`
                  : "";
                return prefix ? `${prefix}\n${r.pageContent}` : r.pageContent;
              })
              .join("\n\n---\n\n");
            console.log(
              `[message/route] Retrieved ${allMatches.length} Pinecone vector matches across ${activeFiles.length} files`
            );
          }
        }
      } catch (vectorErr) {
        console.warn(
          "[message/route] Pinecone vector search fallback:",
          vectorErr
        );
      }
    }

    // Fallback: If vector search had no matches (or Pinecone wasn't populated yet), use document text extraction
    if (!context) {
      console.log(
        `[message/route] Fallback to document text extraction across ${activeFiles.length} files`
      );
      const maxCharsPerFile = Math.floor(
        (isPro ? 60000 : 20000) / activeFiles.length
      );
      const textParts = await Promise.all(
        activeFiles.map(async (f: any) => {
          const docText = await extractPdfText(f.url);
          const smartCtx = getSmartContext(docText, message, maxCharsPerFile);
          return isMultiDoc
            ? `=== DOCUMENT: ${f.name} ===\n${smartCtx}`
            : smartCtx;
        })
      );
      context = textParts.join("\n\n---\n\n");
    }
    console.log(`[message/route] Active context characters: ${context.length}`);

    // 3. Retrieve conversation history
    const prevMessages = await db.message.findMany({
      where: {
        fileId,
      },
      orderBy: {
        createdAt: "asc",
      },
      take: isPro ? 10 : 6,
    });

    const formattedPrevMessages = prevMessages.map((msg: any) => ({
      role: msg.isUserMessage ? ("user" as const) : ("assistant" as const),
      content: msg.text,
    }));

    // 4. If AI credentials are not configured, stream a helpful local response
    if (!isAiConfigured) {
      const preview = fullDocumentText
        ? fullDocumentText.slice(0, 300).replace(/\s+/g, " ") + "..."
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

    // 5. OpenRouter streaming completion with automated model fallback
    const docNamesList = activeFiles
      .map((f: any, i: number) => `${i + 1}. "${f.name}"`)
      .join(", ");

    const pageConstraint =
      !isMultiDoc && totalDocPages
        ? `- Note: This document has exactly ${totalDocPages} ${unitLabel.toLowerCase()}${
            totalDocPages === 1 ? "" : "s"
          }. Never cite any ${unitLabel.toLowerCase()} number greater than ${totalDocPages}.`
        : "";

    const systemPrompt = isMultiDoc
      ? `You are Quill, an advanced expert AI research tutor operating in Multi-Document Synthesis mode (${
          isPro ? "PRO Tier" : "Standard Tier"
        }).
You are analyzing and synthesizing information across ${activeFiles.length} documents simultaneously:
${docNamesList}

Your instructions:
- Cross-Document Synthesis: Compare, cross-reference, and synthesize answers across all relevant documents. Highlight areas where the documents agree, contradict, or complement each other.
- Precision Citations: Always cite the source document name and page/slide so the user can verify, e.g., [DocumentName.pdf • Page X] or [Presentation.pptx • Slide Y].
- If a question only pertains to one of the documents, answer clearly while indicating which document contains the information.
- Ground all facts strictly in the provided document contexts.`
      : isPro
      ? `You are Quill, an advanced expert AI document tutor operating in PRO High-Quality mode.
Your goal is to provide exceptional, comprehensive, and deeply analytical insights from the provided document.
- Deliver thorough, structured explanations with key takeaways, deep technical context, and precise details.
- Provide comprehensive study guides, chapter breakdowns, and high-difficulty exam preparation questions with in-depth rationales.
- Formatting & Citations: Always format with clean, elegant Markdown. Include citations like [Page X] or [Slide Y] whenever available so the user can easily verify and jump to the source.
${pageConstraint}
- Ground all facts strictly in the document context.`
      : `You are Quill, an expert AI document assistant.
Your goal is to help users understand their uploaded document.
- Provide clear, direct, and concise answers to user questions based on the document.
- Formatting & Citations: Use Markdown and cite references like [Page X] or [Slide Y] where identifiable.
${pageConstraint}`;

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
      max_tokens: isPro ? 3000 : 1200,
    });

    console.log(
      `[message/route] Generating answer with model: ${activeModel} (${
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

    return new StreamingTextResponse(stream);
  } catch (error: any) {
    console.error("[message/route] Error:", error);
    return new Response(
      `Error generating AI response: ${error?.message || "Internal server error"}`,
      { status: 500 }
    );
  }
}
