const prefix = "AI作";
const [{ getPrismaClient }, { parseGraphConfig }, { GraphTokenProvider }, { GraphMailClient }] = await Promise.all([
  import("../db/client.ts"), import("./graph-config.ts"), import("./graph-auth.ts"), import("./graph-client.ts"),
]);
const prisma = getPrismaClient();
try {
  const target = await prisma.mailMessage.findFirst({ where: { subject: { startsWith: prefix } }, orderBy: { receivedAt: "asc" }, select: { mailboxId: true, graphMessageId: true } });
  if (!target) { console.log("診断対象メールが見つかりません"); process.exitCode = 1; }
  else {
    const graph = new GraphMailClient(parseGraphConfig(), new GraphTokenProvider(parseGraphConfig()));
    try { await graph.fetchMessage(target.mailboxId, target.graphMessageId); console.log("Graph認証: 成功\nメール1通取得: 成功\nDB更新: なし\ndeltaLink更新: なし\nOpenAI API: 未使用"); }
    catch (error) {
      const diagnostic = error as { name?: string; category?: string; status?: number; retryable?: boolean };
      console.log("Graph認証/メール取得: 失敗"); console.log(`失敗段階: ${diagnostic.name === "GraphAuthError" ? "Graph認証" : "Graphメール取得"}`);
      if (diagnostic.category) console.log(`エラー種別: ${diagnostic.category}`); if (typeof diagnostic.status === "number") console.log(`HTTPステータス: ${diagnostic.status}`); if (typeof diagnostic.retryable === "boolean") console.log(`再試行可能: ${diagnostic.retryable ? "はい" : "いいえ"}`);
      console.log("DB更新: なし\ndeltaLink更新: なし\nOpenAI API: 未使用"); process.exitCode = 1;
    }
  }
} finally { await prisma.$disconnect(); }
