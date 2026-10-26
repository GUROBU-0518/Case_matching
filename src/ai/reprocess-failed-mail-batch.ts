import type { FailedMailReprocessResult, FailedMailReprocessRecord } from "./reprocess-failed-mail.ts";
import { reprocessFailedMail } from "./reprocess-failed-mail.ts";

export interface FailedMailReprocessBatchResult {
  totalCount: number;
  successCount: number;
  failureCount: number;
  apiCallCount: number;
  projectCount: number;
  talentCount: number;
  diagnosticCodes: Record<string, number>;
}

/** Processes a discovered set sequentially; each message gets its own guarded claim and persistence transaction. */
export async function reprocessFailedMailBatch(
  records: FailedMailReprocessRecord[],
  dependencies: Parameters<typeof reprocessFailedMail>[1],
): Promise<FailedMailReprocessBatchResult> {
  const allowedTargetIds = new Set(records.map((record) => record.id));
  let successCount = 0;
  let failureCount = 0;
  let apiCallCount = 0;
  let projectCount = 0;
  let talentCount = 0;
  const diagnosticCodes: Record<string, number> = {};

  for (const record of records) {
    let result: FailedMailReprocessResult;
    try {
      result = await reprocessFailedMail(record, { ...dependencies, allowedTargetIds });
    } catch {
      result = { ok: false, apiCalls: 0, diagnostic: { stage: "unknown", diagnosticCode: "reprocess_unexpected_error", fields: [], retryable: false } };
    }
    apiCallCount += result.apiCalls;
    if (result.ok) {
      successCount += 1;
      projectCount += result.projectCount ?? 0;
      talentCount += result.talentCount ?? 0;
    } else {
      failureCount += 1;
      if (result.diagnostic) diagnosticCodes[result.diagnostic.diagnosticCode] = (diagnosticCodes[result.diagnostic.diagnosticCode] ?? 0) + 1;
    }
  }
  return { totalCount: records.length, successCount, failureCount, apiCallCount, projectCount, talentCount, diagnosticCodes };
}
