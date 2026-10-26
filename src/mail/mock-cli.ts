import { loadLocalEmails } from "./local-loader.ts";

const directory = process.argv[2] ?? "local-data/emails";

try {
  const emails = await loadLocalEmails(directory);
  console.log(`読み込み件数: ${emails.length}`);
  for (const email of emails) {
    console.log(`- ${email.messageId}: ${email.subject} [成功]`);
  }
} catch (error) {
  console.error("メール読み込み失敗");
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
