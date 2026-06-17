# /tdd-init - TDDスキル初期化

新しいリポジトリにTDDスキルを**初めて導入するときに一度だけ**実行する。

以下を順に行う:

1. **plans コミット設定の確定** — `.claude/tdd/config.json` を作成する
2. **scaffold の初期化** — `/tdd-scaffold` を呼び、`.claude/tdd/scaffold.sh` を生成する
3. **語彙の初期化** — `/tdd-vocab init` を呼び、`docs/dictionary.md` を作成する

> BC が増えたときの `/tdd-vocab init` の再実行は、`/tdd-init` を経由せず直接呼ぶ。

---

## 手順

### 1. plans コミット設定の確定

ユーザーに確認する:

> `plans/` 以下のファイル（problem.md, test-tree.md, findings.md 等）をこのリポジトリの git にコミットしますか？

- **Yes** — アーカイブ時（tdd-feedback でクローズするとき）に自動でコミットする
- **No** — `plans/` を `.gitignore` に追加する

答えに応じて `.claude/tdd/config.json` を作成する:

```json
{ "commit_plans": true }
```

または:

```json
{ "commit_plans": false }
```

`.claude/tdd/` ディレクトリが存在しなければ作成する:

```bash
mkdir -p .claude/tdd
```

**No を選んだ場合**、`.gitignore` に `plans/` を追加する:

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

- `.claude/tdd/config.json` — plans コミット設定
- `.claude/tdd/scaffold.sh` — スタブ生成スクリプト（tdd-scaffold が作成）
- `docs/dictionary.md` — 初期語彙定義（tdd-vocab init が作成）
