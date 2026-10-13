# Case matching

SES案件・人材マッチングシステムの共通開発基盤です。T01では、共通型、Zodスキーマ、外部サービスとの契約、環境変数検証を提供します。

## 必要な環境

- Node.js 24.x（または `package.json` の `engines.node` を満たすNode.js）
- npm 11.x
- Git

## セットアップ（Windows PowerShell）

```powershell
git clone https://github.com/GUROBU-0518/Case_matching.git
Set-Location Case_matching
git switch main
npm ci
Copy-Item .env.example .env
```

`.env`にはローカル環境用の値だけを設定してください。実際のAPIキー、パスワード、メール本文はリポジトリやIssueへ保存しません。T01の型・テスト実行には本番の秘密情報は不要です。

## 開発コマンド

```powershell
npm run build
npm run lint
npm test
```

## ブランチ運用

作業は`feature/<task-id>-<name>`形式のブランチで行います。共通基盤の変更はレビュー後に代表者が`main`へ統合します。`main`へ直接pushせず、秘密情報や`node_modules`をコミットしません。

## トラブル確認

```powershell
node --version
npm --version
git status --short --branch
npm ci
```

依存関係の再現には`npm install`ではなく、lockファイルを使う`npm ci`を使用してください。認証情報や実データを追加せず、エラー内容とNode.js/npmのバージョンを共有してください。
