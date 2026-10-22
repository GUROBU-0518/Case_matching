# AIプロンプトの編集方法

`classification.md`は分類ルール、`extraction.md`は案件・人材の抽出項目と不明値の扱いを定義します。

VS Codeではプロジェクトルートの`prompts`フォルダを開き、対象ファイルを編集します。メモ帳では次のように開けます。

```powershell
notepad .\prompts\classification.md
notepad .\prompts\extraction.md
```

変更は次回のバッチ起動時に読み込まれます。1回のバッチ中は起動時に読み込んだ内容を固定します。

JSON Schemaのフィールド名、配列構造、`classification`の値、`affiliationType`の値はプロンプトで変更しないでください。変更後は`npm test -- --run`、`npm run build`、`npm run lint`を実行してください。

問題があった場合はGitで変更前のMarkdownへ戻すか、バックアップしたファイルを復元してください。プロンプトファイルがない、または空の場合は有料APIを呼び出さずにエラーになります。
