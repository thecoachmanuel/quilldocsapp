import { db } from "@/db";
import { pinecone, isPineconeConfigured } from "@/lib/pinecone";
import { parseDocument } from "@/lib/document-parser";
import { OpenAIEmbeddings } from "langchain/embeddings/openai";
import { PineconeStore } from "langchain/vectorstores/pinecone";
import { Document } from "langchain/document";

/**
 * Vectorizes a document (PDF, DOCX, or PPTX) into 1536-dimensional embeddings
 * and indexes the chunks into Pinecone using the file's namespace.
 */
export async function vectorizeAndIndexDocument({
  fileId,
  fileUrl,
  fileName,
}: {
  fileId: string;
  fileUrl: string;
  fileName: string;
}) {
  try {
    console.log(`[vectorize] Starting vectorization for file ${fileId} (${fileName})`);

    // 1. Parse document into text, slides, and metadata
    const parsed = await parseDocument(fileUrl, fileName);
    const docs: Document[] = [];

    if (parsed.slides && parsed.slides.length > 0) {
      // Presentation slides: 1 chunk per slide with full metadata
      for (const slide of parsed.slides) {
        const content = slide.rawText || (slide.content || []).join("\n");
        if (content.trim()) {
          docs.push(
            new Document({
              pageContent: content.trim(),
              metadata: {
                fileId,
                fileName,
                pageNumber: slide.slideNumber,
                type: "Slide",
                title: slide.title || `Slide ${slide.slideNumber}`,
              },
            })
          );
        }
      }
    } else if (parsed.pages && parsed.pages.length > 0) {
      // PDF or Word DOCX with genuine physical page boundaries
      for (const page of parsed.pages) {
        const pageText = page.text.trim();
        if (!pageText) continue;

        // If a page is longer than 1200 characters, break into smaller chunks,
        // but crucially ALL chunks from this page maintain pageNumber: page.pageNumber!
        if (pageText.length > 1200) {
          const paragraphs = pageText
            .split(/\n\s*\n/)
            .filter((p) => p.trim().length > 15);
          let currentChunk = "";

          for (let i = 0; i < paragraphs.length; i++) {
            const para = paragraphs[i].trim();
            if ((currentChunk + "\n\n" + para).length > 1200) {
              if (currentChunk.trim()) {
                docs.push(
                  new Document({
                    pageContent: currentChunk.trim(),
                    metadata: {
                      fileId,
                      fileName,
                      pageNumber: page.pageNumber,
                      type: "Page",
                    },
                  })
                );
              }
              currentChunk = para;
            } else {
              currentChunk = currentChunk ? `${currentChunk}\n\n${para}` : para;
            }
          }

          if (currentChunk.trim()) {
            docs.push(
              new Document({
                pageContent: currentChunk.trim(),
                metadata: {
                  fileId,
                  fileName,
                  pageNumber: page.pageNumber,
                  type: "Page",
                },
              })
            );
          }
        } else {
          docs.push(
            new Document({
              pageContent: pageText,
              metadata: {
                fileId,
                fileName,
                pageNumber: page.pageNumber,
                type: "Page",
              },
            })
          );
        }
      }
    } else if (parsed.text) {
      // Fallback: If no page breakdown exists, calculate proportional pageNumber clamped to totalPages
      const totalChars = parsed.text.length;
      const totalWords = parsed.totalWords || Math.ceil(totalChars / 5);
      const estimatedTotalPages =
        parsed.totalPages || Math.max(1, Math.ceil(totalWords / 450));
      const charsPerPage = Math.max(
        800,
        Math.ceil(totalChars / estimatedTotalPages)
      );

      const paragraphs = parsed.text
        .split(/\n\s*\n/)
        .filter((p) => p.trim().length > 20);
      let charOffset = 0;
      let currentChunk = "";

      for (let i = 0; i < paragraphs.length; i++) {
        const para = paragraphs[i].trim();
        if ((currentChunk + "\n\n" + para).length > 1200) {
          if (currentChunk.trim()) {
            const calculatedPage = Math.min(
              estimatedTotalPages,
              Math.max(1, Math.floor(charOffset / charsPerPage) + 1)
            );
            docs.push(
              new Document({
                pageContent: currentChunk.trim(),
                metadata: {
                  fileId,
                  fileName,
                  pageNumber: calculatedPage,
                  type: "Page",
                },
              })
            );
            charOffset += currentChunk.length;
          }
          currentChunk = para;
        } else {
          currentChunk = currentChunk ? `${currentChunk}\n\n${para}` : para;
        }
      }

      if (currentChunk.trim()) {
        const calculatedPage = Math.min(
          estimatedTotalPages,
          Math.max(1, Math.floor(charOffset / charsPerPage) + 1)
        );
        docs.push(
          new Document({
            pageContent: currentChunk.trim(),
            metadata: {
              fileId,
              fileName,
              pageNumber: calculatedPage,
              type: "Page",
            },
          })
        );
      }
    }

    if (docs.length === 0) {
      console.warn(`[vectorize] No text could be extracted from file ${fileId}`);
      await db.file.update({
        where: { id: fileId },
        data: { uploadStatus: "SUCCESS" },
      });
      return;
    }

    // 2. Vectorize and index into Pinecone if configured
    if (isPineconeConfigured) {
      const apiKey = process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY;
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
        await PineconeStore.fromDocuments(docs, embeddings, {
          pineconeIndex,
          namespace: fileId,
        });

        console.log(
          `[vectorize] Successfully indexed ${docs.length} vectors into Pinecone (namespace: ${fileId})`
        );
      }
    }

    // 3. Update file status to SUCCESS
    await db.file.update({
      where: { id: fileId },
      data: { uploadStatus: "SUCCESS" },
    });
  } catch (err: any) {
    console.error(`[vectorize] Error vectorizing file ${fileId}:`, err);
    // Ensure file status is marked SUCCESS so user can still chat using fallback text extraction
    await db.file.update({
      where: { id: fileId },
      data: { uploadStatus: "SUCCESS" },
    });
  }
}

