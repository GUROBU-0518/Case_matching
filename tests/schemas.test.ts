import { describe, expect, it } from "vitest";
import { projectSchema, talentSchema } from "../src/domain/schemas.js";

describe("fixed domain schemas", () => {
  it("accepts unknown values as null and fixes affiliation to BP", () => {
    const project = projectSchema.parse({
      projectName: null,
      summary: null,
      requiredSkills: null,
      rate: null,
      location: null,
      workStyle: null,
      startDate: null,
      headcount: null,
      process: null,
      commercialRestrictions: null,
      sourceText: null
    });
    const talent = talentSchema.parse({
      nameOrInitial: null,
      technicalSkills: null,
      desiredRate: null,
      nearestStation: null,
      desiredWorkStyle: null,
      availableFrom: null,
      availableProcess: null,
      affiliation: "BP",
      sourceText: null
    });

    expect(project.projectName).toBeNull();
    expect(talent.affiliation).toBe("BP");
  });

  it("rejects an affiliation other than BP", () => {
    expect(() => talentSchema.parse({
      nameOrInitial: null,
      technicalSkills: null,
      desiredRate: null,
      nearestStation: null,
      desiredWorkStyle: null,
      availableFrom: null,
      availableProcess: null,
      affiliation: "Other",
      sourceText: null
    })).toThrow();
  });
});
