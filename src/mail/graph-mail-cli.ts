const args = process.argv.slice(2);
if (!args.includes("--execute")) {
  console.log("実メール取得は実行されません。実行する場合は --execute を指定してください。");
  process.exit(0);
}
try {
  const { parseGraphConfig } = await import("./graph-config.ts");
  const { GraphTokenProvider } = await import("./graph-auth.ts");
  const { GraphMailClient } = await import("./graph-client.ts");
  const required = ["GRAPH_TENANT_ID", "GRAPH_CLIENT_ID", "GRAPH_CLIENT_SECRET", "GRAPH_MAILBOXES"] as const;
  const missing = required.filter((name) => !(process.env[name]?.trim()));
  if (missing.length > 0) {
    console.error("Graph設定が不足しています。次の環境変数を設定してください:");
    for (const name of missing) console.error(`- ${name}`);
    process.exitCode = 1;
    process.exit();
  }
  const config = parseGraphConfig();
  const mailbox = args.find((arg) => arg.startsWith("--mailbox="))?.split("=", 2)[1] ?? config.mailboxes[0] ?? "";
  const top = Number(args.find((arg) => arg.startsWith("--top="))?.split("=", 2)[1] ?? 3);
  const client = new GraphMailClient(config, new GraphTokenProvider(config));
  const result = await client.fetchMailbox(mailbox, top);
  const converted = result.messages.filter((message) => message.kind === "message").length;
  console.log("Graph接続: 成功");
  console.log("対象メールボックス数: 1");
  console.log(`取得メール件数: ${result.messages.length}`);
  console.log(`CommonEmail変換成功: ${converted}`);
  console.log(`変換失敗: ${result.messages.length - converted}`);
  console.log(`取得ページ数: ${result.pagesFetched}`);
  console.log("次ページ: なし（取得完了）");
  console.log("DB保存: 実施なし");
} catch (error) {
  console.error("Graph接続: 失敗");
  console.error(error instanceof Error && error.name === "ZodError" ? "Graph設定の形式が不正です。環境変数名と値を確認してください。" : "Graph取得に失敗しました");
  process.exitCode = 1;
}
