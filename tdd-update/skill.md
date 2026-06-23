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
