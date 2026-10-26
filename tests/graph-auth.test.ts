import { describe, expect, it, vi } from "vitest";
import { parseGraphConfig } from "../src/mail/graph-config.ts";
import { GraphTokenProvider } from "../src/mail/graph-auth.ts";

const config = { tenantId: "tenant", clientId: "client", clientSecret: "secret", mailboxes: ["a@example.com", "b@example.com"] };
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("graph config", () => {
  it("環境変数を検証し空白・重複を除去する", () => {
    expect(parseGraphConfig({ GRAPH_TENANT_ID: " t ", GRAPH_CLIENT_ID: "c", GRAPH_CLIENT_SECRET: "s", GRAPH_MAILBOXES: "a@example.com, a@example.com, b@example.com " })).toEqual({ tenantId: "t", clientId: "c", clientSecret: "s", mailboxes: ["a@example.com", "b@example.com"] });
  });
  it("必須値とメールボックス0件を拒否する", () => {
    expect(() => parseGraphConfig({ GRAPH_TENANT_ID: "t", GRAPH_CLIENT_ID: "c", GRAPH_CLIENT_SECRET: "s", GRAPH_MAILBOXES: "" })).toThrow();
    expect(() => parseGraphConfig({ GRAPH_CLIENT_ID: "c", GRAPH_CLIENT_SECRET: "s", GRAPH_MAILBOXES: "a@example.com" })).toThrow();
  });
  it("不正なメールアドレスを拒否する", () => {
    expect(() => parseGraphConfig({ GRAPH_TENANT_ID: "t", GRAPH_CLIENT_ID: "c", GRAPH_CLIENT_SECRET: "s", GRAPH_MAILBOXES: "not-mail" })).toThrow();
  });
});

describe("graph auth", () => {
  it("正しいURLとform-urlencodedでトークンを取得する", async () => {
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => { expect(url).toBe("https://login.microsoftonline.com/tenant/oauth2/v2.0/token"); expect(init?.method).toBe("POST"); expect(init?.headers).toEqual({ "content-type": "application/x-www-form-urlencoded" }); expect(String(init?.body)).toContain("grant_type=client_credentials"); return response({ access_token: "token", token_type: "Bearer", expires_in: 3600 }); });
    await expect(new GraphTokenProvider(config, fetcher).getAccessToken()).resolves.toBe("token");
  });
  it("有効期限内はキャッシュし期限切れ間近は再取得する", async () => {
    let now = 0; let calls = 0; const fetcher = vi.fn(async () => { calls += 1; return response({ access_token: `token-${calls}`, token_type: "Bearer", expires_in: 3600 }); }); const provider = new GraphTokenProvider(config, fetcher, () => now);
    expect(await provider.getAccessToken()).toBe("token-1"); expect(await provider.getAccessToken()).toBe("token-1"); expect(fetcher).toHaveBeenCalledTimes(1); now = 3_540_001; expect(await provider.getAccessToken()).toBe("token-2"); expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("同時要求では1回だけ取得する", async () => {
    let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve; }); const fetcher = vi.fn(async () => { await gate; return response({ access_token: "token", token_type: "Bearer", expires_in: 3600 }); }); const provider = new GraphTokenProvider(config, fetcher); const a = provider.getAccessToken(); const b = provider.getAccessToken(); release(); await expect(Promise.all([a, b])).resolves.toEqual(["token", "token"]); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each([401, 403])("%sは認証エラーとして扱う", async (status) => { await expect(new GraphTokenProvider(config, async () => response({}, status)).getAccessToken()).rejects.toMatchObject({ category: "authentication", retryable: false }); });
  it.each([429, 500, 503])("%sは一時的エラーとして扱う", async (status) => { await expect(new GraphTokenProvider(config, async () => response({}, status)).getAccessToken()).rejects.toMatchObject({ category: "temporary", retryable: true }); });
  it("通信失敗と不正レスポンスを安全に扱う", async () => { const network = new GraphTokenProvider(config, async () => { throw new Error("secret token body"); }); await expect(network.getAccessToken()).rejects.toMatchObject({ category: "temporary" }); const invalid = new GraphTokenProvider(config, async () => response({ access_token: "" })); await expect(invalid.getAccessToken()).rejects.toMatchObject({ category: "unknown" }); try { await invalid.getAccessToken(); } catch (error) { expect((error as Error).message).not.toContain("secret"); }
  });
});
