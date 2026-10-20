import { describe, expect, it, vi } from "vitest";
import { loadNewGraphEmails, runGraphMailBatch } from "../src/batch/graph-mail-batch.ts";
import type { DeltaResult } from "../src/mail/graph-delta.ts";
import type { CommonEmail } from "../src/mail/types.ts";

const email = (id: string, mailboxId = "box@example.com"): CommonEmail => ({ mailboxId, messageId: id, subject: id, sender: "sender@example.com", receivedAt: new Date("2026-01-01T00:00:00Z"), body: id });
const result = (changes: DeltaResult["changes"], newMessages: DeltaResult["newMessages"]): DeltaResult => ({ mailboxId: "box@example.com", changes, newMessages, deltaLink: "https://graph.example/delta", pagesFetched: 1 });
describe("Graph Delta to T04 batch adapter", () => {
  it("newだけをCommonEmailとして渡しchanged/removedを除外する", async () => {
    const fresh = email("new"); const changed = email("changed");
    const loaded = await loadNewGraphEmails(async () => result([{ kind: "new", message: { kind: "message", email: fresh, contentType: "text" } }, { kind: "changed", message: { kind: "message", email: changed, contentType: "text" } }, { kind: "removed", message: { kind: "removed", messageId: "old", reason: "deleted" } }], [{ kind: "message", email: fresh, contentType: "text" }]));
    expect(loaded).toEqual([fresh]);
  });
  it("0件でも正常にT04へ渡せる", async () => { await expect(loadNewGraphEmails(async () => result([], []))).resolves.toEqual([]); });
  it("複数newのmailboxIdを保持してrunMailBatchへ渡す", async () => {
    const source = [email("one", "box-a@example.com"), email("two", "box-a@example.com")]; const client = { fetchDelta: vi.fn(async () => result(source.map((item) => ({ kind: "new" as const, message: { kind: "message" as const, email: item, contentType: "text" as const } })), source.map((item) => ({ kind: "message" as const, email: item, contentType: "text" as const })) )) };
    const batch = await runGraphMailBatch(client as never, "box-a@example.com", 3, { retry: { retryDelaysMs: [0, 0] } });
    expect(batch.items.map((item) => item.mailboxId)).toEqual(["box-a@example.com", "box-a@example.com"]); expect(client.fetchDelta).toHaveBeenCalledWith("box-a@example.com", 3);
  });
});
