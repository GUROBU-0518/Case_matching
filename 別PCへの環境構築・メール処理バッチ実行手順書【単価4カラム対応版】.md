# 案件・人材マッチングシステム
# 別PCへの環境構築・メール処理バッチ実行手順書【単価4カラム対応版】

## 1. 目的

新しいWindows PCに案件・人材マッチングシステムを構築する。

最終的な目標は、次の処理を手動で1回実行できる状態にすること。

1. Microsoft Graph APIからOutlookメールを取得する
2. メール本文を前処理する
3. OpenAI APIで案件・人材・その他に分類する
4. 案件・人材の情報を抽出する
5. PostgreSQLに情報を登録する
6. Webアプリで登録結果を閲覧・検索する

今回はWindowsタスクスケジューラーを使用しない。

### 今回の更新内容

以前の手順書から、以下を更新した。

- GitHubの取得対象を `Tsuyuzaki` ブランチに変更
- 最新コミット `97904bc` を基準とする
- 案件単価を `unit_price_min` / `unit_price_max` の2カラムに変更
- 人材希望単価を `desired_price_min` / `desired_price_max` の2カラムに変更
- 単価4カラム化Migrationを構築手順に反映
- 旧単価文字列を保持する仕様を明記
- 新しい単価検索の仕様を追記
- 既存データの移行コマンドを追記

---

## 2. 作業開始前の準備

以下を用意する。

- GitHubリポジトリのURLとアクセス権限
- `Tsuyuzaki` ブランチのソースコード
- `n02_kanto_master_safe.sql`
- Microsoft Graph APIの認証設定情報
- メール取得を許可された対象メールボックス
- OpenAI APIキーと利用モデルの設定情報
- PostgreSQLに設定するパスワード

認証情報は管理者から安全な方法で受け取る。

パスワードやAPIキーをGitHubに登録しない。

### 現在のGitHub情報

| 項目 | 内容 |
|---|---|
| ブランチ | `Tsuyuzaki` |
| コミット | `97904bc` |
| コミット内容 | Add price range columns and matching support |
| プッシュ先 | `origin/Tsuyuzaki` |
| 単価4カラム化 | 実装済み |
| 自動テスト | 173件成功 |
| TypeScriptビルド | 成功 |

注意：

- `main` に今回の変更がマージされたことは確認できていない。
- この手順書では `Tsuyuzaki` を使用する。
- AI_MAX_CALLS関連の未コミット変更は、このコミットに含まれていない。
- `local-data/` やDBバックアップもGitHubには含まれていない。

---

## 3. Git・Node.js・PostgreSQLをインストール

以下の公式サイトからインストールする。

Git：

https://git-scm.com/downloads/win

Node.js：

https://nodejs.org/en/download

PostgreSQL：

https://www.postgresql.org/download/windows/

### インストール時の注意

- Git：標準設定でインストール
- Node.js：現在のPCと互換性のあるバージョンを使用する
- PostgreSQL：18系をインストール
- PostgreSQLのポート：5432
- PostgreSQL管理者ユーザー：postgres
- PostgreSQLのパスワード：新しく設定して保管する

Node.jsは、プロジェクト内で使用している以下のオプションに対応している必要がある。

- `--env-file-if-exists`
- `--experimental-strip-types`

元PCのNode.jsバージョンは以下で確認する。

```bat
node -v
npm -v
```

新PCでも同じバージョンを使用することを推奨する。

PostgreSQLのインストール後、Stack Builderなどを使用してPostgreSQL 18対応のPostGISもインストールする。

---

## 4. GitHubからソースコードを取得

ここからはWindowsのコマンドプロンプトで実行する。

作業フォルダを作成する。

```bat
cd /d "%USERPROFILE%"
if not exist projects mkdir projects
cd projects
```

GitHubの `Tsuyuzaki` ブランチを取得する。

```bat
git clone -b Tsuyuzaki <リポジトリURL>
```

取得したフォルダに移動する。

```bat
cd <リポジトリのフォルダ名>
```

ブランチを確認する。

```bat
git branch --show-current
```

期待する表示：

```text
Tsuyuzaki
```

コミットを確認する。

```bat
git log -1 --oneline
```

今回の基準コミット：

```text
97904bc Add price range columns and matching support
```

必要なライブラリをインストールする。

```bat
npm ci
```

以降のnpmコマンドは、このプロジェクトフォルダで実行する。

---

## 5. PostgreSQLにDBを作成

コマンドプロンプトで実行する。

```bat
"C:\Program Files\PostgreSQL\18\bin\psql.exe" -h localhost -p 5432 -U postgres -d postgres
```

PostgreSQLの管理者パスワードを入力する。

接続後、以下のSQLを実行する。

```sql
CREATE DATABASE case_matching_dev
WITH ENCODING 'UTF8'
TEMPLATE template0;
```

既に同名のDBが存在する場合は作成せず、管理者に確認する。

作成したDBへ接続する。

```sql
\c case_matching_dev
```

PostGISを有効化する。

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
```

---

## 6. アプリ用DBユーザーを作成

引き続きPostgreSQLの画面で実行する。

ここでは新しいユーザー名を `case_matching_app` とする。

```sql
CREATE ROLE case_matching_app
WITH LOGIN PASSWORD 'ここに新しい強いパスワード';
```

DBへの接続権限を付与する。

```sql
GRANT CONNECT ON DATABASE case_matching_dev
TO case_matching_app;
```

アプリ用スキーマへの権限を付与する。

```sql
GRANT USAGE, CREATE ON SCHEMA public
TO case_matching_app;
```

### Prisma Migrationに関する注意

今回の構築では、PostgreSQLの管理者ユーザー `postgres` を使用してMigrationを適用する方法を採用する。

アプリ用ユーザーには、後述の手順で必要なテーブル権限を付与する。

PostgreSQLを終了する。

```sql
\q
```

---

## 7. 環境変数を設定

プロジェクトフォルダに `.env.example` がある場合、コピーする。

```bat
copy .env.example .env
```

`.env.example` が存在しない場合は、管理者から設定項目の一覧を受け取って `.env` を作成する。

編集する。

```bat
notepad .env
```

### DB接続情報

初期構築とMigration実行時は、管理者ユーザーを使用する。

設定例：

```dotenv
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/case_matching_dev?schema=public"
```

`YOUR_PASSWORD` は実際のパスワードに変更する。

パスワードにURLの予約文字を含む場合はURLエンコードする。

Migration完了後、アプリ用ユーザーに必要な権限を付与し、接続先を切り替える。

### Microsoft Graph API

以下の情報を設定する。

- テナントID
- アプリケーションID（クライアントID）
- クライアントシークレット
- 取得対象メールボックス
- 必要なGraph APIアクセス権限

### OpenAI API

以下の情報を設定する。

- APIキー
- 使用モデル
- API呼び出し上限などのバッチ設定

### 現在使用する主な環境変数

```dotenv
DATABASE_URL=
GRAPH_TENANT_ID=
GRAPH_CLIENT_ID=
GRAPH_CLIENT_SECRET=
GRAPH_MAILBOXES=
OPENAI_API_KEY=
OPENAI_MODEL=
AI_MAX_CALLS=
```

値は管理者から受け取る。

注意：

- `AI_MAX_CALLS` に関する未コミット変更は今回のGitHubコミットに含まれていない。
- 実際に有効な上限設定と挙動は、新PCで取得したコードを確認する。
- 企業側のMicrosoft Graph API利用許可が必要。
- `.env` はGitHubへコミットしない。

---

## 8. Prismaでアプリ用テーブルを作成

プロジェクトフォルダで実行する。

最初にスキーマを確認する。

```bat
npx prisma validate
```

Migrationの状態を確認する。

```bat
npx prisma migrate status
```

接続先が次のDBであることを確認する。

```text
case_matching_dev
```

続いてMigrationを適用する。

```bat
npx prisma migrate deploy
```

今回のGitHubコミットには、単価4カラム化Migrationが含まれている。

```text
20261026130000_add_unit_price_ranges
```

このMigrationにより、次の4カラムが追加される。

| テーブル | 追加カラム | 型 |
|---|---|---|
| projects | unit_price_min | INTEGER / NULL可 |
| projects | unit_price_max | INTEGER / NULL可 |
| talents | desired_price_min | INTEGER / NULL可 |
| talents | desired_price_max | INTEGER / NULL可 |

続いてPrisma Clientを生成する。

```bat
npx prisma generate
```

再度スキーマを検証する。

```bat
npx prisma validate
```

エラーが出なければ次へ進む。

**注意：`prisma migrate reset` は実行しない。**

---

## 9. アプリ用DBユーザーの権限を設定

管理者ユーザーでDBに接続する。

```bat
"C:\Program Files\PostgreSQL\18\bin\psql.exe" -h localhost -p 5432 -U postgres -d case_matching_dev
```

アプリ用ユーザーに権限を付与する。

```sql
GRANT USAGE ON SCHEMA public
TO case_matching_app;

GRANT SELECT, INSERT, UPDATE, DELETE
ON ALL TABLES IN SCHEMA public
TO case_matching_app;

GRANT USAGE, SELECT
ON ALL SEQUENCES IN SCHEMA public
TO case_matching_app;
```

将来追加されるテーブルにも同様の権限を適用したい場合は、テーブル作成者に応じた `ALTER DEFAULT PRIVILEGES` の設定が別途必要になる。

終了する。

```sql
\q
```

`.env` のDB接続先をアプリ用ユーザーに変更する。

```dotenv
DATABASE_URL="postgresql://case_matching_app:YOUR_PASSWORD@localhost:5432/case_matching_dev?schema=public"
```

DB接続を確認する。

```bat
npx prisma migrate status
```

Migrationがすべて適用済みと表示されれば、次へ進む。

---

## 10. 駅マスタを登録

現在のPCから次のSQLファイルを新PCへコピーする。

```text
n02_kanto_master_safe.sql
```

コピー先はプロジェクトフォルダの直下とする。

コマンドプロンプトで次を実行する。

```bat
set PGCLIENTENCODING=UTF8
```

続いて駅マスタを投入する。

```bat
"C:\Program Files\PostgreSQL\18\bin\psql.exe" -h localhost -p 5432 -U postgres -d case_matching_dev -X -v ON_ERROR_STOP=1 -f "n02_kanto_master_safe.sql"
```

このSQLは初期登録用なので、同じDBに繰り返し実行しない。

登録される主なテーブルは以下の3つ。

| テーブル | 期待件数 |
|---|---:|
| n02_station_record | 2,686 |
| n02_station_group | 2,236 |
| n02_railroad_section | 5,752 |

---

## 11. 駅マスタのアクセス権限を設定

管理者ユーザーで接続する。

```bat
"C:\Program Files\PostgreSQL\18\bin\psql.exe" -h localhost -p 5432 -U postgres -d case_matching_dev
```

以下を実行する。

```sql
GRANT USAGE ON SCHEMA station_match
TO case_matching_app;

GRANT SELECT ON ALL TABLES IN SCHEMA station_match
TO case_matching_app;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA station_match
TO case_matching_app;
```

これでアプリ用ユーザーが駅マスタと距離計算関数を利用するための基本的な権限を設定できる。

PostgreSQLを終了する。

```sql
\q
```

---

## 12. 単価4カラム化の仕様

今回の更新で、案件単価と人材希望単価を数値として管理できるようにした。

単位は「万円/月」。

### 12-1. 案件単価

| カラム | 内容 |
|---|---|
| unit_price_min | 案件単価の下限 |
| unit_price_max | 案件単価の上限 |
| rate | 従来の単価文字列（保持） |

### 12-2. 人材希望単価

| カラム | 内容 |
|---|---|
| desired_price_min | 希望単価の下限 |
| desired_price_max | 希望単価の上限 |
| desiredRate | 従来の希望単価文字列（保持） |

※ `desiredRate` はPrisma側のフィールド名。DB上の物理カラム名はスキーマ定義に従う。

### 12-3. 単価の変換ルール

| 元の記載 | 数値への変換 |
|---|---|
| 40～50万円 | min=40、max=50 |
| 80万円（案件） | min=NULL、max=80 |
| 80万円（人材） | min=80、max=NULL |
| 80万円以上 | min=80、max=NULL |
| 80万円以下 | min=NULL、max=80 |
| 応相談 | min=NULL、max=NULL |
| 不明 | min=NULL、max=NULL |
| 80万円程度 | min=NULL、max=NULL |
| 91.5万円 | min=NULL、max=NULL |

小数点のある金額は整数に丸めない。

不明な数値をAIが推測して補完しない。

### 12-4. 単価検索の仕様

案件に対して人材を検索する際、金額フィルタを有効にした場合は以下を比較する。

```text
人材希望単価の下限 <= 案件単価の上限
```

具体的には次の条件を満たす必要がある。

- `unit_price_max` がNULLではない
- `desired_price_min` がNULLではない
- `desired_price_min <= unit_price_max`

NULLを無制限として扱わない。

金額フィルタを使用しない場合は、単価がNULLという理由だけで人材を除外しない。

AIによる数値スコアやランキングは使用しない。

---

## 13. 既存単価データの移行

この章は、既存の案件・人材データを持つDBを使用する場合のみ実施する。

**今回のように新しい空のDBを構築する場合は、この章を飛ばしてよい。**

まずdry-runを実行する。

```bat
npm run db:migrate-price-ranges
```

これはデータを変更せず、変換できる件数を確認するコマンド。

問題がなければ実際の移行を実行する。

```bat
npm run db:migrate-price-ranges -- --execute
```

### 元PCでの実行結果

```json
{
  "mode": "execute",
  "projects": {
    "total": 7,
    "candidates": 7,
    "convertible": 0
  },
  "talents": {
    "total": 11,
    "candidates": 11,
    "convertible": 3
  }
}
```

元PCでは案件7件が変換できず、人材3件が変換可能だった。

変換できない単価文字列は旧カラムに保持される。

このため、既存データを引き継いだ場合、金額フィルタで一部の案件・人材が検索対象にならない可能性がある。

なお、元PCで作成したバックアップ：

```text
C:\db-backups\case_matching_dev_backup.dump
```

は単価4カラム化Migrationより前に取得されたものである。

そのバックアップを復元する場合は、復元後にMigrationと既存単価データ移行を行う。

---

## 14. メール取得・AI処理・DB登録を実行する

### 14-1. 環境変数を確認する

プロジェクト直下の `.env` に以下を設定する。

- `DATABASE_URL`
- `GRAPH_TENANT_ID`
- `GRAPH_CLIENT_ID`
- `GRAPH_CLIENT_SECRET`
- `GRAPH_MAILBOXES`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `AI_MAX_CALLS`

各設定値は管理者から受け取る。

### 14-2. バッチを1回実行する

Windowsのコマンドプロンプトを開き、プロジェクトフォルダで以下を実行する。

```bat
npm run graph:batch -- --execute --ai
```

想定する処理の流れ：

1. Microsoft Graph APIからメールを差分取得する
2. メール本文を前処理する
3. メールと処理履歴をPostgreSQLに保存する
4. OpenAI APIでメールを分類する
5. 案件・人材の情報を抽出する
6. 抽出結果を検証する
7. 案件・人材情報をDBに登録する
8. 処理が終了したら自動停止する

### 14-3. 今回の単価4カラム化との関係

新しく取得したメールに単価情報が含まれる場合、AIは従来の単価文字列に加えて、以下の数値情報を抽出する設計になっている。

案件：

```text
unit_price_min
unit_price_max
```

人材：

```text
desired_price_min
desired_price_max
```

不明な項目はNULLとして保存する。

旧単価文字列も保持する。

### 14-4. 実行時の注意

- 初回は対象メールボックスと取得範囲を確認する
- API呼び出し上限を確認する
- バッチ実行中に同じコマンドを重複実行しない
- エラー発生時は原因を確認してから再実行する
- Windowsタスクスケジューラーは設定しない
- 実行前に `package.json` とバッチの実装を確認する

**重要：`graph:batch -- --execute --ai` が現在のコミットで一連の処理をすべて実行できるかは、実機での最終確認が必要。**

また、Microsoft Graph APIとOpenAI APIを使用するため、実行時には実際のAPI呼び出しが発生する。

---

## 15. Webアプリを起動

プロジェクトフォルダで実行する。

```bat
npm run start
```

以前確認した `package.json` では、`start` がWebサーバー起動用のコマンドになっている。

```text
node --experimental-strip-types src/web/server.ts
```

コマンドプロンプトに表示されたURLをブラウザで開く。

通常は以下のようなURLを使用する。

```text
http://localhost:3000
```

実際のポート番号はWebサーバーの設定に従う。

### 確認する画面

- 案件一覧
- 人材一覧
- 案件詳細
- 人材詳細
- 案件からの人材検索
- 単価フィルタを使用した検索

### 単価表示の確認

新しい数値カラムに単価が保存されている場合は、その情報を表示する。

数値カラムがNULLの場合は、従来の単価文字列を表示する設計。

---

## 16. テスト・ビルドを実行

プロジェクトフォルダで実行する。

```bat
npm test
```

元PCでの結果：

```text
Test Files 32 passed (32)
Tests      173 passed (173)
```

続いてビルドを確認する。

```bat
npm run build
```

今回のプロジェクトでは、確認済みの `build` コマンドはTypeScriptの型チェックを実行する。

```text
tsc --noEmit
```

エラーがなければ成功。

---

## 17. 最終確認

作業が完了したら、次の項目を確認する。

- [ ] GitHubの `Tsuyuzaki` ブランチを取得できた
- [ ] 最新の単価4カラム化Migrationが適用されている
- [ ] PostgreSQLのテーブルが作成されている
- [ ] `unit_price_min` が存在する
- [ ] `unit_price_max` が存在する
- [ ] `desired_price_min` が存在する
- [ ] `desired_price_max` が存在する
- [ ] 駅マスタが登録されている
- [ ] 駅マスタのアクセス権限が設定されている
- [ ] Microsoft Graph APIでメールを取得できる
- [ ] AIによる分類・情報抽出が成功する
- [ ] 案件または人材の情報がDBに登録される
- [ ] Webアプリで登録結果を確認できる
- [ ] 単価フィルタが動作する
- [ ] 自動テストが成功する
- [ ] TypeScriptビルドが成功する
- [ ] バッチが1回実行した後に正常終了する

DBが空の状態でWebアプリを起動した場合、案件・人材一覧が0件でも異常ではない。

---

## 18. 作業上の注意事項

- 今回はタスクスケジューラーを設定しない
- メール取得・AI処理は手動で実行する
- 初回バッチを実行する前に対象メールボックスと処理件数を確認する
- 同じメールボックスを複数PCで取得する場合、DBごとに同期履歴が異なることに注意する
- APIキーやDBパスワードをGitHubへ登録しない
- DBバックアップや実メールデータをGitHubへ登録しない
- エラー時にバッチを何度も実行しない
- 既存DBを削除・初期化するコマンドは使用しない
- `main` ブランチへ勝手にマージしない
- AI_MAX_CALLS関連の未コミット変更がGitHubに含まれていないことに注意する

---

## 19. 今回の開発で完了した内容

### DB関連

- 案件単価の下限・上限カラム追加
- 人材希望単価の下限・上限カラム追加
- Prismaスキーマ更新
- Migration作成
- 元PCでMigration適用成功
- 既存単価データ移行コマンド作成・実行

### AI関連

- 単価範囲の抽出に対応
- JSON Schema更新
- Zod検証更新
- 旧単価文字列の保持

### 検索関連

- 案件上限単価と人材希望下限単価の比較
- NULLを無制限として扱わない
- 金額フィルタなしの場合はNULLを理由に除外しない

### 表示関連

- 新単価カラムの表示に対応
- 旧単価文字列へのフォールバック表示

### GitHub

- ブランチ：`Tsuyuzaki`
- コミット：`97904bc`
- プッシュ：成功
- 単価4カラム化関連12ファイルをコミット

---

## 20. 現在の残課題

以下は実装・検証が完了したとは判断していない項目。

1. 既存案件7件の単価文字列が新カラムへ変換できていない
2. 実際のWeb画面での単価フィルタ動作確認
3. 新規メールでの単価抽出・DB保存の実API確認
4. 新PCでのMicrosoft Graph API認証確認
5. 新PCでのメール取得からDB登録までの一括実行確認
6. AI_MAX_CALLS関連の未コミット変更の扱い
7. `main` ブランチへの統合（必要な場合のみ）

---

## 21. 最終結論

この手順書は、2026年10月26日時点の `Tsuyuzaki` ブランチ、コミット `97904bc` を基準としている。

前回の手順書との最大の違いは、案件・人材の単価を4つの数値カラムで管理するようになったことである。

新PCでは、最新のPrisma Migrationを適用することで、単価4カラムを含むDB構造を作成できる。

ただし、メール取得・AI処理・DB登録の一括実行については、新PCで実際に動作確認する必要がある。

今回は既存DBの移行ではなく、新しい空のDBを構築し、手動バッチを1回実行して動作確認することを基本方針とする。