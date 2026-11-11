"use client";

import PdfRenderer from "./PdfRenderer";
import DocxRenderer from "./DocxRenderer";
import PptxRenderer from "./PptxRenderer";
import { getFileType } from "@/lib/file-utils";

interface DocumentRendererProps {
  fileId: string;
  url: string;
  fileName?: string;
}

export default function DocumentRenderer({
  fileId,
  url,
  fileName = "",
}: DocumentRendererProps) {
  const fileType =
    getFileType(fileName) !== "unknown"
      ? getFileType(fileName)
      : getFileType(url);

  if (fileType === "docx") {
    return <DocxRenderer key={fileId} fileId={fileId} url={url} fileName={fileName} />;
  }

  if (fileType === "pptx") {
    return <PptxRenderer key={fileId} fileId={fileId} url={url} fileName={fileName} />;
  }

  // Default to standard PDF renderer
  return <PdfRenderer key={fileId} fileId={fileId} url={url} fileName={fileName} />;
}

