import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { commonEmailSchema, type CommonEmail } from "./types.ts";
import { z } from "zod";

const metadataSchema = z.object({
  mailboxId: z.string().min(1),
  messageId: z.string().min(1),
  subject: z.string(),
  sender: z.string().min(1),
  receivedAt: z.string().min(1),
  bodyFile: z.string().min(1),
});

export async function loadLocalEmails(directory: string): Promise<CommonEmail[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const metadataFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name)
    .sort();

  const emails = await Promise.all(metadataFiles.map(async (metadataFile) => {
    const metadata = metadataSchema.parse(JSON.parse(await readFile(join(directory, metadataFile), "utf8")));
    const body = await readFile(join(directory, metadata.bodyFile), "utf8");
    return commonEmailSchema.parse({ ...metadata, body });
  }));

  return emails.sort((left, right) => left.messageId.localeCompare(right.messageId));
}
