import type { Prisma } from "@prisma/client";
import { getPrismaClient } from "./client.ts";
import { sampleProject02 } from "../data/pdb02-project.ts";

type ProjectUpsertClient = {
  project: {
    upsert(args: Prisma.ProjectUpsertArgs): Promise<unknown>;
  };
};

const updateData: Prisma.ProjectUpdateInput = {
  projectName: sampleProject02.projectName,
  summary: sampleProject02.summary,
  requiredSkills: sampleProject02.requiredSkills,
  rate: sampleProject02.rate,
  location: sampleProject02.location,
  workStyle: sampleProject02.workStyle,
  startDate: sampleProject02.startDate,
  headcount: sampleProject02.headcount,
  process: sampleProject02.process,
  commercialRestrictions: null,
  sourceText: sampleProject02.sourceText,
};

/** PDB2-04で明示的に呼び出す案件②登録処理。通常起動やテストからは呼び出されない。 */
export async function registerSampleProject02(
  client: ProjectUpsertClient = getPrismaClient(),
): Promise<unknown> {
  return client.project.upsert({
    where: { id: sampleProject02.id },
    create: sampleProject02,
    update: updateData,
  });
}
