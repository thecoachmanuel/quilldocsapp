import { getKindeServerSession } from "@/lib/kinde";
import { db } from "@/db";
import { ensureDbUser } from "@/lib/auth-rbac";
import { getUserSubscriptionPlan } from "@/lib/stripe";
import { saveDocumentBuffer } from "@/lib/document-storage";
import { vectorizeAndIndexDocument } from "@/lib/vectorize";
import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { getUser } = getKindeServerSession();
    const user = await getUser();

    if (!user || !user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Ensure database user record is active and linked to current Kinde session
    await ensureDbUser(user);

    const dbUser = await db.user.findFirst({ where: { id: user.id } });
    if (dbUser?.status === "SUSPENDED") {
      return NextResponse.json(
        {
          error:
            "Your account is currently suspended. Please contact an administrator.",
        },
        { status: 403 }
      );
    }

    const subscriptionPlan = await getUserSubscriptionPlan();
    const isSubscribed = Boolean(subscriptionPlan?.isSubscribed);
    const planQuota = subscriptionPlan?.quota || (isSubscribed ? 50 : 10);
    const planName = subscriptionPlan?.name || (isSubscribed ? "Pro" : "Free");
    const planMaxMB =
      subscriptionPlan?.maxFileSizeMB || (isSubscribed ? 16 : 4);
    const planMaxPages =
      subscriptionPlan?.pagesPerPdf || (isSubscribed ? 25 : 5);

    // 1. Quota Check: enforce dynamic plan quota
    const currentFilesCount = await db.file.count({
      where: { userId: user.id },
    });

    if (currentFilesCount >= planQuota) {
      return NextResponse.json(
        {
          error: `You have reached the maximum quota of ${planQuota} documents on the ${planName} plan. ${
            !isSubscribed
              ? "Upgrade to Pro to upload more documents."
              : "Please delete some files to upload more."
          }`,
          quotaExceeded: true,
          currentCount: currentFilesCount,
          maxQuota: planQuota,
        },
        { status: 403 }
      );
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }

    const ext = path.extname(file.name).toLowerCase();
    const allowed = [".pdf", ".docx", ".doc", ".pptx", ".ppt"];
    if (!allowed.includes(ext)) {
      return NextResponse.json(
        {
          error: `File type "${ext || "unknown"}" is not supported. Please upload a PDF, DOCX, or PPT/PPTX file.`,
        },
        { status: 400 }
      );
    }

    // 2. File Size Check: enforce dynamic plan maxFileSizeMB
    const maxFileSize = planMaxMB * 1024 * 1024;
    if (file.size > maxFileSize) {
      return NextResponse.json(
        {
          error: `File size (${(file.size / (1024 * 1024)).toFixed(1)}MB) exceeds the ${planMaxMB}MB limit for the ${planName} plan. ${
            !isSubscribed ? "Upgrade to Pro for larger file uploads." : ""
          }`,
          fileSizeExceeded: true,
        },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // 3. Page Count Check: enforce dynamic plan pagesPerPdf
    const maxPages = planMaxPages;
    let pageCount = 1;

    try {
      if (ext === ".pdf") {
        const pdfParse = require("pdf-parse/lib/pdf-parse.js");
        const pdfData = await pdfParse(buffer);
        pageCount = pdfData?.numpages || 1;
      } else if (ext === ".pptx" || ext === ".ppt") {
        const AdmZip = require("adm-zip");
        const zip = new AdmZip(buffer);
        const zipEntries = zip.getEntries();
        const slideEntries = zipEntries.filter(
          (entry: any) =>
            entry.entryName.startsWith("ppt/slides/slide") &&
            entry.entryName.endsWith(".xml")
        );
        pageCount = Math.max(1, slideEntries.length);
      } else if (ext === ".docx" || ext === ".doc") {
        const mammoth = require("mammoth");
        const parsed = await mammoth.extractRawText({ buffer });
        const wordCount = (parsed.value || "").split(/\s+/).filter(Boolean).length;
        pageCount = Math.max(1, Math.ceil(wordCount / 400));
      }
    } catch (parseErr) {
      console.warn("Could not determine page count before upload:", parseErr);
    }

    if (pageCount > maxPages) {
      return NextResponse.json(
        {
          error: `This document contains ${pageCount} pages, which exceeds the ${maxPages}-page limit for the ${planName} plan. ${
            !isSubscribed ? "Upgrade to Pro for higher page limits." : ""
          }`,
          pagesExceeded: true,
          pageCount,
          maxPages,
        },
        { status: 400 }
      );
    }

    const fileId = `file_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
    const fileUrl = `/api/files/${fileId}/${encodeURIComponent(safeName)}`;

    // 4. Save file chunks into MongoDB Atlas (Reliable across localhost and Vercel serverless)
    await saveDocumentBuffer(fileId, buffer);

    // Optional local disk cache for fast local dev loading
    try {
      const uploadsDir = path.join(process.cwd(), "public", "uploads");
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }
      const filename = `${fileId}_${safeName}`;
      const filepath = path.join(uploadsDir, filename);
      await fs.promises.writeFile(filepath, buffer);
    } catch {
      // Ignored on read-only environments like Vercel
    }

    // 5. Create database file record
    const createdFile = await db.file.create({
      data: {
        id: fileId,
        key: fileId,
        name: file.name,
        userId: user.id,
        url: fileUrl,
        uploadStatus: "PROCESSING",
      },
    });

    // 6. Vectorize document into Pinecone asynchronously
    vectorizeAndIndexDocument({
      fileId: createdFile.id,
      fileUrl: fileUrl,
      fileName: file.name,
    }).catch((err) => {
      console.error("[upload/route] Vectorization error:", err);
    });

    return NextResponse.json({
      success: true,
      file: {
        id: createdFile.id,
        key: createdFile.key,
        name: createdFile.name,
        url: createdFile.url,
      },
    });
  } catch (error: any) {
    console.error("[upload/route] File upload error:", error);
    return NextResponse.json(
      { error: error?.message || "File upload failed" },
      { status: 500 }
    );
  }
}
