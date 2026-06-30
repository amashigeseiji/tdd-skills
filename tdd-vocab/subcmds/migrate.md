# /tdd-vocab migrate — 辞書フォーマット移行（.md → .json）

## 目的

`dictionary.md` 形式（旧）を `dictionary.json` 形式（新）に変換する。
`docs/dictionary.md` と `plans/*/dictionary.md` を対象とする。

## 手順

**1. 対象ファイルを確認する**

```bash
find "<meta>/docs" "<meta>/plans" -name "dictionary.md" -not -path "*/archives/*" 2>/dev/null
```

`archives/` 配下のファイルは移行対象外（無視する）。
ファイルが見つからなければ「移行対象なし」と伝えて終了する。

**2. 各ファイルを変換する**

対象ファイルを Read し、以下の変換規則に従って JSON を生成する。

### Markdown → JSON 変換規則

**コンテキストの抽出（`contexts` 配列）:**

| Markdown | JSON フィールド |
|---------|---------------|
| `## <コンテキスト名>` | `context.name` |
| `**dir:** <値>` | `context.dir` |
| `**概要:** <値>` | `context.description` |

旧フォーマットに存在しない `primary_users` / `in_scope` / `out_of_scope` は空文字 `""` にする。

**エントリの抽出（`entries` 配列）:**

| Markdown | JSON フィールド |
|---------|---------------|
| `### <概念名>` | `entry.name` |
| `en: <値>` | `entry.en` |
| `**定義:** <値>` | `entry.definition` |
| `**関係:**` 以下の箇条書き | `entry.relations` |
| `**src:** \`<値>\`` | `entry.src`（バッククォートを除去） |

現在のセクション（`**アプリケーションドメイン**` / `**ソリューションドメイン**`）により
`entry.domain` を `"application"` / `"solution"` に設定する。

`entry.context` は、そのエントリが属するコンテキストの `dir` を使う。

**関係の変換（`relations` 配列）:**

旧形式: `` - `contains`: [概念名](#概念名) — 補足 ``

新形式: `{"type": "contains", "target": "概念名", "note": "補足"}`

- type: バッククォートで囲まれた部分
- target: `[概念名]` の括弧内（`#` アンカーは除去）
- note: `—` 以降のテキスト（なければ `""` または省略）

**definition 内の参照記法の変換:**

旧形式: `[概念名](#概念名)` → 新形式: `#概念名 `（末尾にスペース）

文末・句点の直前でもスペースを挟む（例: `#概念名 。`）。

**`plans/*/dictionary.md` の追加フィールド:**

plans 配下のエントリには `wip` フィールドを付与する:

```json
"wip": {
  "status": "new",
  "discovered": "migrate"
}
```

### 生成する JSON の構造

```json
{
  "version": "1",
  "contexts": [...],
  "entries": [...]
}
```

`docs/dictionary.json` は上記の構造そのまま。
`plans/<プラン名>/dictionary.json` は同じ構造で、各エントリに `wip` フィールドを追加。

**3. ファイルを書き出す**

- 変換結果を `<元のパス>.json`（拡張子を `.json` に変えたパス）として書き出す
- 書き出しに成功したら元の `.md` ファイルを `.md.bak` にリネームする（削除しない）

```bash
mv "<meta>/docs/dictionary.md" "<meta>/docs/dictionary.md.bak"
# plans の場合も同様
```

**4. 結果を報告する**

変換したファイルの一覧と、各ファイルで移行したコンテキスト数・エントリ数を表示する。

例:
```
移行完了:
  docs/dictionary.json  — 3 コンテキスト / 18 エントリ
  plans/my-plan/dictionary.json  — 1 コンテキスト / 5 エントリ
バックアップ:
  docs/dictionary.md.bak
  plans/my-plan/dictionary.md.bak
```

エントリが 0 件だった場合や変換に疑問点があった場合は、その旨を明示して確認を求める。
