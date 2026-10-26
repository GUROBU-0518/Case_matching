import { OpenAiClassifier } from "./openai-client.ts";

if (!process.argv.includes("--execute")) {
  console.log("OpenAI手動接続は実行されません。料金が発生する可能性があるため、実行する場合は --execute を指定してください。");
  process.exit(0);
}
try {
  const result = await new OpenAiClassifier().classifyAndExtract({ subject: "架空の案件", processedBody: "これは接続確認用の架空本文です。情報がなければ推測せずnullにしてください。" });
  console.log(`OpenAI接続: 成功（classification=${result.classification}）`);
} catch (error) {
  console.error(`OpenAI接続: 失敗（${error instanceof Error ? error.name : "unknown"}）`);
  process.exitCode = 1;
}
