const args = process.argv.slice(2);
if (!args.includes("--execute")) { console.log("Graphバッチは実行されません。実行する場合は --execute を指定してください。"); process.exit(0); }
let prisma: { $disconnect: () => Promise<void> } | undefined;
try {
  const [{ parseGraphConfig }, { GraphTokenProvider }, { GraphDeltaClient }, { GraphMailClient }, { PrismaDeltaLinkStore }, { getPrismaClient }, { runGraphMailBatchWithPersistence }, { runRetryMailBatch }] = await Promise.all([
    import("./graph-config.ts"), import("./graph-auth.ts"), import("./graph-delta.ts"), import("./graph-client.ts"), import("../db/delta-link-store.ts"), import("../db/client.ts"), import("../batch/graph-mail-batch.ts"), import("../batch/retry-mail-batch.ts"),
  ]);
  const required = ["GRAPH_TENANT_ID", "GRAPH_CLIENT_ID", "GRAPH_CLIENT_SECRET", "GRAPH_MAILBOXES"] as const;
  const missing = required.filter((name) => !(process.env[name]?.trim()));
  if (missing.length > 0) { console.error("Graph設定が不足しています。次の環境変数を設定してください:"); for (const name of missing) console.error(`- ${name}`); process.exitCode = 1; process.exit(); }
  const config = parseGraphConfig();
  const selected = args.find((arg) => arg.startsWith("--mailbox="))?.split("=", 2)[1];
  const mailboxes = selected ? [selected] : config.mailboxes;
  const top = Number(args.find((arg) => arg.startsWith("--top="))?.split("=", 2)[1] ?? 3);
  const preview = args.includes("--preview");
  const client = getPrismaClient(); prisma = client;
  const store = new PrismaDeltaLinkStore(client);
  const tokenProvider = new GraphTokenProvider(config);
  const graph = new GraphDeltaClient(config, tokenProvider, { store });
  const graphMessages = new GraphMailClient(config, tokenProvider);
  console.log(`対象メールボックス数: ${mailboxes.length}`);
  for (const mailboxId of mailboxes) {
    let stage = "MailSyncState / PostgreSQL取得";
    try {
      const existing = await store.get(mailboxId);
      stage = "temporary再試行";
      const retry = await runRetryMailBatch(client, graphMessages, { mailboxId });
      console.log(`再試行候補件数: ${retry.totalCount}`);
      console.log(`再試行成功件数: ${retry.successCount}`);
      console.log(`再試行失敗件数: ${retry.failureCount}`);
      console.log(`再試行上限到達件数: ${retry.items.filter((item) => item.status === "failed" && item.retryCount >= 3).length}`);
      stage = "Graph認証 / Delta取得 / CommonEmail変換 / T04処理 / DB保存 / deltaLink確定";
      const result = await runGraphMailBatchWithPersistence(graph, client, mailboxId, top);
      const changes = result.batch.totalCount;
      console.log(`メールボックス処理: ${mailboxId}`);
      console.log(`取得種別: ${existing ? "差分取得" : "初回取得"}`);
      console.log(`T04処理件数: ${changes}`);
      console.log(`T04成功件数: ${result.batch.successCount}`);
      console.log(`T04失敗件数: ${result.batch.failureCount}`);
      console.log(`DB保存成功件数: ${result.persistence?.persistedProcessingCount ?? 0}`);
      console.log(`DB保存失敗件数: ${result.persistence?.dbSaveFailureCount ?? 0}`);
      console.log(`deltaLink確定: ${result.deltaLinkSaved ? "成功" : result.safeHandoff ? "失敗" : "未実施"}`);
      if (preview) for (const item of result.batch.items) console.log(`前処理確認 ${item.messageId}: ${item.originalLength}文字 -> ${item.processedLength}文字`);
    } catch (error) {
      console.error(`メールボックス処理: 失敗（${mailboxId}）`);
      console.error(`失敗段階: ${stage}`);
      if (error && typeof error === "object" && "category" in error) {
        const diagnostic = error as { category?: unknown; status?: unknown; retryable?: unknown };
        console.error(`エラー種別: ${typeof diagnostic.category === "string" ? diagnostic.category : "unknown"}`);
        if (typeof diagnostic.status === "number") console.error(`HTTPステータス: ${diagnostic.status}`);
        if (typeof diagnostic.retryable === "boolean") console.error(`再試行可能: ${diagnostic.retryable ? "はい" : "いいえ"}`);
      } else {
        console.error(`エラー種別: ${error instanceof Error ? error.name : "unknown"}`);
      }
      console.error("エラー内容: 安全上、詳細メッセージは表示していません");
    }
  }
} catch { console.error("Graphバッチ: 失敗"); process.exitCode = 1; }
finally { if (prisma) { try { await prisma.$disconnect(); } catch { /* 終了処理 */ } } }
