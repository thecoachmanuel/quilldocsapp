import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { GraduationCap, Send } from "lucide-react";
import { useContext, useRef, useState } from "react";
import { ChatContext } from "./ChatContext";
import { useMobileViewport } from "@/lib/use-mobile-viewport";
import { cn } from "@/lib/utils";
import ExamBuilderModal from "./ExamBuilderModal";

interface ChatInputProps {
  isDisabled?: boolean;
  isExpanded?: boolean;
}

function ChatInput({ isDisabled, isExpanded = false }: ChatInputProps) {
  const {
    addMessage,
    handleInputChange,
    isLoading,
    message,
    isExpanded: contextExpanded,
  } = useContext(ChatContext);
  const effectiveExpanded = isExpanded || contextExpanded || false;
  const [isExamModalOpen, setIsExamModalOpen] = useState(false);

  const textarearef = useRef<HTMLTextAreaElement>(null);
  const { isKeyboardVisible } = useMobileViewport();

  return (
    <div
      className={cn(
        "shrink-0 w-full max-w-full min-w-0 overflow-hidden bg-white border-t border-zinc-200 transition-all",
        isKeyboardVisible
          ? "pb-1 max-lg:pb-1"
          : "pb-[env(safe-area-inset-bottom,0.5rem)] max-lg:pb-2.5"
      )}
    >
      <div
        className={cn(
          "mx-auto w-full min-w-0 flex flex-grow gap-2 sm:gap-3 transition-all duration-300",
          effectiveExpanded
            ? "max-w-full sm:max-w-4xl xl:max-w-5xl 2xl:max-w-6xl px-2 sm:px-6"
            : "max-w-full lg:max-w-4xl xl:max-w-5xl px-0"
        )}
      >
        <div className="relative flex h-full w-full min-w-0 flex-1 items-stretch md:flex-col">
          <div className="relative flex flex-col w-full min-w-0 flex-grow p-2 sm:p-3.5">
            <div className="relative flex items-center w-full min-w-0">
              <Textarea
                rows={1}
                ref={textarearef}
                maxRows={effectiveExpanded ? 8 : 4}
                enterKeyHint="send"
                onFocus={() => {
                  // Keep window scroll stable on iOS/Android to prevent layout displacement
                  if (typeof window !== "undefined" && window.innerWidth < 1024) {
                    window.scrollTo({ top: 0, left: 0 });
                  }
                }}
                onChange={(e) => {
                  handleInputChange(e);
                }}
                value={message}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    addMessage();
                    textarearef.current?.focus();
                  }
                }}
                placeholder="Ask a question, request exam questions (DOCX/PDF), or any language..."
                className="w-full min-w-0 resize-none pr-24 text-base py-2.5 sm:py-3 scrollbar-thumb-blue scrollbar-thumb-rounded scrollbar-track-blue-lighter scrollbar-w-2 scrolling-touch"
              />
              <div className="absolute bottom-1.5 right-1.5 flex items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  disabled={isLoading || isDisabled}
                  onClick={() => setIsExamModalOpen(true)}
                  title="Generate Exam Paper (MCQ & Theory in DOCX/PDF)"
                  aria-label="Generate exam paper"
                  className="h-8 px-2 text-xs font-semibold text-zinc-700 border-zinc-300 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300 flex items-center gap-1"
                >
                  <GraduationCap className="h-3.5 w-3.5 text-blue-600" />
                  <span className="hidden sm:inline">Exam</span>
                </Button>
                <Button
                  disabled={isLoading || isDisabled}
                  className="h-8 w-8 p-0 flex items-center justify-center"
                  aria-label="send message"
                  onClick={() => {
                    addMessage();
                    textarearef.current?.focus();
                  }}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <ExamBuilderModal
        open={isExamModalOpen}
        onOpenChange={setIsExamModalOpen}
      />
    </div>
  );
}

export default ChatInput;
