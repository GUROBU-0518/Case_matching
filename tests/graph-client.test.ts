import { describe, expect, it, vi } from "vitest";
import { GraphMailClient } from "../src/mail/graph-client.ts";

const config = { tenantId: "t", clientId: "c", clientSecret: "s", mailboxes: ["a@example.com", "b@example.com"] };
const tokenProvider = { getAccessToken: vi.fn(async () => "access-token") };
const payload = (id = "m1") => ({ value: [{ id, subject: "件名", from: { emailAddress: { address: "sender@example.com" } }, receivedDateTime: "2026-01-01T00:00:00Z", body: { contentType: "text", content: "本文" } }] });

describe("GraphMailClient", () => {
  it("Graph URL、クエリ、認証ヘッダーを設定しCommonEmailへ変換する", async () => {
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => { const parsed = new URL(url); expect(parsed.pathname).toContain("/users/a%40example.com/"); expect(parsed.searchParams.get("$top")).toBe("3"); expect(parsed.searchParams.get("$orderby")).toBe("receivedDateTime desc"); expect(init?.headers).toMatchObject({ Authorization: "Bearer access-token", Accept: "application/json" }); return new Response(JSON.stringify(payload()), { status: 200 }); });
    const result = await new GraphMailClient(config, tokenProvider, { fetcher }).fetchMailbox("a@example.com");
    expect(result.messages[0]).toMatchObject({ kind: "message", contentType: "text", email: { mailboxId: "a@example.com", messageId: "m1" } });
  });
  it("許可外メールボックスと不正な件数を拒否する", async () => { const client = new GraphMailClient(config, tokenProvider, { fetcher: async () => new Response() }); await expect(client.fetchMailbox("x@example.com")).rejects.toMatchObject({ category: "validation" }); await expect(client.fetchMailbox("a@example.com", 0)).rejects.toMatchObject({ category: "validation" }); });
  it("nextLinkを辿って全ページを変換する", async () => {
    const fetcher = vi.fn(async (url: string) => url.includes("/next")
      ? new Response(JSON.stringify({ value: [{ id: "m2", subject: "次", from: { emailAddress: { address: "b@example.com" } }, receivedDateTime: "2026-01-02T00:00:00Z", body: { contentType: "text", content: "次本文" } }] }))
      : new Response(JSON.stringify({ ...payload(), "@odata.nextLink": "https://graph.example/next" })));
    const result = await new GraphMailClient(config, tokenProvider, { fetcher }).fetchMailbox("a@example.com");
    expect(result.messages).toHaveLength(2); expect(result.pagesFetched).toBe(2); expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("空一覧を処理する", async () => { const client = new GraphMailClient(config, tokenProvider, { fetcher: async () => new Response(JSON.stringify({ value: [] })) }); await expect(client.fetchMailbox("a@example.com")).resolves.toMatchObject({ messages: [], pagesFetched: 1, nextLinkPresent: false }); });
  it("同じnextLinkの繰り返しを拒否する", async () => { const loop = "https://graph.example/loop"; const client = new GraphMailClient(config, tokenProvider, { fetcher: async () => new Response(JSON.stringify({ value: [], "@odata.nextLink": loop })) }); await expect(client.fetchMailbox("a@example.com")).rejects.toMatchObject({ category: "validation" }); });
  it.each([401, 403])("%sを認証エラーに分類する", async (status) => { const client = new GraphMailClient(config, tokenProvider, { fetcher: async () => new Response("{}", { status }) }); await expect(client.fetchMailbox("a@example.com")).rejects.toMatchObject({ category: "authentication", retryable: false, status }); });
  it.each([429, 503])("%sを一時的エラーに分類しRetry-Afterを保持する", async (status) => { const client = new GraphMailClient(config, tokenProvider, { fetcher: async () => new Response("{}", { status, headers: { "retry-after": "7" } }) }); await expect(client.fetchMailbox("a@example.com")).rejects.toMatchObject({ category: "temporary", retryable: true, retryAfterSeconds: 7 }); });
  it("タイムアウトと不正JSONを安全に扱う", async () => { const timeout = new GraphMailClient(config, tokenProvider, { timeoutMs: 1, fetcher: (_url, init) => new Promise((_, reject) => { init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))); }) }); await expect(timeout.fetchMailbox("a@example.com")).rejects.toMatchObject({ category: "timeout" }); const invalid = new GraphMailClient(config, tokenProvider, { fetcher: async () => new Response("invalid") }); await expect(invalid.fetchMailbox("a@example.com")).rejects.toMatchObject({ category: "validation" }); });
});
