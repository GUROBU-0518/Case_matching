import type { PrismaClient } from "@prisma/client";
import { findRetryCandidates, isEligibleForNextBatchRetry, persistMailBatch, recordRetryFailure, type RetryCandidate } from "../db/mail-repository.ts";
import type { GraphMailClient, GraphClientError } from "../mail/graph-client.ts";
import { runMailBatch, type MailBatchResult } from "./mail-batch.ts";
import type { CommonEmail } from "../mail/types.ts";

export interface RetryMailItemResult {
  candidate: RetryCandidate;
  status: "succeeded" | "failed";
  retryCount: number;
  errorType?: string;
  error?: string;
}

export interface RetryMailBatchResult {
  totalCount: number;
  successCount: number;
  failureCount: number;
  items: RetryMailItemResult[];
}

function graphErrorType(error: unknown): "temporary" | "permanent" | "unknown" {
  const category = (error as Partial<GraphClientError>)?.category;
  if (category === "temporary" || category === "timeout") return "temporary";
  if (category === "authentication" || category === "permanent" || category === "validation") return "permanent";
  return "unknown";
}

function safeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.length < 300) return error.message;
  return "Graph再取得に失敗しました";
}

export async function runRetryMailBatch(
  prisma: PrismaClient,
  graphClient: Pick<GraphMailClient, "fetchMessage">,
  options: { concurrency?: number; mailboxId?: string } = {},
): Promise<RetryMailBatchResult> {
  const candidates = (await findRetryCandidates(prisma, options.mailboxId)).filter(isEligibleForNextBatchRetry);
  const items: RetryMailItemResult[] = [];
  for (const candidate of candidates) {
    if (!candidate.mailboxId) {
      const errorType = "permanent" as const;
      await recordRetryFailure(prisma, candidate, errorType, "再試行対象のメールボックス情報がありません");
      items.push({ candidate, status: "failed", retryCount: candidate.retryCount, errorType });
      continue;
    }
    let email: CommonEmail;
    try {
      const result = await graphClient.fetchMessage(candidate.mailboxId, candidate.graphMessageId);
      if (result.kind === "removed") throw new Error("Graphメールは削除済みです");
      email = result.email;
    } catch (error) {
      const errorType = graphErrorType(error);
      const message = safeErrorMessage(error);
      await recordRetryFailure(prisma, candidate, errorType, message);
      items.push({ candidate, status: "failed", retryCount: errorType === "temporary" ? candidate.retryCount + 1 : candidate.retryCount, errorType, error: message });
      continue;
    }
    try {
      const batch: MailBatchResult = await runMailBatch(async () => [email], undefined, options.concurrency ?? 1);
      const persistence = await persistMailBatch(prisma, [email], batch, { isBatchRetry: true });
      const item = batch.items[0];
      const dbFailed = persistence.dbSaveFailureCount > 0 || persistence.persistedProcessingCount !== 1;
      const failed = !item?.success || dbFailed;
      const retryItem: RetryMailItemResult = { candidate, status: failed ? "failed" : "succeeded", retryCount: candidate.retryCount + 1 };
      if (item?.errorCategory !== undefined) retryItem.errorType = item.errorCategory;
      if (item?.error !== undefined) retryItem.error = item.error;
      if (dbFailed) { retryItem.errorType = "unknown"; retryItem.error = "DB保存に失敗しました"; }
      items.push(retryItem);
    } catch (error) {
      const message = safeErrorMessage(error);
      await recordRetryFailure(prisma, candidate, "unknown", message);
      items.push({ candidate, status: "failed", retryCount: candidate.retryCount, errorType: "unknown", error: message });
    }
  }
  return { totalCount: items.length, successCount: items.filter((item) => item.status === "succeeded").length, failureCount: items.filter((item) => item.status === "failed").length, items };
}
