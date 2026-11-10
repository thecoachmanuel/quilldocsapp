import { db } from "@/db";
import { getDocumentBuffer } from "@/lib/document-storage";
import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

function getContentType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  switch (ext) {
    case ".pdf":
      return "application/pdf";
    case ".docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case ".doc":
      return "application/msword";
    case ".pptx":
      return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    case ".ppt":
      return "application/vnd.ms-powerpoint";
    case ".txt":
      return "text/plain";
    default:
      return "application/octet-stream";
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: { fileId: string | string[] } }
) {
  try {
    const rawFileId = params.fileId;
    const fileId = Array.isArray(rawFileId)
      ? rawFileId[0]
      : typeof rawFileId === "string"
      ? rawFileId
      : "";

    if (!fileId) {
      return NextResponse.json({ error: "Missing file ID" }, { status: 400 });
    }

    // 1. Find file metadata in database
    const file = await db.file.findFirst({
      where: {
        OR: [{ id: fileId }, { key: fileId }],
      },
    });

    // 2. Attempt retrieval from MongoDB DocumentChunk storage
    let buffer = await getDocumentBuffer(file?.id || fileId);

    // Fallback: Check key if id didn't return chunks
    if (!buffer && file?.key && file.key !== file.id) {
      buffer = await getDocumentBuffer(file.key);
    }

    // Fallback: If not in MongoDB chunks, check local disk (for existing dev uploads)
    if (!buffer && file?.url && !file.url.startsWith("http")) {
      try {
        const relPath = file.url.startsWith("/") ? file.url.slice(1) : file.url;
        const fullPath = path.join(process.cwd(), "public", relPath);
        if (fs.existsSync(fullPath)) {
          buffer = await fs.promises.readFile(fullPath);
        }
      } catch (diskErr) {
        // Disk read notice
      }
    }

    // Fallback: If URL points to external storage (e.g. UploadThing or S3), proxy it
    if (!buffer && file?.url && (file.url.startsWith("http://") || file.url.startsWith("https://"))) {
      try {
        const remoteRes = await fetch(file.url);
        if (remoteRes.ok) {
          const ab = await remoteRes.arrayBuffer();
          buffer = Buffer.from(ab);
        }
      } catch (remoteErr) {
        // Remote fetch notice
      }
    }

    if (!buffer) {
      return NextResponse.json(
        { error: "File data not found in cloud storage" },
        { status: 404 }
      );
    }

    const filename = file?.name || "document.pdf";
    const contentType = getContentType(filename);

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": buffer.length.toString(),
        "Content-Disposition": `inline; filename="${encodeURIComponent(filename)}"`,
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      },
    });
  } catch (err: any) {
    console.error("[api/files] Error streaming document:", err);
    return NextResponse.json(
      { error: "Failed to stream document" },
      { status: 500 }
    );
  }
}

