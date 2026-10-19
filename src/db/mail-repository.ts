import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import type { CommonEmail } from "../mail/types.ts";
import type { MailBatchResult, MailItemResult } from "../batch/mail-batch.ts";

export interface RetryCandidate { id: string; mailMessageId: string | null; graphMessageId: string; status: string; errorType: string | null; retryCount: number; }
export interface PersistBatchSummary { persistedMailCount: number; skippedProcessedCount: number; persistedProcessingCount: number; dbSaveFailureCount: number; batchRunId?: string; batchRunSaved: boolean; }

function mailData(email: CommonEmail): Prisma.MailMessageCreateInput {
  return {
    id: randomUUID(), graphMessageId: email.messageId, mailboxId: email.mailboxId,
    subject: email.subject, senderAddress: email.sender, receivedAt: email.receivedAt,
    fetchedAt: new Date(), sourceInfo: "local-mail-batch",
  };
}

export async function persistMailResult(prisma: PrismaClient, email: CommonEmail, result: MailItemResult): Promise<{ skipped: boolean }> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.mailMessage.findUnique({ where: { mailboxId_graphMessageId: { mailboxId: email.mailboxId, graphMessageId: email.messageId } }, include: { aiProcessing: true } });
    if (existing?.aiProcessing?.status === "succeeded") return { skipped: true };
    const mail = existing ?? await tx.mailMessage.create({ data: mailData(email) });
    const processingData = {
      status: result.status,
      startedAt: new Date(), endedAt: new Date(),
      errorType: result.errorCategory ?? null,
      errorMessage: result.error ?? null,
      retryCount: result.retryCount,
      lastRetriedAt: result.retryCount > 0 ? new Date() : null,
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

export async function persistMailBatch(prisma: PrismaClient, emails: CommonEmail[], result: MailBatchResult): Promise<PersistBatchSummary> {
  if (emails.length !== result.items.length) throw new Error("メールと処理結果の件数が一致しません");
  let persistedMailCount = 0;
  let skippedProcessedCount = 0;
  let persistedProcessingCount = 0;
  let dbSaveFailureCount = 0;
  for (const [index, email] of emails.entries()) {
    const item = result.items[index];
    if (!item) throw new Error(`処理結果がありません: ${email.messageId}`);
    let saved: { skipped: boolean };
    try { saved = await persistMailResult(prisma, email, item); } catch { dbSaveFailureCount += 1; continue; }
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

export async function findRetryCandidates(prisma: PrismaClient): Promise<RetryCandidate[]> {
  const rows = await prisma.aiProcessing.findMany({
    where: { status: "failed", errorType: "temporary", mailMessageId: { not: null } },
    select: { id: true, mailMessageId: true, graphMessageId: true, status: true, errorType: true, retryCount: true },
  });
  return rows;
}

export function isEligibleForNextBatchRetry(processing: { status: string; errorType: string | null; retryCount: number }): boolean {
  return processing.status === "failed" && processing.errorType === "temporary" && processing.retryCount < 3;
}
