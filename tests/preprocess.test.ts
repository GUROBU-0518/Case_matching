import { describe, expect, it } from "vitest";
import { preprocessMailBody } from "../src/mail/preprocess.ts";

describe("preprocessMailBody", () => {
  it("冒頭と末尾の独立した定型挨拶を除去する", () => {
    const result = preprocessMailBody("お世話になっております。\n案件名：在庫管理\n必須スキル：TypeScript\nご検討のほどよろしくお願いいたします。");
    expect(result.processedBody).toBe("案件名：在庫管理\n必須スキル：TypeScript");
  });

  it("挨拶に似た重要情報を含む行は保持する", () => {
    const result = preprocessMailBody("11月から稼働可能な人材をご紹介いたします。\n氏名：架空A");
    expect(result.processedBody).toContain("11月から稼働可能");
  });

  it("テキストの改行と行末空白を正規化する", () => {
    const result = preprocessMailBody(" A  \r\n\r\n\r\nB　C  ");
    expect(result.processedBody).toBe("A\n\nB　C");
  });

  it("HTMLの構造、表、リスト、エンティティを保持する", () => {
    const result = preprocessMailBody("<html><style>x</style><p>案件&nbsp;名</p><table><tr><td>Java</td><td>70万&amp;～</td></tr></table><ul><li>AWS</li></ul><script>bad()</script></html>", "html");
    expect(result.processedBody).toContain("案件 名");
    expect(result.processedBody).toContain("Java");
    expect(result.processedBody).toContain("70万&～");
    expect(result.processedBody).toContain("AWS");
    expect(result.processedBody).not.toContain("bad");
  });

  it("明確な署名だけを末尾から除去する", () => {
    const result = preprocessMailBody("本文\n\n--\n会社名\nTEL: 000-0000");
    expect(result.processedBody).toBe("本文");
    expect(result.signatureRemoved).toBe(true);
    expect(preprocessMailBody("本文\n会社名だけ").processedBody).toContain("会社名だけ");
  });

  it("明確な引用履歴だけを除去しRe:本文は保持する", () => {
    const result = preprocessMailBody("Re: 案件の確認\n本文\n\nOn 2026/01/01 someone wrote:\n> 過去本文");
    expect(result.processedBody).toContain("Re: 案件の確認");
    expect(result.processedBody).not.toContain("過去本文");
    expect(result.quotedReplyRemoved).toBe(true);
  });

  it("入力本文を変更せず、再処理結果が同じになる", () => {
    const original = "  本文\r\n\r\n";
    const first = preprocessMailBody(original);
    const second = preprocessMailBody(first.processedBody);
    expect(first.originalBody).toBe(original);
    expect(second.processedBody).toBe(first.processedBody);
  });

  it("空文字列と特殊文字を処理する", () => {
    expect(preprocessMailBody("").processedBody).toBe("");
    expect(preprocessMailBody("●●　￥ & < >").processedBody).toContain("●●　￥");
  });

  it("日本語の返信履歴と転送ヘッダーを除去し本文を保持する", () => {
    const result = preprocessMailBody("案件名：架空案件\n転送:\n差出人：旧担当\n送信日時：2026/01/01\n件名：旧件名\n旧本文");
    expect(result.processedBody).toContain("案件名：架空案件");
    expect(result.processedBody).not.toContain("旧本文");
  });

  it("単独の引用記号や重要な区切り線は削除しない", () => {
    const result = preprocessMailBody("案件概要：A > B\n商流制限：一次請け限定\n-----\n勤務地：東京");
    expect(result.processedBody).toContain("商流制限：一次請け限定");
    expect(result.processedBody).toContain("勤務地：東京");
  });

  it("配信停止などの定型フッターを末尾から除去する", () => {
    const result = preprocessMailBody("案件名：架空案件\n単価：70万円\n配信停止はこちら\nメールマガジンの購読解除");
    expect(result.processedBody).toContain("単価：70万円");
    expect(result.processedBody).not.toContain("購読解除");
  });

  it("HTMLの表と商流条件を保持する", () => {
    const result = preprocessMailBody("<table><tr><td>案件名</td><td>在庫管理</td></tr><tr><td>単価</td><td>70万円</td></tr></table><p>商流制限：一次請け限定</p>", "html");
    expect(result.processedBody).toContain("案件名");
    expect(result.processedBody).toContain("70万円");
    expect(result.processedBody).toContain("商流制限：一次請け限定");
  });
});


