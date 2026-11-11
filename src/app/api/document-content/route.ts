import { db } from "@/db";
import { getUserSessionWithRBAC } from "@/lib/auth-rbac";
import { parseDocument, getFileType } from "@/lib/document-parser";
import { getDocumentBuffer } from "@/lib/document-storage";
import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const rbac = await getUserSessionWithRBAC();

    if (!rbac.isAuthenticated || !rbac.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const fileId = searchParams.get("fileId");
    const raw = searchParams.get("raw") === "true";

    if (!fileId) {
      return NextResponse.json(
        { error: "Missing fileId parameter" },
        { status: 400 }
      );
    }

    const file = await db.file.findFirst({
      where: rbac.isAdmin
        ? { id: fileId }
        : {
            id: fileId,
            userId: rbac.user.id,
          },
    });

    if (!file) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const fileType = getFileType(file.name || file.url);

    if (raw) {
      let buffer: Buffer | null = await getDocumentBuffer(file.id);

      if (!buffer && file.key && file.key !== file.id) {
        buffer = await getDocumentBuffer(file.key);
      }

      if (!buffer) {
        if (file.url.startsWith("http://") || file.url.startsWith("https://")) {
          const res = await fetch(file.url);
          if (!res.ok) throw new Error("Failed to fetch file from source");
          const ab = await res.arrayBuffer();
          buffer = Buffer.from(ab);
        } else {
          const relPath = file.url.startsWith("/") ? file.url.slice(1) : file.url;
          const fullPath = path.join(process.cwd(), "public", relPath);
          if (fs.existsSync(fullPath)) {
            buffer = await fs.promises.readFile(fullPath);
          }
        }
      }

      if (!buffer) {
        return NextResponse.json(
          { error: "Document content not found" },
          { status: 404 }
        );
      }

      let contentType = "application/octet-stream";
      if (fileType === "docx") {
        contentType =
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      } else if (fileType === "pptx") {
        contentType =
          "application/vnd.openxmlformats-officedocument.presentationml.presentation";
      } else if (fileType === "pdf") {
        contentType = "application/pdf";
      }

      return new NextResponse(buffer, {
        headers: {
          "Content-Type": contentType,
          "Content-Disposition": `inline; filename="${file.name}"`,
        },
      });
    }

    const parsed = await parseDocument(file.url, file.name);


    return NextResponse.json({
      success: true,
      file: {
        id: file.id,
        name: file.name,
        url: file.url,
        fileType,
      },
      parsed,
    });
  } catch (error: any) {
    console.error("[document-content/route] Error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to parse document" },
      { status: 500 }
    );
  }
}

