import { getPrismaClient } from "./client.ts";

type Range = { min: number | null; max: number | null };

function parseRange(value: string | null, role: "project" | "talent"): Range {
  if (!value) return { min: null, max: null };
  const text = value.normalize("NFKC").replaceAll(",", "").trim();
  const unit = text.match(/^(\d+)\s*万(?:円)?(?:\s*[〜~～-]\s*(\d+)\s*万(?:円)?)?$/u);
  if (unit) {
    const first = Number(unit[1]);
    const second = unit[2] ? Number(unit[2]) : null;
    if (second !== null) return first <= second ? { min: first, max: second } : { min: null, max: null };
    return role === "project" ? { min: null, max: first } : { min: first, max: null };
  }
  const bound = text.match(/^(\d+)\s*万円?\s*(以上|以下|〜|~|～)$/u);
  if (!bound) return { min: null, max: null };
  const amount = Number(bound[1]);
  return bound[2] === "以上" || bound[2] === "〜" || bound[2] === "~" || bound[2] === "～"
    ? { min: amount, max: null }
    : { min: null, max: amount };
}

async function main(): Promise<void> {
  const execute = process.argv.includes("--execute");
  const prisma = getPrismaClient();
  const projects = await prisma.project.findMany({ select: { id: true, rate: true, unitPriceMin: true, unitPriceMax: true } });
  const talents = await prisma.talent.findMany({ select: { id: true, desiredRate: true, desiredPriceMin: true, desiredPriceMax: true } });
  const projectUpdates = projects.filter((row) => row.unitPriceMin == null && row.unitPriceMax == null).map((row) => ({ id: row.id, ...parseRange(row.rate, "project") }));
  const talentUpdates = talents.filter((row) => row.desiredPriceMin == null && row.desiredPriceMax == null).map((row) => ({ id: row.id, ...parseRange(row.desiredRate, "talent") }));
  const projectConvertible = projectUpdates.filter((row) => row.min !== null || row.max !== null).length;
  const talentConvertible = talentUpdates.filter((row) => row.min !== null || row.max !== null).length;
  console.log(JSON.stringify({ mode: execute ? "execute" : "dry-run", projects: { total: projects.length, candidates: projectUpdates.length, convertible: projectConvertible }, talents: { total: talents.length, candidates: talentUpdates.length, convertible: talentConvertible } }));
  if (!execute) return;
  await prisma.$transaction(async (tx) => {
    for (const row of projectUpdates.filter((item) => item.min !== null || item.max !== null)) {
      await tx.project.updateMany({ where: { id: row.id, unitPriceMin: null, unitPriceMax: null }, data: { unitPriceMin: row.min, unitPriceMax: row.max } });
    }
    for (const row of talentUpdates.filter((item) => item.min !== null || item.max !== null)) {
      await tx.talent.updateMany({ where: { id: row.id, desiredPriceMin: null, desiredPriceMax: null }, data: { desiredPriceMin: row.min, desiredPriceMax: row.max } });
    }
  });
}

main().catch(() => { process.exitCode = 1; });
