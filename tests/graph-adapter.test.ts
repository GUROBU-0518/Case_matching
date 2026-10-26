import { describe, expect, it } from "vitest";
import { parseGraphMailMessage, parseGraphResponse } from "../src/mail/graph-adapter.ts";
import { preprocessMailBody } from "../src/mail/preprocess.ts";

const base = (overrides = {}) => ({
  id: "graph-1", subject: "案件件名", from: { emailAddress: { address: "sender@example.invalid" } },
  receivedDateTime: "2026-10-16T01:00:00Z", body: { contentType: "html", content: "<p>本文&nbsp;A</p><table><tr><td>Java</td></tr></table>" }, ...overrides,
});

describe("Graph adapter", () => {
  it("HTMLメールをCommonEmailへ変換しT04前処理へ渡せる", () => {
    const result = parseGraphMailMessage(base(), "mailbox-a");
    expect(result.kind).toBe("message");
    if (result.kind !== "message") return;
    expect(result.email.messageId).toBe("graph-1");
    expect(result.email.mailboxId).toBe("mailbox-a");
    expect(result.email.receivedAt.toISOString()).toBe("2026-10-16T01:00:00.000Z");
    expect(preprocessMailBody(result.email.body, result.contentType).processedBody).toContain("Java");
  });

  it("text本文をHTML処理せず変換する", () => {
    const result = parseGraphMailMessage(base({ body: { contentType: "text", content: "<文字列>" } }), "mailbox-a");
    expect(result.kind).toBe("message");
    if (result.kind === "message") expect(preprocessMailBody(result.email.body, result.contentType).processedBody).toBe("<文字列>");
  });

  it("削除通知を通常メールと区別する", () => {
    expect(parseGraphMailMessage({ id: "deleted-1", "@removed": { reason: "deleted" } }, "mailbox-a")).toEqual({ kind: "removed", messageId: "deleted-1", reason: "deleted" });
  });

  it("欠損本文、送信者、不正日時、未知形式を拒否する", () => {
    expect(() => parseGraphMailMessage(base({ body: null }), "mailbox-a")).toThrow("本文");
    expect(() => parseGraphMailMessage(base({ from: null }), "mailbox-a")).toThrow("送信者");
    expect(() => parseGraphMailMessage(base({ receivedDateTime: "invalid" }), "mailbox-a")).toThrow();
    expect(() => parseGraphMailMessage(base({ body: { contentType: "xml", content: "x" } }), "mailbox-a")).toThrow();
  });

  it("空subjectは安全に空文字へ変換し、長さ超過は拒否する", () => {
    const result = parseGraphMailMessage(base({ subject: null }), "mailbox-a");
    expect(result.kind === "message" && result.email.subject).toBe("");
    expect(() => parseGraphMailMessage(base({ subject: "x".repeat(501) }), "mailbox-a")).toThrow();
  });

  it("応答全体のページング情報と空valueを保持する", () => {
    const result = parseGraphResponse({ value: [], "@odata.nextLink": "https://graph.example/next", "@odata.deltaLink": "https://graph.example/delta" }, "mailbox-a");
    expect(result.messages).toHaveLength(0);
    expect(result.nextLink).toContain("/next");
    expect(result.deltaLink).toContain("/delta");
  });

  it("同じGraph IDでもmailboxIdを分離する", () => {
    const a = parseGraphMailMessage(base(), "mailbox-a");
    const b = parseGraphMailMessage(base(), "mailbox-b");
    expect(a.kind === "message" && b.kind === "message" && a.email.mailboxId).not.toBe(b.kind === "message" ? b.email.mailboxId : "");
  });
});
