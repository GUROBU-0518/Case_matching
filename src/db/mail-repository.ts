import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import type { CommonEmail } from "../mail/types.ts";
import type { MailBatchResult, MailItemResult } from "../batch/mail-batch.ts";
import type { AiResponse } from "../ai/types.ts";

export interface RetryCandidate { id: string; mailMessageId: string | null; mailboxId: string | null; graphMessageId: string; subject: string | null; status: string; errorType: string | null; retryCount: number; }
export interface PersistBatchSummary { persistedMailCount: number; skippedProcessedCount: number; persistedProcessingCount: number; dbSaveFailureCount: number; batchRunId?: string; batchRunSaved: boolean; }

function mailData(email: CommonEmail): Prisma.MailMessageCreateInput {
  return {
    id: randomUUID(), graphMessageId: email.messageId, mailboxId: email.mailboxId,
    subject: email.subject, senderAddress: email.sender, receivedAt: email.receivedAt,
    fetchedAt: new Date(), sourceInfo: "local-mail-batch",
  };
}

export interface PersistMailOptions { isBatchRetry?: boolean; deferProcessingStatus?: boolean; markAiPending?: boolean }

export async function persistMailResult(prisma: PrismaClient, email: CommonEmail, result: MailItemResult, options: PersistMailOptions = {}): Promise<{ skipped: boolean }> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.mailMessage.findUnique({ where: { mailboxId_graphMessageId: { mailboxId: email.mailboxId, graphMessageId: email.messageId } }, include: { aiProcessing: true } });
    if (existing?.aiProcessing?.status === "succeeded") return { skipped: true };
    const mail = existing ?? await tx.mailMessage.create({ data: mailData(email) });
    if (result.success && result.processedBody !== undefined && !existing?.processedBody) await tx.mailMessage.update({ where: { id: mail.id }, data: { processedBody: result.processedBody } });
    const retryCount = options.isBatchRetry ? (existing?.aiProcessing?.retryCount ?? 0) + 1 : 0;
    const processingData = {
      status: (options.deferProcessingStatus || options.markAiPending) && result.success ? "pending" : result.status,
      startedAt: new Date(), endedAt: new Date(),
      errorType: result.errorCategory ?? null,
      errorMessage: result.error ?? null,
      retryCount,
      lastRetriedAt: options.isBatchRetry ? new Date() : existing?.aiProcessing?.lastRetriedAt ?? null,
      zodValidationStatus: result.success ? "succeeded" : "failed",
      graphMessageId: email.messageId,
      ...(options.deferProcessingStatus ? { aiStatus: result.success ? "processing" : result.errorCategory === "temporary" ? "failed_temporary" : "failed_permanent" } : {}),
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
    select: { id: true, mailMessageId: true, graphMessageId: true, status: true, errorType: true, retryCount: true, mailMessage: { select: { mailboxId: true, subject: true } } },
  });
  return rows.map((row) => ({ ...row, subject: row.mailMessage?.subject ?? null, mailboxId: row.mailMessage?.mailboxId ?? null }));
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

function parseHeadcount(value: string | null): number | null {
  if (!value || !/^\s*\d+\s*(?:名)?\s*$/.test(value)) return null;
  const parsed = Number(value.replace(/名/g, "").trim());
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export interface PersistAiExtractionResult { skipped: boolean; projectCount: number; talentCount: number; }

export async function recordAiProcessingFailure(prisma: PrismaClient, mailMessageId: string, errorType: string, errorMessage: string): Promise<void> {
  await prisma.aiProcessing.update({ where: { mailMessageId }, data: { status: "failed", aiStatus: errorType === "temporary" ? "failed_temporary" : "failed_permanent", errorType, errorMessage, zodValidationStatus: "failed", endedAt: new Date() } });
}

export async function persistAiExtraction(prisma: PrismaClient, mailMessageId: string, response: AiResponse, sourceText: string): Promise<PersistAiExtractionResult> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.aiProcessing.findUnique({ where: { mailMessageId } });
    if (existing?.aiStatus === "succeeded") return { skipped: true, projectCount: 0, talentCount: 0 };
    const projects = response.projects.map((project) => ({ id: randomUUID(), projectName: project.projectName, summary: project.summary, rate: project.price, location: project.location, nearestStation: project.nearestStation, workStyle: project.workStyle, startDate: project.startDate, requiredSkills: project.requiredSkills ?? [], preferredSkills: project.preferredSkills ?? [], headcount: parseHeadcount(project.headcount), process: project.phase, commercialRestrictions: project.commercialFlowRestriction, sourceText, mailMessageId }));
    const talents = response.talents.map((talent) => ({ id: randomUUID(), nameOrInitial: talent.name, desiredRate: talent.desiredPrice, nearestStation: talent.nearestStation, technicalSkills: talent.skills ?? [], availableFrom: talent.availableFrom, availablePeriod: talent.availablePeriod, age: talent.age, yearsOfExperience: talent.yearsOfExperience, desiredWorkStyle: talent.desiredWorkStyle, availableProcess: talent.availablePhases ?? [], affiliation: "BP", affiliationType: talent.affiliationType, notes: talent.notes, sourceText, mailMessageId }));
    if (projects.length > 0) await tx.project.createMany({ data: projects });
    if (talents.length > 0) await tx.talent.createMany({ data: talents });
    await tx.aiProcessing.update({ where: { mailMessageId }, data: { status: "succeeded", aiStatus: "succeeded", classification: response.classification, errorType: null, errorMessage: null, zodValidationStatus: "succeeded", endedAt: new Date() } });
    return { skipped: false, projectCount: projects.length, talentCount: talents.length };
  }, { isolationLevel: "Serializable" });
}

export async function persistAiExtractionForEmail(prisma: PrismaClient, mailboxId: string, graphMessageId: string, response: AiResponse, sourceText: string): Promise<PersistAiExtractionResult> {
  const mail = await prisma.mailMessage.findUnique({ where: { mailboxId_graphMessageId: { mailboxId, graphMessageId } }, select: { id: true } });
  if (!mail) throw new Error("MailMessageが見つかりません");
  return persistAiExtraction(prisma, mail.id, response, sourceText);
}

/** 保存済みAI処理の実行権を原子的に取得する。 */
export async function claimStoredAiProcessing(prisma: PrismaClient, mailMessageId: string, staleBefore: Date): Promise<boolean> {
  const current = await prisma.aiProcessing.findUnique({ where: { mailMessageId }, select: { aiStatus: true, retryCount: true, updatedAt: true } });
  if (!current || current.aiStatus === "succeeded" || current.retryCount >= 3) return false;
  const staleProcessing = current.aiStatus === "processing" && current.updatedAt < staleBefore;
  const claimable = current.aiStatus == null || current.aiStatus === "failed_temporary" || staleProcessing;
  if (!claimable) return false;
  const result = await prisma.aiProcessing.updateMany({
    where: {
      mailMessageId,
      retryCount: { lt: 3 },
      OR: [
        { aiStatus: null },
        { aiStatus: "failed_temporary" },
        { aiStatus: "processing", updatedAt: { lt: staleBefore } },
      ],
    },
    data: { aiStatus: "processing", status: "pending", ...(current.aiStatus === null ? {} : { retryCount: { increment: 1 }, lastRetriedAt: new Date() }) },
  });
  return result.count === 1;
}

export async function restoreAiPendingForExactMails(prisma: PrismaClient, targets: Array<{ id: string; subject: string }>): Promise<number> {
  return prisma.$transaction(async (tx) => {
    if (targets.length !== 2) throw new Error("復旧対象は2件に限定してください");
    let updated = 0;
    for (const target of targets) {
      const result = await tx.aiProcessing.updateMany({ where: { mailMessageId: target.id, aiStatus: "processing", status: "pending", retryCount: 0, mailMessage: { subject: target.subject } }, data: { aiStatus: null } });
      if (result.count !== 1) throw new Error("復旧条件に一致しない対象があります");
      updated += result.count;
    }
    return updated;
  }, { isolationLevel: "Serializable" });
}

export async function restoreAiPendingForExactMail(prisma: PrismaClient, target: { id: string; subject: string }): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const result = await tx.aiProcessing.updateMany({
      where: { mailMessageId: target.id, aiStatus: "processing", status: "pending", retryCount: 0, mailMessage: { subject: target.subject, processedBody: { not: null } } },
      data: { aiStatus: null },
    });
    if (result.count !== 1) throw new Error("復旧条件に一致しないため更新しません");
    return result.count;
  }, { isolationLevel: "Serializable" });
}

export async function restoreAiFailedPermanentForExactMail(prisma: PrismaClient, target: { id: string; subject: string }): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const message = await tx.mailMessage.findUnique({ where: { id: target.id }, select: { subject: true, processedBody: true, _count: { select: { projects: true, talents: true } }, aiProcessing: { select: { aiStatus: true, status: true, retryCount: true } } } });
    if (!message || message.subject !== target.subject || message.processedBody == null || message._count.projects !== 0 || message._count.talents !== 0 || message.aiProcessing?.aiStatus !== "failed_permanent" || message.aiProcessing.status !== "failed" || message.aiProcessing.retryCount !== 0) throw new Error("復旧条件に一致しないため更新しません");
    const result = await tx.aiProcessing.updateMany({ where: { mailMessageId: target.id, aiStatus: "failed_permanent", status: "failed", retryCount: 0 }, data: { aiStatus: null, status: "pending", startedAt: null, endedAt: null } });
    if (result.count !== 1) throw new Error("復旧対象の更新件数が1件ではありません");
    return result.count;
  }, { isolationLevel: "Serializable" });
}
