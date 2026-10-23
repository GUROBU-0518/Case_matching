import type { StationDistanceMatch } from "../contracts/interfaces.ts";
import type { Project, Talent } from "./schemas.ts";
import { isNearStationMatch } from "./station-match.ts";

export const matchPolicy = {
  tagMatchMode: "OR",
  unsetProjectTag: "skip",
  unsetStation: "skip",
  unsetRate: "skip",
  stationMaxDistanceKm: 10
} as const;

export type RateCondition =
  | { readonly kind: "single"; readonly amount: number }
  | { readonly kind: "range"; readonly min: number; readonly max: number }
  | { readonly kind: "upper"; readonly max: number }
  | { readonly kind: "lower"; readonly min: number };

function normalizeText(value: string): string {
  return value.normalize("NFKC").replace(/[\s,]/gu, "").trim();
}

function amountFromParts(man: string, remainder?: string): number | undefined {
  const amount = Number(man) * 10000 + (remainder ? Number(remainder) : 0);
  return Number.isFinite(amount) ? amount : undefined;
}

function parseAmount(value: string): number | undefined {
  const normalized = normalizeText(value);
  const match = normalized.match(/^(\d+(?:\.\d+)?)万(\d+)?円?/u) ?? normalized.match(/^(\d+(?:\.\d+)?)円/u);
  if (match?.[1]) {
    return normalized.includes("万") ? amountFromParts(match[1], match[2]) : Number(match[1]);
  }
  if (/^\d+(?:\.\d+)?$/u.test(normalized)) return Number(normalized);
  return undefined;
}

export function parseRateCondition(value: string | null): RateCondition | undefined {
  if (!value || !value.trim()) return undefined;
  const normalized = value.normalize("NFKC").replace(/[\s,]/gu, "");
  const range = normalized.match(/^(\d+(?:\.\d+)?)万[〜~～-](\d+(?:\.\d+)?)万(?:円)?/u);
  if (range?.[1] && range[2]) {
    const min = amountFromParts(range[1]);
    const max = amountFromParts(range[2]);
    if (min !== undefined && max !== undefined) return { kind: "range", min, max };
  }

  const upper = normalized.match(/^(.*?)(以下|未満)/u);
  if (upper?.[1]) {
    const max = parseAmount(upper[1]);
    if (max !== undefined) return { kind: "upper", max };
  }

  const lower = normalized.match(/^(.*?)(以上|超)/u);
  if (lower?.[1]) {
    const min = parseAmount(lower[1]);
    if (min !== undefined) return { kind: "lower", min };
  }

  const amount = parseAmount(normalized);
  return amount === undefined ? undefined : { kind: "single", amount };
}

export function parseTalentRate(value: string | null): number | undefined {
  if (!value || !value.trim()) return undefined;
  const normalized = value.normalize("NFKC").replace(/[\s,]/gu, "");
  if (/^\d+(?:\.\d+)?万[〜~～-]/u.test(normalized)) return undefined;
  return parseAmount(normalized);
}

export function isUnsetProjectTag(value: string | null | undefined): boolean {
  return !value || !value.trim() || value.trim() === "未設定";
}

export function hasMatchingProjectTag(projectTags: readonly (string | null | undefined)[] | null, talent: Talent): boolean {
  const tags = (projectTags ?? []).filter((tag): tag is string => !isUnsetProjectTag(tag));
  if (tags.length === 0) return true;
  const skills = talent.technicalSkills ?? [];
  return tags.some((tag) => {
    const normalizedTag = tag.normalize("NFKC").toLocaleLowerCase("ja-JP").trim();
    return skills.some((skill) => skill.normalize("NFKC").toLocaleLowerCase("ja-JP").includes(normalizedTag));
  });
}

export function matchesRateCondition(condition: RateCondition | undefined, talentRate: string | null): boolean {
  if (!condition) return true;
  const amount = parseTalentRate(talentRate);
  if (amount === undefined) return false;
  if (condition.kind === "single") return amount === condition.amount;
  if (condition.kind === "range") return amount >= condition.min && amount <= condition.max;
  if (condition.kind === "upper") return amount <= condition.max;
  return amount >= condition.min;
}

export function matchesProjectConditions(
  project: Pick<Project, "requiredSkills" | "rate" | "location">,
  talent: Talent,
  stationMatch: StationDistanceMatch | null
): boolean {
  const stationEnabled = Boolean(project.location?.trim());
  const stationMatches = !stationEnabled || isNearStationMatch(stationMatch);
  return hasMatchingProjectTag(project.requiredSkills, talent) &&
    stationMatches &&
    matchesRateCondition(parseRateCondition(project.rate), talent.desiredRate);
}
