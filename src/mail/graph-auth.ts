import { z } from "zod";
import type { GraphConfig } from "./graph-config.ts";

const tokenResponseSchema = z.object({ access_token: z.string().min(1), token_type: z.string().min(1), expires_in: z.number().int().positive() }).passthrough();
export type TokenResponse = z.infer<typeof tokenResponseSchema>;
export type GraphFetch = (input: string, init?: RequestInit) => Promise<Response>;
export type GraphAuthErrorCategory = "configuration" | "authentication" | "temporary" | "unknown";

export class GraphAuthError extends Error {
  readonly category: GraphAuthErrorCategory;
  readonly status: number | undefined;
  readonly retryable: boolean;
  constructor(message: string, category: GraphAuthErrorCategory, options: { status?: number; retryable?: boolean } = {}) {
    super(message); this.name = "GraphAuthError"; this.category = category; this.status = options.status; this.retryable = options.retryable ?? category === "temporary";
  }
}

function safeMessage(status: number): string {
  if (status === 429) return "Graph認証がレート制限されました";
  if (status >= 500) return "Graph認証サービスが一時的に利用できません";
  return `Graph認証に失敗しました（HTTP ${status}）`;
}

export class GraphTokenProvider {
  private cached: { token: string; expiresAt: number } | undefined;
  private pending: Promise<string> | undefined;
  private readonly config: GraphConfig;
  private readonly fetcher: GraphFetch;
  private readonly clock: () => number;
  constructor(config: GraphConfig, fetcher: GraphFetch = fetch, clock: () => number = Date.now) { this.config = config; this.fetcher = fetcher; this.clock = clock; }

  async getAccessToken(): Promise<string> {
    if (this.cached && this.cached.expiresAt - this.clock() > 60_000) return this.cached.token;
    this.pending ??= this.fetchToken().finally(() => { this.pending = undefined; });
    return this.pending;
  }

  private async fetchToken(): Promise<string> {
    const endpoint = `https://login.microsoftonline.com/${encodeURIComponent(this.config.tenantId)}/oauth2/v2.0/token`;
    const body = new URLSearchParams({ grant_type: "client_credentials", client_id: this.config.clientId, client_secret: this.config.clientSecret, scope: "https://graph.microsoft.com/.default" });
    let response: Response;
    try { response = await this.fetcher(endpoint, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body }); }
    catch { throw new GraphAuthError("Graph認証への接続に失敗しました", "temporary", { retryable: true }); }
    if (!response.ok) throw new GraphAuthError(safeMessage(response.status), response.status === 429 || response.status >= 500 ? "temporary" : "authentication", { status: response.status, retryable: response.status === 429 || response.status >= 500 });
    let json: unknown;
    try { json = await response.json(); } catch { throw new GraphAuthError("Graph認証レスポンスが不正です", "unknown"); }
    const parsed = tokenResponseSchema.safeParse(json);
    if (!parsed.success) throw new GraphAuthError("Graph認証レスポンスの形式が不正です", "unknown");
    this.cached = { token: parsed.data.access_token, expiresAt: this.clock() + parsed.data.expires_in * 1000 };
    return parsed.data.access_token;
  }
}
