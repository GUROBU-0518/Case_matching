import type { Talent } from "./schemas.ts";

export type TalentSearchRecord = Talent & { readonly id: string };

function normalizeText(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("ja-JP").replace(/\s+/gu, " ").trim();
}

export function splitTalentKeywords(query: string): readonly string[] {
  return normalizeText(query).split(" ").filter(Boolean);
}

function parseAmount(value: string): number | undefined {
  const normalized = normalizeText(value).replaceAll(",", "");
  if (!normalized || /[〜~～-]|以上|以下|未満|超|範囲/u.test(normalized)) return undefined;

  const manMatch = normalized.match(/(\d+(?:\.\d+)?)\s*万\s*(\d+)?\s*円?/u);
  if (manMatch?.[1]) {
    const man = Number(manMatch[1]) * 10000;
    const remainder = manMatch[2] ? Number(manMatch[2]) : 0;
    return Number.isFinite(man + remainder) ? man + remainder : undefined;
  }

  const yenMatch = normalized.match(/(\d+(?:\.\d+)?)\s*円/u);
  if (yenMatch?.[1]) {
    const yen = Number(yenMatch[1]);
    return Number.isFinite(yen) ? yen : undefined;
  }

  if (!/^\d+(?:\.\d+)?$/u.test(normalized)) return undefined;
  const unitlessYen = Number(normalized);
  return Number.isFinite(unitlessYen) ? unitlessYen : undefined;
}

function matchesText(value: string | null, keyword: string): boolean {
  return value !== null && normalizeText(value).includes(keyword);
}

function matchesDesiredRate(value: string | null, keyword: string): boolean {
  const keywordAmount = parseAmount(keyword);
  if (keywordAmount !== undefined) return value !== null && parseAmount(value) === keywordAmount;
  return matchesText(value, keyword);
}

function matchesKeyword(talent: TalentSearchRecord, keyword: string): boolean {
  return matchesText(talent.nameOrInitial, keyword) ||
    (talent.technicalSkills ?? []).some((skill) => matchesText(skill, keyword)) ||
    matchesText(talent.nearestStation, keyword) ||
    matchesDesiredRate(talent.desiredRate, keyword) ||
    matchesText(talent.availableFrom, keyword) ||
    matchesText(talent.affiliation, keyword);
}

export function matchesTalentSearch(talent: TalentSearchRecord, query: string): boolean {
  const keywords = splitTalentKeywords(query);
  return keywords.length === 0 || keywords.some((keyword) => matchesKeyword(talent, keyword));
}
