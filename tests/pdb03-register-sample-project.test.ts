import { describe, expect, it, vi } from "vitest";
import { sampleProject01 } from "../src/data/pdb01-project.ts";
import { registerSampleProject01 } from "../src/db/register-sample-project.ts";

describe("registerSampleProject01", () => {
  it("固定IDで案件①をupsertする", async () => {
    const upsert = vi.fn().mockResolvedValue(sampleProject01);
    const client = { project: { upsert } };

    await registerSampleProject01(client);

    expect(upsert).toHaveBeenCalledOnce();
    expect(upsert).toHaveBeenCalledWith({
      where: { id: "pdb01-project-001" },
      create: sampleProject01,
      update: {
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
      },
    });
  });
});
