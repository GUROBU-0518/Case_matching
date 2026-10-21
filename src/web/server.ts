import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { getPrismaClient } from "../db/client.ts";
import type { Project, Talent } from "../domain/schemas.ts";
import { projectSchema, talentSchema } from "../domain/schemas.ts";
import { getTalentRegistrationSince, parseTalentRegistrationPeriod } from "../domain/talent-filter.ts";
import { matchesTalentSearch } from "../domain/talent-search.ts";
import { matchesProjectSearch } from "../domain/project-search.ts";
import { mockTalents as mockTalentRecords } from "../mock/talents.ts";

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

type ApiProject = Project & { readonly id: string };
type ApiTalent = Talent & { readonly id: string };

type MockTalent = Pick<Talent, "nameOrInitial" | "technicalSkills" | "desiredRate" | "nearestStation" | "desiredWorkStyle" | "affiliation"> & {
  readonly id: string;
};

const mockTalentPageSize = 10;

const mockTalentSeeds: readonly Omit<MockTalent, "id">[] = [
  {
    nameOrInitial: "山田 A.",
    technicalSkills: ["TypeScript", "Node.js", "SQL"],
    desiredRate: "月額70万円",
    nearestStation: "新宿駅",
    desiredWorkStyle: "リモート併用",
    affiliation: "BP"
  },
  {
    nameOrInitial: "佐藤 B.",
    technicalSkills: ["Java", "Spring Boot", "PostgreSQL"],
    desiredRate: "月額68万円",
    nearestStation: "横浜駅",
    desiredWorkStyle: "フルリモート",
    affiliation: "BP"
  },
  {
    nameOrInitial: "鈴木 C.",
    technicalSkills: ["Python", "Django", "AWS"],
    desiredRate: "月額65万円",
    nearestStation: "大宮駅",
    desiredWorkStyle: "出社・リモート併用",
    affiliation: "BP"
  }
];

const mockTalents: readonly MockTalent[] = Array.from({ length: 41 }, (_, index) => {
  const seed = mockTalentSeeds[index % mockTalentSeeds.length]!;
  return {
    ...seed,
    id: `talent-${String(index + 1).padStart(3, "0")}`,
    nameOrInitial: index < mockTalentSeeds.length
      ? seed.nameOrInitial
      : `架空人材 ${String(index + 1).padStart(2, "0")}`
  };
});

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

function encodeTalentCursor(projectId: string, offset: number): string {
  return Buffer.from(JSON.stringify({ projectId, offset }), "utf8").toString("base64url");
}

function decodeTalentCursor(cursor: string, projectId: string): number | null {
  try {
    const decoded = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as { projectId?: unknown; offset?: unknown };
    return decoded.projectId === projectId && Number.isInteger(decoded.offset) && (decoded.offset as number) >= 0
      ? decoded.offset as number
      : null;
  } catch {
    return null;
  }
}

function mockTalentResponse(talent: MockTalent): ApiTalent {
  return {
    id: talent.id,
    nameOrInitial: talent.nameOrInitial,
    technicalSkills: talent.technicalSkills,
    desiredRate: talent.desiredRate,
    nearestStation: talent.nearestStation,
    desiredWorkStyle: talent.desiredWorkStyle,
    availableFrom: null,
    availableProcess: [],
    affiliation: talent.affiliation,
    sourceText: null
  };
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

    .project-list-panel {
      min-height: 0;
    }

    .project-list-panel .project-grid {
      max-height: none;
    }

    .project-card {
      display: grid;
      grid-template-columns: minmax(0, 1.4fr) minmax(280px, 1fr) auto;
      gap: 12px;
      min-height: 58px;
      padding: 7px 10px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #ffffff;
    }

    .project-card h2 {
      margin: 0 0 3px;
      overflow: hidden;
      font-size: 15px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .project-card p {
      margin: 0;
      color: var(--muted);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .project-card .project-actions {
      display: flex;
      align-items: center;
      justify-content: end;
      margin-top: 0;
    }

    .project-card .skills {
      margin-top: 0;
      overflow: hidden;
      white-space: nowrap;
    }

    .project-card .meta {
      display: flex;
      gap: 8px;
      margin: 0 0 3px;
      overflow: hidden;
      white-space: nowrap;
    }

    .project-card .meta li {
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .project-pagination {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      margin-top: 10px;
    }

    .talent-list-page-panel .talent-grid {
      display: grid;
      gap: 6px;
    }

    .talent-list-page-panel .talent-card {
      display: grid;
      grid-template-columns: minmax(0, 1.35fr) minmax(220px, 1fr) auto;
      align-items: center;
      gap: 12px;
      min-width: 0;
      min-height: 58px;
      padding: 7px 10px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #ffffff;
    }

    .talent-list-page-panel .talent-card h2,
    .talent-list-page-panel .talent-card p {
      min-width: 0;
      margin: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .talent-list-page-panel .talent-card h2 {
      margin-bottom: 3px;
      font-size: 15px;
      line-height: 1.2;
    }

    .talent-list-page-panel .talent-card p {
      color: var(--muted);
      font-size: 12px;
      line-height: 1.2;
    }

    .talent-list-page-panel .talent-card-meta {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 3px 12px;
      min-width: 0;
    }

    .talent-list-page-panel .talent-card-actions {
      display: flex;
      justify-content: end;
    }

    .talent-list-page-panel .talent-pagination {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      margin-top: 10px;
    }

    .talent-filter-controls {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .talent-filter-controls label {
      color: var(--muted);
      font-size: 13px;
      font-weight: 700;
    }

    .talent-filter-controls select {
      min-height: 38px;
      padding: 0 10px;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: #ffffff;
      color: var(--text);
      font: inherit;
    }

    .talent-search-form {
      display: flex;
      align-items: end;
      gap: 8px;
      margin: 0 0 16px;
    }

    .talent-search-form label {
      display: grid;
      flex: 1;
      gap: 4px;
      color: var(--muted);
      font-size: 13px;
      font-weight: 700;
    }

    .talent-search-form input {
      min-height: 38px;
      padding: 0 10px;
      border: 1px solid var(--line);
      border-radius: 6px;
      color: var(--text);
      font: inherit;
    }

    .button,
    .back-link {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 38px;
      padding: 0 14px;
      border: 1px solid var(--accent);
      border-radius: 6px;
      background: var(--accent);
      color: #ffffff;
      font-weight: 700;
      text-decoration: none;
    }

    .button:hover,
    .back-link:hover {
      background: #1d4ed8;
    }

    .detail-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
      margin: 24px 0;
    }

    .detail-item {
      padding: 14px;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: #f8fafc;
    }

    .detail-item dt {
      margin-bottom: 5px;
      color: var(--muted);
      font-size: 13px;
    }

    .detail-item dd {
      margin: 0;
      font-weight: 700;
    }

    .detail-section {
      margin-top: 24px;
    }

    .detail-section h2 {
      margin-bottom: 10px;
      font-size: 18px;
    }

    .detail-section p {
      margin: 0;
      color: var(--muted);
    }

    .source-text {
      margin: 0;
      padding: 14px;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: #f8fafc;
      overflow-wrap: anywhere;
      white-space: pre-wrap;
    }

    .source-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    .source-header h2 {
      margin: 0;
    }

    .source-toggle {
      flex-shrink: 0;
    }

    .matching-layout {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      gap: 16px;
      margin-top: 28px;
      min-height: 0;
      align-items: stretch;
    }

    .matching-panel {
      min-width: 0;
      min-height: 0;
      padding: 18px;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: #ffffff;
    }

    .talent-list-panel,
    .talent-detail-panel {
      display: flex;
      flex-direction: column;
      height: min(72vh, 760px);
      min-height: 0;
      overflow: hidden;
    }

    #talent-list-root,
    #talent-detail-root {
      display: flex;
      flex-direction: column;
      flex: 1 1 auto;
      min-width: 0;
      min-height: 0;
    }

    #talent-list-root {
      overflow: hidden;
    }

    .matching-panel h2 {
      margin: 0 0 8px;
      font-size: 18px;
    }

    .matching-panel p {
      margin: 0;
      color: var(--muted);
    }

    .matching-placeholder {
      display: grid;
      min-height: 132px;
      place-items: center;
      margin-top: 16px;
      padding: 16px;
      border: 1px dashed var(--line);
      border-radius: 6px;
      background: #f8fafc;
      color: var(--muted);
      text-align: center;
    }

    .talent-list {
      display: grid;
      flex: 1 1 auto;
      gap: 5px;
      margin-top: 10px;
      min-height: 0;
      max-height: none;
      overflow-y: auto;
      padding-right: 6px;
      overscroll-behavior: contain;
    }

    .pagination {
      display: flex;
      flex-shrink: 0;
      align-items: center;
      justify-content: center;
      gap: 12px;
      margin-top: 14px;
      padding-top: 2px;
    }

    .talent-count {
      margin: 16px 0 0;
      color: var(--muted);
      font-size: 13px;
    }

    .load-more {
      width: 100%;
      margin-top: 14px;
      cursor: pointer;
    }

    .talent-list-panel .talent-card {
      display: grid;
      grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
      align-items: start;
      gap: 4px 10px;
      min-width: 0;
      min-height: 54px;
      padding: 6px 9px;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: #f8fafc;
      color: inherit;
      font: inherit;
      text-align: left;
      width: 100%;
    }

    button.talent-card {
      cursor: pointer;
    }

    button.talent-card:hover,
    button.talent-card:focus-visible,
    button.talent-card[aria-pressed="true"] {
      border-color: var(--primary);
      box-shadow: 0 0 0 2px rgb(15 118 110 / 15%);
      outline: none;
    }

    .talent-detail {
      display: grid;
      gap: 10px;
      margin-top: 16px;
    }

    #talent-detail-root {
      overflow-y: auto;
      max-height: none;
      padding-right: 6px;
      overscroll-behavior: contain;
    }

    .talent-detail-item {
      padding: 12px;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: #f8fafc;
      overflow-wrap: anywhere;
    }

    .talent-list-panel .talent-card h3 {
      min-width: 0;
      margin: 0 0 3px;
      overflow: hidden;
      font-size: 15px;
      line-height: 1.2;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .talent-list-panel .talent-card-main,
    .talent-list-panel .talent-card-meta {
      min-width: 0;
      align-self: start;
    }

    .talent-list-panel .talent-card p {
      display: inline;
      margin: 0 8px 0 0;
      overflow-wrap: anywhere;
      color: var(--muted);
      font-size: 12px;
      line-height: 1.2;
      white-space: nowrap;
    }

    .talent-list-panel .talent-skills {
      display: block;
      margin-top: 0;
      min-width: 0;
      overflow: hidden;
      color: var(--muted);
      font-size: 12px;
      line-height: 1.2;
      text-overflow: ellipsis;
      white-space: nowrap;
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

      .talent-list-page-panel .talent-card {
        grid-template-columns: 1fr;
      }

      .talent-list-page-panel .talent-card-actions {
        justify-content: start;
      }

      .project-card .meta {
        flex-wrap: wrap;
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

      .detail-grid {
        grid-template-columns: 1fr;
      }

      .matching-layout {
        grid-template-columns: 1fr;
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

function renderProjectsPage(initialState: { query?: string | undefined; page?: number | undefined } = {}): string {
  const initialQuery = String(initialState.query ?? "").replace(/[ \u3000]+/gu, " ").trim();
  const initialPage = Number.isInteger(initialState.page) && (initialState.page ?? 1) > 0 ? initialState.page ?? 1 : 1;
  const scriptValue = (value: unknown): string => JSON.stringify(value).replaceAll("<", "\\u003c").replaceAll(">", "\\u003e").replaceAll("&", "\\u0026");
  return pageShell("案件一覧", `
    <section class="panel project-list-panel">
      <div class="toolbar">
        <div>
          <h1 class="page-title">案件一覧</h1>
          <p class="lead">案件取得APIから取得した案件を表示します。</p>
        </div>
        <a class="button" href="/talents">人材一覧へ</a>
      </div>
      <form id="project-search-form" class="talent-search-form">
        <label for="project-search-input">キーワード検索
          <input id="project-search-input" type="search" placeholder="Java、大森、80万円など">
        </label>
        <button class="button" type="submit">検索</button>
        <button class="button" type="button" id="project-search-clear">クリア</button>
      </form>
      <p class="notice">認証、実DB接続、マッチング画面への移動は今回の対象外です。</p>
      <div id="projects-root" class="project-grid">
        <div class="state-box" role="status" aria-live="polite">
          <div>
            <strong>読み込み中です</strong>
            <span>案件取得APIへ接続しています。</span>
          </div>
        </div>
      </div>
    </section>
    <script>
      const projectsRoot = document.querySelector("#projects-root");
      const initialQuery = ${scriptValue(initialQuery)};
      const initialPage = ${initialPage - 1};
      const projectPageSize = 10;
      let allProjects = [];
      let currentProjectPage = initialPage;
      let appliedQuery = initialQuery;

      function escapeHtml(value) {
        return String(value ?? "")
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll('"', "&quot;")
          .replaceAll("'", "&#39;");
      }

      function renderState(title, message, role = "") {
        projectsRoot.className = "project-grid";
        projectsRoot.innerHTML =
          '<div class="state-box"' + (role ? ' role="' + role + '"' : "") + ">" +
            "<div><strong>" + escapeHtml(title) + "</strong><span>" + escapeHtml(message) + "</span></div>" +
          "</div>";
      }

      function renderProjects(projects) {
        if (projects.length === 0) {
          renderState(appliedQuery ? "該当する案件がありません" : "表示できる案件がありません", appliedQuery ? "検索条件を変更してください。" : "DBまたはAPIから0件が返りました。");
          return;
        }

        allProjects = projects;
        currentProjectPage = Math.min(currentProjectPage, Math.max(0, Math.ceil(projects.length / projectPageSize) - 1));
        renderProjectPage();
      }

      function renderProjectPage() {
        const totalPages = Math.max(1, Math.ceil(allProjects.length / projectPageSize));
        const visibleProjects = allProjects.slice(currentProjectPage * projectPageSize, (currentProjectPage + 1) * projectPageSize);
        projectsRoot.className = "project-grid";
        projectsRoot.innerHTML = visibleProjects.map((project) => {
          const skills = Array.isArray(project.requiredSkills) ? project.requiredSkills : [];
          return '<article class="project-card">' +
            '<div class="project-card-main">' +
              "<h2>" + escapeHtml(project.name) + "</h2>" +
              '<div class="skills" aria-label="' + escapeHtml(project.name) + 'の必須スキル">' +
                skills.map((skill) => '<span class="skill">' + escapeHtml(skill) + "</span>").join("") +
              "</div>" +
            "</div>" +
            '<div class="project-card-meta">' +
              '<ul class="meta">' +
                "<li>" + escapeHtml(project.location) + "</li>" +
                "<li>" + escapeHtml(project.rate) + "</li>" +
                "<li>" + escapeHtml(project.startDate) + "</li>" +
              "</ul>" +
              "<p>" + escapeHtml(project.summary) + "</p>" +
            "</div>" +
              '<div class="project-actions"><a class="button" href="/projects/' + encodeURIComponent(project.id) + '/matches?q=' + encodeURIComponent(appliedQuery) + '&page=' + (currentProjectPage + 1) + '">この案件を選択</a></div>' +
          "</article>";
        }).join("") +
          '<div class="project-pagination" aria-label="案件一覧ページ移動">' +
            '<button type="button" class="button" id="previous-projects"' + (currentProjectPage === 0 ? ' disabled' : '') + '>前へ</button>' +
            '<span aria-live="polite">' + (currentProjectPage + 1) + " / " + totalPages + "ページ</span>" +
            '<button type="button" class="button" id="next-projects"' + (currentProjectPage >= totalPages - 1 ? ' disabled' : '') + '>次へ</button>' +
          "</div>";

        document.querySelector("#previous-projects")?.addEventListener("click", () => {
          if (currentProjectPage > 0) {
            currentProjectPage -= 1;
            renderProjectPage();
          }
        });
        document.querySelector("#next-projects")?.addEventListener("click", () => {
          if (currentProjectPage < totalPages - 1) {
            currentProjectPage += 1;
            renderProjectPage();
          }
        });
      }

      async function loadProjects(query = appliedQuery, resetPage = false) {
        appliedQuery = String(query ?? '').replace(/[ \\u3000]+/gu, ' ').trim();
        if (resetPage) currentProjectPage = 0;
        projectsRoot.innerHTML = '<div class="state-box" role="status" aria-live="polite"><div><strong>読み込み中です</strong><span>案件取得APIへ接続しています。</span></div></div>';
        try {
          const queryParameter = appliedQuery ? '?q=' + encodeURIComponent(appliedQuery) : '';
          const response = await fetch('/api/projects' + queryParameter, { headers: { accept: 'application/json' } });
          if (!response.ok) throw new Error('projects');
          const data = await response.json();
          renderProjects(Array.isArray(data.projects) ? data.projects : []);
        } catch {
          renderState('案件一覧を表示できません', 'API通信またはDB接続で失敗した場合の表示です。', 'alert');
        }
      }
      document.querySelector('#project-search-form')?.addEventListener('submit', (event) => {
        event.preventDefault();
        loadProjects(document.querySelector('#project-search-input').value, true);
      });
      document.querySelector('#project-search-clear')?.addEventListener('click', () => {
        document.querySelector('#project-search-input').value = '';
        loadProjects('', true);
      });
      document.querySelector('#project-search-input').value = appliedQuery;
      loadProjects(appliedQuery);
    </script>
  `);
}

function displayValue(value: string | number | null): string {
  return value === null ? "未設定" : String(value);
}

function renderProjectMatchesPage(project: ApiProject | undefined, id: string): string {
  if (!project) {
    return pageShell("案件が見つかりません", `
      <section class="panel">
        <h1 class="page-title">案件が見つかりません</h1>
        <p class="lead">案件ID「${id}」に対応する案件は存在しません。</p>
        <p class="project-actions"><a class="back-link" href="/projects">案件一覧へ戻る</a></p>
      </section>
    `);
  }

  const skills = project.requiredSkills ?? [];
  const skillMarkup = skills.length > 0
    ? skills.map((skill) => `<span class="skill">${skill}</span>`).join("")
    : "<span>未設定</span>";

  return pageShell(`${project.projectName ?? "案件詳細"}のマッチング`, `
    <section class="panel">
      <p><a class="back-link" href="/projects">← 案件一覧へ戻る</a></p>
      <h1 class="page-title">${project.projectName ?? "案件名未設定"}</h1>
      <p class="lead">${project.summary ?? "概要未設定"}</p>
      <dl class="detail-grid">
        <div class="detail-item"><dt>勤務地</dt><dd>${displayValue(project.location)}</dd></div>
        <div class="detail-item"><dt>単価</dt><dd>${displayValue(project.rate)}</dd></div>
        <div class="detail-item"><dt>勤務形態</dt><dd>${displayValue(project.workStyle)}</dd></div>
        <div class="detail-item"><dt>開始時期</dt><dd>${displayValue(project.startDate)}</dd></div>
        <div class="detail-item"><dt>募集人数</dt><dd>${displayValue(project.headcount)}</dd></div>
        <div class="detail-item"><dt>工程</dt><dd>${displayValue(project.process)}</dd></div>
      </dl>
      <section class="detail-section">
        <h2>案件メールの原文</h2>
        <p class="source-text">${project.sourceText === null ? "メール原文未登録" : escapeHtml(project.sourceText)}</p>
      </section>
      <section class="detail-section">
        <h2>必須スキル</h2>
        <div class="skills" aria-label="必須スキル">${skillMarkup}</div>
      </section>
      <section class="detail-section">
        <h2>マッチング結果</h2>
        <p class="notice">マッチング結果は未実装です。今回は選択した案件情報の表示までを確認できます。</p>
      </section>
      <div class="matching-layout">
        <section class="matching-panel talent-list-panel" aria-labelledby="talent-list-heading">
          <h2 id="talent-list-heading">人材一覧</h2>
          <p>案件にマッチする人材を一覧で確認する領域です。</p>
          <div class="matching-placeholder">人材一覧は未実装です。</div>
        </section>
        <section class="matching-panel talent-detail-panel" aria-labelledby="talent-detail-heading">
          <h2 id="talent-detail-heading">人材詳細</h2>
          <p>選択した人材の詳細を表示する領域です。</p>
          <div class="matching-placeholder">人材を選択すると詳細が表示されます。</div>
        </section>
      </div>
    </section>
  `);
}

function renderProjectMatchesClientPage(id: string, returnState: { query?: string | undefined; page?: number | undefined } = {}): string {
  const query = String(returnState.query ?? "").replace(/[ \u3000]+/gu, " ").trim();
  const page = Number.isInteger(returnState.page) && (returnState.page ?? 1) > 0 ? returnState.page ?? 1 : 1;
  const returnQuery = new URLSearchParams({ ...(query ? { q: query } : {}), page: String(page) }).toString();
  return pageShell("案件マッチング", `
    <section id="matching-root" class="panel" data-project-id="${id}">
      <div class="state-box" role="status" aria-live="polite">
        <div><strong>案件情報を読み込み中です</strong><span>案件取得APIへ接続しています。</span></div>
      </div>
    </section>
    <script>
      const matchingRoot = document.querySelector("#matching-root");
      const projectId = matchingRoot.dataset.projectId;
      const pageSize = 10;
      let currentPage = 0;
      let totalTalentCount = 0;
      let sourceExpanded = false;
      let pageCursors = [null];
      let pageTalents = [];
      let talentPageLoading = false;
      let talentLoadError = null;
      let selectedTalentId = null;

      function escapeHtml(value) {
        return String(value ?? "")
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll('"', "&quot;")
          .replaceAll("'", "&#39;");
      }

      function renderState(title, message, role = "") {
        matchingRoot.innerHTML = '<div class="state-box"' + (role ? ' role="' + role + '"' : "") + ">" +
          "<div><strong>" + escapeHtml(title) + "</strong><span>" + escapeHtml(message) + "</span></div></div>";
      }

      function renderTalentList(talents) {
        if (talents.length === 0) {
          return talentPageLoading
            ? '<div class="matching-placeholder">人材を読み込み中です。</div>'
            : '<div class="matching-placeholder">表示できる人材がありません。</div>';
        }

        const totalPages = Math.max(1, Math.ceil(totalTalentCount / pageSize));
        const paginationMarkup = '<div class="pagination" aria-label="人材一覧ページ移動">' +
          '<button type="button" class="button" id="previous-talents"' + (currentPage === 0 || talentPageLoading ? ' disabled' : '') + '>前へ</button>' +
          '<span aria-live="polite">' + (currentPage + 1) + ' / ' + totalPages + 'ページ</span>' +
          '<button type="button" class="button" id="next-talents"' + (currentPage >= totalPages - 1 || talentPageLoading ? ' disabled' : '') + '>次へ</button>' +
          '</div>';

        return (talentLoadError ? '<p class="error-state" role="alert">人材情報を取得できませんでした。<button type="button" class="button" id="retry-talents">再試行</button></p>' : '') +
          '<p class="talent-count" aria-live="polite">' + talents.length + ' / ' + totalTalentCount + '人表示</p>' +
          '<div class="talent-list">' + talents.map((talent) =>
          '<button type="button" class="talent-card" data-talent-id="' + escapeHtml(talent.id) + '" aria-pressed="' + (talent.id === selectedTalentId ? 'true' : 'false') + '">' +
            '<div class="talent-card-main"><h3>' + escapeHtml(talent.nameOrInitial) + '</h3>' +
              '<div class="talent-skills" aria-label="技術スキル">' +
                (talent.technicalSkills.length > 0
                  ? talent.technicalSkills.map((skill) => escapeHtml(skill)).join(' / ')
                  : 'スキル未設定') +
              '</div></div>' +
            '<div class="talent-card-meta">' +
              '<p>希望単価: ' + escapeHtml(talent.desiredRate) + '</p>' +
              '<p>最寄り駅: ' + escapeHtml(talent.nearestStation) + '</p>' +
            '</div>' +
          '</button>'
        ).join('') + '</div>' + paginationMarkup;
      }

      function renderTalentDetail(talent) {
        if (!talent) {
          return '<div class="matching-placeholder">人材を選択してください。</div>';
        }

        return '<div class="talent-detail" data-selected-talent-id="' + escapeHtml(talent.id) + '">' +
          '<div class="talent-detail-item"><strong>氏名・イニシャル</strong><div>' + escapeHtml(talent.nameOrInitial) + '</div></div>' +
          '<div class="talent-detail-item"><strong>技術スキル</strong><div>' + escapeHtml(talent.technicalSkills.join('、')) + '</div></div>' +
          '<div class="talent-detail-item"><strong>希望単価</strong><div>' + escapeHtml(talent.desiredRate) + '</div></div>' +
          '<div class="talent-detail-item"><strong>最寄り駅</strong><div>' + escapeHtml(talent.nearestStation) + '</div></div>' +
          '<div class="talent-detail-item"><strong>希望勤務形態</strong><div>' + escapeHtml(talent.desiredWorkStyle) + '</div></div>' +
          '<div class="talent-detail-item"><strong>所属</strong><div>' + escapeHtml(talent.affiliation) + '</div></div>' +
          '<div class="talent-detail-item"><strong>人材メールの原文</strong><div class="source-text">' +
            (talent.sourceText === null || talent.sourceText === undefined
              ? '人材メールの原文は未登録です'
              : escapeHtml(talent.sourceText)) +
          '</div></div>' +
        '</div>';
      }

      function updateTalentSelection(talentId) {
        selectedTalentId = talentId;
        const selectedTalent = pageTalents.find((talent) => talent.id === selectedTalentId);
        document.querySelectorAll('[data-talent-id]').forEach((card) => {
          card.setAttribute('aria-pressed', card.dataset.talentId === selectedTalentId ? 'true' : 'false');
        });
        const detailRoot = document.querySelector('#talent-detail-root');
        detailRoot.innerHTML = renderTalentDetail(selectedTalent);
        detailRoot.scrollTop = 0;
      }

      function bindTalentInteractions() {
        document.querySelectorAll('[data-talent-id]').forEach((card) => {
          card.addEventListener('click', () => updateTalentSelection(card.dataset.talentId));
          card.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              updateTalentSelection(card.dataset.talentId);
            }
          });
        });

        document.querySelector('#previous-talents')?.addEventListener('click', () => loadTalentPage(currentPage - 1));
        document.querySelector('#next-talents')?.addEventListener('click', () => loadTalentPage(currentPage + 1));
        document.querySelector('#retry-talents')?.addEventListener('click', () => loadTalentPage(currentPage));
      }

      function bindSourceToggle() {
        const toggle = document.querySelector('#source-text-toggle');
        const source = document.querySelector('#project-source-text');
        if (!toggle || !source) return;
        toggle.addEventListener('click', () => {
          sourceExpanded = !sourceExpanded;
          source.hidden = !sourceExpanded;
          toggle.textContent = sourceExpanded ? '原文を閉じる' : '原文を開く';
          toggle.setAttribute('aria-expanded', String(sourceExpanded));
        });
      }

      async function loadTalentPage(targetPage) {
        const totalPages = Math.max(1, Math.ceil(totalTalentCount / pageSize));
        if (talentPageLoading || targetPage < 0 || targetPage >= totalPages) return;
        const cursor = pageCursors[targetPage];
        if (targetPage > 0 && !cursor) return;
        talentPageLoading = true;
        talentLoadError = null;
        const listRoot = document.querySelector('#talent-list-root');
        if (listRoot) listRoot.innerHTML = renderTalentList(pageTalents);
        const query = cursor ? '&cursor=' + encodeURIComponent(cursor) : '';
        try {
          const response = await fetch('/api/projects/' + encodeURIComponent(projectId) + '/matches?limit=' + pageSize + query, { headers: { accept: 'application/json' } });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error?.code || 'TALENTS_UNAVAILABLE');
          currentPage = targetPage;
          pageTalents = Array.isArray(data.talents) ? data.talents : [];
          totalTalentCount = Number.isInteger(data.totalCount) ? data.totalCount : 0;
          pageCursors[targetPage + 1] = data.nextCursor ?? null;
        } catch {
          talentLoadError = true;
        } finally {
          talentPageLoading = false;
          if (listRoot) listRoot.innerHTML = renderTalentList(pageTalents);
          listRoot?.querySelector('.talent-list')?.scrollTo(0, 0);
          bindTalentInteractions();
        }
      }

      function renderProject(project) {
        sourceExpanded = false;
        const skills = Array.isArray(project.requiredSkills) ? project.requiredSkills : [];
        const skillMarkup = skills.length > 0
          ? skills.map((skill) => '<span class="skill">' + escapeHtml(skill) + "</span>").join("")
          : "<span>未設定</span>";
        const value = (item) => item === null || item === undefined ? "未設定" : item;

        matchingRoot.innerHTML =
          '<p><a class="back-link" href="/projects?${escapeHtml(returnQuery)}">← 案件一覧へ戻る</a></p>' +
          '<h1 class="page-title">' + escapeHtml(value(project.projectName) || "案件名未設定") + "</h1>" +
          '<p class="lead">' + escapeHtml(value(project.summary) || "概要未設定") + "</p>" +
          '<dl class="detail-grid">' +
            '<div class="detail-item"><dt>勤務地</dt><dd>' + escapeHtml(value(project.location)) + "</dd></div>" +
            '<div class="detail-item"><dt>単価</dt><dd>' + escapeHtml(value(project.rate)) + "</dd></div>" +
            '<div class="detail-item"><dt>勤務形態</dt><dd>' + escapeHtml(value(project.workStyle)) + "</dd></div>" +
            '<div class="detail-item"><dt>開始時期</dt><dd>' + escapeHtml(value(project.startDate)) + "</dd></div>" +
            '<div class="detail-item"><dt>募集人数</dt><dd>' + escapeHtml(value(project.headcount)) + "</dd></div>" +
            '<div class="detail-item"><dt>工程</dt><dd>' + escapeHtml(value(project.process)) + "</dd></div>" +
          "</dl>" +
          '<section class="detail-section"><div class="source-header"><h2>案件メールの原文</h2><button type="button" class="button source-toggle" id="source-text-toggle" aria-expanded="false">原文を開く</button></div><div id="project-source-text" hidden><p class="source-text">' +
            (project.sourceText === null || project.sourceText === undefined
              ? "メール原文未登録"
              : escapeHtml(project.sourceText)) +
          "</p></div></section>" +
          '<section class="detail-section"><h2>必須スキル</h2><div class="skills" aria-label="必須スキル">' + skillMarkup + "</div></section>" +
          '<section class="detail-section"><h2>マッチング結果</h2><p class="notice">マッチング結果は未実装です。今回は選択した案件情報の表示までを確認できます。</p></section>' +
          '<div class="matching-layout">' +
            '<section class="matching-panel talent-list-panel" aria-labelledby="talent-list-heading"><h2 id="talent-list-heading">人材一覧</h2><p>モックAPIから取得した画面確認用データを表示しています。</p><div id="talent-list-root">' + renderTalentList(pageTalents) + '</div></section>' +
            '<section class="matching-panel talent-detail-panel" aria-labelledby="talent-detail-heading"><h2 id="talent-detail-heading">人材詳細</h2><p>選択した人材の詳細を表示します。</p><div id="talent-detail-root" aria-live="polite">' + renderTalentDetail(null) + '</div></section>' +
          "</div>";

        bindSourceToggle();
        bindTalentInteractions();
        loadTalentPage(0);
      }

      fetch("/api/projects/" + encodeURIComponent(projectId), { headers: { accept: "application/json" } })
        .then((response) => response.ok ? response.json() : response.json().then((data) => Promise.reject(new Error(data.error?.code || "API request failed"))))
        .then((data) => renderProject(data.project))
        .catch((error) => {
          if (error.message === "PROJECT_NOT_FOUND") {
            renderState("案件が見つかりません", "指定された案件IDに対応する案件は存在しません。", "alert");
            return;
          }
          renderState("案件情報を表示できません", "API通信またはDB接続で失敗しました。", "alert");
        });
    </script>
  `);
}

function sendHtml(response: ServerResponse, statusCode: number, html: string): void {
  response.writeHead(statusCode, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(html);
}

function sendJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(JSON.stringify(body));
}

function projectSummary(project: ApiProject): ProjectListItem {
  return {
    id: project.id,
    name: project.projectName ?? "案件名未設定",
    summary: project.summary ?? "概要未設定",
    location: project.location ?? "勤務地未設定",
    rate: project.rate ?? "単価未設定",
    startDate: project.startDate ?? "開始時期未設定",
    requiredSkills: project.requiredSkills ?? []
  };
}

function talentResponse(record: { id: string } & Record<string, unknown>): ApiTalent {
  return { id: record.id, ...talentSchema.parse(record) };
}

function renderTalentsPage(initialState: { period?: string | undefined; query?: string | undefined; page?: number | undefined } = {}): string {
  const initialPeriod = initialState.period === "2" || initialState.period === "3" || initialState.period === "all" ? initialState.period : "1";
  const initialQuery = String(initialState.query ?? "").replace(/[ \u3000]+/gu, " ").trim();
  const initialPage = Number.isInteger(initialState.page) && (initialState.page ?? 1) > 0 ? initialState.page ?? 1 : 1;
  const scriptValue = (value: unknown): string => JSON.stringify(value).replaceAll("<", "\\u003c").replaceAll(">", "\\u003e").replaceAll("&", "\\u0026");
  return pageShell("人材一覧", `
    <main class="page-shell">
      <section class="panel talent-list-page-panel" aria-labelledby="talents-heading">
        <div class="toolbar">
          <h1 id="talents-heading" class="page-title">人材一覧</h1>
          <div class="talent-filter-controls">
            <label for="talent-registration-period">登録期間</label>
            <select id="talent-registration-period">
              <option value="1" selected>1か月前から</option>
              <option value="2">2か月前から</option>
              <option value="3">3か月前から</option>
              <option value="all">全期間</option>
            </select>
            <a class="button" href="/projects">案件一覧に戻る</a>
          </div>
        </div>
        <form id="talent-search-form" class="talent-search-form">
          <label for="talent-search-input">キーワード検索
            <input id="talent-search-input" type="search" placeholder="Java、新宿、91万円など">
          </label>
          <button class="button" type="submit">検索</button>
          <button class="button" type="button" id="talent-search-clear">クリア</button>
        </form>
        <p class="lead">登録済みの人材情報を表示します。</p>
        <div id="talents-root" aria-live="polite"><p>読み込み中です。</p></div>
      </section>
    </main>
    <script>
      const escapeHtml = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
      const display = (value) => value === null || value === undefined || value === "" ? "未設定" : escapeHtml(value);
      const pageSize = 10;
      let allTalents = [];
      let selectedPeriod = ${scriptValue(initialPeriod)};
      let appliedQuery = ${scriptValue(initialQuery)};
      let currentTalentPage = ${initialPage - 1};
      function renderTalents() {
        const totalPages = Math.max(1, Math.ceil(allTalents.length / pageSize));
        currentTalentPage = Math.min(currentTalentPage, totalPages - 1);
        if (!allTalents.length) return appliedQuery
          ? '<p class="empty-state">検索条件に一致する人材が見つかりませんでした。キーワードや登録期間を変更してください。</p>'
          : '<p class="empty-state">人材が登録されていません。</p>';
        const start = currentTalentPage * pageSize;
        const pageTalents = allTalents.slice(start, start + pageSize);
        return '<p class="talent-count">全' + allTalents.length + '名</p>' +
          '<div class="talent-grid">' + pageTalents.map((talent) =>
            '<article class="talent-card">' +
              '<div><h2>' + display(talent.id) + '</h2>' +
                '<p title="' + display((talent.technicalSkills || []).join("、")) + '">技術スキル: ' + display((talent.technicalSkills || []).join("、")) + '</p></div>' +
              '<div class="talent-card-meta">' +
                '<p>希望単価: ' + display(talent.desiredRate) + '</p>' +
                '<p>最寄り駅: ' + display(talent.nearestStation) + '</p>' +
                '<p title="' + display((talent.availableProcess || []).join("、")) + '">経験工程: ' + display((talent.availableProcess || []).join("、")) + '</p>' +
              '</div>' +
              '<div class="talent-card-actions"><a class="button" href="/talents/' + encodeURIComponent(talent.id) + '?period=' + encodeURIComponent(selectedPeriod) + '&q=' + encodeURIComponent(appliedQuery) + '&page=' + (currentTalentPage + 1) + '">詳細を見る</a></div>' +
            '</article>'
          ).join('') + '</div>' +
          '<div class="talent-pagination" aria-label="人材一覧ページ移動">' +
            '<button type="button" class="button" id="previous-talents"' + (currentTalentPage === 0 ? ' disabled' : '') + '>前へ</button>' +
            '<span aria-live="polite">' + (currentTalentPage + 1) + ' / ' + totalPages + 'ページ</span>' +
            '<button type="button" class="button" id="next-talents"' + (currentTalentPage >= totalPages - 1 ? ' disabled' : '') + '>次へ</button>' +
          '</div>';
      }
      function updateTalents() {
        document.querySelector('#talents-root').innerHTML = renderTalents();
        document.querySelector('#previous-talents')?.addEventListener('click', () => { currentTalentPage -= 1; updateTalents(); });
        document.querySelector('#next-talents')?.addEventListener('click', () => { currentTalentPage += 1; updateTalents(); });
      }
      async function loadTalents(period, query = appliedQuery, resetPage = false) {
        selectedPeriod = period;
        appliedQuery = String(query ?? '').replace(/[ \\u3000]+/gu, ' ').trim();
        if (resetPage) currentTalentPage = 0;
        document.querySelector('#talents-root').innerHTML = '<p>読み込み中です。</p>';
        try {
          const queryParameter = appliedQuery ? '&q=' + encodeURIComponent(appliedQuery) : '';
          const response = await fetch('/api/talents?period=' + encodeURIComponent(period) + queryParameter);
          if (!response.ok) throw new Error('talents');
          const data = await response.json();
          allTalents = Array.isArray(data.talents) ? data.talents : [];
          updateTalents();
        } catch {
          document.querySelector('#talents-root').innerHTML = '<p class="error-state">人材情報を取得できませんでした。</p>';
        }
      }
      document.querySelector('#talent-registration-period')?.addEventListener('change', (event) => {
        loadTalents(event.target.value, appliedQuery, true);
      });
      document.querySelector('#talent-search-form')?.addEventListener('submit', (event) => {
        event.preventDefault();
        loadTalents(selectedPeriod, document.querySelector('#talent-search-input').value, true);
      });
      document.querySelector('#talent-search-clear')?.addEventListener('click', () => {
        document.querySelector('#talent-search-input').value = '';
        loadTalents(selectedPeriod, '', true);
      });
      document.querySelector('#talent-registration-period').value = selectedPeriod;
      document.querySelector('#talent-search-input').value = appliedQuery;
      loadTalents(selectedPeriod, appliedQuery).then(() => {
        currentTalentPage = Math.min(currentTalentPage, Math.max(0, Math.ceil(allTalents.length / pageSize) - 1));
        updateTalents();
      });
    </script>
  `);
}

function renderTalentDetailPage(id: string, returnState: { period?: string | undefined; query?: string | undefined; page?: number | undefined } = {}): string {
  const period = returnState.period === "2" || returnState.period === "3" || returnState.period === "all" ? returnState.period : "1";
  const query = String(returnState.query ?? "").replace(/[ \u3000]+/gu, " ").trim();
  const page = Number.isInteger(returnState.page) && (returnState.page ?? 1) > 0 ? returnState.page ?? 1 : 1;
  const returnQuery = new URLSearchParams({ period, ...(query ? { q: query } : {}), page: String(page) }).toString();
  return pageShell("人材詳細", `
    <main class="page-shell">
      <section class="panel" aria-labelledby="talent-heading">
        <a href="/talents?${escapeHtml(returnQuery)}">← 人材一覧へ戻る</a>
        <h1 id="talent-heading" class="page-title">人材詳細</h1>
        <div id="talent-root" aria-live="polite"><p>読み込み中です。</p></div>
      </section>
    </main>
    <script>
      const escapeHtml = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
      const display = (value) => value === null || value === undefined || value === "" ? "未設定" : escapeHtml(value);
      const id = ${JSON.stringify(id)};
      fetch('/api/talents/' + encodeURIComponent(id)).then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data?.error?.message || 'talent'); return data; })
        .then(({ talent }) => { document.querySelector('#talent-root').innerHTML = '<dl>' +
          '<dt>ID</dt><dd>' + display(talent.id) + '</dd>' +
          '<dt>技術スキル</dt><dd>' + display((talent.technicalSkills || []).join("、")) + '</dd>' +
          '<dt>経験工程・担当業務</dt><dd>' + display((talent.availableProcess || []).join("、")) + '</dd>' +
          '<dt>希望単価</dt><dd>' + display(talent.desiredRate) + '</dd>' +
          '<dt>最寄り駅</dt><dd>' + display(talent.nearestStation) + '</dd>' +
          '<dt>希望勤務条件</dt><dd>' + display(talent.desiredWorkStyle) + '</dd>' +
          '<dt>稼働開始時期</dt><dd>' + display(talent.availableFrom) + '</dd>' +
          '<dt>所属区分</dt><dd>' + display(talent.affiliation) + '</dd>' +
          '<dt>人材メールの原文</dt><dd class="source-text">' + display(talent.sourceText) + '</dd></dl>'; })
        .catch((error) => { document.querySelector('#talent-root').innerHTML = '<p class="error-state">' + escapeHtml(error.message === 'Talent was not found.' ? error.message : '人材情報を取得できませんでした。') + '</p>'; });
    </script>
  `);
}

async function handleProjectsApi(url: URL, response: ServerResponse): Promise<void> {
  if (url.searchParams.get("state") === "error") {
    sendJson(response, 503, {
      error: { code: "PROJECTS_UNAVAILABLE", message: "Projects are temporarily unavailable." }
    });
    return;
  }

  if (url.searchParams.get("state") === "empty") {
    sendJson(response, 200, { projects: [] });
    return;
  }

  try {
    const query = url.searchParams.get("q") ?? "";
    const records = await getPrismaClient().project.findMany({ orderBy: { createdAt: "asc" } });
    const projects = records
      .map((record) => ({ id: record.id, ...projectSchema.parse(record) }))
      .filter((project) => matchesProjectSearch(project, query))
      .map((project) => projectSummary(project));
    sendJson(response, 200, { projects });
  } catch {
    sendJson(response, 503, {
      error: { code: "PROJECTS_UNAVAILABLE", message: "Projects are temporarily unavailable." }
    });
  }
}

async function handleProjectByIdApi(id: string, url: URL, response: ServerResponse): Promise<void> {
  if (url.searchParams.get("state") === "error") {
    sendJson(response, 503, {
      error: { code: "PROJECTS_UNAVAILABLE", message: "Projects are temporarily unavailable." }
    });
    return;
  }

  let project: ApiProject | undefined;

  try {
    const record = await getPrismaClient().project.findUnique({ where: { id } });
    project = record ? { id: record.id, ...projectSchema.parse(record) } : undefined;
  } catch {
    sendJson(response, 503, {
      error: { code: "PROJECTS_UNAVAILABLE", message: "Projects are temporarily unavailable." }
    });
    return;
  }

  if (!project) {
    sendJson(response, 404, { error: { code: "PROJECT_NOT_FOUND", message: "Project was not found." } });
    return;
  }

  sendJson(response, 200, { project });
}

async function handleTalentsApi(url: URL, response: ServerResponse): Promise<void> {
  try {
    const period = parseTalentRegistrationPeriod(url.searchParams.get("period"));
    const query = url.searchParams.get("q") ?? "";
    const createdAtSince = getTalentRegistrationSince(new Date(), period);
    const records = [...mockTalentRecords]
      .filter((record) => createdAtSince === undefined || record.createdAt >= createdAtSince)
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime() || left.id.localeCompare(right.id));
    const talents = records.map((record) => talentResponse(record))
      .filter((talent) => matchesTalentSearch(talent, query));
    sendJson(response, 200, { talents });
  } catch {
    sendJson(response, 503, { error: { code: "TALENTS_UNAVAILABLE", message: "Talents are temporarily unavailable." } });
  }
}

async function handleTalentByIdApi(id: string, response: ServerResponse): Promise<void> {
  try {
    const record = mockTalentRecords.find((talent) => talent.id === id);
    if (!record) {
      sendJson(response, 404, { error: { code: "TALENT_NOT_FOUND", message: "Talent was not found." } });
      return;
    }
    sendJson(response, 200, { talent: talentResponse(record) });
  } catch {
    sendJson(response, 503, { error: { code: "TALENTS_UNAVAILABLE", message: "Talents are temporarily unavailable." } });
  }
}

function handleProjectMatchesApi(projectId: string, url: URL, response: ServerResponse): void {
  const requestedLimit = Number(url.searchParams.get("limit") ?? mockTalentPageSize);
  if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > mockTalentPageSize) {
    sendJson(response, 400, { error: { code: "INVALID_LIMIT", message: "Limit must be between 1 and 10." } });
    return;
  }

  const cursor = url.searchParams.get("cursor");
  const offset = cursor ? decodeTalentCursor(cursor, projectId) : 0;
  if (offset === null) {
    sendJson(response, 400, { error: { code: "INVALID_CURSOR", message: "Cursor is invalid." } });
    return;
  }

  const talents = mockTalents.slice(offset, offset + requestedLimit).map(mockTalentResponse);
  const nextOffset = offset + talents.length;
  sendJson(response, 200, {
    talents,
    totalCount: mockTalents.length,
    nextCursor: nextOffset < mockTalents.length ? encodeTalentCursor(projectId, nextOffset) : null,
    hasMore: nextOffset < mockTalents.length
  });
}

async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

  if (request.method !== "GET") {
    response.writeHead(405, { allow: "GET" });
    response.end("Method Not Allowed");
    return;
  }

  if (url.pathname === "/api/projects") {
    await handleProjectsApi(url, response);
    return;
  }

  if (url.pathname === "/api/talents") {
    await handleTalentsApi(url, response);
    return;
  }

  const matchesApiRoute = /^\/api\/projects\/([^/]+)\/matches$/.exec(url.pathname);
  if (matchesApiRoute?.[1]) {
    handleProjectMatchesApi(decodeURIComponent(matchesApiRoute[1]), url, response);
    return;
  }

  if (url.pathname.startsWith("/api/talents/")) {
    const id = decodeURIComponent(url.pathname.slice("/api/talents/".length));
    await handleTalentByIdApi(id, response);
    return;
  }

  if (url.pathname.startsWith("/api/projects/")) {
    const id = decodeURIComponent(url.pathname.slice("/api/projects/".length));
    await handleProjectByIdApi(id, url, response);
    return;
  }

  if (url.pathname === "/") {
    response.writeHead(302, { location: "/projects" });
    response.end();
    return;
  }

  if (url.pathname === "/projects") {
    sendHtml(response, 200, renderProjectsPage({
      query: url.searchParams.get("q") ?? undefined,
      page: Number(url.searchParams.get("page") ?? "1")
    }));
    return;
  }

  if (url.pathname === "/talents") {
    sendHtml(response, 200, renderTalentsPage({
      period: url.searchParams.get("period") ?? undefined,
      query: url.searchParams.get("q") ?? undefined,
      page: Number(url.searchParams.get("page") ?? "1")
    }));
    return;
  }

  const talentRoute = /^\/talents\/([^/]+)$/.exec(url.pathname);
  if (talentRoute?.[1]) {
    sendHtml(response, 200, renderTalentDetailPage(decodeURIComponent(talentRoute[1]), {
      period: url.searchParams.get("period") ?? undefined,
      query: url.searchParams.get("q") ?? undefined,
      page: Number(url.searchParams.get("page") ?? "1")
    }));
    return;
  }

  const matchesRoute = /^\/projects\/([^/]+)\/matches$/.exec(url.pathname);
  if (matchesRoute) {
    const encodedId = matchesRoute[1];
    if (!encodedId) {
      sendHtml(response, 404, renderProjectMatchesPage(undefined, ""));
      return;
    }
    const id = decodeURIComponent(encodedId);
    sendHtml(response, 200, renderProjectMatchesClientPage(id, {
      query: url.searchParams.get("q") ?? undefined,
      page: Number(url.searchParams.get("page") ?? "1")
    }));
    return;
  }

  sendHtml(response, 404, pageShell("Not Found", `
    <section class="panel">
      <h1 class="page-title">ページが見つかりません</h1>
      <p class="lead">指定されたURLに対応する画面はまだありません。</p>
    </section>
  `));
}

const server = createServer((request, response) => {
  void handleRequest(request, response);
});
const port = getPort(process.argv);

server.listen(port, () => {
  console.log(`Web server listening on http://localhost:${port}`);
});
