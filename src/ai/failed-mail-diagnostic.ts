import { AiUsageBudget } from "./usage-budget.ts";
import type { SafeAiFailureDiagnostic } from "./failure-diagnostic.ts";
import { toSafeAiFailureDiagnostic } from "./failure-diagnostic.ts";
import type { OpenAiClassifier } from "./openai-client.ts";
import type { GraphMailClient } from "../mail/graph-client.ts";
import { preprocessMailBody } from "../mail/preprocess.ts";

export const FAILED_MAIL_DIAGNOSTIC_TARGET_ID = "3dc6844f-3d5b-49af-a576-b5163f92fdf1";

export interface FailedMailDiagnosticRecord {
  id: string;
  subject: string | null;
  mailboxId: string;
  graphMessageId: string;
  processedBody: string | null;
  aiProcessing: { aiStatus: string | null; status: string; retryCount: number } | null;
}

export interface FailedMailDiagnosticResult {
  ok: boolean;
  apiCalls: number;
  diagnostic?: SafeAiFailureDiagnostic;
}

export function validateFailedMailDiagnosticRecord(record: FailedMailDiagnosticRecord): SafeAiFailureDiagnostic | undefined {
  if (record.id !== FAILED_MAIL_DIAGNOSTIC_TARGET_ID) return diagnostic("configuration", "target_not_allowlisted");
  if (!record.aiProcessing || record.aiProcessing.aiStatus !== "failed_permanent" || record.aiProcessing.status !== "failed") return diagnostic("configuration", "target_state_mismatch");
  if (record.processedBody?.trim()) return diagnostic("configuration", "processed_body_present");
  if (!record.subject || !record.mailboxId || !record.graphMessageId) return diagnostic("configuration", "target_metadata_missing");
  return undefined;
}

function diagnostic(stage: SafeAiFailureDiagnostic["stage"], diagnosticCode: string, error?: unknown): SafeAiFailureDiagnostic {
  const value = error !== null && typeof error === "object" ? error as { status?: unknown; retryable?: unknown } : {};
  const status = typeof value.status === "number" && Number.isInteger(value.status) && value.status >= 100 && value.status <= 599 ? value.status : undefined;
  return { stage, diagnosticCode, fields: [], ...(status === undefined ? {} : { httpStatus: status }), retryable: value.retryable === true };
}

/** Reads one fixed failed mail, refetches it and invokes the classifier at most once. This function never persists. */
export async function diagnoseFailedMail(
  record: FailedMailDiagnosticRecord,
  dependencies: {
    graph: Pick<GraphMailClient, "fetchMessage">;
    classifier: Pick<OpenAiClassifier, "classifyAndExtract">;
    budget?: AiUsageBudget;
    preprocess?: typeof preprocessMailBody;
  },
): Promise<FailedMailDiagnosticResult> {
  const invalid = validateFailedMailDiagnosticRecord(record);
  if (invalid) return { ok: false, apiCalls: 0, diagnostic: invalid };

  let fetched;
  try { fetched = await dependencies.graph.fetchMessage(record.mailboxId, record.graphMessageId); }
  catch (error) {
    const value = error !== null && typeof error === "object" ? error as { category?: unknown; status?: unknown; retryable?: unknown } : {};
    const category = typeof value.category === "string" && /^[a-z][a-z0-9_]{0,30}$/.test(value.category) ? value.category : "unknown";
    return { ok: false, apiCalls: 0, diagnostic: diagnostic("graph_refetch", `graph_${category}_error`, error) };
  }
  if (fetched.kind !== "message" || fetched.email.messageId !== record.graphMessageId || fetched.email.mailboxId !== record.mailboxId || fetched.email.subject !== record.subject) {
    return { ok: false, apiCalls: 0, diagnostic: diagnostic("graph_refetch", "graph_target_mismatch") };
  }

  let processedBody: string;
  try { processedBody = (dependencies.preprocess ?? preprocessMailBody)(fetched.email.body, fetched.contentType).processedBody; }
  catch { return { ok: false, apiCalls: 0, diagnostic: diagnostic("preprocessing", "preprocessing_error") }; }
  if (!processedBody.trim()) return { ok: false, apiCalls: 0, diagnostic: diagnostic("preprocessing", "processed_body_empty") };

  const budget = dependencies.budget ?? new AiUsageBudget(1);
  if (!budget.tryConsume()) return { ok: false, apiCalls: 0, diagnostic: diagnostic("ai_budget", "ai_call_limit_reached") };
  try {
    await dependencies.classifier.classifyAndExtract({ subject: record.subject, processedBody });
    return { ok: true, apiCalls: 1 };
  } catch (error) {
    return { ok: false, apiCalls: 1, diagnostic: toSafeAiFailureDiagnostic(error, "openai_request") };
  }
}
