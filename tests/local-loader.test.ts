import { describe, expect, it } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadLocalEmails } from "../src/mail/local-loader.ts";

describe("loadLocalEmails", () => {
  it("複数メールを本文を変更せず読み込む", async () => {
    const directory = await mkdtemp(join(tmpdir(), "case-mail-"));
    const body = "  本文\n\n記号：●●  ";
    await writeFile(join(directory, "b.json"), JSON.stringify({
      mailboxId: "box", messageId: "b", subject: "B", sender: "b@example.invalid",
      receivedAt: "2026-01-02T00:00:00Z", bodyFile: "b.txt",
    }));
    await writeFile(join(directory, "b.txt"), body);
    await writeFile(join(directory, "a.json"), JSON.stringify({
      mailboxId: "box", messageId: "a", subject: "A", sender: "a@example.invalid",
      receivedAt: "2026-01-01T00:00:00Z", bodyFile: "a.txt",
    }));
    await writeFile(join(directory, "a.txt"), "A\n本文");

    const emails = await loadLocalEmails(directory);
    expect(emails).toHaveLength(2);
    expect(emails.map((email) => email.messageId)).toEqual(["a", "b"]);
    expect(emails[1]?.body).toBe(body);
  });

  it("不正なメタデータを検出する", async () => {
    const directory = await mkdtemp(join(tmpdir(), "case-mail-invalid-"));
    await writeFile(join(directory, "invalid.json"), JSON.stringify({ messageId: "only-id" }));
    await expect(loadLocalEmails(directory)).rejects.toThrow();
  });
});



