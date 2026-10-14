# SES案件・人材マッチングシステム

SES案件と人材情報を管理し、将来的にメール取得・AI分類・マッチングを行うシステムです。

現在はT02まで進んでおり、共通開発基盤、PostgreSQL接続、Prismaモデル、初回Migration、基本的な検証環境が整っています。Graph API、OpenAI、Web API、画面、CRUD処理はこれから実装します。

## 使用技術

- Node.js（`package.json`の`engines.node`を満たすバージョン）
- npm
- TypeScript
- PostgreSQL
- Prisma 6.19.3
- Zod
- Vitest
- ESLint

## 必要なソフトウェア

- Node.js 20以上
- npm
- Git
- PostgreSQL 18（または互換性のあるPostgreSQL）
- VS Code（推奨）
- pgAdmin（任意）

PostgreSQLのサービスが起動していることを確認してください。実際のパスワードやAPIキーはREADMEやGitHubへ記載しません。

## 初回セットアップ（Windows PowerShell）

### 1. リポジトリを取得する

```powershell
git clone https://github.com/GUROBU-0518/Case_matching.git
Set-Location Case_matching
git switch Tsuyuzaki
git status --short --branch
```

### 2. 依存パッケージをインストールする

```powershell
npm ci
```

`package-lock.json`に固定された依存関係を再現します。通常の環境構築では`npm install`より`npm ci`を使用してください。

### 3. PostgreSQLを起動する

PostgreSQLサービスを起動し、開発用データベースへ接続できる状態にします。既存のデータベースを削除・初期化しないでください。

開発用DBとユーザーが未作成の場合は、管理者権限で作成します。パスワードはローカルで安全に管理してください。

```sql
CREATE USER case_matching_dev WITH PASSWORD '<ローカル専用パスワード>';
CREATE DATABASE case_matching_dev OWNER case_matching_dev;
```

### 4. `.env`を作成する

```powershell
Copy-Item .env.example .env
```

`.env`の`DATABASE_URL`をローカル環境に合わせて設定します。

```text
DATABASE_URL=postgresql://case_matching_dev:<ローカル専用パスワード>@localhost:5432/case_matching_dev?schema=public
```

`.env`はGit管理対象外です。実際のパスワード、APIキー、メール本文をコミットしないでください。

## Prismaセットアップ

### Schemaを整形する

```powershell
npx prisma format
```

`prisma/schema.prisma`の書式を整えます。Schemaを変更した後に実行します。

### Schemaを検証する

```powershell
npx prisma validate
```

Provider、環境変数、型、Relationなど、Prisma Schemaの定義を確認します。Migration前に必ず実行します。

### Migrationを作成・適用する

```powershell
npx prisma migrate dev --name <変更内容>
```

開発用DBへSchemaを反映し、`prisma/migrations/`へMigrationファイルを作成します。DB構造を変更したときに実行してください。

現在は初回Migrationが作成済みです。

```text
prisma/migrations/20261014045843_init_project_talent_internal_models/
```

### Prisma Clientを生成する

```powershell
npx prisma generate
```

SchemaからPrisma Clientを生成します。Schema変更後や依存関係を再インストールした後に実行します。

## 動作確認

次のコマンドを順番に実行します。

```powershell
npm run build
npm run lint
npm test
```

すべて終了コード0で完了すれば、TypeScriptの型チェック、lint、テストが成功しています。現在のテストは`tests/schemas.test.ts`にあります。

## Prisma Studio

```powershell
npx prisma studio
```

開発用DBのテーブルとデータをブラウザで確認するためのツールです。SchemaやMigrationの反映確認、開発用データの閲覧に使用します。本番DBや実データに対して不用意な変更を行わないでください。

## 開発ルール

- 作業は原則として`Tsuyuzaki`から目的別ブランチを作成して行う
- `main`へ直接pushしない
- `schema.prisma`変更後は`npx prisma format`と`npx prisma validate`を実行する
- DB構造を変更するときはMigrationを作成する
- `prisma/migrations/`とMigration LockはGit管理対象に含める
- `.env`、APIキー、パスワード、メール本文はコミットしない
- Migration適用前に`DATABASE_URL`が開発用DBを指していることを確認する
- build・lint・testが成功してからコミットする
- 既存DBの削除、初期化、強制リセットを行わない

## Git運用の基本手順

```powershell
git pull --ff-only
```

作業後、Schemaを変更した場合は次を実行します。

```powershell
npx prisma format
npx prisma validate
npx prisma migrate dev --name <変更内容>
npx prisma generate
npm run build
npm run lint
npm test
```

確認後に変更をコミットし、レビュー対象のブランチへpushします。

```powershell
git status
git add .
git commit -m "変更内容"
git push origin <作業ブランチ>
```

Migrationファイルは必ずコミットに含めます。`.env`や`node_modules`は含めません。

## 新しい開発者向けチェックリスト

```powershell
git clone https://github.com/GUROBU-0518/Case_matching.git
Set-Location Case_matching
git switch Tsuyuzaki
npm ci
Copy-Item .env.example .env
```

その後、`.env`へローカルの`DATABASE_URL`を設定し、PostgreSQLを起動します。

```powershell
npx prisma migrate dev
npx prisma generate
npm run build
npm run lint
npm test
```

共有済みMigrationをそのまま適用するだけの環境では、Migration履歴に応じて`npx prisma migrate deploy`を使用します。開発環境で新しいMigrationを作成する場合は`migrate dev`を使用してください。

## よくあるエラー

### P3014 / Shadow Database作成権限不足

`prisma migrate dev`は差分確認のためShadow Databaseを作成します。DBユーザーにデータベース作成権限がない場合、P3014が発生します。

対処方法は、管理者に開発用ユーザーの権限設定を依頼するか、プロジェクトで定めたShadow Databaseを設定することです。管理者パスワードをソースコードや`.env.example`へ記載しないでください。

### PostgreSQL未起動

接続エラーが出た場合は、PostgreSQLサービスが起動しているか確認し、`DATABASE_URL`のホスト、ポート、DB名、ユーザー名を確認します。

### DATABASE_URLの誤り

`.env`が存在するか、接続先が開発用DBか、パスワードに不要な空白や特殊文字の問題がないか確認します。実際の値をログやIssueへ貼り付けないでください。

### `prisma generate`忘れ

Clientの型やモデルが見つからない場合は、次を実行します。

```powershell
npx prisma generate
```

### Migration競合・Schema差分

まず`git status`、`git pull`、`npx prisma migrate status`を確認します。既存Migrationを削除・書き換えず、競合内容を確認してから対応してください。

## 現在の実装範囲

| 実装済み | 未実装 |
|---|---|
| TypeScript・Zod共通基盤 | Microsoft Graph API接続 |
| PostgreSQL接続設定 | メール取得バッチ |
| Prisma Client | OpenAI分類・抽出 |
| Projectモデル | Repositoryの業務CRUD |
| Talentモデル | Web API |
| MailMessageモデル | ログイン画面 |
| AiProcessingモデル | 案件一覧・マッチング画面 |
| BatchRunモデル | 本番環境のMigration運用 |
| Relation・外部キー |  |
| Unique・Index |  |
| 初回Migration |  |
| build・lint・test |  |

## 今後の開発予定

1. T03：Microsoft Graph API接続
2. メール取得処理と同期管理
3. AIによるメール分類
4. 案件・人材情報の抽出
5. Repositoryと業務CRUD
6. Web API
7. 案件一覧・人材・マッチング画面
8. 本番環境のMigration・運用設計

実装範囲や順序を変更する場合は、要件定義書と実装ステップを確認してから合意を取ってください。
