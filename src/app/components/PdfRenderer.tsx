"use client";

import {
  ChevronDown,
  ChevronUp,
  Eye,
  FileCode,
  Loader2,
  RotateCw,
  Search,
  ZoomIn,
  X,
  SlidersHorizontal,
} from "lucide-react";
import { Document, Page, pdfjs } from "react-pdf";

import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

import { useResizeDetector } from "react-resize-detector";

import { useEffect, useState, useRef } from "react";

import { useForm } from "react-hook-form";
import { z } from "zod";

import { zodResolver } from "@hookform/resolvers/zod";
import { cn } from "@/lib/utils";

import SimpleBar from "simplebar-react";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import PdfFullscreen from "./PdfFullScreen";

pdfjs.GlobalWorkerOptions.workerSrc = `/pdf.worker.min.js`;

interface PdfRendererProps {
  url: string;
  fileId?: string;
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

const PdfRenderer = ({ url, fileId }: PdfRendererProps) => {
  const { toast } = useToast();

  const [numPages, setNumPages] = useState<number>();
  const [currPage, setCurrPage] = useState<number>(1);
  const [scale, setScale] = useState<number>(1);
  const [rotation, setRotation] = useState<number>(0);
  const [renderedScale, setRenderedScale] = useState<number | null>(null);
  const [renderMode, setRenderMode] = useState<"page" | "reader">("page");
  const [readerParagraphs, setReaderParagraphs] = useState<string[]>([]);
  const [isReaderLoading, setIsReaderLoading] = useState<boolean>(false);

  const CustomPageValidator = z.object({
    page: z
      .string()
      .refine((num) => Number(num) > 0 && Number(num) <= (numPages || 1)),
  });

  type TCustomPageValidator = z.infer<typeof CustomPageValidator>;

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
  } = useForm<TCustomPageValidator>({
    defaultValues: {
      page: "1",
    },
    resolver: zodResolver(CustomPageValidator),
  });

  // In-Document Keyword Search (Ctrl + F)
  const [isSearchOpen, setIsSearchOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [searchMatches, setSearchMatches] = useState<number[]>([]);
  const [currentMatchIdx, setCurrentMatchIdx] = useState<number>(0);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const isLoading = renderedScale !== scale;

  // Listen for citation jump events from Quill AI Assistant chat
  useEffect(() => {
    const handleJump = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      if (detail && typeof detail.page === "number" && numPages) {
        const targetPage = Math.min(Math.max(1, detail.page), numPages);
        setCurrPage(targetPage);
        setValue("page", String(targetPage));
      }
    };
    window.addEventListener("quill:jump-to-page", handleJump);
    return () => window.removeEventListener("quill:jump-to-page", handleJump);
  }, [numPages]);

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

  // Search across paragraphs and pages
  useEffect(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) {
      setSearchMatches([]);
      setCurrentMatchIdx(0);
      return;
    }

    const matches: number[] = [];
    readerParagraphs.forEach((para, idx) => {
      if (para.toLowerCase().includes(q)) {
        const approxPage = numPages
          ? Math.min(
            numPages,
            Math.max(
              1,
              Math.round(((idx + 1) / readerParagraphs.length) * numPages)
            )
          )
          : 1;
        matches.push(approxPage);
      }
    });

    setSearchMatches(matches);
    if (matches.length > 0) {
      setCurrentMatchIdx(0);
      setCurrPage(matches[0]);
      setValue("page", String(matches[0]));
    } else {
      setCurrentMatchIdx(0);
    }
  }, [searchQuery, readerParagraphs, numPages]);

  const handleNextMatch = () => {
    if (searchMatches.length === 0) return;
    const nextIdx = (currentMatchIdx + 1) % searchMatches.length;
    setCurrentMatchIdx(nextIdx);
    setCurrPage(searchMatches[nextIdx]);
    setValue("page", String(searchMatches[nextIdx]));
  };

  const handlePrevMatch = () => {
    if (searchMatches.length === 0) return;
    const prevIdx =
      (currentMatchIdx - 1 + searchMatches.length) % searchMatches.length;
    setCurrentMatchIdx(prevIdx);
    setCurrPage(searchMatches[prevIdx]);
    setValue("page", String(searchMatches[prevIdx]));
  };

  useEffect(() => {
    if (!fileId) return;
    let isMounted = true;
    setIsReaderLoading(true);
    fetch(`/api/document-content?fileId=${encodeURIComponent(fileId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!isMounted || !data?.parsed?.text) return;
        const paras = data.parsed.text
          .split(/\n{2,}/)
          .map((p: string) => p.trim())
          .filter(Boolean);
        setReaderParagraphs(paras);
      })
      .catch(() => { })
      .finally(() => {
        if (isMounted) setIsReaderLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, [fileId]);

  const { width, ref } = useResizeDetector();
  const [windowWidth, setWindowWidth] = useState<number>(0);

  useEffect(() => {
    const updateWidth = () => setWindowWidth(window.innerWidth);
    updateWidth();
    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, []);

  const clientWidth =
    typeof window !== "undefined"
      ? Math.max(window.innerWidth - (window.innerWidth < 640 ? 14 : 28), 280)
      : 360;
  const effectiveWidth = Math.min(width || clientWidth, clientWidth);

  useEffect(() => {
    setCurrPage(1);
    setValue("page", "1");
    setRenderedScale(null);
  }, [url, setValue]);

  const customTextRenderer = (textItem: { str: string }) => {
    const q = searchQuery.trim();
    if (!q) return textItem.str;
    const escaped = q.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
    return textItem.str.replace(
      new RegExp(`(${escaped})`, "gi"),
      (match: string) => `<mark class="pdf-search-highlight">${match}</mark>`
    );
  };

  const handlePageSubmit = ({ page }: TCustomPageValidator) => {
    setCurrPage(Number(page));
    setValue("page", String(page));
  };

  return (
    <div className="w-full max-w-full bg-white rounded-none sm:rounded-md shadow flex flex-col items-center overflow-x-hidden">
      <div className="min-h-[2.75rem] h-auto py-0.5 sm:h-14 sm:py-0 w-full border-b border-zinc-200 flex items-center justify-between px-1.5 sm:px-2 gap-1 overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          <Button
            disabled={currPage <= 1}
            onClick={() => {
              setCurrPage((prev) => (prev - 1 > 1 ? prev - 1 : 1));
              setValue("page", String(currPage - 1));
            }}
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            aria-label="previous page"
          >
            <ChevronDown className="h-4 w-4" />
          </Button>

          <div className="flex items-center gap-1 sm:gap-1.5">
            <Input
              {...register("page")}
              className={cn(
                "w-9 sm:w-12 h-7 sm:h-8 text-center px-0.5 text-xs sm:text-sm",
                errors.page && "focus-visible:ring-red-500"
              )}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleSubmit(handlePageSubmit)();
                }
              }}
            />
            <p className="text-zinc-700 text-xs sm:text-sm space-x-0.5 sm:space-x-1">
              <span>/</span>
              <span>{numPages ?? "x"}</span>
            </p>
          </div>

          <Button
            disabled={numPages === undefined || currPage === numPages}
            onClick={() => {
              setCurrPage((prev) =>
                prev + 1 > numPages! ? numPages! : prev + 1
              );
              setValue("page", String(currPage + 1));
            }}
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            aria-label="next page"
          >
            <ChevronUp className="h-4 w-4" />
          </Button>

          {/* View Mode Toggle: Pages vs Reader View on mobile & desktop */}
          {fileId && (
            <div className="flex items-center bg-zinc-100 p-0.5 rounded-md text-xs border border-zinc-200 ml-0.5 sm:ml-2 shrink-0">
              <button
                type="button"
                onClick={() => setRenderMode("page")}
                className={cn(
                  "px-1.5 sm:px-2 py-0.5 sm:py-1 rounded flex items-center gap-1 transition-all text-xs",
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
                onClick={() => setRenderMode("reader")}
                className={cn(
                  "px-1.5 sm:px-2 py-0.5 sm:py-1 rounded flex items-center gap-1 transition-all text-xs",
                  renderMode === "reader"
                    ? "bg-white text-zinc-900 font-semibold shadow-sm"
                    : "text-zinc-600 hover:text-zinc-900"
                )}
              >
                <FileCode className="h-3 w-3 shrink-0" />
                <span>Reader</span>
              </button>
            </div>
          )}
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
                title="Previous match"
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 text-zinc-600"
                disabled={searchMatches.length <= 1}
                onClick={handleNextMatch}
                title="Next match"
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
                title="Close find"
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

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="gap-0.5 sm:gap-1 px-1.5 sm:px-2.5 h-7 sm:h-8 text-xs sm:text-sm" aria-label="zoom" variant="ghost">
                <ZoomIn className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                {scale * 100}%
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
              <DropdownMenuItem onSelect={() => setScale(2.5)}>
                250%
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            onClick={() => {
              setRotation((prev) => (prev >= 270 ? 0 : prev + 90));
            }}
            variant="ghost"
            className="hidden sm:inline-flex px-1.5 sm:px-2.5 h-8"
            aria-label="rotate 90 degrees"
          >
            <RotateCw className="h-4 w-4" />
          </Button>

          <PdfFullscreen fileUrl={url} />
        </div>
      </div>

      <div className="flex-1 w-full max-w-full max-h-screen bg-zinc-100/60 flex flex-col justify-between overflow-x-hidden">
        <SimpleBar autoHide={false} className="max-h-[calc(100dvh-7.5rem)] w-full max-w-full">
          <div ref={ref} className="w-full max-w-full overflow-x-auto flex justify-center">
            {renderMode === "reader" ? (
              <div className="w-full max-w-4xl mx-auto my-1 sm:my-4 bg-white border border-zinc-200 shadow-sm rounded-lg p-3.5 sm:p-10 md:p-14 select-text">
                {isReaderLoading ? (
                  <div className="py-12 sm:py-16 flex flex-col items-center justify-center gap-2">
                    <Loader2 className="h-7 w-7 animate-spin text-blue-600" />
                    <p className="text-sm text-zinc-500">
                      Preparing Reader View...
                    </p>
                  </div>
                ) : readerParagraphs.length > 0 ? (
                  <div
                    style={{ fontSize: `${Math.round(scale * 100)}%` }}
                    className="space-y-4 text-zinc-800 leading-relaxed break-words"
                  >
                    {readerParagraphs.map((para, idx) => (
                      <p key={idx} className="whitespace-pre-line">
                        {highlightMatch(para, searchQuery)}
                      </p>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-zinc-500 italic">
                    No extractable text found for Reader View. Switch to Pages view to inspect the PDF canvas.
                  </p>
                )}
              </div>
            ) : (
              <Document
                loading={
                  <div className="flex justify-center">
                    <Loader2 className="my-12 sm:my-24 h-6 w-6 animate-spin text-blue-600" />
                  </div>
                }
                onLoadError={() => {
                  toast({
                    title: "Error loading PDF",
                    description: "Please try again later",
                    variant: "destructive",
                  });
                }}
                onLoadSuccess={({ numPages }) => setNumPages(numPages)}
                file={url}
                className="max-h-full"
              >
                {isLoading && renderedScale ? (
                  <Page
                    width={effectiveWidth}
                    pageNumber={currPage}
                    scale={scale}
                    rotate={rotation}
                    key={"@" + renderedScale}
                    customTextRenderer={
                      searchQuery.trim() ? customTextRenderer : undefined
                    }
                  />
                ) : null}

                <Page
                  className={cn(
                    isLoading && renderedScale !== null ? "hidden" : ""
                  )}
                  width={effectiveWidth}
                  pageNumber={currPage}
                  scale={scale}
                  rotate={rotation}
                  key={"@" + scale}
                  customTextRenderer={
                    searchQuery.trim() ? customTextRenderer : undefined
                  }
                  loading={
                    <div className="flex justify-center">
                      <Loader2 className="my-12 sm:my-24 h-6 w-6 animate-spin text-blue-600" />
                    </div>
                  }
                  onRenderSuccess={() => setRenderedScale(scale)}
                />
              </Document>
            )}
          </div>
        </SimpleBar>
      </div>
    </div>
  );
};

export default PdfRenderer;
