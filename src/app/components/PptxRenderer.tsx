"use client";

import { useState, useEffect, useRef } from "react";
import SimpleBar from "simplebar-react";
import {
  Loader2,
  Search,
  ZoomIn,
  X,
  ChevronDown,
  ChevronUp,
  Expand,
  Presentation,
  ChevronRight,
  SlidersHorizontal,
  MonitorPlay,
  AlignLeft,
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
import { RichSlide } from "@/lib/document-parser";
import { useResizeDetector } from "react-resize-detector";
import { cn } from "@/lib/utils";

interface PptxRendererProps {
  fileId: string;
  url: string;
  fileName?: string;
}

function highlightMatch(text: string, query: string) {
  if (!query || !query.trim()) return text;
  const escaped = query.trim().replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escaped})`, "gi"));
  return parts.map((part, idx) =>
    part.toLowerCase() === query.trim().toLowerCase() ? (
      <mark
        key={idx}
        className="bg-amber-300 text-zinc-900 rounded-xs px-0.5 font-medium not-italic"
      >
        {part}
      </mark>
    ) : (
      part
    )
  );
}

export default function PptxRenderer({
  fileId,
  url,
  fileName,
}: PptxRendererProps) {
  const [currSlide, setCurrSlide] = useState<number>(1);
  const [slides, setSlides] = useState<RichSlide[]>([]);
  const totalSlides = slides.length || 1;
  const [scale, setScale] = useState<number>(1);
  const [presentationAspectRatio, setPresentationAspectRatio] = useState<number>(16 / 9);
  const [viewMode, setViewMode] = useState<"visual" | "outline">("visual");
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isFullscreenOpen, setIsFullscreenOpen] = useState<boolean>(false);
  const [windowWidth, setWindowWidth] = useState<number>(0);
  const [windowHeight, setWindowHeight] = useState<number>(0);

  // In-Document Keyword Search (Ctrl + F)
  const [isSearchOpen, setIsSearchOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [searchMatches, setSearchMatches] = useState<number[]>([]);
  const [currentMatchIdx, setCurrentMatchIdx] = useState<number>(0);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const { width: containerWidth, ref: containerRef } = useResizeDetector();
  const {
    width: fullscreenContainerWidth,
    height: fullscreenContainerHeight,
    ref: fullscreenContainerRef,
  } = useResizeDetector();

  // Listen for citation jump events from Quill AI Assistant chat
  useEffect(() => {
    const handleJump = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      if (detail && typeof detail.page === "number") {
        const targetSlide = Math.min(Math.max(1, detail.page), totalSlides);
        setCurrSlide(targetSlide);
      }
    };
    window.addEventListener("quill:jump-to-page", handleJump);
    return () => window.removeEventListener("quill:jump-to-page", handleJump);
  }, [totalSlides]);

  // Keyboard shortcut Ctrl+F / Cmd+F to open in-document search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") {
        if (e.key === "Escape" && isSearchOpen) {
          setIsSearchOpen(false);
          setSearchQuery("");
        }
        return;
      }
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

  // Search across slides whenever searchQuery changes
  useEffect(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) {
      setSearchMatches([]);
      setCurrentMatchIdx(0);
      return;
    }

    const matches: number[] = [];
    slides.forEach((s) => {
      const titleText = (s.title || "").toLowerCase();
      const contentText = (s.content || []).join(" ").toLowerCase();
      const rawText = (s.rawText || "").toLowerCase();
      const elemText = (s.elements || [])
        .map((el) => {
          if (el.rawText) return el.rawText;
          if (el.paragraphs) {
            return el.paragraphs
              .map((p) => p.runs.map((r) => r.text).join(""))
              .join(" ");
          }
          if (el.rows) {
            return el.rows.map((r) => r.map((c) => c.text).join(" ")).join(" ");
          }
          return "";
        })
        .join(" ")
        .toLowerCase();

      if (
        titleText.includes(q) ||
        contentText.includes(q) ||
        rawText.includes(q) ||
        elemText.includes(q)
      ) {
        matches.push(s.slideNumber);
      }
    });

    setSearchMatches(matches);
    if (matches.length > 0) {
      setCurrentMatchIdx(0);
      setCurrSlide(matches[0]);
    } else {
      setCurrentMatchIdx(0);
    }
  }, [searchQuery, slides]);

  const handleNextMatch = () => {
    if (searchMatches.length === 0) return;
    const nextIdx = (currentMatchIdx + 1) % searchMatches.length;
    setCurrentMatchIdx(nextIdx);
    setCurrSlide(searchMatches[nextIdx]);
  };

  const handlePrevMatch = () => {
    if (searchMatches.length === 0) return;
    const prevIdx =
      (currentMatchIdx - 1 + searchMatches.length) % searchMatches.length;
    setCurrentMatchIdx(prevIdx);
    setCurrSlide(searchMatches[prevIdx]);
  };

  useEffect(() => {
    const updateDims = () => {
      setWindowWidth(window.innerWidth);
      setWindowHeight(window.innerHeight);
    };
    updateDims();
    window.addEventListener("resize", updateDims);
    return () => window.removeEventListener("resize", updateDims);
  }, [isFullscreenOpen]);

  const effectiveFullscreenWidth =
    fullscreenContainerWidth ||
    (windowWidth ? Math.min(windowWidth - 20, 1340) : 1150);

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setError(null);

    fetch(`/api/document-content?fileId=${encodeURIComponent(fileId)}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load presentation slides");
        return res.json();
      })
      .then((data) => {
        if (!isMounted) return;
        if (
          data.parsed &&
          data.parsed.slides &&
          data.parsed.slides.length > 0
        ) {
          setSlides(data.parsed.slides);
          setCurrSlide(1);
          if (data.parsed.aspectRatio) {
            setPresentationAspectRatio(data.parsed.aspectRatio);
          }
        } else {
          setSlides([
            {
              slideNumber: 1,
              title: fileName || "Presentation Slide",
              content: ["Slide content loaded."],
              rawText: "",
              elements: [],
            },
          ]);
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        console.error("PptxRenderer error:", err);
        setError("Could not render presentation slides.");
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [fileId, url, fileName]);

  const activeSlide: RichSlide =
    slides[currSlide - 1] ||
    slides[0] || {
      slideNumber: 1,
      title: "Slide 1",
      content: [],
      rawText: "",
      elements: [],
    };

  const handlePrev = () => {
    setCurrSlide((prev) => (prev > 1 ? prev - 1 : 1));
  };

  const handleNext = () => {
    setCurrSlide((prev) => (prev < totalSlides ? prev + 1 : totalSlides));
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "PageUp") {
        handlePrev();
      } else if (e.key === "ArrowRight" || e.key === "PageDown") {
        handleNext();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [totalSlides]);

  // Virtual Canvas Dimensions
  const BASE_WIDTH = 960;
  const slideAspect = activeSlide.aspectRatio || presentationAspectRatio || 16 / 9;
  const BASE_HEIGHT = Math.round(BASE_WIDTH / slideAspect);

  // Responsive Visual Slide Canvas (Renders faithfully like PowerPoint and scales seamlessly on mobile & desktop, including when zoomed)
  const renderVisualSlide = (
    availableWidth?: number,
    isExpanded: boolean = false,
    availableHeight?: number
  ) => {
    const hasElements =
      activeSlide.elements && activeSlide.elements.length > 0;

    const clientWidth =
      typeof window !== "undefined"
        ? Math.max(window.innerWidth - (window.innerWidth < 640 ? 14 : 28), 280)
        : 360;
    const widthToUse = Math.min(
      availableWidth || containerWidth || clientWidth,
      clientWidth
    );
    // Minimal side padding on mobile so slide uses nearly full width
    const sideAllowance = widthToUse < 640 ? (isExpanded ? 12 : 6) : isExpanded ? 32 : 24;
    const maxWidthAllowed = Math.max(widthToUse - sideAllowance, 260);
    // Base fit scale: guarantees the slide fits into the mobile/desktop viewport at 100%
    const maxFit = isExpanded ? 1.6 : 1.25;
    const widthFitScale = maxWidthAllowed / BASE_WIDTH;

    let heightFitScale = maxFit;
    if (isExpanded) {
      const availH =
        availableHeight && availableHeight > 120
          ? availableHeight - 24
          : windowHeight > 300
          ? windowHeight * 0.92 - 150
          : 540;
      heightFitScale = Math.max(180, availH) / BASE_HEIGHT;
    } else if (widthToUse >= 640 && windowHeight > 450) {
      heightFitScale = Math.max(240, windowHeight - 210) / BASE_HEIGHT;
    }

    const fitScale = Math.min(widthFitScale, heightFitScale, maxFit);
    const effectiveScale = fitScale * scale;

    const scaledWidth = Math.round(BASE_WIDTH * effectiveScale);
    const scaledHeight = Math.round(BASE_HEIGHT * effectiveScale);

    return (
      <div
        className={cn(
          "w-full overflow-x-auto overflow-y-visible px-0.5 sm:px-2 select-text",
          isExpanded ? "my-auto py-0.5" : "py-1 sm:py-3"
        )}
        style={{ minHeight: `${scaledHeight + (isExpanded ? 2 : 12)}px` }}
      >
        <div
          style={{
            width: `${scaledWidth}px`,
            height: `${scaledHeight}px`,
            position: "relative",
            margin: "0 auto",
          }}
        >
          {/* Virtual Slide Canvas at 960px base resolution with scale transform */}
          <div
            style={{
              width: `${BASE_WIDTH}px`,
              height: `${BASE_HEIGHT}px`,
              transform: `scale(${effectiveScale})`,
              transformOrigin: "top left",
              backgroundColor: activeSlide.bgColor || "#ffffff",
              backgroundImage: activeSlide.bgImage
                ? `url(${activeSlide.bgImage})`
                : undefined,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
            className="absolute top-0 left-0 shadow-xl rounded-lg sm:rounded-xl border border-zinc-200 overflow-hidden"
          >
            {/* Render positioned elements */}
            {hasElements ? (
              activeSlide.elements.map((el) => {
                // A. Image Element
                if (el.type === "image" && el.src) {
                  return (
                    <div
                      key={el.id}
                      className="absolute"
                      style={{
                        left: el.left,
                        top: el.top,
                        width: el.width,
                        height: el.height,
                        zIndex: el.zIndex,
                      }}
                    >
                      <img
                        src={el.src}
                        alt={el.alt || "Presentation Graphic"}
                        className="w-full h-full object-contain pointer-events-none select-none"
                      />
                    </div>
                  );
                }

                // B. Table Element
                if (el.type === "table" && el.rows) {
                  return (
                    <div
                      key={el.id}
                      className="absolute overflow-visible"
                      style={{
                        left: el.left,
                        top: el.top,
                        width: el.width,
                        minHeight: el.height,
                        zIndex: el.zIndex,
                      }}
                    >
                      <table className="w-full h-full border-collapse border border-zinc-300 text-xs sm:text-sm bg-white/95">
                        <tbody>
                          {el.rows.map((row, rIdx) => (
                            <tr key={rIdx} className="border-b border-zinc-200">
                              {row.map((cell, cIdx) => (
                                <td
                                  key={cIdx}
                                  style={{
                                    backgroundColor: cell.bgColor || undefined,
                                    color: cell.color || undefined,
                                    textAlign: (cell.align as any) || "left",
                                  }}
                                  className={cn(
                                    "p-2 border border-zinc-200 text-zinc-800",
                                    cell.bold && "font-semibold"
                                  )}
                                >
                                  {highlightMatch(cell.text, searchQuery)}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                }

                // C. Shape / Text Box Element
                const hasBoxStyling = Boolean(el.bgColor || el.borderColor);
                return (
                  <div
                    key={el.id}
                    className="absolute flex flex-col"
                    style={{
                      left: el.left,
                      top: el.top,
                      width: el.width,
                      minHeight: el.height,
                      height: hasBoxStyling ? "auto" : el.height,
                      overflow: "visible",
                      justifyContent:
                        el.verticalAlign === "center"
                          ? "center"
                          : el.verticalAlign === "bottom"
                            ? "flex-end"
                            : "flex-start",
                      backgroundColor: el.bgColor || "transparent",
                      borderColor: el.borderColor || "transparent",
                      borderWidth: el.borderWidth
                        ? `${el.borderWidth}px`
                        : undefined,
                      borderStyle: el.borderColor ? "solid" : undefined,
                      borderRadius: el.borderRadius
                        ? `${el.borderRadius}px`
                        : undefined,
                      padding: hasBoxStyling ? "4px 10px" : "2px 4px",
                      boxSizing: "border-box",
                      zIndex: el.zIndex,
                    }}
                  >
                    {el.paragraphs && el.paragraphs.length > 0 ? (
                      el.paragraphs.map((para, pIdx) => {
                        const firstRunSize = para.runs[0]?.size || 20;
                        return (
                          <div
                            key={pIdx}
                            style={{ textAlign: para.align || "left" }}
                            className="flex items-start gap-2 my-[2px]"
                          >
                            {para.bullet && (
                              <span
                                style={{
                                  fontSize: `${Math.max(12, Math.round(firstRunSize * 0.85))}px`,
                                  lineHeight: 1.18,
                                }}
                                className="text-zinc-800 font-bold shrink-0 select-none"
                              >
                                ❑
                              </span>
                            )}
                            <p
                              style={{
                                textAlign: para.align || "left",
                                width: "100%",
                                lineHeight: 1.18,
                                whiteSpace: "pre-wrap",
                                wordBreak: "break-word",
                              }}
                            >
                              {para.runs.map((run, rIdx) => {
                                if (run.text === "\n") {
                                  return <br key={rIdx} />;
                                }
                                return (
                                  <span
                                    key={rIdx}
                                    style={{
                                      fontWeight: run.bold ? "700" : "400",
                                      fontStyle: run.italic
                                        ? "italic"
                                        : "normal",
                                      textDecoration: run.underline
                                        ? "underline"
                                        : "none",
                                      color: run.color || "#000000",
                                      fontSize: run.size
                                        ? `${run.size}px`
                                        : "18px",
                                      fontFamily: run.fontFamily
                                        ? `"${run.fontFamily}", serif`
                                        : undefined,
                                      lineHeight: 1.18,
                                    }}
                                  >
                                    {highlightMatch(run.text, searchQuery)}
                                  </span>
                                );
                              })}
                            </p>
                          </div>
                        );
                      })
                    ) : (
                      <p className="text-sm text-zinc-800">
                        {highlightMatch(el.rawText || "", searchQuery)}
                      </p>
                    )}
                  </div>
                );
              })
            ) : (
              // Fallback if slide has text outline only
              <div className="h-full p-8 sm:p-14 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between border-b border-zinc-100 pb-4 mb-6">
                    <span className="text-xs font-semibold uppercase tracking-wider text-orange-600">
                      Slide {currSlide} of {totalSlides}
                    </span>
                    <span className="text-xs text-zinc-400">
                      {fileName || "Presentation"}
                    </span>
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900 mb-6">
                    {highlightMatch(
                      activeSlide.title || `Slide ${currSlide}`,
                      searchQuery
                    )}
                  </h2>
                  <div className="space-y-3">
                    {activeSlide.content.map((item, idx) => (
                      <div key={idx} className="flex items-start gap-3">
                        <ChevronRight className="h-5 w-5 text-orange-500 shrink-0 mt-0.5" />
                        <p className="text-base sm:text-lg text-zinc-800">
                          {highlightMatch(item, searchQuery)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Outline / Study View
  const renderOutlineView = () => (
    <div
      style={{ zoom: scale }}
      className="w-full max-w-4xl mx-auto my-6 bg-white border border-zinc-200 shadow-md rounded-xl p-6 sm:p-12"
    >
      <div className="flex items-center justify-between pb-4 border-b border-zinc-200 mb-6">
        <h2 className="text-2xl font-bold text-zinc-900">
          Slide {currSlide}:{" "}
          {highlightMatch(activeSlide.title || "", searchQuery)}
        </h2>
        <span className="px-2.5 py-1 rounded bg-orange-50 text-orange-700 text-xs font-medium border border-orange-200">
          Slide {currSlide} of {totalSlides}
        </span>
      </div>

      <div className="space-y-4">
        {activeSlide.content && activeSlide.content.length > 0 ? (
          activeSlide.content.map((paragraph, idx) => (
            <div key={idx} className="flex items-start gap-3">
              <ChevronRight className="h-5 w-5 text-orange-500 shrink-0 mt-0.5" />
              <p className="text-base text-zinc-800 leading-relaxed">
                {highlightMatch(paragraph, searchQuery)}
              </p>
            </div>
          ))
        ) : (
          <p className="text-zinc-500 italic">No text content on this slide.</p>
        )}
      </div>
    </div>
  );

  return (
    <div className="w-full max-w-full bg-white rounded-md shadow flex flex-col items-center overflow-x-hidden">
      {/* Top Toolbar matching Quill app design */}
      <div className="min-h-[3.25rem] h-auto py-1 sm:h-14 sm:py-0 w-full border-b border-zinc-200 flex items-center justify-between px-1.5 sm:px-2 gap-1 overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-1 sm:gap-1.5 min-w-0 shrink-0">
          <Button
            disabled={currSlide <= 1}
            onClick={handlePrev}
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 shrink-0"
            aria-label="previous slide"
          >
            <ChevronDown className="h-4 w-4" />
          </Button>

          <div className="flex items-center gap-1 shrink-0">
            <Input
              value={currSlide}
              onChange={(e) => {
                const val = Number(e.target.value);
                if (val >= 1 && val <= totalSlides) {
                  setCurrSlide(val);
                }
              }}
              className="w-9 sm:w-12 h-7 sm:h-8 text-center px-0.5 text-xs sm:text-sm"
            />
            <p className="text-zinc-700 text-xs sm:text-sm space-x-0.5">
              <span>/</span>
              <span>{totalSlides}</span>
            </p>
          </div>

          <Button
            disabled={currSlide >= totalSlides}
            onClick={handleNext}
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 shrink-0"
            aria-label="next slide"
          >
            <ChevronUp className="h-4 w-4" />
          </Button>

          <div className="ml-1 hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded bg-orange-50 text-orange-700 text-xs font-medium border border-orange-200 shrink-0">
            <Presentation className="h-3.5 w-3.5 text-orange-600" />
            <span>PowerPoint</span>
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center bg-zinc-100 p-0.5 rounded-md text-xs border border-zinc-200 ml-0.5 sm:ml-2 shrink-0">
            <button
              type="button"
              onClick={() => setViewMode("visual")}
              className={`px-1.5 sm:px-2 py-1 rounded flex items-center gap-1 transition-all ${
                viewMode === "visual"
                  ? "bg-white text-zinc-900 font-semibold shadow-sm"
                  : "text-zinc-600 hover:text-zinc-900"
              }`}
            >
              <MonitorPlay className="h-3 w-3 shrink-0" />
              <span className="hidden sm:inline">Slide View</span>
              <span className="sm:hidden">Slides</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("outline")}
              className={`px-1.5 sm:px-2 py-1 rounded flex items-center gap-1 transition-all ${
                viewMode === "outline"
                  ? "bg-white text-zinc-900 font-semibold shadow-sm"
                  : "text-zinc-600 hover:text-zinc-900"
              }`}
            >
              <AlignLeft className="h-3 w-3 shrink-0" />
              <span>Outline</span>
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
                placeholder="Find in slides..."
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
              title="Find text in slides (Ctrl+F)"
              aria-label="Find in slides"
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
                title="Expand presentation view"
              >
                <Expand className="h-4 w-4" />
              </Button>
            </DialogTrigger>
            <DialogContent className="w-[98vw] max-w-[98vw] sm:max-w-[95vw] xl:max-w-7xl h-[92dvh] sm:h-[92vh] p-2 sm:p-5 flex flex-col overflow-hidden gap-0">
              <div className="shrink-0 flex items-center justify-between pb-2.5 border-b border-zinc-200 pr-8 gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded bg-orange-50 text-orange-700 text-xs font-medium border border-orange-200 shrink-0">
                    <Presentation className="h-3.5 w-3.5 text-orange-600" />
                    <span>PowerPoint</span>
                  </div>
                  <span className="font-semibold text-xs sm:text-sm text-zinc-900 truncate max-w-[120px] sm:max-w-md">
                    {fileName || "PowerPoint Presentation"}
                  </span>
                </div>
                <div className="flex items-center gap-1 sm:gap-2 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 sm:h-8 px-2 text-xs"
                    disabled={currSlide <= 1}
                    onClick={handlePrev}
                  >
                    Prev
                  </Button>
                  <div className="flex items-center gap-1">
                    <Input
                      value={currSlide}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        if (val >= 1 && val <= totalSlides) {
                          setCurrSlide(val);
                        }
                      }}
                      className="w-9 sm:w-11 h-7 sm:h-8 text-center px-1 text-xs"
                    />
                    <span className="text-xs text-zinc-600 font-medium whitespace-nowrap">
                      / {totalSlides}
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 sm:h-8 px-2 text-xs"
                    disabled={currSlide >= totalSlides}
                    onClick={handleNext}
                  >
                    Next
                  </Button>

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
              <div
                ref={fullscreenContainerRef}
                className="flex-1 min-h-0 w-full mt-2 bg-zinc-100/80 rounded-lg overflow-auto p-1.5 sm:p-3 flex flex-col"
              >
                {viewMode === "visual"
                  ? renderVisualSlide(
                      effectiveFullscreenWidth,
                      true,
                      fullscreenContainerHeight
                    )
                  : renderOutlineView()}
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 w-full max-w-full max-h-screen bg-zinc-100/60 flex flex-col justify-between overflow-x-hidden">
        <SimpleBar autoHide={false} className="max-h-[calc(100dvh-7.5rem)] w-full max-w-full">
          <div ref={containerRef} className="w-full max-w-full overflow-x-auto flex justify-center">
            {isLoading ? (
              <div className="flex justify-center items-center py-24 flex-col gap-2">
                <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
                <p className="text-sm text-zinc-500">
                  Rendering presentation slides...
                </p>
              </div>
            ) : error ? (
              <div className="flex justify-center items-center py-24 text-center">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            ) : (
              <div className="w-full min-h-[240px]">
                {viewMode === "visual"
                  ? renderVisualSlide(containerWidth)
                  : renderOutlineView()}
              </div>
            )}
          </div>
        </SimpleBar>
      </div>
    </div>
  );
}
