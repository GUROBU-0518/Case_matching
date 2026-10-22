import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export function loadSystemPrompt(promptDir = process.env.AI_PROMPT_DIR ?? resolve(process.cwd(), "prompts")): string {
  let classification: string;
  let extraction: string;
  try {
    classification = readFileSync(resolve(promptDir, "classification.md"), "utf8").trim();
    extraction = readFileSync(resolve(promptDir, "extraction.md"), "utf8").trim();
  } catch {
    throw new Error("AIプロンプトファイルを読み込めません");
  }
  if (!classification || !extraction) throw new Error("AIプロンプトファイルが空です");
  return `${classification}\n\n${extraction}`;
}
