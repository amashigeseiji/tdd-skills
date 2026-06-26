# /tdd-workflow - TDDワークフロースキル

プロジェクトの `workflow.md` を読み、plan 選択から archive までを orchestrate する。
**tdd-run / tdd-feedback はgitを知らない。git操作はこのスキルが workflow.md に従って担う。**

---

## 起動時の処理

### 1. config.json の読み込み

CWD から上に向かって `.claude/tdd/config.json` を探す:

```bash
d=$(pwd)
while [ "$d" != "/" ]; do
  [ -f "$d/.claude/tdd/config.json" ] && cat "$d/.claude/tdd/config.json" && break
  d=$(dirname "$d")
done
```

見つからない場合: `/tdd-init` を実行してから戻る。
`<meta>` = config.json の `meta_repo`。

### 2. workflow.md の確認

`<meta>/.claude/tdd/workflow.md` が存在するか確認する。

- **存在しない**: 後述の「workflow.md の生成」を行ってから続ける。
- **存在する**: そのまま読み込む。

### 3. 状態ファイルの確認

`<meta>/.claude/tdd/workflow-state/` 配下に `<project>.json` があるか確認する:

```bash
ls <meta>/.claude/tdd/workflow-state/ 2>/dev/null
```

- **ファイルがある**: 後述の「再開」フローへ。
- **ない**: 後述の「新規開始」フローへ。

---

## 新規開始

### plan の選択

`<meta>/plans/` 配下の `problem.md` を一覧する:

```bash
find <meta>/plans -maxdepth 2 -name "problem.md" | sort
```

`test-tree.md` が存在しないものを未着手として提示し、ユーザーに選ばせる。
`<project>` が確定したら状態ファイルを作成する:

```bash
mkdir -p <meta>/.claude/tdd/workflow-state
```

```json
{
  "project": "<project>",
  "step": "start"
}
```

### workflow.md の手順に従って実行

workflow.md の「ステップ」セクションを頭から実行する。
各ステップの完了時に状態ファイルの `step` を更新する。

tdd-run の呼び出しは Agent ツール経由（auto モード）で行う:

> `tdd-run/skill.md` を読み、project `<project>` の tdd-run を **auto モード**で実行してください。

tdd-feedback の呼び出しはメインスレッドで `/tdd-feedback` を呼ぶ（利用インタビューがあるため）。

---

## 再開

状態ファイルを読み、`step` の値に応じて続きから実行する。

```bash
cat <meta>/.claude/tdd/workflow-state/<project>.json
```

`step: "waiting-for-merge"` の場合: PR がマージされたかをユーザーに確認してから次へ進む。

---

## セッション境界（PR 作成後）

workflow.md の PR 作成ステップが完了したら:

1. 状態ファイルを更新する:

```json
{
  "project": "<project>",
  "step": "waiting-for-merge",
  "pr_url": "<PR の URL>"
}
```

2. ユーザーに通知して停止する:

```
PR を作成しました: <PR の URL>

コードレビュー対応・マージが完了したら:
  1. /clear で会話をリセットしてください
  2. /tdd-workflow を再起動してください
```

---

## 完了

tdd-feedback のクローズ（アーカイブ）が完了したら状態ファイルを削除する:

```bash
rm <meta>/.claude/tdd/workflow-state/<project>.json
```

---

## workflow.md の生成

`.claude/tdd/workflow.md` がない場合、ヒアリングして生成する。
`docs/workflow.md`（tdd-skills リポジトリの典型例）を参照しながら進める。

質問項目:

1. **リポジトリ構成**: 単一レポ / メタレポ＋サブレポのどちらか。サブレポの場合、`<work_repo_abs>` のパスはどこか。
2. **worktree**: 使うか。使う場合のブランチ名の規約は。
3. **PR**: `gh` コマンドで作成するか、手動か。ベースブランチは。
4. **plans の git 追跡**: git で追跡するか gitignore にするか。追跡する場合、アーカイブ後のコミット先は。

回答をもとに `<meta>/.claude/tdd/workflow.md` を生成する。

---

## 制約

- **tdd-run の実行中はユーザーへの確認を行わない**（auto モード）
- **problem.md を書き直さない**（/tdd-problem の仕事）
- **docs/dictionary.md を直接編集しない**（/tdd-vocab promote 経由のみ）
