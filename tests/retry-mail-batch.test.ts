import { describe, expect, it, vi } from "vitest";
import { runRetryMailBatch } from "../src/batch/retry-mail-batch.ts";

const email = { mailboxId: "a@example.com", messageId: "g1", subject: "件名", sender: "s@example.com", receivedAt: new Date("2026-01-01T00:00:00Z"), body: "本文" };
function prismaWithCandidates(candidates: unknown[], failSave = false) {
  const aiProcessing = { findMany: vi.fn(async () => candidates), update: vi.fn(async () => ({})) };
  const tx = { mailMessage: { findUnique: vi.fn(async () => null), create: vi.fn(async () => { if (failSave) throw new Error("db"); return { id: "mail-1" }; }), update: vi.fn(async () => ({})) }, aiProcessing: { upsert: vi.fn(async () => ({})) } };
  return { aiProcessing, $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(tx)), batchRun: { create: vi.fn(async () => ({ id: "run-1" })) } };
}

describe("retry mail batch", () => {
  it("候補がない場合は正常に0件で終了する", async () => {
    const prisma = prismaWithCandidates([]);
    const result = await runRetryMailBatch(prisma as never, { fetchMessage: vi.fn() });
    expect(result).toMatchObject({ totalCount: 0, successCount: 0, failureCount: 0 });
  });

  it("Graphから再取得したメールを再処理しretryCountを増やす", async () => {
    const prisma = prismaWithCandidates([{ id: "p1", mailMessageId: "m1", mailboxId: "a@example.com", graphMessageId: "g1", status: "failed", errorType: "temporary", retryCount: 1, mailMessage: { mailboxId: "a@example.com" } }]);
    const graph = { fetchMessage: vi.fn(async () => ({ kind: "message" as const, contentType: "text" as const, email })) };
    const result = await runRetryMailBatch(prisma as never, graph);
    expect(graph.fetchMessage).toHaveBeenCalledWith("a@example.com", "g1");
    expect(result.items[0]).toMatchObject({ status: "succeeded", retryCount: 2 });
  });

  it("404相当のGraph失敗は候補単位でpermanent記録する", async () => {
    const prisma = prismaWithCandidates([{ id: "p1", mailMessageId: "m1", mailboxId: "a@example.com", graphMessageId: "gone", status: "failed", errorType: "temporary", retryCount: 0, mailMessage: { mailboxId: "a@example.com" } }]);
    const graph = { fetchMessage: vi.fn(async () => { throw Object.assign(new Error("Graphメールが見つかりません"), { category: "permanent", status: 404 }); }) };
    const result = await runRetryMailBatch(prisma as never, graph);
    expect(result.items[0]).toMatchObject({ status: "failed", errorType: "permanent", retryCount: 0 });
    expect(prisma.aiProcessing.update).toHaveBeenCalled();
  });

  it("T04成功でもDB保存失敗は再試行成功にしない", async () => {
    const prisma = prismaWithCandidates([{ id: "p1", mailMessageId: "m1", mailboxId: "a@example.com", graphMessageId: "g1", status: "failed", errorType: "temporary", retryCount: 0, mailMessage: { mailboxId: "a@example.com" } }], true);
    const graph = { fetchMessage: vi.fn(async () => ({ kind: "message" as const, contentType: "text" as const, email })) };
    const result = await runRetryMailBatch(prisma as never, graph);
    expect(result.items[0]).toMatchObject({ status: "failed", errorType: "unknown" });
  });
  it("subjectPrefix指定時は対象外の再試行候補を取得しない", async () => {
    const prisma = prismaWithCandidates([
      { id: "p1", mailMessageId: "m1", mailboxId: "a@example.com", graphMessageId: "g1", subject: "[T07]対象", status: "failed", errorType: "temporary", retryCount: 0, mailMessage: { mailboxId: "a@example.com", subject: "[T07]対象" } },
      { id: "p2", mailMessageId: "m2", mailboxId: "a@example.com", graphMessageId: "g2", subject: "通常メール", status: "failed", errorType: "temporary", retryCount: 0, mailMessage: { mailboxId: "a@example.com", subject: "通常メール" } },
    ]);
    const graph = { fetchMessage: vi.fn(async () => ({ kind: "message" as const, contentType: "text" as const, email })) };
    const result = await runRetryMailBatch(prisma as never, graph, { subjectPrefix: "[T07]" });
    expect(result.totalCount).toBe(1); expect(graph.fetchMessage).toHaveBeenCalledTimes(1);
  });
});
