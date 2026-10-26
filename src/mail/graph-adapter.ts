import { commonEmailSchema, type CommonEmail } from "./types.ts";
import { graphMailMessageSchema, graphResponseSchema, type GraphMailMessage, type GraphResponse } from "./graph-types.ts";
import { z } from "zod";

export type GraphMessageResult =
  | { kind: "message"; email: CommonEmail; contentType: "html" | "text" }
  | { kind: "removed"; messageId: string; reason: string | undefined };

export function parseGraphMailMessage(input: unknown, mailboxId: string): GraphMessageResult {
  const parsed = graphMailMessageSchema.parse(input);
  if (parsed["@removed"]) return { kind: "removed", messageId: parsed.id, reason: parsed["@removed"].reason };
  if (!mailboxId.trim()) throw new Error("mailboxIdが空です");
  if (!parsed.receivedDateTime) throw new Error(`Graphメールの受信日時がありません: ${parsed.id}`);
  if (!parsed.body) throw new Error(`Graphメールの本文がありません: ${parsed.id}`);
  if (!parsed.from?.emailAddress?.address) throw new Error(`Graphメールの送信者がありません: ${parsed.id}`);
  const email = commonEmailSchema.parse({
    mailboxId, messageId: parsed.id, subject: parsed.subject ?? "",
    sender: parsed.from.emailAddress.address, receivedAt: new Date(parsed.receivedDateTime), body: parsed.body.content,
  });
  return { kind: "message", email, contentType: parsed.body.contentType };
}

export function parseGraphResponse(input: unknown, mailboxId: string): { messages: GraphMessageResult[]; nextLink: string | undefined; deltaLink: string | undefined } {
  const response = graphResponseSchema.parse(input);
  const messages = response.value.map((message) => parseGraphMailMessage(message, mailboxId));
  return { messages, nextLink: response["@odata.nextLink"], deltaLink: response["@odata.deltaLink"] };
}

export function isGraphMessage(input: unknown): input is GraphMailMessage {
  return graphMailMessageSchema.safeParse(input).success;
}

export function isGraphResponse(input: unknown): input is GraphResponse {
  return graphResponseSchema.safeParse(input).success;
}

export function formatGraphValidationError(error: unknown): string {
  if (error instanceof z.ZodError) return "Graph JSONの形式が不正です";
  return error instanceof Error ? error.message : "Graph JSONの検証に失敗しました";
}
