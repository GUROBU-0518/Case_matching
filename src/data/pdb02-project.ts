import type { Prisma } from "@prisma/client";

/** 案件②のPrisma登録用テストデータ。DBへの書き込み処理は含まない。 */
export const sampleProject02 = {
  id: "pdb02-project-001",
  projectName: "某●●向けトレーサビリティサイト構築",
  requiredSkills: ["Java", "jQuery"],
  process: "製造、単体テスト",
  location: "渋谷または大崎",
  workStyle: "基本リモート",
  startDate: "2026年11月",
  headcount: null,
  rate: "70〜85万円程度",
  summary: null,
  sourceText: null,
} satisfies Prisma.ProjectUncheckedCreateInput;

// 尚可スキル、終了予定、精算時間幅、継続参画、開発環境は専用フィールドがないため未格納。
