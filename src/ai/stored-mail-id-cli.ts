const args = process.argv.slice(2); const execute = args.includes("--execute"); const ids = args.filter((arg) => arg.startsWith("--id=")).map((arg) => arg.slice(5)); const subjects = args.filter((arg) => arg.startsWith("--subject=")).map((arg) => arg.slice("--subject=".length));
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
if (ids.length < 1 || ids.length > 2 || (subjects.length !== 0 && ids.length !== subjects.length) || new Set(ids).size !== ids.length || new Set(subjects).size !== subjects.length || ids.some((id) => !uuidPattern.test(id)) || subjects.some((subject) => !subject.trim())) { console.error("--idを1件または2件指定してください（2件指定時は対応する--subjectも必要です）"); process.exitCode = 1; process.exit(); }
const { getPrismaClient } = await import("../db/client.ts"); const { claimStoredAiProcessing, persistAiExtraction, recordAiProcessingFailure } = await import("../db/mail-repository.ts"); const { toSafeAiFailureDiagnostic, formatSafeAiFailureDiagnostic } = await import("./failure-diagnostic.ts");
const prisma = getPrismaClient();
try {
  const mails = await prisma.mailMessage.findMany({ where: { id: { in: ids } }, select: { id: true, subject: true, processedBody: true, aiProcessing: { select: { aiStatus: true, retryCount: true } } } });
  const byId = new Map(mails.map((mail) => [mail.id, mail]));
  const effectiveSubjects = ids.length === 1 && subjects.length === 0 ? [byId.get(ids[0] ?? "")?.subject ?? ""] : subjects;
  const ordered = ids.map((id) => byId.get(id));
  const valid = ordered.every((mail, index) => mail !== undefined && mail.subject === effectiveSubjects[index] && mail.processedBody != null && mail.aiProcessing?.aiStatus == null);
  console.log(`対象${ids.length}通存在: ${valid ? "はい" : "いいえ"}`); console.log(`最大API呼び出し回数: ${ids.length}`);
  if (!valid || !execute) { if (!execute) console.log("Dry-run: DB更新・Graph API・OpenAI APIは実行しません"); process.exitCode = valid ? 0 : 1; }
  else {
    const { OpenAiClassifier } = await import("./openai-client.ts"); const classifier = new OpenAiClassifier({ maxRetries: 0 }); let calls = 0;
    let succeeded = 0; let failed = 0;
    for (const mail of ordered) {
      if (!mail) continue;
      if (mail.processedBody == null || !(await claimStoredAiProcessing(prisma, mail.id, new Date(Date.now() - 15 * 60_000)))) continue;
      calls += 1;
      try {
        const response = await classifier.classifyAndExtract({ subject: mail.subject ?? "", processedBody: mail.processedBody });
        await persistAiExtraction(prisma, mail.id, response, mail.processedBody);
        succeeded += 1;
      } catch (error) {
        failed += 1;
        const value = error as { category?: string };
        const category = value.category === "temporary" || value.category === "rate_limit" || value.category === "timeout" ? "temporary" : "permanent";
        const diagnostic = toSafeAiFailureDiagnostic(error, "openai_request");
        await recordAiProcessingFailure(prisma, mail.id, category, formatSafeAiFailureDiagnostic(diagnostic));
      }
    }
    console.log(`OpenAI APIリクエスト試行回数: ${calls}`); console.log(`AI成功件数: ${succeeded}`); console.log(`AI失敗件数: ${failed}`); console.log("Graph API: 未使用\ndeltaLink更新: なし");
  }
} finally { await prisma.$disconnect(); }
