import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { loadLocalEmails } from "./local-loader.ts";
import { preprocessMailBody } from "./preprocess.ts";

const directory = process.argv[2] ?? "local-data/emails";
const outputDirectory = process.env.MAIL_PREPROCESS_OUTPUT;

try {
  const emails = await loadLocalEmails(directory);
  if (outputDirectory) await mkdir(outputDirectory, { recursive: true });
  console.log(`前処理件数: ${emails.length}`);
  for (const email of emails) {
    const result = preprocessMailBody(email.body);
    if (outputDirectory) await writeFile(join(outputDirectory, `${email.messageId}.json`), JSON.stringify(result, null, 2), "utf8");
    console.log(`- ${email.messageId}: ${result.originalBody.length} -> ${result.processedBody.length}文字 [成功] 署名:${result.signatureRemoved ? "削除" : "なし"} 引用:${result.quotedReplyRemoved ? "削除" : "なし"}`);
  }
} catch (error) {
  console.error("メール前処理失敗");
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
