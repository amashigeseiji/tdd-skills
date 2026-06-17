# /tdd-scaffold - スキャフォールディング初期化スキル

プロジェクト固有の `.claude/tdd/scaffold.sh` を生成する。
`tdd-run` が手順4のスタブ生成で呼び出すスクリプトを、プロジェクトの構造に合わせて作成する。

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
  echo " * @vocab $SUBJECT (plans/dictionary.md)"
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
