import { describe, expect, it } from "vitest";
import { getTalentRegistrationSince, parseTalentRegistrationPeriod } from "../src/domain/talent-filter.ts";

describe("talent registration period", () => {
  it("calculates the first day of the target month in JST", () => {
    const now = new Date("2026-10-21T03:00:00.000Z");

    expect(getTalentRegistrationSince(now, "1")).toEqual(new Date("2026-08-31T15:00:00.000Z"));
    expect(getTalentRegistrationSince(now, "2")).toEqual(new Date("2026-07-31T15:00:00.000Z"));
    expect(getTalentRegistrationSince(now, "3")).toEqual(new Date("2026-06-30T15:00:00.000Z"));
  });

  it("handles year boundaries and all-period selection", () => {
    const now = new Date("2026-01-21T03:00:00.000Z");

    expect(getTalentRegistrationSince(now, "1")).toEqual(new Date("2025-11-30T15:00:00.000Z"));
    expect(getTalentRegistrationSince(now, "all")).toBeUndefined();
    expect(parseTalentRegistrationPeriod(null)).toBe("1");
    expect(parseTalentRegistrationPeriod("invalid")).toBe("1");
  });
});
