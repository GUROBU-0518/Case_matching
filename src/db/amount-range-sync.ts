import type { PrismaClient } from "@prisma/client";
import { parseAmountRange, type AmountRange } from "../domain/amount-range.ts";

type AmountRecord = {
  readonly id: string;
  readonly amountText: string | null;
};

export type AmountRangeUpdatePlan = {
  readonly id: string;
  readonly source: string | null;
  readonly range: AmountRange;
};

export function createAmountRangeUpdatePlan(records: readonly AmountRecord[]): readonly AmountRangeUpdatePlan[] {
  return records.map((record) => ({
    id: record.id,
    source: record.amountText,
    range: parseAmountRange(record.amountText),
  }));
}

export async function applyProjectAmountRanges(
  prisma: Pick<PrismaClient, "project">,
  plans: readonly AmountRangeUpdatePlan[],
): Promise<void> {
  for (const plan of plans) {
    await prisma.project.update({
      where: { id: plan.id },
      data: { rateMin: plan.range.minYen, rateMax: plan.range.maxYen },
    });
  }
}

export async function applyTalentAmountRanges(
  prisma: Pick<PrismaClient, "talent">,
  plans: readonly AmountRangeUpdatePlan[],
): Promise<void> {
  for (const plan of plans) {
    await prisma.talent.update({
      where: { id: plan.id },
      data: { desiredRateMin: plan.range.minYen, desiredRateMax: plan.range.maxYen },
    });
  }
}
