import { describe, expect, it } from "vitest";
import { mockTalents } from "../src/mock/talents.ts";

describe("mock talents", () => {
  it("contains exactly 30 unique development records", () => {
    expect(mockTalents).toHaveLength(30);
    expect(new Set(mockTalents.map((talent) => talent.id)).size).toBe(30);
    expect(mockTalents.map((talent) => talent.id)).toEqual([
      ...Array.from({ length: 30 }, (_, index) => `mock-talent-${String(index + 1).padStart(3, "0")}`)
    ]);
  });

  it("keeps mock records free of source text and fixes affiliation to BP", () => {
    expect(mockTalents.every((talent) => talent.sourceText === null)).toBe(true);
    expect(mockTalents.every((talent) => talent.affiliation === "BP")).toBe(true);
    expect(mockTalents.every((talent) => Array.isArray(talent.technicalSkills))).toBe(true);
    expect(mockTalents.every((talent) => Array.isArray(talent.availableProcess))).toBe(true);
    expect(mockTalents.every((talent) => talent.createdAt instanceof Date)).toBe(true);
  });
});
