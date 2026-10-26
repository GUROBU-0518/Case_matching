import { disconnectDatabase, getPrismaClient } from "../src/db/client.ts";
import { registerSampleTalents } from "../src/db/register-sample-talents.ts";

try {
  const results = await registerSampleTalents(getPrismaClient());
  console.log(`開発用人材データを${results.length}件処理しました。`);
} catch {
  console.error("開発用人材データの登録に失敗しました。");
  process.exitCode = 1;
} finally {
  await disconnectDatabase();
}
