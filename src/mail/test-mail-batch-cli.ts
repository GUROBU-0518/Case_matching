import { readFile } from "node:fs/promises";
import { parseTestMailTargets, validateFetchedTestMail } from "./test-mail-targets.ts";
import { parseGraphConfig } from "./graph-config.ts";
import { GraphTokenProvider } from "./graph-auth.ts";
import { GraphMailClient } from "./graph-client.ts";
import { getPrismaClient } from "../db/client.ts";
import { preprocessMailBody } from "./preprocess.ts";
import { OpenAiClassifier } from "../ai/openai-client.ts";
import { AiUsageBudget, parseAiMaxCalls } from "../ai/usage-budget.ts";
import { persistAiExtraction, persistMailResult, recordAiProcessingFailure } from "../db/mail-repository.ts";
import type { MailItemResult } from "../batch/mail-batch.ts";

const args = process.argv.slice(2);
const targetArg = args.find((arg) => arg.startsWith("--targets="))?.slice("--targets=".length);
if (!targetArg) throw new Error("--targets=<対象JSONファイル>が必要です");
const raw = JSON.parse(await readFile(targetArg, "utf8"));
const targets = parseTestMailTargets(raw);
const execute = args.includes("--execute");
if (!execute) {
  console.log(`テスト対象: ${targets.length}通`);
  console.log("Dry-run: Graph API・OpenAI API・DB更新・Delta Link更新はありません");
  process.exit(0);
}

const config = parseGraphConfig();
const mailboxId = targets[0]!.mailboxId;
if (!config.mailboxes.includes(mailboxId)) throw new Error("対象メールボックスが許可リストにありません");
const graph = new GraphMailClient(config, new GraphTokenProvider(config));
const prisma = getPrismaClient();
const classifier = new OpenAiClassifier({ maxRetries: 0 });
const budget = new AiUsageBudget(parseAiMaxCalls(process.env.AI_MAX_CALLS));
const batchStartedAt = Date.now();
const emails = [];
for (const target of targets) {
  const fetched = await graph.fetchMessage(target.mailboxId, target.graphMessageId);
  if (fetched.kind !== "message") throw new Error("対象メールを取得できません");
  validateFetchedTestMail(target, fetched.email);
  emails.push(fetched.email);
}

let success = 0;
let failure = 0;
const timings: Array<{ number: number; aiMs: number; saveMs: number; success: boolean }> = [];
for (const [index, email] of emails.entries()) {
  const processed = preprocessMailBody(email.body).processedBody;
  const existing = await prisma.mailMessage.findUnique({ where: { mailboxId_graphMessageId: { mailboxId: email.mailboxId, graphMessageId: email.messageId } }, include: { aiProcessing: true } });
  if (existing?.aiProcessing?.aiStatus === "succeeded" || existing?.aiProcessing?.aiStatus === "processing") continue;
  if (!budget.tryConsume()) continue;
  const started = Date.now();
  let saved = false;
  try {
    const pending: MailItemResult = { mailboxId: email.mailboxId, messageId: email.messageId, success: true, status: "succeeded", attempts: 1, retryCount: 0, originalLength: email.body.length, processedLength: processed.length, processedBody: processed, errorCode: undefined };
    const saveStarted = Date.now();
    await persistMailResult(prisma, email, pending, { deferProcessingStatus: true });
    const response = await classifier.classifyAndExtract({ subject: email.subject, processedBody: processed });
    await persistAiExtraction(prisma, existing?.id ?? (await prisma.mailMessage.findUniqueOrThrow({ where: { mailboxId_graphMessageId: { mailboxId: email.mailboxId, graphMessageId: email.messageId } }, select: { id: true } })).id, response, processed);
    timings.push({ number: index + 1, aiMs: Date.now() - started, saveMs: Date.now() - saveStarted, success: true }); saved = true; success += 1;
  } catch (error) {
    failure += 1;
    const mailId = existing?.id ?? (await prisma.mailMessage.findUnique({ where: { mailboxId_graphMessageId: { mailboxId: email.mailboxId, graphMessageId: email.messageId } }, select: { id: true } }))?.id;
    if (mailId) await recordAiProcessingFailure(prisma, mailId, "permanent", "テスト対象メールのAI処理に失敗しました");
    timings.push({ number: index + 1, aiMs: Date.now() - started, saveMs: 0, success: false });
    console.error(`対象${index + 1}: 失敗（${error instanceof Error ? error.name : "unknown"}）`);
  }
  if (!saved) continue;
}
console.log(`対象件数: ${targets.length}`);
console.log(`AI成功件数: ${success}`);
console.log(`AI失敗件数: ${failure}`);
console.log(`AI API試行回数: ${budget.count}/${budget.limit}`);
console.log(`バッチ処理時間(ms): ${Date.now() - batchStartedAt}`);
const aiDurations = timings.map((item) => item.aiMs);
console.log(`AI処理時間合計(ms): ${aiDurations.reduce((sum, value) => sum + value, 0)}`);
console.log(`AI処理時間平均(ms): ${aiDurations.length ? aiDurations.reduce((sum, value) => sum + value, 0) / aiDurations.length : 0}`);
console.log(`AI処理時間最短(ms): ${aiDurations.length ? Math.min(...aiDurations) : 0}`);
console.log(`AI処理時間最長(ms): ${aiDurations.length ? Math.max(...aiDurations) : 0}`);
for (const timing of timings) console.log(`対象${timing.number}: AI=${timing.aiMs}ms DB保存=${timing.saveMs}ms 成否=${timing.success ? "成功" : "失敗"}`);
await prisma.$disconnect();
