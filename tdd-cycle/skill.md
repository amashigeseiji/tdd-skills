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

## Phase 3: tdd-feedback（成果物レビュー）

tdd-run が成功したら、Agent ツールで別サブエージェントを起動する。

実行範囲: 成果物レビュー（語彙評価・ソリューション構造評価）のみ。
利用インタビューとクローズ判断はユーザー対話が必要なため Phase 4 で行う。

**エージェントへのプロンプト:**

> `${CLAUDE_SKILL_DIR}/../tdd-feedback/skill.md` を読み、`plans/<project>/` を対象に
> tdd-feedback の **手順1「成果物レビュー」のみ**を実行してください。
>
> - 語彙評価（plans/<project>/dictionary.md と problem.md の照合）
> - ソリューション構造評価（test-tree.md と observations.md の確認）
>
> 完了したら以下を返してください:
> - 成果物レビューのレポート（語彙・構造・観察メモの各評価）
> - promote 可否の判断（可: promote 実行済み / 否: 保留した理由）

---

## Phase 4: 一括報告とフィードバック継続

以下を読んで報告を組み立てる:

```bash
cat plans/<project>/test-tree.md
cat plans/<project>/auto-decisions.md
cat plans/<project>/dictionary.md
cat plans/<project>/observations.md 2>/dev/null
```

**報告フォーマット:**

```
## tdd-cycle 完了: <project>

### テストツリーと利用仮説
<test-tree.md の内容>

### 自律的に決定した事項
<auto-decisions.md の内容>

### 成果物レビュー結果
<Phase 3 のレポート>

---
🚀 次のアクション:
- [1] 利用インタビューを始める（/tdd-feedback 手順2〜4 を続けて実行）
- [2] 見送る（後で /tdd-feedback を単独で起動する）
```

---

## Phase 5: 利用インタビューとクローズ判断

ユーザーが [1] を選んだ場合、`${CLAUDE_SKILL_DIR}/../tdd-feedback/skill.md` の
手順2（利用インタビュー）〜手順4（クローズ判断）を続けて実行する。

[2] を選んだ場合は現状の成果物をそのまま残して終了する。

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
4. `plans/<project>/dictionary.md` — wip 語彙（promote 済みの場合は docs/dictionary.md にも反映）
5. `plans/<project>/auto-decisions.md` — 自律決定の記録
6. `plans/<project>/observations.md` — 実装中の気づき
7. `plans/<project>/findings.md` — フィードバック結果（利用インタビューを実施した場合）
