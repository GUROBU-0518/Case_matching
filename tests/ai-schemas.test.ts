import { describe, expect, it } from "vitest";
import { aiResponseSchema } from "../src/ai/schemas.ts";

const project = { projectName: "案件", summary: null, price: null, location: null, nearestStation: null, workStyle: null, startDate: null, requiredSkills: ["TypeScript"], preferredSkills: null, headcount: null, phase: null, commercialFlowRestriction: null };
const talent = { name: "候補者", desiredPrice: null, nearestStation: null, skills: ["TypeScript"], availableFrom: null, availablePeriod: null, age: null, yearsOfExperience: null, desiredWorkStyle: null, availablePhases: null, affiliationType: "unknown" as const, notes: null };

describe("AI response schema", () => {
  it("案件1件を検証できる", () => expect(aiResponseSchema.parse({ classification: "project", projects: [project], talents: [] }).projects).toHaveLength(1));
  it("人材1人を検証できる", () => expect(aiResponseSchema.parse({ classification: "talent", projects: [], talents: [talent] }).talents).toHaveLength(1));
  it("案件と人材の混在を検証できる", () => expect(aiResponseSchema.parse({ classification: "mixed", projects: [project], talents: [talent] }).classification).toBe("mixed"));
  it("複数案件・複数人材を検証できる", () => expect(aiResponseSchema.parse({ classification: "mixed", projects: [project, project], talents: [talent, talent, talent] }).talents).toHaveLength(3));
  it("otherで空配列を許可する", () => expect(aiResponseSchema.parse({ classification: "other", projects: [], talents: [] }).classification).toBe("other"));
  it("不明項目のnullを許可する", () => expect(aiResponseSchema.parse({ classification: "project", projects: [{ ...project, requiredSkills: null }], talents: [] }).projects[0]?.summary).toBeNull());
  it("必須キー欠落を拒否する", () => expect(() => aiResponseSchema.parse({ classification: "other", projects: [] })).toThrow());
  it("classificationと配列件数の不整合を拒否する", () => expect(() => aiResponseSchema.parse({ classification: "project", projects: [], talents: [talent] })).toThrow());
  it("不正なaffiliationTypeを拒否する", () => expect(() => aiResponseSchema.parse({ classification: "talent", projects: [], talents: [{ ...talent, affiliationType: "bp" }] })).toThrow());
  it("配列項目の型不一致を拒否する", () => expect(() => aiResponseSchema.parse({ classification: "project", projects: [{ ...project, requiredSkills: "TypeScript" }], talents: [] })).toThrow());
});
