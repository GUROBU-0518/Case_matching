import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import type { CommonEmail } from "../mail/types.ts";
import type { MailBatchResult, MailItemResult } from "../batch/mail-batch.ts";

export interface RetryCandidate { id: string; mailMessageId: string | null; mailboxId: string | null; graphMessageId: string; status: string; errorType: string | null; retryCount: number; }
export interface PersistBatchSummary { persistedMailCount: number; skippedProcessedCount: number; persistedProcessingCount: number; dbSaveFailureCount: number; batchRunId?: string; batchRunSaved: boolean; }

function mailData(email: CommonEmail): Prisma.MailMessageCreateInput {
  return {
    id: randomUUID(), graphMessageId: email.messageId, mailboxId: email.mailboxId,
    subject: email.subject, senderAddress: email.sender, receivedAt: email.receivedAt,
    fetchedAt: new Date(), sourceInfo: "local-mail-batch",
  };
}

export interface PersistMailOptions { isBatchRetry?: boolean }

export async function persistMailResult(prisma: PrismaClient, email: CommonEmail, result: MailItemResult, options: PersistMailOptions = {}): Promise<{ skipped: boolean }> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.mailMessage.findUnique({ where: { mailboxId_graphMessageId: { mailboxId: email.mailboxId, graphMessageId: email.messageId } }, include: { aiProcessing: true } });
    if (existing?.aiProcessing?.status === "succeeded") return { skipped: true };
    const mail = existing ?? await tx.mailMessage.create({ data: mailData(email) });
    const retryCount = options.isBatchRetry ? (existing?.aiProcessing?.retryCount ?? 0) + 1 : 0;
    const processingData = {
      status: result.status,
      startedAt: new Date(), endedAt: new Date(),
      errorType: result.errorCategory ?? null,
      errorMessage: result.error ?? null,
      retryCount,
      lastRetriedAt: options.isBatchRetry ? new Date() : existing?.aiProcessing?.lastRetriedAt ?? null,
      zodValidationStatus: result.success ? "succeeded" : "failed",
      graphMessageId: email.messageId,
    };
    await tx.aiProcessing.upsert({
      where: { mailMessageId: mail.id },
      create: { id: randomUUID(), mailMessageId: mail.id, ...processingData },
      update: processingData,
    });
    return { skipped: false };
  });
}

export async function persistMailBatch(prisma: PrismaClient, emails: CommonEmail[], result: MailBatchResult, options: PersistMailOptions = {}): Promise<PersistBatchSummary> {
  if (emails.length !== result.items.length) throw new Error("メールと処理結果の件数が一致しません");
  let persistedMailCount = 0;
  let skippedProcessedCount = 0;
  let persistedProcessingCount = 0;
  let dbSaveFailureCount = 0;
  for (const [index, email] of emails.entries()) {
    const item = result.items[index];
    if (!item) throw new Error(`処理結果がありません: ${email.messageId}`);
    let saved: { skipped: boolean };
    try { saved = await persistMailResult(prisma, email, item, options); } catch { dbSaveFailureCount += 1; continue; }
    if (saved.skipped) skippedProcessedCount += 1;
    else { persistedMailCount += 1; persistedProcessingCount += 1; }
  }
  const batchRun = await prisma.batchRun.create({ data: {
    id: randomUUID(), startedAt: result.startedAt, endedAt: result.endedAt, status: result.status,
    targetMailboxCount: new Set(emails.map((email) => email.mailboxId)).size,
    targetCount: result.totalCount, successCount: result.successCount, failureCount: result.failureCount,
    errorMessage: dbSaveFailureCount > 0 ? "DB保存に失敗したメールがあります" : result.failureCount > 0 ? "一部メールの処理に失敗しました" : null,
  } });
  return { persistedMailCount, skippedProcessedCount, persistedProcessingCount, dbSaveFailureCount, batchRunId: batchRun.id, batchRunSaved: true };
}

export async function findRetryCandidates(prisma: PrismaClient, mailboxId?: string): Promise<RetryCandidate[]> {
  const rows = await prisma.aiProcessing.findMany({
    where: { status: "failed", errorType: "temporary", mailMessageId: { not: null }, ...(mailboxId ? { mailMessage: { mailboxId } } : {}) },
    select: { id: true, mailMessageId: true, graphMessageId: true, status: true, errorType: true, retryCount: true, mailMessage: { select: { mailboxId: true } } },
  });
  return rows.map((row) => ({ ...row, mailboxId: row.mailMessage?.mailboxId ?? null }));
}

export function isEligibleForNextBatchRetry(processing: { status: string; errorType: string | null; retryCount: number }): boolean {
  return processing.status === "failed" && processing.errorType === "temporary" && processing.retryCount < 3;
}

export async function recordRetryFailure(prisma: PrismaClient, candidate: RetryCandidate, errorType: "temporary" | "permanent" | "unknown", message: string): Promise<void> {
  await prisma.aiProcessing.update({
    where: { id: candidate.id },
    data: {
      status: "failed",
      errorType,
      errorMessage: message,
      retryCount: errorType === "temporary" ? candidate.retryCount + 1 : candidate.retryCount,
      lastRetriedAt: errorType === "temporary" ? new Date() : null,
      endedAt: new Date(),
    },
  });
}
