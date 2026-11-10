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

/**
 * Parse a PPTX file buffer with high visual and structural fidelity
 * Extracts slide dimensions, positions, background colors, embedded images, tables, typography, and theme styling
 */
export function parsePptx(buffer: Buffer): {
  text: string;
  slides: RichSlide[];
  aspectRatio: number;
} {
  try {
    const zip = new AdmZip(buffer);
    const zipEntries = zip.getEntries();

    // 1. Determine presentation dimensions & aspect ratio
    let sldWidth = 12192000;
    let sldHeight = 6858000;
    try {
      const presXml = zip.readAsText("ppt/presentation.xml");
      const sizeMatch = presXml.match(/<p:sldSz\s+cx="(\d+)"\s+cy="(\d+)"/);
      if (sizeMatch) {
        sldWidth = parseInt(sizeMatch[1], 10) || 12192000;
        sldHeight = parseInt(sizeMatch[2], 10) || 6858000;
      }
    } catch (e) {
      // default 16:9
    }

    const aspectRatio = sldWidth / sldHeight;

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
    } catch (e) {}

    themeColors.bg1 = themeColors.lt1 || "ffffff";
    themeColors.tx1 = themeColors.dk1 || "000000";
    themeColors.bg2 = themeColors.lt2 || "f3f4f6";
    themeColors.tx2 = themeColors.dk2 || "1f2937";

    // Helper to resolve solid fill / text colors
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

    // 2.5 Extract Slide Master default styles (titleStyle & bodyStyle)
    let masterTitleFontSize = 36;
    let masterTitleColor = `#${themeColors.tx1}`;
    let masterBodyFontSize = 24;
    let masterBodyColor = `#${themeColors.tx1}`;
    let masterBodyHasBullet = false;

    try {
      const masterEntry = zipEntries.find((e) =>
        /^ppt\/slideMasters\/slideMaster1\.xml$/i.test(e.entryName)
      );
      if (masterEntry) {
        const mXml = masterEntry.getData().toString("utf8");
        const titleStyleM = mXml.match(
          /<p:titleStyle>([\s\S]*?)<\/p:titleStyle>/i
        );
        if (titleStyleM) {
          const lvl1 = titleStyleM[1].match(
            /<a:lvl1pPr[^>]*>([\s\S]*?)<\/a:lvl1pPr>/i
          );
          const chunk = lvl1 ? lvl1[1] : titleStyleM[1];
          const szM = chunk.match(/<a:defRPr[^>]*sz="(\d+)"/i);
          if (szM) masterTitleFontSize = Math.round(parseInt(szM[1], 10) / 100);
          const clr = resolveColor(chunk);
          if (clr) masterTitleColor = clr;
        }

        const bodyStyleM = mXml.match(
          /<p:bodyStyle>([\s\S]*?)<\/p:bodyStyle>/i
        );
        if (bodyStyleM) {
          const lvl1 = bodyStyleM[1].match(
            /<a:lvl1pPr[^>]*>([\s\S]*?)<\/a:lvl1pPr>/i
          );
          const chunk = lvl1 ? lvl1[1] : bodyStyleM[1];
          const szM = chunk.match(/<a:defRPr[^>]*sz="(\d+)"/i);
          if (szM) masterBodyFontSize = Math.round(parseInt(szM[1], 10) / 100);
          const clr = resolveColor(chunk);
          if (clr) masterBodyColor = clr;
          if (
            !chunk.includes("<a:buNone") &&
            (chunk.includes("<a:buChar") || chunk.includes("<a:buAutoNum"))
          ) {
            masterBodyHasBullet = true;
          }
        }
      }
    } catch (e) {}

    // 3. Pre-index all media images in the PPTX archive
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
        mediaMap[entry.entryName.replace("ppt/", "")] =
          `data:${mime};base64,${base64}`;
      }
    });

    // 4. Find all slide XML entries
    const slideEntries = zipEntries
      .filter((entry) => /^ppt\/slides\/slide\d+\.xml$/i.test(entry.entryName))
      .sort((a, b) => {
        const numA = parseInt(
          a.entryName.match(/slide(\d+)\.xml/i)?.[1] || "0",
          10
        );
        const numB = parseInt(
          b.entryName.match(/slide(\d+)\.xml/i)?.[1] || "0",
          10
        );
        return numA - numB;
      });

    const slides: RichSlide[] = [];
    let fullText = "";

    slideEntries.forEach((entry, idx) => {
      const slideNum = idx + 1;
      const xml = entry.getData().toString("utf8");

      // Slide relationships (for images and layouts)
      const relsMap: Record<string, string> = {};
      const relsFile =
        entry.entryName.replace(
          "ppt/slides/slide",
          "ppt/slides/_rels/slide"
        ) + ".rels";
      let layoutTarget: string | undefined = undefined;
      try {
        const rXml = zip.readAsText(relsFile);
        for (const rm of Array.from(
          rXml.matchAll(
            /<Relationship\s+[^>]*Id="([^"]+)"[^>]*Type="([^"]+)"[^>]*Target="([^"]+)"/g
          )
        )) {
          const target = rm[3].replace("../", "");
          relsMap[rm[1]] = target;
          if (rm[2].includes("slideLayout")) {
            layoutTarget = target;
          }
        }
        // Fallback if attribute order differs in Relationship tag
        for (const rm of Array.from(rXml.matchAll(/<Relationship\s+([^>]+)\/>/g))) {
          const attrs = rm[1];
          const idM = attrs.match(/Id="([^"]+)"/);
          const typeM = attrs.match(/Type="([^"]+)"/);
          const targetM = attrs.match(/Target="([^"]+)"/);
          if (idM && targetM) {
            const target = targetM[1].replace("../", "");
            relsMap[idM[1]] = target;
            if (typeM && typeM[1].includes("slideLayout")) {
              layoutTarget = target;
            }
          }
        }
      } catch (e) {}

      // Extract slide background color or image
      let bgColor = "#ffffff";
      let bgImage: string | undefined = undefined;

      const bgClrMatch = xml.match(
        /<p:bg>[\s\S]*?(<a:solidFill>[\s\S]*?<\/a:solidFill>|<a:srgbClr[\s\S]*?\/>|<a:schemeClr[\s\S]*?\/>)/i
      );
      if (bgClrMatch) {
        const c = resolveColor(bgClrMatch[0]);
        if (c) bgColor = c;
      }

      const bgImgMatch = xml.match(/<p:bg>[\s\S]*?r:embed="([^"]+)"/);
      if (bgImgMatch && relsMap[bgImgMatch[1]]) {
        const imgKey = relsMap[bgImgMatch[1]];
        if (mediaMap[imgKey]) bgImage = mediaMap[imgKey];
      }

      // If background is not in slide, check layout
      if (bgColor === "#ffffff" && !bgImage && layoutTarget) {
        try {
          const layXml = zip.readAsText(`ppt/${layoutTarget}`);
          const layBgMatch = layXml.match(
            /<p:bg>[\s\S]*?(<a:solidFill>[\s\S]*?<\/a:solidFill>|<a:srgbClr[\s\S]*?\/>|<a:schemeClr[\s\S]*?\/>)/i
          );
          if (layBgMatch) {
            const lc = resolveColor(layBgMatch[0]);
            if (lc) bgColor = lc;
          }
        } catch (e) {}
      }

      const elements: SlideElement[] = [];
      const contentParagraphs: string[] = [];

      // Helper to clamp percentage values so no element gets cut off at slide edges
      const clampPct = (val: number, min = 0, max = 100) =>
        Math.min(max, Math.max(min, val));

      // Recursive helper to parse shape trees in exact XML document z-order
      function extractShapesFromXml(
        treeXml: string,
        gx: number,
        gy: number,
        scaleX: number,
        scaleY: number
      ) {
        // Match direct shapes, pictures, graphicFrames, and groups in exact XML order
        const tokenRegex =
          /<p:grpSp>([\s\S]*?)<\/p:grpSp>|<p:pic>([\s\S]*?)<\/p:pic>|<p:graphicFrame>([\s\S]*?)<\/p:graphicFrame>|<p:sp>([\s\S]*?)<\/p:sp>/g;

        for (const match of Array.from(treeXml.matchAll(tokenRegex))) {
          const zIdx = elements.length + 1;

          // A. Group Shape (<p:grpSp>)
          if (match[1] !== undefined) {
            const grpXml = match[1];
            const grpPrXml =
              grpXml.match(/<p:grpSpPr>([\s\S]*?)<\/p:grpSpPr>/i)?.[1] || "";
            const offM = grpPrXml.match(
              /<a:off\s+x="(-?\d+)"\s+y="(-?\d+)"/
            );
            const extM = grpPrXml.match(
              /<a:ext\s+cx="(\d+)"\s+cy="(\d+)"/
            );
            const chOffM = grpPrXml.match(
              /<a:chOff\s+x="(-?\d+)"\s+y="(-?\d+)"/
            );
            const chExtM = grpPrXml.match(
              /<a:chExt\s+cx="(\d+)"\s+cy="(\d+)"/
            );

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
            const childScaleX = scaleX * sX;
            const childScaleY = scaleY * sY;

            const innerChildrenXml = grpXml.replace(
              /^[\s\S]*?<\/p:grpSpPr>/i,
              ""
            );
            extractShapesFromXml(
              innerChildrenXml,
              childBaseX,
              childBaseY,
              childScaleX,
              childScaleY
            );
            continue;
          }

          // B. Picture (<p:pic>)
          if (match[2] !== undefined) {
            const pXml = match[2];
            const blipM = pXml.match(/r:embed="([^"]+)"/);
            const offM = pXml.match(/<a:off\s+x="(-?\d+)"\s+y="(-?\d+)"/);
            const extM = pXml.match(/<a:ext\s+cx="(\d+)"\s+cy="(\d+)"/);
            const rId = blipM ? blipM[1] : null;
            const target = rId ? relsMap[rId] : null;

            const px = offM ? parseInt(offM[1], 10) : 0;
            const py = offM ? parseInt(offM[2], 10) : 0;
            const pcx = extM ? parseInt(extM[1], 10) : 0;
            const pcy = extM ? parseInt(extM[2], 10) : 0;

            const effX = Math.max(0, gx + px * scaleX);
            const effY = Math.max(0, gy + py * scaleY);
            const effCx = pcx * scaleX;
            const effCy = pcy * scaleY;

            const leftPct = clampPct((effX / sldWidth) * 100, 0, 98);
            const topPct = clampPct((effY / sldHeight) * 100, 0, 98);
            const widthPct = clampPct(
              (effCx / sldWidth) * 100,
              1,
              100 - leftPct
            );
            const heightPct = clampPct(
              (effCy / sldHeight) * 100,
              1,
              100 - topPct
            );

            if (target && mediaMap[target]) {
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

          // C. Graphic Frame (Tables & SmartArt) (<p:graphicFrame>)
          if (match[3] !== undefined) {
            const gfXml = match[3];
            const offM = gfXml.match(/<a:off\s+x="(-?\d+)"\s+y="(-?\d+)"/);
            const extM = gfXml.match(/<a:ext\s+cx="(\d+)"\s+cy="(\d+)"/);

            const fx = offM ? parseInt(offM[1], 10) : 0;
            const fy = offM ? parseInt(offM[2], 10) : 0;
            const fcx = extM ? parseInt(extM[1], 10) : 0;
            const fcy = extM ? parseInt(extM[2], 10) : 0;

            const effX = Math.max(0, gx + fx * scaleX);
            const effY = Math.max(0, gy + fy * scaleY);
            const effCx = fcx * scaleX;
            const effCy = fcy * scaleY;

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
                    tcXml.match(/<a:tcPr[^>]*>([\s\S]*?)<\/a:tcPr>/i)?.[1] ||
                    "";
                  const fillMatch = tcPrXml.match(
                    /<a:solidFill>[\s\S]*?<\/a:solidFill>/i
                  );
                  const cellBg = fillMatch
                    ? resolveColor(fillMatch[0])
                    : undefined;
                  const cellClrMatch = tcXml.match(
                    /<a:rPr[^>]*>[\s\S]*?(<a:solidFill>[\s\S]*?<\/a:solidFill>)/i
                  );
                  const cellClr = cellClrMatch
                    ? resolveColor(cellClrMatch[1])
                    : undefined;
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
                const leftPct =
                  effCx > 0 ? clampPct((effX / sldWidth) * 100, 0, 95) : 5;
                const topPct =
                  effCy > 0 ? clampPct((effY / sldHeight) * 100, 0, 95) : 20;
                const widthPct =
                  effCx > 0
                    ? clampPct((effCx / sldWidth) * 100, 5, 100 - leftPct)
                    : 90;
                const heightPct =
                  effCy > 0
                    ? clampPct((effCy / sldHeight) * 100, 5, 100 - topPct)
                    : 60;

                elements.push({
                  id: `tbl_${elements.length}`,
                  type: "table",
                  left: `${leftPct.toFixed(2)}%`,
                  top: `${topPct.toFixed(2)}%`,
                  width: `${widthPct.toFixed(2)}%`,
                  height: `${heightPct.toFixed(2)}%`,
                  zIndex: zIdx,
                  rows,
                });
              }
            }
            continue;
          }

          // D. Shape / Text Box (<p:sp>)
          if (match[4] !== undefined) {
            const spXml = match[4];
            const nvSpPrXml =
              spXml.match(/<p:nvSpPr>([\s\S]*?)<\/p:nvSpPr>/i)?.[1] || "";
            const spPrXml =
              spXml.match(/<p:spPr>([\s\S]*?)<\/p:spPr>/i)?.[1] || "";
            const txBodyXml =
              spXml.match(/<p:txBody>([\s\S]*?)<\/p:txBody>/i)?.[1] || "";

            const offM = spPrXml.match(/<a:off\s+x="(-?\d+)"\s+y="(-?\d+)"/);
            const extM = spPrXml.match(/<a:ext\s+cx="(\d+)"\s+cy="(\d+)"/);

            const sx = offM ? parseInt(offM[1], 10) : 0;
            const sy = offM ? parseInt(offM[2], 10) : 0;
            const scx = extM ? parseInt(extM[1], 10) : 0;
            const scy = extM ? parseInt(extM[2], 10) : 0;

            const effX = Math.max(0, gx + sx * scaleX);
            const effY = Math.max(0, gy + sy * scaleY);
            const effCx = scx * scaleX;
            const effCy = scy * scaleY;

            // Check if shape has an image fill (<a:blipFill>) inside <p:spPr>
            let shapeBlipSrc: string | undefined = undefined;
            const spBlipM = spPrXml.match(
              /<a:blipFill>[\s\S]*?r:embed="([^"]+)"/i
            );
            if (spBlipM && relsMap[spBlipM[1]]) {
              const target = relsMap[spBlipM[1]];
              if (mediaMap[target]) {
                shapeBlipSrc = mediaMap[target];
              }
            }

            // Shape background fill (strictly inside <p:spPr>, excluding <a:ln>)
            let shapeBg: string | undefined = undefined;
            const spPrWithoutLn = spPrXml.replace(
              /<a:ln[\s>][\s\S]*?<\/a:ln>/gi,
              ""
            );
            if (!spPrWithoutLn.includes("<a:noFill")) {
              const sFillM = spPrWithoutLn.match(
                /<a:solidFill>[\s\S]*?<\/a:solidFill>/i
              );
              if (sFillM) {
                shapeBg = resolveColor(sFillM[0]);
              }
            }

            // Shape border / outline (<a:ln> inside <p:spPr>)
            let borderColor: string | undefined = undefined;
            let borderWidth: number | undefined = undefined;
            const lnM = spPrXml.match(/<a:ln([^>]*)>([\s\S]*?)<\/a:ln>/i);
            if (lnM && !lnM[2].includes("<a:noFill")) {
              const lnAttr = lnM[1];
              const lnContent = lnM[2];
              const lnClr = resolveColor(lnContent);
              if (lnClr) {
                borderColor = lnClr;
                const wM = lnAttr.match(/w="(\d+)"/);
                borderWidth = wM
                  ? Math.max(1, Math.round(parseInt(wM[1], 10) / 12700))
                  : 1;
              }
            }

            // Geometry preset (rounded rectangle or ellipse/circle)
            let borderRadius: number | undefined = undefined;
            if (spPrXml.includes('prst="ellipse"')) {
              borderRadius = 9999;
            } else if (spPrXml.includes('prst="roundRect"')) {
              borderRadius = 12;
            }

            // Vertical alignment on text container
            let verticalAlign: "top" | "center" | "bottom" = "top";
            const bodyPrXml =
              txBodyXml.match(/<a:bodyPr[^>]*>([\s\S]*?)<\/a:bodyPr>|<a:bodyPr[^>]*\/>/i)?.[0] ||
              "";
            const anchorM = bodyPrXml.match(/anchor="([^"]+)"/);
            if (anchorM) {
              if (anchorM[1] === "ctr") verticalAlign = "center";
              else if (anchorM[1] === "b") verticalAlign = "bottom";
            }

            // Placeholder classification
            const isTitleShape =
              nvSpPrXml.includes('type="title"') ||
              nvSpPrXml.includes('type="ctrTitle"');
            const isSlideNum = nvSpPrXml.includes('type="sldNum"');
            const isBodyPlaceholder =
              !isTitleShape &&
              !isSlideNum &&
              (nvSpPrXml.includes('type="body"') ||
                nvSpPrXml.includes('idx="1"'));

            // Extract shape-level <a:lstStyle> defaults
            const lstStyleXml =
              txBodyXml.match(/<a:lstStyle>([\s\S]*?)<\/a:lstStyle>/i)?.[1] ||
              "";
            const lvl1Xml =
              lstStyleXml.match(/<a:lvl1pPr[^>]*>([\s\S]*?)<\/a:lvl1pPr>/i)?.[0] ||
              "";
            let lstAlign: "left" | "center" | "right" | "justify" | undefined =
              undefined;
            if (lvl1Xml.includes('algn="ctr"')) lstAlign = "center";
            else if (lvl1Xml.includes('algn="r"')) lstAlign = "right";
            else if (lvl1Xml.includes('algn="just"')) lstAlign = "justify";
            else if (lvl1Xml.includes('algn="l"')) lstAlign = "left";

            let lstFontSize: number | undefined = undefined;
            const lstSzM = lvl1Xml.match(/<a:defRPr[^>]*sz="(\d+)"/i);
            if (lstSzM) {
              lstFontSize = Math.round(parseInt(lstSzM[1], 10) / 100);
            }

            const lstDefRPrXml =
              lvl1Xml.match(/<a:defRPr[^>]*>([\s\S]*?)<\/a:defRPr>/i)?.[1] ||
              "";
            const lstColor = resolveColor(lstDefRPrXml);
            const lstFontM = lstDefRPrXml.match(
              /<a:latin\s+typeface="([^"+][^"]*)"/
            );
            const lstFontFamily = lstFontM ? lstFontM[1] : undefined;
            const lstBuNone = lvl1Xml.includes("<a:buNone");
            const lstHasBullet =
              !lstBuNone &&
              (lvl1Xml.includes("<a:buChar") ||
                lvl1Xml.includes("<a:buAutoNum"));

            // Check explicit normAutofit fontScale in <a:bodyPr>
            let autofitScale = 1;
            const fontScaleM = bodyPrXml.match(/fontScale="(\d+)"/);
            if (fontScaleM) {
              autofitScale = Math.max(
                0.55,
                Math.min(1, parseInt(fontScaleM[1], 10) / 100000)
              );
            }

            // Extract paragraphs inside this text box
            const pMatches =
              txBodyXml.match(/<a:p[\s>][\s\S]*?<\/a:p>/gi) || [];
            const paragraphs: Array<{
              align?: "left" | "center" | "right" | "justify";
              bullet?: boolean;
              runs: Array<{
                text: string;
                bold?: boolean;
                italic?: boolean;
                underline?: boolean;
                color?: string;
                size?: number;
                fontFamily?: string;
              }>;
            }> = [];

            // Determine shape-wide fallback font size from any explicit run size in this shape
            let shapeFallbackSize =
              lstFontSize ||
              (isTitleShape
                ? masterTitleFontSize
                : isBodyPlaceholder
                ? masterBodyFontSize
                : isSlideNum
                ? 12
                : 20);
            const firstExplicitSz = txBodyXml.match(/sz="(\d+)"/);
            if (!lstFontSize && firstExplicitSz) {
              shapeFallbackSize = Math.round(
                parseInt(firstExplicitSz[1], 10) / 100
              );
            }

            for (const pXml of pMatches) {
              const pPrXml =
                pXml.match(
                  /<a:pPr[^>]*>([\s\S]*?)<\/a:pPr>|<a:pPr[^>]*\/>/i
                )?.[0] || "";

              let align: "left" | "center" | "right" | "justify" =
                lstAlign ||
                (nvSpPrXml.includes('type="ctrTitle"') ? "center" : "left");
              if (pPrXml.includes('algn="ctr"')) align = "center";
              else if (pPrXml.includes('algn="r"')) align = "right";
              else if (pPrXml.includes('algn="just"')) align = "justify";
              else if (pPrXml.includes('algn="l"')) align = "left";

              // Default run properties from <a:pPr><a:defRPr>
              const pDefRPrXml =
                pPrXml.match(
                  /<a:defRPr[^>]*>([\s\S]*?)<\/a:defRPr>|<a:defRPr[^>]*\/>/i
                )?.[0] || "";
              const defClr = resolveColor(pDefRPrXml) || lstColor;
              const pDefSzM = pDefRPrXml.match(/sz="(\d+)"/);
              const pDefSize = pDefSzM
                ? Math.round(parseInt(pDefSzM[1], 10) / 100)
                : undefined;
              const pDefFontM = pDefRPrXml.match(
                /<a:latin\s+typeface="([^"+][^"]*)"/
              );
              const pDefFont = pDefFontM ? pDefFontM[1] : lstFontFamily;

              // Strict bullet detection
              let hasBullet = false;
              if (pPrXml.includes("<a:buNone")) {
                hasBullet = false;
              } else if (
                pPrXml.includes("<a:buChar") ||
                pPrXml.includes("<a:buAutoNum")
              ) {
                hasBullet = true;
              } else if (lstBuNone) {
                hasBullet = false;
              } else if (lstHasBullet) {
                hasBullet = true;
              } else if (isBodyPlaceholder) {
                hasBullet = masterBodyHasBullet;
              }

              // Extract all runs (<a:r>), fields (<a:fld>), and line breaks (<a:br>) accurately
              const runMatches =
                pXml.match(
                  /<a:r[\s>][\s\S]*?<\/a:r>|<a:fld[\s>][\s\S]*?<\/a:fld>|<a:br[\s>][\s\S]*?<\/a:br>|<a:br\s*\/>/gi
                ) || [];
              const runs: Array<{
                text: string;
                bold?: boolean;
                italic?: boolean;
                underline?: boolean;
                color?: string;
                size?: number;
                fontFamily?: string;
              }> = [];

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
                    ? masterTitleColor
                    : masterBodyColor);

                const szM = rPrXml.match(/sz="(\d+)"/);
                const rawSize = szM
                  ? Math.round(parseInt(szM[1], 10) / 100)
                  : pDefSize || shapeFallbackSize;

                const fontM = rPrXml.match(
                  /<a:latin\s+typeface="([^"+][^"]*)"/
                );
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

              // Don't show bullet on whitespace-only paragraphs
              const visibleParaText = runs
                .map((r) => r.text)
                .join("")
                .trim();
              if (runs.length > 0 && visibleParaText.length > 0) {
                paragraphs.push({
                  align,
                  bullet: hasBullet,
                  runs,
                });
                contentParagraphs.push(visibleParaText);
              }
            }

            // If this shape is purely an image container (<a:blipFill>) with no text
            if (shapeBlipSrc && paragraphs.length === 0) {
              const leftPct = clampPct((effX / sldWidth) * 100, 0, 98);
              const topPct = clampPct((effY / sldHeight) * 100, 0, 98);
              const widthPct = clampPct(
                (effCx / sldWidth) * 100,
                1,
                100 - leftPct
              );
              const heightPct = clampPct(
                (effCy / sldHeight) * 100,
                1,
                100 - topPct
              );
              elements.push({
                id: `sp_img_${elements.length}`,
                type: "image",
                left: `${leftPct.toFixed(2)}%`,
                top: `${topPct.toFixed(2)}%`,
                width: `${widthPct.toFixed(2)}%`,
                height: `${heightPct.toFixed(2)}%`,
                zIndex: zIdx,
                src: shapeBlipSrc,
              });
              continue;
            }

            // Smart Autofit calculation: ensures text fits inside its shape box and slide height without cutoff
            if (paragraphs.length > 0 && effCx > 0 && effCy > 0) {
              const boxWidthPx = Math.max(120, (effCx / sldWidth) * 960 - 20);
              const remainingSlideHeightPx = Math.max(
                40,
                ((sldHeight - effY) / sldHeight) * 540 - 8
              );
              const rawBoxHeightPx = (effCy / sldHeight) * 540;
              const boxHeightPx =
                shapeBg || borderColor
                  ? Math.min(rawBoxHeightPx, remainingSlideHeightPx)
                  : Math.min(
                      Math.max(rawBoxHeightPx, remainingSlideHeightPx),
                      remainingSlideHeightPx
                    );

              const estimateTotalHeight = (scaleFactor: number) => {
                let h = 0;
                for (const p of paragraphs) {
                  const maxRunSize =
                    Math.max(...p.runs.map((r) => r.size || 20)) * scaleFactor;
                  const linesByBr = p.runs
                    .map((r) => r.text)
                    .join("")
                    .split("\n");
                  let paraLines = 0;
                  const usableWidth = p.bullet ? boxWidthPx - 22 : boxWidthPx;
                  const charsPerLine = Math.max(
                    10,
                    Math.floor(usableWidth / (maxRunSize * 0.53))
                  );
                  for (const lineStr of linesByBr) {
                    const trimmedLen = lineStr.trim().length || 1;
                    paraLines += Math.max(
                      1,
                      Math.ceil(trimmedLen / charsPerLine)
                    );
                  }
                  h += paraLines * (maxRunSize * 1.2) + 5;
                }
                return h;
              };

              let finalScale = autofitScale;
              let estH = estimateTotalHeight(finalScale);
              while (estH > boxHeightPx * 0.95 && finalScale > 0.52) {
                finalScale *= 0.93;
                estH = estimateTotalHeight(finalScale);
              }

              if (finalScale < 0.99) {
                for (const p of paragraphs) {
                  for (const r of p.runs) {
                    if (r.size) {
                      r.size = Math.max(11, Math.round(r.size * finalScale));
                    }
                  }
                }
              }
            }

            if (paragraphs.length > 0 || shapeBg || borderColor) {
              const rawShapeText = paragraphs
                .map((p) => p.runs.map((r) => r.text).join(""))
                .join("\n");

              const leftPct =
                effCx > 0 ? clampPct((effX / sldWidth) * 100, 0, 98) : 5;
              const topPct =
                effCy > 0 ? clampPct((effY / sldHeight) * 100, 0, 96) : 10;
              const widthPct =
                effCx > 0
                  ? clampPct((effCx / sldWidth) * 100, 2, 100 - leftPct)
                  : 90;
              const heightPct =
                effCy > 0
                  ? clampPct((effCy / sldHeight) * 100, 2, 100 - topPct)
                  : 80;

              elements.push({
                id: `sp_${elements.length}`,
                type: "text",
                isTitle: isTitleShape,
                left: `${leftPct.toFixed(2)}%`,
                top: `${topPct.toFixed(2)}%`,
                width: `${widthPct.toFixed(2)}%`,
                height: `${heightPct.toFixed(2)}%`,
                zIndex: zIdx,
                bgColor: shapeBg,
                borderColor,
                borderWidth,
                borderRadius,
                verticalAlign,
                paragraphs,
                rawText: rawShapeText,
              });
            }
          }
        }
      }

      // Execute extraction on the slide's <p:spTree>
      const spTreeMatch = xml.match(/<p:spTree>([\s\S]*?)<\/p:spTree>/);
      if (spTreeMatch) {
        extractShapesFromXml(spTreeMatch[1], 0, 0, 1, 1);
      }

      // Determine slide title
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

/**
 * Universal document parser: reads any PDF, DOCX, or PPTX from disk or URL
 */
export async function parseDocument(fileUrl: string): Promise<ParsedDocument> {
  const cacheKey = `v4:${fileUrl}`;
  if (documentCache.has(cacheKey)) {
    return documentCache.get(cacheKey)!;
  }

  const fileType = getFileType(fileUrl);
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
