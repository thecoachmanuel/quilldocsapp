"use client";

import { useState } from "react";
import DocumentRenderer from "./DocumentRenderer";
import ChatWrapper from "./chat/ChatWrapper";
import {
  MessageSquare,
  Maximize2,
  Minimize2,
  ChevronDown,
  FileText,
  PanelRightClose,
  PanelRightOpen,
  Plus,
} from "lucide-react";
import Link from "next/link";
import { useMobileViewport } from "@/lib/use-mobile-viewport";
import { cn } from "@/lib/utils";

interface DocumentViewLayoutProps {
  fileId: string;
  url: string;
  fileName?: string;
}

export default function DocumentViewLayout({
  fileId,
  url,
  fileName,
}: DocumentViewLayoutProps) {
  const [isMobileChatOpen, setIsMobileChatOpen] = useState<boolean>(false);
  const [isChatExpanded, setIsChatExpanded] = useState<boolean>(false);
  const [isDesktopChatHidden, setIsDesktopChatHidden] =
    useState<boolean>(false);

  const { isMobile, isKeyboardVisible, viewportHeight, offsetTop } =
    useMobileViewport();

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

  return (
    <div className="relative flex-1 flex flex-col justify-start min-h-[calc(100dvh-3.5rem)] lg:h-[calc(100dvh-3.5rem)] lg:overflow-hidden">
      {/* Mobile Quick Bar - Compact sticky header for fast document/chat control */}
      <div className="lg:hidden flex items-center justify-between px-2.5 py-1.5 bg-white/95 backdrop-blur border-b border-zinc-200 sticky top-14 z-30">
        <div className="flex items-center gap-1.5 min-w-0 pr-2">
          <FileText className="h-3.5 w-3.5 text-blue-600 shrink-0" />
          <span className="text-xs font-medium text-zinc-800 truncate">
            {fileName || "Document"}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => {
              setIsMobileChatOpen((prev) => !prev);
            }}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all",
              isMobileChatOpen
                ? "bg-zinc-900 text-white"
                : "bg-blue-600 text-white shadow-sm hover:bg-blue-700"
            )}
          >
            <MessageSquare className="h-3 w-3" />
            <span>{isMobileChatOpen ? "Hide Chat" : "AI Chat"}</span>
          </button>
        </div>
      </div>

      <div className="mx-auto w-full max-w-8xl flex-1 min-h-0 lg:flex lg:overflow-hidden xl:px-2">
        {/* Left Side: Document / Slide Viewer */}
        <div
          className={cn(
            "flex-1 xl:flex min-w-0 lg:h-full lg:overflow-y-auto transition-all duration-200",
            isChatExpanded && !isDesktopChatHidden && "lg:hidden"
          )}
        >
          <div className="px-0.5 py-1 sm:px-3 sm:py-2 lg:pl-6 lg:pr-4 lg:py-2 xl:flex-1 xl:pl-6 w-full">
            <DocumentRenderer fileId={fileId} url={url} fileName={fileName} />
          </div>
        </div>

        {/* Mobile Backdrop when Chat is expanded to full height or when virtual keypad is active */}
        {isMobileChatOpen && (
          <div
            className={cn(
              "fixed inset-0 bg-black/40 backdrop-blur-[1px] lg:hidden transition-opacity",
              isKeyboardVisible || isChatExpanded
                ? "z-[75] opacity-100 pointer-events-auto"
                : "z-[65] opacity-0 pointer-events-none"
            )}
            onClick={() => {
              if (document.activeElement instanceof HTMLElement) {
                document.activeElement.blur();
              }
              if (isChatExpanded) setIsChatExpanded(false);
            }}
          />
        )}

        {/* Right Side on Desktop / Floating Slide-Up Modal on Mobile */}
        <div
          style={mobileKeyboardStyle}
          className={cn(
            "bg-zinc-50 flex flex-col",
            // Desktop layout & expanded states
            isDesktopChatHidden
              ? "lg:hidden"
              : isChatExpanded
              ? "lg:flex lg:w-full lg:flex-1 lg:h-full lg:border-x lg:border-gray-200 lg:transition-all lg:duration-300"
              : "lg:flex lg:w-96 lg:shrink-0 lg:flex-[0.75] lg:h-full lg:border-l lg:border-gray-200 lg:transition-all lg:duration-300",
            // Mobile floating modal styles
            "max-lg:fixed max-lg:inset-x-0 max-lg:shadow-[0_-10px_35px_rgba(0,0,0,0.2)] max-lg:overflow-hidden",
            isKeyboardVisible
              ? "max-lg:z-[80] max-lg:rounded-none max-lg:border-t-0 max-lg:transition-none"
              : cn(
                  "max-lg:bottom-0 max-lg:top-auto max-lg:z-[70] max-lg:border-t max-lg:border-zinc-300",
                  "max-lg:transition-[height,transform,opacity,border-radius] max-lg:duration-300 max-lg:ease-in-out",
                  isMobileChatOpen
                    ? isChatExpanded
                      ? "max-lg:h-[100dvh] max-lg:rounded-none max-lg:translate-y-0 max-lg:opacity-100"
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

          {/* Quill AI Assistant Header Bar */}
          <div className="flex items-center justify-between px-3.5 py-2 bg-white border-b border-zinc-200 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <div className="h-2 w-2 rounded-full bg-blue-600 animate-pulse shrink-0" />
              <span className="text-xs font-semibold text-zinc-900 truncate">
                QuillDocs AI
              </span>
              <span className="text-[11px] text-zinc-400 shrink-0 hidden sm:inline">
                ({isChatExpanded ? "Expanded" : "Split View"})
              </span>

              <Link
                href={`/dashboard/multi?files=${fileId}`}
                className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium text-blue-600 bg-blue-50 border border-blue-200 hover:bg-blue-100/80 transition ml-1 shrink-0"
                title="Chat with multiple documents simultaneously"
              >
                <Plus className="h-3 w-3" />
                <span>Add Docs</span>
              </Link>
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

              {/* Desktop Collapse Sidebar button */}
              <button
                type="button"
                onClick={() => setIsDesktopChatHidden(true)}
                className="hidden lg:flex p-1.5 rounded-md text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 transition-colors"
                title="Expand Document to Full Width"
                aria-label="Hide chat sidebar"
              >
                <PanelRightClose className="h-4 w-4" />
              </button>

              {/* Mobile Minimize Drawer button */}
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

          {/* Chat Content Container */}
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
            <ChatWrapper fileId={fileId} isExpanded={isChatExpanded} />
          </div>
        </div>
      </div>

      {/* Floating Chat Action Button (FAB) on Mobile when chat is minimized */}
      {!isMobileChatOpen && (
        <button
          type="button"
          onClick={() => setIsMobileChatOpen(true)}
          className="lg:hidden fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-xl shadow-blue-600/30 hover:bg-blue-700 active:scale-95 transition-all border border-blue-500"
          aria-label="Open AI Chat"
        >
          <MessageSquare className="h-4 w-4" />
          <span>Chat with Document</span>
        </button>
      )}

      {/* Floating Button on Desktop when chat sidebar is collapsed */}
      {isDesktopChatHidden && (
        <button
          type="button"
          onClick={() => setIsDesktopChatHidden(false)}
          className="hidden lg:flex fixed bottom-6 right-6 z-40 items-center gap-2 rounded-full bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-xl shadow-blue-600/30 hover:bg-blue-700 active:scale-95 transition-all border border-blue-500"
          aria-label="Open AI Assistant"
        >
          <PanelRightOpen className="h-4 w-4" />
          <span>Open AI Assistant</span>
        </button>
      )}
    </div>
  );
}
