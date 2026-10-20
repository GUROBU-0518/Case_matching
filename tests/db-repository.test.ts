import { describe, expect, it } from "vitest";
import { findRetryCandidates, isEligibleForNextBatchRetry } from "../src/db/mail-repository.ts";

describe("DB retry candidate search", () => {
  it("一時的失敗でMailMessage紐付きを候補として取得する", async () => {
    const fakePrisma = { aiProcessing: { findMany: async (args: unknown) => {
      expect(args).toEqual({ where: { status: "failed", errorType: "temporary", mailMessageId: { not: null } }, select: { id: true, mailMessageId: true, graphMessageId: true, status: true, errorType: true, retryCount: true, mailMessage: { select: { mailboxId: true } } } });
      return [{ id: "p1", mailMessageId: "m1", graphMessageId: "g1", status: "failed", errorType: "temporary", retryCount: 1, mailMessage: { mailboxId: "a@example.com" } }];
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
