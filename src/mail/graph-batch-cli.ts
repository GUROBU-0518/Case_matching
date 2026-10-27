import { open, unlink } from "node:fs/promises";
import { join } from "node:path";
const args = process.argv.slice(2);
if (!args.includes("--execute")) { console.log("Graphバッチは実行されません。実行する場合は --execute を指定してください。"); process.exit(0); }
let prisma: { $disconnect: () => Promise<void> } | undefined;
let lockHandle: Awaited<ReturnType<typeof open>> | undefined;
try {
  const lockPath = join(process.env.LOCALAPPDATA ?? process.cwd(), "case-matching-graph-batch.lock");
  try {
    lockHandle = await open(lockPath, "wx");
    await lockHandle.writeFile(`${process.pid}\n${new Date().toISOString()}\n`, "utf8");
  } catch {
    console.error("Graphバッチは既に実行中のため開始しません");
    process.exitCode = 1;
    process.exit();
  }
  const [{ parseGraphConfig }, { GraphTokenProvider }, { GraphDeltaClient }, { GraphMailClient }, { PrismaDeltaLinkStore }, { getPrismaClient }, { runGraphMailBatchWithPersistence }, { runRetryMailBatch }, { AiUsageBudget, parseAiMaxCalls }, { runStoredAiPendingBatch }, aiModule] = await Promise.all([
    import("./graph-config.ts"), import("./graph-auth.ts"), import("./graph-delta.ts"), import("./graph-client.ts"), import("../db/delta-link-store.ts"), import("../db/client.ts"), import("../batch/graph-mail-batch.ts"), import("../batch/retry-mail-batch.ts"), import("../ai/usage-budget.ts"), import("../batch/stored-ai-batch.ts"), args.includes("--ai") ? import("../ai/openai-client.ts") : Promise.resolve(undefined),
  ]);
  const required = ["GRAPH_TENANT_ID", "GRAPH_CLIENT_ID", "GRAPH_CLIENT_SECRET", "GRAPH_MAILBOXES"] as const;
  const missing = required.filter((name) => !(process.env[name]?.trim()));
  if (missing.length > 0) { throw new Error(`Graph設定が不足しています: ${missing.join(", ")}`); }
  const config = parseGraphConfig();
  const selected = args.find((arg) => arg.startsWith("--mailbox="))?.split("=", 2)[1];
  const mailboxes = selected ? [selected] : config.mailboxes;
  const top = Number(args.find((arg) => arg.startsWith("--top="))?.split("=", 2)[1] ?? 3);
  const preview = args.includes("--preview");
  const subjectPrefixArg = args.find((arg) => arg.startsWith("--subject-prefix="));
  const subjectPrefix = subjectPrefixArg?.slice("--subject-prefix=".length);
  if (subjectPrefixArg && !subjectPrefix?.trim()) { throw new Error("--subject-prefixは空にできません"); }
  const classifier = aiModule ? new aiModule.OpenAiClassifier() : undefined;
  const aiBudget = classifier ? new AiUsageBudget(parseAiMaxCalls(process.env.AI_MAX_CALLS)) : undefined;
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
      const retry = await runRetryMailBatch(client, graphMessages, { mailboxId, ...(classifier ? { classifier } : {}), ...(subjectPrefix ? { subjectPrefix } : {}), ...(aiBudget ? { aiBudget } : {}) });
      console.log(`再試行候補件数: ${retry.totalCount}`);
      console.log(`再試行成功件数: ${retry.successCount}`);
      console.log(`再試行失敗件数: ${retry.failureCount}`);
      console.log(`再試行上限到達件数: ${retry.items.filter((item) => item.status === "failed" && item.retryCount >= 3).length}`);
      stage = "Graph認証 / Delta取得 / CommonEmail変換 / T04処理 / DB保存 / deltaLink確定";
      const result = await runGraphMailBatchWithPersistence(graph, client, mailboxId, top, { ...(classifier ? { classifier } : {}), ...(subjectPrefix ? { subjectPrefix } : {}), ...(aiBudget ? { aiBudget } : {}) });
      const stored = classifier && aiBudget ? await runStoredAiPendingBatch(client, classifier, { mailboxId, budget: aiBudget, graphClient: graphMessages }) : undefined;
      const changes = result.batch.totalCount;
      console.log(`メールボックス処理: ${mailboxId}`);
      console.log(`取得種別: ${existing ? "差分取得" : "初回取得"}`);
      console.log(`T04処理件数: ${changes}`);
      console.log(`T04成功件数: ${result.batch.successCount}`);
      console.log(`T04失敗件数: ${result.batch.failureCount}`);
      console.log(`DB保存成功件数: ${result.persistence?.persistedProcessingCount ?? 0}`);
      console.log(`DB保存失敗件数: ${result.persistence?.dbSaveFailureCount ?? 0}`);
      console.log(`AI処理対象件数: ${result.batch.totalCount}`);
      console.log(`AI成功件数: ${args.includes("--ai") ? result.batch.successCount : 0}`);
      console.log(`AI失敗件数: ${args.includes("--ai") ? result.batch.failureCount : 0}`);
      for (const [index, item] of result.batch.items.entries()) {
        if (!item.success && item.diagnostic) console.log(`失敗診断 #${index + 1}: ${JSON.stringify(item.diagnostic)}`);
      }
      console.log(`AI API試行回数: ${aiBudget ? `${aiBudget.count}/${Number.isFinite(aiBudget.limit) ? aiBudget.limit : "無制限"}` : "0/0"}`);
      if (stored) { console.log(`DB未処理回収件数: ${stored.totalCount}`); console.log(`本文再取得対象件数: ${stored.bodyRefetchCandidates}`); console.log(`本文再取得成功件数: ${stored.bodyRefetchSuccessCount}`); console.log(`本文再取得失敗件数: ${stored.bodyRefetchFailureCount}`); console.log(`DB未処理AI成功件数: ${stored.successCount}`); console.log(`DB未処理AI失敗件数: ${stored.failureCount}`); console.log(`AI上限繰越件数: ${stored.deferredCount}`); }
      console.log(`既存成功済みスキップ件数: ${result.aiSkippedSucceeded}`);
      console.log(`恒久失敗スキップ件数: ${result.aiSkippedPermanent}`);
      console.log(`一時失敗・再試行対象件数: ${result.aiSkippedTemporary}`);
      console.log(`deltaLink確定: ${result.deltaLinkSaved ? "成功" : result.safeHandoff ? "失敗" : "未実施"}`);
      if (result.metrics) {
        console.log(`Delta取得時間(ms): ${result.metrics.deltaDurationMs}`);
        console.log(`Delta取得ページ数: ${result.metrics.pagesFetched}`);
        console.log(`Delta差分件数: ${result.metrics.deltaMessageCount}`);
        console.log(`メール保存時間(ms): ${result.metrics.mailPersistenceDurationMs}`);
        console.log(`AI抽出結果保存時間(ms): ${result.metrics.extractionPersistenceDurationMs}`);
        const aiDurations = result.metrics.aiTimings.map((item) => item.durationMs);
        const aiTotal = aiDurations.reduce((sum, value) => sum + value, 0);
        console.log(`AI処理時間合計(ms): ${aiTotal}`);
        console.log(`AI処理時間平均(ms): ${aiDurations.length ? aiTotal / aiDurations.length : 0}`);
        console.log(`AI処理時間最短(ms): ${aiDurations.length ? Math.min(...aiDurations) : 0}`);
        console.log(`AI処理時間最長(ms): ${aiDurations.length ? Math.max(...aiDurations) : 0}`);
      }
      if (preview) for (const item of result.batch.items) console.log(`前処理確認 ${item.messageId}: ${item.originalLength}文字 -> ${item.processedLength}文字`);
    } catch (error) {
      console.error(`メールボックス処理: 失敗（${mailboxId}）`);
      console.error(`失敗段階: ${stage}`);
      if (error && typeof error === "object" && "category" in error) {
        const diagnostic = error as { category?: unknown; status?: unknown; retryable?: unknown; stage?: unknown; diagnosticCode?: unknown; fields?: unknown };
        console.error(`エラー種別: ${typeof diagnostic.category === "string" ? diagnostic.category : "unknown"}`);
        if (typeof diagnostic.stage === "string") console.error(`失敗段階: ${diagnostic.stage}`);
        if (typeof diagnostic.diagnosticCode === "string") console.error(`診断コード: ${diagnostic.diagnosticCode}`);
        if (Array.isArray(diagnostic.fields)) console.error(`問題フィールド: ${diagnostic.fields.filter((field): field is string => typeof field === "string" && /^[A-Za-z][A-Za-z0-9_.-]{0,119}$/.test(field)).slice(0, 50).join(",") || "なし"}`);
        if (typeof diagnostic.status === "number") console.error(`HTTPステータス: ${diagnostic.status}`);
        if (typeof diagnostic.retryable === "boolean") console.error(`再試行可能: ${diagnostic.retryable ? "はい" : "いいえ"}`);
      } else {
        console.error(`エラー種別: ${error instanceof Error ? error.name : "unknown"}`);
      }
      console.error("エラー内容: 安全上、詳細メッセージは表示していません");
    }
  }
} catch { console.error("Graphバッチ: 失敗"); process.exitCode = 1; }
finally {
  if (prisma) { try { await prisma.$disconnect(); } catch { /* 終了処理 */ } }
  if (lockHandle) { try { const lockPath = join(process.env.LOCALAPPDATA ?? process.cwd(), "case-matching-graph-batch.lock"); await lockHandle.close(); await unlink(lockPath); } catch { /* 終了処理 */ } }
}
