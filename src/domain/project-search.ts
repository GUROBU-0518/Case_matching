import type { Project } from "./schemas.ts";

export type ProjectSearchRecord = Project & { readonly id: string };

function normalizeText(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("ja-JP").replace(/\s+/gu, " ").trim();
}

export function splitProjectKeywords(query: string): readonly string[] {
  return normalizeText(query).split(" ").filter(Boolean);
}

function parseAmount(value: string): number | undefined {
  const normalized = normalizeText(value).replaceAll(",", "");
  if (!normalized || /[〜~～-]|以上|以下|未満|超|範囲|から/u.test(normalized)) return undefined;

  const manMatch = normalized.match(/^(\d+(?:\.\d+)?)\s*万\s*(\d+)?\s*円?$/u);
  if (manMatch?.[1]) {
    const amount = Number(manMatch[1]) * 10000 + (manMatch[2] ? Number(manMatch[2]) : 0);
    return Number.isFinite(amount) ? amount : undefined;
  }

  const yenMatch = normalized.match(/^(\d+(?:\.\d+)?)\s*円$/u);
  if (yenMatch?.[1]) {
    const amount = Number(yenMatch[1]);
    return Number.isFinite(amount) ? amount : undefined;
  }

  if (!/^\d+(?:\.\d+)?$/u.test(normalized)) return undefined;
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : undefined;
}

function matchesText(value: string | null, keyword: string): boolean {
  return value !== null && normalizeText(value).includes(keyword);
}

function matchesRate(value: string | null, keyword: string): boolean {
  const keywordAmount = parseAmount(keyword);
  if (keywordAmount !== undefined) return value !== null && parseAmount(value) === keywordAmount;
  return matchesText(value, keyword);
}

function matchesKeyword(project: ProjectSearchRecord, keyword: string): boolean {
  return matchesText(project.projectName, keyword) ||
    (project.requiredSkills ?? []).some((skill) => matchesText(skill, keyword)) ||
    matchesText(project.process, keyword) ||
    matchesText(project.location, keyword) ||
    matchesText(project.workStyle, keyword) ||
    matchesText(project.startDate, keyword) ||
    matchesRate(project.rate, keyword);
}

export function matchesProjectSearch(project: ProjectSearchRecord, query: string): boolean {
  const keywords = splitProjectKeywords(query);
  return keywords.length === 0 || keywords.some((keyword) => matchesKeyword(project, keyword));
}
