import { Pinecone } from "@pinecone-database/pinecone";

export const isPineconeConfigured = Boolean(
  process.env.PINECONE_API_KEY &&
  !process.env.PINECONE_API_KEY.includes("<your")
);

let pineconeClient: any = null;

if (isPineconeConfigured) {
  try {
    const config: any = {
      apiKey: process.env.PINECONE_API_KEY!,
      environment: process.env.PINECONE_ENVIRONMENT || "aped-4627-b74a",
    };

    if (process.env.PINECONE_PROJECT_ID) {
      config.projectId = process.env.PINECONE_PROJECT_ID;
    }

    pineconeClient = new Pinecone(config);
  } catch (e) {
    console.error("Failed to initialize Pinecone client:", e);
  }
}

if (!pineconeClient) {
  pineconeClient = {
    Index: () => ({
      query: async () => ({ matches: [] }),
      upsert: async () => { },
    }),
  };
}

export const pinecone = pineconeClient;
