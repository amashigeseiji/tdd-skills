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

`.claude/tdd/` ディレクトリが存在しなければ作成する（**現在のディレクトリがメタレポルートであることを確認してから実行する**）:

```bash
mkdir -p .claude/tdd
```

答えに応じて `.claude/tdd/config.json` を作成する。`meta_repo` には現在のディレクトリの絶対パスを記録する:

```json
{
  "meta_repo": "/absolute/path/to/meta-repo",
  "commit_plans": true
}
```

または:

```json
{
  "meta_repo": "/absolute/path/to/meta-repo",
  "commit_plans": false
}
```

`meta_repo` の値は `pwd` で取得した絶対パスをそのまま書く。

**ブランチ名テンプレートの設定（任意）:**

イシュートラッカーと連携したブランチ名規約がある場合、続けて確認する:

> ブランチ名にイシュートラッカーの ID を含める規約はありますか？ある場合はテンプレートを教えてください。
> 例: `feature/{ID}/{project}` → `feature/VOCE-1234/voce-gigya-cleanup`
> （なければそのままEnter）

規約がある場合、config.json に `branch_name_template` を追加する:

```json
{
  "meta_repo": "/absolute/path/to/meta-repo",
  "commit_plans": true,
  "branch_name_template": "feature/{ID}/{project}"
}
```

テンプレートの変数:
- `{ID}`: problem.md の `**Issue ID:**` の値
- `{project}`: TDD プロジェクト名（plans/ のディレクトリ名）

規約がなければ `branch_name_template` は省略する（`tdd/<project>` ブランチが使われる）。

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

- `.claude/tdd/config.json` — メタレポルートの絶対パス（`meta_repo`）と plans コミット設定
- `.claude/tdd/scaffold.sh` — スタブ生成スクリプト（tdd-scaffold が作成）
- `docs/dictionary.md` — 初期語彙定義（tdd-vocab init が作成）
