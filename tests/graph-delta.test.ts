import { describe, expect, it, vi } from "vitest";
import { GraphDeltaClient, MemoryDeltaLinkStore } from "../src/mail/graph-delta.ts";
const config = { tenantId: "t", clientId: "c", clientSecret: "s", mailboxes: ["a@example.com"] };
const token = { getAccessToken: vi.fn(async () => "token") };
const message = (id: string) => ({ id, subject: id, from: { emailAddress: { address: "a@example.com" } }, receivedDateTime: "2026-01-01T00:00:00Z", body: { contentType: "text", content: id } });
describe("GraphDeltaClient", () => {
  it("初回は5日フィルター付きDeltaを取得し最終deltaLinkを保存する", async () => {
    const store = new MemoryDeltaLinkStore();
    const fetcher = vi.fn(async (url: string) => { expect(url).toContain("/messages/delta?"); expect(url).toContain("%24filter="); return new Response(JSON.stringify({ value: [message("new")], "@odata.deltaLink": "https://graph.example/delta-final" })); });
    const result = await new GraphDeltaClient(config, token, { fetcher, store }).fetchDelta("a@example.com");
    expect(result.newMessages).toHaveLength(1); expect(result.pagesFetched).toBe(1); expect(store.get("a@example.com")).toBe("https://graph.example/delta-final");
  });
  it("nextLinkを辿り新規・変更・削除を区別する", async () => { const store = new MemoryDeltaLinkStore(); await store.set("a@example.com", "https://graph.example/start"); const fetcher = vi.fn(async (url: string) => url.endsWith("start") ? new Response(JSON.stringify({ value: [message("new"), message("known"), { id: "gone", "@removed": { reason: "deleted" } }], "@odata.nextLink": "https://graph.example/end" })) : new Response(JSON.stringify({ value: [message("later")], "@odata.deltaLink": "https://graph.example/final" }))); const result = await new GraphDeltaClient(config, token, { fetcher, store, knownMessageIds: new Set(["known"]) }).fetchDelta("a@example.com"); expect(result.changes.map((x) => x.kind)).toEqual(["new", "changed", "removed", "new"]); expect(result.pagesFetched).toBe(2); });
  it("差分0件と同じnextLinkのループを処理する", async () => { const store = new MemoryDeltaLinkStore(); await store.set("a@example.com", "https://graph.example/empty"); const empty = new GraphDeltaClient(config, token, { store, fetcher: async () => new Response(JSON.stringify({ value: [], "@odata.deltaLink": "https://graph.example/final" })) }); await expect(empty.fetchDelta("a@example.com")).resolves.toMatchObject({ changes: [], newMessages: [] }); const loop = new GraphDeltaClient(config, token, { fetcher: async () => new Response(JSON.stringify({ value: [], "@odata.nextLink": "https://graph.example/loop" })) }); await expect(loop.fetchDelta("a@example.com")).rejects.toMatchObject({ category: "validation" }); });
  it("最終deltaLinkがない場合は失敗する", async () => { const client = new GraphDeltaClient(config, token, { fetcher: async () => new Response(JSON.stringify({ value: [message("x")] })) }); await expect(client.fetchDelta("a@example.com")).rejects.toMatchObject({ category: "validation" }); });
});
