import { getKindeServerSession } from "@/lib/kinde";
import { ensureDbUser } from "@/lib/auth-rbac";
import { createUploadthing, type FileRouter } from "uploadthing/next";
import { db } from "@/db";
import { getUserSubscriptionPlan } from "@/lib/subscription";
import { vectorizeAndIndexDocument } from "@/lib/vectorize";
import { parseDocument } from "@/lib/document-parser";

if (process.env.UPLOADTHING_SECRET) {
  process.env.UPLOADTHING_SECRET = process.env.UPLOADTHING_SECRET.replace(
    /^['"]|['"]$/g,
    ""
  ).trim();
}
if (process.env.UPLOADTHING_APP_ID) {
  process.env.UPLOADTHING_APP_ID = process.env.UPLOADTHING_APP_ID.replace(
    /^['"]|['"]$/g,
    ""
  ).trim();
}

const f = createUploadthing();

const middleware = async () => {
  const { getUser } = getKindeServerSession();
  const user = await getUser();
  if (!user || !user.id) throw new Error("Unauthorized");

  await ensureDbUser(user);

  const subscriptionPlan = await getUserSubscriptionPlan();

  const currentFilesCount = await db.file.count({
    where: { userId: user.id },
  });

  if (currentFilesCount >= subscriptionPlan.quota) {
    throw new Error(
      `You have reached the maximum quota of ${subscriptionPlan.quota} documents on the ${subscriptionPlan.name} plan.`
    );
  }

  return { subscriptionPlan, userId: user.id };
};

const onUploadComplete = async ({
  metadata,
  file,
}: {
  metadata: Awaited<ReturnType<typeof middleware>>;
  file: {
    key: string;
    name: string;
    url: string;
  };
}) => {
  const fileUrl = file.url || `https://utfs.io/f/${file.key}`;

  const isFileExist = await db.file.findFirst({
    where: {
      key: file.key,
    },
  });

  if (isFileExist) return;

  const createdFile = await db.file.create({
    data: {
      key: file.key,
      name: file.name,
      userId: metadata.userId,
      url: fileUrl,
      uploadStatus: "PROCESSING",
    },
  });

  try {
    const parsed = await parseDocument(fileUrl, file.name);
    const pagesAmt = parsed.totalSlides || Math.max(1, Math.ceil(parsed.totalWords / 400));
    const { subscriptionPlan } = metadata;

    if (pagesAmt > subscriptionPlan.pagesPerPdf) {
      await db.file.update({
        data: {
          uploadStatus: "FAILED",
        },
        where: {
          id: createdFile.id,
        },
      });
      return;
    }

    // Vectorize and index entire document into Pinecone
    await vectorizeAndIndexDocument({
      fileId: createdFile.id,
      fileUrl,
      fileName: file.name,
    });
  } catch (err) {
    console.dir(err, { depth: null });
    console.log(`Error Type: ${typeof err}\n Error:${err}`);
    await db.file.update({
      data: {
        uploadStatus: "FAILED",
      },
      where: {
        id: createdFile.id,
      },
    });
  }
};

export const ourFileRouter = {
  freePlanUploader: f({
    pdf: { maxFileSize: "64MB" },
    blob: { maxFileSize: "64MB" },
  })
    .middleware(middleware)
    .onUploadComplete(onUploadComplete),
  proPlanUploader: f({
    pdf: { maxFileSize: "64MB" },
    blob: { maxFileSize: "64MB" },
  })
    .middleware(middleware)
    .onUploadComplete(onUploadComplete),
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;
