import { loadLocalEmails } from "../mail/local-loader.ts";
import { getPrismaClient, disconnectDatabase } from "./client.ts";
import { runMailBatch } from "../batch/mail-batch.ts";
import { persistMailBatch } from "./mail-repository.ts";

const emails = await loadLocalEmails("local-data/emails");
const result = await runMailBatch(async () => emails);
const prisma = getPrismaClient();
try {
  const saved = await persistMailBatch(prisma, emails, result);
  console.log(`処理対象メール件数: ${result.totalCount}`);
  console.log(`DB連携件数: ${saved.persistedMailCount}`);
  console.log(`既存成功メールのスキップ件数: ${saved.skippedProcessedCount}`);
  console.log(`処理成功件数: ${result.successCount}`);
  console.log(`処理失敗件数: ${result.failureCount}`);
  console.log(`処理状態保存件数: ${saved.persistedProcessingCount}`);
  console.log(`DB保存失敗件数: ${saved.dbSaveFailureCount}`);
  console.log(`BatchRun保存: ${saved.batchRunSaved ? "成功" : "失敗"}`);
  console.log(`バッチ状態: ${result.status}`);
  if (result.failureCount > 0) process.exitCode = 1;
} catch (error) {
  console.error("DB連携失敗");
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await disconnectDatabase();
}
