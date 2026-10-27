import { describe, expect, it } from "vitest";
import type { StationDistanceMatch } from "../src/contracts/interfaces.ts";
import { hasMatchingProjectTag, matchesProjectConditions, matchesRateCondition, parseRateCondition, parseTalentRate } from "../src/domain/project-match-filter.ts";
import type { Talent } from "../src/domain/schemas.ts";

type TestTalent = Talent & { desiredRateMin: bigint | null; desiredRateMax: bigint | null };

const talent = (overrides: Partial<TestTalent> = {}): TestTalent => ({
  nameOrInitial: "サンプル",
  technicalSkills: ["Java"],
  desiredRate: "80万円",
  nearestStation: "大鳥居駅",
  desiredWorkStyle: "常駐",
  availableFrom: "即日",
  availableProcess: [],
  affiliation: "BP",
  sourceText: null,
  desiredRateMin: 800000n,
  desiredRateMax: 800000n,
  ...overrides
});

const near: StationDistanceMatch = {
  status: "OK", workplaceGroupCode: "w", personGroupCode: "p", workplaceDisplayName: "大森",
  personDisplayName: "大鳥居", straightDistanceKm: 10, distanceBand: "NEAR", method: "STRAIGHT_LINE"
};

const veryFar: StationDistanceMatch = {
  ...near,
  straightDistanceKm: 45,
  distanceBand: "VERY_FAR"
};

describe("project match filters", () => {
  it("ignores unset project tags and matches valid tags with OR", () => {
    expect(hasMatchingProjectTag(["Java", " ", "未設定"], talent())).toBe(true);
    expect(hasMatchingProjectTag(["Python", "未設定"], talent())).toBe(false);
    expect(hasMatchingProjectTag([null, ""], talent())).toBe(true);
  });

  it("parses inclusive single, upper, and range rate conditions", () => {
    expect(matchesRateCondition(parseRateCondition("80万円以下"), "80万円")).toBe(true);
    expect(matchesRateCondition(parseRateCondition("80万円以下"), "85万円")).toBe(false);
    expect(matchesRateCondition(parseRateCondition("75万～85万円"), "75万円")).toBe(true);
    expect(matchesRateCondition(parseRateCondition("75万～85万円"), "85万円")).toBe(true);
    expect(matchesRateCondition(parseRateCondition("70〜85万円程度"), "80万円")).toBe(true);
  });

  it("does not treat unparseable talent rates as matches for an active condition", () => {
    expect(parseTalentRate("スキル見合い")).toBeUndefined();
    expect(parseTalentRate("85万円（相談可能、140〜180時間）")).toBe(850000);
    expect(matchesRateCondition(parseRateCondition("80万円以下"), "スキル見合い")).toBe(false);
    expect(matchesRateCondition(undefined, null)).toBe(true);
  });

  it("keeps station and skill mismatches as candidates while enforcing rate", () => {
    const project = { requiredSkills: ["Java"], location: "大森", rateMin: 700000n, rateMax: 850000n };
    expect(matchesProjectConditions(project, talent(), near)).toBe(true);
    expect(matchesProjectConditions({ requiredSkills: [], location: null }, talent({ desiredRate: null, desiredRateMin: null, desiredRateMax: null }), null)).toBe(true);
    expect(matchesProjectConditions({ ...project, requiredSkills: ["Python"] }, talent(), near)).toBe(true);
    expect(matchesProjectConditions(project, talent({ desiredRate: "53万円", desiredRateMin: 530000n, desiredRateMax: 530000n }), near)).toBe(false);
    expect(matchesProjectConditions({ ...project, requiredSkills: ["Python"] }, talent({ nearestStation: null }), null)).toBe(true);
    expect(matchesProjectConditions(project, talent(), veryFar)).toBe(false);
  });
});
