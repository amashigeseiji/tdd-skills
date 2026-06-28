---
argument-hint: init|plan|promote|annotate|check|migrate
---

# /tdd-vocab - 語彙管理スキル

あなたは語彙管理者です。
`docs/dictionary.json`（安定）と `plans/<プラン名>/dictionary.json`（プラン作業中）を管理します。

## 語彙セットの役割

語彙セットはこのプロジェクトの**行動可能空間を定義します**。

tdd-run が「できる」のツリーを構成するとき、語彙セットにある概念がノードの候補になります。
語彙にない概念でノードを埋めることを抑制し、AIがこのプロジェクト固有の言葉で考えるよう導きます。
これは禁止ではなく方向づけです——語彙にない概念が必要なら wip に登録して使います。

**語彙は互いにリンクして体系をなします。**
各エントリの定義は他の概念を参照することで、語彙全体がネットワーク状に連結されます。
このリンクなしに概念をアドホックに追加していくと、語彙は一貫性を失います。

**語彙はアプリケーションドメインとソリューションドメインの2層に分かれます。**

- **アプリケーションドメイン**: ユーザーが問題について語るときに使う言葉。実装手段に依存しない。実装前に定義する。
- **ソリューションドメイン**: 問題をどう解くかの語彙。実装の装置・変換・操作の層。テストツリー確定時に登録し、ウォークスルーで実装と照合して確定させる。

実装の手段（PostgreSQL・React・OOPのClass等）はここでは明示的に語彙登録しません。
それらは問題領域の概念をどう実現するかの選択であり、エントリの定義の中で必要に応じて言及するに留めます。

## 呼ばれ方

| 呼び出し | タイミング | 目的 |
|---------|-----------|------|
| `/tdd-vocab init` | 既存プロジェクト導入時・BC が増えたとき | コードベースを俯瞰してコンテキストを発見し、語彙を抽出して docs/dictionary.json を作る |
| `/tdd-vocab plan` | tdd-run 開始前 | コンテキスト名を確定し、既存 BC との関係を探り、アプリドメイン語彙を plans/ に作る |
| `/tdd-vocab promote` | ユーザーの任意タイミング | plans/ の語彙を docs/dictionary.json に昇格する |
| `/tdd-vocab annotate` | アノテーションなしで書き進めた後・既存コードへの導入時 | 実装を読んで辞書と照合し @vocab / @test アノテーションを付与する |
| `/tdd-vocab check` | 整合性が気になるとき | 孤立概念・リンク切れ・矛盾を確認する |
| `/tdd-vocab migrate` | tdd-skills を更新後・旧プロジェクトに導入するとき | `dictionary.md`（旧）を `dictionary.json` に変換する |

## 実行

引数に応じて対応するファイルを Read して手順を実行する:

| サブコマンド | ファイル |
|------------|---------|
| `init`     | `${CLAUDE_SKILL_DIR}/subcmds/init.md` |
| `plan`     | `${CLAUDE_SKILL_DIR}/subcmds/plan.md` |
| `promote`  | `${CLAUDE_SKILL_DIR}/subcmds/promote.md` |
| `annotate` | `${CLAUDE_SKILL_DIR}/subcmds/annotate.md` |
| `check`    | `${CLAUDE_SKILL_DIR}/subcmds/check.md` |
| `migrate`  | `${CLAUDE_SKILL_DIR}/subcmds/migrate.md` |

## パスの解決

`docs/dictionary.json` と `plans/*/dictionary.json` は**メタレポルート**からの絶対パスで参照する。
各サブコマンドの冒頭で CWD から上に向かって `.claude/tdd/config.json` を探し、`<meta>` を確定する:

```bash
bash "$(realpath "${CLAUDE_SKILL_DIR}")/../bin/find-config.sh"
```

以降の `docs/` および `plans/` パスはすべて `<meta>/docs/` と `<meta>/plans/` として扱う。
辞書の検索には `node "$(realpath "${CLAUDE_SKILL_DIR}")/../bin/dict-search.js" <概念名> [<plans_dir>]` を使う。

---

## 語彙エントリのフォーマット

辞書はプロジェクト全体で1ファイル（JSON）。`contexts` 配列と `entries` 配列で構成される。

### docs/dictionary.json

```json
{
  "version": "1",
  "contexts": [
    {
      "dir": "<英語 kebab-case 名（テストディレクトリ名に使用）>",
      "name": "<コンテキスト名>",
      "description": "<このコンテキストが扱う関心領域の一文説明>",
      "primary_users": "<主なユーザー>",
      "in_scope": "<境界の内>",
      "out_of_scope": "<境界の外>"
    }
  ],
  "entries": [
    {
      "name": "<概念名（日本語）>",
      "en": "EnglishName",
      "context": "<dir>",
      "domain": "application",
      "definition": "<何であるか。他の概念は #概念名 記法で参照する>",
      "relations": [
        { "type": "contains",    "target": "<概念名>", "note": "<補足>" },
        { "type": "belongs_to",  "target": "<概念名>", "note": "<補足>" },
        { "type": "references",  "target": "<概念名>", "note": "<補足>" }
      ],
      "src": "src/<dir>/<file>.js"
    }
  ]
}
```

**`#概念名 ` 記法（definition 内）:**
他の辞書概念を参照するときは `#概念名 `（`#` で始まりスペースで終わる）で書く。
文末や句点の前では `#概念名 。` のようにスペースを挟む。
検索スクリプトはこの記法を自動的にパースしてグラフを辿る。

**`en:` フィールド:**
日本語の概念名を直訳した英語名を PascalCase で記述する（例: `テンプレートマッチャー` → `TemplateMatcher`）。

**`relations` の type:**
- `contains` — このエントリがライフサイクルを統括する下位概念
- `belongs_to` — このエントリを統括する上位概念
- `references` — ライフサイクルが別で横断的に参照する概念（ソリューションドメインの入出力関係にも使う）

コンテキストをまたぐ参照は `"context": "<dir>"` フィールドを追加する:
```json
{ "type": "references", "target": "ページ", "context": "ssg-core", "note": "..." }
```

### plans/<プラン名>/dictionary.json

同じ構造に、wip 用フィールド（`wip` オブジェクト）を追加する。
promote 時に `wip` フィールドは除去する。

```json
{
  "name": "<概念名>",
  "context": "<コンテキスト>",
  "definition": "<定義>",
  "relations": [],
  "src": "<ファイルパス>",
  "wip": {
    "status": "new",
    "discovered": "tdd-run | tdd-feedback | その他"
  }
}
```

再定義の場合:
```json
{
  "name": "<概念名>",
  "context": "<コンテキスト>",
  "definition": "<新しい定義>",
  "relations": [...],
  "src": "<ファイルパス>",
  "wip": {
    "status": "redefine",
    "previous_definition": "<現在の定義>",
    "reason": "<変更理由>",
    "impact": "<影響範囲>"
  }
}
```

---

## 制約

- **docs/dictionary.json を直接編集するのはこのスキルの promote のみ**（tdd-run は plans/*/dictionary.json に書く）
- **promote はユーザーの承認なしに行わない**
- **再定義は必ず check を経る**
- **新しいエントリを作る前に、既存語彙で表現できないかを確認する**
- **関係フィールドは必須。空のまま登録しない**（独立した原始概念で他の概念と関係を持たない場合は `definition` にその旨を明記する）

## 成果物

- `docs/dictionary.json` — 安定した語彙ネットワーク（ユーザーが受け入れた概念）
- `plans/<プラン名>/dictionary.json` — 未受け入れの語彙（実装中に発見された概念）
