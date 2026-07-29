# 構造パターン照合手続き（共通）

対象の形状を観察し、既知の構造パターンが当てはまるか確認する。これは「パターン照合」
（対象＝ツリー形状、domain=`pattern`、分解から呼ばれる）と、「UIパターン照合」（対象＝`ui`
エントリの関係の形状、domain=`ui-pattern`、合成の意匠完成から呼ばれる）の両方から呼ばれる共通手続き。

---

1. 既存のパターンエントリを辞書で検索する:
   ```bash
   node "$(realpath "${CLAUDE_SKILL_DIR}")/../bin/dict-search.js" -s --filter domain=<domain> <plans_dir>
   ```
2. `heuristic` フィールドを持つ各エントリについて、対象がそれに一致するか確認する。
   `domain=pattern` で辞書にまだエントリがない場合は、次のビルトインヒューリスティックを
   フォールバックとして使う:
   - 複数の状態ノードがあり条件によって遷移している → StateMachine 候補
   - ノードが一方向に連なり前の出力が次の入力になっている → Pipeline 候補
   - 一つのイベントに複数のノードが反応している → Observer 候補
3. 既知パターンの確認後、辞書にまだない新規パターンを対象が示唆していないかも検討する。
   AI・人間どちらも候補を提案できる。
4. 候補ごと（既知・新規問わず）:
   a. パターンの語彙で対象を再構成した案を作る
   b. 元の形と再構成案を並べて提示する
   c. ユーザーに再構成案の方が明確かどうか確認する
   d. 採用されたら、[語彙規範](./vocabulary.md)の**語彙登録ルール**（表＋承認 — 再構成案の提示は
      この代わりにならない。定義とヒューリスティックを示していないため）に従って提示し、登録する:
      ```bash
      node "$(realpath "${CLAUDE_SKILL_DIR}")/../bin/dict-write.js" add --to <plans_dir>/dictionary.json --discovered tdd-run <<'EOF'
      {"name":"<パターン名>","en":"<PatternName>","context":null,"domain":"<domain>","definition":"...","heuristic":"..."}
      EOF
      ```
      `wip` フィールドは自動付与される。新規パターンや役割分担があるものには `components`
      （役割名の配列）も付ける。
5. どの候補も当てはまらなければそのまま進める。
