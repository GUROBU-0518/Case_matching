import type { CommonEmail } from "../mail/types.ts";
import { preprocessMailBody, type PreprocessedMailBody } from "../mail/preprocess.ts";

export type ErrorCategory = "temporary" | "permanent" | "unknown";
export type MailBatchStatus = "succeeded" | "partial_failed" | "failed";

export class MailProcessingError extends Error {
  readonly category: ErrorCategory;
  readonly code: string | undefined;
  readonly retryable: boolean;
  constructor(message: string, options: { category: ErrorCategory; code?: string; retryable?: boolean }) {
    super(message);
    this.name = "MailProcessingError";
    this.category = options.category;
    this.code = options.code;
    this.retryable = options.retryable ?? options.category === "temporary";
  }
}

export interface ClassifiedError {
  category: ErrorCategory;
  code: string | undefined;
  retryable: boolean;
  message: string;
}

export function classifyMailError(error: unknown): ClassifiedError {
  if (error instanceof MailProcessingError) return { category: error.category, code: error.code, retryable: error.retryable, message: error.message };
  return { category: "unknown", code: undefined, retryable: false, message: error instanceof Error ? error.message : "メール処理に失敗しました" };
}

export interface MailItemResult {
  mailboxId: string;
  messageId: string;
  success: boolean;
  status: "succeeded" | "failed";
  attempts: number;
  retryCount: number;
  errorCategory?: ErrorCategory;
  errorCode: string | undefined;
  retryable?: boolean;
  originalLength: number;
  processedLength: number;
  processedBody?: string;
  originalBody?: string;
  error?: string;
}

export interface MailBatchResult {
  startedAt: Date;
  endedAt: Date;
  durationMs: number;
  totalCount: number;
  successCount: number;
  failureCount: number;
  totalAttempts: number;
  totalRetryCount: number;
  retriedSuccessCount: number;
  retryExhaustedCount: number;
  status: MailBatchStatus;
  concurrency: number;
  items: MailItemResult[];
}

export type MailSource = () => Promise<CommonEmail[]>;
export type MailPreprocessor = (body: string) => PreprocessedMailBody | Promise<PreprocessedMailBody>;
export interface RetryOptions {
  maxAttempts?: number;
  retryDelaysMs?: number[];
  sleep?: (milliseconds: number) => Promise<void>;
}

const defaultSleep = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export async function processOneMail(email: CommonEmail, preprocess: MailPreprocessor = preprocessMailBody, retry: RetryOptions = {}): Promise<MailItemResult> {
  const maxAttempts = retry.maxAttempts ?? 3;
  const delays = retry.retryDelaysMs ?? [1000, 2000];
  const sleep = retry.sleep ?? defaultSleep;
  let attempts = 0;
  let lastError: ClassifiedError | undefined;
  while (attempts < maxAttempts) {
    attempts += 1;
    try {
      const result = await preprocess(email.body);
      return {
        mailboxId: email.mailboxId, messageId: email.messageId, success: true, status: "succeeded",
        attempts, retryCount: attempts - 1, originalLength: result.originalBody.length,
        processedLength: result.processedBody.length, processedBody: result.processedBody, errorCode: undefined,
      };
    } catch (error) {
      lastError = classifyMailError(error);
      if (!lastError.retryable || attempts >= maxAttempts) break;
      await sleep(delays[attempts - 1] ?? delays.at(-1) ?? 0);
    }
  }
  const classified = lastError ?? { category: "unknown" as const, code: undefined, retryable: false, message: "メール処理に失敗しました" };
  return {
    mailboxId: email.mailboxId, messageId: email.messageId, success: false, status: "failed",
    attempts, retryCount: attempts - 1, errorCategory: classified.category, errorCode: classified.code,
    retryable: classified.retryable, originalLength: email.body.length, processedLength: 0, originalBody: email.body,
    error: classified.message,
  };
}

export function createBatchResult(startedAt: Date, endedAt: Date, items: MailItemResult[], concurrency: number): MailBatchResult {
  const successCount = items.filter((item) => item.success).length;
  const failureCount = items.length - successCount;
  const totalRetryCount = items.reduce((sum, item) => sum + item.retryCount, 0);
  return {
    startedAt, endedAt, durationMs: endedAt.getTime() - startedAt.getTime(), totalCount: items.length,
    successCount, failureCount, totalAttempts: items.reduce((sum, item) => sum + item.attempts, 0),
    totalRetryCount, retriedSuccessCount: items.filter((item) => item.success && item.retryCount > 0).length,
    retryExhaustedCount: items.filter((item) => !item.success && item.retryCount > 0).length,
    status: failureCount === 0 ? "succeeded" : successCount === 0 ? "failed" : "partial_failed",
    concurrency, items,
  };
}

export async function runMailBatch(source: MailSource, preprocess: MailPreprocessor = preprocessMailBody, concurrency = 3, retry: RetryOptions = {}): Promise<MailBatchResult> {
  if (!Number.isInteger(concurrency) || concurrency < 1) throw new Error("concurrencyは1以上の整数で指定してください");
  if (!Number.isInteger(retry.maxAttempts ?? 3) || (retry.maxAttempts ?? 3) < 1) throw new Error("maxAttemptsは1以上の整数で指定してください");
  const startedAt = new Date();
  const emails = await source();
  const items = new Array<MailItemResult>(emails.length);
  let nextIndex = 0;
  const worker = async (): Promise<void> => {
    while (true) {
      const index = nextIndex++;
      const email = emails[index];
      if (!email) return;
      items[index] = await processOneMail(email, preprocess, retry);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, emails.length) }, () => worker()));
  return createBatchResult(startedAt, new Date(), items, concurrency);
}
