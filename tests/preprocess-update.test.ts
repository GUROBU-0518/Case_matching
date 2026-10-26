import { describe, expect, it } from "vitest";
import { createPreprocessConfirmationToken, isSafeToUpdate } from "../src/mail/preprocess-update.ts";
describe("前処理結果更新の安全条件", () => {
  it("同じ入力から同じトークンを生成する", () => { const input={id:"a",subject:"件名",storedBody:"旧",originalBody:"原",processedBody:"新"}; expect(createPreprocessConfirmationToken(input)).toBe(createPreprocessConfirmationToken(input)); });
  it("危険な判定や空本文は拒否する", () => { expect(isSafeToUpdate({storedBody:"旧",processedBody:"新",retention:{price:"判定不能"}})).toBe(false); expect(isSafeToUpdate({storedBody:"旧",processedBody:"",retention:{price:"保持"}})).toBe(false); });
  it("安全な差分だけを許可する", () => { expect(isSafeToUpdate({storedBody:"旧",processedBody:"新",retention:{price:"保持",phase:"保持"}})).toBe(true); expect(isSafeToUpdate({storedBody:"新",processedBody:"新",retention:{price:"保持"}})).toBe(false); });
});
