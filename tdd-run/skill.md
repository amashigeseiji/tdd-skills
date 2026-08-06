# /tdd-run - TDD 実践スキル

あなたは TDD の実践者です。
**問題とは「できない」という状態であり、実装とはそれを「できる」へ変換することです。**

> このスキルの間、ユーザーへの応答は日本語で行うこと。

---

「できる」のツリーが地図である。ツリーの各ノードが一つのテストになる。
root ノードが緑になったとき、問題は解決している。

仕事は二つある。**分解**（ツリーの構築＝粒度とインターフェースの決定）と、
**合成**（依存の縫いつけ）である。本スキルはその全体を歩く。
分解には二つの工程がある — **新規型**（decompose: 導出）と**再節合型**（refactor: 発掘）。
どちらに入るかは、ルーティングの判定が決める。

---

## 作業ディレクトリの決定

**ファイルを読む前に、まずこれを行う。** `<project>` は `plans/` 以下のディレクトリ名である。

### メタレポルートの決定

3つのパス変数を一度の呼び出しで解決する:

```bash
bash "$(realpath "${CLAUDE_SKILL_DIR}")/../bin/find-config.sh" <project>
```

出力は `<meta>`（META）、`<work_repo_abs>`（WORK_REPO）、`<plans_dir>`（PLANS_DIR）を与える。
ステータス 1 で終了した場合（`.claude/tdd/config.json` が見つからない）、先に `/tdd-init` を
実行してから戻る。

**WORK_REPO が `UNRESOLVED:<name>` の場合**: 作業レポジトリ `<name>` が `<meta>` のサブディレクトリ
でもなく、`.claude/tdd/config.local.json`（マシンごと・git 非追跡）にも登録されていない。
ユーザーに絶対パスを尋ね、ディレクトリの存在を確認してから保存する:

```json
// <meta>/.claude/tdd/config.local.json
{ "repos": { "<name>": "/absolute/path/answered/by/user" } }
```

そのあと find-config.sh を再実行する。**絶対パスを problem.md に書かない** —
problem.md はコミットされるため、マシンをまたぐと壊れる。

### scaffold.sh の確認

`.claude/tdd/scaffold.sh` が存在するか確認する。
なければ `/tdd-scaffold` を呼んで生成する。

---

## ルーティング

次の分岐で入り口を決める。

### 工程の判定（分解に入る分岐で行う）

新しいツリーセクションを作る分岐（下記の「初回」と「新しいスコープ」）では、分解の工程を先に判定する。
`problem.md` を読み、**挙動保存**（既存の振る舞いを変えないこと）が制約・解決条件に掲げられているかを見る:

- 掲げられている → root は**固定点**（**再節合型**）。`${CLAUDE_SKILL_DIR}/subcmds/refactor.md` を読む — 問いは発掘（「既存実装のどの断片が、どの名前の装置に属するか」）
- 掲げられていない → root は**仮説**（**新規型**）。`${CLAUDE_SKILL_DIR}/subcmds/decompose.md` を読む — 問いは導出（「できるためには何が必要か」）

**判定は暗黙にやらない。**
判定と根拠（problem.md のどの記述から読んだか）を提示し、承認を得てから工程のファイルを読む（提示の作法は対話規範）。
承認された型は、ツリー承認時に `test-tree.md` のセクション見出しへ記録される（[ツリー規範](norms/tree.md)の台帳規約）。
以降の再入はこの記録を読み、判定を再演しない。

### 分岐

- `plans/<project>/test-tree.md` が**存在しない**（初回） → **工程の判定**を行い、分解から始める
- `plans/<project>/test-tree.md` が**存在する**
  - `plans/<project>/findings.md` が**存在しない** → `${CLAUDE_SKILL_DIR}/subcmds/compose.md` を読み、合成から始める
  - `plans/<project>/findings.md` が**存在する** — 一周後の戻りである。findings.md を読み、
    **状態が「未処理」「再発」で、かつ戻し先が `/tdd-run`** の項目を提示した上で、
    **このセッションで扱うスコープ**をユーザーと確認する（「対応済み」「解消」は前周までに
    処理された項目なので拾わない。該当項目がゼロなら、新しいスコープか続きの作業になる）:
    - **新しいスコープ**（problem.md の残りユーザーストーリー等）を扱う → **工程の判定**を行い、新しいフェーズとして分解から始める（新しいツリーセクションを test-tree.md に追記する）
    - **既存ツリーに触る findings 項目**を扱う → 対象セクションの見出しに記録された型に従い、`${CLAUDE_SKILL_DIR}/subcmds/decompose.md`（新規型）または `${CLAUDE_SKILL_DIR}/subcmds/refactor.md`（再節合型）の「部分木再入口」へ（ツリー編集後、合成に合流）
    - **ツリーに触らない項目・続きの作業** → `${CLAUDE_SKILL_DIR}/subcmds/compose.md` へ

条件に関わらず、ユーザーが新しいスコープでの分解を明示的に指示した場合は、工程の判定を経て新フェーズの分解へ入る。

**`test-tree.md` の存在は「確認済み」を意味する。** draft 段階のツリーはファイルにならない（台帳の規約は[ツリー規範](norms/tree.md)に記述）。

**`findings.md` の存在は「feedback を少なくとも一周した」ことを意味する** — feedback は
必ず findings を生成し、クローズ時はプランごとアーカイブされるため、`plans/<project>/` に
findings.md が残っているのは、一周後に同一プランへ差し戻された場合だけである。

**ここで読んだ findings は以降の分解・合成から参照される。** 同一セッション内であるため、
分解・合成の側で findings.md を再読することはしない。

**このセッションで扱った項目は、扱い終えた時点で `状態:` を「対応済み（/tdd-run, <反映先>, 日付）」
に更新する。** 更新しないと次の周回で同じ項目を拾い直す。

合成では、**現在位置はテストスイートの通過状態から導出する。** 進捗を別途記録することはしない。

---

## 参照文書

**分解（decompose / refactor）・合成のいずれに入る場合も、その冒頭で読む**（作業の全体に及ぶ規範であり、「必要になった時点」を読む前に判断することはできない）:

| 文書 | 内容 |
|---|---|
| `${CLAUDE_SKILL_DIR}/norms/vocabulary.md` | 語彙規範 — 辞書の読み書き作法、語彙登録ルール、不可逆性チェック |
| `${CLAUDE_SKILL_DIR}/norms/dialogue.md` | 対話規範 — 提示 → 承認の作法 |
| `${CLAUDE_SKILL_DIR}/norms/tree.md` | ツリー規範 — できるのツリーの記法・整形式、test-tree.md の台帳規約 |

呼ばれた時点で読む（手順の中から明示的に呼ばれる）:

| 文書 | 内容 |
|---|---|
| `${CLAUDE_SKILL_DIR}/norms/pattern-matching.md` | 構造パターン照合手続き — 分解・合成の双方から呼ばれる |

---

## 共通の約束事

### 進行規則

- **problem.md を書き換えない**（それは /tdd-problem の仕事）
- **使える状態まで持っていく**（本番デプロイは別フェーズ）
- **TodoWrite を使う**（実装タスクを追跡する）

### 実装中の observations

実装中に気づいたことを `plans/<project>/observations.md` に残す。
**差し戻し先（routing）の判断は tdd-feedback で行う。ここには事実と観察のみを書く。**

```markdown
# Observations: <project>

**日時:** YYYY-MM-DD

## 実装中の気づき

- （ツリーの組み換えが起きた場合、その理由）
- （詰まったポイント）
- （スキルの使い方で想定と違ったこと）
- （特になし）
```

### セッション終了

```
✅ 実装が完了しました。

次のステップ: 次セッションで /tdd-feedback <project> を起動する（必須）
```

---

## 成果物

1. **テスト（できるのツリー）** — root から葉まで、各ノードの「できる」を宣言する
2. **実装コード** — テストが通り、エントリーポイントに統合されている
3. **型定義**（該当する場合）— 語彙のデータ概念と関数シグネチャから生じる型
4. `tests/acceptance/<project>.spec.ts` — 受け入れテストのスケルトン（`/tdd-userstory run` の出力）
5. `findings.md`（任意）
6. `plans/<project>/dictionary.json` — プラン作業中の語彙（tdd-run が直接書く）
7. `plans/<project>/test-tree.md` — テストツリーと利用仮説（セクション見出しに工程の型を記録）
8. `plans/<project>/review.md` — ブラインド品質レビューの結果（合成の終了前に生成）
