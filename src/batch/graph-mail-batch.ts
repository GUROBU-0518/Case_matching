import type { CommonEmail } from "../mail/types.ts";
import type { GraphDeltaClient, DeltaResult } from "../mail/graph-delta.ts";
import { runMailBatch, MailProcessingError, type MailBatchResult, type MailPreprocessor, type RetryOptions } from "./mail-batch.ts";
import type { PrismaClient } from "@prisma/client";
import { persistMailBatch, persistAiExtractionForEmail, recordAiProcessingFailure, type PersistBatchSummary } from "../db/mail-repository.ts";
import type { OpenAiClassifier } from "../ai/openai-client.ts";
import type { AiUsageBudget } from "../ai/usage-budget.ts";

export type DeltaSource = () => Promise<DeltaResult>;

/** DeltaのnewだけをT04へ渡すメールソース。changed/removedは意図的に除外する。 */
export async function loadNewGraphEmails(source: DeltaSource): Promise<CommonEmail[]> {
  const result = await source();
  return result.newMessages.filter((message) => message.kind === "message").map((message) => message.email);
}

export interface GraphMailBatchOptions { preprocess?: MailPreprocessor; concurrency?: number; retry?: RetryOptions; classifier?: OpenAiClassifier; subjectPrefix?: string; aiBudget?: AiUsageBudget; }

/** 1メールボックス単位でDelta取得結果を既存T04バッチへ接続する。 */
export async function runGraphMailBatch(client: GraphDeltaClient, mailboxId: string, top = 3, options: GraphMailBatchOptions = {}): Promise<MailBatchResult> {
  const processor = options.classifier ? async (email: CommonEmail, preprocess: MailPreprocessor) => {
    const processed = await preprocess(email.body, email.contentType);
    try { await options.classifier!.classifyAndExtract({ subject: email.subject, processedBody: processed.processedBody }); return processed; }
    catch (error) {
      const ai = error as { category?: string; status?: number; retryable?: boolean };
      const category = ai.category === "rate_limit" || ai.category === "timeout" || ai.category === "temporary" ? "temporary" : ai.category === "authentication" || ai.category === "validation" ? "permanent" : "unknown";
      const code = typeof ai.status === "number" ? `HTTP_${ai.status}` : ai.category;
      throw new MailProcessingError("AI処理に失敗しました", { category, ...(code ? { code } : {}), retryable: ai.retryable === true && category === "temporary" });
    }
  } : undefined;
  return runMailBatch(() => loadNewGraphEmails(() => client.fetchDelta(mailboxId, top)), options.preprocess, options.concurrency ?? 3, options.retry, processor);
}

export interface GraphMailBatchPersistenceResult {
  batch: MailBatchResult;
  persistence: PersistBatchSummary | undefined;
  deltaLinkSaved: boolean;
  safeHandoff: boolean;
  aiSkippedSucceeded: number;
  aiSkippedPermanent: number;
  aiSkippedTemporary: number;
  metrics?: {
    deltaStartedAt: Date;
    deltaEndedAt: Date;
    deltaDurationMs: number;
    pagesFetched: number;
    deltaMessageCount: number;
    mailPersistenceDurationMs: number;
    extractionPersistenceDurationMs: number;
    aiTimings: Array<{ number: number; durationMs: number; success: boolean }>;
  };
}

/** Graph取得、T04処理、DB引き渡し、deltaLink確定を順序保証付きで実行する。 */
export async function runGraphMailBatchWithPersistence(client: GraphDeltaClient, prisma: PrismaClient, mailboxId: string, top = 3, options: GraphMailBatchOptions = {}): Promise<GraphMailBatchPersistenceResult> {
  const deltaStartedAt = new Date();
  const delta = await client.fetchDelta(mailboxId, top);
  const deltaEndedAt = new Date();
  const emails = delta.newMessages.filter((message) => message.kind === "message").map((message) => message.email).filter((email) => !options.subjectPrefix || email.subject.startsWith(options.subjectPrefix));
  const existing = typeof prisma.mailMessage.findMany === "function"
    ? await prisma.mailMessage.findMany({ where: { mailboxId, graphMessageId: { in: emails.map((email) => email.messageId) } }, select: { graphMessageId: true, aiProcessing: { select: { aiStatus: true, status: true, errorType: true, retryCount: true } } } })
    : [];
  const existingByGraphId = new Map(existing.map((row) => [row.graphMessageId, row.aiProcessing]));
  let aiSkippedSucceeded = 0;
  let aiSkippedPermanent = 0;
  let aiSkippedTemporary = 0;
  const aiEmails = options.classifier ? emails.filter((email) => {
    const state = existingByGraphId.get(email.messageId);
    if (!state) return true;
    if (state.aiStatus === "succeeded") { aiSkippedSucceeded += 1; return false; }
    if (state.aiStatus === "failed_permanent") { aiSkippedPermanent += 1; return false; }
    if (state.aiStatus === "failed_temporary" || (state.errorType === "temporary" && state.status === "failed")) { aiSkippedTemporary += 1; return false; }
    if (state.aiStatus === "processing") { aiSkippedTemporary += 1; return false; }
    return true;
  }) : emails;
  const aiResults = new Map<string, Awaited<ReturnType<OpenAiClassifier["classifyAndExtract"]>>>();
  const aiTimings: Array<{ number: number; durationMs: number; success: boolean }> = [];
  const processor = options.classifier ? async (email: CommonEmail, preprocess: MailPreprocessor) => {
    const processed = await preprocess(email.body, email.contentType);
    try {
      if (options.aiBudget && !options.aiBudget.tryConsume()) throw new MailProcessingError("AI呼び出し上限に達しました", { category: "temporary", code: "AI_LIMIT", retryable: false });
      const aiStartedAt = Date.now();
      let aiSucceeded = false;
      try {
        const response = await options.classifier!.classifyAndExtract({ subject: email.subject, processedBody: processed.processedBody });
        aiResults.set(email.messageId, response);
        aiSucceeded = true;
        return processed;
      } finally {
        aiTimings.push({ number: aiTimings.length + 1, durationMs: Date.now() - aiStartedAt, success: aiSucceeded });
      }
    } catch (error) {
      const ai = error as { category?: string; status?: number; retryable?: boolean; message?: string };
      const category = ai.category === "rate_limit" || ai.category === "timeout" || ai.category === "temporary" ? "temporary" : ai.category === "authentication" || ai.category === "validation" ? "permanent" : "unknown";
      const code = typeof ai.status === "number" ? `HTTP_${ai.status}` : ai.category;
      throw new MailProcessingError("AI処理に失敗しました", { category, ...(code ? { code } : {}), retryable: ai.retryable === true && category === "temporary" });
    }
  } : undefined;
  const batch = await runMailBatch(async () => aiEmails, options.preprocess, options.concurrency ?? 3, options.retry, processor);
  let persistence: PersistBatchSummary;
  const mailPersistenceStartedAt = Date.now();
  try { persistence = await persistMailBatch(prisma, aiEmails, batch, options.classifier ? { deferProcessingStatus: true } : {}); } catch { return { batch, persistence: undefined, deltaLinkSaved: false, safeHandoff: false, aiSkippedSucceeded, aiSkippedPermanent, aiSkippedTemporary }; }
  const mailPersistenceDurationMs = Date.now() - mailPersistenceStartedAt;
  const extractionPersistenceStartedAt = Date.now();
  if (options.classifier) {
    for (const item of batch.items) {
      if (!item.success) continue;
      const response = aiResults.get(item.messageId);
      if (!response) continue;
      try { await persistAiExtractionForEmail(prisma, item.mailboxId, item.messageId, response, item.processedBody ?? ""); }
      catch { persistence.dbSaveFailureCount += 1; try { await recordAiProcessingFailure(prisma, item.messageId, "db", "AI抽出結果の保存に失敗しました"); } catch { /* 既存の保存失敗を隠さない */ } }
    }
  }
  const extractionPersistenceDurationMs = Date.now() - extractionPersistenceStartedAt;
  const safelyHandled = persistence.persistedProcessingCount + persistence.skippedProcessedCount + aiSkippedSucceeded + aiSkippedPermanent + aiSkippedTemporary;
  const safeHandoff = persistence.dbSaveFailureCount === 0 && safelyHandled === emails.length;
  const metrics = { deltaStartedAt, deltaEndedAt, deltaDurationMs: deltaEndedAt.getTime() - deltaStartedAt.getTime(), pagesFetched: delta.pagesFetched, deltaMessageCount: delta.changes.length, mailPersistenceDurationMs, extractionPersistenceDurationMs, aiTimings };
  if (!safeHandoff) return { batch, persistence, deltaLinkSaved: false, safeHandoff, aiSkippedSucceeded, aiSkippedPermanent, aiSkippedTemporary, metrics };
  if (options.subjectPrefix) return { batch, persistence, deltaLinkSaved: false, safeHandoff, aiSkippedSucceeded, aiSkippedPermanent, aiSkippedTemporary, metrics };
  try { await client.commitDeltaLink(mailboxId, delta.deltaLink); return { batch, persistence, deltaLinkSaved: true, safeHandoff, aiSkippedSucceeded, aiSkippedPermanent, aiSkippedTemporary, metrics }; }
  catch { return { batch, persistence, deltaLinkSaved: false, safeHandoff, aiSkippedSucceeded, aiSkippedPermanent, aiSkippedTemporary, metrics }; }
}
