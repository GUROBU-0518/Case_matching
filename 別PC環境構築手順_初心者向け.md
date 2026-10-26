# 案件・人材マッチングシステムを別のWindows PCに構築する手順

この手順では、新しいWindows PCにシステムを用意し、必要ならメール取得・AI処理を手動で1回実行します。**Windowsタスクスケジューラーによる自動実行は設定しません。**

> **注意**: メール取得とAI処理を行うと、Microsoft Graph APIとOpenAI APIに実際のリクエストが送られ、利用料が発生する場合があります。最初は管理者に対象メールボックスと実行許可を確認してください。

## まず全体の流れ

1. 必要なソフトをインストールする
2. GitHubへ統合済みの`main`ブランチを取得する
3. 空の開発用PostgreSQLデータベースを作る
4. `.env`を作成して接続情報を設定する
5. Prisma Migrationを適用する
6. 駅マスタを登録する
7. 必要なら既存の単価文字列を新しい数値カラムへ移行する
8. テストとビルドを確認する
9. Webアプリを開く
10. 許可を得た場合だけ、メール処理バッチを手動で実行する

## 1. 作業前に用意するもの

- GitHubリポジトリのURLとアクセス権
- Microsoft Graphの設定値と、メールボックスを読み取る許可
- OpenAI APIキーと使用モデルの設定値
- PostgreSQL用のパスワード
- `n02_kanto_master_safe.sql`（GitHubから取得できない場合に限り、管理者から安全に受け取る）

### `main`ブランチの公開状態を確認する

この手順では`main`ブランチを使います。先ほどの`Tsuyuzaki`から`main`への統合はローカルで完了していますが、GitHubへのプッシュはまだ行われていません。そのため、GitHub上の`main`に単価4カラム化など必要な変更がまだ含まれていない可能性があります。

別PCで作業を始める前に、管理者が統合済みの`main`をGitHubへ反映したことを確認してください。反映前に取得すると、必要な機能やMigrationが不足することがあります。`main`へのプッシュが完了していない場合は、環境構築を先へ進めず管理者に確認してください。

APIキー、パスワード、`.env`ファイルをチャットやGitHubに貼り付けないでください。設定値は管理者から安全な方法で受け取ります。

## 2. ソフトをインストールする

次の公式サイトからWindows版を入手します。

- Git: <https://git-scm.com/downloads/win>
- Node.js: <https://nodejs.org/en/download>
- PostgreSQL for Windows: <https://www.postgresql.org/download/windows/>

PostgreSQLはプロジェクトが使うバージョンに合わせます。元の環境ではPostgreSQL 18系が使われています。PostgreSQL 18対応のPostGISもインストールしてください。対応版が分からない場合は、互換性を確認せずに別バージョンを入れないでください。

インストール後、コマンドプロンプトを開いて次を実行し、バージョンが表示されることを確認します。

```bat
git --version
node -v
npm -v
```

## 3. GitHubの`main`からプロジェクトを取得する

1. Windowsのスタートメニューから「コマンド プロンプト」を開きます。
2. 次を1行ずつ入力します。

```bat
cd /d "%USERPROFILE%"
if not exist projects mkdir projects
cd projects
git clone -b main <管理者から受け取ったリポジトリURL>
```

`<管理者から受け取ったリポジトリURL>`の部分は、実際のURLに置き換えてください。山括弧は入力しません。

作成されたプロジェクトフォルダに移動します。フォルダ名は通常リポジトリ名です。

```bat
cd <リポジトリのフォルダ名>
git branch --show-current
git log -1 --oneline
npm ci
```

ブランチ表示が`main`であることを確認します。コミット番号は更新されるため、固定の番号だけで判断せず、管理者から「統合済み」と案内されたコミットであることを確認してください。単価4カラム化Migrationなどが含まれるか不明なら、セットアップを続ける前に管理者へ確認します。

以降のコマンドは、すべてこのプロジェクトフォルダで実行します。エクスプローラーでフォルダを開き、アドレス欄に`cmd`と入力してEnterを押すと、その場所を作業フォルダにしたコマンドプロンプトを開けます。

## 4. PostgreSQLに空の開発用DBを作る

次の手順は、新規PCに作った空のDB向けです。同名のデータベースがすでにある場合は、削除・作り直しをせず、そこで止めて管理者に確認してください。

コマンドプロンプトからPostgreSQLの画面を開きます。

```bat
"C:\Program Files\PostgreSQL\18\bin\psql.exe" -h localhost -p 5432 -U postgres -d postgres
```

パスワードを求められたら入力します（入力中は画面に文字が表示されない場合があります）。接続後、以下を実行します。

```sql
CREATE DATABASE case_matching_dev WITH ENCODING 'UTF8' TEMPLATE template0;
\c case_matching_dev
CREATE EXTENSION IF NOT EXISTS postgis;
\q
```

`case_matching_dev`が既に存在する、権限エラーが出る、PostGISを有効化できない場合は、そこで止めて管理者へ相談してください。

## 5. `.env`を作成する

プロジェクトフォルダで、見本ファイルをコピーします。

```bat
copy .env.example .env
notepad .env
```

`.env.example`がない場合は、管理者から必要な環境変数名を確認してください。値は安全な経路で受け取り、次の項目を設定します（実際の名称は`.env.example`と現在のソースコードを優先します）。

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

最初はメール処理を実行しないで、値の入力と保存だけ行います。`.env`は秘密情報を含むため、共有・送信・Git追加をしないでください。

## 6. Prismaのテーブルを作る

まず、`.env`の`DATABASE_URL`がこのPCの`localhost:5432/case_matching_dev`を指していることを確認します。パスワードを画面やチャットに表示しないでください。

プロジェクトフォルダで次を順番に実行します。

```bat
npx prisma validate
npx prisma migrate status
npx prisma migrate deploy
npx prisma generate
npx prisma validate
```

Migrationは既存DBの構造を更新します。**`prisma migrate reset`は絶対に実行しないでください。** `migrate status`で予想外のMigrationや接続先が表示されたら、deployを実行せず管理者に確認します。

このブランチに含まれる単価関連Migrationにより、次のNULLを許可する整数カラムが追加されます。単位は万円/月です。

| テーブル | カラム |
|---|---|
| `projects` | `unit_price_min`, `unit_price_max` |
| `talents` | `desired_price_min`, `desired_price_max` |

従来の単価文字列カラムは保持されます。

## 7. 駅マスタを登録する

プロジェクト直下に`n02_kanto_master_safe.sql`があるか確認します。ファイルがない場合は、管理者から受け取ってください。

> 駅マスタSQLはデータベースにテーブルとデータを追加します。`station_match`が既にある場合や、投入済みか分からない場合は実行せず、管理者に確認してください。同じSQLを繰り返し実行しないでください。

未投入であることと接続先が正しいことを確認した後、次を実行します。

```bat
set PGCLIENTENCODING=UTF8
"C:\Program Files\PostgreSQL\18\bin\psql.exe" -h localhost -p 5432 -U postgres -d case_matching_dev -X -v ON_ERROR_STOP=1 -f "n02_kanto_master_safe.sql"
```

途中でエラーになった場合は、むやみに再実行せず、エラー内容を管理者に確認してください。

### アプリ用DBユーザーを使う場合

アプリ用ユーザーを作るか、権限を付けるかは管理者の方針に従います。パスワードをSQL文へ直接書かず、`psql`の`\password ユーザー名`を使って対話入力してください。権限設定は管理者が確認して実施します。権限不足を解決するために、データベース全体へ安易に強い権限を付与しないでください。

初回セットアップでは、Migrationを実行できるDB所有者の接続先を使う必要があります。アプリ実行時の接続ユーザーと分ける場合は、Migration適用後に管理者と接続設定・必要権限を確認してください。

## 8. 既存の単価データを移す場合だけ実行する

新しく作った空DBなら、この章は飛ばします。

以前のDBデータを引き継いだ場合は、旧文字列単価を新しい数値カラムへ移せるか、まずdry-runで確認します。

```bat
npm run db:migrate-price-ranges
```

dry-runは書き込みをしません。件数や変換内容が想定どおりか管理者が確認してから、明示的な承認を得て次を実行します。

```bat
npm run db:migrate-price-ranges -- --execute
```

曖昧な値は新カラムへ推測で移さず、旧文字列に残します。承認がない場合や結果を判断できない場合は、executeを実行しません。

## 9. テストとビルドを確認する

```bat
npm test
npm run build
npx prisma validate
```

エラーが出た場合は、その画面を保存して管理者へ相談します。DB初期化やMigrationのやり直しで解決しようとしないでください。

## 10. Webアプリを開く

プロジェクトフォルダでWebサーバーを起動します。

```bat
npm run start
```

起動したコマンドプロンプトは閉じず、表示されたURLをブラウザで開きます。通常は次のURLです。

<http://localhost:3000>

開けない場合は、サーバー起動中のエラー、`.env`のDB接続設定、PostgreSQLサービスの状態を確認します。`localhost`はそのPC自身を指すため、別PCのブラウザからアクセスする場合は別途ネットワーク設定が必要です。

## 11. メール取得・AI処理を手動で1回実行する

この操作は実メールを取得し、Graph APIとOpenAI APIを呼び出し、DBへ保存する可能性があります。**管理者から実行許可を得て、対象メールボックス、AI呼び出し上限、ログ保存先を確認した後だけ**行ってください。

コマンドプロンプトでプロジェクトフォルダにいることを確認して、次を実行します。

```bat
npm run graph:batch -- --execute --ai
```

バッチは1回処理して終了する想定です。タスクスケジューラーはこの手順では登録しません。実行中に同じコマンドを重ねて起動しないでください。失敗時も原因を確認する前に繰り返し実行しないでください。

`AI_MAX_CALLS`の未設定時の挙動や上限はコード更新により変わる可能性があります。初回実行前に、現在のブランチの`package.json`、`.env.example`、AI上限設定を管理者と確認してください。

## 12. よくある確認ポイント

| 症状 | まず確認すること |
|---|---|
| `npm`や`node`が見つからない | Node.jsをインストールし、コマンドプロンプトを開き直す |
| DBに接続できない | PostgreSQLサービス、DB名、ポート、`.env`の接続設定を確認する |
| Prismaのエラー | 接続先を再確認し、エラー内容を管理者へ共有する。resetはしない |
| 駅マスタが見つからない | `station_match`への登録とアプリユーザーの読み取り権限を管理者に確認する |
| Web画面が空 | DBが新規ならデータ0件は正常な場合がある。バッチ実行前か確認する |
| メール処理が失敗した | ログを確認し、認証設定・権限・API上限を管理者に確認する。すぐ再実行しない |

## 13. 作業完了チェック

- [ ] GitHubへ統合済みの`main`ブランチを取得した
- [ ] `.env`を作り、秘密情報をGitに含めていない
- [ ] PostgreSQL 18と対応するPostGISを確認した
- [ ] 接続先が意図した`case_matching_dev`である
- [ ] Prisma MigrationとClient生成が成功した
- [ ] 必要な場合だけ駅マスタを一度登録した
- [ ] 必要な場合だけ単価データ移行を承認後に実行した
- [ ] テストとビルドが成功した
- [ ] Webアプリをブラウザで開けた
- [ ] メール処理は許可・設定確認後に手動で実行した
- [ ] Windowsタスクスケジューラーは設定していない
