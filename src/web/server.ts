import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

const defaultPort = 3000;

interface ProjectListItem {
  readonly id: string;
  readonly name: string;
  readonly summary: string;
  readonly location: string;
  readonly rate: string;
  readonly startDate: string;
  readonly requiredSkills: readonly string[];
}

type ProjectsViewState = "ready" | "empty" | "loading" | "error";

const mockProjects: readonly ProjectListItem[] = [
  {
    id: "p-001",
    name: "基幹システム刷新支援",
    summary: "既存業務システムの画面改修とAPI連携を段階的に進める案件です。",
    location: "東京 / リモート併用",
    rate: "70万円前後",
    startDate: "2026-11",
    requiredSkills: ["TypeScript", "Node.js", "PostgreSQL"]
  },
  {
    id: "p-002",
    name: "社内データ活用基盤構築",
    summary: "複数部門のデータを整理し、検索・集計しやすい形へ整える案件です。",
    location: "品川",
    rate: "75万円前後",
    startDate: "2026-12",
    requiredSkills: ["SQL", "Prisma", "バッチ処理"]
  },
  {
    id: "p-003",
    name: "顧客管理Webアプリ改善",
    summary: "認証後の業務画面と一覧表示を中心に改善するフロント寄りの案件です。",
    location: "フルリモート",
    rate: "65万円前後",
    startDate: "即日",
    requiredSkills: ["HTML", "CSS", "アクセシビリティ"]
  }
];

function getPort(argv: readonly string[]): number {
  const portIndex = argv.indexOf("--port");
  const portValue = portIndex >= 0 ? argv[portIndex + 1] : process.env.PORT;
  const parsed = Number(portValue);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : defaultPort;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function pageShell(title: string, body: string): string {
  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} | SES案件・人材マッチング</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f7f8fa;
      --panel: #ffffff;
      --text: #172033;
      --muted: #5f6b7a;
      --line: #dce2ea;
      --primary: #0f766e;
      --primary-dark: #115e59;
      --accent: #334155;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      min-height: 100vh;
      background: var(--bg);
      color: var(--text);
      font-family: "Segoe UI", system-ui, sans-serif;
      line-height: 1.5;
    }

    a {
      color: inherit;
    }

    .app-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 24px;
      padding: 16px 32px;
      border-bottom: 1px solid var(--line);
      background: var(--panel);
    }

    .brand {
      margin: 0;
      font-size: 18px;
      font-weight: 700;
    }

    .nav {
      display: flex;
      gap: 16px;
      color: var(--muted);
      font-size: 14px;
    }

    .main {
      width: min(1120px, calc(100% - 32px));
      margin: 32px auto;
    }

    .panel {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 24px;
      box-shadow: 0 8px 24px rgb(23 32 51 / 8%);
    }

    .stack {
      display: grid;
      gap: 16px;
    }

    .page-title {
      margin: 0 0 8px;
      font-size: 28px;
      line-height: 1.25;
    }

    .lead {
      margin: 0;
      color: var(--muted);
    }

    .button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 44px;
      border: 0;
      border-radius: 6px;
      padding: 0 16px;
      background: var(--primary);
      color: #ffffff;
      font: inherit;
      font-weight: 700;
      text-decoration: none;
    }

    .button:hover {
      background: var(--primary-dark);
    }

    .notice {
      border-left: 4px solid var(--primary);
      padding: 12px 14px;
      background: #eef8f6;
      color: #164e47;
      font-size: 14px;
    }

    .state-links {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 12px;
    }

    .state-links a {
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 6px 10px;
      background: #ffffff;
      color: var(--accent);
      font-size: 13px;
      text-decoration: none;
    }

    .state-box {
      display: grid;
      place-items: center;
      min-height: 220px;
      border: 1px dashed var(--line);
      border-radius: 8px;
      background: #fbfcfe;
      color: var(--muted);
      text-align: center;
    }

    .state-box strong {
      display: block;
      margin-bottom: 6px;
      color: var(--text);
      font-size: 18px;
    }

    .toolbar {
      display: flex;
      align-items: end;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 20px;
    }

    .project-grid {
      display: grid;
      gap: 12px;
    }

    .project-card {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 16px;
      padding: 18px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #ffffff;
    }

    .project-card h2 {
      margin: 0 0 8px;
      font-size: 18px;
    }

    .project-card p {
      margin: 0 0 12px;
      color: var(--muted);
    }

    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin: 0;
      padding: 0;
      list-style: none;
      color: var(--accent);
      font-size: 13px;
    }

    .meta li {
      border: 1px solid var(--line);
      border-radius: 999px;
      padding: 4px 9px;
      background: #f8fafc;
    }

    .skills {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      justify-content: end;
      min-width: 220px;
    }

    .skill {
      height: fit-content;
      border-radius: 999px;
      padding: 4px 9px;
      background: #e2e8f0;
      color: #243142;
      font-size: 13px;
      font-weight: 600;
    }

    @media (max-width: 720px) {
      .app-header,
      .toolbar,
      .project-card {
        grid-template-columns: 1fr;
        flex-direction: column;
        align-items: stretch;
      }

      .app-header {
        padding: 14px 16px;
      }

      .main {
        margin: 20px auto;
      }

      .skills {
        justify-content: start;
        min-width: 0;
      }
    }
  </style>
</head>
<body>
  <header class="app-header">
    <p class="brand">SES案件・人材マッチング</p>
    <nav class="nav" aria-label="主要画面">
      <a href="/projects">案件一覧</a>
    </nav>
  </header>
  <main class="main">${body}</main>
</body>
</html>`;
}

function normalizeProjectsState(value: string | null): ProjectsViewState {
  if (value === "empty" || value === "loading" || value === "error") {
    return value;
  }

  return "ready";
}

function renderProjectsContent(state: ProjectsViewState): string {
  if (state === "loading") {
    return `
      <div class="state-box" role="status" aria-live="polite">
        <div>
          <strong>読み込み中です</strong>
          <span>案件一覧を取得している想定の表示です。</span>
        </div>
      </div>
    `;
  }

  if (state === "error") {
    return `
      <div class="state-box" role="alert">
        <div>
          <strong>案件一覧を表示できません</strong>
          <span>取得失敗時の表示です。今回は実APIには接続していません。</span>
        </div>
      </div>
    `;
  }

  if (state === "empty") {
    return `
      <div class="state-box">
        <div>
          <strong>表示できる案件がありません</strong>
          <span>条件に合う案件が0件の場合の表示です。</span>
        </div>
      </div>
    `;
  }

  const projectCards = mockProjects.map((project) => `
    <article class="project-card">
      <div>
        <h2>${escapeHtml(project.name)}</h2>
        <p>${escapeHtml(project.summary)}</p>
        <ul class="meta">
          <li>${escapeHtml(project.location)}</li>
          <li>${escapeHtml(project.rate)}</li>
          <li>${escapeHtml(project.startDate)}</li>
        </ul>
      </div>
      <div class="skills" aria-label="${escapeHtml(project.name)}の必須スキル">
        ${project.requiredSkills.map((skill) => `<span class="skill">${escapeHtml(skill)}</span>`).join("")}
      </div>
    </article>
  `).join("");

  return `<div class="project-grid">${projectCards}</div>`;
}

function renderProjectsPage(state: ProjectsViewState): string {
  return pageShell("案件一覧", `
    <section class="panel">
      <div class="toolbar">
        <div>
          <h1 class="page-title">案件一覧</h1>
          <p class="lead">T05-01 用の架空案件を一覧表示しています。</p>
          <div class="state-links" aria-label="表示状態の確認">
            <a href="/projects">通常</a>
            <a href="/projects?state=empty">0件</a>
            <a href="/projects?state=loading">読み込み中</a>
            <a href="/projects?state=error">エラー</a>
          </div>
        </div>
      </div>
      <p class="notice">認証、実DB接続、案件取得API、マッチング画面への移動は今回の対象外です。</p>
      ${renderProjectsContent(state)}
    </section>
  `);
}

function sendHtml(response: ServerResponse, statusCode: number, html: string): void {
  response.writeHead(statusCode, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(html);
}

function handleRequest(request: IncomingMessage, response: ServerResponse): void {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

  if (request.method !== "GET") {
    response.writeHead(405, { allow: "GET" });
    response.end("Method Not Allowed");
    return;
  }

  if (url.pathname === "/") {
    response.writeHead(302, { location: "/projects" });
    response.end();
    return;
  }

  if (url.pathname === "/projects") {
    sendHtml(response, 200, renderProjectsPage(normalizeProjectsState(url.searchParams.get("state"))));
    return;
  }

  sendHtml(response, 404, pageShell("Not Found", `
    <section class="panel">
      <h1 class="page-title">ページが見つかりません</h1>
      <p class="lead">指定されたURLに対応する画面はまだありません。</p>
    </section>
  `));
}

const server = createServer(handleRequest);
const port = getPort(process.argv);

server.listen(port, () => {
  console.log(`Web server listening on http://localhost:${port}`);
});
