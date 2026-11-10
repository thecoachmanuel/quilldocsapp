import { db } from "@/db";

// 512 KB per chunk is optimal for MongoDB network packets and fast assembly
const CHUNK_SIZE = 512 * 1024;

/**
 * Saves a document's binary buffer into MongoDB in chunked format.
 * Enables zero-dependency, serverless-safe document storage up to Pro plan limits (16MB+).
 */
export async function saveDocumentBuffer(
  fileId: string,
  buffer: Buffer
): Promise<void> {
  // First clear any existing chunks for this file
  await db.documentChunk.deleteMany({
    where: { fileId },
  });

  const totalBytes = buffer.length;
  const chunkCount = Math.max(1, Math.ceil(totalBytes / CHUNK_SIZE));
  const chunkData: Array<{ fileId: string; index: number; data: string }> = [];

  for (let i = 0; i < chunkCount; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, totalBytes);
    const slice = buffer.subarray(start, end);
    chunkData.push({
      fileId,
      index: i,
      data: slice.toString("base64"),
    });
  }

  // Insert chunks in batch
  await db.documentChunk.createMany({
    data: chunkData,
  });
}

/**
 * Retrieves a document's full binary buffer from MongoDB chunks.
 */
export async function getDocumentBuffer(
  fileId: string
): Promise<Buffer | null> {
  const chunks = await db.documentChunk.findMany({
    where: { fileId },
    orderBy: { index: "asc" },
  });

  if (!chunks || chunks.length === 0) {
    return null;
  }

  const buffers = chunks.map((c: { data: string }) =>
    Buffer.from(c.data, "base64")
  );
  return Buffer.concat(buffers);
}

/**
 * Deletes all stored document chunks for a file.
 */
export async function deleteDocumentBuffer(fileId: string): Promise<void> {
  try {
    await db.documentChunk.deleteMany({
      where: { fileId },
    });
  } catch (err) {
    console.warn(`[storage] Could not delete chunks for file ${fileId}:`, err);
  }
}
