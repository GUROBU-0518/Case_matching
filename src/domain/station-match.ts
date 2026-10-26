import type { StationDistanceMatch } from "../contracts/interfaces.ts";
import { stationDistanceConfig } from "./station-distance-config.ts";

export type StationDistanceSortableRecord<T> = {
  readonly id: string;
  readonly createdAt: Date;
  readonly stationMatch: StationDistanceMatch | null;
  readonly value: T;
};

export function isNearStationMatch(match: StationDistanceMatch | null): boolean {
  return match?.status === "OK" &&
    match.distanceBand === "NEAR" &&
    match.straightDistanceKm !== null &&
    match.straightDistanceKm <= stationDistanceConfig.searchMaxDistanceKm;
}

export function sortByStationDistance<T>(records: readonly StationDistanceSortableRecord<T>[]): T[] {
  return [...records]
    .sort((left, right) => {
      const leftDistance = left.stationMatch?.status === "OK" ? left.stationMatch.straightDistanceKm : null;
      const rightDistance = right.stationMatch?.status === "OK" ? right.stationMatch.straightDistanceKm : null;
      const leftUnknown = leftDistance === null;
      const rightUnknown = rightDistance === null;

      if (leftUnknown !== rightUnknown) return leftUnknown ? 1 : -1;
      if (!leftUnknown && !rightUnknown && leftDistance !== rightDistance) return leftDistance - rightDistance;

      const createdAtOrder = right.createdAt.getTime() - left.createdAt.getTime();
      return createdAtOrder !== 0 ? createdAtOrder : left.id.localeCompare(right.id);
    })
    .map((record) => record.value);
}
