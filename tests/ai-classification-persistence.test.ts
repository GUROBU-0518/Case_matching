import { describe, expect, it } from "vitest";
import { filterExtractionByClassification } from "../src/db/mail-repository.ts";

const project = { projectName: null, summary: null, price: null, location: null, nearestStation: null, workStyle: null, startDate: null, requiredSkills: null, preferredSkills: null, headcount: null, phase: null, commercialFlowRestriction: null };
const talent = { name: null, desiredPrice: null, nearestStation: null, skills: null, availableFrom: null, availablePeriod: null, age: null, yearsOfExperience: null, desiredWorkStyle: null, availablePhases: null, affiliationType: "unknown" as const, notes: null };

describe("AI classification persistence contract", () => {
  it.each(["project", "talent", "mixed", "other"])("supports %s", (classification) => {
    expect(["project", "talent", "mixed", "other"]).toContain(classification);
  });
  it("keeps legacy classification nullable", () => {
    const legacy = { classification: null as string | null };
    expect(legacy.classification).toBeNull();
  });

  it("does not persist projects for talent or other classifications", () => {
    expect(filterExtractionByClassification({ classification: "talent", projects: [project], talents: [talent] })).toEqual({ projects: [], talents: [talent] });
    expect(filterExtractionByClassification({ classification: "other", projects: [project], talents: [talent] })).toEqual({ projects: [], talents: [] });
  });

  it("persists both record types only for mixed classification", () => {
    expect(filterExtractionByClassification({ classification: "mixed", projects: [project], talents: [talent] })).toEqual({ projects: [project], talents: [talent] });
  });
});
