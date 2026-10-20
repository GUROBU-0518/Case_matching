import { parseGraphMailMessage, parseGraphResponse, type GraphMessageResult } from "./graph-adapter.ts";
import type { GraphConfig } from "./graph-config.ts";
import type { GraphTokenProvider } from "./graph-auth.ts";

export type GraphClientFetch = (input: string, init?: RequestInit) => Promise<Response>;
export type GraphClientErrorCategory = "authentication" | "temporary" | "permanent" | "timeout" | "validation" | "unknown";

export class GraphClientError extends Error {
  readonly category: GraphClientErrorCategory;
  readonly status: number | undefined;
  readonly retryable: boolean;
  readonly retryAfterSeconds: number | undefined;
  constructor(message: string, category: GraphClientErrorCategory, options: { status?: number; retryable?: boolean; retryAfterSeconds?: number } = {}) {
    super(message); this.name = "GraphClientError"; this.category = category; this.status = options.status;
    this.retryable = options.retryable ?? (category === "temporary" || category === "timeout");
    this.retryAfterSeconds = options.retryAfterSeconds;
  }
}

export interface GraphFetchResult {
  mailboxId: string;
  messages: GraphMessageResult[];
  nextLinkPresent: boolean;
  pagesFetched: number;
}

export interface GraphClientOptions {
  fetcher?: GraphClientFetch;
  timeoutMs?: number;
  maxPages?: number;
}

export class GraphMailClient {
  private readonly fetcher: GraphClientFetch;
  private readonly timeoutMs: number;
  private readonly config: GraphConfig;
  private readonly tokenProvider: Pick<GraphTokenProvider, "getAccessToken">;
  private readonly maxPages: number;
  constructor(config: GraphConfig, tokenProvider: Pick<GraphTokenProvider, "getAccessToken">, options: GraphClientOptions = {}) {
    this.config = config;
    this.tokenProvider = tokenProvider;
    this.fetcher = options.fetcher ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.maxPages = options.maxPages ?? 100;
  }

  async fetchMailbox(mailboxId: string, top = 3): Promise<GraphFetchResult> {
    if (!this.config.mailboxes.includes(mailboxId)) throw new GraphClientError("許可されたメールボックスではありません", "validation");
    if (!Number.isInteger(top) || top < 1) throw new GraphClientError("取得件数は1以上の整数で指定してください", "validation");
    if (!Number.isInteger(this.maxPages) || this.maxPages < 1) throw new GraphClientError("最大ページ数は1以上の整数で指定してください", "validation");
    const token = await this.tokenProvider.getAccessToken();
    const url = new URL(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailboxId)}/mailFolders/inbox/messages`);
    url.searchParams.set("$top", String(top));
    url.searchParams.set("$select", "id,subject,from,receivedDateTime,body,lastModifiedDateTime");
    url.searchParams.set("$orderby", "receivedDateTime desc");
    const messages: GraphMessageResult[] = [];
    const visited = new Set<string>();
    let pageUrl: string | undefined = url.toString();
    let pagesFetched = 0;
    while (pageUrl) {
      if (visited.has(pageUrl)) throw new GraphClientError("Graphページングで同じURLが繰り返されました", "validation");
      if (pagesFetched >= this.maxPages) throw new GraphClientError("Graphページングの上限に達しました", "validation");
      visited.add(pageUrl);
      const page = await this.fetchPage(pageUrl, token, mailboxId, pagesFetched + 1);
      messages.push(...page.messages);
      pagesFetched += 1;
      pageUrl = page.nextLink;
    }
    return { mailboxId, messages, nextLinkPresent: false, pagesFetched };
  }

  async fetchMessage(mailboxId: string, graphMessageId: string): Promise<GraphMessageResult> {
    if (!this.config.mailboxes.includes(mailboxId)) throw new GraphClientError("許可されたメールボックスではありません", "validation");
    if (!graphMessageId) throw new GraphClientError("GraphメッセージIDが必要です", "validation");
    const token = await this.tokenProvider.getAccessToken();
    const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailboxId)}/messages/${encodeURIComponent(graphMessageId)}?$select=id,subject,from,receivedDateTime,body,lastModifiedDateTime`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try { response = await this.fetcher(url, { method: "GET", headers: { Authorization: `Bearer ${token}`, Accept: "application/json", Prefer: 'outlook.body-content-type="text"' }, signal: controller.signal }); }
    catch (error) { if (error instanceof DOMException && error.name === "AbortError") throw new GraphClientError("Graphメール取得がタイムアウトしました", "timeout"); throw new GraphClientError("Graphメール取得への接続に失敗しました", "temporary"); }
    finally { clearTimeout(timer); }
    const retryAfter = Number(response.headers.get("retry-after"));
    if (!response.ok) {
      const temporary = response.status === 429 || response.status >= 500;
      const category = temporary ? "temporary" : response.status === 401 || response.status === 403 ? "authentication" : response.status === 404 ? "permanent" : "unknown";
      const options: { status: number; retryAfterSeconds?: number } = { status: response.status };
      if (Number.isFinite(retryAfter)) options.retryAfterSeconds = retryAfter;
      throw new GraphClientError(temporary ? "Graphメール取得サービスが一時的に利用できません" : response.status === 404 ? "Graphメールが見つかりません" : `Graphメール取得に失敗しました（HTTP ${response.status}）`, category, options);
    }
    let json: unknown;
    try { json = await response.json(); } catch { throw new GraphClientError("Graphメール応答のJSONが不正です", "validation"); }
    try {
      const parsed = parseGraphMailMessage(json, mailboxId);
      if (parsed.kind === "removed") throw new GraphClientError("Graphメールは削除済みです", "permanent");
      return parsed;
    } catch (error) {
      if (error instanceof GraphClientError) throw error;
      throw new GraphClientError("Graphメール応答の形式が不正です", "validation");
    }
  }

  private async fetchPage(pageUrl: string, token: string, mailboxId: string, pageNumber: number): Promise<{ messages: GraphMessageResult[]; nextLink?: string }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try { response = await this.fetcher(pageUrl, { method: "GET", headers: { Authorization: `Bearer ${token}`, Accept: "application/json", Prefer: 'outlook.body-content-type="text"' }, signal: controller.signal }); }
    catch (error) { if (error instanceof DOMException && error.name === "AbortError") throw new GraphClientError(`Graphメール取得がタイムアウトしました（ページ${pageNumber}）`, "timeout"); throw new GraphClientError(`Graphメール取得への接続に失敗しました（ページ${pageNumber}）`, "temporary"); }
    finally { clearTimeout(timer); }
    const retryAfter = Number(response.headers.get("retry-after"));
    if (!response.ok) {
      const temporary = response.status === 429 || response.status >= 500;
      const category = temporary ? "temporary" : response.status === 401 || response.status === 403 ? "authentication" : "unknown";
      const options: { status: number; retryAfterSeconds?: number } = { status: response.status };
      if (Number.isFinite(retryAfter)) options.retryAfterSeconds = retryAfter;
      throw new GraphClientError(temporary ? `Graphメール取得サービスが一時的に利用できません（ページ${pageNumber}）` : `Graphメール取得に失敗しました（ページ${pageNumber}、HTTP ${response.status}）`, category, options);
    }
    let json: unknown;
    try { json = await response.json(); } catch { throw new GraphClientError(`Graphメール応答のJSONが不正です（ページ${pageNumber}）`, "validation"); }
    try {
      const parsed = parseGraphResponse(json, mailboxId);
      return parsed.nextLink === undefined ? { messages: parsed.messages } : { messages: parsed.messages, nextLink: parsed.nextLink };
    }
    catch { throw new GraphClientError(`Graphメール応答の形式が不正です（ページ${pageNumber}）`, "validation"); }
  }
}
