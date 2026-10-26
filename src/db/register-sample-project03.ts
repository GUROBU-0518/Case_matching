import type { Prisma } from "@prisma/client";
import { getPrismaClient } from "./client.ts";
import { sampleProject03 } from "../data/pdb03-project.ts";

type ProjectUpsertClient = {
  project: {
    upsert(args: Prisma.ProjectUpsertArgs): Promise<unknown>;
  };
};

const updateData: Prisma.ProjectUpdateInput = {
  projectName: sampleProject03.projectName ?? null,
  summary: sampleProject03.summary ?? null,
  requiredSkills: sampleProject03.requiredSkills ?? [],
  rate: sampleProject03.rate ?? null,
  location: sampleProject03.location ?? null,
  workStyle: sampleProject03.workStyle ?? null,
  startDate: sampleProject03.startDate ?? null,
  headcount: sampleProject03.headcount ?? null,
  process: sampleProject03.process ?? null,
  commercialRestrictions: null,
  sourceText: sampleProject03.sourceText ?? null,
};

/** PDB3-04で明示的に呼び出す案件③登録処理。通常起動やテストからは呼び出されない。 */
export async function registerSampleProject03(
  client: ProjectUpsertClient = getPrismaClient(),
): Promise<unknown> {
  return client.project.upsert({
    where: { id: sampleProject03.id },
    create: sampleProject03,
    update: updateData,
  });
}
