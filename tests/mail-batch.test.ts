import { describe, expect, it } from "vitest";
import { runMailBatch } from "../src/batch/mail-batch.ts";
import type { CommonEmail } from "../src/mail/types.ts";

const email = (id: string, body = `本文 ${id}`): CommonEmail => ({
  mailboxId: "box", messageId: id, subject: `件名 ${id}`, sender: "test@example.invalid",
  receivedAt: new Date("2026-01-01T00:00:00Z"), body,
});

const processed = (body: string) => ({ originalBody: body, processedBody: body, signatureRemoved: false, quotedReplyRemoved: false });

describe("runMailBatch", () => {
  it("concurrency=1では入力順に逐次処理する", async () => {
    const active: string[] = [];
    const started: string[] = [];
    const result = await runMailBatch(async () => [email("1"), email("2"), email("3")], async (body) => {
      started.push(body);
      active.push(body);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active.pop();
      return processed(body);
    }, 1);
    expect(started).toEqual(["本文 1", "本文 2", "本文 3"]);
    expect(result.items.map((item) => item.messageId)).toEqual(["1", "2", "3"]);
    expect(result.concurrency).toBe(1);
  });

  it("concurrency=3で最大3件を並列処理し結果順を維持する", async () => {
    let active = 0;
    let maxActive = 0;
    const started: string[] = [];
    const completed: string[] = [];
    const result = await runMailBatch(async () => Array.from({ length: 7 }, (_, index) => email(String(index))), async (body) => {
      started.push(body);
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, body.endsWith("0") ? 20 : 5));
      active -= 1;
      completed.push(body);
      return processed(body);
    }, 3);
    expect(maxActive).toBe(3);
    expect(started.length).toBe(7);
    expect(completed).not.toEqual(started);
    expect(result.items.map((item) => item.messageId)).toEqual(["0", "1", "2", "3", "4", "5", "6"]);
    expect(result.successCount + result.failureCount).toBe(7);
  });

  it("1件の失敗後も残りを処理する", async () => {
    const result = await runMailBatch(async () => [email("1"), email("2"), email("3")], async (body) => {
      if (body.includes("2")) throw new Error("テスト用失敗");
      return processed(body);
    }, 3);
    expect(result.successCount).toBe(2);
    expect(result.failureCount).toBe(1);
    expect(result.items[1]?.error).toBe("テスト用失敗");
    expect(result.items[2]?.success).toBe(true);
  });

  it("0件を正常終了する", async () => {
    const result = await runMailBatch(async () => [], undefined, 3);
    expect(result.totalCount).toBe(0);
    expect(result.status).toBe("succeeded");
  });

  it("入力元エラーを呼び出し元へ返す", async () => {
    await expect(runMailBatch(async () => { throw new Error("読み込み失敗"); }, undefined, 3)).rejects.toThrow("読み込み失敗");
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])("不正なconcurrency値 %s を拒否する", async (value) => {
    await expect(runMailBatch(async () => [], undefined, value)).rejects.toThrow("concurrency");
  });

  it("原文と処理後本文を保持し同じ入力を再実行できる", async () => {
    const source = async () => [email("same", "  原文  ")];
    const first = await runMailBatch(source, undefined, 3);
    const second = await runMailBatch(source, undefined, 3);
    expect(first.items[0]?.processedBody).toBe(second.items[0]?.processedBody);
    expect(first.items[0]?.originalLength).toBe(6);
    expect(first.items[0]?.processedLength).toBe(2);
  });
});

describe("retry", () => {
  it("一時的エラーを最大2回再試行し成功を集計する", async () => {
    let calls = 0;
    const result = await runMailBatch(async () => [email("retry")], async (body) => {
      calls += 1;
      if (calls < 3) throw new (await import("../src/batch/mail-batch.ts")).MailProcessingError("temporary", { category: "temporary", code: "TIMEOUT" });
      return processed(body);
    }, 3, { retryDelaysMs: [0, 0] });
    expect(result.successCount).toBe(1);
    expect(result.totalAttempts).toBe(3);
    expect(result.totalRetryCount).toBe(2);
    expect(result.retriedSuccessCount).toBe(1);
    expect(result.items[0]?.attempts).toBe(3);
    expect(result.items[0]?.retryCount).toBe(2);
  });

  it("恒久的・分類不能エラーは再試行しない", async () => {
    for (const error of [
      new (await import("../src/batch/mail-batch.ts")).MailProcessingError("invalid", { category: "permanent", code: "INVALID_INPUT" }),
      new Error("unknown"),
    ]) {
      let calls = 0;
      const result = await runMailBatch(async () => [email("failure")], async () => { calls += 1; throw error; }, 3, { retryDelaysMs: [0, 0] });
      expect(calls).toBe(1);
      expect(result.failureCount).toBe(1);
      expect(result.items[0]?.attempts).toBe(1);
      expect(result.items[0]?.retryCount).toBe(0);
    }
  });

  it("最終失敗とリトライ待機を記録する", async () => {
    const waits: number[] = [];
    const result = await runMailBatch(async () => [email("fail")], async () => {
      throw new (await import("../src/batch/mail-batch.ts")).MailProcessingError("unavailable", { category: "temporary", code: "503" });
    }, 1, { retryDelaysMs: [10, 20], sleep: async (ms) => { waits.push(ms); } });
    expect(result.failureCount).toBe(1);
    expect(result.retryExhaustedCount).toBe(1);
    expect(result.items[0]?.attempts).toBe(3);
    expect(result.items[0]?.retryable).toBe(true);
    expect(waits).toEqual([10, 20]);
    expect(result.items[0]?.error).not.toContain("本文");
  });
});
