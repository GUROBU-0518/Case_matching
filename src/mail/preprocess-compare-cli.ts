const targets = new Map([
  ["7a5e75f5-bb49-4d3e-ba3a-7b451ed315ea", "【案件情報】【最終テスト】販売管理システム開発／Java・Spring Boot"],
  ["638de650-ffad-43d1-ba8d-ff750d9d5809", "【人材情報】【最終テスト】Javaエンジニア／経験5年／11月稼働"],
]);
const [{ getPrismaClient }, { parseGraphConfig }, { GraphTokenProvider }, { GraphMailClient }, { preprocessMailBody }, { checkInformationRetention }] = await Promise.all([
  import("../db/client.ts"), import("./graph-config.ts"), import("./graph-auth.ts"), import("./graph-client.ts"), import("./preprocess.ts"), import("./preprocess-compare.ts"),
]);
const prisma = getPrismaClient();
try {
  const rows = await prisma.mailMessage.findMany({ where: { id: { in: [...targets.keys()] } }, select: { id: true, subject: true, mailboxId: true, graphMessageId: true, processedBody: true } });
  const valid = rows.length === targets.size && rows.every((row) => targets.get(row.id) === row.subject);
  if (!valid) { console.error("対象2通のDB ID・件名完全一致確認に失敗しました。Graph取得・更新処理は行いません。"); process.exitCode = 1; }
  else {
    const config = parseGraphConfig();
    const graph = new GraphMailClient(config, new GraphTokenProvider(config));
    for (const row of rows) {
      try {
        const result = await graph.fetchMessage(row.mailboxId, row.graphMessageId);
        if (result.kind !== "message") { console.log("対象メール: 取得不可（削除済み）"); continue; }
        const original = result.email.body;
        const processed = preprocessMailBody(original, result.contentType);
        const opening = /^(お世話になっております。|いつもお世話になっております。|お疲れ様です。|平素よりお世話になっております。)$/m.test(original);
        const closing = /(よろしくお願いいたします。|何卒よろしくお願いいたします。|ご検討のほどよろしくお願いいたします。|引き続きよろしくお願いいたします。)\s*$/.test(original);
        const html = result.contentType === "html" ? /<[^>]+>/.test(original) && !/<[^>]+>/.test(processed.processedBody) : false;
        console.log(`対象メール: 取得成功; 原文文字数=${original.length}; 保存済み前処理後文=${row.processedBody?.length ?? 0}文字; 今回の前処理後文=${processed.processedBody.length}文字; 削除文字数=${original.length - processed.processedBody.length}; 冒頭挨拶=${opening ? "除去候補" : "なし/判定不能"}; 末尾挨拶=${closing ? "除去候補" : "なし/判定不能"}; 署名=${processed.signatureRemoved ? "除去" : "なし/判定不能"}; 引用=${processed.quotedReplyRemoved ? "除去" : "なし/判定不能"}; HTML=${html ? "除去" : result.contentType === "html" ? "判定不能" : "対象外"}; 空本文=${processed.processedBody.length === 0 ? "はい" : "いいえ"}; 保存本文一致=${row.processedBody === processed.processedBody ? "はい" : "いいえ"}`);
        const kind = row.subject?.includes("人材") ? "talent" : "project";
        const retention = checkInformationRetention(kind, original, processed.processedBody);
        console.log(`重要情報判定: ${Object.entries(retention).map(([field, status]) => `${field}=${status}`).join(", ")}`);
      } catch (error) {
        const diagnostic = error as { name?: string; category?: string; status?: number };
        console.log(`対象メール: 取得失敗; 種別=${diagnostic.name ?? "GraphError"}; category=${diagnostic.category ?? "unknown"}; HTTP=${typeof diagnostic.status === "number" ? diagnostic.status : "不明"}`);
        process.exitCode = 1;
      }
    }
    console.log("DB更新: なし\ndeltaLink更新: なし\nOpenAI API: 未使用");
  }
} finally { await prisma.$disconnect(); }
