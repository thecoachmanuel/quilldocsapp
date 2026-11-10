import z from "zod";

export const SendMessageValidator = z.object({
  fileId: z.string(),
  message: z.string(),
  fileIds: z.array(z.string()).optional(),
});
