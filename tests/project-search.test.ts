import { describe, expect, it } from "vitest";
import type { Project } from "../src/domain/schemas.ts";
import { matchesProjectSearch, splitProjectKeywords } from "../src/domain/project-search.ts";

const project = (overrides: Partial<Project> = {}): Project & { id: string } => ({
  id: "project-test",
  projectName: "Java開発支援",
  summary: null,
  requiredSkills: ["JavaScript", "PostgreSQL"],
  rate: "80万円",
  location: "大森",
  workStyle: "基本リモート",
  startDate: "2026年11月",
  headcount: null,
  process: "設計、製造",
  commercialRestrictions: null,
  sourceText: null,
  ...overrides,
});

describe("project search", () => {
  it("normalizes spaces and uses OR matching across seven fields", () => {
    expect(splitProjectKeywords(" Java　大森 ")).toEqual(["java", "大森"]);
    expect(matchesProjectSearch(project(), "Java 大阪")).toBe(true);
    expect(matchesProjectSearch(project({ location: "横浜" }), "Java 大阪")).toBe(true);
    expect(matchesProjectSearch(project({ projectName: "保守", location: "横浜", requiredSkills: ["Python"] }), "Java 大阪")).toBe(false);
  });

  it("matches skills, process, work style, location, date and null fields", () => {
    expect(matchesProjectSearch(project(), "javascript")).toBe(true);
    expect(matchesProjectSearch(project(), "製造")).toBe(true);
    expect(matchesProjectSearch(project(), "リモート")).toBe(true);
    expect(matchesProjectSearch(project(), "2026年11月")).toBe(true);
    expect(matchesProjectSearch(project({ projectName: null, requiredSkills: [], process: null, location: null, workStyle: null, startDate: null, rate: null }), "Java")).toBe(false);
    expect(matchesProjectSearch(project({ projectName: null, requiredSkills: [], process: null, location: null, workStyle: null, startDate: null, rate: null }), "")).toBe(true);
  });

  it("compares single rates exactly and excludes ranges from amount matching", () => {
    expect(matchesProjectSearch(project(), "800000")).toBe(true);
    expect(matchesProjectSearch(project(), "800,000円")).toBe(true);
    expect(matchesProjectSearch(project(), "８０万円")).toBe(true);
    expect(matchesProjectSearch(project({ rate: "180万円" }), "80万円")).toBe(false);
    expect(matchesProjectSearch(project({ rate: "70〜85万円程度" }), "80万円")).toBe(false);
    expect(matchesProjectSearch(project({ rate: "70〜85万円程度" }), "70〜85万円")).toBe(true);
    expect(matchesProjectSearch(project({ rate: "80万円以上" }), "80万円")).toBe(false);
    expect(matchesProjectSearch(project({ rate: "80万円以下" }), "80万円")).toBe(false);
    expect(matchesProjectSearch(project({ rate: "スキル見合い" }), "スキル")).toBe(true);
  });
});
