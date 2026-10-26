import OpenAI from "openai";
import { aiResponseSchema } from "./schemas.ts";
import type { AiResponse } from "./types.ts";
import { loadSystemPrompt } from "./prompt-loader.ts";
import { extractSafeErrorMetadata, type SafeAiFailureDiagnostic, type AiFailureStage } from "./failure-diagnostic.ts";

export type AiErrorCategory = "configuration" | "authentication" | "rate_limit" | "timeout" | "temporary" | "validation" | "unknown";

export class AiClientError extends Error {
  readonly category: AiErrorCategory;
  readonly status: number | undefined;
  readonly retryable: boolean;
  readonly fields: string[];
  readonly diagnosticCode: string | undefined;
  readonly stage: AiFailureStage;
  readonly errorClass: string | undefined;
  readonly errorCode: string | undefined;
  readonly errorType: string | undefined;
  readonly causeClass: string | undefined;
  readonly causeCode: string | undefined;
  readonly causeCategory: SafeAiFailureDiagnostic["causeCategory"];
  constructor(message: string, category: AiErrorCategory, options: { status?: number; retryable?: boolean; diagnosticCode?: string; fields?: string[]; stage?: AiFailureStage } & Partial<Pick<SafeAiFailureDiagnostic, "errorClass" | "errorCode" | "errorType" | "causeClass" | "causeCode" | "causeCategory">> = {}) {
    super(message); this.name = "AiClientError"; this.category = category; this.status = options.status;
    this.retryable = options.retryable ?? ["rate_limit", "timeout", "temporary"].includes(category);
    this.diagnosticCode = options.diagnosticCode; this.fields = options.fields ?? [];
    this.stage = options.stage ?? "openai_request";
    this.errorClass = options.errorClass; this.errorCode = options.errorCode; this.errorType = options.errorType;
    this.causeClass = options.causeClass; this.causeCode = options.causeCode; this.causeCategory = options.causeCategory;
  }
}

export interface AiMailInput { subject: string; processedBody: string; }
export interface OpenAiClientOptions { apiKey?: string; model?: string; timeoutMs?: number; maxRetries?: number; client?: OpenAI; env?: NodeJS.ProcessEnv; promptDir?: string; }

const temporaryStatus = (status: number) => status === 408 || status >= 500;

const nullableString = { anyOf: [{ type: "string" }, { type: "null" }] } as const;
const nullableStringArray = { anyOf: [{ type: "array", items: { type: "string" } }, { type: "null" }] } as const;
const aiProjectJsonSchema = {
  type: "object", additionalProperties: false,
  properties: { projectName: nullableString, summary: nullableString, price: nullableString, priceMin: { anyOf: [{ type: "integer", minimum: 0 }, { type: "null" }] }, priceMax: { anyOf: [{ type: "integer", minimum: 0 }, { type: "null" }] }, location: nullableString, nearestStation: nullableString, workStyle: nullableString, startDate: nullableString, requiredSkills: nullableStringArray, preferredSkills: nullableStringArray, headcount: nullableString, phase: nullableString, commercialFlowRestriction: nullableString },
  required: ["projectName", "summary", "price", "priceMin", "priceMax", "location", "nearestStation", "workStyle", "startDate", "requiredSkills", "preferredSkills", "headcount", "phase", "commercialFlowRestriction"],
} as const;
const aiTalentJsonSchema = {
  type: "object", additionalProperties: false,
  properties: { name: nullableString, desiredPrice: nullableString, desiredPriceMin: { anyOf: [{ type: "integer", minimum: 0 }, { type: "null" }] }, desiredPriceMax: { anyOf: [{ type: "integer", minimum: 0 }, { type: "null" }] }, nearestStation: nullableString, skills: nullableStringArray, availableFrom: nullableString, availablePeriod: nullableString, age: nullableString, yearsOfExperience: nullableString, desiredWorkStyle: nullableString, availablePhases: nullableStringArray, affiliationType: { type: "string", enum: ["employee", "freelance", "unknown"] }, notes: nullableString },
  required: ["name", "desiredPrice", "desiredPriceMin", "desiredPriceMax", "nearestStation", "skills", "availableFrom", "availablePeriod", "age", "yearsOfExperience", "desiredWorkStyle", "availablePhases", "affiliationType", "notes"],
} as const;
export const aiResponseJsonSchema = {
  type: "object", additionalProperties: false,
  properties: { classification: { type: "string", enum: ["project", "talent", "mixed", "other"] }, projects: { type: "array", items: aiProjectJsonSchema }, talents: { type: "array", items: aiTalentJsonSchema } },
  required: ["classification", "projects", "talents"],
} as const;

// モデルが数値をJSON numberで返しても、明確に文字列化できる項目だけを正規化する。
// 単位付き・曖昧な文字列やnullは変更せず、スキーマ検証に委ねる。
function normalizeAiPayload(input: unknown): unknown {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return input;
  const root = { ...(input as Record<string, unknown>) };
  if (Array.isArray(root.projects)) {
    const fields = ["price", "workStyle", "headcount", "phase"] as const;
    root.projects = root.projects.map((project) => {
      if (project === null || typeof project !== "object" || Array.isArray(project)) return project;
      const normalized = { ...(project as Record<string, unknown>) };
      for (const field of fields) {
        const value = normalized[field];
        if (typeof value === "number" && Number.isFinite(value)) normalized[field] = String(value);
      }
      return normalized;
    });
  }
  if (!Array.isArray(root.talents)) return root;
  const fields = ["desiredPrice", "age", "yearsOfExperience"] as const;
  root.talents = root.talents.map((talent) => {
    if (talent === null || typeof talent !== "object" || Array.isArray(talent)) return talent;
    const normalized = { ...(talent as Record<string, unknown>) };
    for (const field of fields) {
      const value = normalized[field];
      if (typeof value === "number" && Number.isFinite(value)) normalized[field] = String(value);
    }
    return normalized;
  });
  return root;
}

export class OpenAiClassifier {
  private readonly client: OpenAI;
  private readonly systemPrompt: string;
  private readonly model: string;
  constructor(options: OpenAiClientOptions = {}) {
    const env = options.env ?? process.env;
    const apiKey = options.apiKey ?? env.OPENAI_API_KEY;
    if (!apiKey?.trim()) throw new AiClientError("OPENAI_API_KEYが設定されていません", "configuration", { retryable: false, stage: "configuration", diagnosticCode: "missing_api_key" });
    this.model = options.model ?? env.OPENAI_MODEL ?? "gpt-4.1-nano";
    this.client = options.client ?? new OpenAI({ apiKey, timeout: options.timeoutMs ?? 30_000, maxRetries: options.maxRetries ?? 0 });
    try { this.systemPrompt = loadSystemPrompt(options.promptDir); } catch { throw new AiClientError("AIプロンプトを読み込めません", "configuration", { retryable: false, stage: "configuration", diagnosticCode: "prompt_load_error" }); }
  }

  async classifyAndExtract(input: AiMailInput): Promise<AiResponse> {
    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: "system", content: this.systemPrompt },
          { role: "user", content: `件名:\n${input.subject}\n\n本文:\n${input.processedBody}` },
        ],
        response_format: { type: "json_schema", json_schema: { name: "ses_extraction", strict: true, schema: aiResponseJsonSchema } },
      });
      const content = response.choices[0]?.message?.content;
      if (!content) throw new AiClientError("AI応答が空です", "validation", { retryable: false, stage: "response_parse", diagnosticCode: "response_missing" });
      let parsed: unknown;
      try { parsed = JSON.parse(content); } catch { throw new AiClientError("AI応答のJSON形式が不正です", "validation", { retryable: false, stage: "response_parse", diagnosticCode: "json_parse_error" }); }
      const result = aiResponseSchema.safeParse(normalizeAiPayload(parsed));
      if (!result.success) {
        const fields = result.error.issues.map((issue) => issue.path.join(".")).filter(Boolean);
        const classificationMismatch = result.error.issues.some((issue) => issue.path[0] === "classification" && issue.code === "custom");
        throw new AiClientError("AI応答がZodスキーマに一致しません", "validation", { retryable: false, stage: "zod_validation", diagnosticCode: classificationMismatch ? "classification_mismatch" : "zod_validation_error", fields });
      }
      return result.data;
    } catch (error) {
      if (error instanceof AiClientError) throw error;
      const value = error as { status?: number; name?: string; code?: string; constructor?: { name?: string } };
      const status = typeof value.status === "number" ? value.status : undefined;
      const metadata = extractSafeErrorMetadata(error);
      const errorClass = metadata.errorClass;
      const common = { ...metadata, ...(status === undefined ? {} : { status }), stage: "openai_request" as const };
      if (status === 401 || status === 403) throw new AiClientError("OpenAI認証に失敗しました", "authentication", { ...common, retryable: false, diagnosticCode: "openai_authentication_error" });
      if (status === 429) throw new AiClientError("OpenAIレート制限に達しました", "rate_limit", { ...common, diagnosticCode: "openai_rate_limit" });
      if (errorClass === "APIConnectionTimeoutError" || value.name === "AbortError" || value.name === "TimeoutError") throw new AiClientError("OpenAI通信がタイムアウトしました", "timeout", { ...common, retryable: true, diagnosticCode: "openai_connection_timeout" });
      if (errorClass === "APIConnectionError") throw new AiClientError("OpenAIへの接続に失敗しました", "temporary", { ...common, retryable: true, diagnosticCode: "openai_connection_error" });
      if (status !== undefined && temporaryStatus(status)) throw new AiClientError("OpenAIサービスが一時的に利用できません", "temporary", { ...common, diagnosticCode: "openai_temporary_error" });
      throw new AiClientError("OpenAIへの接続に失敗しました", "unknown", { ...common, retryable: false, diagnosticCode: "openai_unknown_error" });
    }
  }
}
