import { describe, expect, it, vi } from "vitest";
import OpenAI from "openai";
import { AiClientError, OpenAiClassifier, aiResponseJsonSchema } from "../src/ai/openai-client.ts";
import { SES_EXTRACTION_SYSTEM_PROMPT_V1 } from "../src/ai/prompt-v1.ts";
import { toSafeAiFailureDiagnostic } from "../src/ai/failure-diagnostic.ts";

const project = { projectName: "案件", summary: null, price: null, location: null, nearestStation: null, workStyle: null, startDate: null, requiredSkills: null, preferredSkills: null, headcount: null, phase: null, commercialFlowRestriction: null };
const response = { classification: "project", projects: [project], talents: [] };
const talent = { name: "候補者", desiredPrice: 65, nearestStation: null, skills: ["TypeScript"], availableFrom: null, availablePeriod: null, age: 30, yearsOfExperience: 5, desiredWorkStyle: null, availablePhases: null, affiliationType: "unknown", notes: null };
function fakeClient(payload: unknown, error?: unknown) { return { chat: { completions: { create: vi.fn(async () => { if (error) throw error; return { choices: [{ message: { content: JSON.stringify(payload) } }] }; }) } } }; }

describe("OpenAiClassifier", () => {
  it("正常なJSONをZod検証して返す", async () => { const client = new OpenAiClassifier({ apiKey: "test", client: fakeClient(response) as never }); await expect(client.classifyAndExtract({ subject: "件名", processedBody: "本文" })).resolves.toMatchObject({ classification: "project" }); });
  it("JSON不正をvalidationに分類する", async () => { const client = new OpenAiClassifier({ apiKey: "test", client: { chat: { completions: { create: vi.fn(async () => ({ choices: [{ message: { content: "{" } }] })) } } } } as never); await expect(client.classifyAndExtract({ subject: "", processedBody: "" })).rejects.toMatchObject({ category: "validation", retryable: false }); });
  it("validation診断コードを値なしで返す", async () => { const client = new OpenAiClassifier({ apiKey: "test", client: fakeClient({ classification: "project", projects: [], talents: [] }) as never }); await expect(client.classifyAndExtract({ subject: "", processedBody: "" })).rejects.toMatchObject({ diagnosticCode: "classification_mismatch", stage: "zod_validation", fields: ["classification"] }); });
  it("APIキー未設定を検出する", () => expect(() => new OpenAiClassifier({ env: {} })).toThrowError(AiClientError));
  it("429を再試行可能なrate_limitに分類する", async () => { const client = new OpenAiClassifier({ apiKey: "test", client: fakeClient(null, { status: 429 }) as never }); await expect(client.classifyAndExtract({ subject: "", processedBody: "" })).rejects.toMatchObject({ category: "rate_limit", retryable: true, status: 429, stage: "openai_request", diagnosticCode: "openai_rate_limit" }); });
  it("認証エラー・タイムアウト・一時障害を分類する", async () => {
    const auth = new OpenAiClassifier({ apiKey: "test", client: fakeClient(null, { status: 401 }) as never });
    await expect(auth.classifyAndExtract({ subject: "", processedBody: "" })).rejects.toMatchObject({ category: "authentication", retryable: false });
    const timeout = new OpenAiClassifier({ apiKey: "test", client: fakeClient(null, { name: "TimeoutError" }) as never });
    await expect(timeout.classifyAndExtract({ subject: "", processedBody: "" })).rejects.toMatchObject({ category: "timeout", retryable: true });
    const temporary = new OpenAiClassifier({ apiKey: "test", client: fakeClient(null, { status: 503 }) as never });
    await expect(temporary.classifyAndExtract({ subject: "", processedBody: "" })).rejects.toMatchObject({ category: "temporary", retryable: true });
  });
  it("SDKの通信例外はstatusなしでも型・causeコードを安全に診断し一時失敗にする", async () => {
    const cause = Object.assign(new Error("secret transport detail"), { code: "ECONNRESET" });
    const sdkError = new OpenAI.APIConnectionError({ cause });
    expect(sdkError.name).toBe("Error");
    expect(sdkError.constructor.name).toBe("APIConnectionError");
    const client = new OpenAiClassifier({ apiKey: "test", client: fakeClient(null, sdkError) as never });
    try {
      await client.classifyAndExtract({ subject: "", processedBody: "" });
      throw new Error("expected SDK connection error");
    } catch (error) {
      expect(error).toMatchObject({ category: "temporary", status: undefined, retryable: true, diagnosticCode: "openai_connection_error", errorClass: "APIConnectionError", causeCode: "ECONNRESET", causeCategory: "network" });
      const diagnostic = toSafeAiFailureDiagnostic(error, "unknown");
      expect(diagnostic).toMatchObject({ errorClass: "APIConnectionError", causeClass: "Error", causeCode: "ECONNRESET", causeCategory: "network" });
      expect(diagnostic).not.toHaveProperty("httpStatus");
      expect(JSON.stringify(diagnostic)).not.toContain("secret transport detail");
    }
  });
  it("SDKの接続タイムアウトをタイムアウトとして診断する", async () => {
    const sdkError = new OpenAI.APIConnectionTimeoutError();
    const client = new OpenAiClassifier({ apiKey: "test", client: fakeClient(null, sdkError) as never });
    await expect(client.classifyAndExtract({ subject: "", processedBody: "" })).rejects.toMatchObject({ category: "timeout", retryable: true, diagnosticCode: "openai_connection_timeout", errorClass: "APIConnectionTimeoutError" });
  });
  it("SDKのAPIエラーからstatus・code・typeだけを保持し本文を保持しない", async () => {
    const sdkError = new OpenAI.BadRequestError(400, { code: "invalid_schema", type: "invalid_request_error", message: "private response text" }, "private response text", new Headers());
    const client = new OpenAiClassifier({ apiKey: "test", client: fakeClient(null, sdkError) as never });
    try {
      await client.classifyAndExtract({ subject: "", processedBody: "" });
      throw new Error("expected SDK API error");
    } catch (error) {
      const diagnostic = toSafeAiFailureDiagnostic(error, "unknown");
      expect(diagnostic).toMatchObject({ httpStatus: 400, errorClass: "BadRequestError", errorCode: "invalid_schema", errorType: "invalid_request_error" });
      expect(JSON.stringify(diagnostic)).not.toContain("private response text");
    }
  });
  it("API呼び出しを1回だけ行い本文をログ出力しない", async () => { const fake = fakeClient(response); const client = new OpenAiClassifier({ apiKey: "test", client: fake as never }); await client.classifyAndExtract({ subject: "架空件名", processedBody: "架空本文" }); expect(fake.chat.completions.create).toHaveBeenCalledTimes(1); });
  it("明確な数値JSONを文字列へ正規化する", async () => { const fake = fakeClient({ classification: "talent", projects: [], talents: [talent] }); const client = new OpenAiClassifier({ apiKey: "test", client: fake as never }); await expect(client.classifyAndExtract({ subject: "件名", processedBody: "本文" })).resolves.toMatchObject({ talents: [{ desiredPrice: "65", age: "30", yearsOfExperience: "5" }] }); });
  it("混在メールの案件数値項目を文字列へ正規化する", async () => { const fake = fakeClient({ classification: "mixed", projects: [{ ...project, price: 70, workStyle: 3, headcount: 2, phase: 1 }], talents: [talent] }); const client = new OpenAiClassifier({ apiKey: "test", client: fake as never }); await expect(client.classifyAndExtract({ subject: "件名", processedBody: "本文" })).resolves.toMatchObject({ projects: [{ price: "70", workStyle: "3", headcount: "2", phase: "1" }], talents: [{ name: "候補者" }] }); });
  it("案件の曖昧な型は推測変換せず検証エラーにする", async () => { const fake = fakeClient({ classification: "mixed", projects: [{ ...project, workStyle: { value: "リモート" } }], talents: [talent] }); const client = new OpenAiClassifier({ apiKey: "test", client: fake as never }); await expect(client.classifyAndExtract({ subject: "件名", processedBody: "本文" })).rejects.toMatchObject({ diagnosticCode: "zod_validation_error", fields: ["projects.0.workStyle"] }); });
  it("変換不能な値は推測せず検証エラーにする", async () => { const fake = fakeClient({ classification: "talent", projects: [], talents: [{ ...talent, desiredPrice: { value: 65 } }] }); const client = new OpenAiClassifier({ apiKey: "test", client: fake as never }); await expect(client.classifyAndExtract({ subject: "件名", processedBody: "本文" })).rejects.toMatchObject({ diagnosticCode: "zod_validation_error", fields: ["talents.0.desiredPrice"] }); });
  it("検証エラーの診断情報はフィールド名だけで構成できる", async () => { const fake = fakeClient({ classification: "talent", projects: [], talents: [{ ...talent, age: { value: 30 } }] }); const client = new OpenAiClassifier({ apiKey: "test", client: fake as never }); try { await client.classifyAndExtract({ subject: "件名", processedBody: "本文" }); throw new Error("expected validation error"); } catch (error) { expect(error).toMatchObject({ diagnosticCode: "zod_validation_error", fields: ["talents.0.age"] }); expect(JSON.stringify(error)).not.toContain("value"); } });
  it("正式プロンプトv1.0をシステムメッセージへ渡す", async () => { const fake = fakeClient(response); const client = new OpenAiClassifier({ apiKey: "test", client: fake as never }); await client.classifyAndExtract({ subject: "件名", processedBody: "本文" }); expect(fake.chat.completions.create).toHaveBeenCalledWith(expect.objectContaining({ messages: expect.arrayContaining([{ role: "system", content: SES_EXTRACTION_SYSTEM_PROMPT_V1 }]) })); });
  it("Structured Outputsのjson_schemaとstrict=trueを送信する", async () => { const fake = fakeClient(response); const client = new OpenAiClassifier({ apiKey: "test", client: fake as never }); await client.classifyAndExtract({ subject: "件名", processedBody: "本文" }); expect(fake.chat.completions.create).toHaveBeenCalledWith(expect.objectContaining({ response_format: { type: "json_schema", json_schema: expect.objectContaining({ name: "ses_extraction", strict: true, schema: aiResponseJsonSchema }) } })); });
});
