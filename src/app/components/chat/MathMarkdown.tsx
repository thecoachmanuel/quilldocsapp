import React from "react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import remarkGfm from "remark-gfm";
import rehypeKatex from "rehype-katex";
import { cn } from "@/lib/utils";

interface MathMarkdownProps {
  content: string;
  className?: string;
}

export const MathMarkdown: React.FC<MathMarkdownProps> = ({
  content,
  className,
}) => {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkMath, remarkGfm]}
      rehypePlugins={[rehypeKatex]}
      className={cn(
        "prose prose-sm max-w-full min-w-0 break-words [overflow-wrap:anywhere] [&_table]:w-full [&_table]:border-collapse [&_th]:border [&_th]:border-zinc-300 [&_th]:bg-zinc-100 [&_th]:px-2.5 [&_th]:py-1.5 [&_td]:border [&_td]:border-zinc-200 [&_td]:px-2.5 [&_td]:py-1.5 [&_pre]:max-w-full [&_pre]:overflow-x-auto",
        className
      )}
    >
      {content}
    </ReactMarkdown>
  );
};

export default MathMarkdown;

