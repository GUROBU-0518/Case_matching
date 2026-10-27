export type MatchingSeedProject = {
  id: string;
  projectName: string;
  requiredSkills: string[];
  rate: string;
  rateMin: bigint;
  rateMax: bigint;
  unitPriceMin: number;
  unitPriceMax: number;
  location: string;
  workStyle: string;
  startDate: string;
  process: string;
  sourceText: string;
};

export type MatchingSeedTalent = {
  id: string;
  nameOrInitial: string;
  technicalSkills: string[];
  desiredRate: string;
  desiredRateMin: bigint;
  desiredRateMax: bigint;
  desiredPriceMin: number;
  desiredPriceMax: number;
  nearestStation: string;
  desiredWorkStyle: string;
  availableFrom: string;
  availableProcess: string[];
  affiliation: "BP";
  sourceText: string;
};

const projectRatePatterns = [
  { min: 700000, max: 850000, label: "70〜85万円", skill: "Java" },
  { min: 500000, max: 600000, label: "50〜60万円", skill: "Python" },
  { min: 800000, max: 900000, label: "80〜90万円", skill: "AWS" },
  { min: 400000, max: 550000, label: "40〜55万円", skill: "PHP" },
  { min: 900000, max: 1000000, label: "90〜100万円", skill: "Java" }
] as const;

const seedProjectStations = ["大森", "渋谷", "新宿", "東京", "品川", "横浜", "上野", "池袋", "大鳥居", "水戸"] as const;

const seedTalentDetails = [
  { extraSkill: "Spring Boot", workStyle: "常駐", availableFrom: "2026年10月", process: ["要件定義", "設計"] },
  { extraSkill: "Django", workStyle: "週3リモート", availableFrom: "2026年11月", process: ["設計", "開発"] },
  { extraSkill: "Terraform", workStyle: "フルリモート", availableFrom: "2026年12月", process: ["構築", "運用保守"] },
  { extraSkill: "Laravel", workStyle: "常駐・相談可", availableFrom: "即日", process: ["開発", "テスト"] },
  { extraSkill: "SQL", workStyle: "週1リモート", availableFrom: "2027年1月", process: ["テスト", "運用保守"] },
  { extraSkill: "React", workStyle: "フルリモート", availableFrom: "2026年11月", process: ["設計", "開発", "テスト"] },
  { extraSkill: "Docker", workStyle: "週2リモート", availableFrom: "2026年12月", process: ["構築", "テスト"] },
  { extraSkill: "Kotlin", workStyle: "常駐", availableFrom: "即日", process: ["開発", "保守"] },
  { extraSkill: "C#", workStyle: "週3リモート", availableFrom: "2027年2月", process: ["要件定義", "進捗管理"] },
  { extraSkill: "Shell", workStyle: "常駐・リモート相談可", availableFrom: "2026年11月", process: ["運用保守", "障害対応"] }
] as const;

const seedTalentStations = [
  "大鳥居", "初台", "南柏", "存在しない駅", "水戸",
  "渋谷", "新宿", "東京", "品川", "横浜",
  "上野", "池袋", "秋葉原", "目黒", "蒲田",
  "川崎", "千葉", "大宮", "立川", "八王子"
] as const;

export const matchingSeedProjects: readonly MatchingSeedProject[] = Array.from({ length: 10 }, (_, index) => {
  const pattern = projectRatePatterns[index % projectRatePatterns.length]!;
  const number = String(index + 1).padStart(3, "0");
  return {
    id: `seed-project-${number}`,
    projectName: `【SEED-P${number}】サンプル案件${number}`,
    requiredSkills: [pattern.skill],
    rate: pattern.label,
    rateMin: BigInt(pattern.min),
    rateMax: BigInt(pattern.max),
    unitPriceMin: pattern.min,
    unitPriceMax: pattern.max,
    location: seedProjectStations[index]!,
    workStyle: "基本リモート",
    startDate: "2026年11月",
    process: "設計、開発、テスト",
    sourceText: `【SEED-P${number}】シード登録用の案件原文です。`
  };
});

export const matchingSeedTalents: readonly MatchingSeedTalent[] = Array.from({ length: 100 }, (_, index) => {
  const number = String(index + 1).padStart(3, "0");
  const stationPattern = index % seedTalentStations.length;
  const ratePattern = index % 5;
  const isRateMatchingGroup = index < 60;
  const matchingPatterns = [
    { amount: 750000, label: "75万円", skill: "Java" },
    { amount: 550000, label: "55万円", skill: "Python" },
    { amount: 850000, label: "85万円", skill: "AWS" },
    { amount: 750000, label: "75万円", skill: "Java" },
    { amount: 750000, label: "75万円", skill: "Java" }
  ] as const;
  const nonMatchingPatterns = [
    { amount: 300000, label: "30万円", skill: "未経験" },
    { amount: 1100000, label: "110万円", skill: "Rust" },
    { amount: 300000, label: "30万円", skill: "未経験" },
    { amount: 1100000, label: "110万円", skill: "Rust" },
    { amount: 300000, label: "30万円", skill: "未経験" }
  ] as const;
  const pattern = (isRateMatchingGroup ? matchingPatterns : nonMatchingPatterns)[ratePattern]!;
  const detail = seedTalentDetails[index % seedTalentDetails.length]!;
  return {
    id: `seed-talent-${number}`,
    nameOrInitial: `【SEED-T${number}】シード人材${number}`,
    technicalSkills: [pattern.skill, detail.extraSkill],
    desiredRate: pattern.label,
    desiredRateMin: BigInt(pattern.amount),
    desiredRateMax: BigInt(pattern.amount),
    desiredPriceMin: pattern.amount,
    desiredPriceMax: pattern.amount,
    nearestStation: seedTalentStations[stationPattern]!,
    desiredWorkStyle: detail.workStyle,
    availableFrom: detail.availableFrom,
    availableProcess: [...detail.process],
    affiliation: "BP",
    sourceText: `【SEED-T${number}】シード登録用の人材原文です。`
  };
});
