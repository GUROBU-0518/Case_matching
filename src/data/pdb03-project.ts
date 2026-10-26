import type { Prisma } from "@prisma/client";

/** 案件③のPrisma登録用テストデータ。DBへの書き込み処理は含まない。 */
export const sampleProject03: Prisma.ProjectUncheckedCreateInput = {
  id: "pdb03-project-001",
  projectName: "レストラン予約システムの開発支援",
  requiredSkills: ["LAMP", "PHP", "MySQL", "SQL"],
  process: null,
  location: "日比谷ミッドタウン",
  workStyle: "ほぼ在宅予定",
  startDate: "2026年11月",
  headcount: 1,
  rate: "スキル見合い",
  summary: null,
  sourceText: null,
};
