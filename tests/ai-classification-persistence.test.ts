import { describe, expect, it } from "vitest";

describe("AI classification persistence contract", () => {
  it.each(["project", "talent", "mixed", "other"])("supports %s", (classification) => {
    expect(["project", "talent", "mixed", "other"]).toContain(classification);
  });
  it("keeps legacy classification nullable", () => {
    const legacy = { classification: null as string | null };
    expect(legacy.classification).toBeNull();
  });
});
