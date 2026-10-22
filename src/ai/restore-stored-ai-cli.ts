const args = process.argv.slice(2); const execute = args.includes("--execute"); const ids = args.filter((arg) => arg.startsWith("--id=")).map((arg) => arg.slice(5));
const expected = new Set(["【案件情報・人材情報】CRMシステム開発案件／Javaエンジニア1名のご紹介", "【人材情報3名】Java・Python・インフラエンジニアのご紹介"]);
if (ids.length !== 2 || new Set(ids).size !== 2) { console.error("--idを異なる2件指定してください"); process.exitCode = 1; process.exit(); }
const [{ getPrismaClient }, { restoreAiPendingForExactMails }] = await Promise.all([import("../db/client.ts"), import("../db/mail-repository.ts")]); const prisma = getPrismaClient();
try {
  const rows = await prisma.mailMessage.findMany({ where: { id: { in: ids } }, select: { id: true, subject: true, aiProcessing: { select: { aiStatus: true, status: true, retryCount: true } } } });
  const valid = rows.length === 2 && rows.every((row) => expected.has(row.subject ?? "") && row.aiProcessing?.aiStatus === "processing" && row.aiProcessing.status === "pending" && row.aiProcessing.retryCount === 0);
  console.log(`復旧対象件数: ${rows.length}`); console.log(`復旧条件一致: ${valid ? "はい" : "いいえ"}`); console.log("更新予定件数: 2");
  if (!execute) { console.log("Dry-run: DB更新・Graph API・OpenAI APIは実行しません"); process.exitCode = valid ? 0 : 1; }
  else if (!valid) { console.error("復旧条件に一致しないため更新しません"); process.exitCode = 1; }
  else { const count = await restoreAiPendingForExactMails(prisma, rows.map((row) => ({ id: row.id, subject: row.subject ?? "" }))); console.log(`復旧更新件数: ${count}`); }
} finally { await prisma.$disconnect(); }
