import { describe, expect, it } from "vitest";
import { findRetryCandidates, isEligibleForNextBatchRetry } from "../src/db/mail-repository.ts";

describe("DB retry candidate search", () => {
  it("一時的失敗でMailMessage紐付きを候補として取得する", async () => {
    const fakePrisma = { aiProcessing: { findMany: async (args: unknown) => {
      expect(args).toEqual({ where: { status: "failed", errorType: "temporary", mailMessageId: { not: null } }, select: { id: true, mailMessageId: true, graphMessageId: true, status: true, errorType: true, retryCount: true } });
      return [{ id: "p1", mailMessageId: "m1", graphMessageId: "g1", status: "failed", errorType: "temporary", retryCount: 1 }];
    } } };
    const result = await findRetryCandidates(fakePrisma as never);
    expect(result).toHaveLength(1);
    expect(result[0]?.graphMessageId).toBe("g1");
  });

  it("再試行候補の上限判定を行う", () => {
    expect(isEligibleForNextBatchRetry({ status: "failed", errorType: "temporary", retryCount: 2 })).toBe(true);
    expect(isEligibleForNextBatchRetry({ status: "failed", errorType: "temporary", retryCount: 3 })).toBe(false);
    expect(isEligibleForNextBatchRetry({ status: "failed", errorType: "permanent", retryCount: 0 })).toBe(false);
    expect(isEligibleForNextBatchRetry({ status: "succeeded", errorType: "temporary", retryCount: 0 })).toBe(false);
  });
});
