import { describe, expect, it, vi } from "vitest";
import { PrismaDeltaLinkStore } from "../src/db/delta-link-store.ts";

describe("PrismaDeltaLinkStore", () => {
  it("mailboxIdで取得し、upsertで新規作成・更新する", async () => {
    const prisma = { mailSyncState: { findUnique: vi.fn(async () => ({ deltaLink: "old" })), upsert: vi.fn(async () => ({})) } };
    const store = new PrismaDeltaLinkStore(prisma as never);
    await expect(store.get("mailbox")).resolves.toBe("old");
    await store.set("mailbox", "new");
    expect(prisma.mailSyncState.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { mailboxId: "mailbox" }, create: expect.objectContaining({ mailboxId: "mailbox", deltaLink: "new" }), update: expect.objectContaining({ deltaLink: "new" }) }));
  });
  it("Delta途中失敗時はStoreのsetを呼ばない", async () => {
    const store = { get: vi.fn(async () => "old"), set: vi.fn() };
    const { GraphDeltaClient } = await import("../src/mail/graph-delta.ts");
    const client = new GraphDeltaClient({ tenantId: "t", clientId: "c", clientSecret: "s", mailboxes: ["a@example.com"] }, { getAccessToken: async () => "token" }, { store, fetcher: async () => new Response(JSON.stringify({ value: [], "@odata.nextLink": "https://graph.example/fail" })) });
    await expect(client.fetchDelta("a@example.com")).rejects.toThrow();
    expect(store.set).not.toHaveBeenCalled();
  });
});
