export const AI_FAILURE_STAGES = [
  "configuration",
  "preprocessing",
  "openai_request",
  "response_parse",
  "zod_validation",
  "graph_refetch",
  "db_persistence",
  "ai_budget",
  "unknown",
] as const;

export type AiFailureStage = (typeof AI_FAILURE_STAGES)[number];

export interface SafeAiFailureDiagnostic {
  stage: AiFailureStage;
  diagnosticCode: string;
  fields: string[];
  httpStatus?: number;
  retryable: boolean;
  errorClass?: string;
  errorCode?: string;
  errorType?: string;
  causeClass?: string;
  causeCode?: string;
  causeCategory?: "network" | "dns" | "timeout" | "tls" | "aborted" | "unknown";
}

const stageSet = new Set<string>(AI_FAILURE_STAGES);
const safeCode = /^[a-z][a-z0-9_]{0,79}$/;
const safeField = /^[A-Za-z][A-Za-z0-9_.-]{0,119}$/;
const safeIdentifier = /^[A-Za-z][A-Za-z0-9_.-]{0,119}$/;
const allowedCauseCategories = new Set(["network", "dns", "timeout", "tls", "aborted", "unknown"]);

function safeText(value: unknown): string | undefined {
  return typeof value === "string" && safeIdentifier.test(value) ? value : undefined;
}

function safeObject(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" ? value as Record<string, unknown> : undefined;
}

function getClassName(value: Record<string, unknown>): string | undefined {
  const constructor = value.constructor as { name?: unknown } | undefined;
  const constructorName = safeText(constructor?.name);
  if (constructorName && constructorName !== "Object") return constructorName;
  return safeText(value.name);
}

function classifyCause(causeClass: string | undefined, causeCode: string | undefined): SafeAiFailureDiagnostic["causeCategory"] {
  const hint = `${causeClass ?? ""} ${causeCode ?? ""}`.toLowerCase();
  if (/abort|cancel/.test(hint)) return "aborted";
  if (/timeout|timedout|etimedout|und_err_connect_timeout|und_err_headers_timeout/.test(hint)) return "timeout";
  if (/tls|ssl|cert|x509/.test(hint)) return "tls";
  if (/dns|enotfound|eai_again|hostnotfound/.test(hint)) return "dns";
  if (/network|socket|connect|fetch|econn|und_err_socket/.test(hint)) return "network";
  return causeClass || causeCode ? "unknown" : undefined;
}

/** Extract bounded error metadata only. Never copy messages, headers, request IDs, bodies, or arbitrary cause data. */
export function extractSafeErrorMetadata(value: unknown): Pick<SafeAiFailureDiagnostic, "errorClass" | "errorCode" | "errorType" | "causeClass" | "causeCode" | "causeCategory"> {
  const error = safeObject(value);
  if (!error) return {};
  const errorClass = safeText(error.errorClass) ?? getClassName(error);
  const errorCode = safeText(error.errorCode) ?? safeText(error.code);
  const errorType = safeText(error.errorType) ?? safeText(error.type);
  let cause = safeObject(error.cause);
  const seen = new Set<object>();
  let causeClass: string | undefined = safeText(error.causeClass);
  let causeCode: string | undefined = safeText(error.causeCode);
  for (let depth = 0; cause && depth < 4 && !seen.has(cause); depth += 1) {
    seen.add(cause);
    causeClass ??= safeText(cause.causeClass) ?? getClassName(cause);
    causeCode ??= safeText(cause.causeCode) ?? safeText(cause.code);
    cause = safeObject(cause.cause);
  }
  const suppliedCategory = safeText(error.causeCategory);
  const causeCategory = suppliedCategory && allowedCauseCategories.has(suppliedCategory)
    ? suppliedCategory as SafeAiFailureDiagnostic["causeCategory"]
    : classifyCause(causeClass, causeCode);
  return {
    ...(errorClass === undefined ? {} : { errorClass }),
    ...(errorCode === undefined ? {} : { errorCode }),
    ...(errorType === undefined ? {} : { errorType }),
    ...(causeClass === undefined ? {} : { causeClass }),
    ...(causeCode === undefined ? {} : { causeCode }),
    ...(causeCategory === undefined ? {} : { causeCategory }),
  };
}

/** Extract only bounded, allow-listed diagnostic metadata. Never copy error messages or response data. */
export function toSafeAiFailureDiagnostic(value: unknown, fallbackStage: AiFailureStage): SafeAiFailureDiagnostic {
  const error = value !== null && typeof value === "object" ? value as Record<string, unknown> : {};
  const stage = typeof error.stage === "string" && stageSet.has(error.stage) ? error.stage as AiFailureStage : fallbackStage;
  const candidateCode = typeof error.diagnosticCode === "string" ? error.diagnosticCode : undefined;
  const category = typeof error.category === "string" && safeCode.test(error.category) ? error.category : "unknown";
  const diagnosticCode = candidateCode && safeCode.test(candidateCode) ? candidateCode : `${stage}_${category}_error`;
  const fields = Array.isArray(error.fields)
    ? [...new Set(error.fields.filter((field): field is string => typeof field === "string" && safeField.test(field)))].slice(0, 50)
    : [];
  const httpStatus = typeof error.status === "number" && Number.isInteger(error.status) && error.status >= 100 && error.status <= 599
    ? error.status
    : undefined;
  const retryable = typeof error.retryable === "boolean" ? error.retryable : false;
  return { stage, diagnosticCode, fields, ...(httpStatus === undefined ? {} : { httpStatus }), retryable, ...extractSafeErrorMetadata(error) };
}

export function formatSafeAiFailureDiagnostic(diagnostic: SafeAiFailureDiagnostic): string {
  return JSON.stringify(diagnostic);
}
