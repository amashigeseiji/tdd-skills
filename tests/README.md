# スクリプトのテスト

語彙照合スクリプト（`tdd-vocab/scripts/`・`bin/`）の回帰テスト。
依存パッケージはなく、Node 標準のテストランナーだけで動く。

```bash
node --test tests/*.test.js
```

## 構成

- `*.test.js` — スクリプトごとのテスト
- `helpers.js` — スクリプトを子プロセスで実行するヘルパー
- `fixtures/<name>/` — 語彙照合の入力になる小さなリポジトリ（`.claude/tdd/config.json` +
  `docs/dictionary.json` + 実装 + テストディレクトリ）

スクリプトはトップレベルで実行して `process.exit()` するので、`require` せず子プロセスで走らせ、
終了コードと出力を検査する。

読み取りだけのスクリプト（`check-vocab.js`）はフィクスチャの場所で直接実行する
（走査対象を git の可視ファイルから決める経路を通すため）。
書き込みを伴うスクリプト（`dict-write.js`・`generate-map.js`）は `copyFixture()` で
一時ディレクトリに複製してから実行する。

## フィクスチャ

- `vocab-basic` — JS。正常系のほか、`@vocab` 行に注記を続けた行・`src` の指す先に注釈がない概念・
  注釈が別ファイルにある概念・実装装置を持たない `application` の概念を1つずつ含む
- `vocab-swift` — Swift。`/// @vocab` を走査対象として拾えることの確認用

フィクスチャの実装ファイルのコメントに `@vocab` の文字列を書かないこと（パーサーが拾ってしまう）。
