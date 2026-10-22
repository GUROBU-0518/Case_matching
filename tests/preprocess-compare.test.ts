import { describe, expect, it } from "vitest";
import { checkInformationRetention } from "../src/mail/preprocess-compare.ts";

describe("前処理の重要情報保持判定", () => {
  it("ラベル行が残っていれば保持と判定する", () => { expect(checkInformationRetention("project", "案件名：架空\n単価：非公開\n勤務形態：リモート", "案件名：架空\n単価：非公開\n勤務形態：リモート")).toMatchObject({ projectName: "保持", price: "保持", workStyle: "保持" }); });
  it("原文のラベル行が処理後にない場合は削除可能性とする", () => { expect(checkInformationRetention("talent", "氏名：架空\n希望単価：非公開\n経験年数：5年", "氏名：架空")).toMatchObject({ desiredPrice: "削除された可能性", yearsOfExperience: "削除された可能性" }); });
  it("対象ラベルがない場合は断定せず判定不能とする", () => { expect(checkInformationRetention("project", "本文のみ", "本文のみ").price).toBe("判定不能"); });
  it("HTMLのラベル行も値を表示せず判定できる", () => { expect(checkInformationRetention("talent", "<p>スキル：Java</p>", "スキル：Java").skills).toBe("保持"); });
});
