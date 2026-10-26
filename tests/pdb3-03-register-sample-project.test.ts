import { describe, expect, it, vi } from "vitest";
import { sampleProject03 } from "../src/data/pdb03-project.ts";
import { registerSampleProject03 } from "../src/db/register-sample-project03.ts";

describe("registerSampleProject03", () => {
  it("案件③を固定IDでupsertし、実DBへ接続しない", async () => {
    const upsert = vi.fn().mockResolvedValue(sampleProject03);
    const client = { project: { upsert } };

    await registerSampleProject03(client);

    expect(upsert).toHaveBeenCalledOnce();
    expect(upsert).toHaveBeenCalledWith({
      where: { id: "pdb03-project-001" },
      create: sampleProject03,
      update: {
        projectName: sampleProject03.projectName,
        summary: null,
        requiredSkills: ["LAMP", "PHP", "MySQL", "SQL"],
        rate: "スキル見合い",
        location: "日比谷ミッドタウン",
        workStyle: "ほぼ在宅予定",
        startDate: "2026年11月",
        headcount: 1,
        process: null,
        commercialRestrictions: null,
        sourceText: null,
      },
    });
  });
});
