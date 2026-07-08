# workflow.md 典型例

このファイルは `.claude/tdd/workflow.md` のサンプルテンプレートです。
`/tdd-workflow` を初めて起動したときに、ヒアリングを経てプロジェクト固有の内容で生成されます。

---

## リポジトリ構成

（例: メタレポ/サブレポ構成）

- メタレポ (`<meta>`): `plans/` と `docs/` を管理する。`.claude/tdd/config.json` があるディレクトリ。
- サブレポ (`<work_repo_abs>`): 実装コードを管理する。`problem.md` の `**作業レポジトリ:**`（名前）から
  実行時に解決される（`bin/find-config.sh <project>`。`<meta>/<名前>` → なければ `.claude/tdd/config.local.json`）。

単一レポ構成の場合は `<meta>` == `<work_repo_abs>`。

## ブランチ・worktree

```bash
# worktree の作成（実装前）
git -C <work_repo_abs> worktree add <work_repo_abs>/tdd/<project> -b feature/<project>

# worktree の削除（マージ後）
git -C <work_repo_abs> worktree remove <work_repo_abs>/tdd/<project>
git -C <work_repo_abs> branch -d feature/<project>
```

## ステップ

### 1. 作業対象の選択

`plans/` 配下の未着手の `problem.md` から作業対象を選ぶ。
着手済みの判断: `test-tree.md` が存在しないものが未着手。

### 2. worktree の作成

上記のブランチ・worktree セクションのコマンドを実行する。

### 3. 実装（tdd-run）

`/tdd-run <project>` を実行する。

### 4. PR の作成

```bash
gh pr create --title "feat(<project>): <problem.md の1行タイトル>" --base main
```

PR 作成後、セッションを終了する（ユーザーは /clear してレビュー対応・マージを行う）。

### 5. マージ後の後処理

worktree を削除する（上記コマンド参照）。

### 6. フィードバック（tdd-feedback）

実際に使ってから `/tdd-feedback <project>` を実行する。

### 7. アーカイブ

tdd-feedback のクローズ処理で `plans/<project>/` を `plans/archives/<project>/` に移動する。

**アーカイブ後の git 処理:**

- メタレポ/サブレポ構成: メタレポにコミットする
  ```bash
  git -C <meta> add plans/archives/<project>/
  git -C <meta> commit -m "archive: <project>"
  ```
- 単一レポ（plans 追跡あり）: リポジトリにコミットする
  ```bash
  git -C <work_repo_abs> add plans/archives/<project>/
  git -C <work_repo_abs> commit -m "archive: <project>"
  ```
- 単一レポ（plans gitignore）: コミット不要。
