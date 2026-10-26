import { parseGraphResponse, type GraphMessageResult } from "./graph-adapter.ts";
import type { GraphConfig } from "./graph-config.ts";
import type { GraphTokenProvider } from "./graph-auth.ts";
import { GraphClientError, type GraphClientFetch } from "./graph-client.ts";

export interface DeltaLinkStore { get(mailboxId: string): Promise<string | undefined> | string | undefined; set(mailboxId: string, deltaLink: string): Promise<void> | void; }
export class MemoryDeltaLinkStore implements DeltaLinkStore {
  private readonly links = new Map<string, string>();
  get(mailboxId: string): string | undefined { return this.links.get(mailboxId); }
  set(mailboxId: string, deltaLink: string): void { this.links.set(mailboxId, deltaLink); }
}
export type DeltaChangeKind = "new" | "changed" | "removed";
export type DeltaChange = { kind: DeltaChangeKind; message: GraphMessageResult; };
export interface DeltaResult { mailboxId: string; changes: DeltaChange[]; newMessages: Extract<GraphMessageResult, { kind: "message" }>[]; deltaLink: string; pagesFetched: number; }
export interface GraphDeltaOptions { fetcher?: GraphClientFetch; timeoutMs?: number; maxPages?: number; initialDays?: number; store?: DeltaLinkStore; knownMessageIds?: ReadonlySet<string>; }

export class GraphDeltaClient {
  private readonly fetcher: GraphClientFetch; private readonly timeoutMs: number; private readonly maxPages: number; private readonly initialDays: number; private readonly store: DeltaLinkStore;
  private readonly config: GraphConfig; private readonly tokenProvider: Pick<GraphTokenProvider, "getAccessToken">;
  constructor(config: GraphConfig, tokenProvider: Pick<GraphTokenProvider, "getAccessToken">, options: GraphDeltaOptions = {}) {
    this.config = config; this.tokenProvider = tokenProvider;
    this.fetcher = options.fetcher ?? fetch; this.timeoutMs = options.timeoutMs ?? 15_000; this.maxPages = options.maxPages ?? 100; this.initialDays = options.initialDays ?? 5; this.store = options.store ?? new MemoryDeltaLinkStore(); this.knownMessageIds = options.knownMessageIds;
  }
  async fetchDelta(mailboxId: string, top = 3): Promise<DeltaResult> {
    if (!this.config.mailboxes.includes(mailboxId)) throw new GraphClientError("許可されたメールボックスではありません", "validation");
    if (!Number.isInteger(top) || top < 1 || !Number.isInteger(this.maxPages) || this.maxPages < 1 || !Number.isInteger(this.initialDays) || this.initialDays < 1) throw new GraphClientError("Delta Queryの設定値が不正です", "validation");
    const saved = await this.store.get(mailboxId); const token = await this.tokenProvider.getAccessToken();
    let pageUrl: string | undefined = saved ?? this.initialUrl(mailboxId, top); const visited = new Set<string>(); const changes: DeltaChange[] = []; let finalDelta: string | undefined; let pagesFetched = 0;
    while (pageUrl) {
      if (visited.has(pageUrl)) throw new GraphClientError(`Delta取得で同じURLが繰り返されました（ページ${pagesFetched + 1}）`, "validation");
      if (pagesFetched >= this.maxPages) throw new GraphClientError("Delta取得のページ上限に達しました", "validation");
      visited.add(pageUrl); const page = await this.fetchPage(pageUrl, token, mailboxId, pagesFetched + 1); pagesFetched += 1;
      const known = this.knownMessageIds ?? new Set<string>();
      for (const message of page.messages) {
        if (message.kind === "removed") changes.push({ kind: "removed", message });
        else changes.push({ kind: known.has(message.email.messageId) ? "changed" : "new", message });
      }
      pageUrl = page.nextLink; if (!pageUrl) finalDelta = page.deltaLink;
    }
    if (!finalDelta) throw new GraphClientError("Deltaレスポンスに最終deltaLinkがありません", "validation");
    const newMessages = changes.filter((change): change is { kind: "new"; message: Extract<GraphMessageResult, { kind: "message" }> } => change.kind === "new").map((change) => change.message);
    return { mailboxId, changes, newMessages, deltaLink: finalDelta, pagesFetched };
  }
  async commitDeltaLink(mailboxId: string, deltaLink: string): Promise<void> {
    if (!this.config.mailboxes.includes(mailboxId)) throw new GraphClientError("許可されたメールボックスではありません", "validation");
    await this.store.set(mailboxId, deltaLink);
  }
  private readonly knownMessageIds: ReadonlySet<string> | undefined;
  private initialUrl(mailboxId: string, top: number): string {
    const url = new URL(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailboxId)}/mailFolders/inbox/messages/delta`);
    const since = new Date(Date.now() - this.initialDays * 86_400_000).toISOString();
    url.searchParams.set("$filter", `receivedDateTime ge ${since}`); url.searchParams.set("$top", String(top)); url.searchParams.set("$select", "id,subject,from,receivedDateTime,body,lastModifiedDateTime"); return url.toString();
  }
  private async fetchPage(url: string, token: string, mailboxId: string, page: number): Promise<{ messages: GraphMessageResult[]; nextLink?: string; deltaLink?: string }> {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), this.timeoutMs); let response: Response;
    try { response = await this.fetcher(url, { method: "GET", headers: { Authorization: `Bearer ${token}`, Accept: "application/json", Prefer: 'outlook.body-content-type="text"' }, signal: controller.signal }); }
    catch (error) { if (error instanceof DOMException && error.name === "AbortError") throw new GraphClientError(`Delta取得がタイムアウトしました（ページ${page}）`, "timeout"); throw new GraphClientError(`Delta取得への接続に失敗しました（ページ${page}）`, "temporary"); } finally { clearTimeout(timer); }
    if (!response.ok) throw new GraphClientError(`Delta取得に失敗しました（ページ${page}、HTTP ${response.status}）`, response.status === 429 || response.status >= 500 ? "temporary" : response.status === 401 || response.status === 403 ? "authentication" : "unknown", { status: response.status });
    let json: unknown; try { json = await response.json(); } catch { throw new GraphClientError(`Deltaレスポンスが不正です（ページ${page}）`, "validation"); }
    try {
      const parsed = parseGraphResponse(json, mailboxId);
      return { messages: parsed.messages, ...(parsed.nextLink === undefined ? {} : { nextLink: parsed.nextLink }), ...(parsed.deltaLink === undefined ? {} : { deltaLink: parsed.deltaLink }) };
    } catch { throw new GraphClientError(`Deltaレスポンスの形式が不正です（ページ${page}）`, "validation"); }
  }
}
