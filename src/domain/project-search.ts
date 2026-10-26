import { parseAmountRange } from "./amount-range.ts";
import type { Project } from "./schemas.ts";

export type ProjectSearchRecord = Project & {
  readonly id: string;
  readonly rateMin?: bigint | null;
  readonly rateMax?: bigint | null;
};

/** 金額フィルタを明示的に適用する場合だけ使う。NULLは一致扱いにしない。 */
export function matchesProjectTalentPrice(project: ProjectSearchRecord, talent: import("./schemas.ts").Talent & { readonly id: string }): boolean {
  return project.unitPriceMax != null && talent.desiredPriceMin != null && talent.desiredPriceMin <= project.unitPriceMax;
}

function normalizeText(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("ja-JP").replace(/\s+/gu, " ").trim();
}

export function splitProjectKeywords(query: string): readonly string[] {
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

function matchesRateRange(project: ProjectSearchRecord, keyword: string): boolean {
  const keywordAmount = parseSearchAmount(keyword);
  if (keywordAmount === undefined || project.rateMin == null || project.rateMax == null) return false;
  const amount = BigInt(keywordAmount);
  return project.rateMin <= amount && amount <= project.rateMax;
}

function matchesKeyword(project: ProjectSearchRecord, keyword: string): boolean {
  const amountKeyword = parseSearchAmount(keyword);
  return matchesText(project.projectName, keyword) ||
    (project.requiredSkills ?? []).some((skill) => matchesText(skill, keyword)) ||
    matchesText(project.process, keyword) ||
    matchesText(project.location, keyword) ||
    matchesText(project.workStyle, keyword) ||
    matchesText(project.startDate, keyword) ||
    (amountKeyword !== undefined ? matchesRateRange(project, keyword) : matchesText(project.rate, keyword));
}

export function matchesProjectSearch(project: ProjectSearchRecord, query: string): boolean {
  const keywords = splitProjectKeywords(query);
  return keywords.length === 0 || keywords.some((keyword) => matchesKeyword(project, keyword));
}
