# /tdd-scaffold - スキャフォールディング初期化スキル

引数なしなら `.claude/tdd/scaffold.sh`、`depgraph` なら `.claude/tdd/depgraph-search.sh` を生成する。
どちらも「呼び出し規約は固定・中身はプロジェクト調査して生成」という同じパターンのアダプタ。

引数が `depgraph` の場合は本ファイルの「依存グラフ検索アダプタ（`depgraph`）」節へ進む。
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

## 依存グラフ検索アダプタ（`depgraph`）

`tdd-run` の 7.5（ウォークスルー）や `tdd-vocab init`/`check` が使う、依存グラフ問い合わせの
プロジェクト側アダプタを生成する。任意機能。詳細な設計背景は
`docs/references/dependency-graph-in-tdd-run.md` を参照。

### 実行すること

1. プロジェクトの言語・依存グラフ生成ツールの有無を調査する
2. ツールがなければユーザーに導入するか確認する（例: JS/TS なら `dependency-cruiser`、Python なら `pydeps`）
3. `.claude/tdd/depgraph-search.sh` を生成し `chmod +x` する
4. ユーザーに「このプロジェクトのエントリーポイント（ユーザーの操作・外部リクエストが最初に届くファイル）」を
   glob パターンで確認する
5. `.claude/tdd/config.json` に以下を追記する

```json
{
  "depgraph": {
    "search": ".claude/tdd/depgraph-search.sh",
    "entry_points": ["<確認した glob パターン>"]
  }
}
```

### 調査

**依存グラフ生成ツール**: `package.json`（`dependency-cruiser`/`madge`）、`pyproject.toml`（`pydeps`）等を確認する。
**対象ディレクトリ**: ソースルート配下でテスト・ビルド成果物を除いたディレクトリを対象にする。
**パスエイリアス**: `tsconfig.json`/`jsconfig.json`/バンドラ設定に alias（`@/...` 等）があれば、
ツールがそれを解決できるよう追加設定が要る場合がある（例: dependency-cruiser の `webpackConfig` オプション）。

### 呼び出し規約

```
.claude/tdd/depgraph-search.sh --regen
.claude/tdd/depgraph-search.sh [--to] [--from] [-d <depth>] [-s] <path-substring>
```

- `--regen`: 依存グラフを再生成する（生成コマンド自体はツール・プロジェクトごとに異なる）
- 引数なし: `--to`/`--from` 両方表示
- `--to`: 指定ファイルの依存先（このファイルが import しているもの）
- `--from`: 指定ファイルの依存元（このファイルを import しているもの）
- `-d, --depth <n>`: 推移的に n hop まで展開（デフォルト1）
- `-s, --summary`: パス一覧のみを1行ずつ出力（ノード数・詳細説明は省く。呼び出し側がトークンを節約するため）

この4フラグ + `--regen` の意味はプロジェクトを問わず固定する。それ以外の付加機能
（プロジェクト固有の集計・辞書化など）は追加してよいが、`tdd-run`/`tdd-vocab` 側はこの最小契約しか使わない。

### JavaScript / TypeScript プロジェクト

`dependency-cruiser` を使う場合の例:

```bash
#!/bin/bash
# Usage: depgraph-search.sh [options] <path-substring>
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GRAPH_PATH="$SCRIPT_DIR/dependency-graph.json"

if [ "$1" = "--regen" ]; then
  shift
  npx depcruise <調査した対象ディレクトリ> --config <調査した設定ファイル> --output-type json > "$GRAPH_PATH"
fi

node "$SCRIPT_DIR/depgraph-search.mjs" "$GRAPH_PATH" "$@"
```

グラフの検索ロジック（`--to`/`--from`/`-d`/`-s` の展開処理）は言語・ツールに依存しないので、
`depgraph-search.mjs` として同じ内容を毎回生成してよい（起点ノードから n hop 先まで幅優先展開し、
`-s` なら結果のパス一覧のみ、それ以外なら依存先・依存元をセクション分けして出力する）。

### 他の言語

`pydeps`（Python）等、対象ツールが JSON でグラフを出力できない場合は、出力形式に応じて
`depgraph-search.sh` 内でパース・整形する。呼び出し規約（`--to`/`--from`/`-d`/`-s`/`--regen`）は変えない。

対応ツールがそもそも存在しない、またはグラフ生成が現実的でない場合はセットアップを中断し、
`config.json` に `depgraph` を追記せず終了する（`tdd-run`/`tdd-vocab` 側は未設定として扱いスキップする）。
