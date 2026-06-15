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

## Phase 3: tdd-refactor

tdd-run が成功したら、Agent ツールで別サブエージェントを起動する。

**エージェントへのプロンプト:**

> `${CLAUDE_SKILL_DIR}/../tdd-refactor/skill.md` を読み、`plans/<project>/` を対象に tdd-refactor を実行してください。
>
> 実行範囲: 観察（5視点）と計画の作成まで。変更は実施しない。
>
> 完了したら計画を `plans/<project>/refactor-plan.md` に出力し、以下を返してください:
> - 発見した問題の件数（カテゴリ別）
> - refactor-plan.md のパス

---

## Phase 4: 一括報告

以下を読んで報告を組み立てる:

```bash
cat plans/<project>/test-tree.md
cat plans/<project>/auto-decisions.md
cat plans/<project>/dictionary.md
cat plans/<project>/refactor-plan.md 2>/dev/null
```

**報告フォーマット:**

```
## tdd-cycle 完了: <project>

### テストツリーと利用仮説
<test-tree.md の内容>

### 自律的に決定した事項
<auto-decisions.md の内容>

### 語彙（promote 候補）
<plans/<project>/dictionary.md のエントリ一覧>

### リファクタリング計画
<refactor-plan.md の内容、または「問題なし」>

---
次のアクションを選んでください:
- [1] 語彙を promote する（/tdd-vocab promote）
- [2] リファクタリング計画を承認して実施する
- [3] 両方
- [4] 見送る
```

---

## Phase 5: promote と refactor の実施

ユーザーの選択に応じて実行する。

**[1] promote:**
`${CLAUDE_SKILL_DIR}/../tdd-vocab/skill.md` の `/tdd-vocab promote` 手順に従い、
`plans/<project>/dictionary.md` のエントリをユーザーと確認しながら `docs/dictionary.md` へ昇格する。

**[2] refactor 実施:**
`plans/<project>/refactor-plan.md` の承認済み項目を実施する。
実施後にテストを実行して全 green を確認する。

**[3] 両方:**
promote → refactor の順で実施する。

**[4] 見送る:**
現状の成果物をそのまま残して終了する。

---

## 制約

- **Phase 2, 3 の実行中はユーザーへの確認を行わない**
- **Phase 5 はユーザーの明示的な選択のみで進む**
- **実行中に権限プロンプトが発生した場合は即座に停止し、ブロックされたコマンドをユーザーに報告する**
- **problem.md を書き直さない**（/tdd-problem の仕事）
- **docs/dictionary.md を直接編集しない**（/tdd-vocab promote 経由のみ）

---

## 成果物

1. **実装コード** — テストが通り、入口に組み込まれた状態
2. **テスト（「できる」のツリー）**
3. `plans/<project>/test-tree.md` — テストツリーと利用仮説
4. `plans/<project>/dictionary.md` — wip 語彙
5. `plans/<project>/auto-decisions.md` — 自律決定の記録
6. `plans/<project>/refactor-plan.md` — リファクタリング計画
