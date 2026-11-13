import { db } from "@/db";
import { SendMessageValidator } from "@/lib/validators/SendMessageValidator";
import { getUserSessionWithRBAC } from "@/lib/auth-rbac";
import { getUserSubscriptionPlan } from "@/lib/subscription";
import { pinecone, isPineconeConfigured } from "@/lib/pinecone";
import { OpenAIEmbeddings } from "langchain/embeddings/openai";
import { PineconeStore } from "langchain/vectorstores/pinecone";
import {
  buildStructuredDocumentContext,
  createCompletionWithFallback,
  getEmbeddingsConfig,
  isAiConfigured,
  toFriendlyAiErrorMessage,
} from "@/lib/ai";
import { parseDocument } from "@/lib/document-parser";
import {
  isHolisticMultiDocQuery,
  resolveMultiDocumentIntent,
} from "@/lib/multi-doc";
import { NextRequest } from "next/server";
import { OpenAIStream, StreamingTextResponse } from "ai";
import {
  parseExamData,
  parseFlashcardsData,
  parseQuizData,
} from "@/lib/interactive-content";
import {
  extractRequestedQuestionCounts,
  mergeAndFitExamCounts,
  mergeAndFitFlashcardCounts,
  mergeAndFitQuizCounts,
} from "@/lib/question-count";

export const maxDuration = 60;

async function readStreamToString(
  aiResponse: any,
  onTextChunk?: (accumulated: string) => void
): Promise<string> {
  const raw = OpenAIStream(aiResponse);
  const reader = raw.getReader();
  const decoder = new TextDecoder();
  let acc = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) {
      acc += decoder.decode(value, { stream: true });
      onTextChunk?.(acc);
    }
  }
  acc += decoder.decode();
  return acc;
}

interface PerDocContextResult {
  file: any;
  context: string;
  totalPages: number | null;
  unitLabel: "Page" | "Slide";
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const rbac = await getUserSessionWithRBAC();
    const user = rbac.user;
    const userId = user?.id;

    if (!rbac.isAuthenticated || !userId) {
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

      if (activeFiles.length < explicitFileIds.length && rbac.isAdmin) {
        const fetched = await db.file.findMany({
          where: { id: { in: explicitFileIds } },
        });
        const adminMap = new Map(fetched.map((f: any) => [f.id, f]));
        activeFiles = explicitFileIds
          .map((id) => adminMap.get(id))
          .filter(Boolean);
      }
    } else if (isMultiSession) {
      // File IDs may themselves contain "_", so match each owned ID with delimiter guards
      const sessionBody = `_${fileId.slice("multi_".length)}_`;
      activeFiles = allUserFiles.filter((f: any) =>
        sessionBody.includes(`_${f.id}_`)
      );

      if (activeFiles.length === 0 && rbac.isAdmin) {
        const recentGlobal = await db.file.findMany({
          orderBy: { createdAt: "desc" },
          take: 250,
        });
        activeFiles = recentGlobal.filter((f: any) =>
          sessionBody.includes(`_${f.id}_`)
        );
      }
    } else {
      activeFiles = allUserFiles.filter((f: any) => f.id === fileId);

      if (activeFiles.length === 0 && rbac.isAdmin) {
        const inspectedFile = await db.file.findFirst({
          where: { id: fileId },
        });
        if (inspectedFile) {
          activeFiles = [inspectedFile];
        }
      }
    }

    if (activeFiles.length === 0) {
      console.log(`[message/route] Files not found for: ${fileId}`);
      return new Response("Files not found", { status: 404 });
    }

    const ownerIdForContext = activeFiles[0]?.userId || userId;
    const isAdminInspecting = rbac.isAdmin && ownerIdForContext !== userId;
    const libraryFiles = isAdminInspecting
      ? await db.file.findMany({
          where: { userId: ownerIdForContext },
          orderBy: { createdAt: "desc" },
        })
      : allUserFiles;

    // Retrieve the most recent conversation history BEFORE saving the new message
    // (avoids duplicating the current prompt and preserves newest turns)
    const rawRecentMessages = await db.message.findMany({
      where: isAdminInspecting
        ? {
            fileId,
            userId: { in: [userId, ownerIdForContext] },
          }
        : {
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
        allUserFiles: libraryFiles,
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
    const totalContextBudget = isPro ? 44000 : 22000;
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
      const embedCfg = getEmbeddingsConfig();

      if (embedCfg) {
        try {
          embeddings = new OpenAIEmbeddings(
            {
              openAIApiKey: embedCfg.apiKey,
              modelName: embedCfg.modelName,
            },
            embedCfg.basePath ? { basePath: embedCfg.basePath } : undefined
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
      activeFiles.map(async (docFile: any, docIdx: number) => {
        const docNumber = docIdx + 1;
        const parsedMeta = await parseDocument(docFile.url, docFile.name).catch(() => null);
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
                const unitShort =
                  String(unit).toLowerCase() === "slide" ? "s" : "p";
                const tag = isMultiDoc
                  ? pageNum
                    ? `[${docNumber} · ${unitShort}.${pageNum}]`
                    : `[${docNumber}]`
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
            docIndex: docNumber,
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
            ? ` (${res.totalPages} ${res.unitLabel.toLowerCase()}${res.totalPages === 1 ? "" : "s"
            })`
            : "";
          return `=== DOCUMENT [${idx + 1}]: "${res.file.name
            }"${countText} ===\n${res.context}\n=== END DOCUMENT [${idx + 1}] ===`;
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
          ? ` — ${res.totalPages} ${res.unitLabel.toLowerCase()}${res.totalPages === 1 ? "" : "s"
          }`
          : "";
        return `[${idx + 1}] "${res.file.name}"${pageInfo}`;
      })
      .join("\n");

    const unloadedLibraryFiles = libraryFiles.filter(
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
        ? `- Exact length: "${primaryResult.file.name}" has exactly ${primaryResult.totalPages
        } ${primaryResult.unitLabel.toLowerCase()}${primaryResult.totalPages === 1 ? "" : "s"
        }. Never cite any ${primaryResult.unitLabel.toLowerCase()} number greater than ${primaryResult.totalPages
        }.`
        : "";

    const autoMultiNote = autoMultiDocInfo.isAutoMultiDoc
      ? `\n- Multi-Doc Auto-Activation: The user initiated this question from a single-document view, and you automatically brought in their relevant uploaded document(s) so you can answer seamlessly across all of them.`
      : "";

    const multilingualTutorRule = `- Multilingual Document Understanding & Any-Language Tutoring: Users may upload documents written in ANY language and ask you to teach, explain, translate, or summarize them in ANY language (for example: uploading a French, Arabic, Chinese, Spanish, or Yoruba document and asking to be taught in English, Yoruba, Hausa, Igbo, French, Spanish, Arabic, etc.). Always teach in the exact language the user writes in or requests, breaking down concepts clearly step-by-step like a patient private tutor while keeping key terms and citations accurate.`;

    const mathAndPracticeRule = `- Mathematical & Statistical Rigor & Formatting:
  * Format all mathematical and statistical formulas using standard LaTeX syntax:
    - Use inline math \`$ ... $\` for individual variables, metrics, symbols, and formulas (e.g., \`$H_0: \\mu = 0$\`, \`$\\sigma$\`, \`$\\bar{x}$\`, \`$p < 0.05$\`, \`$z = \\frac{\\bar{x} - \\mu_0}{\\sigma / \\sqrt{n}}$\`, \`$R^2 = 0.89$\`, \`$\\chi^2$\`).
    - Use display block math \`$$ ... $$\` on its own lines for standalone or complex equations.
  * For statistical results, summary statistics, frequency distributions, ANOVA tables, or regression outputs:
    - ALWAYS format tabular data cleanly in standard Markdown tables with column headers (e.g., \`| Variable | Mean | Std Dev | 95% CI | p-value |\`).
    - When discussing hypothesis testing, clearly break down: (1) Null Hypothesis ($H_0$) & Alternative Hypothesis ($H_a$), (2) Test Statistic & degrees of freedom, (3) p-value / critical threshold, and (4) Plain-language conclusion grounded in the document context.
- Interactive Questions & Practice Quizzes:
  * When the user requests questions, practice tests, or quizzes (e.g. "quiz me", "test me", "give me questions on this", "practice questions"):
    - ALWAYS format the questions inside a \`\`\`quiz fenced code block in JSON format with a title, array of questions with 4 well-crafted options, correctIndex (0-based integer of correct option), and detailed explanation:
\`\`\`quiz
{
  "title": "Practice Quiz: [Document / Topic]",
  "questions": [
    {
      "id": 1,
      "question": "Question text here?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctIndex": 2,
      "explanation": "Detailed step-by-step explanation with formulas and reasoning."
    }
  ]
}
\`\`\`
    - Vary \`correctIndex\` naturally across \`0\`, \`1\`, \`2\`, and \`3\` across questions (never place all correct answers at index \`0\`), craft plausible distractors targeting common misconceptions, and escape backslashes properly inside JSON strings (e.g. \`"$\\\\frac{a}{b}$"\`).
    - The interactive UI will automatically render this as a multiple-choice practice quiz where the user picks options, submits for automated scoring, and gets answers with explanations and AI tutor review.
- Interactive Study Flashcards:
  * When the user requests flashcards or key terms to practice (e.g. "make flashcards", "create flashcards", "study cards"):
    - ALWAYS format the flashcards inside a \`\`\`flashcards fenced code block in JSON format:
\`\`\`flashcards
{
  "title": "Study Flashcards: [Topic]",
  "cards": [
    {
      "id": 1,
      "front": "Clear, testable concept, calculation, or recall question prompt",
      "back": "Concise, canonical answer with formula or key definition",
      "hint": "Optional memory cue to aid active recall"
    }
  ]
}
\`\`\`
    - The interactive UI will automatically render this as an active-recall flashcard deck where the user can type answers, check correctness, track score, flip for solutions, and request full AI grading.
- Evaluating User Quiz & Flashcard Submissions:
  * When the user sends a \`QUIZ SUBMISSION\` or \`FLASHCARD SUBMISSION FOR AI GRADING & SOLUTIONS\` message containing their answers:
    - Grade every item accurately and fairly (for typed flashcard responses, accept equivalent phrasing, valid unit conversions, or mathematically equivalent forms).
    - Open with a clear **Final Score** (\`X / Y\` and percentage) and a structured breakdown showing each item's status (**Correct** vs **Incorrect / Needs Review**).
    - Follow with **step-by-step solutions** for every item—especially items missed or skipped—showing the full calculation or reasoning in clean LaTeX and explaining why wrong choices/answers were incorrect.
- Standard Examination Papers (Word .DOCX default; PDF only if requested — ONE format at a time):
  * Whenever the user requests formal/standard **exam questions**, an **examination paper**, **theory / essay questions**, specific counts of **multiple choice (MCQ) + theory** questions, **docx/pdf downloadable questions**, or a **separate solutions / marking scheme**:
    - ALWAYS output ONLY the examination inside a single \`\`\`exam fenced JSON block with ZERO introductory or trailing prose for fast streaming:
\`\`\`exam
{
  "title": "Midterm / Final Examination: [Topic or Document Name]",
  "courseCode": "Optional course/module title",
  "duration": "2 Hours",
  "instructions": [
    "Attempt ALL questions in Section A and answer all questions in Section B.",
    "Show all relevant workings, formulas, and units clearly."
  ],
  "includeSolutions": true,
  "requestedFormats": ["docx"],
  "mcqQuestions": [
    {
      "id": 1,
      "question": "Multiple-choice question stem grounded in document",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctIndex": 2,
      "marks": 1,
      "explanation": "Concise solution for the marking scheme."
    }
  ],
  "theoryQuestions": [
    {
      "id": 1,
      "question": "Rigorous theory/essay prompt grounded in document",
      "subQuestions": ["(a) First sub-part [4 Marks]", "(b) Second sub-part [6 Marks]"],
      "marks": 10,
      "solution": "Concise model solution and marking rubric points."
    }
  ]
}
\`\`\`
    - Always put ONLY ONE format in \`requestedFormats\`: \`["docx"]\` by default (Word document), or \`["pdf"]\` ONLY when the user explicitly requests PDF.
    - Strictly match the exact counts requested by the user (if user asks for 10 MCQs and 4 theory, generate ALL 10 in \`mcqQuestions\` and ALL 4 in \`theoryQuestions\`; if user asks only for theory, leave \`mcqQuestions: []\`; if user explicitly says no solutions, set \`includeSolutions: false\`).
    - Quill's UI renders the single requested format (**Word .docx** or **PDF**) formatted in **Times New Roman, 12pt font, 1.5 line spacing**.`;

    const systemPrompt = isMultiDoc
      ? `You are Quill, an expert multilingual AI document tutor and research assistant operating in Multi-Document Synthesis mode (${isPro ? "PRO Tier" : "Standard Tier"
      }).
You are analyzing ${perDocResults.length} participating documents simultaneously:
${docInventoryLines}${unloadedLibraryNote}

Your strict instructions:
- Cross-Document Synthesis: Address EVERY relevant participating document when comparing, summarizing, contrasting, or synthesizing answers. Highlight agreements, contradictions, differences, and complementary insights clearly.
- Attribution Accuracy: Keep facts cleanly attributed to the exact document they come from—never blend or misattribute details between documents.
- Simple Compact Citations: Cite claims using ONLY concise numbered tags like [1 · p.3] (Page 3 of Document [1]) or [2 · s.5] (Slide 5 of Document [2]). Cite multiple sources side-by-side cleanly as [1 · p.3] [2 · s.5]. Do NOT write long filenames inside citation brackets, and never cite a page/slide higher than a document's stated total.
- Single-Source Questions in Multi-Doc Mode: If a question only appears in some of the documents, state clearly which document(s) contain the answer and which do not.
${multilingualTutorRule}
${mathAndPracticeRule}
- Library Awareness: If the user asks about another library file listed above that is NOT loaded, tell them its exact name and suggest clicking "Add Document" / asking directly by filename.${autoMultiNote}
- Ground all facts strictly in the provided document contexts.`
      : isPro
        ? `You are Quill, an advanced expert multilingual AI document tutor operating in PRO High-Quality mode.
Current Document: "${primaryResult?.file?.name || "Document"}"${primaryResult?.totalPages
          ? ` (${primaryResult.totalPages
          } ${primaryResult.unitLabel.toLowerCase()}${primaryResult.totalPages === 1 ? "" : "s"
          })`
          : ""
        }${unloadedLibraryNote}

Your goal is to provide exceptional, comprehensive, and deeply analytical tutoring from the provided document:
- Deliver thorough, structured explanations with key takeaways, deep technical context, and precise details.
${multilingualTutorRule}
${mathAndPracticeRule}
- Formatting & Citations: Always format with clean Markdown. Include clickable citations like [${primaryResult?.unitLabel || "Page"
        } X] whenever available so the user can jump directly to the source.
${singlePageConstraint}
- Other Documents Awareness: Stay focused on the current document unless the user explicitly asks about another uploaded document. If they ask about an unloaded library document listed above, mention it by name and let them know they can ask directly by its name or click "Add Docs" to enter Multi-Doc Chat.
- Ground all facts strictly in the document context.`
        : `You are Quill, a helpful multilingual AI document tutor and assistant.
Current Document: "${primaryResult?.file?.name || "Document"}"${primaryResult?.totalPages
          ? ` (${primaryResult.totalPages
          } ${primaryResult.unitLabel.toLowerCase()}${primaryResult.totalPages === 1 ? "" : "s"
          })`
          : ""
        }${unloadedLibraryNote}

Your goal is to help the user understand and learn from their uploaded document:
- Provide clear, direct, and easy-to-follow explanations based strictly on the document context.
${multilingualTutorRule}
${mathAndPracticeRule}
- Formatting & Citations: Use Markdown and cite references like [${primaryResult?.unitLabel || "Page"
        } X] where identifiable.
${singlePageConstraint}
- Other Documents Awareness: If the user asks about an unloaded library document listed above, mention it by exact name and let them know they can reference it directly or tap "Add Docs" for Multi-Doc Chat.`;

    const isExamRequest =
      /\b(exam|examination|theory|essay|objective|obj|past questions?|test paper|mock\s+(?:exam|test)|midterm|marking scheme|marking guide|times new roman|section\s+a\b.*section\s+b)\b/i.test(
        message
      ) ||
      (/\b(questions?|quiz|test)\b/i.test(message) &&
        /\b(docx|word\s*(?:doc|document|file)|pdf|separate\s+solutions?|separate\s+answers?|1\.5\s*(?:line)?\s*spacing|font\s*12|12\s*pt)\b/i.test(
          message
        ));
    const isPracticeRequest =
      isExamRequest ||
      /\b(quiz|test me|questions?|mcq|flashcards?|study cards|quiz submission|flashcard submission)\b/i.test(
        message
      );

    // Always default to Word (.docx) ONLY, unless PDF is explicitly requested (one format at a time)
    const wantsPdfExam =
      /\bpdf\b/i.test(message) &&
      !/\b(docx|word\s*(?:doc|document|file))\b/i.test(message);
    const requestedExamFormat: "docx" | "pdf" = wantsPdfExam ? "pdf" : "docx";

    const requestedCounts = extractRequestedQuestionCounts(message, {
      isExamRequest,
    });

    const estMcqCount = isExamRequest
      ? (requestedCounts?.mcqCount ?? requestedCounts?.totalCount ?? 8)
      : (requestedCounts?.totalCount ?? 5);
    const estTheoryCount = isExamRequest
      ? (requestedCounts?.theoryCount ?? 2)
      : 0;

    const dynamicPracticeMaxTokens = Math.min(
      isPro ? 3200 : 2800,
      Math.max(1500, 400 + estMcqCount * 105 + estTheoryCount * 200)
    );

    let countTurnHint = "";
    if (isExamRequest) {
      const exactMcqLine =
        requestedCounts?.mcqCount !== null &&
        requestedCounts?.mcqCount !== undefined
          ? `"mcqQuestions": EXACTLY ${requestedCounts.mcqCount} item(s)${
              requestedCounts.mcqCount === 0 ? " (empty array [])" : ""
            }`
          : requestedCounts?.totalCount
            ? `total questions across mcqQuestions + theoryQuestions = EXACTLY ${requestedCounts.totalCount}`
            : `"mcqQuestions": 8 items`;

      const exactTheoryLine =
        requestedCounts?.theoryCount !== null &&
        requestedCounts?.theoryCount !== undefined
          ? `"theoryQuestions": EXACTLY ${requestedCounts.theoryCount} item(s)${
              requestedCounts.theoryCount === 0 ? " (empty array [])" : ""
            }`
          : requestedCounts?.totalCount
            ? ""
            : `"theoryQuestions": 2 items`;

      countTurnHint = `\n\n[FAST EXAM GENERATION RULE: Generate ONE examination paper strictly from the document context. Output ONLY a single valid \`\`\`exam JSON fenced block with ZERO prose before or after it. Required fields: "title", "duration", "instructions", "includeSolutions" (true unless user explicitly asked for no solutions), "requestedFormats": ["${requestedExamFormat}"] (ONLY ONE format), "mcqQuestions" (4 options each), and "theoryQuestions". STRICT EXACT COUNT REQUIREMENT: ${[exactMcqLine, exactTheoryLine].filter(Boolean).join("; ")}. Keep question stems, options, and solutions crisp and concise so all items complete in one fast pass.]`;
    } else if (
      requestedCounts?.hasExplicitCount &&
      requestedCounts.totalCount
    ) {
      const fence =
        requestedCounts.kind === "flashcards" ? "flashcards" : "quiz";
      const arrName =
        requestedCounts.kind === "flashcards" ? "cards" : "questions";
      countTurnHint = `\n\n[STRICT EXACT COUNT REQUIREMENT: Output a single valid \`\`\`${fence} JSON fenced block containing EXACTLY ${requestedCounts.totalCount} unique items in "${arrName}". Keep each item crisp and complete.]`;
    }

    const promptMessages =
      isExamRequest || requestedCounts?.hasExplicitCount
        ? formattedPrevMessages.slice(-4).map((m) =>
            m.role === "assistant" &&
            /```(?:exam|quiz|flashcards)/i.test(m.content)
              ? {
                  ...m,
                  content:
                    "[Previous generated interactive exercise omitted for speed]",
                }
              : m
          )
        : formattedPrevMessages;

    const messages = [
      {
        role: "system" as const,
        content: systemPrompt,
      },
      ...promptMessages,
      {
        role: "user" as const,
        content: `DOCUMENT CONTEXT:\n${context || "No text available."}\n\nUSER QUESTION: ${message}${countTurnHint}`,
      },
    ];

    const { response, activeModel } = await createCompletionWithFallback({
      messages,
      temperature: isPro ? 0.15 : 0.2,
      max_tokens:
        isExamRequest || isPracticeRequest
          ? dynamicPracticeMaxTokens
          : isPro
            ? 1800
            : 1100,
    });

    console.log(
      `[message/route] Generating answer with model: ${activeModel} (multiDoc=${isMultiDoc}, autoMulti=${autoMultiDocInfo.isAutoMultiDoc}, ${isPro ? "PRO Tier" : "Free Tier"
      })`
    );

    const autoSourcesFooter = autoMultiDocInfo.isAutoMultiDoc
      ? `\n\nSources: ${perDocResults
          .map((res, idx) => `[${idx + 1}] ${res.file.name}`)
          .join(" | ")}`
      : "";

    // When explicit question/card counts were requested, verify exact count & auto-fill missing items
    if (requestedCounts?.hasExplicitCount) {
      const encoder = new TextEncoder();
      const verifiedStream = new ReadableStream({
        async start(controller) {
          let openedFence = false;
          let keepaliveTimer: ReturnType<typeof setInterval> | null = null;
          const stopKeepalive = () => {
            if (keepaliveTimer) {
              clearInterval(keepaliveTimer);
              keepaliveTimer = null;
            }
          };

          const ensureOpenedFence = () => {
            if (openedFence) return;
            openedFence = true;
            controller.enqueue(
              encoder.encode(`\`\`\`${requestedCounts.kind}\n`)
            );
            keepaliveTimer = setInterval(() => {
              try {
                if (openedFence) {
                  controller.enqueue(encoder.encode(" "));
                }
              } catch {
                stopKeepalive();
              }
            }, 2500);
          };

          try {
            const pass1Raw = await readStreamToString(response, (acc) => {
              if (!openedFence && /^\s*(?:```|\{)/i.test(acc)) {
                ensureOpenedFence();
              }
            });

            let finalPayload = pass1Raw;

            if (requestedCounts.kind === "exam") {
              let examData = parseExamData(pass1Raw);
              if (examData) {
                ensureOpenedFence();
                examData = mergeAndFitExamCounts(
                  examData,
                  null,
                  requestedCounts.mcqCount,
                  requestedCounts.theoryCount,
                  requestedCounts.totalCount
                );
                examData.requestedFormats = [requestedExamFormat];
                finalPayload = `\`\`\`exam\n${JSON.stringify(examData)}\n\`\`\``;
              }
            } else if (
              requestedCounts.kind === "quiz" &&
              requestedCounts.totalCount
            ) {
              let quizData = parseQuizData(pass1Raw);
              if (quizData) {
                ensureOpenedFence();
                quizData = mergeAndFitQuizCounts(
                  quizData,
                  null,
                  requestedCounts.totalCount
                );
                finalPayload = `\`\`\`quiz\n${JSON.stringify(quizData)}\n\`\`\``;
              }
            } else if (
              requestedCounts.kind === "flashcards" &&
              requestedCounts.totalCount
            ) {
              let flashData = parseFlashcardsData(pass1Raw);
              if (flashData) {
                ensureOpenedFence();
                flashData = mergeAndFitFlashcardCounts(
                  flashData,
                  null,
                  requestedCounts.totalCount
                );
                finalPayload = `\`\`\`flashcards\n${JSON.stringify(flashData)}\n\`\`\``;
              }
            }

            stopKeepalive();

            const dbText =
              autoSourcesFooter && !finalPayload.includes("Sources:")
                ? `${finalPayload}${autoSourcesFooter}`
                : finalPayload;

            await db.message.create({
              data: {
                text: dbText,
                isUserMessage: false,
                fileId,
                userId,
              },
            });

            if (openedFence) {
              const prefixRe = new RegExp(
                `^\`\`\`${requestedCounts.kind}\\s*`,
                "i"
              );
              const remainder = prefixRe.test(finalPayload)
                ? finalPayload.replace(prefixRe, "")
                : finalPayload;
              const streamOut =
                autoSourcesFooter && !remainder.includes("Sources:")
                  ? `${remainder}${autoSourcesFooter}`
                  : remainder;
              controller.enqueue(encoder.encode(streamOut));
            } else {
              controller.enqueue(encoder.encode(dbText));
            }
            controller.close();
          } catch (streamErr) {
            stopKeepalive();
            controller.error(streamErr);
          }
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

      return new StreamingTextResponse(verifiedStream, {
        headers: responseHeaders,
      });
    }

    const rawStream = OpenAIStream(response as any, {
      async onCompletion(completion) {
        const finalText =
          autoSourcesFooter && !completion.includes("Sources:")
            ? `${completion}${autoSourcesFooter}`
            : completion;
        await db.message.create({
          data: {
            text: finalText,
            isUserMessage: false,
            fileId,
            userId,
          },
        });
      },
    });

    const stream = autoSourcesFooter
      ? (() => {
          const encoder = new TextEncoder();
          const decoder = new TextDecoder();
          let tail = "";
          return rawStream.pipeThrough(
            new TransformStream({
              transform(chunk, controller) {
                tail = (tail + decoder.decode(chunk, { stream: true })).slice(
                  -180
                );
                controller.enqueue(chunk);
              },
              flush(controller) {
                if (!tail.includes("Sources:")) {
                  controller.enqueue(encoder.encode(autoSourcesFooter));
                }
              },
            })
          );
        })()
      : rawStream;

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
    const status = typeof error?.status === "number" ? error.status : 500;
    const isUpstreamLimit =
      status === 402 || status === 429 || status === 413 || status >= 500;
    return new Response(toFriendlyAiErrorMessage(error), {
      status: isUpstreamLimit ? 503 : status,
    });
  }
}
