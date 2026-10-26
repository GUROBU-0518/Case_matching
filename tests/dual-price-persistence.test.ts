import { describe, expect, it, vi } from "vitest";
import { persistAiExtraction } from "../src/db/mail-repository.ts";

function fakePrisma() {
  const tx = {
    aiProcessing: {
      findUnique: vi.fn(async () => ({ aiStatus: "failed" })),
      update: vi.fn(async () => ({})),
    },
    project: { createMany: vi.fn(async () => ({})) },
    talent: { createMany: vi.fn(async () => ({})) },
  };
  const prisma = {
    $transaction: vi.fn(async (callback: (transaction: unknown) => unknown) => callback(tx)),
  };
  return { prisma, tx };
}

const projectBase = {
  projectName: "架空案件", summary: null, location: null, nearestStation: null,
  workStyle: null, startDate: null, requiredSkills: null, preferredSkills: null,
  headcount: null, phase: null, commercialFlowRestriction: null,
};

const talentBase = {
  name: "架空人材", nearestStation: null, skills: null, availableFrom: null,
  availablePeriod: null, age: null, yearsOfExperience: null, desiredWorkStyle: null,
  availablePhases: null, affiliationType: "unknown" as const, notes: null,
};

describe("dual unit/yen price persistence", () => {
  describe("Project", () => {
    it.each([
      { label: "range", text: "80～100万円", min: 80, max: 100, yenMin: 800_000n, yenMax: 1_000_000n },
      { label: "lower bound", text: "80万円以上", min: 80, max: null, yenMin: 800_000n, yenMax: null },
      { label: "upper bound", text: "100万円以下", min: null, max: 100, yenMin: null, yenMax: 1_000_000n },
      { label: "single amount uses project maximum", text: "90万円", min: null, max: 90, yenMin: null, yenMax: 900_000n },
      { label: "unknown", text: null, min: null, max: null, yenMin: null, yenMax: null },
    ])("$label: saves display and search columns", async ({ text, min, max, yenMin, yenMax }) => {
      const { prisma, tx } = fakePrisma();
      await persistAiExtraction(prisma as never, "mail-1", {
        classification: "project",
        projects: [{ ...projectBase, price: text, priceMin: min, priceMax: max }],
        talents: [],
      }, "fictional source text");

      expect(tx.project.createMany).toHaveBeenCalledWith({ data: [expect.objectContaining({
        rate: text, unitPriceMin: min, unitPriceMax: max, rateMin: yenMin, rateMax: yenMax,
      })] });
      expect(tx.talent.createMany).not.toHaveBeenCalled();
    });
  });

  describe("Talent", () => {
    it.each([
      { label: "range", text: "80～100万円", min: 80, max: 100, yenMin: 800_000n, yenMax: 1_000_000n },
      { label: "lower bound", text: "80万円以上", min: 80, max: null, yenMin: 800_000n, yenMax: null },
      { label: "upper bound", text: "100万円以下", min: null, max: 100, yenMin: null, yenMax: 1_000_000n },
      { label: "single amount uses talent minimum", text: "90万円", min: 90, max: null, yenMin: 900_000n, yenMax: null },
      { label: "unknown", text: null, min: null, max: null, yenMin: null, yenMax: null },
    ])("$label: saves display and search columns", async ({ text, min, max, yenMin, yenMax }) => {
      const { prisma, tx } = fakePrisma();
      await persistAiExtraction(prisma as never, "mail-1", {
        classification: "talent",
        projects: [],
        talents: [{ ...talentBase, desiredPrice: text, desiredPriceMin: min, desiredPriceMax: max }],
      }, "fictional source text");

      expect(tx.talent.createMany).toHaveBeenCalledWith({ data: [expect.objectContaining({
        desiredRate: text, desiredPriceMin: min, desiredPriceMax: max,
        desiredRateMin: yenMin, desiredRateMax: yenMax,
      })] });
      expect(tx.project.createMany).not.toHaveBeenCalled();
    });
  });
});
