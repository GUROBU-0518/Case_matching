import { describe, expect, it, vi } from "vitest";
import { FAILED_MAIL_DIAGNOSTIC_TARGET_ID, diagnoseFailedMail, type FailedMailDiagnosticRecord } from "../src/ai/failed-mail-diagnostic.ts";
import { AiUsageBudget } from "../src/ai/usage-budget.ts";

const subject = "架空件名";
const record: FailedMailDiagnosticRecord = {
  id: FAILED_MAIL_DIAGNOSTIC_TARGET_ID,
  subject,
  mailboxId: "mailbox@example.invalid",
  graphMessageId: "internal-graph-id",
  processedBody: null,
  aiProcessing: { aiStatus: "failed_permanent", status: "failed", retryCount: 0 },
};
const fetched = { kind: "message" as const, contentType: "text" as const, email: { mailboxId: record.mailboxId, messageId: record.graphMessageId, subject, body: "架空の案件内容", sender: "sender@example.invalid", receivedAt: new Date() } };
const graph = (result = fetched) => ({ fetchMessage: vi.fn(async () => result) });
const classifier = (fn = vi.fn(async () => ({ classification: "project", projects: [], talents: [] }))) => ({ classifyAndExtract: fn });

describe("diagnoseFailedMail", () => {
  it("許可対象1件を前処理してAIを最大1回呼び、本文や抽出内容を返さない", async () => {
    const ai = classifier();
    const result = await diagnoseFailedMail(record, { graph: graph(), classifier: ai as never });
    expect(result).toEqual({ ok: true, apiCalls: 1 });
    expect(ai.classifyAndExtract).toHaveBeenCalledTimes(1);
    expect(ai.classifyAndExtract).toHaveBeenCalledWith({ subject, processedBody: "架空の案件内容" });
  });
  it("対象IDが違えば外部アクセスを開始しない", async () => {
    const g = graph(); const ai = classifier();
    const result = await diagnoseFailedMail({ ...record, id: "other" }, { graph: g, classifier: ai as never });
    expect(result.apiCalls).toBe(0); expect(g.fetchMessage).not.toHaveBeenCalled(); expect(ai.classifyAndExtract).not.toHaveBeenCalled();
  });
  it("状態違い・本文ありはGraph取得前に拒否する", async () => {
    const g = graph(); const ai = classifier();
    for (const candidate of [{ ...record, aiProcessing: { ...record.aiProcessing!, aiStatus: "succeeded" } }, { ...record, processedBody: "already stored" }]) {
      const result = await diagnoseFailedMail(candidate, { graph: g, classifier: ai as never }); expect(result.apiCalls).toBe(0);
    }
    expect(g.fetchMessage).not.toHaveBeenCalled();
  });
  it("Graph取得失敗ではAIを呼ばず、安全な診断情報のみを返す", async () => {
    const g = { fetchMessage: vi.fn(async () => { throw Object.assign(new Error("private body"), { category: "temporary", status: 503, retryable: true }); }) };
    const ai = classifier(); const result = await diagnoseFailedMail(record, { graph: g, classifier: ai as never });
    expect(result).toMatchObject({ ok: false, apiCalls: 0, diagnostic: { stage: "graph_refetch", diagnosticCode: "graph_temporary_error", httpStatus: 503, retryable: true } });
    expect(JSON.stringify(result)).not.toContain("private body"); expect(ai.classifyAndExtract).not.toHaveBeenCalled();
  });
  it("Graph対象が一致しない場合はAIを呼ばない", async () => {
    const changed = { ...fetched, email: { ...fetched.email, subject: "別件名" } }; const ai = classifier();
    const result = await diagnoseFailedMail(record, { graph: graph(changed), classifier: ai as never });
    expect(result).toMatchObject({ apiCalls: 0, diagnostic: { diagnosticCode: "graph_target_mismatch" } }); expect(ai.classifyAndExtract).not.toHaveBeenCalled();
  });
  it("空の前処理結果ならAIを呼ばない", async () => {
    const ai = classifier(); const result = await diagnoseFailedMail(record, { graph: graph(), classifier: ai as never, preprocess: () => ({ originalBody: "", processedBody: "  ", signatureRemoved: false, quotedReplyRemoved: false }) });
    expect(result).toMatchObject({ ok: false, apiCalls: 0, diagnostic: { stage: "preprocessing", diagnosticCode: "processed_body_empty" } }); expect(ai.classifyAndExtract).not.toHaveBeenCalled();
  });
  it("AI失敗時にフィールド名等だけを返し、応答や本文を含めない", async () => {
    const ai = classifier(vi.fn(async () => { throw Object.assign(new Error("raw response secret"), { stage: "zod_validation", diagnosticCode: "zod_validation_error", fields: ["projects.0.price"], retryable: false }); }));
    const result = await diagnoseFailedMail(record, { graph: graph(), classifier: ai as never });
    expect(result).toMatchObject({ ok: false, apiCalls: 1, diagnostic: { stage: "zod_validation", diagnosticCode: "zod_validation_error", fields: ["projects.0.price"], retryable: false } });
    expect(JSON.stringify(result)).not.toContain("raw response secret");
  });
  it("1回上限が既に消費済みならAIを呼ばない", async () => {
    const budget = new AiUsageBudget(1); expect(budget.tryConsume()).toBe(true);
    const ai = classifier(); const result = await diagnoseFailedMail(record, { graph: graph(), classifier: ai as never, budget });
    expect(result.apiCalls).toBe(0); expect(ai.classifyAndExtract).not.toHaveBeenCalled();
  });
});
