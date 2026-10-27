import { describe, expect, it, vi } from "vitest";
import { findRetryCandidates, isEligibleForNextBatchRetry, persistMailResult } from "../src/db/mail-repository.ts";

describe("DB retry candidate search", () => {
  it("一時的失敗でMailMessage紐付きを候補として取得する", async () => {
    const fakePrisma = { aiProcessing: { findMany: async (args: unknown) => {
      expect(args).toEqual({ where: { status: "failed", errorType: "temporary", mailMessageId: { not: null } }, select: { id: true, mailMessageId: true, graphMessageId: true, status: true, errorType: true, retryCount: true, mailMessage: { select: { mailboxId: true, subject: true } } } });
      return [{ id: "p1", mailMessageId: "m1", graphMessageId: "g1", status: "failed", errorType: "temporary", retryCount: 1, mailMessage: { mailboxId: "a@example.com", subject: "subject" } }];
    } } };
    const result = await findRetryCandidates(fakePrisma as never);
    expect(result).toHaveLength(1);
    expect(result[0]?.graphMessageId).toBe("g1");
    expect(result[0]?.mailboxId).toBe("a@example.com");
  });

  it("再試行候補の上限判定を行う", () => {
    expect(isEligibleForNextBatchRetry({ status: "failed", errorType: "temporary", retryCount: 2 })).toBe(true);
    expect(isEligibleForNextBatchRetry({ status: "failed", errorType: "temporary", retryCount: 3 })).toBe(false);
    expect(isEligibleForNextBatchRetry({ status: "failed", errorType: "permanent", retryCount: 0 })).toBe(false);
    expect(isEligibleForNextBatchRetry({ status: "succeeded", errorType: "temporary", retryCount: 0 })).toBe(false);
  });
  it("メールボックス指定で候補を分離する", async () => {
    const fakePrisma = { aiProcessing: { findMany: async (args: unknown) => {
      expect(args).toMatchObject({ where: { mailMessage: { mailboxId: "b@example.com" } } });
      return [];
    } } };
    await expect(findRetryCandidates(fakePrisma as never, "b@example.com")).resolves.toEqual([]);
  });
});

describe("safe AI failure diagnostic persistence", () => {
  it("stores only stage, code, field names, status and retry flag; never the message body", async () => {
    const upsert = vi.fn(async (args: unknown) => { expect(args).toBeDefined(); return {}; });
    const mailCreate = vi.fn(async (args: unknown) => { expect(args).toBeDefined(); return { id: "mail-db-id" }; });
    const tx = { mailMessage: { findUnique: vi.fn(async () => null), create: mailCreate }, aiProcessing: { upsert } };
    const prisma = { $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(tx)) };
    const email = { mailboxId: "box", messageId: "graph-id", subject: "subject", sender: "sender@example.invalid", receivedAt: new Date(), body: "private email body" };
    const result = {
      mailboxId: "box", messageId: "graph-id", success: false, status: "failed", attempts: 1, retryCount: 0,
      errorCategory: "permanent", errorCode: "zod_validation_error", retryable: false, originalLength: 18, processedLength: 0,
      error: "AI処理に失敗しました", diagnostic: { stage: "zod_validation", diagnosticCode: "zod_validation_error", fields: ["projects.0.priceMin"], httpStatus: 400, retryable: false },
    };
    await persistMailResult(prisma as never, email as never, result as never, { deferProcessingStatus: true });
    const args = upsert.mock.calls[0]?.[0] as { create: { errorMessage: string; aiStatus: string } };
    expect(JSON.parse(args.create.errorMessage)).toEqual(result.diagnostic);
    expect(args.create.aiStatus).toBe("failed_permanent");
    expect(args.create.errorMessage).not.toContain("private email body");
    expect(mailCreate.mock.calls[0]?.[0]).not.toHaveProperty("data.processedBody");
  });
});
