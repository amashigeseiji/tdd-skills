# /tdd-init - TDDスキル初期化

新しいリポジトリにTDDスキルを**初めて導入するときに一度だけ**実行する。

以下を順に行う:

1. **config.json の作成** — `.claude/tdd/config.json` を作成する
2. **scaffold の初期化** — `/tdd-scaffold` を呼び、`.claude/tdd/scaffold.sh` を生成する
3. **語彙の初期化** — `/tdd-vocab init` を呼び、`docs/dictionary.json` を作成する

`workflow.md`（`.claude/tdd/workflow.md`）は `/tdd-workflow` の初回起動時にヒアリングして生成する。`/tdd-init` では作成しない。

> BC が増えたときの `/tdd-vocab init` の再実行は、`/tdd-init` を経由せず直接呼ぶ。

---

## 手順

### 1. config.json の作成

`.claude/tdd/` ディレクトリが存在しなければ作成する（**現在のディレクトリがメタレポルートであることを確認してから実行する**）:

```bash
mkdir -p .claude/tdd
```

`.claude/tdd/config.json` を作成する。このファイルの存在自体が「ここがメタレポルート」の目印なので、
最小構成は空でよい:

```json
{}
```

（`commit_plans` や `branch_name_template` などのプロジェクト固有設定は、それを使う側が
必要になったタイミングで追記する。ここでは絶対パスを書かない — 書くと clone/移動時に
実際の場所と食い違い、コミットもできなくなる。）

**走査設定（`vocab_scan`）:**

語彙と実装を照合するスクリプト（`check-vocab.js` / `generate-map.js` / `suggest-annotations.js`）が**どのファイルを実装とみなすか**の宣言。
未設定だと既定の拡張子（`.js .ts .mjs .cjs .jsx .tsx .py .rb .go`）でリポジトリ全体を走査する。
既定から外れる要素があるプロジェクトではここで宣言しておく:

```bash
git ls-files | sed 's/.*\.//' | sort | uniq -c | sort -rn | head   # 拡張子の分布
ls -d */                                                           # トップレベルのディレクトリ
cat .gitignore                                                     # 生成物・配布物の在処
```

調査結果からユーザーに提案し、承認を得て書く:

```json
{
  "vocab_scan": {
    "extensions": [".js", ".swift"],
    "exclude": ["dist-app", "tests/acceptance"],
    "roots": ["src", "lib", "native"]
  }
}
```

| フィールド | 意味 | 未設定のとき |
|---|---|---|
| `extensions` | 走査する拡張子（宣言したものだけを見る） | 既定リスト |
| `exclude` | この道具群が見ない場所 | `node_modules` / `.git` / `dist` / `build` のみ |
| `roots` | 走査するディレクトリ（リポジトリルートからの相対） | リポジトリ全体 |

`exclude` の照合は `.gitignore` と同じ読み方をする——`dist-app` のようにスラッシュを含まなければディレクトリ名としてどの階層でも一致し、`tests/acceptance` のように含めばリポジトリルートからのパスとして一致する。
効く範囲は実装ファイルの走査・テストディレクトリと辞書コンテキストの照合・`@test` 候補の探索のすべて。
受け入れテストの置き場 `tests/acceptance/` は BC 単位ではなくユーザーストーリー単位で切られ、単体テストツリーとも別物なので、ここに入れておく。

単一言語で素直な構成なら省略してよい。
不足は後から `/tdd-vocab check` が `[走査対象外]` / `[未対応]` として検出し、足すべき値を提示する。

**config.local.json の gitignore 追加:**

`.claude/tdd/config.local.json` はマシン固有の絶対パス（作業レポジトリの場所など）の受け皿で、
コミットしてはいけない。`.gitignore` に追加する（すでに含まれている場合はスキップ）:

```bash
echo '.claude/tdd/config.local.json' >> .gitignore
```

ファイル自体はここでは作らない — 必要になったスキル（tdd-run / tdd-feedback）が
解決できないパスに出会ったときに作る。

**plans/ の追跡設定:**

ユーザーに確認する:

> `plans/` を git で追跡しますか？しない場合は `.gitignore` に追加します。

追跡しない場合:

```bash
echo 'plans/' >> .gitignore
```

`.gitignore` が存在しない場合も同様に作成される。すでに `plans/` が含まれている場合はスキップする。

### 2. scaffold の初期化

`/tdd-scaffold` を呼ぶ。

### 3. 語彙の初期化

`/tdd-vocab init` を呼ぶ。

---

## 成果物

- `.claude/tdd/config.json` — メタレポルートを示すマーカー（走査設定 `vocab_scan` を必要に応じて含む）
- `.claude/tdd/scaffold.sh` — スタブ生成スクリプト（tdd-scaffold が作成）
- `docs/dictionary.json` — 初期語彙定義（tdd-vocab init が作成）
