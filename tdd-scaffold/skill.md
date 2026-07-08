# /tdd-scaffold - スキャフォールディング初期化スキル

引数なしなら `.claude/tdd/scaffold.sh`、`depgraph` なら `.claude/tdd/depgraph-regen.sh` を生成する。

引数が `depgraph` の場合は本ファイルの「依存グラフ生成アダプタ（`depgraph`）」節へ進む。
それ以外（引数なし）は以下の手順で `scaffold.sh` を生成する。

---

## 実行すること

1. プロジェクト構造を調査して言語・フレームワーク・ディレクトリ規約を把握する
2. `.claude/tdd/scaffold.sh` を生成して保存する
3. `chmod +x .claude/tdd/scaffold.sh` を実行する

---

## プロジェクト構造の調査

**src ルート**: `src/` `app/` `lib/` の存在を確認する。なければ `src/` を使う。
**test ルート**: `tests/` `test/` `spec/` `__tests__/` の存在を確認する。なければ `tests/` を使う。
**言語**: `package.json` `Gemfile` `go.mod` `pyproject.toml` 等を確認する。
**フレームワーク**: `package.json` の dependencies、ディレクトリ構造から判断する。
**言語が複数あるか**: 言語マーカーが複数見つかる、またはディレクトリごとに言語が違う場合
（例: JS 本体 + Swift のネイティブシェル）は多言語プロジェクト。後述の
「多言語プロジェクト」の指針に従い、コンテキストごとの分岐を持つ scaffold.sh を生成する。

---

## scaffold.sh の呼び出し規約

```
.claude/tdd/scaffold.sh <Subject> <verb> <context>
```

- `Subject`: 英語 PascalCase（例: `Cart`）— tdd-run が語彙の `en:` から解決して渡す
- `verb`: 英語 camelCase（例: `calculateTotal`）— tdd-run がノードの V を翻訳して渡す
- `context`: コンテキスト dir 名（例: `shop`）— tdd-vocab で確定した名前

動作:
- `<src_root>/<context>/<subject_lower>.js` を生成する
- ファイルが存在しない場合は作成、存在する場合は関数を追記する（同一主語・複数 verb のケース）
- 各関数に `@vocab` と `@test` アノテーションを付与する

---

## JavaScript / TypeScript プロジェクト

`SRC_ROOT` と `TEST_ROOT` を調査結果で置き換えて生成する。
TypeScript の場合は `.js` を `.ts` に変更し、プロジェクト規約に合わせて調整する。

```bash
#!/bin/bash
# Usage: scaffold.sh <Subject> <verb> <context>

SUBJECT="$1"
VERB="$2"
CONTEXT="$3"

[ -z "$SUBJECT" ] || [ -z "$VERB" ] || [ -z "$CONTEXT" ] && {
  echo "Usage: scaffold.sh <Subject> <verb> <context>" >&2; exit 1
}

SRC_ROOT="src"   # 調査結果で置き換える
TEST_ROOT="tests" # 調査結果で置き換える

SUBJECT_FILE="$(echo "$SUBJECT" | awk '{print tolower(substr($0,1,1)) substr($0,2)}')"
SRC_FILE="${SRC_ROOT}/${CONTEXT}/${SUBJECT_FILE}.js"
TEST_FILE="${TEST_ROOT}/${CONTEXT}/${SUBJECT_FILE}.test.js"

mkdir -p "${SRC_ROOT}/${CONTEXT}"

add_stub() {
  echo ""
  echo "/**"
  echo " * @vocab $SUBJECT"
  echo " * @test $TEST_FILE"
  echo " */"
  echo "export function $VERB() {"
  echo "  throw new Error('not implemented')"
  echo "}"
}

if [ ! -f "$SRC_FILE" ]; then
  add_stub > "$SRC_FILE"
  echo "Created: $SRC_FILE"
else
  add_stub >> "$SRC_FILE"
  echo "Appended ${VERB} to: $SRC_FILE"
fi
```

---

## Rails

Rails は独自の scaffolding 機構を持つ。`rails generate` を活用した wrapper を生成する。
ノードの種別（モデル・コントローラ・サービス等）を Subject の名前から判断し、適切な `rails generate` コマンドを呼ぶ形で実装する。

---

## 他のフレームワーク

プロジェクト構造の調査結果に基づいて適切な scaffold.sh を生成する。
パラダイム（OOP・関数型・モジュール等）に応じて、Subject（ファイル名）と verb（関数名）の対応を決める。

---

## 多言語プロジェクト

言語が複数あるプロジェクトでは、言語の境界はコンテキストの境界とほぼ一致する
（例: `native-shell` コンテキスト = Swift、それ以外 = JS）。scaffold.sh は既に
`context` を引数で受け取っているので、**コンテキスト→（src ルート・拡張子・スタブ雛形）の
マッピングで分岐**させる:

```bash
case "$CONTEXT" in
  native-shell) SRC_ROOT="NativeShell/Sources"; EXT="swift" ;;
  *)            SRC_ROOT="src";                 EXT="js" ;;
esac
```

スタブ雛形（`add_stub` 相当）も言語ごとに用意する。`@vocab` / `@test` アノテーションは
その言語のコメント記法で付ける。調査時にどのコンテキストがどの言語かをユーザーに確認し、
マッピングを scaffold.sh に固定する。あとからコンテキストが増えた場合は scaffold.sh に
分岐を追記する（`/tdd-scaffold` を再実行してもよい）。

---

## 依存グラフ生成アダプタ（`depgraph`）

`tdd-run` の 7.5（ウォークスルー）や `tdd-vocab init`/`check` は依存グラフを
`${CLAUDE_SKILL_DIR}/../bin/depgraph-search.js`（tdd-skills 同梱・全プロジェクト共通）で問い合わせる。
このスクリプトは正規化済みの JSON（`{ "modules": [ { "source", "dependencies": [...] } ] }`、
forward edge のみ）を読む前提で、`--to`/`--from`/`-d`/`-s` の展開・整形ロジックを持つ。**このロジック自体は
プロジェクトごとに再生成しない**（`dict-search.js` と同じ位置づけ）。

プロジェクトごとに違うのは「言語別ツールを実行し、その生の出力を上記の正規化 JSON に変換する」部分だけ。
ここを `.claude/tdd/depgraph-regen.sh` として生成するのが `depgraph` の役目。任意機能。
詳細な設計背景は `docs/references/archives/dependency-graph-in-tdd-run.md` と
`docs/references/multilang-scaffold-depgraph.md`（多言語対応・エッジの意味づけ）を参照。

**エッジの意味づけ**: 正規化 JSON のエッジは「このファイルが**参照している言語要素の定義元ファイル**」
を表す（言語レベルの依存関係のファイルシステムへの射影）。依存関係の本体はモジュール・クラス・
シンボルの間にあり、ファイルへのマッピングは言語ごとに事情が違う——JS は ES モジュール = ファイル
なので import 文のパースがそのまま射影になる（恒等写像）が、PHP はクラス参照を PSR-4 で
ファイルに解決する必要があり、Swift はファイル間の依存が宣言されない（index store からの導出になる）。
depgraph-regen.sh の責務は**この射影をその言語なりの方法で計算すること**。

なお、どの言語でも射影は完全にはならない（動的 import・DI コンテナ・リフレクション・設定ファイル
経由の結線は取れない）。グラフは「少なくともこの依存はある」という**下界**として使う道具であり、
孤立ノードチェックの結果は偽陰性リスクの兆候であって証明ではない。

### 実行すること

1. プロジェクトの言語・依存グラフ生成ツールの有無を調査する
2. ツールがなければユーザーに導入するか確認する（例: JS/TS なら `dependency-cruiser`、Python なら `pydeps`）
3. `.claude/tdd/depgraph-regen.sh` を生成し `chmod +x` する
4. ユーザーに「このプロジェクトのエントリーポイント（ユーザーの操作・外部リクエストが最初に届くファイル）」を
   glob パターンで確認する
5. `.claude/tdd/config.json` に以下を追記する

```json
{
  "depgraph": {
    "regen": ".claude/tdd/depgraph-regen.sh",
    "graph": ".claude/tdd/dependency-graph.json",
    "entry_points": ["<確認した glob パターン>"],
    "scope": ["<グラフがカバーする範囲の glob パターン>"]
  }
}
```

**`scope`**: このグラフがカバーする範囲の宣言。regen が解析対象にしているディレクトリから
機械的に決まる（例: `["bin/**", "lib/**", "src/**"]`）。多言語プロジェクトで一部の言語しか
グラフ化できない場合、呼び出し側（tdd-run 7.5 等）は scope 外のファイルを「孤立」ではなく
「グラフ対象外」として扱う。省略時は「プロジェクト全体をカバーしている」とみなす。
`entry_points` は scope 内に含まれていること（含まれていなければ設定ミス）。

### 調査

**依存グラフ生成ツール**: `package.json`（`dependency-cruiser`/`madge`）、`pyproject.toml`（`pydeps`）等を確認する。
**対象ディレクトリ**: ソースルート配下でテスト・ビルド成果物を除いたディレクトリを対象にする。
**パスエイリアス**: `tsconfig.json`/`jsconfig.json`/バンドラ設定に alias（`@/...` 等）があれば、
ツールがそれを解決できるよう追加設定が要る場合がある（例: dependency-cruiser の `webpackConfig` オプション）。

### 呼び出し規約

```
.claude/tdd/depgraph-regen.sh
```

引数なし。実行すると `depgraph.graph`（例: `.claude/tdd/dependency-graph.json`）を
正規化済みの形で書き出す（上書き）。それ以外の責務は持たない——検索・展開は呼び出し側が
`bin/depgraph-search.js` に対して行う。

呼び出し側（`tdd-run`/`tdd-vocab`）からの利用例:

```bash
.claude/tdd/depgraph-regen.sh
node "$(realpath "${CLAUDE_SKILL_DIR}")/../bin/depgraph-search.js" --from -d 999 -s .claude/tdd/dependency-graph.json <file>
```

### 正規化 JSON の形

```json
{ "modules": [ { "source": "app/foo.js", "dependencies": ["app/bar.js", "lib/baz.js"] } ] }
```

- `source`/`dependencies` の各パスはプロジェクトルートからの相対パスで統一する
- `dependencies` は forward edge（このファイルが参照している言語要素の定義元ファイル）のみでよい。
  逆引き（dependents）は `bin/depgraph-search.js` が起動時に計算する
- 外部パッケージ（`node_modules` 等）・未解決の import は `depgraph-regen.sh` 側で除外してから書き出す

### JavaScript / TypeScript プロジェクト

`dependency-cruiser` を使う場合の例（`dependency-cruiser` は依存元・依存先を両方くれるが、
正規化 JSON には `dependencies` だけを詰め替えればよい）:

```bash
#!/bin/bash
# Usage: depgraph-regen.sh
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RAW_PATH="$SCRIPT_DIR/dependency-graph.raw.json"
GRAPH_PATH="$SCRIPT_DIR/dependency-graph.json"

npx depcruise <調査した対象ディレクトリ> --config <調査した設定ファイル> --output-type json > "$RAW_PATH"

node -e '
  const raw = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))
  const modules = raw.modules.map(m => ({
    source: m.source,
    dependencies: (m.dependencies || [])
      .filter(d => !d.couldNotResolve)
      .map(d => d.resolved),
  }))
  require("fs").writeFileSync(process.argv[2], JSON.stringify({ modules }, null, 2))
' "$RAW_PATH" "$GRAPH_PATH"
```

### 他の言語

`pydeps`（Python）等、出力形式が異なるツールでは、その出力を読んで上記の正規化 JSON に
変換するロジックを `depgraph-regen.sh` に書く（Python スクリプトを呼び出してもよい）。
`bin/depgraph-search.js` 側の実装は変えない。

対応ツールがそもそも存在しない、またはグラフ生成が現実的でない場合:

- **単一言語プロジェクト**: セットアップを中断し、`config.json` に `depgraph` を追記せず終了する
  （`tdd-run`/`tdd-vocab` 側は未設定として扱いスキップする）
- **多言語プロジェクトで一部の言語だけグラフ化できる**: グラフ化できる範囲だけで regen を作り、
  `scope` にその範囲を宣言する。scope 外の領域は、その言語ネイティブの未参照コード検出ツール
  （例: Swift なら Periphery）があれば手動チェックで代替できる旨を findings 用にユーザーへ伝える
