# /tdd-vocab promote — wip から stable へ

## 目的

wip に積まれた概念をユーザーが受け入れ、docs/dictionary.json に昇格する。

## 手順

**1. wip の一覧をユーザーに提示する**

`plans/<プラン名>/dictionary.json` の全エントリを一覧し（`dict-search.js -a -s <plans_dir>`）、各概念を提示する。
機械的な整合性（フォーマット・重複・参照の解決）は先にまとめて検証しておく:

```bash
node "$(realpath "${CLAUDE_SKILL_DIR}")/../bin/dict-write.js" check <plans_dir>/dictionary.json
```

提示は件数の要約（「新規n件の昇格・既存n件の更新を行います。よいですか？」）で済ませない。
**必ず各概念の内容を表で示してから**承認を取る:

```
| 概念名 | 区分 | コンテキスト/ドメイン | 定義 | relations |
|--------|------|----------------------|------|-----------|
| <name> | 新規 | <context>/<domain> | <定義（長ければ要約）> | <関係の種類: target> |
| <name> | 再定義 | <context>/<domain> | <新しい定義> | <関係の種類: target> |
```

- 区分は docs/dictionary.json との照合で決める（同名エントリが安定層にあれば「再定義」。
  再定義も手順2の promote で docs 側の既存エントリに in-place で反映される）
- 再定義は表の下に現行定義→新定義の差分を添える
- 定義を要約する場合も、承認の判断に効く違いは省略しない

**表と確認ダイアログを同一ターンに混ぜない。** 確認ダイアログ（AskUserQuestion 等の
選択ツール）の直前に出力した本文は、ダイアログの UI に埋もれてユーザーに表示されない
ことがある。この承認にはダイアログを使わず、表を本文で提示してターンを終え、
ユーザーのテキスト返答を受けて昇格対象を確定する。

各概念についてユーザーと確認する（機械的検証ではなく判断の仕事）:
- 定義は適切か
- docs/dictionary.json の既存概念と矛盾しないか（検索には dict-search.js を使う）

**2. ユーザーの承認を得た概念を移動する**

```bash
node "$(realpath "${CLAUDE_SKILL_DIR}")/../bin/dict-write.js" promote \
  --from <plans_dir>/dictionary.json <概念名> [<概念名2> ...]
```

`wip` フィールドの除去とコンテキストの昇格は自動で行われる。新規（wip.status: new）は
docs に追加、再定義（wip.status: redefine）は docs 側の同名エントリを in-place で
置き換える（手動の update は不要）。安定層の整合性を守るため、relations の target や
`#参照` が docs 側で解決できない場合はエラーになる
（参照先の概念を一緒に昇格するか、relations を修正してから再実行する）。
承認されなかった概念で破棄が決まったものは `dict-write.js remove --from <plans_dir>/dictionary.json <概念名>` で消す。

**2.5. コンテキストが既存に吸収される場合**

wip コンテキストが既存コンテキストに吸収される（dir 名が変わる）場合:

1. テストディレクトリを移動する:
   ```bash
   mv tests/<wip-dir>/ tests/<stable-dir>/
   ```
2. 移動したファイルを参照する `@test` を書きかえる:
   ```bash
   find . \( -name "*.js" -o -name "*.ts" \) -print0 \
     | xargs -0 grep -l "@test.*tests/<wip-dir>/" \
     | xargs sed -i.bak 's|tests/<wip-dir>/|tests/<stable-dir>/|g'
   ```

**3. 再定義の場合は影響を確認する**

docs/dictionary.json への反映自体は手順2の promote で完了している。既存概念の意味が
変わった場合は、影響を受ける可能性のある箇所（他のエントリの relations・#参照、
関連するテストの前提）をユーザーに報告する。
