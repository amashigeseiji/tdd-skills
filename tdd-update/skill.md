# /tdd-update - スキルを最新版に更新

tdd-skills リポジトリを `git pull` し、新規スキルのシンボリックリンクを自動作成する。

## 呼び出し

```
/tdd-update
```

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

**辞書フォーマットの移行確認:**

以下を実行して、旧形式の `dictionary.md` がプロジェクトに残っていないか確認する:

```bash
d=$(pwd)
while [ "$d" != "/" ]; do
  [ -f "$d/.claude/tdd/config.json" ] && META="$d" && break
  d=$(dirname "$d")
done
if [ -n "$META" ]; then
  find "$META/docs" "$META/plans" -name "dictionary.md" 2>/dev/null | while read f; do
    json="${f%.md}.json"
    [ ! -f "$json" ] && echo "$f"
  done
fi
```

ファイルが見つかった場合は、`/tdd-vocab migrate` を実行するよう案内する。
