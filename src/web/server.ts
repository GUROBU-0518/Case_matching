import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { getPrismaClient } from "../db/client.ts";
import type { Project, Talent } from "../domain/schemas.ts";
import { projectSchema } from "../domain/schemas.ts";

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

type MockTalent = Pick<Talent, "nameOrInitial" | "technicalSkills" | "desiredRate" | "nearestStation" | "desiredWorkStyle" | "affiliation"> & {
  readonly id: string;
};

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

    .project-actions {
      display: flex;
      align-items: center;
      justify-content: end;
      margin-top: 16px;
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

    .matching-layout {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      gap: 16px;
      margin-top: 28px;
    }

    .matching-panel {
      min-width: 0;
      padding: 18px;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: #ffffff;
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
      gap: 10px;
      margin-top: 16px;
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

    .talent-card {
      min-width: 0;
      padding: 14px;
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

    .talent-detail-item {
      padding: 12px;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: #f8fafc;
      overflow-wrap: anywhere;
    }

    .talent-card h3 {
      margin: 0 0 8px;
      font-size: 16px;
    }

    .talent-card p {
      margin: 4px 0 0;
      overflow-wrap: anywhere;
      color: var(--muted);
      font-size: 14px;
    }

    .talent-skills {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 10px;
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

function renderProjectsPage(): string {
  return pageShell("案件一覧", `
    <section class="panel">
      <div class="toolbar">
        <div>
          <h1 class="page-title">案件一覧</h1>
          <p class="lead">案件取得APIから取得した案件を表示します。</p>
        </div>
      </div>
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
      const searchParams = new URLSearchParams(window.location.search);
      const apiState = searchParams.get("apiState");
      const apiUrl = apiState ? "/api/projects?state=" + encodeURIComponent(apiState) : "/api/projects";

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
          renderState("表示できる案件がありません", "DBまたはAPIから0件が返りました。");
          return;
        }

        projectsRoot.className = "project-grid";
        projectsRoot.innerHTML = projects.map((project) => {
          const skills = Array.isArray(project.requiredSkills) ? project.requiredSkills : [];
          return '<article class="project-card">' +
            "<div>" +
              "<h2>" + escapeHtml(project.name) + "</h2>" +
              "<p>" + escapeHtml(project.summary) + "</p>" +
              '<ul class="meta">' +
                "<li>" + escapeHtml(project.location) + "</li>" +
                "<li>" + escapeHtml(project.rate) + "</li>" +
                "<li>" + escapeHtml(project.startDate) + "</li>" +
              "</ul>" +
            "</div>" +
            '<div class="skills" aria-label="' + escapeHtml(project.name) + 'の必須スキル">' +
              skills.map((skill) => '<span class="skill">' + escapeHtml(skill) + "</span>").join("") +
            "</div>" +
            '<div class="project-actions"><a class="button" href="/projects/' + encodeURIComponent(project.id) + '/matches">この案件を選択</a></div>' +
          "</article>";
        }).join("");
      }

      fetch(apiUrl, { headers: { accept: "application/json" } })
        .then((response) => {
          if (!response.ok) {
            throw new Error("API request failed");
          }
          return response.json();
        })
        .then((data) => renderProjects(Array.isArray(data.projects) ? data.projects : []))
        .catch(() => {
          renderState("案件一覧を表示できません", "API通信またはDB接続で失敗した場合の表示です。", "alert");
        });
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
        <h2>必須スキル</h2>
        <div class="skills" aria-label="必須スキル">${skillMarkup}</div>
      </section>
      <section class="detail-section">
        <h2>マッチング結果</h2>
        <p class="notice">マッチング結果は未実装です。今回は選択した案件情報の表示までを確認できます。</p>
      </section>
      <div class="matching-layout">
        <section class="matching-panel" aria-labelledby="talent-list-heading">
          <h2 id="talent-list-heading">人材一覧</h2>
          <p>案件にマッチする人材を一覧で確認する領域です。</p>
          <div class="matching-placeholder">人材一覧は未実装です。</div>
        </section>
        <section class="matching-panel" aria-labelledby="talent-detail-heading">
          <h2 id="talent-detail-heading">人材詳細</h2>
          <p>選択した人材の詳細を表示する領域です。</p>
          <div class="matching-placeholder">人材を選択すると詳細が表示されます。</div>
        </section>
      </div>
    </section>
  `);
}

function renderProjectMatchesClientPage(id: string): string {
  const serializedTalents = JSON.stringify(mockTalents).replaceAll("<", "\\u003c");

  return pageShell("案件マッチング", `
    <section id="matching-root" class="panel" data-project-id="${id}">
      <div class="state-box" role="status" aria-live="polite">
        <div><strong>案件情報を読み込み中です</strong><span>案件取得APIへ接続しています。</span></div>
      </div>
    </section>
    <script>
      const matchingRoot = document.querySelector("#matching-root");
      const projectId = matchingRoot.dataset.projectId;
      const mockTalents = ${serializedTalents};
      let visibleTalentCount = Math.min(20, mockTalents.length);
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
          return '<div class="matching-placeholder">表示できる人材がありません。</div>';
        }

        const visibleTalents = talents.slice(0, visibleTalentCount);
        const loadMoreMarkup = visibleTalentCount < talents.length
          ? '<button type="button" class="button load-more" id="load-more-talents">さらに表示</button>'
          : '';

        return '<p class="talent-count" aria-live="polite">' + visibleTalents.length + ' / ' + talents.length + '人表示</p>' +
          '<div class="talent-list">' + visibleTalents.map((talent) =>
          '<button type="button" class="talent-card" data-talent-id="' + escapeHtml(talent.id) + '" aria-pressed="' + (talent.id === selectedTalentId ? 'true' : 'false') + '">' +
            '<h3>' + escapeHtml(talent.nameOrInitial) + '</h3>' +
            '<p>希望単価: ' + escapeHtml(talent.desiredRate) + '</p>' +
            '<p>最寄り駅: ' + escapeHtml(talent.nearestStation) + '</p>' +
            '<p>希望勤務形態: ' + escapeHtml(talent.desiredWorkStyle) + '</p>' +
            '<p>所属: ' + escapeHtml(talent.affiliation) + '</p>' +
            '<div class="talent-skills" aria-label="技術スキル">' +
              talent.technicalSkills.map((skill) => '<span class="skill">' + escapeHtml(skill) + '</span>').join('') +
            '</div>' +
          '</button>'
        ).join('') + '</div>' + loadMoreMarkup;
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
        '</div>';
      }

      function updateTalentSelection(talentId) {
        selectedTalentId = talentId;
        const selectedTalent = mockTalents.find((talent) => talent.id === selectedTalentId);
        document.querySelectorAll('[data-talent-id]').forEach((card) => {
          card.setAttribute('aria-pressed', card.dataset.talentId === selectedTalentId ? 'true' : 'false');
        });
        const detailRoot = document.querySelector('#talent-detail-root');
        detailRoot.innerHTML = renderTalentDetail(selectedTalent);
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

        const loadMoreButton = document.querySelector('#load-more-talents');
        loadMoreButton?.addEventListener('click', () => {
          visibleTalentCount = Math.min(visibleTalentCount + 20, mockTalents.length);
          document.querySelector('#talent-list-root').innerHTML = renderTalentList(mockTalents);
          bindTalentInteractions();
        });
      }

      function renderProject(project) {
        const skills = Array.isArray(project.requiredSkills) ? project.requiredSkills : [];
        const skillMarkup = skills.length > 0
          ? skills.map((skill) => '<span class="skill">' + escapeHtml(skill) + "</span>").join("")
          : "<span>未設定</span>";
        const value = (item) => item === null || item === undefined ? "未設定" : item;

        matchingRoot.innerHTML =
          '<p><a class="back-link" href="/projects">← 案件一覧へ戻る</a></p>' +
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
          '<section class="detail-section"><h2>必須スキル</h2><div class="skills" aria-label="必須スキル">' + skillMarkup + "</div></section>" +
          '<section class="detail-section"><h2>マッチング結果</h2><p class="notice">マッチング結果は未実装です。今回は選択した案件情報の表示までを確認できます。</p></section>' +
          '<div class="matching-layout">' +
            '<section class="matching-panel" aria-labelledby="talent-list-heading"><h2 id="talent-list-heading">人材一覧</h2><p>画面確認用の架空データを表示しています。</p><div id="talent-list-root">' + renderTalentList(mockTalents) + '</div></section>' +
            '<section class="matching-panel" aria-labelledby="talent-detail-heading"><h2 id="talent-detail-heading">人材詳細</h2><p>選択した人材の詳細を表示します。</p><div id="talent-detail-root" aria-live="polite">' + renderTalentDetail(null) + '</div></section>' +
          "</div>";

        bindTalentInteractions();
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
    const projects = (await getPrismaClient().project.findMany({ orderBy: { createdAt: "asc" } }))
      .map((project) => projectSummary({ id: project.id, ...projectSchema.parse(project) }));
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
    sendHtml(response, 200, renderProjectsPage());
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
    sendHtml(response, 200, renderProjectMatchesClientPage(id));
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
