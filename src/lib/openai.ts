import OpenAI from "openai";

export const isOpenAIConfigured = Boolean(
  process.env.OPENAI_API_KEY &&
    !process.env.OPENAI_API_KEY.includes("<your")
);

export const openai = isOpenAIConfigured
  ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })
  : (new Proxy(
      {},
      {
        get: () => () => ({}),
      }
    ) as any);
