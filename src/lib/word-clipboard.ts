import { parseQuizData, parseFlashcardsData } from "./interactive-content";

export interface WordCitationSource {
  id?: string;
  name: string;
}

export interface WordCopyMessageOptions {
  effectiveSources?: WordCitationSource[];
  citedIndices?: number[];
}

export interface WordClipboardPayload {
  html: string;
  plainText: string;
}

const WORD_FONT_FAMILY = `Calibri, 'Segoe UI', Arial, sans-serif`;
const WORD_MONO_FAMILY = `Consolas, 'Courier New', monospace`;

const WORD_STYLES = {
  inlineText: `font-family: ${WORD_FONT_FAMILY}; font-size: 11pt; color: #000000; background-color: transparent;`,
  paragraph: `font-family: ${WORD_FONT_FAMILY}; font-size: 11pt; line-height: 1.15; color: #000000; background-color: transparent; margin: 0 0 8pt 0;`,
  blockquoteParagraph: `font-family: ${WORD_FONT_FAMILY}; font-size: 11pt; line-height: 1.15; color: #333333; background-color: transparent; margin: 0 0 4pt 0;`,
  headings: {
    1: `font-family: ${WORD_FONT_FAMILY}; font-size: 16pt; font-weight: bold; line-height: 1.15; color: #000000; background-color: transparent; margin: 12pt 0 4pt 0;`,
    2: `font-family: ${WORD_FONT_FAMILY}; font-size: 13pt; font-weight: bold; line-height: 1.15; color: #000000; background-color: transparent; margin: 10pt 0 4pt 0;`,
    3: `font-family: ${WORD_FONT_FAMILY}; font-size: 11.5pt; font-weight: bold; line-height: 1.15; color: #000000; background-color: transparent; margin: 8pt 0 3pt 0;`,
    4: `font-family: ${WORD_FONT_FAMILY}; font-size: 11pt; font-weight: bold; line-height: 1.15; color: #000000; background-color: transparent; margin: 6pt 0 2pt 0;`,
    5: `font-family: ${WORD_FONT_FAMILY}; font-size: 11pt; font-weight: bold; line-height: 1.15; color: #1F2937; background-color: transparent; margin: 6pt 0 2pt 0;`,
    6: `font-family: ${WORD_FONT_FAMILY}; font-size: 10.5pt; font-weight: bold; font-style: italic; line-height: 1.15; color: #374151; background-color: transparent; margin: 6pt 0 2pt 0;`,
  } as Record<number, string>,
  ulTop: `margin: 0 0 8pt 0; padding-left: 24pt; font-family: ${WORD_FONT_FAMILY}; font-size: 11pt; color: #000000; background-color: transparent;`,
  ulNested: `margin: 3pt 0 2pt 0; padding-left: 20pt; font-family: ${WORD_FONT_FAMILY}; font-size: 11pt; color: #000000; background-color: transparent;`,
  olTop: `margin: 0 0 8pt 0; padding-left: 24pt; font-family: ${WORD_FONT_FAMILY}; font-size: 11pt; color: #000000; background-color: transparent;`,
  olNested: `margin: 3pt 0 2pt 0; padding-left: 20pt; font-family: ${WORD_FONT_FAMILY}; font-size: 11pt; color: #000000; background-color: transparent;`,
  li: `font-family: ${WORD_FONT_FAMILY}; font-size: 11pt; line-height: 1.15; color: #000000; background-color: transparent; margin: 0 0 3pt 0;`,
  liLast: `font-family: ${WORD_FONT_FAMILY}; font-size: 11pt; line-height: 1.15; color: #000000; background-color: transparent; margin: 0;`,
  table: `border-collapse: collapse; width: 100%; margin: 4pt 0 8pt 0; font-family: ${WORD_FONT_FAMILY}; font-size: 10.5pt; line-height: 1.15; color: #000000; background-color: transparent;`,
  th: `border: 1px solid #BFBFBF; background-color: #F2F4F8; font-weight: bold; color: #000000; padding: 5pt 8pt; vertical-align: top;`,
  td: `border: 1px solid #BFBFBF; background-color: #FFFFFF; color: #000000; padding: 5pt 8pt; vertical-align: top;`,
  blockquote: `border-left: 3pt solid #4472C4; margin: 4pt 0 8pt 12pt; padding: 2pt 0 2pt 10pt; font-family: ${WORD_FONT_FAMILY}; font-size: 11pt; line-height: 1.15; color: #333333; background-color: transparent;`,
  pre: `font-family: ${WORD_MONO_FAMILY}; font-size: 9.5pt; line-height: 1.3; color: #111827; background-color: #F5F5F5; border: 1px solid #D9D9D9; padding: 8pt; margin: 4pt 0 8pt 0; white-space: pre-wrap; word-wrap: break-word;`,
  codeInline: `font-family: ${WORD_MONO_FAMILY}; font-size: 10pt; color: #111827; background-color: #F3F4F6;`,
  link: `color: #0563C1; text-decoration: underline; background-color: transparent;`,
  hr: `border-bottom: 1px solid #BFBFBF; margin: 2pt 0 8pt 0; font-size: 2pt; line-height: 2pt; color: #000000; background-color: transparent;`,
  sourcesHeading: `font-family: ${WORD_FONT_FAMILY}; font-size: 10.5pt; font-weight: bold; line-height: 1.15; color: #000000; background-color: transparent; margin: 10pt 0 3pt 0; border-top: 1px solid #D9D9D9; padding-top: 6pt;`,
  sourceItem: `font-family: ${WORD_FONT_FAMILY}; font-size: 10pt; line-height: 1.15; color: #333333; background-color: transparent; margin: 0 0 2pt 0;`,
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function sanitizeExternalUrl(url: string): string | null {
  const trimmed = url.trim();
  if (/^(https?:\/\/|mailto:|tel:)/i.test(trimmed)) {
    return trimmed;
  }
  return null;
}

function getUlStyleType(depth: number): string {
  if (depth === 0) return "disc";
  if (depth === 1) return "circle";
  return "square";
}

function getOlStyleType(depth: number): string {
  if (depth === 0) return "decimal";
  if (depth === 1) return "lower-alpha";
  return "lower-roman";
}

function withZeroBottomMargin(style: string): string {
  const trimmed = style.trim();
  if (/margin-bottom:\s*[^;]+;/i.test(trimmed)) {
    return trimmed.replace(/margin-bottom:\s*[^;]+;/i, "margin-bottom: 0;");
  }
  const sep = !trimmed || trimmed.endsWith(";") ? "" : ";";
  return `${trimmed}${sep} margin-bottom: 0;`.trim();
}

function withZeroTopMargin(style: string): string {
  const trimmed = style.trim();
  if (/margin-top:\s*[^;]+;/i.test(trimmed)) {
    return trimmed.replace(/margin-top:\s*[^;]+;/i, "margin-top: 0;");
  }
  const sep = !trimmed || trimmed.endsWith(";") ? "" : ";";
  return `${trimmed}${sep} margin-top: 0;`.trim();
}

function parseSourcesFooterForWord(rawText: string): {
  bodyText: string;
  footerSources: WordCitationSource[];
} {
  const footerMatch = rawText.match(
    /\n+(?:\*\*)?Sources:(?:\*\*)?\s*(?:[-•*]\s*)?((?:\[\d+\][\s\S]+?))$/i
  );
  if (!footerMatch) {
    return { bodyText: rawText, footerSources: [] };
  }

  const footerStr = footerMatch[1].trim();
  const entries: Array<{ idx: number; name: string }> = [];
  const itemRegex = /\[(\d+)\]\s*([^|\n]+?)(?=\s*(?:[|·]\s*|[-•*]\s*)?\[\d+\]|$)/g;
  let m: RegExpExecArray | null;
  while ((m = itemRegex.exec(footerStr)) !== null) {
    const idx = parseInt(m[1], 10);
    const name = m[2].trim();
    if (!isNaN(idx) && idx > 0 && name) {
      entries.push({ idx, name });
    }
  }

  if (entries.length === 0) {
    return { bodyText: rawText, footerSources: [] };
  }

  const maxIdx = Math.max(...entries.map((e) => e.idx));
  const footerSources: WordCitationSource[] = Array.from(
    { length: maxIdx },
    (_, i) => {
      const found = entries.find((e) => e.idx === i + 1);
      return { id: "", name: found?.name || `Document ${i + 1}` };
    }
  );

  return {
    bodyText: rawText.slice(0, footerMatch.index).trimEnd(),
    footerSources,
  };
}

interface InlineResult {
  html: string;
  plain: string;
}

const CITATION_BACKTICK_RE =
  /^`((?:[\[(]?(?:Doc(?:ument)?\s*\d+|Source:[^\n`]+|Page|Slide|Diapositiva|Diapositive|Folie|s\.|p\.)[^\n`]*[\])]?))`$/i;

function renderInlineMarkdown(raw: string): InlineResult {
  const htmlTokens: string[] = [];
  const plainTokens: string[] = [];

  const pushToken = (html: string, plain: string): string => {
    const idx = htmlTokens.length;
    htmlTokens.push(html);
    plainTokens.push(plain);
    return `\u0000WDTOK_${idx}\u0000`;
  };

  let work = raw;

  // 1. Protect multi-backtick & single-backtick inline code spans (unwrap citation-only backticks)
  work = work.replace(/(``+)([\s\S]*?)\1|`([^`\n]+)`/g, (full, multiTick, multiBody, singleBody) => {
    if (singleBody !== undefined && CITATION_BACKTICK_RE.test(full)) {
      return singleBody.trim();
    }
    const content = (multiBody !== undefined ? multiBody : singleBody || "").trim();
    return pushToken(
      `<code style="${WORD_STYLES.codeInline}">${escapeHtml(content)}</code>`,
      content
    );
  });

  // 2. Protect backslash escapes
  work = work.replace(/\\([\\`*{}\[\]()#+\-.!|>_~])/g, (_, ch) =>
    pushToken(escapeHtml(ch), ch)
  );

  // 3. Markdown images: render alt text cleanly instead of broken relative images
  work = work.replace(/!\[([^\]]*)\]\(([^)\s]+(?:\([^)]*\)[^)\s]*)*)\)/g, (_, alt) => {
    const label = (alt || "Image").trim();
    return pushToken(`[${escapeHtml(label)}]`, `[${label}]`);
  });

  // 4. Markdown links: turn internal #jump-* links into plain citation text; style external links in Word blue
  work = work.replace(
    /\[([^\]]+)\]\(([^)\n]+?)\)/g,
    (_, labelRaw: string, urlRaw: string) => {
      const cleanUrl = urlRaw.trim().replace(/^<|>$/g, "").split(/\s+/)[0];
      if (cleanUrl.startsWith("#jump-")) {
        const inner = renderInlineMarkdown(labelRaw);
        return pushToken(inner.html, inner.plain);
      }
      const safeHref = sanitizeExternalUrl(cleanUrl);
      const inner = renderInlineMarkdown(labelRaw);
      if (!safeHref) {
        return pushToken(inner.html, inner.plain);
      }
      return pushToken(
        `<a href="${escapeHtml(safeHref)}" style="${WORD_STYLES.link}">${inner.html}</a>`,
        inner.plain
      );
    }
  );

  // 5. Autolinks <https://...>
  work = work.replace(/<((?:https?:\/\/|mailto:)[^>\s]+)>/gi, (_, url) => {
    const safeHref = sanitizeExternalUrl(url);
    if (!safeHref) return escapeHtml(url);
    return pushToken(
      `<a href="${escapeHtml(safeHref)}" style="${WORD_STYLES.link}">${escapeHtml(url)}</a>`,
      url
    );
  });

  // 6. Bare URLs outside existing links
  work = work.replace(/(^|[\s(])(https?:\/\/[^\s<>()]+(?:\([^\s<>()]*\)[^\s<>()]*)*)/gi, (full, prefix, url) => {
    const trailingPunctMatch = url.match(/([.,;:!?]+)$/);
    const cleanUrl = trailingPunctMatch ? url.slice(0, -trailingPunctMatch[1].length) : url;
    const trailingPunct = trailingPunctMatch ? trailingPunctMatch[1] : "";
    const tok = pushToken(
      `<a href="${escapeHtml(cleanUrl)}" style="${WORD_STYLES.link}">${escapeHtml(cleanUrl)}</a>`,
      cleanUrl
    );
    return `${prefix}${tok}${trailingPunct}`;
  });

  // Escape any remaining raw HTML characters before inserting emphasis tags
  let htmlStr = escapeHtml(work);
  let plainStr = work;

  // 7. Strikethrough ~~text~~
  htmlStr = htmlStr.replace(/~~([^\n~][\s\S]*?[^\n~]|[^\n~])~~/g, `<s style="text-decoration: line-through;">$1</s>`);
  plainStr = plainStr.replace(/~~([^\n~][\s\S]*?[^\n~]|[^\n~])~~/g, "$1");

  // 8. Bold + Italic (***text*** or ___text___)
  htmlStr = htmlStr.replace(
    /\*\*\*([^\n*][\s\S]*?[^\n*]|[^\n*])\*\*\*/g,
    `<strong style="font-weight: bold;"><em style="font-style: italic;">$1</em></strong>`
  );
  htmlStr = htmlStr.replace(
    /(^|[\s(>])___([^\n_][\s\S]*?[^\n_]|[^\n_])___(?=$|[\s).,;:!?<])/g,
    `$1<strong style="font-weight: bold;"><em style="font-style: italic;">$2</em></strong>`
  );
  plainStr = plainStr.replace(/\*\*\*([^\n*][\s\S]*?[^\n*]|[^\n*])\*\*\*/g, "$1");
  plainStr = plainStr.replace(/(^|[\s(>])___([^\n_][\s\S]*?[^\n_]|[^\n_])___(?=$|[\s).,;:!?])/g, "$1$2");

  // 9. Bold (**text** or __text__)
  htmlStr = htmlStr.replace(/\*\*([^\n*][\s\S]*?[^\n*]|[^\n*])\*\*/g, `<strong style="font-weight: bold;">$1</strong>`);
  htmlStr = htmlStr.replace(
    /(^|[\s(>])__([^\n_][\s\S]*?[^\n_]|[^\n_])__(?=$|[\s).,;:!?<])/g,
    `$1<strong style="font-weight: bold;">$2</strong>`
  );
  plainStr = plainStr.replace(/\*\*([^\n*][\s\S]*?[^\n*]|[^\n*])\*\*/g, "$1");
  plainStr = plainStr.replace(/(^|[\s(>])__([^\n_][\s\S]*?[^\n_]|[^\n_])__(?=$|[\s).,;:!?])/g, "$1$2");

  // 10. Italic (*text* or word-bounded _text_)
  htmlStr = htmlStr.replace(/\*([^\n*\s](?:[^\n*]*?[^\n*\s])?)\*/g, `<em style="font-style: italic;">$1</em>`);
  htmlStr = htmlStr.replace(
    /(^|[\s(>])_([^\n_\s](?:[^\n_]*?[^\n_\s])?)_(?=$|[\s).,;:!?<])/g,
    `$1<em style="font-style: italic;">$2</em>`
  );
  plainStr = plainStr.replace(/\*([^\n*\s](?:[^\n*]*?[^\n*\s])?)\*/g, "$1");
  plainStr = plainStr.replace(
    /(^|[\s(>])_([^\n_\s](?:[^\n_]*?[^\n_\s])?)_(?=$|[\s).,;:!?])/g,
    "$1$2"
  );

  // Restore tokens (supports nested tokens from links)
  let guard = 0;
  while (htmlStr.includes("\u0000WDTOK_") && guard < 10) {
    htmlStr = htmlStr.replace(/\u0000WDTOK_(\d+)\u0000/g, (_, idx) => htmlTokens[Number(idx)] ?? "");
    guard++;
  }
  guard = 0;
  while (plainStr.includes("\u0000WDTOK_") && guard < 10) {
    plainStr = plainStr.replace(/\u0000WDTOK_(\d+)\u0000/g, (_, idx) => plainTokens[Number(idx)] ?? "");
    guard++;
  }

  return { html: htmlStr, plain: plainStr };
}

function joinInlineLines(lines: string[]): InlineResult {
  const htmlParts: string[] = [];
  const plainParts: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const hasHardBreak = /(?: {2}|\\)$/.test(rawLine) && i < lines.length - 1;
    const cleanedLine = rawLine.replace(/(?: {2}|\\)$/, "").trim();
    const res = renderInlineMarkdown(cleanedLine);
    htmlParts.push(res.html);
    plainParts.push(res.plain);
    if (i < lines.length - 1) {
      htmlParts.push(hasHardBreak ? "<br/>" : " ");
      plainParts.push(hasHardBreak ? "\n" : " ");
    }
  }

  return {
    html: htmlParts.join(""),
    plain: plainParts.join(""),
  };
}

function getIndentWidth(line: string): number {
  let width = 0;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === " ") width += 1;
    else if (line[i] === "\t") width += 4;
    else break;
  }
  return width;
}

const FENCE_OPEN_RE = /^\s{0,3}(`{3,}|~{3,})(.*)$/;
const ATX_HEADING_RE = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/;
const SETEXT_RE = /^\s{0,3}(=+|-+)\s*$/;
const HR_RE = /^\s{0,3}(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,})$/;
const BLOCKQUOTE_RE = /^\s{0,3}>\s?(.*)$/;
const UL_ITEM_RE = /^([ \t]*)([-*+])\s+(.*)$/;
const OL_ITEM_RE = /^([ \t]*)(\d{1,9})([.)])\s+(.*)$/;
const TABLE_SEP_RE = /^\s*\|?\s*:?-{2,}:?\s*(?:\|\s*:?-{2,}:?\s*)*\|?\s*$/;

function isTableStart(lines: string[], idx: number): boolean {
  if (idx + 1 >= lines.length) return false;
  const header = lines[idx];
  const sep = lines[idx + 1];
  if (!header.includes("|") || !sep.includes("|")) return false;
  return TABLE_SEP_RE.test(sep);
}

function splitTableRow(line: string): string[] {
  const ESC_PIPE = "\u0000PIPE\u0000";
  const safe = line.replace(/\\\|/g, ESC_PIPE).trim();
  const trimmed = safe.replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((cell) => cell.replace(/\u0000PIPE\u0000/g, "|").trim());
}

function parseAlignments(sepLine: string): Array<"left" | "center" | "right" | null> {
  return splitTableRow(sepLine).map((cell) => {
    const c = cell.trim();
    const left = c.startsWith(":");
    const right = c.endsWith(":");
    if (left && right) return "center";
    if (right) return "right";
    if (left) return "left";
    return null;
  });
}

function isListMarkerLine(line: string): boolean {
  return !HR_RE.test(line) && (UL_ITEM_RE.test(line) || OL_ITEM_RE.test(line));
}

function isBlockStarter(lines: string[], idx: number): boolean {
  const line = lines[idx];
  if (!line.trim()) return true;
  if (FENCE_OPEN_RE.test(line)) return true;
  if (ATX_HEADING_RE.test(line)) return true;
  if (HR_RE.test(line)) return true;
  if (BLOCKQUOTE_RE.test(line)) return true;
  if (isListMarkerLine(line)) return true;
  if (isTableStart(lines, idx)) return true;
  return false;
}

interface ParsedListResult {
  html: string;
  plain: string;
  nextIndex: number;
}

function parseListBlock(
  lines: string[],
  startIdx: number,
  depth: number,
  plainIndent = ""
): ParsedListResult {
  const firstLine = lines[startIdx];
  const firstUl = firstLine.match(UL_ITEM_RE);
  const firstOl = firstLine.match(OL_ITEM_RE);
  const kind: "ul" | "ol" = firstUl ? "ul" : "ol";
  const baseIndent = getIndentWidth(firstLine);
  const startNum = firstOl ? parseInt(firstOl[2], 10) : 1;

  const listItemsHtml: string[] = [];
  const listItemsPlain: string[] = [];

  let i = startIdx;
  let itemCounter = startNum;

  while (i < lines.length) {
    const line = lines[i];

    // Allow a single blank line if the list continues cleanly at same indent/kind
    if (!line.trim()) {
      if (i + 1 < lines.length) {
        const nextLine = lines[i + 1];
        const nextIndent = getIndentWidth(nextLine);
        const matchesSame =
          !HR_RE.test(nextLine) &&
          ((kind === "ul" && UL_ITEM_RE.test(nextLine)) ||
            (kind === "ol" && OL_ITEM_RE.test(nextLine))) &&
          Math.abs(nextIndent - baseIndent) <= 1;
        if (matchesSame) {
          i++;
          continue;
        }
      }
      break;
    }

    if (HR_RE.test(line)) break;
    const ulMatch = line.match(UL_ITEM_RE);
    const olMatch = line.match(OL_ITEM_RE);
    if (!ulMatch && !olMatch) break;

    const lineIndent = getIndentWidth(line);
    if (lineIndent < baseIndent - 1) break;
    if (lineIndent > baseIndent + 1) break;
    if ((kind === "ul" && !ulMatch) || (kind === "ol" && !olMatch)) break;

    let itemText = (ulMatch ? ulMatch[3] : olMatch![4]).trim();
    let taskPrefixHtml = "";
    let taskPrefixPlain = "";
    const taskMatch = itemText.match(/^\[( |x|X)\]\s+(.*)$/);
    if (taskMatch) {
      const checked = taskMatch[1].toLowerCase() === "x";
      taskPrefixHtml = checked ? "&#9745; " : "&#9744; ";
      taskPrefixPlain = checked ? "☑ " : "☐ ";
      itemText = taskMatch[2];
    }

    const itemLines: string[] = [itemText];
    const subPartsHtml: string[] = [];
    const subPartsPlain: string[] = [];
    i++;

    while (i < lines.length) {
      const cur = lines[i];
      if (!cur.trim()) {
        // Peek ahead: if next line is deeper indented or same list continues, evaluate
        if (i + 1 < lines.length && getIndentWidth(lines[i + 1]) >= baseIndent + 2) {
          i++;
          continue;
        }
        break;
      }

      const curIndent = getIndentWidth(cur);
      if (isListMarkerLine(cur)) {
        if (curIndent >= baseIndent + 2) {
          const nested = parseListBlock(lines, i, depth + 1, `${plainIndent}   `);
          subPartsHtml.push(nested.html);
          subPartsPlain.push(nested.plain);
          i = nested.nextIndex;
          continue;
        }
        break;
      }

      if (curIndent >= baseIndent + 2 || !isBlockStarter(lines, i)) {
        if (curIndent >= baseIndent + 2 && FENCE_OPEN_RE.test(cur)) {
          break;
        }
        itemLines.push(cur.trim());
        i++;
        continue;
      }

      break;
    }

    const inline = joinInlineLines(itemLines);
    const itemNum = itemCounter++;
    const bulletChar = depth === 0 ? "•" : depth === 1 ? "◦" : "▪";
    const plainMarker = kind === "ol" ? `${itemNum}. ` : `${bulletChar} `;
    const liPlain = `${plainIndent}${plainMarker}${taskPrefixPlain}${inline.plain}${
      subPartsPlain.length > 0 ? `\n${subPartsPlain.join("\n")}` : ""
    }`;

    listItemsHtml.push(
      `<li data-wd-li="true" style="${WORD_STYLES.li}">${taskPrefixHtml}${inline.html}${subPartsHtml.join("")}</li>`
    );
    listItemsPlain.push(liPlain);
  }

  // Tighten bottom margin on the very last item in the list
  if (listItemsHtml.length > 0) {
    const lastIdx = listItemsHtml.length - 1;
    listItemsHtml[lastIdx] = listItemsHtml[lastIdx].replace(
      `style="${WORD_STYLES.li}"`,
      `style="${WORD_STYLES.liLast}"`
    );
  }

  const listStyleType = kind === "ul" ? getUlStyleType(depth) : getOlStyleType(depth);
  const baseListStyle =
    kind === "ul"
      ? depth === 0
        ? WORD_STYLES.ulTop
        : WORD_STYLES.ulNested
      : depth === 0
      ? WORD_STYLES.olTop
      : WORD_STYLES.olNested;
  const startAttr = kind === "ol" && startNum !== 1 ? ` start="${startNum}"` : "";
  const tag = kind === "ul" ? "ul" : "ol";

  return {
    html: `<${tag}${startAttr} style="${baseListStyle} list-style-type: ${listStyleType};">${listItemsHtml.join("")}</${tag}>`,
    plain: listItemsPlain.join("\n"),
    nextIndex: i,
  };
}

interface ParsedBlock {
  html: string;
  plain: string;
  defaultStyleKey?: "blockquoteParagraph";
}

function parseMarkdownBlocks(
  markdown: string,
  options?: { insideBlockquote?: boolean }
): ParsedBlock[] {
  const normalized = markdown.replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");
  const blocks: ParsedBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i++;
      continue;
    }

    // 1. Fenced code block
    const fenceMatch = line.match(FENCE_OPEN_RE);
    if (fenceMatch) {
      const fenceChar = fenceMatch[1][0];
      const fenceLen = fenceMatch[1].length;
      const lang = (fenceMatch[2] || "").trim().toLowerCase();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length) {
        const closeRe = new RegExp(`^\\s{0,3}${fenceChar}{${fenceLen},}\\s*$`);
        if (closeRe.test(lines[i])) {
          i++;
          break;
        }
        codeLines.push(lines[i]);
        i++;
      }
      const codeText = codeLines.join("\n").replace(/\n+$/, "");

      if (lang === "quiz" || lang === "quiz-json") {
        const quiz = parseQuizData(codeText);
        if (quiz) {
          const qItemsHtml = quiz.questions
            .map(
              (q, idx) =>
                `<li style="${WORD_STYLES.li}"><strong>${idx + 1}. ${escapeHtml(q.question)}</strong><br/>${q.options
                  .map((opt, oIdx) => `&nbsp;&nbsp;${String.fromCharCode(65 + oIdx)}) ${escapeHtml(opt)}`)
                  .join("<br/>")}<br/><em>Correct Answer: ${String.fromCharCode(65 + q.correctIndex)} — ${escapeHtml(q.explanation)}</em></li>`
            )
            .join("");
          const qItemsPlain = quiz.questions
            .map(
              (q, idx) =>
                `${idx + 1}. ${q.question}\n${q.options
                  .map((opt, oIdx) => `   ${String.fromCharCode(65 + oIdx)}) ${opt}`)
                  .join("\n")}\n   Answer: ${String.fromCharCode(65 + q.correctIndex)} — ${q.explanation}`
            )
            .join("\n\n");
          blocks.push({
            html: `<h3 style="${WORD_STYLES.headings[3]}">${escapeHtml(quiz.title)}</h3><ol style="${WORD_STYLES.olTop}">${qItemsHtml}</ol>`,
            plain: `${quiz.title}\n\n${qItemsPlain}\n\n`,
          });
          continue;
        }
      }

      if (lang === "flashcards" || lang === "cards") {
        const flash = parseFlashcardsData(codeText);
        if (flash) {
          const cardItemsHtml = flash.cards
            .map(
              (c, idx) =>
                `<li style="${WORD_STYLES.li}"><strong>Card ${idx + 1} (${escapeHtml(c.front)}):</strong> ${escapeHtml(c.back)}${c.hint ? ` <em>(Hint: ${escapeHtml(c.hint)})</em>` : ""}</li>`
            )
            .join("");
          const cardItemsPlain = flash.cards
            .map((c, idx) => `Card ${idx + 1}: ${c.front}\nAnswer: ${c.back}${c.hint ? ` (Hint: ${c.hint})` : ""}`)
            .join("\n\n");
          blocks.push({
            html: `<h3 style="${WORD_STYLES.headings[3]}">${escapeHtml(flash.title)}</h3><ul style="${WORD_STYLES.ulTop}">${cardItemsHtml}</ul>`,
            plain: `${flash.title}\n\n${cardItemsPlain}\n\n`,
          });
          continue;
        }
      }

      blocks.push({
        html: `<pre style="${WORD_STYLES.pre}"><code style="font-family: ${WORD_MONO_FAMILY}; font-size: 9.5pt; color: #111827; background-color: transparent;">${escapeHtml(
          codeText
        )}</code></pre>`,
        plain: codeText,
      });
      continue;
    }

    // 2. ATX Heading (# .. ######)
    const atxMatch = line.match(ATX_HEADING_RE);
    if (atxMatch) {
      const level = Math.min(6, atxMatch[1].length);
      const inline = renderInlineMarkdown(atxMatch[2].trim());
      blocks.push({
        html: `<h${level} style="${WORD_STYLES.headings[level]}">${inline.html}</h${level}>`,
        plain: inline.plain,
      });
      i++;
      continue;
    }

    // 3. Horizontal Rule
    if (HR_RE.test(line)) {
      blocks.push({
        html: `<p style="${WORD_STYLES.hr}">&nbsp;</p>`,
        plain: "────────────────────────────────",
      });
      i++;
      continue;
    }

    // 4. Table
    if (isTableStart(lines, i)) {
      const headerCells = splitTableRow(lines[i]);
      const alignments = parseAlignments(lines[i + 1]);
      i += 2;
      const bodyRows: string[][] = [];
      while (i < lines.length) {
        const rowLine = lines[i];
        if (!rowLine.trim() || !rowLine.includes("|") || isBlockStarter(lines, i)) {
          break;
        }
        bodyRows.push(splitTableRow(rowLine));
        i++;
      }

      const colCount = Math.max(
        headerCells.length,
        alignments.length,
        ...bodyRows.map((r) => r.length)
      );

      const ths: string[] = [];
      const plainHeaderCells: string[] = [];
      for (let c = 0; c < colCount; c++) {
        const inline = renderInlineMarkdown(headerCells[c] ?? "");
        const align = alignments[c] || "left";
        ths.push(`<th style="${WORD_STYLES.th} text-align: ${align};">${inline.html}</th>`);
        plainHeaderCells.push(inline.plain);
      }

      const trs: string[] = [];
      const plainRows: string[] = [plainHeaderCells.join("\t")];
      for (const row of bodyRows) {
        const tds: string[] = [];
        const plainRowCells: string[] = [];
        for (let c = 0; c < colCount; c++) {
          const inline = renderInlineMarkdown(row[c] ?? "");
          const align = alignments[c] || "left";
          tds.push(`<td style="${WORD_STYLES.td} text-align: ${align};">${inline.html}</td>`);
          plainRowCells.push(inline.plain);
        }
        trs.push(`<tr>${tds.join("")}</tr>`);
        plainRows.push(plainRowCells.join("\t"));
      }

      blocks.push({
        html: `<table border="1" cellspacing="0" cellpadding="0" style="${WORD_STYLES.table}"><thead><tr>${ths.join("")}</tr></thead><tbody>${trs.join("")}</tbody></table>`,
        plain: plainRows.join("\n"),
      });
      continue;
    }

    // 5. Blockquote
    if (BLOCKQUOTE_RE.test(line)) {
      const quoteLines: string[] = [];
      while (i < lines.length) {
        const m = lines[i].match(BLOCKQUOTE_RE);
        if (m) {
          quoteLines.push(m[1]);
          i++;
        } else if (!lines[i].trim() && i + 1 < lines.length && BLOCKQUOTE_RE.test(lines[i + 1])) {
          quoteLines.push("");
          i++;
        } else {
          break;
        }
      }
      const innerBlocks = parseMarkdownBlocks(quoteLines.join("\n"), {
        insideBlockquote: true,
      });
      const innerHtml = finalizeBlocksHtml(innerBlocks);
      const innerPlain = innerBlocks
        .map((b) =>
          b.plain
            .split("\n")
            .map((l) => `> ${l}`)
            .join("\n")
        )
        .join("\n>\n");

      blocks.push({
        html: `<blockquote style="${WORD_STYLES.blockquote}">${innerHtml}</blockquote>`,
        plain: innerPlain,
      });
      continue;
    }

    // 6. List
    if (isListMarkerLine(line)) {
      const listRes = parseListBlock(lines, i, 0);
      blocks.push({
        html: listRes.html,
        plain: listRes.plain,
      });
      i = listRes.nextIndex;
      continue;
    }

    // 7. Paragraph (including Setext Heading detection on 2nd line)
    const paraLines: string[] = [line];
    i++;
    let setextLevel: 1 | 2 | null = null;
    while (i < lines.length) {
      const cur = lines[i];
      if (!cur.trim()) break;
      const setextMatch = cur.match(SETEXT_RE);
      if (setextMatch && paraLines.length === 1) {
        setextLevel = setextMatch[1].startsWith("=") ? 1 : 2;
        i++;
        break;
      }
      if (isBlockStarter(lines, i)) break;
      paraLines.push(cur);
      i++;
    }

    const inline = joinInlineLines(paraLines);
    if (setextLevel) {
      blocks.push({
        html: `<h${setextLevel} style="${WORD_STYLES.headings[setextLevel]}">${inline.html}</h${setextLevel}>`,
        plain: inline.plain,
      });
    } else {
      const pStyle = options?.insideBlockquote
        ? WORD_STYLES.blockquoteParagraph
        : WORD_STYLES.paragraph;
      blocks.push({
        html: `<p style="${pStyle}">${inline.html}</p>`,
        plain: inline.plain,
      });
    }
  }

  return blocks;
}

function finalizeBlocksHtml(blocks: ParsedBlock[]): string {
  if (blocks.length === 0) return "";
  return blocks
    .map((block, index) => {
      let html = block.html;
      if (index === 0) {
        html = html.replace(/style="([^"]*)"/, (full, inner) => {
          if (/^<h[1-6]\b/i.test(html)) {
            return `style="${withZeroTopMargin(inner)}"`;
          }
          return full;
        });
      }
      if (index === blocks.length - 1) {
        html = html.replace(/style="([^"]*)"/, (_, inner) => `style="${withZeroBottomMargin(inner)}"`);
      }
      return html;
    })
    .join("");
}

/**
 * Convert a Markdown chat message (including resolved document sources)
 * into Microsoft Word-standard HTML and clean plain text for clipboard paste.
 */
export function prepareMessageForWordClipboard(
  rawText: string,
  options: WordCopyMessageOptions = {}
): WordClipboardPayload {
  const { bodyText, footerSources } = parseSourcesFooterForWord(rawText);
  const blocks = parseMarkdownBlocks(bodyText);

  const effectiveSources = options.effectiveSources || [];
  const citedIndices = options.citedIndices || [];

  const sourceEntries: Array<{ idx: number; name: string }> = [];
  if (citedIndices.length > 0 && effectiveSources.length > 1) {
    for (const idx of citedIndices) {
      const src = effectiveSources[idx - 1];
      if (src?.name) {
        sourceEntries.push({ idx, name: src.name });
      }
    }
  } else if (footerSources.length > 0) {
    footerSources.forEach((src, i) => {
      if (src.name) {
        sourceEntries.push({ idx: i + 1, name: src.name });
      }
    });
  }

  if (sourceEntries.length > 0) {
    blocks.push({
      html: `<p style="${WORD_STYLES.sourcesHeading}">Sources</p>`,
      plain: "Sources:",
    });
    sourceEntries.forEach((entry, i) => {
      const isLast = i === sourceEntries.length - 1;
      const style = isLast
        ? withZeroBottomMargin(WORD_STYLES.sourceItem)
        : WORD_STYLES.sourceItem;
      blocks.push({
        html: `<p style="${style}">[${entry.idx}] ${escapeHtml(entry.name)}</p>`,
        plain: `[${entry.idx}] ${entry.name}`,
      });
    });
  }

  return {
    html: finalizeBlocksHtml(blocks),
    plainText: blocks.map((b) => b.plain).join("\n\n").trim(),
  };
}

/**
 * Copy rich HTML and plain text together to the OS clipboard so MS Word receives
 * native formatted HTML while "Keep Text Only" receives clean plain text.
 */
export async function copyToClipboardForWord(
  payload: WordClipboardPayload
): Promise<boolean> {
  if (!payload.html && !payload.plainText) return false;

  // Tier 1: Modern Async Clipboard API with dual MIME types (HTML + Plain Text)
  if (
    typeof navigator !== "undefined" &&
    navigator.clipboard &&
    typeof navigator.clipboard.write === "function" &&
    typeof ClipboardItem !== "undefined"
  ) {
    try {
      const item = new ClipboardItem({
        "text/html": new Blob([payload.html], { type: "text/html" }),
        "text/plain": new Blob([payload.plainText], { type: "text/plain" }),
      });
      await navigator.clipboard.write([item]);
      return true;
    } catch {
      // Fall through to execCommand fallback
    }
  }

  // Tier 2: Synchronous DOM copy listener fallback (HTTP contexts / older browsers)
  if (typeof document !== "undefined" && typeof window !== "undefined") {
    let copiedViaExec = false;
    const prevSelection = window.getSelection();
    const savedRanges: Range[] = [];
    if (prevSelection) {
      for (let i = 0; i < prevSelection.rangeCount; i++) {
        savedRanges.push(prevSelection.getRangeAt(i).cloneRange());
      }
    }

    const holder = document.createElement("div");
    holder.setAttribute("aria-hidden", "true");
    holder.style.position = "fixed";
    holder.style.left = "-99999px";
    holder.style.top = "0";
    holder.style.opacity = "0";
    holder.style.pointerEvents = "none";
    holder.innerHTML = payload.html || escapeHtml(payload.plainText);
    document.body.appendChild(holder);

    const onCopy = (ev: ClipboardEvent) => {
      if (ev.clipboardData) {
        ev.preventDefault();
        ev.clipboardData.setData("text/html", payload.html);
        ev.clipboardData.setData("text/plain", payload.plainText);
        copiedViaExec = true;
      }
    };

    try {
      document.addEventListener("copy", onCopy, true);
      const range = document.createRange();
      range.selectNodeContents(holder);
      prevSelection?.removeAllRanges();
      prevSelection?.addRange(range);
      const result = document.execCommand("copy");
      copiedViaExec = copiedViaExec || result;
    } catch {
      copiedViaExec = false;
    } finally {
      document.removeEventListener("copy", onCopy, true);
      if (holder.parentNode) {
        holder.parentNode.removeChild(holder);
      }
      if (prevSelection) {
        prevSelection.removeAllRanges();
        savedRanges.forEach((r) => prevSelection.addRange(r));
      }
    }

    if (copiedViaExec) return true;
  }

  // Tier 3: Plain-text fallback
  if (
    typeof navigator !== "undefined" &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === "function"
  ) {
    try {
      await navigator.clipboard.writeText(payload.plainText);
      return true;
    } catch {
      return false;
    }
  }

  return false;
}

export async function copyMessageForWord(
  rawText: string,
  options: WordCopyMessageOptions = {}
): Promise<boolean> {
  const payload = prepareMessageForWordClipboard(rawText, options);
  return copyToClipboardForWord(payload);
}

const BLOCK_TAGS = new Set([
  "P",
  "DIV",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "UL",
  "OL",
  "LI",
  "TABLE",
  "THEAD",
  "TBODY",
  "TFOOT",
  "TR",
  "TH",
  "TD",
  "BLOCKQUOTE",
  "PRE",
  "HR",
  "SECTION",
  "ARTICLE",
]);

function hasBlockElements(node: Node): boolean {
  if (node.nodeType === Node.ELEMENT_NODE) {
    const el = node as HTMLElement;
    if (BLOCK_TAGS.has(el.tagName)) return true;
  }
  for (let i = 0; i < node.childNodes.length; i++) {
    if (hasBlockElements(node.childNodes[i])) return true;
  }
  return false;
}

function createWordTableElement(doc: Document): HTMLTableElement {
  const table = doc.createElement("table");
  table.setAttribute("border", "1");
  table.setAttribute("cellspacing", "0");
  table.setAttribute("cellpadding", "0");
  table.setAttribute("style", WORD_STYLES.table);
  return table;
}

function getReadableTextWithoutIgnored(el: HTMLElement): string {
  let out = "";
  el.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      out += child.textContent || "";
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const childEl = child as HTMLElement;
      if (
        childEl.getAttribute("data-copy-ignore") === "true" ||
        childEl.tagName === "SVG"
      ) {
        return;
      }
      out += getReadableTextWithoutIgnored(childEl);
    }
  });
  return out.replace(/\s+/g, " ").trim();
}

function cleanDomNodesForWord(
  nodes: Node[],
  doc: Document,
  ctx: {
    insidePre?: boolean;
    insideLi?: boolean;
    insideBlockquote?: boolean;
    listDepth?: number;
  } = {}
): Node[] {
  const result: Node[] = [];

  for (const node of nodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || "";
      if (ctx.insidePre) {
        result.push(doc.createTextNode(text));
      } else if (text.length > 0) {
        result.push(doc.createTextNode(text));
      }
      continue;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) continue;
    const el = node as HTMLElement;
    const tag = el.tagName.toUpperCase();

    // Strip chrome / non-content UI controls
    if (
      tag === "SVG" ||
      tag === "SCRIPT" ||
      tag === "STYLE" ||
      tag === "NOSCRIPT" ||
      el.getAttribute("data-copy-ignore") === "true"
    ) {
      continue;
    }

    // Citation pills -> clean inline citation text
    if (el.getAttribute("data-copy-citation") === "true") {
      let text = getReadableTextWithoutIgnored(el);
      if (text && el.getAttribute("data-copy-brackets") === "true" && !text.startsWith("[")) {
        text = `[${text}]`;
      }
      if (text) {
        result.push(doc.createTextNode(text));
      }
      continue;
    }

    // Source bar chips -> clean [idx] filename line
    const sourceItemLabel = el.getAttribute("data-copy-source-item");
    if (sourceItemLabel) {
      const p = doc.createElement("p");
      p.setAttribute("style", WORD_STYLES.sourceItem);
      p.textContent = sourceItemLabel;
      result.push(p);
      continue;
    }

    if (el.getAttribute("data-copy-sources") === "true") {
      const sourceChildren = cleanDomNodesForWord(Array.from(el.childNodes), doc, ctx).filter(
        (n) => !(n.nodeType === Node.TEXT_NODE && !(n.textContent || "").trim())
      );
      if (sourceChildren.length > 0) {
        const heading = doc.createElement("p");
        heading.setAttribute("style", WORD_STYLES.sourcesHeading);
        heading.textContent = "Sources";
        result.push(heading, ...sourceChildren);
      }
      continue;
    }

    // Unwrap layout divs cleanly while preserving paragraph breaks between raw inline text chunks
    if (
      tag === "DIV" ||
      tag === "SECTION" ||
      tag === "ARTICLE" ||
      tag === "MAIN" ||
      tag === "BUTTON"
    ) {
      const cleanedChildren = cleanDomNodesForWord(Array.from(el.childNodes), doc, ctx);
      const isMessageBubble = el.getAttribute("data-chat-message-content") === "true";

      if (isMessageBubble) {
        // Group any loose inline top-level nodes into <p>
        let inlineBuf: Node[] = [];
        const flushInline = () => {
          const textContent = inlineBuf.map((n) => n.textContent || "").join("").trim();
          if (inlineBuf.length > 0 && textContent) {
            const p = doc.createElement("p");
            p.setAttribute("style", WORD_STYLES.paragraph);
            inlineBuf.forEach((n) => p.appendChild(n));
            result.push(p);
          }
          inlineBuf = [];
        };

        for (const ch of cleanedChildren) {
          if (ch.nodeType === Node.ELEMENT_NODE && BLOCK_TAGS.has((ch as HTMLElement).tagName)) {
            flushInline();
            result.push(ch);
          } else {
            inlineBuf.push(ch);
          }
        }
        flushInline();
      } else {
        result.push(...cleanedChildren);
      }
      continue;
    }

    if (tag === "BR") {
      result.push(doc.createElement("br"));
      continue;
    }

    if (tag === "HR") {
      const hrP = doc.createElement("p");
      hrP.setAttribute("data-wd-hr", "true");
      hrP.setAttribute("style", WORD_STYLES.hr);
      hrP.innerHTML = "&nbsp;";
      result.push(hrP);
      continue;
    }

    if (/^H[1-6]$/.test(tag)) {
      const level = parseInt(tag[1], 10);
      const heading = doc.createElement(tag.toLowerCase());
      heading.setAttribute("style", WORD_STYLES.headings[level] || WORD_STYLES.headings[3]);
      cleanDomNodesForWord(Array.from(el.childNodes), doc, ctx).forEach((ch) =>
        heading.appendChild(ch)
      );
      if ((heading.textContent || "").trim()) {
        result.push(heading);
      }
      continue;
    }

    const classNameStr =
      typeof (el as any).className === "string"
        ? (el as any).className
        : (el as any).getAttribute?.("class") || "";
    if (classNameStr.includes("katex")) {
      const tex =
        (el as any).querySelector?.("annotation")?.textContent?.trim() ||
        el.textContent?.trim() ||
        "";
      const isDisplay =
        classNameStr.includes("katex-display") ||
        (el as any).closest?.(".katex-display") !== null;

      if (isDisplay) {
        const p = doc.createElement("p");
        p.setAttribute(
          "style",
          `font-family: 'Cambria Math', 'Times New Roman', ${WORD_FONT_FAMILY}; font-size: 11pt; line-height: 1.25; color: #000000; text-align: center; margin: 4pt 0 8pt 0; font-style: italic;`
        );
        p.textContent = tex;
        result.push(p);
      } else {
        const span = doc.createElement("span");
        span.setAttribute(
          "style",
          `font-family: 'Cambria Math', 'Times New Roman', ${WORD_FONT_FAMILY}; font-size: 11pt; color: #000000; font-style: italic;`
        );
        span.textContent = tex;
        result.push(span);
      }
      continue;
    }

    if (tag === "P") {
      const children = cleanDomNodesForWord(Array.from(el.childNodes), doc, ctx);
      const hasContent =
        children.some((c) => c.nodeType === Node.ELEMENT_NODE) ||
        children.some((c) => (c.textContent || "").trim().length > 0);
      if (!hasContent) continue;

      if (ctx.insideLi) {
        // Avoid nested <p> inside <li> so Word doesn't insert double blank gaps between bullets
        children.forEach((ch) => result.push(ch));
      } else {
        const p = doc.createElement("p");
        p.setAttribute(
          "style",
          ctx.insideBlockquote ? WORD_STYLES.blockquoteParagraph : WORD_STYLES.paragraph
        );
        children.forEach((ch) => p.appendChild(ch));
        result.push(p);
      }
      continue;
    }

    if (tag === "UL" || tag === "OL") {
      const depth = ctx.listDepth ?? 0;
      const list = doc.createElement(tag.toLowerCase());
      if (tag === "OL") {
        const startAttr = el.getAttribute("start");
        if (startAttr) list.setAttribute("start", startAttr);
      }
      const listBase =
        tag === "UL"
          ? depth === 0
            ? WORD_STYLES.ulTop
            : WORD_STYLES.ulNested
          : depth === 0
          ? WORD_STYLES.olTop
          : WORD_STYLES.olNested;
      const styleType = tag === "UL" ? getUlStyleType(depth) : getOlStyleType(depth);
      list.setAttribute("style", `${listBase} list-style-type: ${styleType};`);

      const liNodes = cleanDomNodesForWord(Array.from(el.childNodes), doc, {
        ...ctx,
        listDepth: depth + 1,
      });
      liNodes.forEach((ch) => {
        if (ch.nodeType === Node.TEXT_NODE && !(ch.textContent || "").trim()) return;
        list.appendChild(ch);
      });
      if (list.children.length > 0) {
        const lastLi = list.lastElementChild as HTMLElement | null;
        if (lastLi && lastLi.tagName === "LI") {
          lastLi.setAttribute("style", WORD_STYLES.liLast);
        }
        result.push(list);
      }
      continue;
    }

    if (tag === "LI") {
      const li = doc.createElement("li");
      li.setAttribute("style", WORD_STYLES.li);
      const cleaned = cleanDomNodesForWord(Array.from(el.childNodes), doc, {
        ...ctx,
        insideLi: true,
      });
      cleaned.forEach((ch) => li.appendChild(ch));
      if ((li.textContent || "").trim() || li.children.length > 0) {
        result.push(li);
      }
      continue;
    }

    if (tag === "BLOCKQUOTE") {
      const bq = doc.createElement("blockquote");
      bq.setAttribute("style", WORD_STYLES.blockquote);
      const cleaned = cleanDomNodesForWord(Array.from(el.childNodes), doc, {
        ...ctx,
        insideBlockquote: true,
      });
      cleaned.forEach((ch) => bq.appendChild(ch));
      if ((bq.textContent || "").trim() || bq.children.length > 0) {
        result.push(bq);
      }
      continue;
    }

    if (tag === "PRE") {
      const pre = doc.createElement("pre");
      pre.setAttribute("style", WORD_STYLES.pre);
      const code = doc.createElement("code");
      code.setAttribute(
        "style",
        `font-family: ${WORD_MONO_FAMILY}; font-size: 9.5pt; color: #111827; background-color: transparent;`
      );
      code.textContent = (el.textContent || "").replace(/\n+$/, "");
      pre.appendChild(code);
      result.push(pre);
      continue;
    }

    if (tag === "CODE") {
      if (ctx.insidePre) {
        result.push(doc.createTextNode(el.textContent || ""));
      } else {
        const code = doc.createElement("code");
        code.setAttribute("style", WORD_STYLES.codeInline);
        code.textContent = el.textContent || "";
        result.push(code);
      }
      continue;
    }

    if (tag === "TABLE") {
      const table = createWordTableElement(doc);
      cleanDomNodesForWord(Array.from(el.childNodes), doc, ctx).forEach((ch) =>
        table.appendChild(ch)
      );
      if (table.childNodes.length > 0) {
        result.push(table);
      }
      continue;
    }

    if (tag === "THEAD" || tag === "TBODY" || tag === "TFOOT" || tag === "TR") {
      const outEl = doc.createElement(tag.toLowerCase());
      cleanDomNodesForWord(Array.from(el.childNodes), doc, ctx).forEach((ch) =>
        outEl.appendChild(ch)
      );
      if (outEl.childNodes.length > 0) {
        result.push(outEl);
      }
      continue;
    }

    if (tag === "TH" || tag === "TD") {
      const cell = doc.createElement(tag.toLowerCase());
      const align = el.style?.textAlign;
      const baseStyle = tag === "TH" ? WORD_STYLES.th : WORD_STYLES.td;
      cell.setAttribute("style", align ? `${baseStyle} text-align: ${align};` : baseStyle);
      const colSpan = el.getAttribute("colspan");
      const rowSpan = el.getAttribute("rowspan");
      if (colSpan) cell.setAttribute("colspan", colSpan);
      if (rowSpan) cell.setAttribute("rowspan", rowSpan);
      cleanDomNodesForWord(Array.from(el.childNodes), doc, {
        ...ctx,
        insideLi: true, // keeps inline paragraph breaks compact inside table cells
      }).forEach((ch) => cell.appendChild(ch));
      result.push(cell);
      continue;
    }

    if (tag === "A") {
      const href = el.getAttribute("href") || "";
      if (!href || href.startsWith("#jump-")) {
        result.push(...cleanDomNodesForWord(Array.from(el.childNodes), doc, ctx));
        continue;
      }
      const safeHref = sanitizeExternalUrl(href);
      if (!safeHref) {
        result.push(...cleanDomNodesForWord(Array.from(el.childNodes), doc, ctx));
        continue;
      }
      const a = doc.createElement("a");
      a.setAttribute("href", safeHref);
      a.setAttribute("style", WORD_STYLES.link);
      cleanDomNodesForWord(Array.from(el.childNodes), doc, ctx).forEach((ch) =>
        a.appendChild(ch)
      );
      result.push(a);
      continue;
    }

    if (tag === "STRONG" || tag === "B") {
      const s = doc.createElement("strong");
      s.setAttribute("style", "font-weight: bold; background-color: transparent;");
      cleanDomNodesForWord(Array.from(el.childNodes), doc, ctx).forEach((ch) => s.appendChild(ch));
      result.push(s);
      continue;
    }

    if (tag === "EM" || tag === "I") {
      const em = doc.createElement("em");
      em.setAttribute("style", "font-style: italic; background-color: transparent;");
      cleanDomNodesForWord(Array.from(el.childNodes), doc, ctx).forEach((ch) => em.appendChild(ch));
      result.push(em);
      continue;
    }

    if (tag === "U") {
      const u = doc.createElement("u");
      u.setAttribute("style", "text-decoration: underline; background-color: transparent;");
      cleanDomNodesForWord(Array.from(el.childNodes), doc, ctx).forEach((ch) => u.appendChild(ch));
      result.push(u);
      continue;
    }

    if (tag === "S" || tag === "DEL" || tag === "STRIKE") {
      const s = doc.createElement("s");
      s.setAttribute("style", "text-decoration: line-through; background-color: transparent;");
      cleanDomNodesForWord(Array.from(el.childNodes), doc, ctx).forEach((ch) => s.appendChild(ch));
      result.push(s);
      continue;
    }

    if (tag === "SUB" || tag === "SUP") {
      const subSup = doc.createElement(tag.toLowerCase());
      subSup.setAttribute("style", "background-color: transparent;");
      cleanDomNodesForWord(Array.from(el.childNodes), doc, ctx).forEach((ch) =>
        subSup.appendChild(ch)
      );
      result.push(subSup);
      continue;
    }

    if (tag === "SPAN") {
      const styleWeight = el.style?.fontWeight;
      const isBold = styleWeight === "bold" || Number(styleWeight) >= 600;
      const isItalic = el.style?.fontStyle === "italic";
      const children = cleanDomNodesForWord(Array.from(el.childNodes), doc, ctx);
      if (isBold && isItalic) {
        const b = doc.createElement("strong");
        b.setAttribute("style", "font-weight: bold;");
        const em = doc.createElement("em");
        em.setAttribute("style", "font-style: italic;");
        children.forEach((ch) => em.appendChild(ch));
        b.appendChild(em);
        result.push(b);
      } else if (isBold) {
        const b = doc.createElement("strong");
        b.setAttribute("style", "font-weight: bold;");
        children.forEach((ch) => b.appendChild(ch));
        result.push(b);
      } else if (isItalic) {
        const em = doc.createElement("em");
        em.setAttribute("style", "font-style: italic;");
        children.forEach((ch) => em.appendChild(ch));
        result.push(em);
      } else {
        result.push(...children);
      }
      continue;
    }

    // Any other wrapper tag: promote cleaned children
    result.push(...cleanDomNodesForWord(Array.from(el.childNodes), doc, ctx));
  }

  return result;
}

function serializeNodesToPlainText(
  nodes: Node[],
  depth = 0,
  plainIndent = ""
): string {
  const parts: string[] = [];

  for (let idx = 0; idx < nodes.length; idx++) {
    const node = nodes[idx];
    if (node.nodeType === Node.TEXT_NODE) {
      parts.push(node.textContent || "");
      continue;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) continue;
    const el = node as HTMLElement;
    const tag = el.tagName.toUpperCase();

    if (tag === "BR") {
      parts.push("\n");
      continue;
    }

    const classNameStr =
      typeof (el as any).className === "string"
        ? (el as any).className
        : (el as any).getAttribute?.("class") || "";
    if (classNameStr.includes("katex")) {
      const tex =
        (el as any).querySelector?.("annotation")?.textContent?.trim() ||
        el.textContent?.trim() ||
        "";
      const isDisplay =
        classNameStr.includes("katex-display") ||
        (el as any).closest?.(".katex-display") !== null;
      parts.push(isDisplay ? `\n$$${tex}$$\n\n` : `$${tex}$`);
      continue;
    }

    if (tag === "P" && el.getAttribute("data-wd-hr") === "true") {
      parts.push("────────────────────────────────\n\n");
      continue;
    }
    if (tag === "P" || /^H[1-6]$/.test(tag)) {
      const text = serializeNodesToPlainText(Array.from(el.childNodes)).trim();
      if (text) parts.push(`${text}\n\n`);
      continue;
    }
    if (tag === "PRE") {
      parts.push(`${(el.textContent || "").trimEnd()}\n\n`);
      continue;
    }
    if (tag === "BLOCKQUOTE") {
      const inner = serializeNodesToPlainText(Array.from(el.childNodes)).trim();
      const quoted = inner
        .split("\n")
        .map((line) => (line ? `> ${line}` : ">"))
        .join("\n");
      parts.push(`${quoted}\n\n`);
      continue;
    }
    if (tag === "UL" || tag === "OL") {
      const startNum = tag === "OL" ? parseInt(el.getAttribute("start") || "1", 10) || 1 : 1;
      let counter = startNum;
      const lines: string[] = [];
      Array.from(el.children).forEach((child) => {
        if (child.tagName.toUpperCase() !== "LI") return;
        const bullet = depth === 0 ? "•" : depth === 1 ? "◦" : "▪";
        const prefix = tag === "OL" ? `${counter++}. ` : `${bullet} `;
        const inlineParts: string[] = [];
        const nestedParts: string[] = [];
        child.childNodes.forEach((liChild) => {
          if (
            liChild.nodeType === Node.ELEMENT_NODE &&
            ["UL", "OL"].includes((liChild as HTMLElement).tagName.toUpperCase())
          ) {
            nestedParts.push(
              serializeNodesToPlainText([liChild], depth + 1, `${plainIndent}   `).trimEnd()
            );
          } else {
            inlineParts.push(serializeNodesToPlainText([liChild]));
          }
        });
        const itemLine = `${plainIndent}${prefix}${inlineParts.join("").trim()}`;
        lines.push(nestedParts.length > 0 ? `${itemLine}\n${nestedParts.join("\n")}` : itemLine);
      });
      parts.push(`${lines.join("\n")}${depth === 0 ? "\n\n" : "\n"}`);
      continue;
    }
    if (tag === "TABLE") {
      const rows = Array.from(el.querySelectorAll("tr"));
      const rowLines = rows.map((tr) =>
        Array.from(tr.children)
          .map((cell) => serializeNodesToPlainText(Array.from(cell.childNodes)).replace(/\s+/g, " ").trim())
          .join("\t")
      );
      parts.push(`${rowLines.join("\n")}\n\n`);
      continue;
    }

    parts.push(serializeNodesToPlainText(Array.from(el.childNodes), depth, plainIndent));
  }

  return parts.join("");
}

/**
 * Normalize a browser DOM Selection fragment copied from chat messages
 * into MS Word-standard HTML and clean plain text.
 */
export function buildWordPayloadFromFragment(
  fragment: DocumentFragment,
  options?: { reverseTopLevelMessages?: boolean }
): WordClipboardPayload | null {
  const doc = fragment.ownerDocument || document;
  let rootNodes = Array.from(fragment.childNodes);

  if (
    rootNodes.length === 1 &&
    rootNodes[0].nodeType === Node.ELEMENT_NODE &&
    (rootNodes[0] as HTMLElement).getAttribute("data-messages-order") === "reverse"
  ) {
    rootNodes = Array.from(rootNodes[0].childNodes);
  }

  // Inside flex-col-reverse message list, selecting across multiple messages clones them in reverse visual order
  if (options?.reverseTopLevelMessages) {
    const msgNodes = rootNodes.filter(
      (n) =>
        n.nodeType === Node.ELEMENT_NODE &&
        (n as HTMLElement).getAttribute("data-chat-message") === "true"
    );
    if (msgNodes.length > 1) {
      rootNodes = [...msgNodes].reverse();
    }
  }

  const containsBlocks = rootNodes.some((n) => hasBlockElements(n));
  let cleaned = cleanDomNodesForWord(rootNodes, doc);

  // Wrap orphan <li>, <tr>, or <td>/<th> selections so Word receives valid lists/tables
  const wrappedOrphans: Node[] = [];
  let liRun: HTMLElement[] = [];
  let trRun: HTMLElement[] = [];
  let cellRun: HTMLElement[] = [];

  const flushRuns = () => {
    if (liRun.length > 0) {
      const ul = doc.createElement("ul");
      ul.setAttribute("style", `${WORD_STYLES.ulTop} list-style-type: disc;`);
      liRun.forEach((li) => ul.appendChild(li));
      const last = ul.lastElementChild as HTMLElement | null;
      if (last) last.setAttribute("style", WORD_STYLES.liLast);
      wrappedOrphans.push(ul);
      liRun = [];
    }
    if (trRun.length > 0) {
      const table = createWordTableElement(doc);
      const tbody = doc.createElement("tbody");
      trRun.forEach((tr) => tbody.appendChild(tr));
      table.appendChild(tbody);
      wrappedOrphans.push(table);
      trRun = [];
    }
    if (cellRun.length > 0) {
      const table = createWordTableElement(doc);
      const tbody = doc.createElement("tbody");
      const tr = doc.createElement("tr");
      cellRun.forEach((c) => tr.appendChild(c));
      tbody.appendChild(tr);
      table.appendChild(tbody);
      wrappedOrphans.push(table);
      cellRun = [];
    }
  };

  for (const node of cleaned) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const tag = (node as HTMLElement).tagName.toUpperCase();
      if (tag === "LI") {
        liRun.push(node as HTMLElement);
        continue;
      }
      if (tag === "TR") {
        flushRuns();
        trRun.push(node as HTMLElement);
        continue;
      }
      if (tag === "TD" || tag === "TH") {
        flushRuns();
        cellRun.push(node as HTMLElement);
        continue;
      }
    }
    if (node.nodeType === Node.TEXT_NODE && !(node.textContent || "").trim()) {
      if (liRun.length > 0 || trRun.length > 0 || cellRun.length > 0) continue;
    }
    flushRuns();
    wrappedOrphans.push(node);
  }
  flushRuns();
  cleaned = wrappedOrphans;

  const container = doc.createElement("div");

  if (!containsBlocks && !cleaned.some((n) => hasBlockElements(n))) {
    // Inline-only selection (e.g. copying a phrase mid-sentence) -> preserve inline paste flow in Word
    const span = doc.createElement("span");
    span.setAttribute("style", WORD_STYLES.inlineText);
    cleaned.forEach((n) => span.appendChild(n));
    container.appendChild(span);
  } else {
    // Group any leftover direct inline nodes into a Word <p> and remove bottom margin on last block
    let inlineBuf: Node[] = [];
    const blockChildren: Node[] = [];
    const flushInline = () => {
      const txt = inlineBuf.map((n) => n.textContent || "").join("").trim();
      if (inlineBuf.length > 0 && txt) {
        const p = doc.createElement("p");
        p.setAttribute("style", WORD_STYLES.paragraph);
        inlineBuf.forEach((n) => p.appendChild(n));
        blockChildren.push(p);
      }
      inlineBuf = [];
    };

    for (const n of cleaned) {
      if (n.nodeType === Node.ELEMENT_NODE && BLOCK_TAGS.has((n as HTMLElement).tagName)) {
        flushInline();
        blockChildren.push(n);
      } else {
        inlineBuf.push(n);
      }
    }
    flushInline();

    blockChildren.forEach((child, idx) => {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as HTMLElement;
        if (idx === 0 && /^H[1-6]$/.test(el.tagName)) {
          el.setAttribute("style", withZeroTopMargin(el.getAttribute("style") || ""));
        }
        if (idx === blockChildren.length - 1) {
          el.setAttribute("style", withZeroBottomMargin(el.getAttribute("style") || ""));
        }
      }
      container.appendChild(child);
    });
  }

  const plainText = serializeNodesToPlainText(Array.from(container.childNodes))
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!plainText) return null;

  return {
    html: container.innerHTML,
    plainText,
  };
}

/**
 * React `onCopy` handler for chat message containers: intercepts manual selection
 * copies and places MS Word-formatted HTML + clean plain text onto the clipboard.
 */
export function handleChatSelectionCopy(
  e: {
    preventDefault: () => void;
    clipboardData: DataTransfer | null;
    currentTarget: HTMLElement;
  }
): void {
  if (typeof window === "undefined" || !e.clipboardData) return;

  const activeTag = document.activeElement?.tagName.toUpperCase();
  if (activeTag === "INPUT" || activeTag === "TEXTAREA") return;

  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;

  const range = selection.getRangeAt(0);
  if (!e.currentTarget.contains(range.commonAncestorContainer)) return;

  const fragment = range.cloneContents();
  const isReversedContainer =
    e.currentTarget.getAttribute("data-messages-order") === "reverse" ||
    Boolean(e.currentTarget.querySelector('[data-messages-order="reverse"]'));

  const payload = buildWordPayloadFromFragment(fragment, {
    reverseTopLevelMessages: isReversedContainer,
  });
  if (!payload) return;

  e.preventDefault();
  e.clipboardData.setData("text/html", payload.html);
  e.clipboardData.setData("text/plain", payload.plainText);
}
