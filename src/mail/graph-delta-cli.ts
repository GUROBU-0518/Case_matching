const args = process.argv.slice(2);
if (!args.includes("--execute")) { console.log("Delta取得は実行されません。実行する場合は --execute を指定してください。"); process.exit(0); }
try {
  const [{ parseGraphConfig }, { GraphTokenProvider }, { GraphDeltaClient }, { PrismaDeltaLinkStore }, { getPrismaClient, disconnectDatabase }] = await Promise.all([
    import("./graph-config.ts"), import("./graph-auth.ts"), import("./graph-delta.ts"), import("../db/delta-link-store.ts"), import("../db/client.ts"),
  ]);
  const required = ["GRAPH_TENANT_ID", "GRAPH_CLIENT_ID", "GRAPH_CLIENT_SECRET", "GRAPH_MAILBOXES"] as const;
  const missing = required.filter((name) => !(process.env[name]?.trim()));
  if (missing.length > 0) { console.error("Graph設定が不足しています。次の環境変数を設定してください:"); for (const name of missing) console.error(`- ${name}`); process.exitCode = 1; process.exit(); }
  const config = parseGraphConfig(); const mailbox = args.find((arg) => arg.startsWith("--mailbox="))?.split("=", 2)[1] ?? config.mailboxes[0] ?? ""; const top = Number(args.find((arg) => arg.startsWith("--top="))?.split("=", 2)[1] ?? 3);
  const prisma = getPrismaClient(); const store = new PrismaDeltaLinkStore(prisma); const existing = await store.get(mailbox); const client = new GraphDeltaClient(config, new GraphTokenProvider(config), { store });
  const result = await client.fetchDelta(mailbox, top);
  console.log("Graph接続: 成功"); console.log(`取得種別: ${existing ? "差分取得" : "初回取得"}`); console.log("対象メールボックス数: 1"); console.log(`取得ページ数: ${result.pagesFetched}`); console.log(`新規メール件数: ${result.changes.filter((change) => change.kind === "new").length}`); console.log(`変更メール件数: ${result.changes.filter((change) => change.kind === "changed").length}`); console.log(`削除検出件数: ${result.changes.filter((change) => change.kind === "removed").length}`); console.log(`CommonEmail変換成功件数: ${result.changes.filter((change) => change.message.kind === "message").length}`); console.log("deltaLink保存: 成功");
  await disconnectDatabase();
} catch (error) { console.error("Delta取得: 失敗"); console.error(error instanceof Error ? error.message : "Delta取得に失敗しました"); process.exitCode = 1; }
