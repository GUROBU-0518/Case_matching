import { describe, expect, it, vi } from "vitest";
import { FAILED_MAIL_DIAGNOSTIC_TARGET_ID } from "../src/ai/failed-mail-diagnostic.ts";
import { reprocessFailedMail, validateFailedMailReprocessRecord, type FailedMailReprocessRecord } from "../src/ai/reprocess-failed-mail.ts";
import { reprocessFailedMailBatch } from "../src/ai/reprocess-failed-mail-batch.ts";
import type { AiResponse } from "../src/ai/types.ts";
import { persistAiExtraction } from "../src/db/mail-repository.ts";

const subject = "架空の再処理対象";
const record: FailedMailReprocessRecord = {
  id: FAILED_MAIL_DIAGNOSTIC_TARGET_ID,
  subject,
  mailboxId: "test-mailbox",
  graphMessageId: "test-graph-id",
  processedBody: null,
  aiProcessing: { aiStatus: "failed_permanent", status: "failed", retryCount: 1 },
  projectCount: 0,
  talentCount: 0,
};
const response = { classification: "project", projects: [], talents: [] } as AiResponse;
const fetched = { kind: "message" as const, contentType: "text" as const, email: { mailboxId: record.mailboxId, messageId: record.graphMessageId, subject, body: "架空メール本文", sender: "sender@example.invalid", receivedAt: new Date() } };
function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    graph: { fetchMessage: vi.fn(async () => fetched) },
    classifier: { classifyAndExtract: vi.fn(async () => response) },
    claim: vi.fn(async () => true),
    persist: vi.fn(async () => ({ skipped: false, projectCount: 1, talentCount: 0 })),
    recordFailure: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe("failed mail explicit reprocessing", () => {
  it("allows only the fixed failed target with no linked entities and retry headroom", () => {
    expect(validateFailedMailReprocessRecord(record)).toBeUndefined();
    expect(validateFailedMailReprocessRecord({ ...record, projectCount: 1 })?.diagnosticCode).toBe("existing_extraction_records");
    expect(validateFailedMailReprocessRecord({ ...record, aiProcessing: { ...record.aiProcessing!, retryCount: 3 } })?.diagnosticCode).toBe("retry_limit_reached");
  });

  it("re-fetches, preprocesses, claims once and persists through the injected existing transaction path", async () => {
    const deps = dependencies();
    const result = await reprocessFailedMail(record, deps as never);
    expect(result).toMatchObject({ ok: true, apiCalls: 1, classification: "project", projectCount: 1, talentCount: 0 });
    expect(deps.graph.fetchMessage).toHaveBeenCalledTimes(1);
    expect(deps.claim).toHaveBeenCalledWith({ id: record.id, subject, expectedProcessedBody: null });
    expect(deps.classifier.classifyAndExtract).toHaveBeenCalledTimes(1);
    expect(deps.classifier.classifyAndExtract).toHaveBeenCalledWith({ subject, processedBody: "架空メール本文" });
    expect(deps.persist).toHaveBeenCalledWith(record.id, response, "架空メール本文", null);
    expect(JSON.stringify(result)).not.toContain("架空メール本文");
  });

  it("rejects wrong ID, state, existing entities, and exhausted retries before Graph or AI", async () => {
    const deps = dependencies();
    const invalids = [
      { ...record, id: "not-allowlisted" },
      { ...record, aiProcessing: { ...record.aiProcessing!, aiStatus: "succeeded" } },
      { ...record, talentCount: 1 },
      { ...record, aiProcessing: { ...record.aiProcessing!, retryCount: 3 } },
    ];
    for (const invalid of invalids) expect((await reprocessFailedMail(invalid as FailedMailReprocessRecord, deps as never)).apiCalls).toBe(0);
    expect(deps.graph.fetchMessage).not.toHaveBeenCalled();
    expect(deps.classifier.classifyAndExtract).not.toHaveBeenCalled();
  });

  it("rejects a changed Graph target before claim or AI", async () => {
    const deps = dependencies({ graph: { fetchMessage: vi.fn(async () => ({ ...fetched, email: { ...fetched.email, subject: "different" } })) } });
    const result = await reprocessFailedMail(record, deps as never);
    expect(result).toMatchObject({ apiCalls: 0, diagnostic: { diagnosticCode: "graph_target_mismatch" } });
    expect(deps.claim).not.toHaveBeenCalled();
    expect(deps.classifier.classifyAndExtract).not.toHaveBeenCalled();
  });

  it("does not call AI when another run already claimed the row", async () => {
    const deps = dependencies({ claim: vi.fn(async () => false) });
    const result = await reprocessFailedMail(record, deps as never);
    expect(result).toMatchObject({ apiCalls: 0, diagnostic: { diagnosticCode: "target_changed_before_claim" } });
    expect(deps.classifier.classifyAndExtract).not.toHaveBeenCalled();
  });

  it("records a safe AI failure and never persists extraction data", async () => {
    const deps = dependencies({ classifier: { classifyAndExtract: vi.fn(async () => { throw Object.assign(new Error("private mail data"), { category: "permanent", diagnosticCode: "model_not_found" }); }) } });
    const result = await reprocessFailedMail(record, deps as never);
    expect(result).toMatchObject({ ok: false, apiCalls: 1, diagnostic: { diagnosticCode: "model_not_found" } });
    expect(deps.recordFailure).toHaveBeenCalledTimes(1);
    expect(deps.persist).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain("private mail data");
  });

  it("continues sequentially after one mail fails and aggregates only counts", async () => {
    const second = { ...record, id: "4dc6844f-3d5b-49af-a576-b5163f92fdf2" };
    const order: string[] = [];
    const deps = dependencies({
      graph: { fetchMessage: vi.fn(async () => { order.push("graph"); return fetched; }) },
      classifier: { classifyAndExtract: vi.fn(async () => { order.push("ai"); if (order.filter((part) => part === "ai").length === 1) throw Object.assign(new Error("private"), { category: "permanent", diagnosticCode: "mock_failure" }); return response; }) },
      claim: vi.fn(async () => { order.push("claim"); return true; }),
      persist: vi.fn(async () => { order.push("persist"); return { skipped: false, projectCount: 1, talentCount: 0 }; }),
      recordFailure: vi.fn(async () => { order.push("record-failure"); }),
    });
    const result = await reprocessFailedMailBatch([record, second], deps as never);
    expect(result).toMatchObject({ totalCount: 2, successCount: 1, failureCount: 1, apiCallCount: 2, projectCount: 1, talentCount: 0, diagnosticCodes: { mock_failure: 1 } });
    expect(order).toEqual(["graph", "claim", "ai", "record-failure", "graph", "claim", "ai", "persist"]);
    expect(JSON.stringify(result)).not.toContain("private");
  });

  it("updates processedBody and AI/entities in one Serializable Prisma transaction on reprocess", async () => {
    const tx = {
      aiProcessing: {
        findUnique: vi.fn(async () => ({ aiStatus: "processing", status: "pending" })),
        update: vi.fn(async () => undefined),
      },
      mailMessage: {
        findUnique: vi.fn(async () => ({ processedBody: null, _count: { projects: 0, talents: 0 } })),
        update: vi.fn(async () => undefined),
      },
      project: { createMany: vi.fn(async () => ({ count: 1 })) },
      talent: { createMany: vi.fn(async () => ({ count: 0 })) },
    };
    const prisma = { $transaction: vi.fn(async (callback: (client: typeof tx) => unknown, options: unknown) => { expect(options).toMatchObject({ isolationLevel: "Serializable" }); return callback(tx); }) };
    const result = await persistAiExtraction(prisma as never, record.id, response, "processed fictional body", { reprocess: { expectedProcessedBody: null } });
    expect(result).toMatchObject({ skipped: false, projectCount: 0, talentCount: 0 });
    expect(tx.mailMessage.update).toHaveBeenCalledWith({ where: { id: record.id }, data: { processedBody: "processed fictional body" } });
    expect(tx.project.createMany).not.toHaveBeenCalled();
    expect(tx.aiProcessing.update).toHaveBeenCalledWith(expect.objectContaining({ where: { mailMessageId: record.id }, data: expect.objectContaining({ aiStatus: "succeeded", classification: "project" }) }));
  });
});
