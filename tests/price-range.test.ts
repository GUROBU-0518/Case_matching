import { describe, expect, it } from "vitest";
import type { Project, Talent } from "../src/domain/schemas.ts";
import { matchesProjectTalentPrice } from "../src/domain/project-search.ts";

const project = (overrides: Partial<Project> = {}): Project & { id: string } => ({
  id: "p", projectName: null, summary: null, requiredSkills: null, rate: null,
  location: null, workStyle: null, startDate: null, headcount: null, process: null,
  commercialRestrictions: null, sourceText: null, unitPriceMin: null, unitPriceMax: 80, ...overrides
});
const talent = (overrides: Partial<Talent> = {}): Talent & { id: string } => ({
  id: "t", nameOrInitial: null, technicalSkills: null, desiredRate: null,
  nearestStation: null, desiredWorkStyle: null, availableFrom: null, availableProcess: null,
  affiliation: "BP", sourceText: null, desiredPriceMin: 60, desiredPriceMax: null, ...overrides
});

describe("price range matching", () => {
  it("matches only when both comparable values exist and talent min is within project max", () => {
    expect(matchesProjectTalentPrice(project(), talent())).toBe(true);
    expect(matchesProjectTalentPrice(project(), talent({ desiredPriceMin: 90 }))).toBe(false);
    expect(matchesProjectTalentPrice(project({ unitPriceMax: null }), talent())).toBe(false);
    expect(matchesProjectTalentPrice(project(), talent({ desiredPriceMin: null }))).toBe(false);
  });
});
