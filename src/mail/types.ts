import { z } from "zod";

export const commonEmailSchema = z.object({
  mailboxId: z.string().min(1),
  messageId: z.string().min(1),
  subject: z.string().max(500),
  sender: z.string().min(1).max(320),
  receivedAt: z.coerce.date(),
  body: z.string(),
});

export type CommonEmail = z.infer<typeof commonEmailSchema>;
