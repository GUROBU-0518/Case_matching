export type StationDistanceConfig = {
  readonly nearKm: number;
  readonly middleKm: number;
  readonly farKm: number;
  readonly searchMaxDistanceKm: number;
};

export const stationDistanceConfig: StationDistanceConfig = Object.freeze({
  nearKm: 10,
  middleKm: 25,
  farKm: 40,
  searchMaxDistanceKm: 10
});

export function createStationDistanceConfig(
  values: Omit<StationDistanceConfig, "searchMaxDistanceKm"> & { readonly searchMaxDistanceKm?: number }
): StationDistanceConfig {
  const searchMaxDistanceKm = values.searchMaxDistanceKm ?? values.nearKm;
  if (![values.nearKm, values.middleKm, values.farKm, searchMaxDistanceKm].every(Number.isFinite)) {
    throw new Error("Station distance thresholds must be finite numbers.");
  }
  if (values.nearKm < 0 || values.nearKm >= values.middleKm || values.middleKm >= values.farKm) {
    throw new Error("Station distance thresholds must satisfy 0 <= nearKm < middleKm < farKm.");
  }
  if (searchMaxDistanceKm < 0) {
    throw new Error("searchMaxDistanceKm must be non-negative.");
  }
  return Object.freeze({ ...values, searchMaxDistanceKm });
}

export type StationDistanceBand = "NEAR" | "MIDDLE" | "FAR" | "VERY_FAR";

export function classifyStationDistance(distanceKm: number, config: StationDistanceConfig = stationDistanceConfig): StationDistanceBand {
  if (!Number.isFinite(distanceKm) || distanceKm < 0) {
    throw new Error("Distance must be a non-negative finite number.");
  }
  if (distanceKm <= config.nearKm) return "NEAR";
  if (distanceKm <= config.middleKm) return "MIDDLE";
  if (distanceKm <= config.farKm) return "FAR";
  return "VERY_FAR";
}
