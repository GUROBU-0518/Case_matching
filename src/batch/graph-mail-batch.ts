import type { CommonEmail } from "../mail/types.ts";
import type { GraphDeltaClient, DeltaResult } from "../mail/graph-delta.ts";
import { runMailBatch, type MailBatchResult, type MailPreprocessor, type RetryOptions } from "./mail-batch.ts";
import type { PrismaClient } from "@prisma/client";
import { persistMailBatch, type PersistBatchSummary } from "../db/mail-repository.ts";

export type DeltaSource = () => Promise<DeltaResult>;

/** DeltaのnewだけをT04へ渡すメールソース。changed/removedは意図的に除外する。 */
export async function loadNewGraphEmails(source: DeltaSource): Promise<CommonEmail[]> {
  const result = await source();
  return result.newMessages.filter((message) => message.kind === "message").map((message) => message.email);
}

export interface GraphMailBatchOptions { preprocess?: MailPreprocessor; concurrency?: number; retry?: RetryOptions; }

/** 1メールボックス単位でDelta取得結果を既存T04バッチへ接続する。 */
export async function runGraphMailBatch(client: GraphDeltaClient, mailboxId: string, top = 3, options: GraphMailBatchOptions = {}): Promise<MailBatchResult> {
  return runMailBatch(() => loadNewGraphEmails(() => client.fetchDelta(mailboxId, top)), options.preprocess, options.concurrency ?? 3, options.retry);
}

export interface GraphMailBatchPersistenceResult {
  batch: MailBatchResult;
  persistence: PersistBatchSummary | undefined;
  deltaLinkSaved: boolean;
  safeHandoff: boolean;
}

/** Graph取得、T04処理、DB引き渡し、deltaLink確定を順序保証付きで実行する。 */
export async function runGraphMailBatchWithPersistence(client: GraphDeltaClient, prisma: PrismaClient, mailboxId: string, top = 3, options: GraphMailBatchOptions = {}): Promise<GraphMailBatchPersistenceResult> {
  const delta = await client.fetchDelta(mailboxId, top);
  const emails = delta.newMessages.filter((message) => message.kind === "message").map((message) => message.email);
  const batch = await runMailBatch(async () => emails, options.preprocess, options.concurrency ?? 3, options.retry);
  let persistence: PersistBatchSummary;
  try { persistence = await persistMailBatch(prisma, emails, batch); } catch { return { batch, persistence: undefined, deltaLinkSaved: false, safeHandoff: false }; }
  const safeHandoff = persistence.dbSaveFailureCount === 0 && persistence.persistedProcessingCount === emails.length;
  if (!safeHandoff) return { batch, persistence, deltaLinkSaved: false, safeHandoff };
  try { await client.commitDeltaLink(mailboxId, delta.deltaLink); return { batch, persistence, deltaLinkSaved: true, safeHandoff }; }
  catch { return { batch, persistence, deltaLinkSaved: false, safeHandoff }; }
}
