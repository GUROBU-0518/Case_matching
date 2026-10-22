import type { Talent } from "../domain/schemas.ts";

export type MockTalentRecord = Talent & {
  readonly id: string;
  readonly createdAt: Date;
};

const now = new Date();
const monthParts = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "numeric",
  day: "numeric"
}).formatToParts(now);
const currentYear = Number(monthParts.find((part) => part.type === "year")?.value);
const currentMonth = Number(monthParts.find((part) => part.type === "month")?.value);
const currentDay = Number(monthParts.find((part) => part.type === "day")?.value);

function monthStart(monthsAgo: number): Date {
  return new Date(Date.UTC(currentYear, currentMonth - 1 - monthsAgo, 1) - 9 * 60 * 60 * 1000);
}

function createdAt(monthsAgo: number, day: number): Date {
  const safeDay = monthsAgo === 0 ? Math.min(day, currentDay) : day;
  return new Date(monthStart(monthsAgo).getTime() + (safeDay - 1) * 24 * 60 * 60 * 1000);
}

const profiles = [
  { skills: ["Java", "Spring Boot", "PostgreSQL"], rate: "80万円", station: "新宿駅", workStyle: "リモート併用", process: ["要件定義", "設計"] },
  { skills: ["TypeScript", "React", "Node.js"], rate: "800,000円", station: "渋谷駅", workStyle: "フルリモート", process: ["実装", "テスト"] },
  { skills: ["Python", "Django", "AWS"], rate: "91万円（応相談）", station: "品川駅", workStyle: "出社・リモート併用", process: ["設計", "運用保守"] },
  { skills: ["JavaScript", "Vue.js", "Docker"], rate: "75万円", station: "池袋駅", workStyle: "基本リモート", process: ["実装", "テスト"] },
  { skills: ["C#", ".NET", "SQL Server"], rate: "90万円", station: "東京駅", workStyle: "常駐", process: ["詳細設計", "実装"] },
  { skills: ["Linux", "JP1", "Shell"], rate: "65万円", station: "大森駅", workStyle: "常駐", process: ["運用保守", "障害対応"] },
  { skills: ["Flutter", "Dart", "Oracle"], rate: "85万円", station: "初台駅", workStyle: "リモート併用", process: ["設計", "実装"] },
  { skills: ["AWS", "Terraform", "Docker"], rate: "95万円", station: "横浜駅", workStyle: "フルリモート", process: ["構築", "運用保守"] },
  { skills: ["PHP", "Laravel", "MySQL"], rate: "70万円", station: "大崎駅", workStyle: "基本リモート", process: ["実装", "テスト"] },
  { skills: ["Swift", "iOS", "Firebase"], rate: "スキル見合い", station: "秋葉原駅", workStyle: "リモート併用", process: ["要件定義", "設計"] }
] as const;

const availableFrom = ["2026年11月", "2026年12月", "即日", "2027年1月"] as const;
const monthGroups = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 4, 4, 4, 4] as const;

export const mockTalents: readonly MockTalentRecord[] = Array.from({ length: 30 }, (_, index) => {
  const profile = profiles[index % profiles.length]!;
  return {
    id: `mock-talent-${String(index + 1).padStart(3, "0")}`,
    nameOrInitial: `サンプル人材${String.fromCharCode(65 + (index % 10))}${String(Math.floor(index / 10) + 1)}`,
    technicalSkills: [...profile.skills],
    desiredRate: profile.rate,
    nearestStation: profile.station,
    desiredWorkStyle: profile.workStyle,
    availableFrom: availableFrom[index % availableFrom.length]!,
    availableProcess: [...profile.process],
    affiliation: "BP",
    sourceText: null,
    createdAt: createdAt(monthGroups[index]!, (index % 12) + 1)
  };
});
