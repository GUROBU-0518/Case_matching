import { describe, expect, it } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { loadSystemPrompt } from "../src/ai/prompt-loader.ts";
import { AiClientError, OpenAiClassifier } from "../src/ai/openai-client.ts";

describe("external AI prompts", () => {
  it("classificationとextractionを読み込む", async () => {
    const dir = await mkdtemp(join(tmpdir(), "prompt-test-")); await writeFile(join(dir, "classification.md"), "分類"); await writeFile(join(dir, "extraction.md"), "抽出");
    expect(loadSystemPrompt(dir)).toBe("分類\n\n抽出");
  });
  it("欠落・空ファイルではClassifierを構築しない", async () => {
    const dir = await mkdtemp(join(tmpdir(), "prompt-test-")); await writeFile(join(dir, "classification.md"), ""); await writeFile(join(dir, "extraction.md"), "抽出");
    expect(() => new OpenAiClassifier({ apiKey: "test", promptDir: dir })).toThrowError(AiClientError);
  });
  it("統合改訂版の境界条件と既存フィールド対応を含む", async () => {
    const classification = await readFile(join(process.cwd(), "prompts", "classification.md"), "utf8");
    const extraction = await readFile(join(process.cwd(), "prompts", "extraction.md"), "utf8");
    expect(classification).toContain("project");
    expect(classification).toContain("talent");
    expect(classification).toContain("mixed");
    expect(classification).toContain("other");
    expect(classification).toContain("メンテナンス");
    expect(classification).toContain("求める人物像");
    expect(classification).toContain("希望案件");
    expect(extraction).toContain("project.summary");
    expect(extraction).toContain("talent.notes");
    expect(extraction).toContain("affiliationType");
    expect(extraction).toContain("null");
    expect(extraction).toContain("複数案件");
  });
});
