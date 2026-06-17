# /tdd-cycle - TDDオーケストレータースキル

> **試験的なスキル（2026-06-16 時点）**
> tdd-run と tdd-refactor を自律実行する試みであり、実運用での検証がまだ不十分です。
> 特に auto モードでの判断精度（ツリー構造・モジュール境界の自律決定）は、
> 実際に使いながら改善していきます。

problem.md を起点に tdd-run → tdd-refactor を自律実行し、完了後にユーザーへ一括報告する。
**実行中はユーザーへの確認を行わない。報告フェーズでのみユーザーと対話する。**

## 前提条件

- `plans/<project>/problem.md` が存在すること（/tdd-problem で作成済み）

`plans/<project>/dictionary.md` が存在しない場合、tdd-run が auto モードで語彙を作成する。

## 呼び出し

```
/tdd-cycle <project>
```

`<project>` は `plans/` 以下のディレクトリ名。

---

## Phase 1: 起動確認

**1. problem.md の確認:**

```bash
cat plans/<project>/problem.md
```

存在しない場合: 前提条件を満たしていないことをユーザーに伝え、中断する。

**2. 権限の事前確認:**

```bash
cat .claude/settings.json 2>/dev/null
cat .claude/settings.local.json 2>/dev/null
```

以下のパターンが allowlist に含まれているかを確認する:

| 用途 | 必要なパターン |
|------|--------------|
| テスト実行 | `npm test` または `bun test` |
| スクリプト実行 | `node` |
| ファイル操作 | `mkdir`, `mv` |
| 探索・照合 | `grep`, `find` |

不足しているパターンがある場合: 実行を開始せずにユーザーへ不足一覧を報告し、中断する。

両方の確認が取れたら次フェーズへ進む。ユーザーへの報告はしない。

---

## Phase 2: tdd-run（auto mode）

Agent ツールでサブエージェントを起動する。

**エージェントへのプロンプト:**

> `${CLAUDE_SKILL_DIR}/../tdd-run/skill.md` を読み、project `<project>` の tdd-run を **auto モード**で実行してください。
>
> auto モードのルール:
> - skill.md の `[auto]` マークがついた承認ポイントはすべてスキップして自律的に決定する
> - 決定内容（ツリー構造・モジュール境界・利用仮説）を `plans/<project>/auto-decisions.md` に記録する
> - ループ防止（5回連続失敗）が発動した場合のみ実行を停止し、その時点の状態を報告する
>
> 完了したら以下を返してください:
> - 結果: 成功 / 中断（理由）
> - 生成した成果物のパス一覧

サブエージェントが中断を報告した場合: ユーザーに状況を伝えて終了する。

---

## Phase 3: tdd-feedback

tdd-run が成功したら、Agent ツールでサブエージェントを起動する。
サブエージェントは `./tdd/<project>/` を作業ディレクトリとして動作する。

**エージェントへのプロンプト:**

> `${CLAUDE_SKILL_DIR}/../tdd-feedback/skill.md` を読み、project `<project>` の tdd-feedback を実行してください。
>
> 作業ディレクトリは `./tdd/<project>/` です。`plans/<project>/` 等のパスはこのディレクトリを基点として解釈してください。
> 全手順（成果物レビュー・利用インタビュー・クローズ判断）を実行してください。

---

## Phase 4: クリーンアップ

tdd-feedback 完了後、worktree を削除する:

```bash
git worktree remove ./tdd/<project>
```

ブランチ `tdd/<project>` は削除しない:
- **A/C（クローズ・新規移行）**: PR 作成のために残す
- **B（同一プランへの戻し）**: 次サイクルの tdd-run が既存ブランチを再利用する

---

## 制約

- **Phase 2 の実行中はユーザーへの確認を行わない**
- **実行中に権限プロンプトが発生した場合は即座に停止し、ブロックされたコマンドをユーザーに報告する**
- **problem.md を書き直さない**（/tdd-problem の仕事）
- **docs/dictionary.md を直接編集しない**（/tdd-vocab promote 経由のみ）

---

## 成果物

1. **実装コード** — テストが通り、入口に組み込まれた状態
2. **テスト（「できる」のツリー）**
3. `plans/<project>/test-tree.md` — テストツリーと利用仮説
4. `plans/<project>/dictionary.md` — wip 語彙（promote 済みの場合は docs/dictionary.md にも反映）
5. `plans/<project>/auto-decisions.md` — 自律決定の記録
6. `plans/<project>/observations.md` — 実装中の気づき
7. `plans/<project>/findings.md` — フィードバック結果
