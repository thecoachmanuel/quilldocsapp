"use client";

import { useState, useEffect, useMemo } from "react";
import DocumentRenderer from "./DocumentRenderer";
import ChatWrapper from "./chat/ChatWrapper";
import { dispatchPageJump } from "@/lib/page-jump";
import {
  MessageSquare,
  Maximize2,
  Minimize2,
  ChevronDown,
  FileText,
  File,
  Presentation,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  X,
  Layers,
  Check,
  Search,
  ExternalLink,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useMobileViewport } from "@/lib/use-mobile-viewport";
import { useHorizontalWheelScroll } from "@/lib/use-horizontal-wheel-scroll";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useRouter } from "next/navigation";

export interface DocumentInfo {
  id: string;
  name: string;
  url: string;
  uploadStatus?: string;
}

interface MultiDocumentViewLayoutProps {
  initialFiles: DocumentInfo[];
  allUserFiles: DocumentInfo[];
  initialFocusId?: string;
  initialPage?: number;
  planName?: string;
  pagesPerPdf?: number;
}

export default function MultiDocumentViewLayout({
  initialFiles,
  allUserFiles,
  initialFocusId,
  initialPage,
  planName = "Free",
  pagesPerPdf = 5,
}: MultiDocumentViewLayoutProps) {
  const router = useRouter();

  // Active participating files
  const [selectedFiles, setSelectedFiles] =
    useState<DocumentInfo[]>(initialFiles);

  // The document currently visible in the left preview pane
  const [activeFileId, setActiveFileId] = useState<string>(
    (initialFocusId && initialFiles.some((f) => f.id === initialFocusId)
      ? initialFocusId
      : initialFiles[0]?.id) || ""
  );

  // Manage Documents Modal State
  const [isManageModalOpen, setIsManageModalOpen] = useState<boolean>(false);
  const [modalSearchQuery, setModalSearchQuery] = useState<string>("");
  const [tempSelectedIds, setTempSelectedIds] = useState<string[]>(
    initialFiles.map((f) => f.id)
  );

  // Responsive / View state
  const [isMobileChatOpen, setIsMobileChatOpen] = useState<boolean>(false);
  const [isChatExpanded, setIsChatExpanded] = useState<boolean>(false);
  const [isDesktopChatHidden, setIsDesktopChatHidden] =
    useState<boolean>(false);

  const { isMobile, isKeyboardVisible, viewportHeight, offsetTop } =
    useMobileViewport();
  const tabsToolbarRef = useHorizontalWheelScroll<HTMLDivElement>();
  const chatHeaderRef = useHorizontalWheelScroll<HTMLDivElement>();

  // On mobile when typing with virtual keypad, pin chat directly to visual viewport
  const mobileKeyboardStyle: React.CSSProperties | undefined =
    isMobile && isMobileChatOpen && isKeyboardVisible
      ? {
        position: "fixed",
        top: `${offsetTop}px`,
        left: 0,
        right: 0,
        height: `${viewportHeight}px`,
        bottom: "auto",
        zIndex: 80,
      }
      : undefined;

  // Keep local state synchronized if URL query parameters navigate between file sets
  const initialIdsKey = initialFiles.map((f) => f.id).join(",");
  useEffect(() => {
    setSelectedFiles(initialFiles);
    setTempSelectedIds(initialFiles.map((f) => f.id));
    if (initialFocusId && initialFiles.some((f) => f.id === initialFocusId)) {
      setActiveFileId(initialFocusId);
    } else if (!initialFiles.some((f) => f.id === activeFileId)) {
      setActiveFileId(initialFiles[0]?.id || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialIdsKey, initialFocusId]);

  // Apply initial citation jump if navigated with ?focus=...&page=...
  useEffect(() => {
    if (initialPage && initialPage > 0) {
      const targetId = initialFocusId || activeFileId;
      dispatchPageJump({ fileId: targetId, page: initialPage, type: "page" });
      const raf = requestAnimationFrame(() =>
        dispatchPageJump({ fileId: targetId, page: initialPage, type: "page" })
      );
      return () => cancelAnimationFrame(raf);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFocusId, initialPage]);

  // Sort selected IDs deterministically for stable session key & message history
  const multiSessionId = useMemo(() => {
    const sorted = [...selectedFiles.map((f) => f.id)].sort();
    return `multi_${sorted.join("_")}`;
  }, [selectedFiles]);

  const activeFile = useMemo(() => {
    return (
      selectedFiles.find((f) => f.id === activeFileId) || selectedFiles[0]
    );
  }, [selectedFiles, activeFileId]);

  // Handle jump-to-doc and jump-to-page citations from AI messages
  useEffect(() => {
    const revealViewer = () => {
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      setIsChatExpanded(false);
      setIsMobileChatOpen(false);
      setIsDesktopChatHidden(false);
    };

    const handleJumpToPage = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      if (detail?.type === "slide" && typeof detail?.page === "number") {
        const activeIsPptx =
          activeFile && /\.(pptx?|PPTX?)$/i.test(activeFile.name || "");
        if (!activeIsPptx) {
          const pptxTarget = selectedFiles.find((f) =>
            /\.(pptx?|PPTX?)$/i.test(f.name || "")
          );
          if (pptxTarget && pptxTarget.id !== activeFile?.id) {
            setActiveFileId(pptxTarget.id);
            dispatchPageJump({
              fileId: pptxTarget.id,
              page: detail.page,
              type: "slide",
            });
          }
        }
      }
      revealViewer();
    };

    const handleJumpToDoc = (e: any) => {
      const { docId, docName, page, type } = e.detail || {};
      if (!docId && !docName) return;

      const lowerDoc = (docName || "").toLowerCase();
      const findMatch = (list: DocumentInfo[]) =>
        (docId ? list.find((f) => f.id === docId) : undefined) ||
        (lowerDoc
          ? list.find((f) => f.name.toLowerCase() === lowerDoc) ||
          list.find(
            (f) =>
              f.name.toLowerCase().includes(lowerDoc) ||
              lowerDoc.includes(f.name.toLowerCase())
          )
          : undefined);

      let target = findMatch(selectedFiles);
      if (!target) {
        const fromLibrary = findMatch(allUserFiles);
        if (fromLibrary) {
          target = fromLibrary;
          setSelectedFiles((prev) =>
            prev.some((f) => f.id === fromLibrary.id)
              ? prev
              : [...prev, fromLibrary]
          );
        }
      }

      if (target) {
        const targetId = target.id;
        setActiveFileId(targetId);
        revealViewer();

        if (page && page > 0) {
          dispatchPageJump({
            fileId: targetId,
            page,
            type: type || "page",
          });
          // Also replay on next animation frame after React switches active DocumentRenderer
          requestAnimationFrame(() =>
            dispatchPageJump({
              fileId: targetId,
              page,
              type: type || "page",
            })
          );
        }
      }
    };

    window.addEventListener("quill:jump-to-page", handleJumpToPage);
    window.addEventListener("quill:jump-to-doc", handleJumpToDoc);
    return () => {
      window.removeEventListener("quill:jump-to-page", handleJumpToPage);
      window.removeEventListener("quill:jump-to-doc", handleJumpToDoc);
    };
  }, [selectedFiles, allUserFiles, activeFile]);

  const openManageModal = () => {
    setTempSelectedIds(selectedFiles.map((f) => f.id));
    setModalSearchQuery("");
    setIsManageModalOpen(true);
  };

  const handleApplyManageFiles = () => {
    if (tempSelectedIds.length === 0) return;
    const nextFiles = allUserFiles.filter((f) =>
      tempSelectedIds.includes(f.id)
    );
    setSelectedFiles(nextFiles);

    // If active file was removed, switch to first remaining
    if (!tempSelectedIds.includes(activeFileId)) {
      setActiveFileId(nextFiles[0]?.id || "");
    }

    setIsManageModalOpen(false);

    // Update URL query parameter
    router.replace(`/dashboard/multi?files=${tempSelectedIds.join(",")}`);
  };

  const handleRemoveFile = (idToRemove: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (selectedFiles.length <= 1) return; // Keep at least 1 file
    const nextFiles = selectedFiles.filter((f) => f.id !== idToRemove);
    setSelectedFiles(nextFiles);
    if (activeFileId === idToRemove) {
      setActiveFileId(nextFiles[0]?.id || "");
    }
    router.replace(
      `/dashboard/multi?files=${nextFiles.map((f) => f.id).join(",")}`
    );
  };

  const getFileIcon = (fileName: string) => {
    if (/\.(docx|doc)$/i.test(fileName)) {
      return <FileText className="h-3.5 w-3.5 text-blue-600 shrink-0" />;
    }
    if (/\.(pptx|ppt)$/i.test(fileName)) {
      return (
        <Presentation className="h-3.5 w-3.5 text-orange-600 shrink-0" />
      );
    }
    return <File className="h-3.5 w-3.5 text-cyan-600 shrink-0" />;
  };

  const filteredModalFiles = useMemo(() => {
    const q = modalSearchQuery.toLowerCase().trim();
    if (!q) return allUserFiles;
    return allUserFiles.filter((f) => f.name.toLowerCase().includes(q));
  }, [allUserFiles, modalSearchQuery]);

  return (
    <div className="relative flex flex-col justify-start w-full max-w-full overflow-x-clip lg:flex-1 lg:h-[calc(100dvh-3.5rem)] lg:overflow-hidden">
      {/* Top Document Tab Navigation Bar */}
      <div className="bg-white/95 backdrop-blur border-b border-zinc-200 shrink-0 z-30 px-3 sm:px-6 py-1.5 w-full max-w-full overflow-x-clip">
        <div className="flex items-center justify-between gap-2 min-w-0">
          {/* Document Tabs */}
          <div
            ref={tabsToolbarRef}
            className="flex items-center gap-1.5 overflow-x-auto no-scrollbar overscroll-x-contain py-0.5 min-w-0 flex-1 max-w-full"
          >
            <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-zinc-400 mr-1 shrink-0">
              <Layers className="h-3 w-3 text-blue-600" />
              Sources ({selectedFiles.length}):
            </span>

            {selectedFiles.map((file, idx) => {
              const isActive = file.id === activeFile?.id;
              return (
                <div
                  key={file.id}
                  onClick={() => setActiveFileId(file.id)}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer transition-all shrink-0 border select-none",
                    isActive
                      ? "bg-white text-zinc-900 border-zinc-300 shadow-sm font-semibold ring-1 ring-blue-500/30"
                      : "bg-zinc-100/80 text-zinc-600 border-zinc-200/80 hover:bg-zinc-200/60"
                  )}
                >
                  {selectedFiles.length > 1 && (
                    <span
                      className={cn(
                        "inline-flex h-4 min-w-[16px] items-center justify-center rounded px-1 text-[10px] font-bold leading-none shrink-0",
                        isActive
                          ? "bg-blue-600 text-white"
                          : "bg-zinc-200/90 text-zinc-700"
                      )}
                    >
                      {idx + 1}
                    </span>
                  )}
                  {getFileIcon(file.name)}
                  <span className="truncate max-w-[130px] sm:max-w-[190px]">
                    {file.name}
                  </span>

                  {selectedFiles.length > 1 && (
                    <button
                      type="button"
                      onClick={(e) => handleRemoveFile(file.id, e)}
                      className="ml-1 p-0.5 rounded text-zinc-400 hover:text-zinc-700 hover:bg-zinc-200/80"
                      title="Remove from chat"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              );
            })}

            {/* Add / Edit Sources Button */}
            <button
              type="button"
              onClick={openManageModal}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100/80 border border-blue-200 transition-colors shrink-0"
              title="Add or remove documents from this session"
            >
              <Plus className="h-3 w-3" />
              <span>Add Document</span>
            </button>
          </div>

          {/* Mobile AI Chat Toggle */}
          <div className="flex items-center gap-1.5 shrink-0 lg:hidden">
            <button
              type="button"
              onClick={() => setIsMobileChatOpen((prev) => !prev)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all",
                isMobileChatOpen
                  ? "bg-zinc-900 text-white"
                  : "bg-blue-600 text-white shadow-sm hover:bg-blue-700"
              )}
            >
              <MessageSquare className="h-3 w-3" />
              <span>{isMobileChatOpen ? "Hide Chat" : "Multi-Doc Chat"}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Workspace Layout */}
      <div className="mx-auto w-full max-w-full lg:max-w-8xl lg:flex-1 lg:min-h-0 overflow-x-clip lg:flex lg:overflow-hidden xl:px-2">
        {/* Left Side: Document Renderer */}
        <div
          className={cn(
            "flex-1 xl:flex min-w-0 w-full max-w-full overflow-x-clip lg:h-full lg:overflow-y-auto transition-all duration-200",
            isChatExpanded && !isDesktopChatHidden && "lg:hidden"
          )}
        >
          <div className="p-0 sm:px-3 sm:py-1.5 lg:pl-6 lg:pr-4 lg:py-2 xl:flex-1 xl:pl-6 min-w-0 w-full max-w-full overflow-x-clip">
            {activeFile ? (
              <DocumentRenderer
                key={activeFile.id}
                fileId={activeFile.id}
                url={activeFile.url}
                fileName={activeFile.name}
              />
            ) : (
              <div className="p-8 text-center text-sm text-zinc-500">
                No document selected.
              </div>
            )}
          </div>
        </div>

        {/* Mobile Backdrop behind chat modal; tapping outside collapses the modal */}
        {isMobileChatOpen && (
          <div
            className="fixed inset-0 z-[65] bg-black/45 lg:hidden transition-opacity pointer-events-auto"
            onClick={() => {
              if (document.activeElement instanceof HTMLElement) {
                document.activeElement.blur();
              }
              setIsChatExpanded(false);
              setIsMobileChatOpen(false);
            }}
          />
        )}

        {/* Right Side: Chat Pane */}
        <div
          style={mobileKeyboardStyle}
          className={cn(
            "bg-zinc-50 flex flex-col",
            isDesktopChatHidden
              ? "lg:hidden"
              : isChatExpanded
                ? "lg:flex lg:w-full lg:flex-1 lg:h-full lg:border-x lg:border-gray-200 lg:transition-all lg:duration-300"
                : "lg:flex lg:w-96 lg:shrink-0 lg:flex-[0.75] lg:h-full lg:border-l lg:border-gray-200 lg:transition-all lg:duration-300",
            "max-lg:fixed max-lg:inset-x-0 max-lg:w-full max-lg:max-w-full max-lg:shadow-[0_-10px_35px_rgba(0,0,0,0.2)] max-lg:overflow-hidden",
            isKeyboardVisible
              ? "max-lg:z-[80] max-lg:rounded-none max-lg:border-t-0 max-lg:transition-none"
              : cn(
                "max-lg:bottom-0 max-lg:top-auto max-lg:z-[70] max-lg:border-t max-lg:border-zinc-300",
                "max-lg:transition-[height,transform,opacity,border-radius] max-lg:duration-300 max-lg:ease-in-out",
                isMobileChatOpen
                  ? isChatExpanded
                    ? "max-lg:h-[88dvh] max-lg:rounded-t-2xl max-lg:translate-y-0 max-lg:opacity-100"
                    : "max-lg:h-[58dvh] max-lg:rounded-t-2xl max-lg:translate-y-0 max-lg:opacity-100"
                  : "max-lg:h-0 max-lg:translate-y-full max-lg:opacity-0 max-lg:pointer-events-none"
              )
          )}
        >
          {/* Mobile Handle Pill */}
          <div
            className="lg:hidden flex items-center justify-center pt-2 pb-1 bg-white cursor-pointer select-none"
            onClick={() => {
              if (
                isKeyboardVisible &&
                document.activeElement instanceof HTMLElement
              ) {
                document.activeElement.blur();
              } else {
                setIsMobileChatOpen(false);
              }
            }}
          >
            <div className="w-10 h-1 rounded-full bg-zinc-300 hover:bg-zinc-400 transition-colors" />
          </div>

          {/* Multi-Doc Chat Top Bar */}
          <div
            ref={chatHeaderRef}
            className="flex items-center justify-between gap-2 px-3.5 py-2 bg-white border-b border-zinc-200 shrink-0 min-w-0 overflow-x-auto no-scrollbar overscroll-x-contain"
          >
            <div className="flex items-center gap-2 shrink-0">
              <div className="h-2 w-2 rounded-full bg-blue-600 animate-pulse shrink-0" />
              <span className="text-xs font-bold text-zinc-900 truncate">
                Multi-Doc Synthesis
              </span>
              <span className="inline-flex items-center gap-0.5 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700 border border-blue-200 shrink-0">
                <Layers className="h-2.5 w-2.5" />
                {selectedFiles.length} Docs
              </span>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {/* Done button to dismiss keyboard on mobile */}
              {isKeyboardVisible && (
                <button
                  type="button"
                  onClick={() => {
                    if (document.activeElement instanceof HTMLElement) {
                      document.activeElement.blur();
                    }
                  }}
                  className="lg:hidden px-2.5 py-1 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 active:bg-blue-200 rounded-md border border-blue-200 shadow-sm transition-colors"
                >
                  Done
                </button>
              )}

              <button
                type="button"
                onClick={() => setIsChatExpanded((prev) => !prev)}
                className="px-2 py-1 rounded-md text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 transition-colors flex items-center gap-1 text-xs font-medium"
                title={
                  isChatExpanded ? "Switch to Split View" : "Expand AI Assistant"
                }
              >
                {isChatExpanded ? (
                  <>
                    <Minimize2 className="h-3.5 w-3.5" />
                    <span>Split</span>
                  </>
                ) : (
                  <>
                    <Maximize2 className="h-3.5 w-3.5" />
                    <span>Expand</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => setIsDesktopChatHidden(true)}
                className="hidden lg:flex p-1.5 rounded-md text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 transition-colors"
                title="Expand Document to Full Width"
                aria-label="Hide chat sidebar"
              >
                <PanelRightClose className="h-4 w-4" />
              </button>

              <button
                type="button"
                onClick={() => setIsMobileChatOpen(false)}
                className="lg:hidden p-1.5 rounded-md text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 transition-colors"
                aria-label="Minimize chat"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Chat Container */}
          <div className="flex-1 min-h-0 min-w-0 w-full max-w-full overflow-hidden flex flex-col">
            <ChatWrapper
              key={multiSessionId}
              fileId={multiSessionId}
              fileIds={selectedFiles.map((f) => f.id)}
              docNames={selectedFiles.map((f) => f.name)}
              docSources={selectedFiles.map((f) => ({
                id: f.id,
                name: f.name,
              }))}
              isExpanded={isChatExpanded}
              planName={planName}
              pagesPerPdf={pagesPerPdf}
            />
          </div>
        </div>
      </div>

      {/* Floating Action Buttons */}
      {!isMobileChatOpen && (
        <button
          type="button"
          onClick={() => setIsMobileChatOpen(true)}
          className="lg:hidden fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-xl shadow-blue-600/30 hover:bg-blue-700 active:scale-95 transition-all border border-blue-500"
          aria-label="Open Multi-Doc Chat"
        >
          <MessageSquare className="h-4 w-4" />
          <span>Chat with {selectedFiles.length} Docs</span>
        </button>
      )}

      {isDesktopChatHidden && (
        <button
          type="button"
          onClick={() => setIsDesktopChatHidden(false)}
          className="hidden lg:flex fixed bottom-6 right-6 z-40 items-center gap-2 rounded-full bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-xl shadow-blue-600/30 hover:bg-blue-700 active:scale-95 transition-all border border-blue-500"
          aria-label="Open Multi-Doc Assistant"
        >
          <PanelRightOpen className="h-4 w-4" />
          <span>Open Multi-Doc Assistant</span>
        </button>
      )}

      {/* =====================================================================
          ADD / REMOVE PARTICIPATING DOCUMENTS MODAL
         ===================================================================== */}
      <Dialog open={isManageModalOpen} onOpenChange={setIsManageModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-bold text-zinc-900">
              <Layers className="h-5 w-5 text-blue-600" />
              Manage Active Chat Documents
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            <p className="text-xs text-zinc-500">
              Select which documents to include in this synthesized chat session.
              QuillDocs will cross-reference and cite all selected files.
            </p>

            {/* Search filter */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
              <Input
                placeholder="Filter your documents..."
                value={modalSearchQuery}
                onChange={(e) => setModalSearchQuery(e.target.value)}
                className="pl-9 h-9 text-sm"
              />
            </div>

            {/* Documents List */}
            <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
              {filteredModalFiles.length === 0 ? (
                <div className="py-6 text-center text-xs text-zinc-500">
                  No documents found.
                </div>
              ) : (
                filteredModalFiles.map((file) => {
                  const isChecked = tempSelectedIds.includes(file.id);
                  return (
                    <div
                      key={file.id}
                      onClick={() => {
                        if (isChecked) {
                          if (tempSelectedIds.length > 1) {
                            setTempSelectedIds((prev) =>
                              prev.filter((id) => id !== file.id)
                            );
                          }
                        } else {
                          setTempSelectedIds((prev) => [...prev, file.id]);
                        }
                      }}
                      className={cn(
                        "flex items-center justify-between p-3 rounded-xl border cursor-pointer transition select-none",
                        isChecked
                          ? "border-blue-500 bg-blue-50/50"
                          : "border-zinc-200 bg-white hover:bg-zinc-50"
                      )}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={cn(
                            "flex h-8 w-8 items-center justify-center rounded-lg border shrink-0",
                            isChecked
                              ? "bg-blue-600 text-white border-blue-600"
                              : "bg-zinc-100 text-zinc-600 border-zinc-200"
                          )}
                        >
                          {isChecked ? (
                            <Check className="h-4 w-4" />
                          ) : (
                            getFileIcon(file.name)
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-zinc-900 truncate">
                            {file.name}
                          </p>
                          <code className="text-[10px] font-mono text-zinc-400">
                            {file.id}
                          </code>
                        </div>
                      </div>

                      <span className="text-[11px] font-semibold text-zinc-500 uppercase px-2 py-0.5 rounded bg-zinc-100 border border-zinc-200">
                        {file.name.split(".").pop()?.toUpperCase() || "DOC"}
                      </span>
                    </div>
                  );
                })
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between border-t border-zinc-100 pt-3">
              <span className="text-xs text-zinc-500">
                <strong className="text-zinc-900">
                  {tempSelectedIds.length}
                </strong>{" "}
                document{tempSelectedIds.length === 1 ? "" : "s"} selected
              </span>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsManageModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleApplyManageFiles}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  Update Chat ({tempSelectedIds.length})
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
