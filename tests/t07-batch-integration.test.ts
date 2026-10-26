/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from "vitest";
import { runGraphMailBatchWithPersistence } from "../src/batch/graph-mail-batch.ts";
import { runRetryMailBatch } from "../src/batch/retry-mail-batch.ts";
import type { CommonEmail } from "../src/mail/types.ts";

const email: CommonEmail = { mailboxId: "t07-box", messageId: "t07-message", subject: "架空案件", sender: "fake@example.invalid", receivedAt: new Date("2026-01-01T00:00:00Z"), body: "案件本文" };
const response = { classification: "mixed" as const, projects: [{ projectName: "架空案件", summary: "概要", price: null, location: null, nearestStation: null, workStyle: null, startDate: null, requiredSkills: ["TypeScript"], preferredSkills: null, headcount: "2名", phase: null, commercialFlowRestriction: null }], talents: [{ name: "架空人材", desiredPrice: null, nearestStation: null, skills: ["TypeScript"], availableFrom: null, availablePeriod: null, age: null, yearsOfExperience: null, desiredWorkStyle: null, availablePhases: null, affiliationType: "unknown" as const, notes: null }] };

function memoryPrisma() {
  const mails: any[] = [], processing: any[] = [], projects: any[] = [], talents: any[] = [];
  const findMail = (id: string) => mails.find((m) => m.id === id || (m.mailboxId === email.mailboxId && m.graphMessageId === id));
  const tx: any = {
    mailMessage: { findUnique: vi.fn(async ({ where }: any) => where.mailboxId_graphMessageId ? mails.find((m) => m.mailboxId === where.mailboxId_graphMessageId.mailboxId && m.graphMessageId === where.mailboxId_graphMessageId.graphMessageId) ?? null : findMail(where.id) ?? null), create: vi.fn(async ({ data }: any) => { mails.push(data); return data; }), update: vi.fn(async ({ where, data }: any) => { const m=mails.find((x)=>x.id===where.id); Object.assign(m,data); return m; }) },
    aiProcessing: { findUnique: vi.fn(async ({ where }: any) => processing.find((p) => p.mailMessageId === where.mailMessageId) ?? null), upsert: vi.fn(async ({ where, create, update }: any) => { const p = processing.find((x) => x.mailMessageId === where.mailMessageId); if (p) Object.assign(p, update); else processing.push(create); return p ?? create; }), update: vi.fn(async ({ where, data }: any) => { const p = processing.find((x) => x.mailMessageId === where.mailMessageId || x.id === where.id); if (!p) throw new Error("processing not found"); Object.assign(p, data); return p; }) },
    project: { createMany: vi.fn(async ({ data }: any) => { projects.push(...data); return { count: data.length }; }) },
    talent: { createMany: vi.fn(async ({ data }: any) => { talents.push(...data); return { count: data.length }; }) },
  };
  const prisma: any = { ...tx, batchRun: { create: vi.fn(async () => ({ id: "run" })) }, $transaction: vi.fn(async (fn: any) => fn(tx)) };
  prisma.aiProcessing.findMany = vi.fn(async () => processing.filter((p) => p.status === "failed" && p.errorType === "temporary").map((p) => ({ ...p, mailMessage: { mailboxId: email.mailboxId } })));
  return { prisma, mails, processing, projects, talents };
}

describe("T07 Graph-T04-AI-DB integration", () => {
  it("初回temporary失敗から次回Graph再取得・AI成功まで接続する", async () => {
    const db = memoryPrisma();
    const delta = { fetchDelta: vi.fn(async () => ({ mailboxId: email.mailboxId, changes: [{ kind: "new" as const, message: { kind: "message" as const, email, contentType: "text" as const } }], newMessages: [{ kind: "message" as const, email, contentType: "text" as const }], deltaLink: "secret-delta", pagesFetched: 1 })), commitDeltaLink: vi.fn(async () => {}) };
    const failing = { classifyAndExtract: vi.fn(async () => { throw Object.assign(new Error("temporary"), { category: "temporary", retryable: true }); }) };
    const first = await runGraphMailBatchWithPersistence(delta as never, db.prisma, email.mailboxId, 3, { classifier: failing as never, retry: { retryDelaysMs: [0, 0] } });
    expect(first.batch.failureCount).toBe(1); expect(first.persistence?.dbSaveFailureCount).toBe(0); expect(first.deltaLinkSaved).toBe(true); expect(db.processing[0]).toMatchObject({ status: "failed", errorType: "temporary" });
    const succeeding = { classifyAndExtract: vi.fn(async () => response) };
    const retry = await runRetryMailBatch(db.prisma, { fetchMessage: vi.fn(async () => ({ kind: "message" as const, email, contentType: "text" as const })) }, { mailboxId: email.mailboxId, classifier: succeeding as never });
    expect(retry).toMatchObject({ totalCount: 1, successCount: 1, failureCount: 0 }); expect(succeeding.classifyAndExtract).toHaveBeenCalledTimes(1); expect(db.processing[0].status).toBe("succeeded"); expect(db.projects).toHaveLength(1); expect(db.talents).toHaveLength(1); expect(db.projects[0].sourceText).toBe("案件本文"); expect(db.talents[0].affiliation).toBe("BP");
  });
});
