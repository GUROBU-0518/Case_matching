import { createHash } from "node:crypto";

export function sha256(value: string): string { return createHash("sha256").update(value, "utf8").digest("hex"); }
export function createPreprocessConfirmationToken(input: { id: string; subject: string; storedBody: string; originalBody: string; processedBody: string }): string {
  return sha256([input.id, input.subject, sha256(input.storedBody), sha256(input.originalBody), sha256(input.processedBody)].join("\n"));
}
export function isSafeToUpdate(input: { storedBody: string | null; processedBody: string; retention: Record<string, string> }): boolean {
  return Boolean(input.processedBody) && input.storedBody !== input.processedBody && !Object.values(input.retention).some((value) => value === "削除された可能性" || value === "判定不能");
}
