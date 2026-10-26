import { z } from "zod";

const emailAddressSchema = z.object({ address: z.string().min(1).max(320) }).passthrough();
const bodySchema = z.object({ contentType: z.enum(["html", "text"]), content: z.string() }).passthrough();
export const graphMailMessageSchema = z.object({
  id: z.string().min(1),
  subject: z.string().max(500).nullable().optional(),
  from: z.object({ emailAddress: emailAddressSchema }).nullable().optional(),
  receivedDateTime: z.string().datetime({ offset: true }).nullable().optional(),
  body: bodySchema.nullable().optional(),
  "@removed": z.object({ reason: z.string().optional() }).optional(),
}).passthrough();
export const graphResponseSchema = z.object({
  value: z.array(z.unknown()),
  "@odata.nextLink": z.string().url().optional(),
  "@odata.deltaLink": z.string().url().optional(),
}).passthrough();
export type GraphMailMessage = z.infer<typeof graphMailMessageSchema>;
export type GraphResponse = z.infer<typeof graphResponseSchema>;
