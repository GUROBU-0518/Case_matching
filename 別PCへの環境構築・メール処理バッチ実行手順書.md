# 案件・人材マッチングシステム
# 別PCへの環境構築・メール処理バッチ実行手順書

## 1. 目的

新しいWindows PCに案件・人材マッチングシステムを構築する。

最終的な目標は、次の処理を手動で1回実行できる状態にすること。

1. Microsoft Graph APIからOutlookメールを取得する
2. メール本文を前処理する
3. OpenAI APIで案件・人材・その他に分類する
4. 案件・人材の情報を抽出する
5. PostgreSQLに情報を登録する
6. Webアプリで登録結果を閲覧・検索する

Windowsタスクスケジューラーは使用しない。

**注意：現在のコードで上記1～5を単一コマンドで実行できるかは未確認。最終的にmainのバッチ実装を確認する必要がある。**

---

## 2. 作業開始前の準備

以下を用意する。

- GitHubリポジトリのURLとアクセス権限
- 必要な変更がすべてマージされたmainブランチ
- `n02_kanto_master_safe.sql`
- Microsoft Graph APIの認証設定情報
- メール取得を許可された対象メールボックス
- OpenAI APIキーと利用モデルの設定情報
- PostgreSQLに設定するパスワード

認証情報は管理者から安全な方法で受け取る。パスワードやAPIキーをGitHubに登録しない。

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
- Node.js：現在のPCと同じメジャーバージョンを使用する。既存コードの `--env-file-if-exists` と `--experimental-strip-types` に対応する必要がある
- PostgreSQL：18系をインストール
- PostgreSQLのポート：5432
- PostgreSQL管理者ユーザー：postgres
- PostgreSQLのパスワード：新しく設定して保管する

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

GitHubのmainブランチを取得する。

```bat
git clone -b main <リポジトリURL>
```

取得したフォルダに移動する。

```bat
cd <リポジトリのフォルダ名>
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

**重要：Prismaのマイグレーションをこのユーザーで実行するには、マイグレーションの内容に応じた追加権限が必要になる場合がある。** 例えば拡張機能やシャドーDB、オブジェクト所有権に関する操作が含まれている場合は、管理者が設定を調整する。

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

DB接続情報の設定例：

```dotenv
DATABASE_URL="postgresql://case_matching_app:YOUR_PASSWORD@localhost:5432/case_matching_dev?schema=public"
```

`YOUR_PASSWORD` は実際のパスワードに変更する。URLの予約文字を含む場合はURLエンコードする。

さらに、現在のmainの実装に従って、以下の情報を設定する。

### Microsoft Graph API

- テナントID
- アプリケーションID（クライアントID）
- 認証に必要なシークレットまたは証明書等
- 取得対象メールボックス
- 必要なGraph APIアクセス権限

### OpenAI API

- APIキー
- 使用モデル
- API呼び出し上限などのバッチ設定

**実際の環境変数名は、mainのソースコードまたは設定テンプレートに合わせる。ここに書いた項目名は説明用であり、変数名ではない。**

また、企業側のMicrosoft Graph API利用許可が必要。認証情報だけがあっても、権限がなければメールを取得できない。

`.env` はGitHubへコミットしない。

---

## 8. Prismaでアプリ用テーブルを作成

プロジェクトフォルダで実行する。

```bat
npx prisma migrate deploy
```

このコマンドにより、GitHubのmainに含まれるマイグレーションが適用される。

既存の案件・人材・メール・処理履歴などのテーブルやカラムを作成する。

続いてPrisma Clientを生成する。

```bat
npm run db:generate
```

エラーが出なければ次へ進む。

**注意：`prisma migrate reset` は実行しない。**

---

## 9. 駅マスタを登録

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

## 10. 駅マスタのアクセス権限を設定

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

## 11. メール取得・AI処理の実行設定

今回確認できたコマンドは以下のとおり。

### Microsoft Graphのメール取得バッチ

```bat
npm run graph:batch
```

### 保存済みメールのAI処理

```bat
npm run ai:stored
```

ただし、`graph:batch` がAI分類・抽出・DB登録まで一括で行うかは、コマンド一覧だけでは確認できない。

**そのため、両方のコマンドを無条件で連続実行しない。** 二重処理や予期しないAPI利用を防ぐため、mainのバッチ実装を確認してから正式な実行方法を決定する。

また、初回のメール取得対象期間、取得件数、API呼び出し上限、再実行時の重複防止処理も確認する。

今回の目標は、最終的に次の1行で処理を1周させること。

```bat
npm run <正式な一括バッチコマンド>
```

※このコマンドはプレースホルダーであり、まだ実行できない。mainに既存の一括コマンドがなければ、既存処理を安全にまとめるスクリプトの追加が必要。

**バッチ実行は、認証設定と処理内容を確認した後、許可されたメールボックスに対して1回だけ実施する。**

---

## 12. Webアプリを起動

プロジェクトフォルダで実行する。

```bat
npm run start
```

今回確認した `package.json` では、`start` がWebサーバー起動用のコマンドになっている。

```text
node --experimental-strip-types src/web/server.ts
```

コマンドプロンプトに表示されたURLをブラウザで開く。

通常は `http://localhost:3000` などを使用するが、実際のポート番号はWebサーバーの設定に従う。

---

## 13. 最終確認

作業が完了したら、次の項目だけ確認する。

- [ ] Webアプリが起動し、画面を表示できる
- [ ] PostgreSQLのテーブルが作成されている
- [ ] 駅マスタが登録され、距離計算に利用できる
- [ ] Microsoft Graph APIでメールを取得できる
- [ ] AIによる分類・情報抽出が成功する
- [ ] 案件または人材の情報がDBに登録される
- [ ] Webアプリで登録結果を確認できる
- [ ] バッチが1回実行した後に正常終了する

DBが空の状態でWebアプリを起動した場合、案件・人材一覧が0件でも異常ではない。

---

## 14. 作業上の注意事項

- 今回はタスクスケジューラーを設定しない
- メール取得・AI処理は手動で実行する
- 初回バッチを実行する前に対象メールボックスと処理件数を確認する
- 同じメールボックスを複数PCで取得する場合、DBごとに同期履歴が異なることに注意する
- APIキーやDBパスワードをGitHubへ登録しない
- DBバックアップや実メールデータをGitHubへ登録しない
- エラー時にバッチを何度も実行しない
- 既存DBを削除・初期化するコマンドは使用しない

---

## 15. 最終版にするための確認事項

本手順書で、Webアプリ・PostgreSQL・Prisma・PostGIS・駅マスタの基本的な構築手順は整理できている。

ただし、メール取得からDB登録までをコマンド1つで実行するためには、以下の確認が必要。

1. `graph:batch` が実際にどこまで処理するか
2. `ai:stored` との役割分担
3. Graph API・OpenAI APIの正式な環境変数名
4. mainにマージされた最新のDBマイグレーション
5. 一括バッチ実行時の安全な呼び出し方法

**これらが確認できるまでは、メール処理バッチの設定・実行部分は未確定とする。**