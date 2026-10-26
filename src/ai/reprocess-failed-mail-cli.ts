import { getPrismaClient } from "../db/client.ts";
import { parseGraphConfig } from "../mail/graph-config.ts";
import { GraphTokenProvider } from "../mail/graph-auth.ts";
import { GraphMailClient } from "../mail/graph-client.ts";
import { claimFailedPermanentForExactMail, persistAiExtraction, recordAiProcessingFailure } from "../db/mail-repository.ts";
import { OpenAiClassifier } from "./openai-client.ts";
import { FAILED_MAIL_DIAGNOSTIC_TARGET_ID } from "./failed-mail-diagnostic.ts";
import { reprocessFailedMail, validateFailedMailReprocessRecord, type FailedMailReprocessRecord } from "./reprocess-failed-mail.ts";
import { toSafeAiFailureDiagnostic } from "./failure-diagnostic.ts";

const args = process.argv.slice(2);
const ids = args.filter((arg) => arg.startsWith("--id=")).map((arg) => arg.slice(5));
const execute = args.includes("--execute");
if (ids.length !== 1 || ids[0] !== FAILED_MAIL_DIAGNOSTIC_TARGET_ID || args.some((arg) => !arg.startsWith("--id=") && arg !== "--execute")) {
  console.error("許可済みの再処理対象1件のDB IDを指定してください。");
  process.exitCode = 1;
} else {
  const prisma = getPrismaClient();
  try {
    const data = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      const db = await tx.$queryRaw<Array<{ database_name: string }>>`SELECT current_database() AS database_name`;
      if (db[0]?.database_name !== "case_matching_dev") throw new Error("database_target_mismatch");
      return tx.mailMessage.findUnique({
        where: { id: FAILED_MAIL_DIAGNOSTIC_TARGET_ID },
        select: {
          id: true, subject: true, mailboxId: true, graphMessageId: true, processedBody: true,
          aiProcessing: { select: { aiStatus: true, status: true, retryCount: true } },
          _count: { select: { projects: true, talents: true } },
        },
      });
    });
    const record = data ? {
      id: data.id, subject: data.subject, mailboxId: data.mailboxId, graphMessageId: data.graphMessageId,
      processedBody: data.processedBody,
      aiProcessing: data.aiProcessing,
      projectCount: data._count.projects, talentCount: data._count.talents,
    } as FailedMailReprocessRecord : undefined;
    const invalid = record ? validateFailedMailReprocessRecord(record) : { stage: "configuration" as const, diagnosticCode: "target_not_found", fields: [], retryable: false };
    console.log(`対象メール存在: ${record ? "はい" : "いいえ"}`);
    console.log(`AI状態: ${record?.aiProcessing?.aiStatus ?? "記録なし"}`);
    console.log(`処理状態: ${record?.aiProcessing?.status ?? "記録なし"}`);
    console.log(`再試行回数: ${record?.aiProcessing?.retryCount ?? "確認不可"}`);
    console.log(`前処理後本文保存: ${record?.processedBody?.trim() ? "あり" : "なし"}`);
    console.log(`既存Project/Talent紐付け: ${record?.projectCount ?? 0}/${record?.talentCount ?? 0}件`);
    console.log(`再処理条件: ${invalid ? "不一致" : "一致"}`);
    if (invalid) {
      console.error(`診断コード: ${invalid.diagnosticCode}`);
      process.exitCode = 1;
    } else if (!execute) {
      console.log("Dry-run: DB読み取りのみ。Graph API・OpenAI API・DB更新は行っていません。");
      console.log("実行時はGraphから対象1通を再取得し、OpenAI APIを最大1回呼び出します。deltaLinkは更新しません。");
      console.log("実行時の保存先: MailMessage.processedBody、AiProcessing、および分類に応じたProject/Talent。");
    } else {
      try {
        const graphConfig = parseGraphConfig();
        const graph = new GraphMailClient(graphConfig, new GraphTokenProvider(graphConfig));
        const classifier = new OpenAiClassifier({ maxRetries: 0 });
        const result = await reprocessFailedMail(record!, {
          graph,
          classifier,
          claim: (target) => claimFailedPermanentForExactMail(prisma, target),
          persist: (mailMessageId, response, processedBody, expectedProcessedBody) => persistAiExtraction(prisma, mailMessageId, response, processedBody, { reprocess: { expectedProcessedBody } }),
          recordFailure: (mailMessageId, errorType, errorMessage) => recordAiProcessingFailure(prisma, mailMessageId, errorType, errorMessage),
        });
        console.log(`再処理結果: ${result.ok ? "成功" : "失敗"}`);
        console.log(`OpenAI API試行回数: ${result.apiCalls}/1`);
        if (result.ok) {
          console.log(`分類: ${result.classification}`);
          console.log(`Project/Talent保存件数: ${result.projectCount}/${result.talentCount}`);
        } else if (result.diagnostic) {
          const safe = toSafeAiFailureDiagnostic(result.diagnostic, "unknown");
          console.log(`stage: ${safe.stage}`);
          console.log(`diagnosticCode: ${safe.diagnosticCode}`);
          console.log(`fields: ${safe.fields.length ? safe.fields.join(", ") : "なし"}`);
          console.log(`HTTP status: ${safe.httpStatus ?? "取得できず"}`);
          console.log(`retryable: ${safe.retryable ? "はい" : "いいえ"}`);
        }
        console.log("Graph Delta Link更新: なし");
        if (!result.ok) process.exitCode = 1;
      } catch (error) {
        const value = error !== null && typeof error === "object" ? error as { message?: unknown } : {};
        if (value.message === "database_target_mismatch") console.error("対象DBがcase_matching_devではないため中止しました。");
        else console.error("再処理を開始できませんでした。機密情報を含む詳細は表示しません。");
        process.exitCode = 1;
      }
    }
  } catch (error) {
    const value = error !== null && typeof error === "object" ? error as { message?: unknown } : {};
    if (value.message === "database_target_mismatch") console.error("対象DBがcase_matching_devではないため中止しました。");
    else console.error("事前確認に失敗しました。機密情報を含む詳細は表示しません。");
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}
