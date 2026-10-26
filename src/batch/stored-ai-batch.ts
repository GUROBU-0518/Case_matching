import type { PrismaClient } from "@prisma/client";
import type { OpenAiClassifier } from "../ai/openai-client.ts";
import type { AiUsageBudget } from "../ai/usage-budget.ts";
import { claimStoredAiProcessing, persistAiExtraction, recordAiProcessingFailure } from "../db/mail-repository.ts";
import { saveProcessedBodyIfMissing } from "../db/mail-repository.ts";
import { preprocessMailBody } from "../mail/preprocess.ts";
import type { GraphMailClient } from "../mail/graph-client.ts";
import { formatSafeAiFailureDiagnostic, toSafeAiFailureDiagnostic } from "../ai/failure-diagnostic.ts";

export interface StoredAiBatchResult { totalCount: number; successCount: number; failureCount: number; deferredCount: number; bodyRefetchCandidates: number; bodyRefetchSuccessCount: number; bodyRefetchFailureCount: number; }

export async function runStoredAiPendingBatch(prisma: PrismaClient, classifier: OpenAiClassifier, options: { mailboxId?: string; budget: AiUsageBudget; limit?: number; graphClient?: Pick<GraphMailClient, "fetchMessage"> } ): Promise<StoredAiBatchResult> {
  const candidates = await prisma.mailMessage.findMany({
    where: { ...(options.mailboxId ? { mailboxId: options.mailboxId } : {}), aiProcessing: { is: { aiStatus: null } } },
    select: { id: true, mailboxId: true, graphMessageId: true, subject: true, processedBody: true, aiProcessing: { select: { retryCount: true } } },
    orderBy: { receivedAt: "asc" }, take: options.limit ?? 100,
  });
  let successCount = 0; let failureCount = 0; let deferredCount = 0; let bodyRefetchCandidates = 0; let bodyRefetchSuccessCount = 0; let bodyRefetchFailureCount = 0;
  for (const candidate of candidates) {
    if (candidate.aiProcessing?.retryCount !== 0) continue;
    if (options.budget.count >= options.budget.limit) { deferredCount += 1; continue; }
    const claimed = await claimStoredAiProcessing(prisma, candidate.id, new Date(Date.now() - 15 * 60 * 1000));
    if (!claimed) continue;
    let processedBody = candidate.processedBody;
    if (!processedBody?.trim()) {
      bodyRefetchCandidates += 1;
      if (!options.graphClient) {
        await recordAiProcessingFailure(prisma, candidate.id, "temporary", formatSafeAiFailureDiagnostic({ stage: "graph_refetch", diagnosticCode: "graph_client_missing", fields: [], retryable: true }));
        bodyRefetchFailureCount += 1;
        failureCount += 1;
        continue;
      }
      try {
        const result = await options.graphClient.fetchMessage(candidate.mailboxId, candidate.graphMessageId);
        if (result.kind !== "message") throw new Error("Graphメールを取得できません");
        processedBody = preprocessMailBody(result.email.body, result.contentType).processedBody;
        if (!processedBody.trim() || !(await saveProcessedBodyIfMissing(prisma, candidate.id, processedBody))) throw new Error("前処理済み本文を保存できません");
        bodyRefetchSuccessCount += 1;
      } catch (error) {
        bodyRefetchFailureCount += 1;
        const value = error as { category?: string };
        const temporary = value.category !== "authentication" && value.category !== "validation";
        const diagnostic = toSafeAiFailureDiagnostic(error, "graph_refetch");
        await recordAiProcessingFailure(prisma, candidate.id, temporary ? "temporary" : "permanent", formatSafeAiFailureDiagnostic({ ...diagnostic, stage: "graph_refetch" }));
        failureCount += 1;
        continue;
      }
    }
    if (!options.budget.tryConsume()) { deferredCount += 1; continue; }
    try {
      const response = await classifier.classifyAndExtract({ subject: candidate.subject ?? "", processedBody });
      await persistAiExtraction(prisma, candidate.id, response, processedBody);
      successCount += 1;
    } catch (error) {
      const value = error as { category?: string; diagnosticCode?: string };
      const temporary = value.category === "rate_limit" || value.category === "timeout" || value.category === "temporary";
      const diagnostic = toSafeAiFailureDiagnostic(error, "openai_request");
      await recordAiProcessingFailure(prisma, candidate.id, temporary ? "temporary" : "permanent", formatSafeAiFailureDiagnostic(diagnostic));
      failureCount += 1;
    }
  }
  return { totalCount: candidates.length, successCount, failureCount, deferredCount, bodyRefetchCandidates, bodyRefetchSuccessCount, bodyRefetchFailureCount };
}
