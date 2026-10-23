import type { StationDistanceMatch } from "../contracts/interfaces.ts";
import { stationDistanceConfig } from "./station-distance-config.ts";

export function isNearStationMatch(match: StationDistanceMatch | null): boolean {
  return match?.status === "OK" &&
    match.distanceBand === "NEAR" &&
    match.straightDistanceKm !== null &&
    match.straightDistanceKm <= stationDistanceConfig.searchMaxDistanceKm;
}
