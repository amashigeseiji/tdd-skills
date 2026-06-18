# TDD支援スキル

Claude Code で、問題定義・語彙定義・実装を分離して開発を進めるためのスキルセットです。

## 概要

このワークフローは **問題 → 辞書 → テスト → 実装 → フィードバック** の5層構造を持ちます。中心の3層（辞書・テスト・実装）は AI が作業する場で、辞書とテストは実装の意味を定義するガードレールです。AI はこの意味空間の中で動きます。外側の2層（問題・フィードバック）は現実との接地点で、「何が適切か」と「使ったらどうだったか」を持ち込みます。

設計と実装を分離するアプローチとは異なり、TDD を参照源としつつ、AI が意味空間の中で構築と分解をできることを目指しています。

## ワークフロー

```
┌──────────┐   ┌───────────────────────────────────────┐   ┌────────────┐
│ problem  │──▶│                 run                   │──▶│  feedback  │
│          │   │  ┌────────┬────────────┬──────────┐   │   │            │
│          │   │  │  dict  │ test tree  │   impl   │   │   │            │
│          │   │  └────────┴────────────┴──────────┘   │   │            │
└──────────┘   └───────────────────────────────────────┘   └────────────┘
     ▲                                                           │
     └───────────────────────────────────────────────────────────┘
```

```
初回（既存プロジェクト導入時）:
  /tdd-init
  → .claude/tdd/config.json、.claude/tdd/scaffold.sh、docs/dictionary.md

セッション1: 問題定義
  /tdd-problem
  → plans/<project>/problem.md
  → /tdd-userstory create（自動）→ plans/<project>/user-story.md

セッション2: 実装
  /tdd-run
    worktree 作成 → 辞書計画（/tdd-vocab plan）→ ツリー確定 → 骨格テスト生成
    末端から実装 → ウォークスルー → 統合
    /tdd-userstory run（自動）→ tests/acceptance/<project>.spec.ts
    observations.md 生成 → commit → worktree remove

セッション3: フィードバック（tdd-run の直後に起動）
  /tdd-feedback
    語彙レビュー → /tdd-vocab promote
    ソリューション構造レビュー → 利用インタビュー → findings.md 生成
  → ズレがあれば problem / run へ戻り、次のループへ

auto モード:
  /tdd-cycle <project>  → tdd-run を自律実行 → 完了後に一括報告

任意のタイミング:
  /tdd-refactor  → 蓄積したコードに対していつでも起動
```

辞書とテストがどのタイミングで作られどう参照されるかの設計意図は [`docs/rationale.md`](docs/rationale.md) を参照してください。

## 生成ファイル

基本的に使うスキルは `/tdd-problem`・`/tdd-run`・`/tdd-feedback` の3つです。辞書管理や受け入れテストの生成は各スキルが内部で呼び出します。

| 層 | 成果物 | 生成スキル | 参照先 |
|---|---|---|---|
| 問題 | `plans/<project>/problem.md` | `/tdd-problem` | `/tdd-run` |
| 辞書 | `plans/.../dictionary.md` → `docs/dictionary.md` | `/tdd-run`（内部で `/tdd-vocab plan`）、`/tdd-feedback`（内部で promote） | `/tdd-run`（実装中） |
| テスト | テストツリー、`tests/acceptance/` | `/tdd-run` | 実装の意味定義・CI |
| 実装 | `src/` 等 | `/tdd-run` | `/tdd-feedback`、`/tdd-refactor` |
| フィードバック | `plans/<project>/findings.md` | `/tdd-feedback` | `/tdd-problem` または次の `/tdd-run` |

## セットアップ

リポジトリをクローンしたら:

```bash
bash bin/update.sh
```

`skill.md` を持つすべてのディレクトリを `~/.claude/skills/` にシンボリックリンクします。完了後、Claude Code を**再起動**してスキルを認識させてください。

以降の更新は `/tdd-update` で行えます（`git pull` + 新規スキルのリンク追加）。
