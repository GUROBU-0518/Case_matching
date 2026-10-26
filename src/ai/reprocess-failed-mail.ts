import type { AiResponse } from "./types.ts";
import { toSafeAiFailureDiagnostic, type SafeAiFailureDiagnostic } from "./failure-diagnostic.ts";
import { FAILED_MAIL_DIAGNOSTIC_TARGET_ID } from "./failed-mail-diagnostic.ts";
import type { GraphMailClient } from "../mail/graph-client.ts";
import { preprocessMailBody } from "../mail/preprocess.ts";

export interface FailedMailReprocessRecord {
  id: string;
  subject: string | null;
  mailboxId: string;
  graphMessageId: string;
  processedBody: string | null;
  aiProcessing: { aiStatus: string | null; status: string; retryCount: number } | null;
  projectCount: number;
  talentCount: number;
}

export interface FailedMailReprocessResult {
  ok: boolean;
  apiCalls: number;
  classification?: AiResponse["classification"];
  projectCount?: number;
  talentCount?: number;
  diagnostic?: SafeAiFailureDiagnostic;
}

export function validateFailedMailReprocessRecord(record: FailedMailReprocessRecord, allowedIds: ReadonlySet<string> = new Set([FAILED_MAIL_DIAGNOSTIC_TARGET_ID])): SafeAiFailureDiagnostic | undefined {
  if (!allowedIds.has(record.id)) return diagnostic("configuration", "target_not_allowlisted");
  if (!record.aiProcessing || record.aiProcessing.aiStatus !== "failed_permanent" || record.aiProcessing.status !== "failed") return diagnostic("configuration", "target_state_mismatch");
  if (record.aiProcessing.retryCount >= 3) return diagnostic("configuration", "retry_limit_reached");
  if (record.projectCount !== 0 || record.talentCount !== 0) return diagnostic("configuration", "existing_extraction_records");
  if (!record.subject || !record.mailboxId || !record.graphMessageId) return diagnostic("configuration", "target_metadata_missing");
  return undefined;
}

function diagnostic(stage: SafeAiFailureDiagnostic["stage"], diagnosticCode: string, error?: unknown, retryable = false): SafeAiFailureDiagnostic {
  const value = error !== null && typeof error === "object" ? error as { status?: unknown; retryable?: unknown } : {};
  const status = typeof value.status === "number" && Number.isInteger(value.status) && value.status >= 100 && value.status <= 599 ? value.status : undefined;
  return { stage, diagnosticCode, fields: [], ...(status === undefined ? {} : { httpStatus: status }), retryable: value.retryable === true || retryable };
}

/** Re-fetches and processes exactly one allow-listed failed mail. All writes are delegated to guarded repository transactions. */
export async function reprocessFailedMail(
  record: FailedMailReprocessRecord,
  dependencies: {
    graph: Pick<GraphMailClient, "fetchMessage">;
    classifier: { classifyAndExtract(input: { subject: string; processedBody: string }): Promise<AiResponse> };
    claim(target: { id: string; subject: string; expectedProcessedBody: string | null }): Promise<boolean>;
    persist(mailMessageId: string, response: AiResponse, processedBody: string, expectedProcessedBody: string | null): Promise<{ skipped: boolean; projectCount: number; talentCount: number }>;
    recordFailure(mailMessageId: string, errorType: string, errorMessage: string): Promise<void>;
    preprocess?: typeof preprocessMailBody;
    allowedTargetIds?: ReadonlySet<string>;
  },
): Promise<FailedMailReprocessResult> {
  const invalid = validateFailedMailReprocessRecord(record, dependencies.allowedTargetIds);
  if (invalid) return { ok: false, apiCalls: 0, diagnostic: invalid };

  let fetched;
  try { fetched = await dependencies.graph.fetchMessage(record.mailboxId, record.graphMessageId); }
  catch (error) {
    const value = error !== null && typeof error === "object" ? error as { category?: unknown } : {};
    const category = typeof value.category === "string" && /^[a-z][a-z0-9_]{0,30}$/.test(value.category) ? value.category : "unknown";
    return { ok: false, apiCalls: 0, diagnostic: toSafeAiFailureDiagnostic(error, "graph_refetch") ?? diagnostic("graph_refetch", `graph_${category}_error`) };
  }
  if (fetched.kind !== "message" || fetched.email.messageId !== record.graphMessageId || fetched.email.mailboxId !== record.mailboxId || fetched.email.subject !== record.subject) {
    return { ok: false, apiCalls: 0, diagnostic: diagnostic("graph_refetch", "graph_target_mismatch") };
  }

  let processedBody: string;
  try { processedBody = (dependencies.preprocess ?? preprocessMailBody)(fetched.email.body, fetched.contentType).processedBody; }
  catch { return { ok: false, apiCalls: 0, diagnostic: diagnostic("preprocessing", "preprocessing_error") }; }
  if (!processedBody.trim()) return { ok: false, apiCalls: 0, diagnostic: diagnostic("preprocessing", "processed_body_empty") };

  let claimed: boolean;
  try { claimed = await dependencies.claim({ id: record.id, subject: record.subject!, expectedProcessedBody: record.processedBody }); }
  catch { return { ok: false, apiCalls: 0, diagnostic: diagnostic("db_persistence", "reprocess_claim_failed", undefined, true) }; }
  if (!claimed) return { ok: false, apiCalls: 0, diagnostic: diagnostic("configuration", "target_changed_before_claim") };

  let response: AiResponse;
  try { response = await dependencies.classifier.classifyAndExtract({ subject: record.subject!, processedBody }); }
  catch (error) {
    const safe = toSafeAiFailureDiagnostic(error, "openai_request");
    const category = error !== null && typeof error === "object" ? (error as { category?: unknown }).category : undefined;
    const retryType = category === "temporary" || category === "rate_limit" || category === "timeout" ? "temporary" : "permanent";
    try { await dependencies.recordFailure(record.id, retryType, JSON.stringify(safe)); }
    catch { return { ok: false, apiCalls: 1, diagnostic: diagnostic("db_persistence", "failure_record_write_failed", undefined, true) }; }
    return { ok: false, apiCalls: 1, diagnostic: safe };
  }

  try {
    const saved = await dependencies.persist(record.id, response, processedBody, record.processedBody);
    if (saved.skipped) return { ok: false, apiCalls: 1, diagnostic: diagnostic("db_persistence", "already_succeeded") };
    return { ok: true, apiCalls: 1, classification: response.classification, projectCount: saved.projectCount, talentCount: saved.talentCount };
  } catch {
    const safe = diagnostic("db_persistence", "ai_result_persist_failed", undefined, true);
    try { await dependencies.recordFailure(record.id, "temporary", JSON.stringify(safe)); }
    catch { return { ok: false, apiCalls: 1, diagnostic: diagnostic("db_persistence", "failure_record_write_failed", undefined, true) }; }
    return { ok: false, apiCalls: 1, diagnostic: safe };
  }
}
