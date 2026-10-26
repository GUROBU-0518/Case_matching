const args = process.argv.slice(2);
const execute = args.includes("--execute");
const id = args.find((arg) => arg.startsWith("--id="))?.slice(5);
const subject = "【人材情報3名】Java・Python・インフラエンジニアのご紹介";
if (!id) { console.error("--idを1件指定してください"); process.exitCode = 1; }
else {
  const [{ getPrismaClient }, { restoreAiPendingForExactMail }] = await Promise.all([import("../db/client.ts"), import("../db/mail-repository.ts")]);
  const prisma = getPrismaClient();
  try {
    const mail = await prisma.mailMessage.findUnique({ where: { id }, select: { id: true, subject: true, processedBody: true, aiProcessing: { select: { aiStatus: true, status: true, retryCount: true } } } });
    const valid = mail?.id === id && mail.subject === subject && mail.processedBody != null && mail.aiProcessing?.aiStatus === "processing" && mail.aiProcessing.status === "pending" && mail.aiProcessing.retryCount === 0;
    console.log(`復旧対象存在: ${mail ? "はい" : "いいえ"}`); console.log(`復旧条件一致: ${valid ? "はい" : "いいえ"}`); console.log("更新予定件数: 1");
    if (!execute) { console.log("Dry-run: DB更新・Graph API・OpenAI APIは実行しません"); process.exitCode = valid ? 0 : 1; }
    else if (!valid) { console.error("復旧条件に一致しないため更新しません"); process.exitCode = 1; }
    else console.log(`復旧更新件数: ${await restoreAiPendingForExactMail(prisma, { id, subject })}`);
  } finally { await prisma.$disconnect(); }
}
