import { getPrismaClient } from "../db/client.ts";
import { parseGraphConfig } from "../mail/graph-config.ts";
import { GraphTokenProvider } from "../mail/graph-auth.ts";
import { GraphMailClient } from "../mail/graph-client.ts";
import { claimFailedPermanentForExactMail, persistAiExtraction, recordAiProcessingFailure } from "../db/mail-repository.ts";
import { OpenAiClassifier } from "./openai-client.ts";
import { validateFailedMailReprocessRecord, type FailedMailReprocessRecord } from "./reprocess-failed-mail.ts";
import { reprocessFailedMailBatch } from "./reprocess-failed-mail-batch.ts";

const args = process.argv.slice(2);
const execute = args.includes("--execute");
if (args.some((arg) => arg !== "--execute")) {
  console.error("このコマンドは引数なしのdry-run、または--executeのみ対応します。");
  process.exitCode = 1;
} else {
  const prisma = getPrismaClient();
  try {
    const rows = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      const db = await tx.$queryRaw<Array<{ database_name: string }>>`SELECT current_database() AS database_name`;
      if (db[0]?.database_name !== "case_matching_dev") throw new Error("database_target_mismatch");
      return tx.mailMessage.findMany({
        where: { aiProcessing: { is: { aiStatus: "failed_permanent" } } },
        select: {
          id: true, subject: true, mailboxId: true, graphMessageId: true, processedBody: true,
          aiProcessing: { select: { aiStatus: true, status: true, retryCount: true } },
          _count: { select: { projects: true, talents: true } },
        },
        orderBy: { receivedAt: "asc" },
      });
    });
    const records = rows.map((row) => ({
      id: row.id, subject: row.subject, mailboxId: row.mailboxId, graphMessageId: row.graphMessageId,
      processedBody: row.processedBody, aiProcessing: row.aiProcessing,
      projectCount: row._count.projects, talentCount: row._count.talents,
    } as FailedMailReprocessRecord));
    const allowedIds = new Set(records.map((record) => record.id));
    const eligible: FailedMailReprocessRecord[] = [];
    const excludedCodes: Record<string, number> = {};
    for (const record of records) {
      const invalid = validateFailedMailReprocessRecord(record, allowedIds);
      if (!invalid) eligible.push(record);
      else excludedCodes[invalid.diagnosticCode] = (excludedCodes[invalid.diagnosticCode] ?? 0) + 1;
    }

    console.log(`failed_permanent総件数: ${records.length}`);
    console.log(`再処理可能件数: ${eligible.length}`);
    console.log(`対象外件数: ${records.length - eligible.length}`);
    console.log(`再処理可能なうち本文未保存: ${eligible.filter((record) => !record.processedBody?.trim()).length}`);
    if (Object.keys(excludedCodes).length) console.log(`対象外理由別件数: ${JSON.stringify(excludedCodes)}`);
    console.log(`予定OpenAI API上限: ${eligible.length}回（1通最大1回）`);

    if (!execute) {
      console.log("Dry-run: DB読み取りのみ。Graph API・OpenAI API・DB更新は行っていません。");
      console.log("実行時は対象を1通ずつ処理し、メールごとに状態を再確認します。Delta Linkは更新しません。");
    } else if (eligible.length === 0) {
      console.log("再処理可能なメールがないため終了しました。");
    } else {
      const graphConfig = parseGraphConfig();
      const graph = new GraphMailClient(graphConfig, new GraphTokenProvider(graphConfig));
      const classifier = new OpenAiClassifier({ maxRetries: 0 });
      const result = await reprocessFailedMailBatch(eligible, {
        graph,
        classifier,
        claim: (target) => claimFailedPermanentForExactMail(prisma, target),
        persist: (mailMessageId, response, processedBody, expectedProcessedBody) => persistAiExtraction(prisma, mailMessageId, response, processedBody, { reprocess: { expectedProcessedBody } }),
        recordFailure: (mailMessageId, errorType, errorMessage) => recordAiProcessingFailure(prisma, mailMessageId, errorType, errorMessage),
      });
      console.log(`再処理完了件数: ${result.totalCount}`);
      console.log(`成功件数: ${result.successCount}`);
      console.log(`失敗・スキップ件数: ${result.failureCount}`);
      console.log(`OpenAI API試行回数: ${result.apiCallCount}/${eligible.length}`);
      console.log(`Project新規保存件数: ${result.projectCount}`);
      console.log(`Talent新規保存件数: ${result.talentCount}`);
      if (Object.keys(result.diagnosticCodes).length) console.log(`診断コード別件数: ${JSON.stringify(result.diagnosticCodes)}`);
      console.log("Graph Delta Link更新: なし");
      if (result.failureCount > 0) process.exitCode = 1;
    }
  } catch (error) {
    const value = error !== null && typeof error === "object" ? error as { message?: unknown } : {};
    if (value.message === "database_target_mismatch") console.error("対象DBがcase_matching_devではないため中止しました。");
    else console.error("事前確認または処理中にエラーが発生しました。機密情報を含む詳細は表示しません。");
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}
