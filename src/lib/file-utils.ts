/**
 * Pure file helper utilities safe for both client and server components
 */

export type DocumentType = "pdf" | "docx" | "pptx" | "unknown";

export function getFileType(filenameOrUrl: string = ""): DocumentType {
  const clean = (filenameOrUrl || "").split("?")[0].toLowerCase();
  if (clean.endsWith(".pdf")) return "pdf";
  if (clean.endsWith(".docx") || clean.endsWith(".doc")) return "docx";
  if (clean.endsWith(".pptx") || clean.endsWith(".ppt")) return "pptx";
  return "unknown";
}

export function getFileBadgeInfo(filename: string = ""): {
  label: string;
  bgGradient: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
} {
  const type = getFileType(filename);
  if (type === "docx") {
    return {
      label: "DOCX",
      bgGradient: "from-blue-600 to-indigo-600",
      badgeBg: "bg-blue-50",
      badgeText: "text-blue-700",
      badgeBorder: "border-blue-200",
    };
  }
  if (type === "pptx") {
    return {
      label: "PPTX",
      bgGradient: "from-orange-500 to-amber-500",
      badgeBg: "bg-orange-50",
      badgeText: "text-orange-700",
      badgeBorder: "border-orange-200",
    };
  }
  return {
    label: "PDF",
    bgGradient: "from-cyan-500 to-blue-500",
    badgeBg: "bg-cyan-50",
    badgeText: "text-cyan-700",
    badgeBorder: "border-cyan-200",
  };
}

