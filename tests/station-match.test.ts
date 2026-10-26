import { describe, expect, it } from "vitest";
import { isNearStationMatch, sortByStationDistance } from "../src/domain/station-match.ts";
import type { StationDistanceMatch } from "../src/contracts/interfaces.ts";
import { classifyStationDistance, createStationDistanceConfig, stationDistanceConfig } from "../src/domain/station-distance-config.ts";

const match = (distance: number, distanceBand: StationDistanceMatch["distanceBand"] = "NEAR"): StationDistanceMatch => ({
  status: "OK",
  workplaceGroupCode: "workplace",
  personGroupCode: "person",
  workplaceDisplayName: "大森",
  personDisplayName: "大鳥居",
  straightDistanceKm: distance,
  distanceBand,
  method: "STRAIGHT_LINE"
});

describe("isNearStationMatch", () => {
  it("includes distances up to and including 10km", () => {
    expect(isNearStationMatch(match(9.999))).toBe(true);
    expect(isNearStationMatch(match(10))).toBe(true);
  });

  it("excludes distances over 10km and non-NEAR bands", () => {
    expect(isNearStationMatch(match(10.001))).toBe(false);
    expect(isNearStationMatch(match(10, "MIDDLE"))).toBe(false);
  });

  it("excludes unknown or missing station matches", () => {
    expect(isNearStationMatch(null)).toBe(false);
    expect(isNearStationMatch({ ...match(4), status: "UNKNOWN_PERSON_STATION", distanceBand: null, straightDistanceKm: null })).toBe(false);
  });
});

describe("station distance configuration", () => {
  it("classifies the default boundaries", () => {
    expect(classifyStationDistance(0)).toBe("NEAR");
    expect(classifyStationDistance(10)).toBe("NEAR");
    expect(classifyStationDistance(10.001)).toBe("MIDDLE");
    expect(classifyStationDistance(25)).toBe("MIDDLE");
    expect(classifyStationDistance(25.001)).toBe("FAR");
    expect(classifyStationDistance(40)).toBe("FAR");
    expect(classifyStationDistance(40.001)).toBe("VERY_FAR");
  });

  it("supports a changed NEAR threshold without changing the other bands", () => {
    const config = createStationDistanceConfig({ ...stationDistanceConfig, nearKm: 15 });
    expect(classifyStationDistance(14, config)).toBe("NEAR");
    expect(classifyStationDistance(15, config)).toBe("NEAR");
    expect(classifyStationDistance(16, config)).toBe("MIDDLE");
  });

  it("rejects invalid threshold ordering", () => {
    expect(() => createStationDistanceConfig({ ...stationDistanceConfig, middleKm: 10 })).toThrow();
  });
});

describe("station distance ordering", () => {
  it("sorts known distances ascending and keeps unknown stations last", () => {
    const newest = new Date("2026-10-26T12:00:00Z");
    const older = new Date("2026-10-25T12:00:00Z");
    const unknown = { ...match(0), status: "UNKNOWN_PERSON_STATION" as const, straightDistanceKm: null, distanceBand: null };

    const result = sortByStationDistance([
      { id: "talent-005", createdAt: newest, stationMatch: match(34.987, "FAR"), value: "far" },
      { id: "talent-002", createdAt: newest, stationMatch: unknown, value: "unknown-new" },
      { id: "talent-003", createdAt: older, stationMatch: match(4.205), value: "near" },
      { id: "talent-001", createdAt: newest, stationMatch: match(10.881, "MIDDLE"), value: "middle" },
      { id: "talent-004", createdAt: older, stationMatch: { ...unknown, personDisplayName: "別駅" }, value: "unknown-old" }
    ]);

    expect(result).toEqual(["near", "middle", "far", "unknown-new", "unknown-old"]);
  });

  it("uses createdAt desc and id asc when distances are equal", () => {
    const sameDistance = match(4.205);
    const date = new Date("2026-10-26T12:00:00Z");

    const result = sortByStationDistance([
      { id: "talent-002", createdAt: date, stationMatch: sameDistance, value: "second" },
      { id: "talent-001", createdAt: date, stationMatch: sameDistance, value: "first" }
    ]);

    expect(result).toEqual(["first", "second"]);
  });
});
