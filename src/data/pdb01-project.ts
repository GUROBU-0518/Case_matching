import type { Prisma } from "@prisma/client";

/** PDB-02: 案件①のPrisma登録用テストデータ。DBへの書き込み処理は含まない。 */
export const sampleProject01 = {
  id: "pdb01-project-001",
  projectName: "システム更改に伴うJP1設計・構築・試験作業",
  summary: null,
  requiredSkills: ["Windows", "Linux", "AD/DNS", "JP1"],
  rate: null,
  location: "大森",
  workStyle: "常駐",
  startDate: "2026年10月",
  headcount: 3,
  process: "設計、構築、試験",
  commercialRestrictions: null,
  sourceText: null,
} satisfies Prisma.ProjectUncheckedCreateInput;

// 専用フィールドがないため、終了予定・延長・精算時間幅・必須経験は未格納。
