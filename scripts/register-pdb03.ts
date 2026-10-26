import { disconnectDatabase, getPrismaClient } from "../src/db/client.ts";
import { registerSampleProject03 } from "../src/db/register-sample-project03.ts";

try {
  await registerSampleProject03(getPrismaClient());
} catch {
  console.error("案件③の登録に失敗しました。");
  process.exitCode = 1;
} finally {
  await disconnectDatabase();
}
