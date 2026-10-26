import { parseAmountRange } from "./amount-range.ts";
import type { Talent } from "./schemas.ts";

export type TalentSearchRecord = Talent & {
  readonly id: string;
  readonly desiredRateMin?: bigint | null;
  readonly desiredRateMax?: bigint | null;
};

function normalizeText(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("ja-JP").replace(/\s+/gu, " ").trim();
}

export function splitTalentKeywords(query: string): readonly string[] {
  return normalizeText(query).split(" ").filter(Boolean);
}

function parseSearchAmount(value: string): number | undefined {
  const parsed = parseAmountRange(value);
  if (parsed.minYen !== null && parsed.minYen === parsed.maxYen) return parsed.minYen;

  const normalized = normalizeText(value).replaceAll(",", "");
  if (!/^\d+$/u.test(normalized)) return undefined;
  const amount = Number(normalized);
  return Number.isSafeInteger(amount) ? amount : undefined;
}

function matchesText(value: string | null, keyword: string): boolean {
  return value !== null && normalizeText(value).includes(keyword);
}

function matchesDesiredRateRange(talent: TalentSearchRecord, keyword: string): boolean {
  const keywordAmount = parseSearchAmount(keyword);
  if (keywordAmount === undefined || talent.desiredRateMin == null || talent.desiredRateMax == null) return false;
  const amount = BigInt(keywordAmount);
  return talent.desiredRateMin <= amount && amount <= talent.desiredRateMax;
}

function matchesKeyword(talent: TalentSearchRecord, keyword: string): boolean {
  const amountKeyword = parseSearchAmount(keyword);
  return matchesText(talent.nameOrInitial, keyword) ||
    (talent.technicalSkills ?? []).some((skill) => matchesText(skill, keyword)) ||
    matchesText(talent.nearestStation, keyword) ||
    (amountKeyword !== undefined ? matchesDesiredRateRange(talent, keyword) : matchesText(talent.desiredRate, keyword)) ||
    matchesText(talent.availableFrom, keyword) ||
    matchesText(talent.affiliation, keyword);
}

export function matchesTalentSearch(talent: TalentSearchRecord, query: string): boolean {
  const keywords = splitTalentKeywords(query);
  return keywords.length === 0 || keywords.some((keyword) => matchesKeyword(talent, keyword));
}
