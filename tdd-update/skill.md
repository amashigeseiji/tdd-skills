# /tdd-update - スキルを最新版に更新

tdd-skills リポジトリを `git pull` し、新規スキルのシンボリックリンクを自動作成する。

## 呼び出し

```
/tdd-update
```

---

## 実行

```bash
bash "$(realpath "${CLAUDE_SKILL_DIR}")/../bin/update.sh"
```

出力をそのままユーザーに表示する。

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
