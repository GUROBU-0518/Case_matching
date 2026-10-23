import type { StationDistanceMatch } from "../contracts/interfaces.ts";

export function isNearStationMatch(match: StationDistanceMatch | null): boolean {
  return match?.status === "OK" &&
    match.distanceBand === "NEAR" &&
    match.straightDistanceKm !== null &&
    match.straightDistanceKm <= 10;
}
