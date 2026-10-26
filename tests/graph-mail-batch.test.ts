import { describe, expect, it, vi } from "vitest";
import { loadNewGraphEmails, runGraphMailBatch } from "../src/batch/graph-mail-batch.ts";
import type { DeltaResult } from "../src/mail/graph-delta.ts";
import type { CommonEmail } from "../src/mail/types.ts";

const email = (id: string, mailboxId = "box@example.com"): CommonEmail => ({ mailboxId, messageId: id, subject: id, sender: "sender@example.com", receivedAt: new Date("2026-01-01T00:00:00Z"), body: id });
const result = (changes: DeltaResult["changes"], newMessages: DeltaResult["newMessages"]): DeltaResult => ({ mailboxId: "box@example.com", changes, newMessages, deltaLink: "https://graph.example/delta", pagesFetched: 1 });
describe("Graph Delta to T04 batch adapter", () => {
  it("newだけをCommonEmailとして渡しchanged/removedを除外する", async () => {
    const fresh = email("new"); const changed = email("changed");
    const loaded = await loadNewGraphEmails(async () => result([{ kind: "new", message: { kind: "message", email: fresh, contentType: "text" } }, { kind: "changed", message: { kind: "message", email: changed, contentType: "text" } }, { kind: "removed", message: { kind: "removed", messageId: "old", reason: "deleted" } }], [{ kind: "message", email: fresh, contentType: "text" }]));
    expect(loaded).toEqual([fresh]);
  });
  it("0件でも正常にT04へ渡せる", async () => { await expect(loadNewGraphEmails(async () => result([], []))).resolves.toEqual([]); });
  it("複数newのmailboxIdを保持してrunMailBatchへ渡す", async () => {
    const source = [email("one", "box-a@example.com"), email("two", "box-a@example.com")]; const client = { fetchDelta: vi.fn(async () => result(source.map((item) => ({ kind: "new" as const, message: { kind: "message" as const, email: item, contentType: "text" as const } })), source.map((item) => ({ kind: "message" as const, email: item, contentType: "text" as const })) )) };
    const batch = await runGraphMailBatch(client as never, "box-a@example.com", 3, { retry: { retryDelaysMs: [0, 0] } });
    expect(batch.items.map((item) => item.mailboxId)).toEqual(["box-a@example.com", "box-a@example.com"]); expect(client.fetchDelta).toHaveBeenCalledWith("box-a@example.com", 3);
  });
  it("classifierを注入するとメールごとに1回だけAI処理を行う", async () => {
    const source = [email("ai-one"), email("ai-two")];
    const client = { fetchDelta: vi.fn(async () => result(source.map((item) => ({ kind: "new" as const, message: { kind: "message" as const, email: item, contentType: "text" as const } })), source.map((item) => ({ kind: "message" as const, email: item, contentType: "text" as const })) )) };
    const classifyAndExtract = vi.fn(async () => ({ classification: "other" as const, projects: [], talents: [] }));
    const batch = await runGraphMailBatch(client as never, "box@example.com", 3, { classifier: { classifyAndExtract } as never, retry: { retryDelaysMs: [0, 0] } });
    expect(batch.successCount).toBe(2);
    expect(classifyAndExtract).toHaveBeenCalledTimes(2);
    expect(classifyAndExtract).toHaveBeenCalledWith(expect.objectContaining({ subject: "ai-one", processedBody: expect.any(String) }));
  });
  it("AI一時エラーはT04の即時リトライ上限まで再試行する", async () => {
    const fresh = email("ai-temporary");
    const client = { fetchDelta: vi.fn(async () => result([], [{ kind: "message" as const, email: fresh, contentType: "text" as const }])) };
    const classifyAndExtract = vi.fn(async () => { throw Object.assign(new Error("temporary"), { category: "temporary", retryable: true }); });
    const batch = await runGraphMailBatch(client as never, "box@example.com", 3, { classifier: { classifyAndExtract } as never, retry: { retryDelaysMs: [0, 0] } });
    expect(classifyAndExtract).toHaveBeenCalledTimes(3);
    expect(batch.items[0]).toMatchObject({ status: "failed", errorCategory: "temporary", attempts: 3, retryCount: 2 });
  });
  it("AI検証失敗の段階・コード・フィールドを値なしで保持する", async () => {
    const fresh = email("ai-zod");
    const client = { fetchDelta: vi.fn(async () => result([], [{ kind: "message" as const, email: fresh, contentType: "text" as const }])) };
    const classifyAndExtract = vi.fn(async () => { throw Object.assign(new Error("本文を含む可能性のあるメッセージ"), { category: "validation", stage: "zod_validation", diagnosticCode: "zod_validation_error", fields: ["projects.0.priceMin"] }); });
    const batch = await runGraphMailBatch(client as never, "box@example.com", 3, { classifier: { classifyAndExtract } as never, retry: { maxAttempts: 1 } });
    expect(batch.items[0]).toMatchObject({ success: false, diagnostic: { stage: "zod_validation", diagnosticCode: "zod_validation_error", fields: ["projects.0.priceMin"], retryable: false } });
    expect(JSON.stringify(batch.items[0]?.diagnostic)).not.toContain("本文");
  });
  it("前処理失敗とAI応答失敗を段階で区別し、AIを呼ばない", async () => {
    const fresh = email("preprocess-fail");
    const client = { fetchDelta: vi.fn(async () => result([], [{ kind: "message" as const, email: fresh, contentType: "text" as const }])) };
    const classifyAndExtract = vi.fn();
    const batch = await runGraphMailBatch(client as never, "box@example.com", 3, { classifier: { classifyAndExtract } as never, preprocess: async () => { throw new Error("private message body"); }, retry: { maxAttempts: 1 } });
    expect(batch.items[0]).toMatchObject({ success: false, diagnostic: { stage: "preprocessing", diagnosticCode: "preprocessing_unknown_error", retryable: false } });
    expect(classifyAndExtract).not.toHaveBeenCalled();
    expect(JSON.stringify(batch.items[0]?.diagnostic)).not.toContain("private");
  });
});
