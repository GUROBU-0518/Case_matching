import { describe, expect, it } from "vitest";
import { parseAmountRange } from "../src/domain/amount-range.ts";

describe("parseAmountRange", () => {
  it("parses single yen and man-yen amounts", () => {
    expect(parseAmountRange("70万円")).toEqual({ minYen: 700000, maxYen: 700000 });
    expect(parseAmountRange("910000円")).toEqual({ minYen: 910000, maxYen: 910000 });
    expect(parseAmountRange("91万5000円")).toEqual({ minYen: 915000, maxYen: 915000 });
  });

  it("parses range separators and suffixes", () => {
    for (const value of ["70〜85万円", "70～85万円", "70-85万円", "70万円〜85万円", "70〜85万円程度"]) {
      expect(parseAmountRange(value)).toEqual({ minYen: 700000, maxYen: 850000 });
    }
    expect(parseAmountRange("91万円（応相談）")).toEqual({ minYen: 910000, maxYen: 910000 });
  });

  it("normalizes full-width digits, commas, and spaces", () => {
    expect(parseAmountRange("８０万円")).toEqual({ minYen: 800000, maxYen: 800000 });
    expect(parseAmountRange("800,000円")).toEqual({ minYen: 800000, maxYen: 800000 });
    expect(parseAmountRange("70 万円 ～ 85 万円")).toEqual({ minYen: 700000, maxYen: 850000 });
  });

  it("accepts zero and one yen", () => {
    expect(parseAmountRange("0円")).toEqual({ minYen: 0, maxYen: 0 });
    expect(parseAmountRange("1円")).toEqual({ minYen: 1, maxYen: 1 });
  });

  it("rejects unset, unrelated, one-sided, and invalid values", () => {
    for (const value of [null, undefined, "", "応相談", "スキル見合い", "未設定", "経験5年", "80万円以下", "80万円以上", "80万円まで", "80万円から", "85〜70万円", "-80万円", "NaN円", "Infinity円"]) {
      expect(parseAmountRange(value)).toEqual({ minYen: null, maxYen: null });
    }
  });

  it("rejects values beyond JavaScript's safe integer range", () => {
    expect(parseAmountRange("9007199254740992円")).toEqual({ minYen: null, maxYen: null });
  });
});
