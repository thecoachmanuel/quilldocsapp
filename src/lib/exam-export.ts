import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  LineRuleType,
  Packer,
  PageNumber,
  Paragraph,
  TextRun,
} from "docx";
import { jsPDF } from "jspdf";
import { ExamPaperData } from "./interactive-content";

export type ExamExportKind = "questions" | "solutions";

const TIMES_FONT = "Times New Roman";
const FONT_SIZE_HALF_PTS = 24; // 12pt
const LINE_SPACING_1_5 = 360; // 240 * 1.5 = 360 twentieths of a line
const PAGE_MARGIN_TWIPS = 1440; // 1 inch

const PDF_MARGIN_PT = 72; // 1 inch
const PDF_FONT_SIZE_PT = 12;
const PDF_LINE_HEIGHT_PT = 18; // 12pt * 1.5 line spacing

const OPTION_LETTERS = ["A", "B", "C", "D", "E", "F"];

function slugifyFilename(title: string): string {
  const cleaned = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 56);
  return cleaned || "exam-paper";
}

export function getExamExportFilename(
  exam: ExamPaperData,
  kind: ExamExportKind,
  ext: "docx" | "pdf"
): string {
  const base = slugifyFilename(exam.title || "exam-paper");
  const suffix = kind === "solutions" ? "Solutions" : "Questions";
  return `${base}-${suffix}.${ext}`;
}

/**
 * Converts LaTeX / Markdown inline formatting into clean readable mathematical text
 * suitable for Word DOCX (UTF-8 Times New Roman).
 */
export function formatExamTextForDocx(raw: string): string {
  if (!raw) return "";
  let s = raw
    .replace(/\r\n/g, "\n")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/(^|\s)\*([^*\n]+)\*(?=\s|[.,;:?!)]|$)/g, "$1$2")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\$\$/g, "")
    .replace(/(?<!\\)\$/g, "");

  // Fractions & roots (nested-safe single level pass twice)
  for (let i = 0; i < 2; i++) {
    s = s
      .replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, "($1)/($2)")
      .replace(/\\sqrt\{([^{}]+)\}/g, "√($1)")
      .replace(/\\(?:bar|overline)\{([^{}]+)\}/g, "$1\u0304")
      .replace(/\\hat\{([^{}]+)\}/g, "$1\u0302")
      .replace(/\\(?:text|mathrm|mathbf|mathit)\{([^{}]*)\}/g, "$1");
  }

  const latexReplacements: Array<[RegExp, string]> = [
    [/\\alpha\b/g, "α"],
    [/\\beta\b/g, "β"],
    [/\\gamma\b/g, "γ"],
    [/\\delta\b/g, "δ"],
    [/\\epsilon\b/g, "ε"],
    [/\\theta\b/g, "θ"],
    [/\\lambda\b/g, "λ"],
    [/\\mu\b/g, "μ"],
    [/\\pi\b/g, "π"],
    [/\\rho\b/g, "ρ"],
    [/\\sigma\b/g, "σ"],
    [/\\Sigma\b/g, "Σ"],
    [/\\tau\b/g, "τ"],
    [/\\phi\b/g, "φ"],
    [/\\chi\b/g, "χ"],
    [/\\omega\b/g, "ω"],
    [/\\Delta\b/g, "Δ"],
    [/\\sum\b/g, "Σ"],
    [/\\prod\b/g, "Π"],
    [/\\int\b/g, "∫"],
    [/\\infty\b/g, "∞"],
    [/\\pm\b/g, "±"],
    [/\\times\b/g, "×"],
    [/\\cdot\b/g, "·"],
    [/\\div\b/g, "÷"],
    [/\\leq?\b/g, "≤"],
    [/\\geq?\b/g, "≥"],
    [/\\neq\b/g, "≠"],
    [/\\approx\b/g, "≈"],
    [/\\equiv\b/g, "≡"],
    [/\\rightarrow\b|\\to\b/g, "→"],
    [/\\leftarrow\b/g, "←"],
    [/\\in\b/g, "∈"],
    [/\\degree\b|\\circ\b/g, "°"],
    [/\\%/g, "%"],
    [/\\left\(/g, "("],
    [/\\right\)/g, ")"],
    [/\\left\[/g, "["],
    [/\\right\]/g, "]"],
  ];

  for (const [re, rep] of latexReplacements) {
    s = s.replace(re, rep);
  }

  const supMap: Record<string, string> = {
    "0": "⁰",
    "1": "¹",
    "2": "²",
    "3": "³",
    "4": "⁴",
    "5": "⁵",
    "6": "⁶",
    "7": "⁷",
    "8": "⁸",
    "9": "⁹",
  };
  const subMap: Record<string, string> = {
    "0": "₀",
    "1": "₁",
    "2": "₂",
    "3": "₃",
    "4": "₄",
    "5": "₅",
    "6": "₆",
    "7": "₇",
    "8": "₈",
    "9": "₉",
  };

  s = s
    .replace(/\^\{?([0-9])\}?/g, (_, d) => supMap[d] || `^${d}`)
    .replace(/_\{?([0-9])\}?/g, (_, d) => subMap[d] || `_${d}`)
    .replace(/[{}]/g, "")
    .replace(/\\/g, "")
    .replace(/[ \t]+/g, " ")
    .trim();

  return s;
}

/**
 * Formats exam text safely for standard PDF Type1 Times-Roman (WinAnsiEncoding),
 * avoiding unsupported Unicode glyphs while keeping clean mathematical notation.
 */
export function formatExamTextForPdf(raw: string): string {
  const utf = formatExamTextForDocx(raw);
  return utf
    .replace(/[\u0304]/g, "bar")
    .replace(/[\u0302]/g, "^")
    .replace(/α/g, "alpha")
    .replace(/β/g, "beta")
    .replace(/γ/g, "gamma")
    .replace(/δ/g, "delta")
    .replace(/ε/g, "epsilon")
    .replace(/θ/g, "theta")
    .replace(/λ/g, "lambda")
    .replace(/[μµ]/g, "u")
    .replace(/π/g, "pi")
    .replace(/ρ/g, "rho")
    .replace(/σ/g, "sigma")
    .replace(/[Σ]/g, "Sum")
    .replace(/τ/g, "tau")
    .replace(/φ/g, "phi")
    .replace(/χ/g, "chi")
    .replace(/ω/g, "omega")
    .replace(/Δ/g, "Delta")
    .replace(/Π/g, "Prod")
    .replace(/∫/g, "Int")
    .replace(/√/g, "sqrt")
    .replace(/∞/g, "infinity")
    .replace(/≤/g, "<=")
    .replace(/≥/g, ">=")
    .replace(/≠/g, "!=")
    .replace(/≈/g, "~=")
    .replace(/≡/g, "===")
    .replace(/→/g, "->")
    .replace(/←/g, "<-")
    .replace(/∈/g, "in")
    .replace(/⁰/g, "^0")
    .replace(/⁴/g, "^4")
    .replace(/⁵/g, "^5")
    .replace(/⁶/g, "^6")
    .replace(/⁷/g, "^7")
    .replace(/⁸/g, "^8")
    .replace(/⁹/g, "^9")
    .replace(/₀/g, "_0")
    .replace(/₁/g, "_1")
    .replace(/₂/g, "_2")
    .replace(/₃/g, "_3")
    .replace(/₄/g, "_4")
    .replace(/₅/g, "_5")
    .replace(/₆/g, "_6")
    .replace(/₇/g, "_7")
    .replace(/₈/g, "_8")
    .replace(/₉/g, "_9")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/•/g, "-");
}

function getExamTotalMarks(exam: ExamPaperData): number {
  const mcqTotal = exam.mcqQuestions.reduce((sum, q) => sum + (q.marks || 1), 0);
  const theoryTotal = exam.theoryQuestions.reduce(
    (sum, q) => sum + (q.marks || 10),
    0
  );
  return mcqTotal + theoryTotal;
}

function makeTimesRun(
  text: string,
  options?: { bold?: boolean; italics?: boolean; underline?: boolean }
): TextRun {
  return new TextRun({
    text,
    font: TIMES_FONT,
    size: FONT_SIZE_HALF_PTS,
    bold: options?.bold,
    italics: options?.italics,
    underline: options?.underline ? {} : undefined,
  });
}

function makeStandardParagraph(
  children: TextRun | TextRun[],
  options?: {
    alignment?: (typeof AlignmentType)[keyof typeof AlignmentType];
    spaceBefore?: number;
    spaceAfter?: number;
    indentLeft?: number;
    hanging?: number;
    keepNext?: boolean;
    bottomBorder?: boolean;
  }
): Paragraph {
  return new Paragraph({
    children: Array.isArray(children) ? children : [children],
    alignment: options?.alignment ?? AlignmentType.LEFT,
    keepNext: options?.keepNext,
    indent:
      options?.indentLeft || options?.hanging
        ? {
            left: options.indentLeft,
            hanging: options.hanging,
          }
        : undefined,
    spacing: {
      line: LINE_SPACING_1_5,
      lineRule: LineRuleType.AUTO,
      before: options?.spaceBefore ?? 0,
      after: options?.spaceAfter ?? 120,
    },
    border: options?.bottomBorder
      ? {
          bottom: {
            style: BorderStyle.SINGLE,
            size: 8,
            color: "000000",
          },
        }
      : undefined,
  });
}

export function createExamDocxDocument(
  exam: ExamPaperData,
  kind: ExamExportKind
): Document {
  const children: Paragraph[] = [];
  const totalMarks = getExamTotalMarks(exam);

  // Header Block
  if (exam.courseCode) {
    children.push(
      makeStandardParagraph(
        makeTimesRun(formatExamTextForDocx(exam.courseCode).toUpperCase(), {
          bold: true,
        }),
        { alignment: AlignmentType.CENTER, spaceAfter: 40 }
      )
    );
  }

  children.push(
    makeStandardParagraph(
      makeTimesRun(
        formatExamTextForDocx(
          kind === "solutions"
            ? `${exam.title} — MARKING SCHEME & SOLUTIONS`
            : exam.title
        ).toUpperCase(),
        { bold: true }
      ),
      { alignment: AlignmentType.CENTER, spaceAfter: 60 }
    )
  );

  const metaParts: string[] = [];
  if (exam.duration) {
    metaParts.push(`Time Allowed: ${formatExamTextForDocx(exam.duration)}`);
  }
  metaParts.push(`Total Marks: ${totalMarks}`);
  if (exam.mcqQuestions.length > 0 && exam.theoryQuestions.length > 0) {
    metaParts.push(
      `Sections: A (${exam.mcqQuestions.length} MCQ) & B (${exam.theoryQuestions.length} Theory)`
    );
  }

  children.push(
    makeStandardParagraph(makeTimesRun(metaParts.join("   |   "), { bold: true }), {
      alignment: AlignmentType.CENTER,
      spaceAfter: kind === "questions" ? 120 : 180,
      bottomBorder: kind === "solutions",
    })
  );

  if (kind === "questions") {
    children.push(
      makeStandardParagraph(
        [
          makeTimesRun("Candidate Name: ____________________________________   "),
          makeTimesRun("ID / Matric No.: ______________________"),
        ],
        { spaceBefore: 60, spaceAfter: 160, bottomBorder: true }
      )
    );

    // Instructions
    children.push(
      makeStandardParagraph(makeTimesRun("GENERAL INSTRUCTIONS:", { bold: true }), {
        spaceBefore: 120,
        spaceAfter: 60,
        keepNext: true,
      })
    );
    exam.instructions.forEach((inst, idx) => {
      children.push(
        makeStandardParagraph(
          makeTimesRun(`${idx + 1}. ${formatExamTextForDocx(inst)}`),
          { indentLeft: 360, hanging: 240, spaceAfter: 60 }
        )
      );
    });
  }

  // Section A: MCQs
  if (exam.mcqQuestions.length > 0) {
    const mcqMarks = exam.mcqQuestions.reduce(
      (sum, q) => sum + (q.marks || 1),
      0
    );
    children.push(
      makeStandardParagraph(
        makeTimesRun(
          kind === "solutions"
            ? `SECTION A: MULTIPLE CHOICE SOLUTIONS (${mcqMarks} Marks)`
            : `SECTION A: MULTIPLE CHOICE QUESTIONS (${mcqMarks} Marks)`,
          { bold: true, underline: true }
        ),
        { spaceBefore: 200, spaceAfter: 80, keepNext: true }
      )
    );

    if (kind === "questions") {
      children.push(
        makeStandardParagraph(
          makeTimesRun(
            "Instruction: Choose the single best option (A, B, C, or D) for each question.",
            { italics: true }
          ),
          { spaceAfter: 140, keepNext: true }
        )
      );

      exam.mcqQuestions.forEach((q, idx) => {
        const markLabel = q.marks && q.marks !== 1 ? ` [${q.marks} Marks]` : "";
        children.push(
          makeStandardParagraph(
            [
              makeTimesRun(`${idx + 1}. `, { bold: true }),
              makeTimesRun(formatExamTextForDocx(q.question)),
              ...(markLabel ? [makeTimesRun(markLabel, { italics: true })] : []),
            ],
            { indentLeft: 360, hanging: 360, spaceAfter: 60, keepNext: true }
          )
        );

        q.options.forEach((opt, optIdx) => {
          const letter = OPTION_LETTERS[optIdx] || String(optIdx + 1);
          const isLastOption = optIdx === q.options.length - 1;
          children.push(
            makeStandardParagraph(
              [
                makeTimesRun(`${letter}. `, { bold: true }),
                makeTimesRun(formatExamTextForDocx(opt)),
              ],
              {
                indentLeft: 720,
                hanging: 300,
                spaceAfter: isLastOption ? 140 : 40,
              }
            )
          );
        });
      });
    } else {
      exam.mcqQuestions.forEach((q, idx) => {
        const letter =
          q.correctIndex >= 0 && q.correctIndex < q.options.length
            ? OPTION_LETTERS[q.correctIndex] || String(q.correctIndex + 1)
            : "-";
        const ansText =
          q.correctIndex >= 0 && q.correctIndex < q.options.length
            ? formatExamTextForDocx(q.options[q.correctIndex])
            : "See explanation";

        children.push(
          makeStandardParagraph(
            [
              makeTimesRun(`${idx + 1}. Answer: ${letter} (${ansText})`, {
                bold: true,
              }),
              makeTimesRun(` [${q.marks || 1} Mark${(q.marks || 1) === 1 ? "" : "s"}]`, {
                italics: true,
              }),
            ],
            { indentLeft: 360, hanging: 360, spaceAfter: q.explanation ? 40 : 120 }
          )
        );
        if (q.explanation) {
          children.push(
            makeStandardParagraph(
              [
                makeTimesRun("Explanation: ", { italics: true, bold: true }),
                makeTimesRun(formatExamTextForDocx(q.explanation)),
              ],
              { indentLeft: 540, spaceAfter: 120 }
            )
          );
        }
      });
    }
  }

  // Section B: Theory Questions
  if (exam.theoryQuestions.length > 0) {
    const theoryMarks = exam.theoryQuestions.reduce(
      (sum, q) => sum + (q.marks || 10),
      0
    );
    children.push(
      makeStandardParagraph(
        makeTimesRun(
          kind === "solutions"
            ? `SECTION B: THEORY MODEL SOLUTIONS & MARKING GUIDE (${theoryMarks} Marks)`
            : `SECTION B: THEORY / ESSAY QUESTIONS (${theoryMarks} Marks)`,
          { bold: true, underline: true }
        ),
        { spaceBefore: 240, spaceAfter: 80, keepNext: true }
      )
    );

    if (kind === "questions") {
      children.push(
        makeStandardParagraph(
          makeTimesRun(
            "Instruction: Answer ALL questions clearly. Marks allocated to each question are indicated in brackets.",
            { italics: true }
          ),
          { spaceAfter: 140, keepNext: true }
        )
      );
    }

    exam.theoryQuestions.forEach((q, idx) => {
      const qLabel = `Question ${idx + 1}: `;
      const marksLabel = ` [${q.marks || 10} Marks]`;

      children.push(
        makeStandardParagraph(
          [
            makeTimesRun(qLabel, { bold: true }),
            makeTimesRun(formatExamTextForDocx(q.question)),
            makeTimesRun(marksLabel, { bold: true }),
          ],
          {
            indentLeft: 360,
            hanging: 360,
            spaceAfter: q.subQuestions?.length || kind === "solutions" ? 60 : 180,
          }
        )
      );

      if (q.subQuestions && q.subQuestions.length > 0) {
        q.subQuestions.forEach((sub, sIdx) => {
          const isLastSub =
            sIdx === q.subQuestions!.length - 1 && kind === "questions";
          children.push(
            makeStandardParagraph(
              makeTimesRun(formatExamTextForDocx(sub)),
              {
                indentLeft: 720,
                spaceAfter: isLastSub ? 180 : 60,
              }
            )
          );
        });
      }

      if (kind === "solutions") {
        const solutionLines = formatExamTextForDocx(
          q.solution || "Award marks based on standard rubric steps."
        )
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean);

        solutionLines.forEach((line, lIdx) => {
          const isFirst = lIdx === 0;
          const isLast = lIdx === solutionLines.length - 1;
          children.push(
            makeStandardParagraph(
              isFirst
                ? [
                    makeTimesRun("Solution / Marking Guide: ", {
                      bold: true,
                      italics: true,
                    }),
                    makeTimesRun(line),
                  ]
                : makeTimesRun(line),
              {
                indentLeft: 540,
                spaceAfter: isLast ? 180 : 60,
              }
            )
          );
        });
      }
    });
  }

  return new Document({
    styles: {
      default: {
        document: {
          run: {
            font: TIMES_FONT,
            size: FONT_SIZE_HALF_PTS,
          },
          paragraph: {
            spacing: {
              line: LINE_SPACING_1_5,
              lineRule: LineRuleType.AUTO,
            },
          },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: PAGE_MARGIN_TWIPS,
              right: PAGE_MARGIN_TWIPS,
              bottom: PAGE_MARGIN_TWIPS,
              left: PAGE_MARGIN_TWIPS,
            },
            size: {
              width: 11906, // A4 width in twips
              height: 16838, // A4 height in twips
            },
          },
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  makeTimesRun("Page "),
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    font: TIMES_FONT,
                    size: FONT_SIZE_HALF_PTS,
                  }),
                  makeTimesRun(" of "),
                  new TextRun({
                    children: [PageNumber.TOTAL_PAGES],
                    font: TIMES_FONT,
                    size: FONT_SIZE_HALF_PTS,
                  }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });
}

export async function generateExamDocxBlob(
  exam: ExamPaperData,
  kind: ExamExportKind
): Promise<Blob> {
  const doc = createExamDocxDocument(exam, kind);
  return Packer.toBlob(doc);
}

export async function generateExamDocxBuffer(
  exam: ExamPaperData,
  kind: ExamExportKind
): Promise<Buffer> {
  const doc = createExamDocxDocument(exam, kind);
  return Packer.toBuffer(doc);
}

/**
 * Generates an A4 PDF strictly formatted in Times-Roman (Times New Roman),
 * 12pt font size, and 1.5 line spacing (18pt line height).
 */
export function generateExamPdfArrayBuffer(
  exam: ExamPaperData,
  kind: ExamExportKind
): ArrayBuffer {
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "pt",
    format: "a4",
  });

  pdf.setFont("times", "normal");
  pdf.setFontSize(PDF_FONT_SIZE_PT);
  pdf.setLineHeightFactor(1.5);

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const usableWidth = pageWidth - PDF_MARGIN_PT * 2;
  const maxBottomY = pageHeight - PDF_MARGIN_PT;
  let y = PDF_MARGIN_PT;

  const ensureSpace = (neededPt: number) => {
    if (y + neededPt > maxBottomY) {
      pdf.addPage();
      y = PDF_MARGIN_PT;
    }
  };

  const writeWrapped = (
    text: string,
    opts?: {
      style?: "normal" | "bold" | "italic" | "bolditalic";
      align?: "left" | "center";
      indentLeft?: number;
      hanging?: number;
      spaceAfter?: number;
      drawDividerAfter?: boolean;
    }
  ) => {
    const style = opts?.style ?? "normal";
    const align = opts?.align ?? "left";
    const indentLeft = opts?.indentLeft ?? 0;
    const hanging = opts?.hanging ?? 0;
    const spaceAfter = opts?.spaceAfter ?? 6;

    pdf.setFont("times", style);
    pdf.setFontSize(PDF_FONT_SIZE_PT);

    const effectiveWidth =
      align === "center" ? usableWidth : usableWidth - indentLeft;
    const lines: string[] = pdf.splitTextToSize(text, effectiveWidth);

    lines.forEach((line, lineIdx) => {
      ensureSpace(PDF_LINE_HEIGHT_PT);
      if (align === "center") {
        pdf.text(line, pageWidth / 2, y, { align: "center" });
      } else {
        const lineX =
          PDF_MARGIN_PT + indentLeft - (lineIdx === 0 ? hanging : 0);
        pdf.text(line, lineX, y);
      }
      y += PDF_LINE_HEIGHT_PT;
    });

    if (opts?.drawDividerAfter) {
      ensureSpace(8);
      pdf.setLineWidth(0.75);
      pdf.line(PDF_MARGIN_PT, y - 4, pageWidth - PDF_MARGIN_PT, y - 4);
      y += 8;
    } else {
      y += spaceAfter;
    }
  };

  const totalMarks = getExamTotalMarks(exam);

  if (exam.courseCode) {
    writeWrapped(formatExamTextForPdf(exam.courseCode).toUpperCase(), {
      style: "bold",
      align: "center",
      spaceAfter: 2,
    });
  }

  writeWrapped(
    formatExamTextForPdf(
      kind === "solutions"
        ? `${exam.title} - MARKING SCHEME & SOLUTIONS`
        : exam.title
    ).toUpperCase(),
    { style: "bold", align: "center", spaceAfter: 4 }
  );

  const metaParts: string[] = [];
  if (exam.duration) {
    metaParts.push(`Time Allowed: ${formatExamTextForPdf(exam.duration)}`);
  }
  metaParts.push(`Total Marks: ${totalMarks}`);
  if (exam.mcqQuestions.length > 0 && exam.theoryQuestions.length > 0) {
    metaParts.push(
      `Sections: A (${exam.mcqQuestions.length} MCQ) & B (${exam.theoryQuestions.length} Theory)`
    );
  }

  writeWrapped(metaParts.join("  |  "), {
    style: "bold",
    align: "center",
    spaceAfter: 6,
    drawDividerAfter: kind === "solutions",
  });

  if (kind === "questions") {
    y += 4;
    writeWrapped(
      "Candidate Name: ________________________________   ID / Matric No.: ___________________",
      {
        style: "normal",
        spaceAfter: 6,
        drawDividerAfter: true,
      }
    );

    y += 4;
    writeWrapped("GENERAL INSTRUCTIONS:", { style: "bold", spaceAfter: 3 });
    exam.instructions.forEach((inst, idx) => {
      writeWrapped(`${idx + 1}. ${formatExamTextForPdf(inst)}`, {
        indentLeft: 20,
        hanging: 16,
        spaceAfter: 3,
      });
    });
  }

  if (exam.mcqQuestions.length > 0) {
    const mcqMarks = exam.mcqQuestions.reduce(
      (sum, q) => sum + (q.marks || 1),
      0
    );
    y += 8;
    writeWrapped(
      kind === "solutions"
        ? `SECTION A: MULTIPLE CHOICE SOLUTIONS (${mcqMarks} Marks)`
        : `SECTION A: MULTIPLE CHOICE QUESTIONS (${mcqMarks} Marks)`,
      { style: "bold", spaceAfter: 4 }
    );

    if (kind === "questions") {
      writeWrapped(
        "Instruction: Choose the single best option (A, B, C, or D) for each question.",
        { style: "italic", spaceAfter: 8 }
      );

      exam.mcqQuestions.forEach((q, idx) => {
        const markLabel =
          q.marks && q.marks !== 1 ? ` [${q.marks} Marks]` : "";
        ensureSpace(PDF_LINE_HEIGHT_PT * 2);
        writeWrapped(
          `${idx + 1}. ${formatExamTextForPdf(q.question)}${markLabel}`,
          {
            indentLeft: 20,
            hanging: 20,
            spaceAfter: 3,
          }
        );

        q.options.forEach((opt, optIdx) => {
          const letter = OPTION_LETTERS[optIdx] || String(optIdx + 1);
          const isLastOpt = optIdx === q.options.length - 1;
          writeWrapped(`${letter}. ${formatExamTextForPdf(opt)}`, {
            indentLeft: 42,
            hanging: 18,
            spaceAfter: isLastOpt ? 9 : 2,
          });
        });
      });
    } else {
      exam.mcqQuestions.forEach((q, idx) => {
        const letter =
          q.correctIndex >= 0 && q.correctIndex < q.options.length
            ? OPTION_LETTERS[q.correctIndex] || String(q.correctIndex + 1)
            : "-";
        const ansText =
          q.correctIndex >= 0 && q.correctIndex < q.options.length
            ? formatExamTextForPdf(q.options[q.correctIndex])
            : "See explanation";

        writeWrapped(
          `${idx + 1}. Answer: ${letter} (${ansText}) [${q.marks || 1} Mark${
            (q.marks || 1) === 1 ? "" : "s"
          }]`,
          {
            style: "bold",
            indentLeft: 20,
            hanging: 20,
            spaceAfter: q.explanation ? 2 : 7,
          }
        );
        if (q.explanation) {
          writeWrapped(
            `Explanation: ${formatExamTextForPdf(q.explanation)}`,
            {
              indentLeft: 28,
              spaceAfter: 8,
            }
          );
        }
      });
    }
  }

  if (exam.theoryQuestions.length > 0) {
    const theoryMarks = exam.theoryQuestions.reduce(
      (sum, q) => sum + (q.marks || 10),
      0
    );
    y += 10;
    writeWrapped(
      kind === "solutions"
        ? `SECTION B: THEORY MODEL SOLUTIONS & MARKING GUIDE (${theoryMarks} Marks)`
        : `SECTION B: THEORY / ESSAY QUESTIONS (${theoryMarks} Marks)`,
      { style: "bold", spaceAfter: 4 }
    );

    if (kind === "questions") {
      writeWrapped(
        "Instruction: Answer ALL questions clearly. Marks allocated are shown in brackets.",
        { style: "italic", spaceAfter: 8 }
      );
    }

    exam.theoryQuestions.forEach((q, idx) => {
      ensureSpace(PDF_LINE_HEIGHT_PT * 2);
      writeWrapped(
        `Question ${idx + 1}: ${formatExamTextForPdf(q.question)} [${
          q.marks || 10
        } Marks]`,
        {
          style: kind === "solutions" ? "bold" : "normal",
          indentLeft: 20,
          hanging: 20,
          spaceAfter: q.subQuestions?.length || kind === "solutions" ? 4 : 12,
        }
      );

      if (q.subQuestions && q.subQuestions.length > 0) {
        q.subQuestions.forEach((sub, sIdx) => {
          const isLastSub =
            sIdx === q.subQuestions!.length - 1 && kind === "questions";
          writeWrapped(formatExamTextForPdf(sub), {
            indentLeft: 42,
            spaceAfter: isLastSub ? 12 : 4,
          });
        });
      }

      if (kind === "solutions") {
        const solutionLines = formatExamTextForPdf(
          q.solution || "Award marks based on standard rubric steps."
        )
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean);

        solutionLines.forEach((line, lIdx) => {
          const isLast = lIdx === solutionLines.length - 1;
          writeWrapped(
            lIdx === 0 ? `Solution / Marking Guide: ${line}` : line,
            {
              indentLeft: 28,
              spaceAfter: isLast ? 12 : 4,
            }
          );
        });
      }
    });
  }

  // Page numbering footer on every page
  const totalPages = pdf.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    pdf.setPage(p);
    pdf.setFont("times", "normal");
    pdf.setFontSize(PDF_FONT_SIZE_PT);
    pdf.text(`Page ${p} of ${totalPages}`, pageWidth / 2, pageHeight - 36, {
      align: "center",
    });
  }

  return pdf.output("arraybuffer");
}

function triggerBrowserDownload(blob: Blob, filename: string) {
  if (typeof window === "undefined") return;
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
}

export async function downloadExamDocx(
  exam: ExamPaperData,
  kind: ExamExportKind
): Promise<void> {
  const blob = await generateExamDocxBlob(exam, kind);
  triggerBrowserDownload(blob, getExamExportFilename(exam, kind, "docx"));
}

export function downloadExamPdf(
  exam: ExamPaperData,
  kind: ExamExportKind
): void {
  const buffer = generateExamPdfArrayBuffer(exam, kind);
  const blob = new Blob([buffer], { type: "application/pdf" });
  triggerBrowserDownload(blob, getExamExportFilename(exam, kind, "pdf"));
}

