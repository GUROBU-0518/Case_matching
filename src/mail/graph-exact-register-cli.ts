const args = process.argv.slice(2);
const execute = args.includes("--execute");
const subjects = args.filter((arg) => arg.startsWith("--subject=")).map((arg) => arg.slice("--subject=".length));
const normalizedSubjects = subjects.map((subject) => subject.trim());
if (subjects.length < 1 || subjects.some((s) => !s.trim()) || new Set(normalizedSubjects).size !== subjects.length) { console.error("--subjectを重複なく1件以上指定してください"); process.exitCode = 1; process.exit(); }
const [{ getPrismaClient }, { parseGraphConfig }, { GraphTokenProvider }, { GraphMailClient }, { selectExactSubjects }, { runMailBatch }, { persistMailBatch }] = await Promise.all([
  import("../db/client.ts"), import("./graph-config.ts"), import("./graph-auth.ts"), import("./graph-client.ts"), import("../ai/subject-selection.ts"), import("../batch/mail-batch.ts"), import("../db/mail-repository.ts"),
]);
if (!execute) { console.log("Dry-run: Graph取得・DB登録・OpenAI APIは実行しません"); console.log(`指定件名数: ${subjects.length}`); process.exit(0); }
const prisma = getPrismaClient();
try {
  const config = parseGraphConfig(); const graph = new GraphMailClient(config, new GraphTokenProvider(config));
  const receivedSince = new Date(Date.now() - 5 * 86_400_000);
  const pages = await Promise.all(config.mailboxes.map((mailbox) => graph.fetchMailbox(mailbox, 3, receivedSince)));
  const emails = pages.flatMap((page) => page.messages.filter((message) => message.kind === "message").map((message) => message.email));
  for (const subject of normalizedSubjects) {
    const exactCount = emails.filter((email) => email.subject === subject).length;
    const prefix = subject.slice(0, Math.min(12, subject.length));
    const similarCount = emails.filter((email) => typeof email.subject === "string" && email.subject !== subject && email.subject.startsWith(prefix)).length;
    console.log(`件名診断: 完全一致=${exactCount}件, 類似候補=${similarCount}件`);
  }
  const selected = selectExactSubjects(emails, subjects);
  if (selected.length !== normalizedSubjects.length) throw new Error("指定件名のメールがすべて1件ずつ揃わないため登録を中止しました");
  const result = await runMailBatch(async () => selected, undefined, 1, { maxAttempts: 1 });
  const saved = await persistMailBatch(prisma, selected, result, { markAiPending: true });
  console.log(`対象件数: ${selected.length}`); console.log(`新規登録件数: ${saved.persistedMailCount}`); console.log(`重複スキップ件数: ${saved.skippedProcessedCount}`); console.log("deltaLink更新: なし"); console.log("OpenAI API: 未使用");
} finally { await prisma.$disconnect(); }
