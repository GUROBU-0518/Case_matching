import type { Prisma } from "@prisma/client";
import { getPrismaClient } from "./client.ts";
import { sampleTalents } from "../data/sample-talents.ts";

type TalentUpsertClient = {
  talent: {
    upsert(args: Prisma.TalentUpsertArgs): Promise<unknown>;
  };
};

/** TDB-04で明示的に呼び出す開発用人材登録処理。正式ID方式ではない仮IDを使用する。 */
export async function registerSampleTalents(
  client: TalentUpsertClient = getPrismaClient(),
): Promise<readonly unknown[]> {
  const results: unknown[] = [];

  for (const talent of sampleTalents) {
    results.push(await client.talent.upsert({
      where: { id: talent.id },
      create: talent,
      update: {
        nameOrInitial: talent.nameOrInitial ?? null,
        technicalSkills: (talent.technicalSkills as string[] | undefined) ?? [],
        desiredRate: talent.desiredRate ?? null,
        nearestStation: talent.nearestStation ?? null,
        desiredWorkStyle: talent.desiredWorkStyle ?? null,
        availableFrom: talent.availableFrom ?? null,
        availableProcess: (talent.availableProcess as string[] | undefined) ?? [],
        affiliation: talent.affiliation ?? "BP",
        sourceText: talent.sourceText ?? null,
        mailMessageId: talent.mailMessageId ?? null,
      },
    }));
  }

  return results;
}
