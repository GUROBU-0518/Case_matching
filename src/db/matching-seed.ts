import type { Prisma } from "@prisma/client";
import { matchingSeedProjects, matchingSeedTalents } from "../data/matching-seed.ts";
import { disconnectDatabase, getPrismaClient } from "./client.ts";

export async function registerMatchingSeedData(): Promise<{ projects: number; talents: number }> {
  const prisma = getPrismaClient();
  await prisma.$transaction(async (transaction) => {
    for (const project of matchingSeedProjects) {
      const data: Prisma.ProjectUncheckedCreateInput = { ...project };
      await transaction.project.upsert({ where: { id: project.id }, create: data, update: data });
    }
    for (const talent of matchingSeedTalents) {
      const data: Prisma.TalentUncheckedCreateInput = { ...talent };
      await transaction.talent.upsert({ where: { id: talent.id }, create: data, update: data });
    }
  });
  return { projects: matchingSeedProjects.length, talents: matchingSeedTalents.length };
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("/src/db/matching-seed.ts")) {
  registerMatchingSeedData()
    .then((result) => console.log(`Registered seed data: ${result.projects} projects, ${result.talents} talents`))
    .finally(() => disconnectDatabase());
}
