import { describe, expect, it } from "vitest";
import type { Talent } from "../src/domain/schemas.ts";
import { matchesTalentSearch, splitTalentKeywords } from "../src/domain/talent-search.ts";

const talent = (overrides: Partial<Talent> = {}): Talent & { id: string } => ({
  id: "talent-test",
  nameOrInitial: "山田 A.",
  technicalSkills: ["JavaScript", "PostgreSQL"],
  desiredRate: "91万円（応相談）",
  nearestStation: "新宿駅",
  desiredWorkStyle: null,
  availableFrom: "2026年11月",
  availableProcess: [],
  affiliation: "BP",
  sourceText: null,
  ...overrides,
});

describe("talent search", () => {
  it("splits half-width and full-width spaces and uses OR matching", () => {
    expect(splitTalentKeywords(" Java　新宿  ")).toEqual(["java", "新宿"]);
    expect(matchesTalentSearch(talent(), "Java 新宿")).toBe(true);
    expect(matchesTalentSearch(talent({ nearestStation: "横浜駅" }), "Java 新宿")).toBe(true);
    expect(matchesTalentSearch(talent({ technicalSkills: ["Python"], nearestStation: "横浜駅" }), "Java 新宿")).toBe(false);
  });

  it("matches skill substrings without case sensitivity", () => {
    expect(matchesTalentSearch(talent(), "java")).toBe(true);
    expect(matchesTalentSearch(talent({ technicalSkills: ["JavaScript"] }), "Java")).toBe(true);
  });

  it("compares explicit rate amounts exactly", () => {
    expect(matchesTalentSearch(talent(), "910000")).toBe(true);
    expect(matchesTalentSearch(talent(), "910,000")).toBe(true);
    expect(matchesTalentSearch(talent(), "９１００００")).toBe(true);
    expect(matchesTalentSearch(talent(), "910000円")).toBe(true);
    expect(matchesTalentSearch(talent(), "９１万円")).toBe(true);
    expect(matchesTalentSearch(talent({ desiredRate: "191万円" }), "91万円")).toBe(false);
    expect(matchesTalentSearch(talent({ desiredRate: "191万円" }), "910000")).toBe(false);
    expect(matchesTalentSearch(talent({ desiredRate: "91.5万円" }), "91万円")).toBe(false);
    expect(matchesTalentSearch(talent({ desiredRate: "91.5万円" }), "910000")).toBe(false);
    expect(matchesTalentSearch(talent({ desiredRate: "70〜80万円" }), "70万円")).toBe(false);
  });

  it("keeps non-amount rate text searchable", () => {
    expect(matchesTalentSearch(talent(), "応相談")).toBe(true);
    expect(matchesTalentSearch(talent({ desiredRate: "91万5000円" }), "915000円")).toBe(true);
    expect(matchesTalentSearch(talent({ desiredRate: "91円" }), "91")).toBe(true);
    expect(matchesTalentSearch(talent({ desiredRate: "91万円" }), "91")).toBe(false);
  });

  it("handles null fields and empty queries", () => {
    const record = talent({ nameOrInitial: null, nearestStation: null, desiredRate: null, technicalSkills: [] });
    expect(matchesTalentSearch(record, "")).toBe(true);
    expect(matchesTalentSearch(record, "新宿")).toBe(false);
  });
});
