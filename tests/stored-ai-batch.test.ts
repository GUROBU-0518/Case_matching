import { describe, expect, it, vi } from "vitest";
import { runStoredAiPendingBatch } from "../src/batch/stored-ai-batch.ts";
import { AiUsageBudget } from "../src/ai/usage-budget.ts";

const response = { classification: "other" as const, projects: [], talents: [] };

function fixture(processedBody: string | null = null) {
  return { id: "mail-1", mailboxId: "intern@example.com", graphMessageId: "graph-1", subject: "test", processedBody, aiProcessing: { retryCount: 0 } };
}

function fakePrisma(candidate: ReturnType<typeof fixture>, saveCount = 1) {
  const state = { aiStatus: null as string | null, retryCount: 0, updatedAt: new Date() };
  const tx = {
    aiProcessing: {
      findUnique: vi.fn(async () => state),
      updateMany: vi.fn(async () => { state.aiStatus = "processing"; return { count: 1 }; }),
      update: vi.fn(async () => { state.aiStatus = "succeeded"; return {}; }),
    },
    project: { createMany: vi.fn(async () => ({ count: 0 })) },
    talent: { createMany: vi.fn(async () => ({ count: 0 })) },
  };
  return {
    mailMessage: {
      findMany: vi.fn(async () => [candidate]),
      updateMany: vi.fn(async () => ({ count: saveCount })),
    },
    aiProcessing: tx.aiProcessing,
    $transaction: vi.fn(async (fn: (value: typeof tx) => unknown) => fn(tx)),
    _state: state,
  } as unknown as Parameters<typeof runStoredAiPendingBatch>[0] & { _state: typeof state };
}

function classifier(callCount: { value: number }, fail = false) {
  return { classifyAndExtract: vi.fn(async () => { callCount.value += 1; if (fail) throw new Error("mock failure"); return response; }) } as never;
}

describe("保存済みAI未処理メールの本文再取得", () => {
  it("本文NULLをGraph再取得・前処理・保存してからAI処理する", async () => {
    const calls = { value: 0 };
    const prisma = fakePrisma(fixture(null));
    const graph = { fetchMessage: vi.fn(async () => ({ kind: "message" as const, contentType: "text" as const, email: { mailboxId: "intern@example.com", messageId: "graph-1", subject: "test", sender: "masked@example.com", receivedAt: new Date("2026-01-01T00:00:00.000Z"), body: "案件本文" } })) };
    const result = await runStoredAiPendingBatch(prisma, classifier(calls), { budget: new AiUsageBudget(10), graphClient: graph });
    expect(graph.fetchMessage).toHaveBeenCalledWith("intern@example.com", "graph-1");
    expect(prisma.mailMessage.updateMany).toHaveBeenCalled();
    expect(calls.value).toBe(1);
    expect(result.bodyRefetchSuccessCount).toBe(1);
    expect(result.successCount).toBe(1);
  });

  it("Graph再取得失敗時はAIを呼び出さず一時失敗を記録する", async () => {
    const calls = { value: 0 };
    const prisma = fakePrisma(fixture(null));
    const graph = { fetchMessage: vi.fn(async () => { throw Object.assign(new Error("temporary"), { category: "temporary" }); }) };
    const result = await runStoredAiPendingBatch(prisma, classifier(calls), { budget: new AiUsageBudget(10), graphClient: graph });
    expect(calls.value).toBe(0);
    expect(prisma.mailMessage.updateMany).not.toHaveBeenCalled();
    expect(prisma.aiProcessing.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ aiStatus: "failed_temporary" }) }));
    expect(result.bodyRefetchFailureCount).toBe(1);
  });

  it("保存済み本文がある場合はGraphを呼ばずAI処理する", async () => {
    const calls = { value: 0 };
    const prisma = fakePrisma(fixture("保存済み本文"));
    const graph = { fetchMessage: vi.fn() };
    const result = await runStoredAiPendingBatch(prisma, classifier(calls), { budget: new AiUsageBudget(10), graphClient: graph });
    expect(graph.fetchMessage).not.toHaveBeenCalled();
    expect(calls.value).toBe(1);
    expect(result.bodyRefetchCandidates).toBe(0);
  });

  it("AI予算上限到達時は呼び出さず未処理候補を繰り越す", async () => {
    const calls = { value: 0 };
    const prisma = fakePrisma(fixture("保存済み本文"));
    const result = await runStoredAiPendingBatch(prisma, classifier(calls), { budget: new AiUsageBudget(1) });
    expect(calls.value).toBe(1);
    expect(result.deferredCount).toBe(0);
  });
});
