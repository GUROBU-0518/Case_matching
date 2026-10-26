import { describe, expect, it, vi } from "vitest";
import { sampleTalents } from "../src/data/sample-talents.ts";
import { registerSampleTalents } from "../src/db/register-sample-talents.ts";

describe("registerSampleTalents", () => {
  it("5名を対象にupsertし、実DBへ接続しない", async () => {
    const upsert = vi.fn().mockImplementation(async (args) => args.create);
    const client = { talent: { upsert } };

    const results = await registerSampleTalents(client);

    expect(results).toHaveLength(5);
    expect(upsert).toHaveBeenCalledTimes(5);

    const calls = upsert.mock.calls.map(([args]) => args);
    expect(calls.map((args) => args.where.id)).toEqual([
      "talent-001",
      "talent-002",
      "talent-003",
      "talent-004",
      "talent-005",
    ]);
    expect(new Set(calls.map((args) => args.where.id)).size).toBe(5);
    expect(calls.map((args) => args.create)).toEqual(sampleTalents);
    expect(calls.every((args) => args.create.affiliation === "BP")).toBe(true);
    expect(calls.every((args) => Array.isArray(args.create.technicalSkills))).toBe(true);
    expect(calls.every((args) => Array.isArray(args.create.availableProcess))).toBe(true);
    expect(calls[0].create.availableProcess).toEqual([]);
    expect(calls.every((args) => args.create.sourceText === null && args.create.mailMessageId === null)).toBe(true);
  });
});
