import { describe, expect, it } from "vitest";
import { AiUsageBudget, parseAiMaxCalls } from "../src/ai/usage-budget.ts";

describe("AiUsageBudget", () => {
  it("上限を超える呼び出しを許可しない", () => {
    const budget = new AiUsageBudget(2);
    expect(budget.tryConsume()).toBe(true);
    expect(budget.tryConsume()).toBe(true);
    expect(budget.tryConsume()).toBe(false);
    expect(budget.count).toBe(2);
  });

  it("未設定なら無制限", () => {
    const budget = new AiUsageBudget(parseAiMaxCalls(undefined));
    for (let i = 0; i < 100; i += 1) expect(budget.tryConsume()).toBe(true);
    expect(budget.limit).toBe(Number.POSITIVE_INFINITY);
  });

  it.each(["1", "10"])("正の整数 %s を上限として受け付ける", (value) => {
    expect(parseAiMaxCalls(value)).toBe(Number(value));
  });

  it.each(["0", "-1", "1.5", "abc"])("不正値 %s を拒否する", (value) => {
    expect(() => parseAiMaxCalls(value)).toThrow("AI_MAX_CALLSは正の整数で指定してください");
  });
});
