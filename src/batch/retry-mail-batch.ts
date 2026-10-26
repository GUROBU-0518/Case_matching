import type { PrismaClient } from "@prisma/client";
import { findRetryCandidates, isEligibleForNextBatchRetry, persistMailBatch, persistAiExtractionForEmail, recordAiProcessingFailure, recordRetryFailure, type RetryCandidate } from "../db/mail-repository.ts";
import type { GraphMailClient, GraphClientError } from "../mail/graph-client.ts";
import { runMailBatch, MailProcessingError, type MailBatchResult, type MailPreprocessor } from "./mail-batch.ts";
import type { CommonEmail } from "../mail/types.ts";
import type { OpenAiClassifier } from "../ai/openai-client.ts";
import type { AiUsageBudget } from "../ai/usage-budget.ts";

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
  options: { concurrency?: number; mailboxId?: string; classifier?: OpenAiClassifier; subjectPrefix?: string; aiBudget?: AiUsageBudget } = {},
): Promise<RetryMailBatchResult> {
  const candidates = (await findRetryCandidates(prisma, options.mailboxId)).filter(isEligibleForNextBatchRetry).filter((candidate) => !options.subjectPrefix || candidate.subject?.startsWith(options.subjectPrefix));
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
    const aiResults = new Map<string, Awaited<ReturnType<OpenAiClassifier["classifyAndExtract"]>>>();
    const processor = options.classifier ? async (current: CommonEmail, preprocess: MailPreprocessor) => {
      const processed = await preprocess(current.body);
      try { if (options.aiBudget && !options.aiBudget.tryConsume()) throw new MailProcessingError("AI呼び出し上限に達しました", { category: "temporary", code: "AI_LIMIT", retryable: false }); const response = await options.classifier!.classifyAndExtract({ subject: current.subject, processedBody: processed.processedBody }); aiResults.set(current.messageId, response); return processed; }
      catch (cause) {
        const ai = cause as { category?: string; status?: number; retryable?: boolean };
        const category = ai.category === "rate_limit" || ai.category === "timeout" || ai.category === "temporary" ? "temporary" : ai.category === "authentication" || ai.category === "validation" ? "permanent" : "unknown";
        const code = typeof ai.status === "number" ? `HTTP_${ai.status}` : ai.category;
        throw new MailProcessingError("AI処理に失敗しました", { category, ...(code ? { code } : {}), retryable: ai.retryable === true && category === "temporary" });
      }
    } : undefined;
    try {
      const batch: MailBatchResult = await runMailBatch(async () => [email], undefined, options.concurrency ?? 1, {}, processor);
      const persistence = await persistMailBatch(prisma, [email], batch, { isBatchRetry: true, ...(options.classifier ? { deferProcessingStatus: true } : {}) });
      const item = batch.items[0];
      let dbFailed = persistence.dbSaveFailureCount > 0 || persistence.persistedProcessingCount !== 1;
      if (!dbFailed && item?.success && options.classifier) {
        const response = aiResults.get(email.messageId);
        if (response) {
          try { await persistAiExtractionForEmail(prisma, email.mailboxId, email.messageId, response, item.processedBody ?? ""); }
          catch { dbFailed = true; await recordAiProcessingFailure(prisma, email.messageId, "db", "AI抽出結果の保存に失敗しました"); }
        }
      }
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
