import { getPrismaClient } from "../db/client.ts";
import { parseGraphConfig } from "../mail/graph-config.ts";
import { GraphTokenProvider } from "../mail/graph-auth.ts";
import { GraphMailClient } from "../mail/graph-client.ts";
import { OpenAiClassifier } from "./openai-client.ts";
import { FAILED_MAIL_DIAGNOSTIC_TARGET_ID, diagnoseFailedMail, validateFailedMailDiagnosticRecord, type FailedMailDiagnosticRecord } from "./failed-mail-diagnostic.ts";
import { toSafeAiFailureDiagnostic } from "./failure-diagnostic.ts";

function printDiagnostic(input: unknown, fallback: "configuration" | "unknown" = "configuration"): void {
  const value = toSafeAiFailureDiagnostic(input, fallback);
  console.error(`stage: ${value.stage}`);
  console.error(`diagnosticCode: ${value.diagnosticCode}`);
  console.error(`fields: ${value.fields.length ? value.fields.join(", ") : "なし"}`);
  console.error(`HTTP status: ${value.httpStatus ?? "取得できず"}`);
  console.error(`retryable: ${value.retryable ? "はい" : "いいえ"}`);
  if (value.errorClass) console.error(`errorClass: ${value.errorClass}`);
  if (value.errorCode) console.error(`errorCode: ${value.errorCode}`);
  if (value.errorType) console.error(`errorType: ${value.errorType}`);
  if (value.causeClass) console.error(`causeClass: ${value.causeClass}`);
  if (value.causeCode) console.error(`causeCode: ${value.causeCode}`);
  if (value.causeCategory) console.error(`causeCategory: ${value.causeCategory}`);
}

const args = process.argv.slice(2);
const ids = args.filter((arg) => arg.startsWith("--id=")).map((arg) => arg.slice(5));
const execute = args.includes("--execute");
if (ids.length !== 1 || ids[0] !== FAILED_MAIL_DIAGNOSTIC_TARGET_ID || args.some((arg) => !arg.startsWith("--id=") && arg !== "--execute")) {
  console.error("固定された診断対象1件のIDを --id で指定してください。");
  process.exitCode = 1;
} else {
  const prisma = getPrismaClient();
  try {
    const record = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      const db = await tx.$queryRaw<Array<{ database_name: string }>>`SELECT current_database() AS database_name`;
      if (db[0]?.database_name !== "case_matching_dev") throw new Error("database_target_mismatch");
      return tx.mailMessage.findUnique({
        where: { id: FAILED_MAIL_DIAGNOSTIC_TARGET_ID },
        select: {
          id: true, subject: true, mailboxId: true, graphMessageId: true, processedBody: true,
          aiProcessing: { select: { aiStatus: true, status: true, retryCount: true } },
        },
      });
    });
    if (!record) {
      console.error("診断対象メールがDBに存在しないため中止しました。");
      process.exitCode = 1;
    } else {
      const safeRecord = record as FailedMailDiagnosticRecord;
      const invalid = validateFailedMailDiagnosticRecord(safeRecord);
      if (invalid) {
        console.error("診断対象の事前条件を満たさないため中止しました。");
        printDiagnostic(invalid);
        process.exitCode = 1;
      } else if (!execute) {
        console.log("Dry-run: 対象1件のDB状態確認のみ完了しました。Graph API・OpenAI API・DB更新は行っていません。");
        console.log("実行時の最大OpenAI API呼び出し回数: 1。DB更新およびDelta Link更新は行いません。");
      } else {
        try {
          const graphConfig = parseGraphConfig();
          const graph = new GraphMailClient(graphConfig, new GraphTokenProvider(graphConfig));
          const classifier = new OpenAiClassifier({ maxRetries: 0 });
          const result = await diagnoseFailedMail(safeRecord, { graph, classifier });
          console.log(`診断結果: ${result.ok ? "AI処理成功" : "AI処理失敗"}`);
          console.log(`OpenAI API試行回数: ${result.apiCalls}/1`);
          console.log("DB更新: なし\nDelta Link更新: なし");
          if (result.diagnostic) {
            printDiagnostic(result.diagnostic, "unknown");
            process.exitCode = 1;
          }
        } catch (error) {
          console.error("診断を開始できませんでした。");
          printDiagnostic(error);
          process.exitCode = 1;
        }
      }
    }
  } catch (error) {
    const value = error !== null && typeof error === "object" ? error as { message?: unknown } : {};
    if (value.message === "database_target_mismatch") console.error("診断を中止しました。対象DBが一致しません。");
    else console.error("診断の事前確認中にエラーが発生しました。");
    printDiagnostic(error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}
