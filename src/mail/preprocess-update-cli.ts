import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
const targetSubjects = new Map([
  ["7a5e75f5-bb49-4d3e-ba3a-7b451ed315ea", "【案件情報】【最終テスト】販売管理システム開発／Java・Spring Boot"],
  ["638de650-ffad-43d1-ba8d-ff750d9d5809", "【人材情報】【最終テスト】Javaエンジニア／経験5年／11月稼働"],
]);
const args = process.argv.slice(2); const execute = args.includes("--execute"); const tokenArg = args.find((arg) => arg.startsWith("--token="))?.slice(8);
const [{ getPrismaClient }, { parseGraphConfig }, { GraphTokenProvider }, { GraphMailClient }, { preprocessMailBody }, { checkInformationRetention }, { createPreprocessConfirmationToken, isSafeToUpdate }] = await Promise.all([
  import("../db/client.ts"), import("./graph-config.ts"), import("./graph-auth.ts"), import("./graph-client.ts"), import("./preprocess.ts"), import("./preprocess-compare.ts"), import("./preprocess-update.ts"),
]);
const prisma = getPrismaClient();
try {
  const rows = await prisma.mailMessage.findMany({ where: { id: { in: [...targetSubjects.keys()] } }, select: { id: true, subject: true, mailboxId: true, graphMessageId: true, processedBody: true } });
  if (rows.length !== targetSubjects.size || rows.some((row) => targetSubjects.get(row.id) !== row.subject)) { console.error("固定対象2通のID・件名確認に失敗しました。更新しません。"); process.exitCode = 1; }
  else if (execute && !tokenArg) { console.error("executeにはdry-runで取得した--tokenが必要です。更新しません。"); process.exitCode = 1; }
  else {
    const graphConfig = parseGraphConfig(); const graph = new GraphMailClient(graphConfig, new GraphTokenProvider(graphConfig));
    const plans: Array<{ id: string; subject: string; storedBody: string | null; originalBody: string; processedBody: string; token: string }> = [];
    for (const row of rows) {
      const fetched = await graph.fetchMessage(row.mailboxId, row.graphMessageId);
      if (fetched.kind !== "message") throw new Error("対象メールを取得できませんでした");
      const prepared = preprocessMailBody(fetched.email.body, fetched.contentType);
      const kind = row.subject?.includes("人材") ? "talent" : "project";
      const retention = checkInformationRetention(kind, fetched.email.body, prepared.processedBody);
      const safe = isSafeToUpdate({ storedBody: row.processedBody, processedBody: prepared.processedBody, retention });
      const planToken = createPreprocessConfirmationToken({ id: row.id, subject: row.subject ?? "", storedBody: row.processedBody ?? "", originalBody: fetched.email.body, processedBody: prepared.processedBody });
      if (!safe) throw new Error("安全条件を満たさないため更新しません");
      plans.push({ id: row.id, subject: row.subject ?? "", storedBody: row.processedBody, originalBody: fetched.email.body, processedBody: prepared.processedBody, token: planToken });
      console.log(`更新計画: 対象メール確認済み; 既存本文=${row.processedBody?.length ?? 0}文字; 新本文=${prepared.processedBody.length}文字; トークン=${planToken}`);
    }
    const combinedToken = createPreprocessConfirmationToken({ id: "two-mail-batch", subject: plans.map((p) => p.subject).join("\n"), storedBody: plans.map((p) => p.storedBody ?? "").join("\n"), originalBody: plans.map((p) => p.originalBody).join("\n"), processedBody: plans.map((p) => p.processedBody).join("\n") });
    console.log(`確認トークン: ${combinedToken}`);
    if (!execute) console.log("Dry-run: DB更新・AI・deltaLink更新はありません");
    else if (tokenArg !== combinedToken) { console.error("事前確認トークンが一致しないため更新しません"); process.exitCode = 1; }
    else {
      const backupDir = join(process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"), "case-matching-backups"); await mkdir(backupDir, { recursive: true });
      await writeFile(join(backupDir, `processed-body-backup-${Date.now()}.json`), JSON.stringify(plans.map((p) => ({ id: p.id, subject: p.subject, processedBody: p.storedBody })), null, 2), { encoding: "utf8", flag: "wx" });
      await prisma.$transaction(async (tx) => { for (const plan of plans) { const result = await tx.mailMessage.updateMany({ where: { id: plan.id, subject: plan.subject, processedBody: plan.storedBody }, data: { processedBody: plan.processedBody } }); if (result.count !== 1) throw new Error("更新件数が想定外です"); } }, { isolationLevel: "Serializable" });
      console.log("processedBodyのみ更新しました");
    }
  }
} catch (error) { console.error(error instanceof Error ? error.message : "安全な更新処理に失敗しました"); process.exitCode = 1; }
finally { await prisma.$disconnect(); }
