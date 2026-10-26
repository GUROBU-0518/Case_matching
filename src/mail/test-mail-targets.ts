import { z } from "zod";
import type { CommonEmail } from "./types.ts";

export const testMailTargetSchema = z.object({
  mailboxId: z.string().min(1),
  graphMessageId: z.string().min(1),
  subject: z.string().max(500),
  receivedAt: z.string().datetime({ offset: true }),
});

export const testMailTargetsSchema = z.array(testMailTargetSchema).length(10);
export type TestMailTarget = z.infer<typeof testMailTargetSchema>;

export function parseTestMailTargets(input: unknown): readonly TestMailTarget[] {
  const targets = testMailTargetsSchema.parse(input);
  const ids = new Set(targets.map((target) => `${target.mailboxId}\u0000${target.graphMessageId}`));
  if (ids.size !== targets.length) throw new Error("テスト対象のGraph IDが重複しています");
  const mailboxes = new Set(targets.map((target) => target.mailboxId));
  if (mailboxes.size !== 1) throw new Error("テスト対象のメールボックスは1つに限定してください");
  return targets;
}

export function validateFetchedTestMail(target: TestMailTarget, email: CommonEmail): void {
  if (email.mailboxId !== target.mailboxId || email.messageId !== target.graphMessageId) throw new Error("取得メールのIDまたはメールボックスが対象設定と一致しません");
  if (email.subject !== target.subject) throw new Error("取得メールの件名が対象設定と一致しません");
  if (email.receivedAt.toISOString() !== new Date(target.receivedAt).toISOString()) throw new Error("取得メールの受信日時が対象設定と一致しません");
}
