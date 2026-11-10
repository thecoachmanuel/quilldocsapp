"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import SimpleBar from "simplebar-react";
import {
  Loader2,
  Search,
  ZoomIn,
  X,
  ChevronDown,
  ChevronUp,
  Expand,
  FileText,
  Eye,
  FileCode,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { useResizeDetector } from "react-resize-detector";
import { cn } from "@/lib/utils";

interface DocxRendererProps {
  fileId: string;
  url: string;
  fileName?: string;
}

/**
 * Post-processes docx-preview output so that pages align 100% with MS Word:
 * 1. Fixes docx-preview's Default Paragraph (Normal) span selector so Times New Roman 12pt (or the document's Normal font) applies to all default text runs instead of falling back to docDefaults (11pt Calibri).
 * 2. Preserves MS Word's exact <w:lastRenderedPageBreak/> page boundaries and cleans up docx-preview's split-paragraph artifacts (phantom empty list items at the bottom of a page and erroneous first-line indents on mid-sentence continuations at the top of the next page).
 * 3. Calibrates browser line-height metrics to match MS Word's exact page content box so every page maintains exact MS Word dimensions and margins without overflowing or clipping.
 */
function formatAndPaginateDocx(rootEl: HTMLElement): number {
  // Step 0: Fix docx-preview stylesheet bug where default paragraph style (Normal) rPr
  // outputs ".docx p, p.docx_normal span" without ".docx :where(p) span", causing runs
  // in default paragraphs to fall back to docDefaults (.docx span = 11pt Calibri).
  const styleTags = Array.from(rootEl.querySelectorAll("style"));
  styleTags.forEach((styleEl) => {
    if (!styleEl.textContent) return;
    styleEl.textContent = styleEl.textContent.replace(
      /(\.docx\s+p)\s*,\s*(p\.docx_[a-zA-Z0-9_-]+\s+span)/g,
      "$1, .docx :where(p) span, $2"
    );
  });

  const wrapper =
    (rootEl.querySelector(".docx-wrapper") as HTMLElement) || rootEl;
  const initialSections = Array.from(
    wrapper.querySelectorAll("section.docx")
  ) as HTMLElement[];

  if (initialSections.length === 0) return 0;

  // Step 1: If docx-preview already split the document into MS Word pages (initialSections.length > 1),
  // clean up docx-preview's paragraph-splitting artifacts at page boundaries so every page aligns 100% with MS Word.
  if (initialSections.length > 1) {
    for (let i = 0; i < initialSections.length - 1; i++) {
      const currArticle = initialSections[i].querySelector(
        "article"
      ) as HTMLElement | null;
      const nextArticle = initialSections[i + 1].querySelector(
        "article"
      ) as HTMLElement | null;
      if (!currArticle || !nextArticle) continue;

      // A. Remove phantom empty <p> left at the bottom of page i when <w:lastRenderedPageBreak/>
      // was at the very start of a paragraph (prevents phantom blank lines and shifted list numbers)
      const lastChild = currArticle.lastElementChild as HTMLElement | null;
      if (
        lastChild &&
        lastChild.tagName === "P" &&
        (lastChild.textContent || "").trim() === "" &&
        !lastChild.querySelector("img, svg, table, canvas")
      ) {
        lastChild.remove();
      }

      // B. If a paragraph was split mid-sentence across page i and page i+1, remove the
      // erroneous first-line indent on the continuation fragment at the top of page i+1
      const newLastP = currArticle.lastElementChild as HTMLElement | null;
      const nextFirstP = nextArticle.firstElementChild as HTMLElement | null;
      if (
        newLastP &&
        nextFirstP &&
        newLastP.tagName === "P" &&
        nextFirstP.tagName === "P"
      ) {
        const lastText = (newLastP.textContent || "").trim();
        const firstText = (nextFirstP.textContent || "").trim();
        const isMidSentenceSplit =
          lastText.length > 0 &&
          firstText.length > 0 &&
          (!/[.!?:;"')\]]$/.test(lastText) || /^[a-z]/.test(firstText));

        if (isMidSentenceSplit) {
          nextFirstP.style.textIndent = "0pt";
          nextFirstP.style.marginTop = "0pt";
          newLastP.style.marginBottom = "0pt";
          const computedAlign = window.getComputedStyle(newLastP).textAlign;
          if (computedAlign === "justify") {
            newLastP.style.textAlignLast = "justify";
          }
        }
      }
    }
  } else {
    // Only when a document has a single section and no MS Word <w:lastRenderedPageBreak/> markers,
    // split into pages if its content significantly exceeds 1 page height
    const section = initialSections[0];
    if (!section.style.width) section.style.width = "612pt";
    if (!section.style.minHeight) section.style.minHeight = "792pt";
    if (!section.style.paddingTop && !section.style.padding) {
      section.style.padding = "72pt 72pt";
    }
    const computed = window.getComputedStyle(section);
    const minH = parseFloat(computed.minHeight) || 1056;
    const padTop = parseFloat(computed.paddingTop) || 96;
    const padBottom = parseFloat(computed.paddingBottom) || 96;
    const maxContentHeight = Math.max(400, minH - padTop - padBottom);

    const article = section.querySelector("article") as HTMLElement | null;
    if (
      article &&
      article.children.length > 1 &&
      article.scrollHeight > maxContentHeight * 1.3
    ) {
      let currentSection = section;
      let currentArticle = article;
      let safetyCounter = 0;

      while (
        currentArticle.scrollHeight > maxContentHeight + 28 &&
        currentArticle.children.length > 1 &&
        safetyCounter < 60
      ) {
        safetyCounter++;
        const children = Array.from(currentArticle.children) as HTMLElement[];
        const articleRect = currentArticle.getBoundingClientRect();
        let splitIdx = -1;

        for (let i = 1; i < children.length; i++) {
          const childRect = children[i].getBoundingClientRect();
          const relBottom = childRect.bottom - articleRect.top;
          if (relBottom > maxContentHeight) {
            splitIdx = i;
            break;
          }
        }

        if (splitIdx === -1) break;

        const nextSection = currentSection.cloneNode(false) as HTMLElement;
        const headerClone = currentSection
          .querySelector("header")
          ?.cloneNode(true);
        if (headerClone) nextSection.appendChild(headerClone);

        const nextArticle = currentArticle.cloneNode(false) as HTMLElement;
        for (let i = splitIdx; i < children.length; i++) {
          nextArticle.appendChild(children[i]);
        }
        nextSection.appendChild(nextArticle);

        const footerClone = currentSection
          .querySelector("footer")
          ?.cloneNode(true);
        if (footerClone) nextSection.appendChild(footerClone);

        currentSection.insertAdjacentElement("afterend", nextSection);
        currentSection = nextSection;
        currentArticle = nextArticle;
      }
    }
  }

  // Step 2: Lock every page to its exact MS Word page dimensions and calibrate vertical line-height
  // so browser font metrics fit 100% inside the exact MS Word page margins without overflow
  const allPages = Array.from(
    wrapper.querySelectorAll("section.docx")
  ) as HTMLElement[];

  allPages.forEach((pageEl, idx) => {
    if (!pageEl.style.width) pageEl.style.width = "612pt";
    if (!pageEl.style.minHeight) pageEl.style.minHeight = "792pt";
    if (!pageEl.style.paddingTop && !pageEl.style.padding) {
      pageEl.style.padding = "72pt 72pt";
    }
    pageEl.style.boxSizing = "border-box";
    pageEl.style.backgroundColor = "#ffffff";
    pageEl.style.display = "flex";
    pageEl.style.flexFlow = "column nowrap";
    pageEl.style.transform = "none";
    pageEl.style.margin = "0";

    const computed = window.getComputedStyle(pageEl);
    const naturalW = Math.round(parseFloat(computed.width) || 816);
    const targetH = Math.round(parseFloat(computed.minHeight) || 1056);
    const padTop = parseFloat(computed.paddingTop) || 96;
    const padBottom = parseFloat(computed.paddingBottom) || 96;
    const headerH =
      (pageEl.querySelector("header") as HTMLElement)?.offsetHeight || 0;
    const footerH =
      (pageEl.querySelector("footer") as HTMLElement)?.offsetHeight || 0;
    const maxContentHeight = Math.max(
      400,
      targetH - padTop - padBottom - headerH - footerH
    );

    const article = pageEl.querySelector("article") as HTMLElement | null;
    if (article && article.scrollHeight > maxContentHeight) {
      // Browser CSS line-height (e.g. 2.00) is ~4-6% taller than MS Word's native GDI line layout.
      // Calibrate line-height & paragraph spacing proportionally so the exact MS Word lines fit within the page margins.
      const ratio = maxContentHeight / article.scrollHeight;
      const blocks = Array.from(
        article.querySelectorAll("p, td, th, li")
      ) as HTMLElement[];
      blocks.forEach((el) => {
        const cs = window.getComputedStyle(el);
        const lh = parseFloat(cs.lineHeight);
        const fs = parseFloat(cs.fontSize) || 16;
        if (!isNaN(lh) && lh > fs * 1.1) {
          const calibratedLh = Math.max(fs * 1.08, lh * ratio * 0.985);
          el.style.lineHeight = `${calibratedLh.toFixed(2)}px`;
        }
        const mb = parseFloat(cs.marginBottom);
        if (!isNaN(mb) && mb > 0) {
          el.style.marginBottom = `${(mb * ratio * 0.94).toFixed(2)}px`;
        }
        const mt = parseFloat(cs.marginTop);
        if (!isNaN(mt) && mt > 0) {
          el.style.marginTop = `${(mt * ratio * 0.94).toFixed(2)}px`;
        }
      });

      // If still slightly taller (e.g. dense tables), absorb remaining pixels into top/bottom padding
      if (article.scrollHeight > maxContentHeight + 2) {
        const extra = article.scrollHeight - maxContentHeight;
        if (extra <= padTop + padBottom - 40) {
          pageEl.style.paddingTop = `${Math.max(20, padTop - extra * 0.4)}px`;
          pageEl.style.paddingBottom = `${Math.max(
            20,
            padBottom - extra * 0.6
          )}px`;
        }
      }
    }

    const finalH = Math.max(targetH, pageEl.scrollHeight || targetH);
    pageEl.style.width = `${naturalW}px`;
    pageEl.style.height = `${finalH}px`;
    pageEl.style.minHeight = `${finalH}px`;

    pageEl.dataset.naturalWidth = String(naturalW);
    pageEl.dataset.naturalHeight = String(finalH);

    let frame = pageEl.parentElement;
    if (!frame || !frame.classList.contains("docx-page-frame")) {
      frame = document.createElement("div");
      frame.className = "docx-page-frame";
      pageEl.parentNode?.insertBefore(frame, pageEl);
      frame.appendChild(pageEl);
    }
    frame.dataset.pageNumber = String(idx + 1);
  });

  return allPages.length;
}

/**
 * Displays only the active page (currPage) and scales it cleanly with CSS transform
 */
function syncActivePageAndScale(
  rootEl: HTMLElement | null,
  activePage: number,
  availableWidth: number,
  userScale: number,
  isExpanded: boolean = false
) {
  if (!rootEl) return;
  const frames = Array.from(
    rootEl.querySelectorAll(".docx-page-frame")
  ) as HTMLElement[];
  if (frames.length === 0) return;

  const BASE_WIDTH = 816;
  const sideAllowance = availableWidth < 640 ? 6 : 24;
  const maxWidthAllowed = Math.max(availableWidth - sideAllowance, 260);
  const maxFit = isExpanded ? 1.4 : 1.15;
  const fitScale = Math.min(maxWidthAllowed / BASE_WIDTH, maxFit);
  const effectiveScale = fitScale * userScale;

  const clampedPage = Math.min(Math.max(1, activePage), frames.length);

  frames.forEach((frame) => {
    const pageNum = Number(frame.dataset.pageNumber || "1");
    const pageEl = frame.querySelector("section.docx") as HTMLElement | null;
    if (!pageEl) return;

    if (pageNum !== clampedPage) {
      frame.style.display = "none";
      return;
    }

    frame.style.display = "block";
    const naturalW = parseFloat(pageEl.dataset.naturalWidth || "816") || 816;
    const naturalH = parseFloat(pageEl.dataset.naturalHeight || "1056") || 1056;

    const scaledW = Math.round(naturalW * effectiveScale);
    const scaledH = Math.round(naturalH * effectiveScale);

    frame.style.width = `${scaledW}px`;
    frame.style.height = `${scaledH}px`;
    frame.style.margin = "0 auto";
    frame.style.position = "relative";

    pageEl.style.position = "absolute";
    pageEl.style.top = "0";
    pageEl.style.left = "0";
    pageEl.style.transform = `scale(${effectiveScale})`;
    pageEl.style.transformOrigin = "top left";
  });
}

function applyDomKeywordHighlight(root: HTMLElement | null, query: string) {
  if (!root) return;

  // 1. Remove existing highlights
  const existingMarks = Array.from(
    root.querySelectorAll("mark.docx-search-highlight")
  );
  existingMarks.forEach((mark) => {
    const parent = mark.parentNode;
    if (parent) {
      parent.replaceChild(
        document.createTextNode(mark.textContent || ""),
        mark
      );
      parent.normalize();
    }
  });

  const q = query.trim();
  if (!q) return;

  const escaped = q.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
  const regex = new RegExp(`(${escaped})`, "gi");

  // 2. Walk text nodes and wrap matches in <mark>
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  const textNodes: Text[] = [];
  let current: Node | null;
  while ((current = walker.nextNode())) {
    if (current.nodeValue && regex.test(current.nodeValue)) {
      textNodes.push(current as Text);
    }
  }

  textNodes.forEach((node) => {
    const parent = node.parentNode;
    if (
      !parent ||
      parent.nodeName === "SCRIPT" ||
      parent.nodeName === "STYLE" ||
      (parent as HTMLElement).classList?.contains("docx-search-highlight")
    ) {
      return;
    }
    const val = node.nodeValue || "";
    const frag = document.createDocumentFragment();
    let lastIdx = 0;
    regex.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(val)) !== null) {
      if (m.index > lastIdx) {
        frag.appendChild(
          document.createTextNode(val.substring(lastIdx, m.index))
        );
      }
      const mark = document.createElement("mark");
      mark.className = "docx-search-highlight";
      mark.textContent = m[0];
      frag.appendChild(mark);
      lastIdx = regex.lastIndex;
    }
    if (lastIdx < val.length) {
      frag.appendChild(document.createTextNode(val.substring(lastIdx)));
    }
    parent.replaceChild(frag, node);
  });
}

export default function DocxRenderer({
  fileId,
  url,
  fileName,
}: DocxRendererProps) {
  const [currPage, setCurrPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [scale, setScale] = useState<number>(1);
  const [htmlContent, setHtmlContent] = useState<string>("");
  const [wordCount, setWordCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isHtmlLoading, setIsHtmlLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isFullscreenOpen, setIsFullscreenOpen] = useState<boolean>(false);
  const [renderMode, setRenderMode] = useState<"page" | "clean">("page");
  const [windowWidth, setWindowWidth] = useState<number>(0);

  // In-Document Keyword Search (Ctrl + F)
  const [isSearchOpen, setIsSearchOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [searchMatches, setSearchMatches] = useState<number[]>([]);
  const [currentMatchIdx, setCurrentMatchIdx] = useState<number>(0);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const fullscreenContainerRef = useRef<HTMLDivElement>(null);
  const blobRef = useRef<Blob | null>(null);
  const isRenderingRef = useRef<boolean>(false);

  // Listen for citation jump events from Quill AI Assistant chat
  useEffect(() => {
    const handleJump = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      if (detail && typeof detail.page === "number") {
        const targetPage = Math.min(Math.max(1, detail.page), totalPages);
        setCurrPage(targetPage);
      }
    };
    window.addEventListener("quill:jump-to-page", handleJump);
    return () => window.removeEventListener("quill:jump-to-page", handleJump);
  }, [totalPages]);

  // Keyboard shortcut Ctrl+F / Cmd+F to open in-document search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setIsSearchOpen(true);
        setTimeout(() => searchInputRef.current?.focus(), 50);
      } else if (e.key === "Escape" && isSearchOpen) {
        setIsSearchOpen(false);
        setSearchQuery("");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSearchOpen]);

  // Search across document pages whenever searchQuery changes
  useEffect(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) {
      setSearchMatches([]);
      setCurrentMatchIdx(0);
      return;
    }

    const matches: number[] = [];
    const container = containerRef.current;
    if (container) {
      const frames = Array.from(
        container.querySelectorAll(".docx-page-frame")
      ) as HTMLElement[];
      frames.forEach((frame) => {
        const text = frame.textContent?.toLowerCase() || "";
        if (text.includes(q)) {
          const pNum = Number(frame.dataset.pageNumber || "1");
          matches.push(pNum);
        }
      });
    }

    if (matches.length === 0 && htmlContent) {
      if (htmlContent.toLowerCase().includes(q)) {
        matches.push(1);
      }
    }

    setSearchMatches(matches);
    if (matches.length > 0) {
      setCurrentMatchIdx(0);
      setCurrPage(matches[0]);
    } else {
      setCurrentMatchIdx(0);
    }
  }, [searchQuery, htmlContent]);

  const handleNextMatch = () => {
    if (searchMatches.length === 0) return;
    const nextIdx = (currentMatchIdx + 1) % searchMatches.length;
    setCurrentMatchIdx(nextIdx);
    setCurrPage(searchMatches[nextIdx]);
  };

  const handlePrevMatch = () => {
    if (searchMatches.length === 0) return;
    const prevIdx =
      (currentMatchIdx - 1 + searchMatches.length) % searchMatches.length;
    setCurrentMatchIdx(prevIdx);
    setCurrPage(searchMatches[prevIdx]);
  };

  // Dynamically highlight matching keywords in the rendered MS Word DOM
  useEffect(() => {
    applyDomKeywordHighlight(containerRef.current, searchQuery);
    applyDomKeywordHighlight(fullscreenContainerRef.current, searchQuery);
  }, [searchQuery, currPage, isLoading, isFullscreenOpen, renderMode]);

  const { width: containerWidth, ref: resizeDetectorRef } = useResizeDetector();
  const { width: fullscreenContainerWidth, ref: fullscreenResizeRef } =
    useResizeDetector();

  useEffect(() => {
    const updateWidth = () => setWindowWidth(window.innerWidth);
    updateWidth();
    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, [isFullscreenOpen]);

  const clientWidth =
    typeof window !== "undefined"
      ? Math.max(window.innerWidth - (window.innerWidth < 640 ? 14 : 28), 280)
      : 360;
  const effectiveContainerWidth = Math.min(
    containerWidth || clientWidth,
    clientWidth
  );
  const effectiveFullscreenWidth =
    fullscreenContainerWidth ||
    (windowWidth ? Math.min(windowWidth - 24, 1340) : 1150);

  const handlePrev = useCallback(() => {
    setCurrPage((prev) => (prev > 1 ? prev - 1 : 1));
  }, []);

  const handleNext = useCallback(() => {
    setCurrPage((prev) => (prev < totalPages ? prev + 1 : totalPages));
  }, [totalPages]);

  // Keyboard navigation between pages
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "ArrowLeft" || e.key === "PageUp") {
        handlePrev();
      } else if (e.key === "ArrowRight" || e.key === "PageDown") {
        handleNext();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handlePrev, handleNext]);

  // 1. Fetch document HTML for Reader View and word count from API
  useEffect(() => {
    let isMounted = true;
    setIsHtmlLoading(true);

    fetch(`/api/document-content?fileId=${encodeURIComponent(fileId)}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load document content");
        return res.json();
      })
      .then((data) => {
        if (!isMounted) return;
        if (data.parsed) {
          const fallbackParagraphs = (data.parsed.text || "")
            .split(/\n\n+/)
            .filter(Boolean)
            .map((p: string) => `<p>${p.replace(/\n/g, "<br/>")}</p>`)
            .join("");
          setHtmlContent(
            data.parsed.html ||
              fallbackParagraphs ||
              "<p>Document content loaded.</p>"
          );
          setWordCount(data.parsed.totalWords || 0);
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        console.error("DocxRenderer API error:", err);
      })
      .finally(() => {
        if (isMounted) setIsHtmlLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [fileId]);

  // Helper to fetch file blob (direct URL or via API raw proxy)
  const getDocumentBlob = useCallback(async (): Promise<Blob> => {
    if (blobRef.current) return blobRef.current;

    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("Direct fetch failed");
      const blob = await res.blob();
      blobRef.current = blob;
      return blob;
    } catch {
      const proxyRes = await fetch(
        `/api/document-content?fileId=${encodeURIComponent(fileId)}&raw=true`
      );
      if (!proxyRes.ok) throw new Error("Failed to fetch document file");
      const blob = await proxyRes.blob();
      blobRef.current = blob;
      return blob;
    }
  }, [url, fileId]);

  // 2. Render Page View using docx-preview + pagination & transform scaling
  const renderPageView = useCallback(async () => {
    if (!containerRef.current || isRenderingRef.current) return;
    isRenderingRef.current = true;
    setIsLoading(true);
    setError(null);

    try {
      const blob = await getDocumentBlob();
      const { renderAsync } = await import("docx-preview");

      if (containerRef.current) {
        containerRef.current.innerHTML = "";
        await renderAsync(blob, containerRef.current, undefined, {
          className: "docx",
          inWrapper: true,
          ignoreWidth: false,
          ignoreHeight: false,
          breakPages: true,
          ignoreLastRenderedPageBreak: false,
          experimental: true,
          useBase64URL: true,
          renderHeaders: true,
          renderFooters: true,
          renderFootnotes: true,
        });

        const count = formatAndPaginateDocx(containerRef.current);
        const validCount = Math.max(1, count);
        setTotalPages(validCount);
        setCurrPage(1);
        syncActivePageAndScale(
          containerRef.current,
          1,
          effectiveContainerWidth,
          scale,
          false
        );
      }
    } catch (err: any) {
      console.warn("docx-preview rendering fallback:", err);
      setError(
        "Page layout preview unavailable for this file format. Showing Reader view."
      );
      setRenderMode("clean");
    } finally {
      isRenderingRef.current = false;
      setIsLoading(false);
    }
  }, [getDocumentBlob, effectiveContainerWidth, scale]);

  // Initial load on file change
  useEffect(() => {
    blobRef.current = null;
    isRenderingRef.current = false;
    setCurrPage(1);
    renderPageView();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileId, url]);

  // Sync active page and scale whenever currPage, container width, or zoom changes
  useEffect(() => {
    if (!isLoading && containerRef.current) {
      syncActivePageAndScale(
        containerRef.current,
        currPage,
        effectiveContainerWidth,
        scale,
        false
      );
    }
  }, [currPage, effectiveContainerWidth, scale, isLoading, renderMode]);

  // Render into fullscreen modal when opened
  useEffect(() => {
    if (isFullscreenOpen) {
      const timer = setTimeout(async () => {
        if (!fullscreenContainerRef.current) return;
        try {
          const blob = await getDocumentBlob();
          const { renderAsync } = await import("docx-preview");
          if (fullscreenContainerRef.current) {
            fullscreenContainerRef.current.innerHTML = "";
            await renderAsync(blob, fullscreenContainerRef.current, undefined, {
              className: "docx",
              inWrapper: true,
              ignoreWidth: false,
              ignoreHeight: false,
              breakPages: true,
              ignoreLastRenderedPageBreak: false,
              experimental: true,
              useBase64URL: true,
              renderHeaders: true,
              renderFooters: true,
              renderFootnotes: true,
            });
            formatAndPaginateDocx(fullscreenContainerRef.current);
            syncActivePageAndScale(
              fullscreenContainerRef.current,
              currPage,
              effectiveFullscreenWidth,
              scale,
              true
            );
          }
        } catch {
          // Fallback to Reader View in fullscreen if error occurs
        }
      }, 60);

      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFullscreenOpen, getDocumentBlob]);

  // Sync fullscreen page & scale when currPage, zoom, or window size changes
  useEffect(() => {
    if (isFullscreenOpen && fullscreenContainerRef.current) {
      syncActivePageAndScale(
        fullscreenContainerRef.current,
        currPage,
        effectiveFullscreenWidth,
        scale,
        true
      );
    }
  }, [currPage, effectiveFullscreenWidth, scale, isFullscreenOpen, renderMode]);

  // Mobile & Desktop Reflowable Reader View
  const renderReaderView = () => {
    const displayHtml = searchQuery.trim()
      ? htmlContent.replace(
          new RegExp(
            `(${searchQuery.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&")})`,
            "gi"
          ),
          "<mark class='bg-amber-300 text-zinc-900 rounded-xs px-0.5 font-medium'>$1</mark>"
        )
      : htmlContent;

    return (
      <div className="w-full max-w-4xl mx-auto my-2 sm:my-5 bg-white border border-zinc-200 shadow-sm rounded-lg p-4 sm:p-10 md:p-14 select-text">
        {isHtmlLoading && !htmlContent ? (
          <div className="py-16 flex flex-col items-center justify-center gap-2">
            <Loader2 className="h-7 w-7 animate-spin text-blue-600" />
            <p className="text-sm text-zinc-500">Preparing Reader View...</p>
          </div>
        ) : (
          <div
            style={{ fontSize: `${Math.round(scale * 100)}%` }}
            className="prose prose-zinc max-w-none prose-headings:font-bold prose-headings:text-zinc-900 prose-p:text-zinc-800 prose-p:leading-relaxed prose-li:text-zinc-800 prose-table:border prose-th:bg-zinc-50 prose-td:p-2 overflow-x-auto break-words"
            dangerouslySetInnerHTML={{
              __html: displayHtml || "<p>No text content found in document.</p>",
            }}
          />
        )}
      </div>
    );
  };

  return (
    <div className="w-full max-w-full bg-white rounded-md shadow flex flex-col items-center overflow-x-hidden">
      {/* Top Toolbar matching Quill app design with Page Navigation */}
      <div className="min-h-[3.25rem] h-auto py-1 sm:h-14 sm:py-0 w-full border-b border-zinc-200 flex items-center justify-between px-1.5 sm:px-2 gap-1 overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-1 sm:gap-1.5 min-w-0 shrink-0">
          <Button
            disabled={currPage <= 1 || renderMode === "clean"}
            onClick={handlePrev}
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 shrink-0"
            aria-label="previous page"
          >
            <ChevronDown className="h-4 w-4" />
          </Button>

          <div className="flex items-center gap-1 shrink-0">
            <Input
              value={currPage}
              disabled={renderMode === "clean"}
              onChange={(e) => {
                const val = Number(e.target.value);
                if (val >= 1 && val <= totalPages) {
                  setCurrPage(val);
                }
              }}
              className="w-9 sm:w-12 h-7 sm:h-8 text-center px-0.5 text-xs sm:text-sm"
            />
            <p className="text-zinc-700 text-xs sm:text-sm space-x-0.5">
              <span>/</span>
              <span>{totalPages}</span>
            </p>
          </div>

          <Button
            disabled={currPage >= totalPages || renderMode === "clean"}
            onClick={handleNext}
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 shrink-0"
            aria-label="next page"
          >
            <ChevronUp className="h-4 w-4" />
          </Button>

          <div className="ml-1 hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded bg-blue-50 text-blue-700 text-xs font-medium border border-blue-200 shrink-0">
            <FileText className="h-3.5 w-3.5 text-blue-600 shrink-0" />
            <span>Word</span>
          </div>

          {/* View Mode Toggle (Prominent & accessible on both Mobile and Desktop) */}
          <div className="flex items-center bg-zinc-100 p-0.5 rounded-md text-xs border border-zinc-200 ml-0.5 sm:ml-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setRenderMode("page")}
              className={cn(
                "px-1.5 sm:px-2 py-1 rounded flex items-center gap-1 transition-all",
                renderMode === "page"
                  ? "bg-white text-zinc-900 font-semibold shadow-sm"
                  : "text-zinc-600 hover:text-zinc-900"
              )}
            >
              <Eye className="h-3 w-3 shrink-0" />
              <span className="hidden sm:inline">Page View</span>
              <span className="sm:hidden">Pages</span>
            </button>
            <button
              type="button"
              onClick={() => setRenderMode("clean")}
              className={cn(
                "px-1.5 sm:px-2 py-1 rounded flex items-center gap-1 transition-all",
                renderMode === "clean"
                  ? "bg-white text-zinc-900 font-semibold shadow-sm"
                  : "text-zinc-600 hover:text-zinc-900"
              )}
            >
              <FileCode className="h-3 w-3 shrink-0" />
              <span>Reader</span>
            </button>
          </div>
        </div>

        <div className="space-x-0.5 sm:space-x-1.5 flex items-center shrink-0">
          {/* In-Document Keyword Search (Ctrl+F) */}
          {isSearchOpen ? (
            <div className="flex items-center gap-1 bg-zinc-100 p-0.5 sm:p-1 rounded-md border border-zinc-300 shrink-0">
              <Search className="h-3.5 w-3.5 text-zinc-400 ml-1 shrink-0" />
              <Input
                ref={searchInputRef}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Find in doc..."
                className="h-7 w-20 sm:w-36 md:w-44 text-xs bg-white px-1.5 py-0 border-zinc-200"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (e.shiftKey) handlePrevMatch();
                    else handleNextMatch();
                  } else if (e.key === "Escape") {
                    setIsSearchOpen(false);
                    setSearchQuery("");
                  }
                }}
              />
              {searchQuery.trim() && (
                <span className="text-[10px] sm:text-[11px] font-medium text-zinc-600 px-0.5 whitespace-nowrap">
                  {searchMatches.length > 0
                    ? `${currentMatchIdx + 1}/${searchMatches.length}`
                    : "0"}
                </span>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 text-zinc-600"
                disabled={searchMatches.length <= 1}
                onClick={handlePrevMatch}
                title="Previous match (Shift+Enter)"
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 text-zinc-600"
                disabled={searchMatches.length <= 1}
                onClick={handleNextMatch}
                title="Next match (Enter)"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 text-zinc-400 hover:text-zinc-800"
                onClick={() => {
                  setIsSearchOpen(false);
                  setSearchQuery("");
                }}
                title="Close find (Esc)"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <Button
              variant="ghost"
              className="gap-1 px-1.5 sm:px-2.5 h-8 text-xs sm:text-sm text-zinc-600 hover:text-zinc-900"
              onClick={() => {
                setIsSearchOpen(true);
                setTimeout(() => searchInputRef.current?.focus(), 50);
              }}
              title="Find text in document (Ctrl+F)"
              aria-label="Find in document"
            >
              <Search className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span className="hidden lg:inline text-xs">Find</span>
            </Button>
          )}

          {/* Zoom Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                className="gap-0.5 sm:gap-1 px-1.5 sm:px-2.5 h-7 sm:h-8 text-xs sm:text-sm"
                aria-label="zoom"
                variant="ghost"
              >
                <ZoomIn className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                {Math.round(scale * 100)}%
                <ChevronDown className="h-3 w-3 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onSelect={() => setScale(0.75)}>
                75%
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setScale(1)}>
                100% (Fit)
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setScale(1.25)}>
                125%
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setScale(1.5)}>
                150%
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setScale(2)}>
                200%
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Fullscreen / Expanded View Dialog */}
          <Dialog
            open={isFullscreenOpen}
            onOpenChange={(v) => setIsFullscreenOpen(v)}
          >
            <DialogTrigger asChild>
              <Button
                variant="ghost"
                className="gap-1.5 px-1.5 sm:px-2.5 h-8"
                aria-label="fullscreen"
                title="Expand document view"
              >
                <Expand className="h-4 w-4" />
              </Button>
            </DialogTrigger>
            <DialogContent className="w-[98vw] max-w-[98vw] sm:max-w-[95vw] xl:max-w-7xl h-[92dvh] sm:h-[92vh] p-2 sm:p-5 flex flex-col overflow-hidden gap-0">
              <div className="shrink-0 flex items-center justify-between pb-2.5 border-b border-zinc-200 pr-8 gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded bg-blue-50 text-blue-700 text-xs font-medium border border-blue-200 shrink-0">
                    <FileText className="h-3.5 w-3.5 text-blue-600" />
                    <span>Word Document</span>
                  </div>
                  <span className="font-semibold text-xs sm:text-sm text-zinc-900 truncate max-w-[100px] sm:max-w-md">
                    {fileName || "Document"}
                  </span>
                </div>

                <div className="flex items-center gap-1 sm:gap-2 shrink-0">
                  {renderMode === "page" && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 sm:h-8 px-2 text-xs"
                        disabled={currPage <= 1}
                        onClick={handlePrev}
                      >
                        Prev
                      </Button>
                      <div className="flex items-center gap-1">
                        <Input
                          value={currPage}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            if (val >= 1 && val <= totalPages) {
                              setCurrPage(val);
                            }
                          }}
                          className="w-9 sm:w-11 h-7 sm:h-8 text-center px-1 text-xs"
                        />
                        <span className="text-xs text-zinc-600 font-medium whitespace-nowrap">
                          / {totalPages}
                        </span>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 sm:h-8 px-2 text-xs"
                        disabled={currPage >= totalPages}
                        onClick={handleNext}
                      >
                        Next
                      </Button>
                    </>
                  )}

                  {/* Page View / Reader Toggle inside Expanded View */}
                  <div className="flex items-center bg-zinc-100 p-0.5 rounded-md text-xs border border-zinc-200">
                    <button
                      type="button"
                      onClick={() => setRenderMode("page")}
                      className={cn(
                        "px-1.5 sm:px-2 py-1 rounded flex items-center gap-1 transition-all",
                        renderMode === "page"
                          ? "bg-white text-zinc-900 font-semibold shadow-sm"
                          : "text-zinc-600 hover:text-zinc-900"
                      )}
                    >
                      <Eye className="h-3 w-3 shrink-0" />
                      <span>Pages</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setRenderMode("clean")}
                      className={cn(
                        "px-1.5 sm:px-2 py-1 rounded flex items-center gap-1 transition-all",
                        renderMode === "clean"
                          ? "bg-white text-zinc-900 font-semibold shadow-sm"
                          : "text-zinc-600 hover:text-zinc-900"
                      )}
                    >
                      <FileCode className="h-3 w-3 shrink-0" />
                      <span>Reader</span>
                    </button>
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 sm:h-8 gap-1 text-xs px-2"
                      >
                        <ZoomIn className="h-3.5 w-3.5" />
                        {Math.round(scale * 100)}%
                        <ChevronDown className="h-3 w-3 opacity-50" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem onSelect={() => setScale(0.75)}>
                        75%
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setScale(1)}>
                        100% (Fit)
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setScale(1.25)}>
                        125%
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setScale(1.5)}>
                        150%
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setScale(2)}>
                        200%
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              {/* Scrollable document area */}
              <SimpleBar
                autoHide={false}
                className="flex-1 min-h-0 max-h-[calc(92dvh-5rem)] w-full mt-2 bg-zinc-100/70 rounded-lg"
              >
                <div
                  ref={fullscreenResizeRef}
                  className="p-1 sm:p-4 overflow-x-auto w-full min-h-[360px]"
                >
                  <div
                    ref={fullscreenContainerRef}
                    className={
                      renderMode === "page" ? "block w-full" : "hidden"
                    }
                  />
                  {renderMode === "clean" && renderReaderView()}
                </div>
              </SimpleBar>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 w-full max-w-full max-h-screen bg-zinc-100/60 flex flex-col justify-between overflow-x-hidden">
        <SimpleBar
          autoHide={false}
          className="max-h-[calc(100dvh-7.5rem)] w-full max-w-full"
        >
          <div
            ref={resizeDetectorRef}
            className="relative w-full max-w-full overflow-x-auto min-h-[360px] flex justify-center"
          >
            {/* Loading Indicator for Page View */}
            {isLoading && renderMode === "page" && (
              <div className="py-24 flex flex-col items-center justify-center gap-2">
                <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                <p className="text-sm text-zinc-500">
                  Rendering Word document pages...
                </p>
              </div>
            )}

            {/* Error fallback message */}
            {error && !isLoading && renderMode === "page" && (
              <div className="py-6 px-4 max-w-md mx-auto text-center flex flex-col items-center gap-3">
                <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
                  {error}
                </p>
              </div>
            )}

            {/* docx-preview high-fidelity page view */}
            <div
              ref={containerRef}
              className={cn(
                "w-full py-1 sm:py-2",
                renderMode === "page" ? "block" : "hidden",
                isLoading && "opacity-0 h-0 overflow-hidden pointer-events-none"
              )}
            />

            {/* Clean Reader View (Reflowable mobile & desktop typography) */}
            {renderMode === "clean" && renderReaderView()}
          </div>
        </SimpleBar>
      </div>
    </div>
  );
}
