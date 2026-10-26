import { loadLocalEmails } from "../mail/local-loader.ts";
import { runMailBatch } from "./mail-batch.ts";

const directory = process.argv.slice(2).find((argument) => !argument.startsWith("--")) ?? "local-data/emails";
const concurrencyArgument = process.argv.find((argument) => argument.startsWith("--concurrency="))?.split("=", 2)[1];
const concurrency = concurrencyArgument === undefined ? 3 : Number(concurrencyArgument);
const started = new Date();
console.log(`バッチ開始: ${started.toISOString()}`);

try {
  const result = await runMailBatch(() => loadLocalEmails(directory), undefined, concurrency);
  console.log(`並列数: ${result.concurrency}`);
  console.log(`処理対象メール件数: ${result.totalCount}`);
  for (const item of result.items) console.log(`- ${item.messageId}: ${item.success ? "成功" : "失敗"}`);
  console.log(`成功件数: ${result.successCount}`);
  console.log(`失敗件数: ${result.failureCount}`);
  console.log(`合計処理時間: ${result.durationMs}ms`);
  console.log(`バッチ終了状態: ${result.status}`);
  if (result.failureCount > 0) process.exitCode = 1;
} catch (error) {
  console.error("メール読み込み全体に失敗したため、バッチを中断しました");
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
