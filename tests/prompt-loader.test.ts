import { describe, expect, it } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
});
