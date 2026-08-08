---
argument-hint: [vocab|acts]
---

# /tdd-update - スキルを最新版に更新

tdd-skills リポジトリを `git pull` し、新規スキルのシンボリックリンクを自動作成する。
サブコマンドは、スキル更新後にプロジェクト側の成果物を現行の体系へ揃える**移行手続き**である。

## 呼ばれ方

| 呼び出し | タイミング | 目的 |
|---------|-----------|------|
| `/tdd-update` | 任意 | スキル本体を更新し、差分を報告する |
| `/tdd-update vocab` | 更新後、旧フォーマットの辞書が残っているとき | 辞書フォーマット移行（`dictionary.md` → `dictionary.json` 変換、旧エントリへの `en` 一括付与） |
| `/tdd-update acts` | 台帳導入以前から tdd-skills で開発してきたレポジトリに、一度だけ | 行為の登記簿（`docs/acts.json`）への遡及登記 |

## サブコマンドの実行

引数がある場合は対応するファイルを Read して手順を実行する:

| サブコマンド | ファイル |
|------------|---------|
| `vocab` | `${CLAUDE_SKILL_DIR}/subcmds/vocab.md` |
| `acts`  | `${CLAUDE_SKILL_DIR}/subcmds/acts.md` |

各サブコマンドの冒頭で CWD から上に向かって `.claude/tdd/config.json` を探し、メタレポルートを確定する:

```bash
bash "$(realpath "${CLAUDE_SKILL_DIR}")/../bin/find-config.sh"
```

出力の META が `<meta>`。以降の `docs/` および `plans/` パスはすべて `<meta>/docs/` と `<meta>/plans/` として扱う。

以下は引数なしの場合の手順。

---

## 実行

```bash
SKILLS_REPO="$(realpath "${CLAUDE_SKILL_DIR}/..")"
BEFORE=$(git -C "$SKILLS_REPO" rev-parse HEAD)
bash "$(realpath "${CLAUDE_SKILL_DIR}")/../bin/update.sh"
AFTER=$(git -C "$SKILLS_REPO" rev-parse HEAD)
echo "BEFORE=$BEFORE"
echo "AFTER=$AFTER"
```

出力をそのままユーザーに表示する。

## 更新差分の報告

`BEFORE` と `AFTER` が異なる場合（実際に更新があった場合）、以下を実行して差分情報を収集する:

```bash
SKILLS_REPO="$(realpath "${CLAUDE_SKILL_DIR}/..")"
git -C "$SKILLS_REPO" log --oneline "$BEFORE..$AFTER"
```

```bash
SKILLS_REPO="$(realpath "${CLAUDE_SKILL_DIR}/..")"
cat "$SKILLS_REPO/CHANGELOG.md"
```

収集した情報をもとに、以下の観点で**変更内容を整理してユーザーに報告**する:

- **新しいスキル・削除されたスキル** — 使えるようになった／なくなったもの
- **既存スキルの動作変更** — 手順・出力・フラグが変わったもの（ユーザーが意識すべき変化）
- **内部改善・修正** — ユーザーが直接気づかないが品質に影響するもの
- **マイグレーションが必要な変更** — ユーザー側で対応が必要な場合は必ず明示

差分がない場合（`BEFORE == AFTER`）は「すでに最新です」と伝えるだけでよい。

## 完了後

新規スキルが追加された場合、Claude Code を**再起動**しないとスキルが認識されないことがある。
再起動が必要な場合はその旨を伝える。

**移行の要否確認:**

以下を実行して、プロジェクト側の成果物に移行が必要なものが残っていないか確認する:

```bash
d=$(pwd)
while [ "$d" != "/" ]; do
  [ -f "$d/.claude/tdd/config.json" ] && META="$d" && break
  d=$(dirname "$d")
done
if [ -n "$META" ]; then
  find "$META/docs" "$META/plans" -name "dictionary.md" -not -path "*/archives/*" 2>/dev/null | while read f; do
    json="${f%.md}.json"
    [ ! -f "$json" ] && echo "旧辞書: $f"
  done
  if [ ! -f "$META/docs/acts.json" ] && [ -d "$META/plans/archives" ]; then
    echo "台帳未導入（plans/archives にアーカイブ済みプランあり）"
  fi
fi
```

- 旧辞書が見つかった場合は `/tdd-update vocab` を案内する。
- 台帳未導入が出た場合は `/tdd-update acts`（遡及登記）を案内する。実行するかどうかはユーザーが決める。
