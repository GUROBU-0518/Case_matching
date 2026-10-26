import { describe, expect, it, vi } from "vitest";
import { sampleProject02 } from "../src/data/pdb02-project.ts";
import { registerSampleProject02 } from "../src/db/register-sample-project02.ts";

describe("registerSampleProject02", () => {
  it("案件②を固定IDでupsertし、DB接続なしで検証できる", async () => {
    const upsert = vi.fn().mockResolvedValue(sampleProject02);
    const client = { project: { upsert } };

    await registerSampleProject02(client);

    expect(upsert).toHaveBeenCalledOnce();
    expect(upsert).toHaveBeenCalledWith({
      where: { id: "pdb02-project-001" },
      create: sampleProject02,
      update: {
        projectName: sampleProject02.projectName,
        summary: sampleProject02.summary,
        requiredSkills: sampleProject02.requiredSkills,
        rate: "70〜85万円程度",
        location: sampleProject02.location,
        workStyle: sampleProject02.workStyle,
        startDate: sampleProject02.startDate,
        headcount: null,
        process: sampleProject02.process,
        commercialRestrictions: null,
        sourceText: sampleProject02.sourceText,
      },
    });
  });
});
