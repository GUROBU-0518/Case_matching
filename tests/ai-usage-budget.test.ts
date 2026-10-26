import { describe, expect, it } from "vitest";
import { AiUsageBudget } from "../src/ai/usage-budget.ts";

describe("AiUsageBudget", () => {
  it("上限を超える呼び出しを許可しない", () => {
    const budget = new AiUsageBudget(2);
    expect(budget.tryConsume()).toBe(true);
    expect(budget.tryConsume()).toBe(true);
    expect(budget.tryConsume()).toBe(false);
    expect(budget.count).toBe(2);
  });
});
