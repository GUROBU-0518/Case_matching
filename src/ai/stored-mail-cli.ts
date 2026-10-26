const args = process.argv.slice(2);
if (!args.includes("--execute")) { console.log("保存済みメールAI処理は実行されません。--executeを指定してください。"); process.exit(0); }
const prefix = args.find((arg) => arg.startsWith("--subject-prefix="))?.slice("--subject-prefix=".length) ?? "";
const limit = Number(args.find((arg) => arg.startsWith("--limit="))?.slice("--limit=".length) ?? "NaN");
if (!prefix.trim()) { console.error("--subject-prefixは必須です。"); process.exitCode = 1; process.exit(); }
if (!Number.isInteger(limit) || limit < 1 || limit > 6) { console.error("--limitは1以上6以下の整数で指定してください。"); process.exitCode = 1; process.exit(); }
const [{ getPrismaClient }, { parseGraphConfig }, { GraphTokenProvider }, { GraphMailClient }, { preprocessMailBody }, { OpenAiClassifier }, { persistAiExtraction, claimStoredAiProcessing }] = await Promise.all([
  import("../db/client.ts"), import("../mail/graph-config.ts"), import("../mail/graph-auth.ts"), import("../mail/graph-client.ts"), import("../mail/preprocess.ts"), import("./openai-client.ts"), import("../db/mail-repository.ts"),
]);
const { toSafeAiFailureDiagnostic, formatSafeAiFailureDiagnostic } = await import("./failure-diagnostic.ts");
const prisma = getPrismaClient();
try {
  const candidates = await prisma.mailMessage.findMany({ where: { subject: { startsWith: prefix } }, include: { aiProcessing: true }, orderBy: { receivedAt: "asc" }, take: limit });
  console.log(`対象件数: ${candidates.length}`);
  const config = parseGraphConfig(); const graph = new GraphMailClient(config, new GraphTokenProvider(config)); const openAi = new OpenAiClassifier({ maxRetries: 0 });
  let apiCalls = 0;
  const classifier = { classifyAndExtract: async (input: { subject: string; processedBody: string }) => {
    if (apiCalls >= 6) throw new Error("OpenAI API呼び出し上限に達しました");
    apiCalls += 1;
    return openAi.classifyAndExtract(input);
  } };
  let success = 0; let failure = 0;
  for (const mail of candidates) {
    let failureStage: "graph_refetch" | "preprocessing" | "openai_request" = "graph_refetch";
    try {
      if (!await claimStoredAiProcessing(prisma, mail.id, new Date(Date.now() - 15 * 60 * 1000))) continue;
      let body = mail.processedBody;
      if (body == null) { const fetched = await graph.fetchMessage(mail.mailboxId, mail.graphMessageId); if (fetched.kind === "removed") throw new Error("メールが削除されています"); failureStage = "preprocessing"; body = (await preprocessMailBody(fetched.email.body, fetched.contentType)).processedBody; await prisma.mailMessage.update({ where: { id: mail.id }, data: { processedBody: body } }); }
      failureStage = "openai_request";
      const response = await classifier.classifyAndExtract({ subject: mail.subject ?? "", processedBody: body });
      await persistAiExtraction(prisma, mail.id, response, body); success += 1;
    } catch (error) { failure += 1; const value = error as { category?: string }; const temporary = value.category === "rate_limit" || value.category === "timeout" || value.category === "temporary"; const diagnostic = toSafeAiFailureDiagnostic(error, failureStage); await prisma.aiProcessing.update({ where: { mailMessageId: mail.id }, data: { status: "failed", aiStatus: temporary ? "failed_temporary" : "failed_permanent", errorType: temporary ? "temporary" : value.category ?? "unknown", errorMessage: formatSafeAiFailureDiagnostic({ ...diagnostic, stage: failureStage }), endedAt: new Date() } }); }
  }
  console.log(`AI成功件数: ${success}`); console.log(`AI失敗件数: ${failure}`); console.log(`OpenAI APIリクエスト試行回数: ${apiCalls}`); console.log("DeltaLink更新: 実施なし");
} finally { await prisma.$disconnect(); }
