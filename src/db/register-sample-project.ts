import type { Prisma } from "@prisma/client";
import { getPrismaClient } from "./client.ts";
import { sampleProject01 } from "../data/pdb01-project.ts";

type ProjectUpsertClient = {
  project: {
    upsert(args: Prisma.ProjectUpsertArgs): Promise<unknown>;
  };
};

const updateData: Prisma.ProjectUpdateInput = {
  projectName: sampleProject01.projectName,
  summary: sampleProject01.summary,
  requiredSkills: sampleProject01.requiredSkills,
  rate: sampleProject01.rate,
  location: sampleProject01.location,
  workStyle: sampleProject01.workStyle,
  startDate: sampleProject01.startDate,
  headcount: sampleProject01.headcount,
  process: sampleProject01.process,
  commercialRestrictions: sampleProject01.commercialRestrictions,
  sourceText: sampleProject01.sourceText,
};

/** PDB-04で明示的に呼び出す案件①登録処理。通常起動やテストからは呼び出されない。 */
export async function registerSampleProject01(
  client: ProjectUpsertClient = getPrismaClient(),
): Promise<unknown> {
  return client.project.upsert({
    where: { id: sampleProject01.id },
    create: sampleProject01,
    update: updateData,
  });
}
