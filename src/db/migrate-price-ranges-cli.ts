import { getPrismaClient } from "./client.ts";
import { planProjectPriceBackfill, planTalentPriceBackfill } from "./price-range-backfill.ts";

async function main(): Promise<void> {
  const execute = process.argv.includes("--execute");
  const prisma = getPrismaClient();
  const projects = await prisma.project.findMany({ select: { id: true, rate: true, unitPriceMin: true, unitPriceMax: true, rateMin: true, rateMax: true } });
  const talents = await prisma.talent.findMany({ select: { id: true, desiredRate: true, desiredPriceMin: true, desiredPriceMax: true, desiredRateMin: true, desiredRateMax: true } });
  const projectUpdates = planProjectPriceBackfill(projects);
  const talentUpdates = planTalentPriceBackfill(talents);
  const projectUnitUpdates = projectUpdates.filter((row) => row.unitPriceRange);
  const projectRateUpdates = projectUpdates.filter((row) => row.rateRange);
  const talentPriceUpdates = talentUpdates.filter((row) => row.desiredPriceRange);
  const talentRateUpdates = talentUpdates.filter((row) => row.desiredRateRange);
  console.log(JSON.stringify({
    mode: execute ? "execute" : "dry-run",
    projects: { total: projects.length, unitPriceCandidates: projectUnitUpdates.length, rateCandidates: projectRateUpdates.length },
    talents: { total: talents.length, desiredPriceCandidates: talentPriceUpdates.length, desiredRateCandidates: talentRateUpdates.length },
  }));
  if (!execute) return;
  await prisma.$transaction(async (tx) => {
    for (const row of projectUnitUpdates) {
      await tx.project.updateMany({ where: { id: row.id, unitPriceMin: null, unitPriceMax: null }, data: { unitPriceMin: row.unitPriceRange!.min, unitPriceMax: row.unitPriceRange!.max } });
    }
    for (const row of projectRateUpdates) {
      await tx.project.updateMany({ where: { id: row.id, rateMin: null, rateMax: null }, data: { rateMin: row.rateRange!.min, rateMax: row.rateRange!.max } });
    }
    for (const row of talentPriceUpdates) {
      await tx.talent.updateMany({ where: { id: row.id, desiredPriceMin: null, desiredPriceMax: null }, data: { desiredPriceMin: row.desiredPriceRange!.min, desiredPriceMax: row.desiredPriceRange!.max } });
    }
    for (const row of talentRateUpdates) {
      await tx.talent.updateMany({ where: { id: row.id, desiredRateMin: null, desiredRateMax: null }, data: { desiredRateMin: row.desiredRateRange!.min, desiredRateMax: row.desiredRateRange!.max } });
    }
  });
}

main().catch(() => { process.exitCode = 1; });
