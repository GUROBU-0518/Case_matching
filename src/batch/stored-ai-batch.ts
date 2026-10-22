import type { PrismaClient } from "@prisma/client";
import type { OpenAiClassifier } from "../ai/openai-client.ts";
import type { AiUsageBudget } from "../ai/usage-budget.ts";
import { claimStoredAiProcessing, persistAiExtraction, recordAiProcessingFailure } from "../db/mail-repository.ts";

export interface StoredAiBatchResult { totalCount: number; successCount: number; failureCount: number; deferredCount: number; }

export async function runStoredAiPendingBatch(prisma: PrismaClient, classifier: OpenAiClassifier, options: { mailboxId?: string; budget: AiUsageBudget; limit?: number } ): Promise<StoredAiBatchResult> {
  const candidates = await prisma.mailMessage.findMany({
    where: { ...(options.mailboxId ? { mailboxId: options.mailboxId } : {}), processedBody: { not: null }, aiProcessing: { is: { aiStatus: null } } },
    select: { id: true, subject: true, processedBody: true, aiProcessing: { select: { retryCount: true } } },
    orderBy: { receivedAt: "asc" }, take: options.limit ?? 100,
  });
  let successCount = 0; let failureCount = 0; let deferredCount = 0;
  for (const candidate of candidates) {
    if (!candidate.processedBody?.trim() || candidate.aiProcessing?.retryCount !== 0) continue;
    if (!options.budget.tryConsume()) { deferredCount += 1; continue; }
    const claimed = await claimStoredAiProcessing(prisma, candidate.id, new Date(Date.now() - 15 * 60 * 1000));
    if (!claimed) continue;
    try {
      const response = await classifier.classifyAndExtract({ subject: candidate.subject ?? "", processedBody: candidate.processedBody });
      await persistAiExtraction(prisma, candidate.id, response, candidate.processedBody);
      successCount += 1;
    } catch (error) {
      const value = error as { category?: string; diagnosticCode?: string };
      const temporary = value.category === "rate_limit" || value.category === "timeout" || value.category === "temporary";
      await recordAiProcessingFailure(prisma, candidate.id, temporary ? "temporary" : value.diagnosticCode ?? value.category ?? "unknown", "保存済みメールAI処理に失敗しました");
      failureCount += 1;
    }
  }
  return { totalCount: candidates.length, successCount, failureCount, deferredCount };
}
