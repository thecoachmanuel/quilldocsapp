import fs from "fs";
import path from "path";
import mammoth from "mammoth";
import AdmZip from "adm-zip";
import { getFileType } from "./file-utils";

export { getFileType };

export interface SlideElement {
  id: string;
  type: "text" | "image" | "table" | "shape";
  left: string;
  top: string;
  width: string;
  height: string;
  zIndex?: number;
  isTitle?: boolean;
  paragraphs?: Array<{
    align?: "left" | "center" | "right" | "justify";
    bullet?: boolean;
    bulletChar?: string;
    level?: number;
    runs: Array<{
      text: string;
      bold?: boolean;
      italic?: boolean;
      underline?: boolean;
      color?: string;
      size?: number;
      fontFamily?: string;
    }>;
  }>;
  src?: string;
  alt?: string;
  rows?: Array<
    Array<{
      text: string;
      bold?: boolean;
      align?: string;
      bgColor?: string;
      color?: string;
    }>
  >;
  bgColor?: string;
  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number;
  verticalAlign?: "top" | "center" | "bottom";
  rawText?: string;
}

export interface RichSlide {
  slideNumber: number;
  title: string;
  content: string[];
  rawText: string;
  bgColor?: string;
  bgImage?: string;
  aspectRatio?: number;
  elements: SlideElement[];
}

export interface ParsedDocument {
  fileType: "pdf" | "docx" | "pptx" | "unknown";
  text: string;
  html?: string;
  slides?: RichSlide[];
  pages?: Array<{ pageNumber: number; text: string }>;
  totalPages?: number;
  totalSlides?: number;
  totalWords: number;
  aspectRatio?: number;
}

// In-memory cache for parsed document content (v3 for full slide fidelity)
const documentCache = new Map<string, ParsedDocument>();

/**
 * Decode XML entities in text runs
 */
function decodeXmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    );
}

/**
 * Parse a DOCX file buffer into raw text and clean HTML with full embedded images and tables
 */
export async function parseDocx(
  buffer: Buffer
): Promise<{
  text: string;
  html: string;
  pages: Array<{ pageNumber: number; text: string }>;
}> {
  try {
    const rawResult = await mammoth.extractRawText({ buffer });

    // Enable base64 image extraction so embedded diagrams, charts, and photos in Word are 100% preserved
    const options = {
      convertImage: (mammoth as any).images.imgElement(
        (image: any) => {
          return image.read("base64").then((imageBuffer: string) => ({
            src: `data:${image.contentType};base64,${imageBuffer}`,
          }));
        }
      ),
    };

    const htmlResult = await mammoth.convertToHtml({ buffer }, options);

    const rawText = rawResult.value ? rawResult.value.trim() : "";
    let html = htmlResult.value || "";

    // Enhance HTML styling with clean typography
    if (!html && rawText) {
      html = rawText
        .split("\n\n")
        .map((para) => `<p>${para.replace(/\n/g, "<br/>")}</p>`)
        .join("");
    }

    // Extract pages based on Word's pagination break tags (<w:lastRenderedPageBreak/> and <w:br w:type="page"/>)
    let pages: Array<{ pageNumber: number; text: string }> = [];
    try {
      const zip = new AdmZip(buffer);
      const docXml = zip.readAsText("word/document.xml");
      if (docXml) {
        const parts = docXml.split(
          /(?:<w:lastRenderedPageBreak\s*\/>|<w:br\s+[^>]*w:type=["']page["'][^>]*\/>)/i
        );
        if (parts.length > 1) {
          pages = parts
            .map((part, idx) => {
              const textMatches = Array.from(
                part.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)
              )
                .map((m) => decodeXmlEntities(m[1]))
                .join(" ")
                .replace(/\s+/g, " ")
                .trim();
              return {
                pageNumber: idx + 1,
                text: textMatches,
              };
            })
            .filter((p) => p.text.length > 0);
        }
      }
    } catch (e) {
      // Ignore XML inspection errors
    }

    // Fallback if no explicit page breaks exist: split text evenly into ~450-word pages
    if (pages.length === 0 && rawText) {
      const words = rawText.split(/\s+/).filter(Boolean);
      const wordsPerPage = 450;
      const totalEstimatedPages = Math.max(
        1,
        Math.ceil(words.length / wordsPerPage)
      );
      for (let p = 0; p < totalEstimatedPages; p++) {
        const pageWords = words.slice(p * wordsPerPage, (p + 1) * wordsPerPage);
        pages.push({
          pageNumber: p + 1,
          text: pageWords.join(" "),
        });
      }
    }

    return {
      text: rawText,
      html,
      pages,
    };
  } catch (error: any) {
    console.error("[parseDocx] Error:", error);
    const str = buffer.toString("utf8");
    const extracted = str
      .replace(/[^\x20-\x7E\n\r\t]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return {
      text: extracted,
      html: `<p>${extracted}</p>`,
      pages: [{ pageNumber: 1, text: extracted }],
    };
  }
}

/**
 * Helper to adjust hex color with luminance modification and luminance offset
 */
function adjustColor(hex: string, lumMod?: number, lumOff?: number): string {
  let r = parseInt(hex.slice(0, 2), 16) || 0;
  let g = parseInt(hex.slice(2, 4), 16) || 0;
  let b = parseInt(hex.slice(4, 6), 16) || 0;
  if (lumMod !== undefined) {
    const factor = lumMod / 100000;
    r = Math.round(r * factor);
    g = Math.round(g * factor);
    b = Math.round(b * factor);
  }
  if (lumOff !== undefined) {
    const offset = (lumOff / 100000) * 255;
    r = Math.min(255, Math.max(0, Math.round(r + offset)));
    g = Math.min(255, Math.max(0, Math.round(g + offset)));
    b = Math.min(255, Math.max(0, Math.round(b + offset)));
  }
  return ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

interface SpTreeToken {
  tag: "grpSp" | "pic" | "graphicFrame" | "sp";
  innerXml: string;
}

interface LevelStyleDefaults {
  fontSize?: number;
  color?: string;
  align?: "left" | "center" | "right" | "justify";
  fontFamily?: string;
  bullet?: boolean;
  buNone?: boolean;
  bulletChar?: string;
}

interface PlaceholderLayoutDef {
  type?: string;
  idx?: string;
  x?: number;
  y?: number;
  cx?: number;
  cy?: number;
  shapeBg?: string;
  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number;
  verticalAlign?: "top" | "center" | "bottom";
  lvlStyles?: Record<number, LevelStyleDefaults>;
}

/**
 * Strips `<mc:Fallback>` blocks when `<mc:Choice>` exists so AlternateContent
 * shapes/diagrams are not rendered twice on top of each other.
 */
function stripAlternateFallback(xml: string): string {
  return xml.replace(
    /<mc:AlternateContent[^>]*>([\s\S]*?)<\/mc:AlternateContent>/gi,
    (full, inner) =>
      /<mc:Choice[\s>]/i.test(inner)
        ? inner.replace(/<mc:Fallback>[\s\S]*?<\/mc:Fallback>/gi, "")
        : full
  );
}

/**
 * Extracts direct `<p:grpSp>`, `<p:pic>`, `<p:graphicFrame>`, and `<p:sp>` nodes
 * with balanced tag matching so nested `<p:grpSp>` blocks never split mid-tag.
 */
function extractTopLevelSpTreeTokens(treeXml: string): SpTreeToken[] {
  const tokens: SpTreeToken[] = [];
  const openTagRegex = /<(p:grpSp|p:pic|p:graphicFrame|p:sp)(?=[\s>])/g;
  let cursor = 0;

  while (cursor < treeXml.length) {
    openTagRegex.lastIndex = cursor;
    const match = openTagRegex.exec(treeXml);
    if (!match) break;

    const fullTag = match[1];
    const shortTag = fullTag.replace(/^p:/, "") as SpTreeToken["tag"];
    const tagStart = match.index;
    const gtIdx = treeXml.indexOf(">", tagStart + fullTag.length);
    if (gtIdx === -1) break;

    // Self-closing tag (e.g. `<p:sp .../>`)
    if (treeXml[gtIdx - 1] === "/") {
      cursor = gtIdx + 1;
      continue;
    }

    const innerStart = gtIdx + 1;
    let depth = 1;
    let scanPos = innerStart;
    const depthRegex = new RegExp(
      `<(/?)${fullTag}(?=[\\s>/])[^>]*>`,
      "g"
    );

    let closeStart = -1;
    let nextCursor = treeXml.length;
    depthRegex.lastIndex = innerStart;

    let dMatch: RegExpExecArray | null;
    while ((dMatch = depthRegex.exec(treeXml)) !== null) {
      const tokenStr = dMatch[0];
      const isClosing = dMatch[1] === "/";
      const isSelfClosing = !isClosing && tokenStr.endsWith("/>");
      if (isSelfClosing) continue;
      if (isClosing) {
        depth -= 1;
        if (depth === 0) {
          closeStart = dMatch.index;
          nextCursor = dMatch.index + tokenStr.length;
          break;
        }
      } else {
        depth += 1;
      }
      scanPos = dMatch.index + tokenStr.length;
      depthRegex.lastIndex = scanPos;
    }

    if (closeStart !== -1) {
      tokens.push({
        tag: shortTag,
        innerXml: treeXml.slice(innerStart, closeStart),
      });
      cursor = nextCursor;
    } else {
      cursor = innerStart;
    }
  }

  return tokens;
}

/**
 * Resolves a ZIP-relative target path like `../slideLayouts/slideLayout1.xml`
 * against a base entry directory (e.g. `ppt/slides`).
 */
function resolveZipTarget(baseDir: string, rawTarget: string): string {
  if (!rawTarget) return "";
  if (rawTarget.startsWith("/")) return rawTarget.slice(1);
  const parts = baseDir ? baseDir.split("/").filter(Boolean) : [];
  for (const seg of rawTarget.split("/")) {
    if (!seg || seg === ".") continue;
    if (seg === "..") {
      parts.pop();
    } else {
      parts.push(seg);
    }
  }
  return parts.join("/");
}

/**
 * Parses `.rels` XML into an `id -> { type, target }` map regardless of attribute order.
 */
function parseRelationshipsXml(
  relsXml: string,
  baseDir: string
): Record<string, { type: string; target: string }> {
  const map: Record<string, { type: string; target: string }> = {};
  for (const rm of Array.from(
    relsXml.matchAll(/<Relationship\s+([^>]+?)\/?\s*>/g)
  )) {
    const attrs = rm[1];
    const idM = attrs.match(/Id="([^"]+)"/);
    const typeM = attrs.match(/Type="([^"]+)"/);
    const targetM = attrs.match(/Target="([^"]+)"/);
    if (idM && targetM) {
      map[idM[1]] = {
        type: typeM ? typeM[1] : "",
        target: resolveZipTarget(baseDir, targetM[1]),
      };
    }
  }
  return map;
}

/**
 * Fallback extractor for legacy binary `.ppt` (OLE2 compound file) buffers.
 */
function extractLegacyPptSlides(buffer: Buffer): {
  text: string;
  slides: RichSlide[];
  aspectRatio: number;
} {
  const cleanRuns: string[] = [];
  const utf16 = buffer.toString("utf16le");
  const utf16Matches = utf16.match(/[\x20-\x7E\u00A0-\u024F]{5,}/g) || [];
  const noiseRegex =
    /^(PowerPoint|Microsoft|Times New Roman|Arial|Calibri|Tahoma|Verdana|Symbol|Wingdings|Root Entry|SummaryInformation|Current User|Pictures|Document|Slide\d*|_x\d+|[\W_]+)$/i;

  for (const m of utf16Matches) {
    const trimmed = m.replace(/\s+/g, " ").trim();
    if (trimmed.length >= 6 && /[a-zA-Z]{2,}/.test(trimmed) && !noiseRegex.test(trimmed)) {
      if (!cleanRuns.includes(trimmed)) cleanRuns.push(trimmed);
    }
  }

  if (cleanRuns.length < 3) {
    const latin = buffer.toString("latin1");
    const asciiMatches = latin.match(/[\x20-\x7E]{6,}/g) || [];
    for (const m of asciiMatches) {
      const trimmed = m.replace(/\s+/g, " ").trim();
      if (trimmed.length >= 6 && /[a-zA-Z]{3,}/.test(trimmed) && !noiseRegex.test(trimmed)) {
        if (!cleanRuns.includes(trimmed)) cleanRuns.push(trimmed);
      }
    }
  }

  const lines = cleanRuns.length > 0 ? cleanRuns : ["Legacy .ppt presentation loaded."];
  const linesPerSlide = 8;
  const slides: RichSlide[] = [];
  for (let i = 0; i < lines.length; i += linesPerSlide) {
    const chunk = lines.slice(i, i + linesPerSlide);
    const slideNumber = slides.length + 1;
    slides.push({
      slideNumber,
      title: chunk[0] || `Slide ${slideNumber}`,
      content: chunk,
      rawText: chunk.join("\n"),
      aspectRatio: 16 / 9,
      elements: [],
    });
  }

  return {
    text: slides.map((s) => `--- Slide ${s.slideNumber}: ${s.title} ---\n${s.rawText}`).join("\n\n"),
    slides,
    aspectRatio: 16 / 9,
  };
}

/**
 * Parse a PPTX file buffer with high visual and structural fidelity
 * Extracts slide order, master/layout inheritance, positions, backgrounds, images, tables, typography, and anti-overlap autofit
 */
export function parsePptx(buffer: Buffer): {
  text: string;
  slides: RichSlide[];
  aspectRatio: number;
} {
  try {
    // Handle legacy non-ZIP binary `.ppt` gracefully
    const isZip =
      buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b;
    if (!isZip) {
      return extractLegacyPptSlides(buffer);
    }

    const zip = new AdmZip(buffer);
    const zipEntries = zip.getEntries();

    // 1. Determine presentation dimensions, aspect ratio, and true slide order
    let sldWidth = 12192000;
    let sldHeight = 6858000;
    let presXml = "";
    try {
      presXml = zip.readAsText("ppt/presentation.xml") || "";
      const sizeMatch = presXml.match(/<p:sldSz\s+cx="(\d+)"\s+cy="(\d+)"/);
      if (sizeMatch) {
        sldWidth = parseInt(sizeMatch[1], 10) || 12192000;
        sldHeight = parseInt(sizeMatch[2], 10) || 6858000;
      }
    } catch {
      // default 16:9
    }

    const aspectRatio = sldWidth / sldHeight;
    // Scale OOXML point sizes into our virtual 960px slide width (default 960pt = 12192000 EMU => 1.0)
    const sldWidthPt = sldWidth / 12700;
    const ptScale =
      sldWidthPt > 0 ? Math.min(1.35, Math.max(0.45, 960 / sldWidthPt)) : 1;
    const baseHeight = Math.max(400, Math.round(960 / aspectRatio));

    // 2. Extract theme colors from ppt/theme/theme*.xml
    const themeColors: Record<string, string> = {
      dk1: "000000",
      lt1: "ffffff",
      dk2: "1f2937",
      lt2: "f3f4f6",
      accent1: "2563eb",
      accent2: "ea580c",
      accent3: "4b5563",
      accent4: "f59e0b",
      accent5: "3b82f6",
      accent6: "10b981",
      hlink: "2563eb",
      folHlink: "7c3aed",
    };

    try {
      const themeEntry = zipEntries.find((e) =>
        /^ppt\/theme\/theme\d+\.xml$/i.test(e.entryName)
      );
      if (themeEntry) {
        const tXml = themeEntry.getData().toString("utf8");
        const clrNames = [
          "dk1", "lt1", "dk2", "lt2",
          "accent1", "accent2", "accent3", "accent4", "accent5", "accent6",
          "hlink", "folHlink",
        ];
        for (const name of clrNames) {
          const reg = new RegExp(
            `<a:${name}>[\\s\\S]*?(?:val="([0-9a-fA-F]{6})"|lastClr="([0-9a-fA-F]{6})")`
          );
          const m = tXml.match(reg);
          if (m && (m[1] || m[2])) {
            themeColors[name] = m[1] || m[2];
          }
        }
      }
    } catch {}

    themeColors.bg1 = themeColors.lt1 || "ffffff";
    themeColors.tx1 = themeColors.dk1 || "000000";
    themeColors.bg2 = themeColors.lt2 || "f3f4f6";
    themeColors.tx2 = themeColors.dk2 || "1f2937";

    const resolveColor = (xmlChunk?: string): string | undefined => {
      if (!xmlChunk) return undefined;
      const srgb = xmlChunk.match(/<a:srgbClr\s+val="([0-9a-fA-F]{6})"/i);
      if (srgb) return `#${srgb[1]}`;
      const scheme = xmlChunk.match(/<a:schemeClr\s+val="([^"]+)"/i);
      if (scheme && themeColors[scheme[1]]) {
        let hex = themeColors[scheme[1]];
        const lumMod = xmlChunk.match(/<a:lumMod\s+val="(\d+)"/);
        const lumOff = xmlChunk.match(/<a:lumOff\s+val="(\d+)"/);
        if (lumMod || lumOff) {
          hex = adjustColor(
            hex,
            lumMod ? parseInt(lumMod[1], 10) : undefined,
            lumOff ? parseInt(lumOff[1], 10) : undefined
          );
        }
        return `#${hex}`;
      }
      const sys = xmlChunk.match(/<a:sysClr[^>]*lastClr="([0-9a-fA-F]{6})"/i);
      if (sys) return `#${sys[1]}`;
      return undefined;
    };

    const parseLevelStyles = (
      styleContainerXml?: string
    ): Record<number, LevelStyleDefaults> => {
      const levels: Record<number, LevelStyleDefaults> = {};
      if (!styleContainerXml) return levels;

      for (let lvlIdx = 0; lvlIdx <= 8; lvlIdx++) {
        const tagNum = lvlIdx + 1;
        const lvlM = styleContainerXml.match(
          new RegExp(
            `<a:lvl${tagNum}pPr([^>]*)>([\\s\\S]*?)<\\/a:lvl${tagNum}pPr>|<a:lvl${tagNum}pPr([^>]*?)\\/>`,
            "i"
          )
        );
        if (!lvlM) continue;
        const pPrAttr = lvlM[1] || lvlM[3] || "";
        const pPrInner = lvlM[2] || "";
        const combined = `<a:lvlpPr ${pPrAttr}>${pPrInner}</a:lvlpPr>`;

        let align: LevelStyleDefaults["align"];
        if (pPrAttr.includes('algn="ctr"')) align = "center";
        else if (pPrAttr.includes('algn="r"')) align = "right";
        else if (pPrAttr.includes('algn="just"')) align = "justify";
        else if (pPrAttr.includes('algn="l"')) align = "left";

        const defRPrXml =
          pPrInner.match(
            /<a:defRPr[^>]*>([\s\S]*?)<\/a:defRPr>|<a:defRPr[^>]*\/>/i
          )?.[0] || "";
        const szM = defRPrXml.match(/sz="(\d+)"/);
        const fontSize = szM
          ? Math.max(9, Math.round((parseInt(szM[1], 10) / 100) * ptScale))
          : undefined;
        const color = resolveColor(defRPrXml);
        const fontM = defRPrXml.match(/<a:latin\s+typeface="([^"+][^"]*)"/);
        const fontFamily = fontM ? fontM[1] : undefined;

        const buNone = combined.includes("<a:buNone");
        const buCharM = combined.match(/<a:buChar\s+[^>]*char="([^"]*)"/i);
        const bullet =
          !buNone &&
          (Boolean(buCharM) || combined.includes("<a:buAutoNum"));

        levels[lvlIdx] = {
          fontSize,
          color,
          align,
          fontFamily,
          bullet,
          buNone,
          bulletChar: buCharM?.[1] ? decodeXmlEntities(buCharM[1]) : undefined,
        };
      }

      // Also parse <a:defPPr> if present as level 0 fallback
      if (!levels[0]) {
        const defM = styleContainerXml.match(
          /<a:defPPr([^>]*)>([\s\S]*?)<\/a:defPPr>/i
        );
        if (defM) {
          const defRPr = defM[2].match(/<a:defRPr[\s\S]*?(?:<\/a:defRPr>|\/>)/i)?.[0] || "";
          const szM = defRPr.match(/sz="(\d+)"/);
          levels[0] = {
            fontSize: szM
              ? Math.max(9, Math.round((parseInt(szM[1], 10) / 100) * ptScale))
              : undefined,
            color: resolveColor(defRPr),
          };
        }
      }

      return levels;
    };

    const extractPlaceholdersFromXml = (
      rawXml: string
    ): {
      byIdx: Record<string, PlaceholderLayoutDef>;
      byType: Record<string, PlaceholderLayoutDef>;
    } => {
      const byIdx: Record<string, PlaceholderLayoutDef> = {};
      const byType: Record<string, PlaceholderLayoutDef> = {};
      const cleanXml = stripAlternateFallback(rawXml);
      const spTreeM = cleanXml.match(/<p:spTree>([\s\S]*?)<\/p:spTree>/i);
      if (!spTreeM) return { byIdx, byType };

      const collect = (xmlSegment: string) => {
        for (const tok of extractTopLevelSpTreeTokens(xmlSegment)) {
          if (tok.tag === "grpSp") {
            const inner = tok.innerXml.replace(/^[\s\S]*?<\/p:grpSpPr>/i, "");
            collect(inner);
            continue;
          }
          if (tok.tag !== "sp") continue;

          const nvSpPr =
            tok.innerXml.match(/<p:nvSpPr>([\s\S]*?)<\/p:nvSpPr>/i)?.[1] || "";
          const phM = nvSpPr.match(/<p:ph\s+([^>]*?)\/?>/i);
          if (!phM) continue;

          const phAttrs = phM[1];
          const typeM = phAttrs.match(/type="([^"]+)"/);
          const idxM = phAttrs.match(/idx="([^"]+)"/);
          const phType = typeM?.[1];
          const phIdx = idxM?.[1];

          const spPr =
            tok.innerXml.match(/<p:spPr>([\s\S]*?)<\/p:spPr>/i)?.[1] || "";
          const offM = spPr.match(/<a:off\s+x="(-?\d+)"\s+y="(-?\d+)"/);
          const extM = spPr.match(/<a:ext\s+cx="(\d+)"\s+cy="(\d+)"/);

          const spPrNoLn = spPr.replace(/<a:ln[\s>][\s\S]*?<\/a:ln>/gi, "");
          let shapeBg: string | undefined;
          if (!spPrNoLn.includes("<a:noFill")) {
            const sfM =
              spPrNoLn.match(/<a:solidFill>[\s\S]*?<\/a:solidFill>/i) ||
              spPrNoLn.match(/<a:gradFill>[\s\S]*?<\/a:gradFill>/i);
            if (sfM) shapeBg = resolveColor(sfM[0]);
          }

          let borderColor: string | undefined;
          let borderWidth: number | undefined;
          const lnM = spPr.match(/<a:ln([^>]*)>([\s\S]*?)<\/a:ln>/i);
          if (lnM && !lnM[2].includes("<a:noFill")) {
            const lc = resolveColor(lnM[2]);
            if (lc) {
              borderColor = lc;
              const wM = lnM[1].match(/w="(\d+)"/);
              borderWidth = wM
                ? Math.max(1, Math.round(parseInt(wM[1], 10) / 12700))
                : 1;
            }
          }

          let borderRadius: number | undefined;
          if (spPr.includes('prst="ellipse"')) borderRadius = 9999;
          else if (spPr.includes('prst="roundRect"')) borderRadius = 12;

          const txBody =
            tok.innerXml.match(/<p:txBody>([\s\S]*?)<\/p:txBody>/i)?.[1] || "";
          const bodyPr =
            txBody.match(
              /<a:bodyPr[^>]*>([\s\S]*?)<\/a:bodyPr>|<a:bodyPr[^>]*\/>/i
            )?.[0] || "";
          const anchorM = bodyPr.match(/anchor="([^"]+)"/);
          const verticalAlign: PlaceholderLayoutDef["verticalAlign"] =
            anchorM?.[1] === "ctr"
              ? "center"
              : anchorM?.[1] === "b"
                ? "bottom"
                : anchorM?.[1] === "t"
                  ? "top"
                  : undefined;

          const lstStyleXml =
            txBody.match(/<a:lstStyle>([\s\S]*?)<\/a:lstStyle>/i)?.[1] || "";
          const lvlStyles = parseLevelStyles(lstStyleXml);

          const def: PlaceholderLayoutDef = {
            type: phType,
            idx: phIdx,
            x: offM ? parseInt(offM[1], 10) : undefined,
            y: offM ? parseInt(offM[2], 10) : undefined,
            cx: extM ? parseInt(extM[1], 10) : undefined,
            cy: extM ? parseInt(extM[2], 10) : undefined,
            shapeBg,
            borderColor,
            borderWidth,
            borderRadius,
            verticalAlign,
            lvlStyles,
          };

          if (phIdx && !byIdx[phIdx]) byIdx[phIdx] = def;
          if (phType && !byType[phType]) byType[phType] = def;
        }
      };

      collect(spTreeM[1]);
      return { byIdx, byType };
    };

    const parseBackgroundFromXml = (
      xmlChunk: string,
      rels: Record<string, { type: string; target: string }>,
      mediaMapObj: Record<string, string>
    ): { bgColor?: string; bgImage?: string } => {
      const bgMatch = xmlChunk.match(/<p:bg>([\s\S]*?)<\/p:bg>/i);
      if (!bgMatch) return {};
      const bgInner = bgMatch[1];

      let bgImage: string | undefined;
      const imgM = bgInner.match(/r:embed="([^"]+)"/);
      if (imgM && rels[imgM[1]]) {
        const mediaKey = rels[imgM[1]].target;
        if (mediaMapObj[mediaKey]) bgImage = mediaMapObj[mediaKey];
      }

      let bgColor: string | undefined;
      const solidOrGrad =
        bgInner.match(/<a:solidFill>[\s\S]*?<\/a:solidFill>/i) ||
        bgInner.match(/<a:gradFill>[\s\S]*?<\/a:gradFill>/i) ||
        bgInner.match(/<p:bgRef[^>]*>([\s\S]*?)<\/p:bgRef>/i);
      if (solidOrGrad) {
        bgColor = resolveColor(solidOrGrad[0]);
      }

      return { bgColor, bgImage };
    };

    // 3. Pre-index all media images in the PPTX archive by normalized full entry path (`ppt/media/...`)
    const mediaMap: Record<string, string> = {};
    zipEntries.forEach((entry) => {
      if (entry.entryName.startsWith("ppt/media/")) {
        const ext = entry.entryName.split(".").pop()?.toLowerCase() || "png";
        const mime =
          ext === "png"
            ? "image/png"
            : ext === "jpg" || ext === "jpeg"
              ? "image/jpeg"
              : ext === "svg"
                ? "image/svg+xml"
                : ext === "gif"
                  ? "image/gif"
                  : "image/png";
        const base64 = entry.getData().toString("base64");
        mediaMap[entry.entryName] = `data:${mime};base64,${base64}`;
      }
    });

    // 4. Resolve true presentation slide order via `<p:sldIdLst>` + `ppt/_rels/presentation.xml.rels`
    const presRels: Record<string, { type: string; target: string }> = {};
    try {
      const prXml = zip.readAsText("ppt/_rels/presentation.xml.rels");
      if (prXml) {
        Object.assign(presRels, parseRelationshipsXml(prXml, "ppt"));
      }
    } catch {}

    const orderedEntryNames: string[] = [];
    const sldIdLstM = presXml.match(/<p:sldIdLst>([\s\S]*?)<\/p:sldIdLst>/i);
    if (sldIdLstM) {
      for (const sldM of Array.from(
        sldIdLstM[1].matchAll(/<p:sldId\s+([^>]+?)\/?\s*>/g)
      )) {
        const ridM = sldM[1].match(/r:id="([^"]+)"/);
        const relTarget = ridM ? presRels[ridM[1]]?.target : undefined;
        if (relTarget && !orderedEntryNames.includes(relTarget)) {
          orderedEntryNames.push(relTarget);
        }
      }
    }

    const numericSlideEntries = zipEntries
      .filter((entry) => /^ppt\/slides\/slide\d+\.xml$/i.test(entry.entryName))
      .sort((a, b) => {
        const numA = parseInt(a.entryName.match(/slide(\d+)\.xml/i)?.[1] || "0", 10);
        const numB = parseInt(b.entryName.match(/slide(\d+)\.xml/i)?.[1] || "0", 10);
        return numA - numB;
      });

    const entryByName = new Map(zipEntries.map((e) => [e.entryName, e]));
    const slideEntries =
      orderedEntryNames.length > 0
        ? [
            ...orderedEntryNames
              .map((name) => entryByName.get(name))
              .filter((e): e is AdmZip.IZipEntry => Boolean(e)),
            ...numericSlideEntries.filter((e) => !orderedEntryNames.includes(e.entryName)),
          ]
        : numericSlideEntries;

    // Cache parsed layouts and masters across slides
    const layoutCache = new Map<
      string,
      {
        xml: string;
        rels: Record<string, { type: string; target: string }>;
        placeholders: ReturnType<typeof extractPlaceholdersFromXml>;
        masterPath?: string;
      }
    >();

    const masterCache = new Map<
      string,
      {
        xml: string;
        rels: Record<string, { type: string; target: string }>;
        placeholders: ReturnType<typeof extractPlaceholdersFromXml>;
        titleStyles: Record<number, LevelStyleDefaults>;
        bodyStyles: Record<number, LevelStyleDefaults>;
        otherStyles: Record<number, LevelStyleDefaults>;
      }
    >();

    const getMasterData = (masterPath: string) => {
      if (masterCache.has(masterPath)) return masterCache.get(masterPath)!;
      let mXml = "";
      try {
        mXml = zip.readAsText(masterPath) || "";
      } catch {}
      const relsPath = masterPath.replace(
        /ppt\/slideMasters\/([^/]+)$/,
        "ppt/slideMasters/_rels/$1.rels"
      );
      let mRels: Record<string, { type: string; target: string }> = {};
      try {
        const rXml = zip.readAsText(relsPath);
        if (rXml) mRels = parseRelationshipsXml(rXml, "ppt/slideMasters");
      } catch {}

      const placeholders = extractPlaceholdersFromXml(mXml);
      const txStylesXml = mXml.match(/<p:txStyles>([\s\S]*?)<\/p:txStyles>/i)?.[1] || "";
      const titleStyles = parseLevelStyles(
        txStylesXml.match(/<p:titleStyle>([\s\S]*?)<\/p:titleStyle>/i)?.[1]
      );
      const bodyStyles = parseLevelStyles(
        txStylesXml.match(/<p:bodyStyle>([\s\S]*?)<\/p:bodyStyle>/i)?.[1]
      );
      const otherStyles = parseLevelStyles(
        txStylesXml.match(/<p:otherStyle>([\s\S]*?)<\/p:otherStyle>/i)?.[1]
      );

      const val = {
        xml: mXml,
        rels: mRels,
        placeholders,
        titleStyles,
        bodyStyles,
        otherStyles,
      };
      masterCache.set(masterPath, val);
      return val;
    };

    const getLayoutData = (layoutPath: string) => {
      if (layoutCache.has(layoutPath)) return layoutCache.get(layoutPath)!;
      let lXml = "";
      try {
        lXml = zip.readAsText(layoutPath) || "";
      } catch {}
      const relsPath = layoutPath.replace(
        /ppt\/slideLayouts\/([^/]+)$/,
        "ppt/slideLayouts/_rels/$1.rels"
      );
      let lRels: Record<string, { type: string; target: string }> = {};
      let masterPath: string | undefined;
      try {
        const rXml = zip.readAsText(relsPath);
        if (rXml) {
          lRels = parseRelationshipsXml(rXml, "ppt/slideLayouts");
          masterPath = Object.values(lRels).find((r) =>
            r.type.includes("slideMaster")
          )?.target;
        }
      } catch {}

      const val = {
        xml: lXml,
        rels: lRels,
        placeholders: extractPlaceholdersFromXml(lXml),
        masterPath,
      };
      layoutCache.set(layoutPath, val);
      return val;
    };

    const slides: RichSlide[] = [];
    let fullText = "";

    slideEntries.forEach((entry, idx) => {
      const slideNum = idx + 1;
      const rawXml = entry.getData().toString("utf8");
      const xml = stripAlternateFallback(rawXml);

      const relsFile = entry.entryName.replace(
        "ppt/slides/",
        "ppt/slides/_rels/"
      ) + ".rels";
      let relsMap: Record<string, { type: string; target: string }> = {};
      let layoutPath: string | undefined;
      try {
        const rXml = zip.readAsText(relsFile);
        if (rXml) {
          relsMap = parseRelationshipsXml(rXml, "ppt/slides");
          layoutPath = Object.values(relsMap).find((r) =>
            r.type.includes("slideLayout")
          )?.target;
        }
      } catch {}

      const layoutData = layoutPath ? getLayoutData(layoutPath) : undefined;
      const masterPath =
        layoutData?.masterPath || "ppt/slideMasters/slideMaster1.xml";
      const masterData = getMasterData(masterPath);

      // Extract slide background color/image via inheritance: slide -> layout -> master
      const slideBg = parseBackgroundFromXml(xml, relsMap, mediaMap);
      const layBg = layoutData
        ? parseBackgroundFromXml(layoutData.xml, layoutData.rels, mediaMap)
        : {};
      const masBg = parseBackgroundFromXml(
        masterData.xml,
        masterData.rels,
        mediaMap
      );

      const bgColor =
        slideBg.bgColor || layBg.bgColor || masBg.bgColor || "#ffffff";
      const bgImage = slideBg.bgImage || layBg.bgImage || masBg.bgImage;

      const defaultTitleSize =
        masterData.titleStyles[0]?.fontSize || Math.round(36 * ptScale);
      const defaultTitleColor =
        masterData.titleStyles[0]?.color || `#${themeColors.tx1}`;
      const defaultBodySize =
        masterData.bodyStyles[0]?.fontSize || Math.round(20 * ptScale);
      const defaultBodyColor =
        masterData.bodyStyles[0]?.color || `#${themeColors.tx1}`;

      const lookupPlaceholder = (
        phType?: string,
        phIdx?: string
      ): PlaceholderLayoutDef | undefined => {
        const findIn = (map?: {
          byIdx: Record<string, PlaceholderLayoutDef>;
          byType: Record<string, PlaceholderLayoutDef>;
        }) => {
          if (!map) return undefined;
          if (phIdx && map.byIdx[phIdx]) return map.byIdx[phIdx];
          if (phType && map.byType[phType]) return map.byType[phType];
          if (phType === "ctrTitle" && map.byType["title"]) return map.byType["title"];
          if (phType === "subTitle" && map.byType["body"]) return map.byType["body"];
          if (phType === "obj" && map.byType["body"]) return map.byType["body"];
          return undefined;
        };
        return (
          findIn(layoutData?.placeholders) || findIn(masterData.placeholders)
        );
      };

      const elements: SlideElement[] = [];
      const contentParagraphs: string[] = [];

      // Keep track of raw autofit candidate metadata so we can apply neighbor anti-overlap pass after all shapes are placed
      interface PendingTextShape {
        elementIndex: number;
        leftPct: number;
        topPct: number;
        widthPct: number;
        heightPct: number;
        hasBoxStyling: boolean;
        autofitScale: number;
      }
      const pendingTextShapes: PendingTextShape[] = [];

      const clampPct = (val: number, min = 0, max = 100) =>
        Math.min(max, Math.max(min, val));

      const computeNormalizedBox = (
        rawEffX: number,
        rawEffY: number,
        rawEffCx: number,
        rawEffCy: number
      ) => {
        const clippedX = rawEffX < 0 ? 0 : rawEffX;
        const clippedY = rawEffY < 0 ? 0 : rawEffY;
        const adjCx = rawEffX < 0 ? Math.max(0, rawEffCx + rawEffX) : rawEffCx;
        const adjCy = rawEffY < 0 ? Math.max(0, rawEffCy + rawEffY) : rawEffCy;

        const leftPct = clampPct((clippedX / sldWidth) * 100, 0, 98);
        const topPct = clampPct((clippedY / sldHeight) * 100, 0, 98);
        const widthPct = clampPct((adjCx / sldWidth) * 100, 1.5, 100 - leftPct);
        const heightPct = clampPct((adjCy / sldHeight) * 100, 1.5, 100 - topPct);
        return { leftPct, topPct, widthPct, heightPct };
      };

      function extractShapesFromXml(
        treeXml: string,
        gx: number,
        gy: number,
        scaleX: number,
        scaleY: number
      ) {
        for (const tok of extractTopLevelSpTreeTokens(treeXml)) {
          const zIdx = elements.length + 1;

          // A. Group Shape (<p:grpSp>)
          if (tok.tag === "grpSp") {
            const grpXml = tok.innerXml;
            const grpPrXml =
              grpXml.match(/<p:grpSpPr>([\s\S]*?)<\/p:grpSpPr>/i)?.[1] || "";
            const offM = grpPrXml.match(/<a:off\s+x="(-?\d+)"\s+y="(-?\d+)"/);
            const extM = grpPrXml.match(/<a:ext\s+cx="(\d+)"\s+cy="(\d+)"/);
            const chOffM = grpPrXml.match(/<a:chOff\s+x="(-?\d+)"\s+y="(-?\d+)"/);
            const chExtM = grpPrXml.match(/<a:chExt\s+cx="(\d+)"\s+cy="(\d+)"/);

            const curGx = offM ? parseInt(offM[1], 10) : 0;
            const curGy = offM ? parseInt(offM[2], 10) : 0;
            const curGcx = extM ? parseInt(extM[1], 10) : 1;
            const curGcy = extM ? parseInt(extM[2], 10) : 1;
            const curChx = chOffM ? parseInt(chOffM[1], 10) : 0;
            const curChy = chOffM ? parseInt(chOffM[2], 10) : 0;
            const curChcx = chExtM ? parseInt(chExtM[1], 10) : curGcx;
            const curChcy = chExtM ? parseInt(chExtM[2], 10) : curGcy;

            const sX = curChcx > 0 ? curGcx / curChcx : 1;
            const sY = curChcy > 0 ? curGcy / curChcy : 1;

            const childBaseX = gx + (curGx - curChx * sX) * scaleX;
            const childBaseY = gy + (curGy - curChy * sY) * scaleY;
            const innerChildrenXml = grpXml.replace(/^[\s\S]*?<\/p:grpSpPr>/i, "");

            extractShapesFromXml(
              innerChildrenXml,
              childBaseX,
              childBaseY,
              scaleX * sX,
              scaleY * sY
            );
            continue;
          }

          // B. Picture (<p:pic>)
          if (tok.tag === "pic") {
            const pXml = tok.innerXml;
            const blipM = pXml.match(/r:embed="([^"]+)"/);
            const offM = pXml.match(/<a:off\s+x="(-?\d+)"\s+y="(-?\d+)"/);
            const extM = pXml.match(/<a:ext\s+cx="(\d+)"\s+cy="(\d+)"/);
            const rId = blipM ? blipM[1] : null;
            const target = rId ? relsMap[rId]?.target : null;

            const px = offM ? parseInt(offM[1], 10) : 0;
            const py = offM ? parseInt(offM[2], 10) : 0;
            const pcx = extM ? parseInt(extM[1], 10) : 0;
            const pcy = extM ? parseInt(extM[2], 10) : 0;

            if (target && mediaMap[target] && pcx > 0 && pcy > 0) {
              const { leftPct, topPct, widthPct, heightPct } = computeNormalizedBox(
                gx + px * scaleX,
                gy + py * scaleY,
                pcx * scaleX,
                pcy * scaleY
              );
              elements.push({
                id: `pic_${elements.length}`,
                type: "image",
                left: `${leftPct.toFixed(2)}%`,
                top: `${topPct.toFixed(2)}%`,
                width: `${widthPct.toFixed(2)}%`,
                height: `${heightPct.toFixed(2)}%`,
                zIndex: zIdx,
                src: mediaMap[target],
              });
            }
            continue;
          }

          // C. Graphic Frame (Tables, SmartArt Diagrams & Charts) (<p:graphicFrame>)
          if (tok.tag === "graphicFrame") {
            const gfXml = tok.innerXml;
            const offM = gfXml.match(/<a:off\s+x="(-?\d+)"\s+y="(-?\d+)"/);
            const extM = gfXml.match(/<a:ext\s+cx="(\d+)"\s+cy="(\d+)"/);

            const fx = offM ? parseInt(offM[1], 10) : 0;
            const fy = offM ? parseInt(offM[2], 10) : 0;
            const fcx = extM ? parseInt(extM[1], 10) : 0;
            const fcy = extM ? parseInt(extM[2], 10) : 0;

            const hasValidBox = fcx > 0 && fcy > 0;
            const box = hasValidBox
              ? computeNormalizedBox(
                  gx + fx * scaleX,
                  gy + fy * scaleY,
                  fcx * scaleX,
                  fcy * scaleY
                )
              : { leftPct: 5, topPct: 20, widthPct: 90, heightPct: 60 };

            const tblMatch = gfXml.match(/<a:tbl>([\s\S]*?)<\/a:tbl>/i);
            if (tblMatch) {
              const trMatches =
                tblMatch[1].match(/<a:tr[\s>][\s\S]*?<\/a:tr>/gi) || [];
              const rows: Array<
                Array<{
                  text: string;
                  bold?: boolean;
                  align?: string;
                  bgColor?: string;
                  color?: string;
                }>
              > = [];

              for (const trXml of trMatches) {
                const tcMatches =
                  trXml.match(/<a:tc[\s>][\s\S]*?<\/a:tc>/gi) || [];
                const cells: Array<{
                  text: string;
                  bold?: boolean;
                  align?: string;
                  bgColor?: string;
                  color?: string;
                }> = [];

                for (const tcXml of tcMatches) {
                  const cellText = decodeXmlEntities(
                    Array.from(tcXml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g))
                      .map((m) => m[1])
                      .join(" ")
                      .trim()
                  );
                  const bold = tcXml.includes('b="1"');
                  const tcPrXml =
                    tcXml.match(/<a:tcPr[^>]*>([\s\S]*?)<\/a:tcPr>/i)?.[1] || "";
                  const fillMatch = tcPrXml.match(
                    /<a:solidFill>[\s\S]*?<\/a:solidFill>/i
                  );
                  const cellBg = fillMatch ? resolveColor(fillMatch[0]) : undefined;
                  const cellClrMatch = tcXml.match(
                    /<a:rPr[^>]*>[\s\S]*?(<a:solidFill>[\s\S]*?<\/a:solidFill>)/i
                  );
                  const cellClr = cellClrMatch
                    ? resolveColor(cellClrMatch[1])
                    : undefined;
                  if (cellText) contentParagraphs.push(cellText);
                  cells.push({
                    text: cellText,
                    bold,
                    bgColor: cellBg,
                    color: cellClr,
                  });
                }
                if (cells.length > 0) rows.push(cells);
              }

              if (rows.length > 0) {
                elements.push({
                  id: `tbl_${elements.length}`,
                  type: "table",
                  left: `${box.leftPct.toFixed(2)}%`,
                  top: `${box.topPct.toFixed(2)}%`,
                  width: `${box.widthPct.toFixed(2)}%`,
                  height: `${box.heightPct.toFixed(2)}%`,
                  zIndex: zIdx,
                  rows,
                });
              }
              continue;
            }

            // Extract SmartArt diagrams or Chart titles/labels if present
            const dgmMatch = gfXml.match(/r:dm="([^"]+)"/);
            const chartMatch = gfXml.match(/<c:chart[^>]*r:id="([^"]+)"/i);
            const relId = dgmMatch?.[1] || chartMatch?.[1];
            const relTarget = relId ? relsMap[relId]?.target : undefined;

            if (relTarget) {
              try {
                const subXml = zip.readAsText(relTarget);
                if (subXml) {
                  const extractedItems = Array.from(
                    subXml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)
                  )
                    .map((m) => decodeXmlEntities(m[1]).replace(/\s+/g, " ").trim())
                    .filter((t, i, arr) => t.length > 0 && arr.indexOf(t) === i)
                    .slice(0, 16);

                  if (extractedItems.length > 0) {
                    contentParagraphs.push(...extractedItems);
                    const paragraphs = extractedItems.map((line) => ({
                      align: "left" as const,
                      bullet: Boolean(dgmMatch),
                      runs: [
                        {
                          text: line,
                          color: defaultBodyColor,
                          size: Math.max(11, Math.round(13 * ptScale)),
                        },
                      ],
                    }));

                    const elementIndex = elements.length;
                    elements.push({
                      id: `gf_${elementIndex}`,
                      type: "text",
                      left: `${box.leftPct.toFixed(2)}%`,
                      top: `${box.topPct.toFixed(2)}%`,
                      width: `${box.widthPct.toFixed(2)}%`,
                      height: `${box.heightPct.toFixed(2)}%`,
                      zIndex: zIdx,
                      bgColor: "#f8fafc",
                      borderColor: "#cbd5e1",
                      borderWidth: 1,
                      borderRadius: 8,
                      verticalAlign: "center",
                      paragraphs,
                      rawText: extractedItems.join("\n"),
                    });
                    pendingTextShapes.push({
                      elementIndex,
                      ...box,
                      hasBoxStyling: true,
                      autofitScale: 1,
                    });
                  }
                }
              } catch {}
            }
            continue;
          }

          // D. Shape / Text Box (<p:sp>)
          if (tok.tag === "sp") {
            const spXml = tok.innerXml;
            const nvSpPrXml =
              spXml.match(/<p:nvSpPr>([\s\S]*?)<\/p:nvSpPr>/i)?.[1] || "";
            const spPrXml =
              spXml.match(/<p:spPr>([\s\S]*?)<\/p:spPr>/i)?.[1] || "";
            const txBodyXml =
              spXml.match(/<p:txBody>([\s\S]*?)<\/p:txBody>/i)?.[1] || "";

            const phM = nvSpPrXml.match(/<p:ph\s+([^>]*?)\/?>/i);
            const phAttrs = phM?.[1] || "";
            const phType = phAttrs.match(/type="([^"]+)"/)?.[1];
            const phIdx = phAttrs.match(/idx="([^"]+)"/)?.[1];
            const phDef = phM ? lookupPlaceholder(phType, phIdx) : undefined;

            const offM = spPrXml.match(/<a:off\s+x="(-?\d+)"\s+y="(-?\d+)"/);
            const extM = spPrXml.match(/<a:ext\s+cx="(\d+)"\s+cy="(\d+)"/);

            const sx = offM ? parseInt(offM[1], 10) : phDef?.x ?? 0;
            const sy = offM ? parseInt(offM[2], 10) : phDef?.y ?? 0;
            const scx = extM ? parseInt(extM[1], 10) : phDef?.cx ?? 0;
            const scy = extM ? parseInt(extM[2], 10) : phDef?.cy ?? 0;

            const rawEffX = gx + sx * scaleX;
            const rawEffY = gy + sy * scaleY;
            const effCx = scx * scaleX;
            const effCy = scy * scaleY;

            // Check if shape has an image fill (<a:blipFill>) inside <p:spPr>
            let shapeBlipSrc: string | undefined;
            const spBlipM = spPrXml.match(/<a:blipFill>[\s\S]*?r:embed="([^"]+)"/i);
            if (spBlipM && relsMap[spBlipM[1]]) {
              const target = relsMap[spBlipM[1]].target;
              if (mediaMap[target]) shapeBlipSrc = mediaMap[target];
            }

            // Shape background fill (strictly inside <p:spPr>, excluding <a:ln>)
            let shapeBg: string | undefined;
            const spPrWithoutLn = spPrXml.replace(/<a:ln[\s>][\s\S]*?<\/a:ln>/gi, "");
            if (!spPrWithoutLn.includes("<a:noFill")) {
              const sFillM =
                spPrWithoutLn.match(/<a:solidFill>[\s\S]*?<\/a:solidFill>/i) ||
                spPrWithoutLn.match(/<a:gradFill>[\s\S]*?<\/a:gradFill>/i);
              if (sFillM) shapeBg = resolveColor(sFillM[0]);
              else shapeBg = phDef?.shapeBg;
            }

            // Shape border / outline (<a:ln> inside <p:spPr>)
            let borderColor: string | undefined = phDef?.borderColor;
            let borderWidth: number | undefined = phDef?.borderWidth;
            const lnM = spPrXml.match(/<a:ln([^>]*)>([\s\S]*?)<\/a:ln>/i);
            if (lnM) {
              if (lnM[2].includes("<a:noFill")) {
                borderColor = undefined;
                borderWidth = undefined;
              } else {
                const lnClr = resolveColor(lnM[2]);
                if (lnClr) {
                  borderColor = lnClr;
                  const wM = lnM[1].match(/w="(\d+)"/);
                  borderWidth = wM
                    ? Math.max(1, Math.round(parseInt(wM[1], 10) / 12700))
                    : 1;
                }
              }
            }

            let borderRadius: number | undefined = phDef?.borderRadius;
            if (spPrXml.includes('prst="ellipse"')) borderRadius = 9999;
            else if (spPrXml.includes('prst="roundRect"')) borderRadius = 12;

            // Vertical alignment on text container
            let verticalAlign: "top" | "center" | "bottom" =
              phDef?.verticalAlign || "top";
            const bodyPrXml =
              txBodyXml.match(
                /<a:bodyPr[^>]*>([\s\S]*?)<\/a:bodyPr>|<a:bodyPr[^>]*\/>/i
              )?.[0] || "";
            const anchorM = bodyPrXml.match(/anchor="([^"]+)"/);
            if (anchorM) {
              if (anchorM[1] === "ctr") verticalAlign = "center";
              else if (anchorM[1] === "b") verticalAlign = "bottom";
              else if (anchorM[1] === "t") verticalAlign = "top";
            }

            const isTitleShape =
              phType === "title" ||
              phType === "ctrTitle" ||
              nvSpPrXml.includes('type="title"') ||
              nvSpPrXml.includes('type="ctrTitle"');
            const isSlideNum =
              phType === "sldNum" ||
              phType === "ftr" ||
              phType === "dt" ||
              nvSpPrXml.includes('type="sldNum"');
            const isBodyPlaceholder =
              !isTitleShape &&
              !isSlideNum &&
              (phType === "body" ||
                phType === "subTitle" ||
                phType === "obj" ||
                phIdx === "1" ||
                nvSpPrXml.includes('type="body"') ||
                nvSpPrXml.includes('idx="1"'));

            const lstStyleXml =
              txBodyXml.match(/<a:lstStyle>([\s\S]*?)<\/a:lstStyle>/i)?.[1] || "";
            const shapeLvlStyles = parseLevelStyles(lstStyleXml);
            const masterStyleMap = isTitleShape
              ? masterData.titleStyles
              : isBodyPlaceholder
                ? masterData.bodyStyles
                : masterData.otherStyles;

            // Explicit normAutofit fontScale in <a:bodyPr>
            let autofitScale = 1;
            const fontScaleM = bodyPrXml.match(/fontScale="(\d+)"/);
            if (fontScaleM) {
              autofitScale = Math.max(
                0.5,
                Math.min(1, parseInt(fontScaleM[1], 10) / 100000)
              );
            }

            const pMatches =
              txBodyXml.match(/<a:p[\s>][\s\S]*?<\/a:p>/gi) || [];
            const paragraphs: NonNullable<SlideElement["paragraphs"]> = [];

            const firstExplicitSz = txBodyXml.match(/sz="(\d+)"/);
            const firstExplicitScaled = firstExplicitSz
              ? Math.max(9, Math.round((parseInt(firstExplicitSz[1], 10) / 100) * ptScale))
              : undefined;

            for (const pXml of pMatches) {
              const pPrXml =
                pXml.match(
                  /<a:pPr[^>]*>([\s\S]*?)<\/a:pPr>|<a:pPr[^>]*\/>/i
                )?.[0] || "";
              const pLvlM = pPrXml.match(/lvl="(\d+)"/);
              const lvl = pLvlM ? Math.min(8, Math.max(0, parseInt(pLvlM[1], 10))) : 0;

              const shLvl = shapeLvlStyles[lvl] || shapeLvlStyles[0];
              const phLvl = phDef?.lvlStyles?.[lvl] || phDef?.lvlStyles?.[0];
              const msLvl = masterStyleMap[lvl] || masterStyleMap[0];

              let align: "left" | "center" | "right" | "justify" =
                shLvl?.align ||
                phLvl?.align ||
                msLvl?.align ||
                (phType === "ctrTitle" ? "center" : "left");
              if (pPrXml.includes('algn="ctr"')) align = "center";
              else if (pPrXml.includes('algn="r"')) align = "right";
              else if (pPrXml.includes('algn="just"')) align = "justify";
              else if (pPrXml.includes('algn="l"')) align = "left";

              const pDefRPrXml =
                pPrXml.match(
                  /<a:defRPr[^>]*>([\s\S]*?)<\/a:defRPr>|<a:defRPr[^>]*\/>/i
                )?.[0] || "";
              const defClr =
                resolveColor(pDefRPrXml) ||
                shLvl?.color ||
                phLvl?.color ||
                msLvl?.color;
              const pDefSzM = pDefRPrXml.match(/sz="(\d+)"/);
              const pDefSize = pDefSzM
                ? Math.max(9, Math.round((parseInt(pDefSzM[1], 10) / 100) * ptScale))
                : undefined;
              const pDefFontM = pDefRPrXml.match(
                /<a:latin\s+typeface="([^"+][^"]*)"/
              );
              const pDefFont =
                pDefFontM?.[1] ||
                shLvl?.fontFamily ||
                phLvl?.fontFamily ||
                msLvl?.fontFamily;

              let hasBullet = false;
              let bulletChar: string | undefined;
              const pBuCharM = pPrXml.match(/<a:buChar\s+[^>]*char="([^"]*)"/i);
              if (pPrXml.includes("<a:buNone")) {
                hasBullet = false;
              } else if (pBuCharM || pPrXml.includes("<a:buAutoNum")) {
                hasBullet = true;
                bulletChar = pBuCharM?.[1] ? decodeXmlEntities(pBuCharM[1]) : undefined;
              } else if (shLvl?.buNone) {
                hasBullet = false;
              } else if (shLvl?.bullet) {
                hasBullet = true;
                bulletChar = shLvl.bulletChar;
              } else if (phLvl?.buNone) {
                hasBullet = false;
              } else if (phLvl?.bullet) {
                hasBullet = true;
                bulletChar = phLvl.bulletChar;
              } else if (isBodyPlaceholder && !msLvl?.buNone) {
                hasBullet = Boolean(msLvl?.bullet);
                bulletChar = msLvl?.bulletChar;
              }

              const runMatches =
                pXml.match(
                  /<a:r[\s>][\s\S]*?<\/a:r>|<a:fld[\s>][\s\S]*?<\/a:fld>|<a:br[\s>][\s\S]*?<\/a:br>|<a:br\s*\/>/gi
                ) || [];
              const runs: NonNullable<SlideElement["paragraphs"]>[number]["runs"] =
                [];

              const fallbackLvlSize =
                shLvl?.fontSize ||
                phLvl?.fontSize ||
                msLvl?.fontSize ||
                firstExplicitScaled ||
                (isTitleShape
                  ? defaultTitleSize
                  : isBodyPlaceholder
                    ? defaultBodySize
                    : isSlideNum
                      ? Math.round(11 * ptScale)
                      : Math.round(18 * ptScale));

              for (const rXml of runMatches) {
                if (/^<a:br[\s/>]/i.test(rXml)) {
                  runs.push({ text: "\n" });
                  continue;
                }

                const tMatch = rXml.match(/<a:t>([\s\S]*?)<\/a:t>/);
                if (!tMatch) continue;
                const text = decodeXmlEntities(tMatch[1]);
                if (!text) continue;

                const rPrXml =
                  rXml.match(
                    /<a:rPr[^>]*>([\s\S]*?)<\/a:rPr>|<a:rPr[^>]*\/>/i
                  )?.[0] || "";

                const bold = rPrXml.includes('b="1"');
                const italic = rPrXml.includes('i="1"');
                const underline = rPrXml.includes('u="sng"');

                const color =
                  resolveColor(rPrXml) ||
                  defClr ||
                  (isTitleShape && shapeBg
                    ? "#ffffff"
                    : isTitleShape
                      ? defaultTitleColor
                      : defaultBodyColor);

                const szM = rPrXml.match(/sz="(\d+)"/);
                const rawSize = szM
                  ? Math.max(9, Math.round((parseInt(szM[1], 10) / 100) * ptScale))
                  : pDefSize || fallbackLvlSize;

                const fontM = rPrXml.match(/<a:latin\s+typeface="([^"+][^"]*)"/);
                const fontFamily = fontM ? fontM[1] : pDefFont;

                runs.push({
                  text,
                  bold,
                  italic,
                  underline,
                  color,
                  size: rawSize,
                  fontFamily,
                });
              }

              const visibleParaText = runs.map((r) => r.text).join("").trim();
              if (runs.length > 0 && visibleParaText.length > 0) {
                paragraphs.push({
                  align,
                  bullet: hasBullet,
                  bulletChar,
                  level: lvl,
                  runs,
                });
                contentParagraphs.push(visibleParaText);
              }
            }

            // Image-fill shape with no text
            if (shapeBlipSrc && paragraphs.length === 0 && effCx > 0 && effCy > 0) {
              const box = computeNormalizedBox(rawEffX, rawEffY, effCx, effCy);
              elements.push({
                id: `sp_img_${elements.length}`,
                type: "image",
                left: `${box.leftPct.toFixed(2)}%`,
                top: `${box.topPct.toFixed(2)}%`,
                width: `${box.widthPct.toFixed(2)}%`,
                height: `${box.heightPct.toFixed(2)}%`,
                zIndex: zIdx,
                src: shapeBlipSrc,
              });
              continue;
            }

            if (paragraphs.length > 0 || (shapeBg && effCx > 0 && effCy > 0) || borderColor) {
              const rawShapeText = paragraphs
                .map((p) => p.runs.map((r) => r.text).join(""))
                .join("\n");

              const hasValidBox = effCx > 0 && effCy > 0;
              const box = hasValidBox
                ? computeNormalizedBox(rawEffX, rawEffY, effCx, effCy)
                : isTitleShape
                  ? { leftPct: 6, topPct: 6, widthPct: 88, heightPct: 16 }
                  : isSlideNum
                    ? { leftPct: 82, topPct: 91, widthPct: 14, heightPct: 6 }
                    : { leftPct: 6, topPct: 25, widthPct: 88, heightPct: 66 };

              const hasBoxStyling = Boolean(shapeBg || borderColor);
              const elementIndex = elements.length;
              elements.push({
                id: `sp_${elementIndex}`,
                type: "text",
                isTitle: isTitleShape,
                left: `${box.leftPct.toFixed(2)}%`,
                top: `${box.topPct.toFixed(2)}%`,
                width: `${box.widthPct.toFixed(2)}%`,
                height: `${box.heightPct.toFixed(2)}%`,
                zIndex: zIdx,
                bgColor: shapeBg,
                borderColor,
                borderWidth,
                borderRadius,
                verticalAlign,
                paragraphs,
                rawText: rawShapeText,
              });

              if (paragraphs.length > 0) {
                pendingTextShapes.push({
                  elementIndex,
                  ...box,
                  hasBoxStyling,
                  autofitScale,
                });
              }
            }
          }
        }
      }

      // Execute extraction on the slide's `<p:spTree>`
      const spTreeMatch = xml.match(/<p:spTree>([\s\S]*?)<\/p:spTree>/i);
      if (spTreeMatch) {
        extractShapesFromXml(spTreeMatch[1], 0, 0, 1, 1);
      }

      // Smart Autofit + Anti-Overlap Neighbor Pass across all text shapes on this slide
      for (const item of pendingTextShapes) {
        const el = elements[item.elementIndex];
        if (!el?.paragraphs || el.paragraphs.length === 0) continue;

        const padX = item.hasBoxStyling ? 20 : 8;
        const padY = item.hasBoxStyling ? 8 : 4;
        const boxWidthPx = Math.max(36, (item.widthPct / 100) * 960 - padX);
        const rawBoxHeightPx = Math.max(18, (item.heightPct / 100) * baseHeight - padY);
        const boxTopPx = (item.topPct / 100) * baseHeight;
        const remainingSlideHeightPx = Math.max(24, baseHeight - boxTopPx - 6);

        // Find closest distinct content element positioned directly below this element
        let nearestBelowTopPx = baseHeight - 4;
        for (const other of elements) {
          if (other.id === el.id) continue;
          const oLeft = parseFloat(other.left);
          const oTop = parseFloat(other.top);
          const oWidth = parseFloat(other.width);
          const oHeight = parseFloat(other.height);
          // Skip purely decorative backdrop shapes behind this element
          const isBackdrop =
            other.type === "text" &&
            (!other.paragraphs || other.paragraphs.length === 0) &&
            oWidth > item.widthPct * 0.9 &&
            oHeight > item.heightPct * 0.9;
          if (isBackdrop) continue;

          const overlapLeft = Math.max(item.leftPct, oLeft);
          const overlapRight = Math.min(
            item.leftPct + item.widthPct,
            oLeft + oWidth
          );
          const horizOverlap = overlapRight - overlapLeft;
          const minNeededOverlap = Math.min(item.widthPct, oWidth) * 0.15;

          if (horizOverlap > minNeededOverlap && oTop > item.topPct + 1.5) {
            const otherTopPx = (oTop / 100) * baseHeight;
            if (otherTopPx < nearestBelowTopPx) {
              nearestBelowTopPx = otherTopPx;
            }
          }
        }

        const spaceUntilBelowPx = Math.max(20, nearestBelowTopPx - boxTopPx - 4);
        const maxAllowedHeightPx = item.hasBoxStyling
          ? Math.min(rawBoxHeightPx, spaceUntilBelowPx, remainingSlideHeightPx)
          : Math.min(
              Math.max(rawBoxHeightPx, Math.min(rawBoxHeightPx + 12, spaceUntilBelowPx)),
              spaceUntilBelowPx,
              remainingSlideHeightPx
            );

        const estimateTotalHeight = (scaleFactor: number) => {
          let h = 0;
          for (const p of el.paragraphs || []) {
            const rawMaxSize = Math.max(...p.runs.map((r) => r.size || 16));
            const maxRunSize = Math.max(9, rawMaxSize * scaleFactor);
            const hasBold = p.runs.some((r) => r.bold);
            const charWidthFactor = hasBold ? 0.61 : 0.56;
            const indentPx = (p.level || 0) * 14 + (p.bullet ? 20 : 0);
            const usableWidth = Math.max(24, boxWidthPx - indentPx);
            const charsPerLine = Math.max(
              6,
              Math.floor(usableWidth / (maxRunSize * charWidthFactor))
            );
            const linesByBr = p.runs.map((r) => r.text).join("").split("\n");
            let paraLines = 0;
            for (const lineStr of linesByBr) {
              const len = lineStr.trim().length || 1;
              paraLines += Math.max(1, Math.ceil(len / charsPerLine));
            }
            h += paraLines * (maxRunSize * 1.2) + 4;
          }
          return h;
        };

        let finalScale = item.autofitScale;
        let estH = estimateTotalHeight(finalScale);
        while (estH > maxAllowedHeightPx * 0.94 && finalScale > 0.48) {
          finalScale *= 0.92;
          estH = estimateTotalHeight(finalScale);
        }

        if (finalScale < 0.99) {
          for (const p of el.paragraphs) {
            for (const r of p.runs) {
              if (r.size) {
                r.size = Math.max(9, Math.round(r.size * finalScale));
              }
            }
          }
        }
      }

      const titleElem = elements.find((el) => el.isTitle && el.rawText?.trim());
      const title =
        titleElem?.rawText?.trim() ||
        contentParagraphs[0] ||
        `Slide ${slideNum}`;

      const rawSlideText = contentParagraphs.join("\n");
      fullText += `--- Slide ${slideNum}: ${title} ---\n${rawSlideText}\n\n`;

      slides.push({
        slideNumber: slideNum,
        title,
        content: contentParagraphs,
        rawText: rawSlideText,
        bgColor,
        bgImage,
        aspectRatio,
        elements,
      });
    });

    if (slides.length === 0) {
      slides.push({
        slideNumber: 1,
        title: "Presentation",
        content: ["Presentation slides loaded."],
        rawText: "Presentation",
        aspectRatio,
        elements: [],
      });
    }

    return {
      text: fullText.trim(),
      slides,
      aspectRatio,
    };
  } catch (error: any) {
    console.error("[parsePptx] Error:", error);
    return {
      text: "PowerPoint Presentation",
      slides: [
        {
          slideNumber: 1,
          title: "Slide 1",
          content: ["Could not parse presentation slides."],
          rawText: "PowerPoint Presentation",
          aspectRatio: 16 / 9,
          elements: [],
        },
      ],
      aspectRatio: 16 / 9,
    };
  }
}

function detectFileTypeFromBuffer(
  buffer: Buffer
): "pdf" | "docx" | "pptx" | "unknown" {
  if (
    buffer.length >= 5 &&
    buffer.subarray(0, 5).toString("latin1") === "%PDF-"
  ) {
    return "pdf";
  }

  if (buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b) {
    try {
      const zip = new AdmZip(buffer);
      if (
        zip.getEntry("ppt/presentation.xml") ||
        zip.getEntries().some((entry) => entry.entryName.startsWith("ppt/slides/"))
      ) {
        return "pptx";
      }
      if (zip.getEntry("word/document.xml")) {
        return "docx";
      }
    } catch {
      // Ignore invalid zip signatures and continue sniffing
    }
  }

  if (
    buffer.length >= 8 &&
    buffer[0] === 0xd0 &&
    buffer[1] === 0xcf &&
    buffer[2] === 0x11 &&
    buffer[3] === 0xe0
  ) {
    if (buffer.includes(Buffer.from("PowerPoint Document", "utf16le"))) {
      return "pptx";
    }
    if (buffer.includes(Buffer.from("WordDocument", "utf16le"))) {
      return "docx";
    }
  }

  return "unknown";
}

/**
 * Universal document parser: reads any PDF, DOCX, or PPTX from disk or URL
 */
export async function parseDocument(
  fileUrl: string,
  fileName?: string
): Promise<ParsedDocument> {
  const cacheKey = `v5:${fileUrl}:${fileName || ""}`;
  if (documentCache.has(cacheKey)) {
    return documentCache.get(cacheKey)!;
  }

  let fileType = getFileType(fileName || "");
  if (fileType === "unknown") {
    fileType = getFileType(fileUrl);
  }
  let buffer: Buffer;

  if (fileUrl.startsWith("/api/files/")) {
    const rawId = fileUrl
      .replace("/api/files/", "")
      .split("/")[0]
      ?.split("?")[0];
    const { getDocumentBuffer } = await import("./document-storage");
    const stored = await getDocumentBuffer(rawId);
    if (stored) {
      buffer = stored;
    } else {
      const baseUrl =
        process.env.KINDE_SITE_URL ||
        (process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : "http://localhost:3000");
      const res = await fetch(`${baseUrl}${fileUrl}`);
      if (!res.ok) throw new Error(`Failed to fetch file: ${res.statusText}`);
      const ab = await res.arrayBuffer();
      buffer = Buffer.from(ab);
    }
  } else if (fileUrl.startsWith("http://") || fileUrl.startsWith("https://")) {
    const res = await fetch(fileUrl);
    if (!res.ok) throw new Error(`Failed to fetch file: ${res.statusText}`);
    const ab = await res.arrayBuffer();
    buffer = Buffer.from(ab);
  } else {
    const cleanPath = fileUrl.startsWith("/") ? fileUrl.slice(1) : fileUrl;
    const fullPath = path.join(process.cwd(), "public", cleanPath);
    if (fs.existsSync(fullPath)) {
      buffer = await fs.promises.readFile(fullPath);
    } else {
      const { getDocumentBuffer } = await import("./document-storage");
      const stored = await getDocumentBuffer(cleanPath);
      if (!stored) throw new Error(`File not found: ${fileUrl}`);
      buffer = stored;
    }
  }

  if (fileType === "unknown") {
    fileType = detectFileTypeFromBuffer(buffer);
  }

  let result: ParsedDocument;

  if (fileType === "pdf") {
    const pdfParse = require("pdf-parse/lib/pdf-parse.js");
    const pages: Array<{ pageNumber: number; text: string }> = [];

    const data = await pdfParse(buffer, {
      pagerender: async (pageData: any) => {
        try {
          const tc = await pageData.getTextContent();
          let lastY: any;
          let text = "";
          for (const item of tc.items) {
            if (lastY === item.transform[5] || !lastY) {
              text += item.str;
            } else {
              text += "\n" + item.str;
            }
            lastY = item.transform[5];
          }
          const cleanText = text.trim();
          if (cleanText) {
            pages.push({
              pageNumber: pageData.pageIndex + 1,
              text: cleanText,
            });
          }
          return text;
        } catch {
          return "";
        }
      },
    });

    const text = data.text ? data.text.replace(/\r\n/g, "\n").trim() : "";
    result = {
      fileType: "pdf",
      text,
      pages,
      totalPages: data.numpages || pages.length,
      totalWords: text.split(/\s+/).filter(Boolean).length,
    };
  } else if (fileType === "docx") {
    const { text, html, pages } = await parseDocx(buffer);
    result = {
      fileType: "docx",
      text,
      html,
      pages,
      totalPages: pages.length,
      totalWords: text.split(/\s+/).filter(Boolean).length,
    };
  } else if (fileType === "pptx") {
    const { text, slides, aspectRatio } = parsePptx(buffer);
    result = {
      fileType: "pptx",
      text,
      slides,
      totalPages: slides.length,
      totalSlides: slides.length,
      totalWords: text.split(/\s+/).filter(Boolean).length,
      aspectRatio,
    };
  } else {
    const fallbackText = buffer.toString("utf8").slice(0, 50000);
    result = {
      fileType: "unknown",
      text: fallbackText,
      totalWords: fallbackText.split(/\s+/).filter(Boolean).length,
    };
  }

  documentCache.set(cacheKey, result);
  return result;
}
