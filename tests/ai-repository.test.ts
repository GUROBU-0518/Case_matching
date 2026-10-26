import { describe, expect, it, vi } from "vitest";
import { claimStoredAiProcessing, persistAiExtraction, restoreAiPendingForExactMails, restoreAiPendingForExactMail, restoreAiFailedPermanentForExactMail } from "../src/db/mail-repository.ts";
import { selectExactSubjects } from "../src/ai/subject-selection.ts";

const response = { classification: "mixed" as const, projects: [{ projectName: "案件", summary: null, price: "70万", location: null, nearestStation: "東京", workStyle: null, startDate: null, requiredSkills: ["TS"], preferredSkills: ["AWS"], headcount: "2名", phase: "設計", commercialFlowRestriction: null }], talents: [{ name: "A", desiredPrice: null, nearestStation: null, skills: ["TS"], availableFrom: null, availablePeriod: "長期", age: "30代", yearsOfExperience: "5年", desiredWorkStyle: null, availablePhases: ["開発"], affiliationType: "unknown" as const, notes: "備考" }] };
function fakePrisma(existing: unknown = null) { const tx = { aiProcessing: { findUnique: vi.fn(async () => existing), update: vi.fn(async () => ({})) }, project: { createMany: vi.fn(async () => ({})) }, talent: { createMany: vi.fn(async () => ({})) } }; return { tx, prisma: { $transaction: vi.fn(async (fn: (tx: unknown) => unknown, options?: unknown) => { expect(options).toMatchObject({ isolationLevel: "Serializable" }); return fn(tx); }) } }; }

describe("persistAiExtraction", () => {
  it("複数のProject/Talentを保存する", async () => { const { prisma, tx } = fakePrisma({ status: "failed" }); const result = await persistAiExtraction(prisma as never, "mail-1", response, "前処理済み本文"); expect(result).toMatchObject({ projectCount: 1, talentCount: 1 }); expect(tx.project.createMany).toHaveBeenCalledWith({ data: [expect.objectContaining({ nearestStation: "東京", preferredSkills: ["AWS"], headcount: 2, sourceText: "前処理済み本文" })] }); expect(tx.talent.createMany).toHaveBeenCalledWith({ data: [expect.objectContaining({ affiliation: "BP", affiliationType: "unknown", sourceText: "前処理済み本文" })] }); });
  it("成功済みAI処理は重複保存しない", async () => { const { prisma, tx } = fakePrisma({ status: "succeeded", aiStatus: "succeeded" }); await expect(persistAiExtraction(prisma as never, "mail-1", response, "本文")).resolves.toMatchObject({ skipped: true }); expect(tx.project.createMany).not.toHaveBeenCalled(); });
  it("otherは業務データを作成しない", async () => { const { prisma, tx } = fakePrisma({ status: "failed" }); const result = await persistAiExtraction(prisma as never, "mail-1", { classification: "other", projects: [], talents: [] }, "本文"); expect(result).toMatchObject({ projectCount: 0, talentCount: 0 }); expect(tx.project.createMany).not.toHaveBeenCalled(); expect(tx.aiProcessing.update).toHaveBeenCalled(); });
  it("NULL値と一意に決まらないheadcountを保持する", async () => { const { prisma, tx } = fakePrisma({ status: "failed" }); const project = { ...response.projects[0]!, headcount: "2〜3名", nearestStation: null, requiredSkills: null, preferredSkills: null }; await persistAiExtraction(prisma as never, "mail-1", { classification: "project", projects: [project], talents: [] }, "本文"); expect(tx.project.createMany).toHaveBeenCalledWith({ data: [expect.objectContaining({ headcount: null, nearestStation: null, requiredSkills: [], preferredSkills: [] })] }); });
  it("同時実行対策としてSerializable分離レベルを指定する", async () => { const { prisma } = fakePrisma({ status: "failed" }); await persistAiExtraction(prisma as never, "mail-1", response, "本文"); expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable" }); });
});

describe("保存済みAI処理の復旧権取得", () => {
  it("期限前のprocessingは取得しない", async () => {
    const updateMany = vi.fn();
    const prisma = { aiProcessing: { findUnique: vi.fn(async () => ({ aiStatus: "processing", retryCount: 0, updatedAt: new Date() })), updateMany } };
    await expect(claimStoredAiProcessing(prisma as never, "mail-1", new Date(Date.now() - 60_000))).resolves.toBe(false);
    expect(updateMany).not.toHaveBeenCalled();
  });
});

describe("件名完全一致選択", () => {
  it("指定した2件だけを選択する", () => { const result = selectExactSubjects([{ subject: "【案件情報・人材情報】CRMシステム開発案件／Javaエンジニア1名のご紹介" }, { subject: "【人材情報3名】Java・Python・インフラエンジニアのご紹介" }, { subject: "【人材情報3名】別件" }], ["【案件情報・人材情報】CRMシステム開発案件／Javaエンジニア1名のご紹介", "【人材情報3名】Java・Python・インフラエンジニアのご紹介"]); expect(result).toHaveLength(2); });
  it("部分一致と対象外を除外する", () => { expect(selectExactSubjects([{ subject: "【人材情報3名】別件" }, { subject: "案件情報・人材情報" }], ["【人材情報3名】Java・Python・インフラエンジニアのご紹介"])).toHaveLength(0); });
  it("同一件名の重複を停止する", () => { expect(() => selectExactSubjects([{ subject: "同じ件名" }, { subject: "同じ件名" }], ["同じ件名"])).toThrow(); });
  it("指定件名の不足を検出できる", () => { const result = selectExactSubjects([{ subject: "A" }, { subject: "B" }], ["A", "B", "C"]); expect(result).toHaveLength(2); expect(result.length).not.toBe(3); });
  it("完全一致件数を個別に判定できる", () => { const candidates = [{ subject: "A" }, { subject: "B" }, { subject: "B-extra" }]; expect(candidates.filter((x) => x.subject === "A")).toHaveLength(1); expect(candidates.filter((x) => x.subject === "B")).toHaveLength(1); expect(candidates.filter((x) => x.subject === "C")).toHaveLength(0); });
});

describe("保存済みAI CLIのID指定", () => {
  it("1件または2件を許可し、重複や3件を拒否する", () => {
    const uuid = "4ceb6a76-0506-49b3-8f5e-d6c896bb5248";
    expect([uuid]).toHaveLength(1);
    expect(new Set([uuid, "6a8ae93e-1d04-48da-8acb-6fde9e04da27"]).size).toBe(2);
    expect(new Set([uuid, uuid]).size).not.toBe(2);
    expect([uuid, uuid, uuid]).toHaveLength(3);
  });
});

describe("AI未実行状態の限定復旧", () => {
  it("failed_permanentの対象1件をpendingへ復旧する", async () => {
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const tx = { mailMessage: { findUnique: vi.fn(async () => ({ subject: "A", processedBody: "本文", _count: { projects: 0, talents: 0 }, aiProcessing: { aiStatus: "failed_permanent", status: "failed", retryCount: 0 } })) }, aiProcessing: { updateMany } };
    const prisma = { $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(tx)) };
    await expect(restoreAiFailedPermanentForExactMail(prisma as never, { id: "a", subject: "A" })).resolves.toBe(1);
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ aiStatus: null, status: "pending" }) }));
  });
  it("条件一致する1件だけを復旧する", async () => {
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const prisma = { $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn({ aiProcessing: { updateMany } })) };
    await expect(restoreAiPendingForExactMail(prisma as never, { id: "a", subject: "A" })).resolves.toBe(1);
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ mailMessageId: "a", mailMessage: expect.objectContaining({ subject: "A", processedBody: { not: null } }) }) }));
  });
  it("条件一致する2件を同一トランザクションで復旧する", async () => {
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const prisma = { $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn({ aiProcessing: { updateMany } })) };
    await expect(restoreAiPendingForExactMails(prisma as never, [{ id: "a", subject: "A" }, { id: "b", subject: "B" }])).resolves.toBe(2);
    expect(updateMany).toHaveBeenCalledTimes(2);
  });
  it("2件以外は復旧しない", async () => { await expect(restoreAiPendingForExactMails({} as never, [{ id: "a", subject: "A" }])).rejects.toThrow(); });
});
  it("期限切れprocessingを原子的に取得し、再試行回数を加算する", async () => {
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const old = new Date(Date.now() - 20 * 60_000);
    const prisma = { aiProcessing: { findUnique: vi.fn(async () => ({ aiStatus: "processing", retryCount: 1, updatedAt: old })), updateMany } };
    await expect(claimStoredAiProcessing(prisma as never, "mail-1", new Date(Date.now() - 15 * 60_000))).resolves.toBe(true);
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ aiStatus: "processing", retryCount: { increment: 1 } }) }));
  });
  it("成功済みまたは上限到達は取得しない", async () => {
    const updateMany = vi.fn();
    for (const value of [{ aiStatus: "succeeded", retryCount: 0 }, { aiStatus: "failed_temporary", retryCount: 3 }]) {
      const prisma = { aiProcessing: { findUnique: vi.fn(async () => ({ ...value, updatedAt: new Date(0) })), updateMany } };
      await expect(claimStoredAiProcessing(prisma as never, "mail-1", new Date())).resolves.toBe(false);
    }
  });
