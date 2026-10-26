import { describe, expect, it } from "vitest";
import { createAmountRangeUpdatePlan } from "../src/db/amount-range-sync.ts";

describe("createAmountRangeUpdatePlan", () => {
  it("解析結果だけを更新計画に含める", () => {
    expect(createAmountRangeUpdatePlan([
      { id: "project-1", amountText: "70〜85万円程度" },
      { id: "project-2", amountText: "スキル見合い" },
    ])).toEqual([
      { id: "project-1", source: "70〜85万円程度", range: { minYen: 700000, maxYen: 850000 } },
      { id: "project-2", source: "スキル見合い", range: { minYen: null, maxYen: null } },
    ]);
  });
});
