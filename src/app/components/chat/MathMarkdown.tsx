import React from "react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import remarkGfm from "remark-gfm";
import rehypeKatex from "rehype-katex";
import { cn } from "@/lib/utils";

interface MathMarkdownProps {
  content: string;
  className?: string;
  size?: "normal" | "large";
}

export const MathMarkdown: React.FC<MathMarkdownProps> = ({
  content,
  className,
  size = "normal",
}) => {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkMath, remarkGfm]}
      rehypePlugins={[rehypeKatex]}
      className={cn(
        "prose max-w-full min-w-0 break-words [overflow-wrap:anywhere] text-inherit [--tw-prose-body:currentColor] [--tw-prose-bold:currentColor] [&_p]:my-1 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_table]:w-full [&_table]:border-collapse [&_th]:border [&_th]:border-zinc-300 [&_th]:bg-zinc-100 [&_th]:px-2.5 [&_th]:py-1.5 [&_td]:border [&_td]:border-zinc-200 [&_td]:px-2.5 [&_td]:py-1.5 [&_pre]:max-w-full [&_pre]:overflow-x-auto",
        size === "large" ? "prose-base sm:prose-lg" : "prose-sm sm:prose-base",
        className
      )}
    >
      {content}
    </ReactMarkdown>
  );
};

export default MathMarkdown;

