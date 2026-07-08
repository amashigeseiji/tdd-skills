# 多言語プロジェクトでの scaffold / depgraph の扱い

**日付:** 2026-07-09
**出典:** tenjuu99-blog `plans/archives/error-visibility/findings.md` の F-03（scaffold.sh と depgraph の
JS 前提が Swift プランと摩擦した）。同 findings の F-04（problem.md のパス誤記）も末尾に併記。
**関連:** `docs/references/archives/dependency-graph-in-tdd-run.md`（depgraph の当初設計）

## 背景 / 問題意識

tenjuu99-blog の error-visibility プラン（native-shell = Swift コンテキスト）で、
tdd スキル群の2箇所が JS 前提のために手動対応を強いられた:

- **scaffold.sh**: 生成済みのものが JS のコンテキストしか知らず、Swift 側は手動スキャフォールドになった
- **depgraph**: グラフが JS 側（dependency-cruiser）しかカバーしておらず、Swift ファイルに対する
  孤立ノードチェック（tdd-run 手順7.5）を手動でスキップする必要があった

表面的には「1プロジェクト=1言語」の暗黙仮定が原因。ただしもう一段深い層に、
正規化 JSON（`{ modules: [{ source, dependencies }] }`）が**ファイルパスをキーにしている**こと
自体が JS の特殊事情の直輸入だ、という問題がある。

## 診断: 依存関係の本体は言語レベル、ファイルは射影

依存関係の本体は言語レベルの単位（モジュール・クラス・シンボル）の間にある。
ファイルシステムへのマッピングは規約でしかない（PHP の PSR-4 が典型。namespace/class と
ファイルパスの対応は規約が保証しているだけ）。

JS が特殊なのは、言語仕様として **ES モジュール = ファイル**である点。依存の宣言（import 文）が
そのままファイルパスを指すので、「言語レベルの依存」と「ファイル間の依存」が恒等写像で一致する。
dependency-cruiser が手軽なのはこのおかげで、現在の正規化 JSON はこの一致を暗黙の前提にしていた。

Swift ではこの前提が二重に崩れる:

- import はモジュール（コンパイル単位）粒度で、モジュールは複数ファイルにまたがる
- 同一モジュール内のファイルは import なしで互いの型を参照する。
  つまりファイル間の依存が**宣言されない**（パースで取れない）

ただし「存在しない」わけではない。ビルド時の index store（シンボルの定義・参照の索引）から
「ファイル A がファイル B 定義のシンボルを参照している」というエッジを**導出**できる
（Periphery が未使用コード検出に使っているのがこれ。indexstore-db 経由）。
なお `swift package show-dependencies` で取れるのはパッケージ間依存（モジュール粒度・外部パッケージ）で、
ファイル単位のウォークスルー・孤立検出という用途には粒度が合わない。

## 設計

### 1. 正規化 JSON はファイルキーのまま維持し、意味づけを再定義する

インターフェース契約（ファイル→ファイルのエッジ）は変えない。利用者はエージェントで、
Read/Edit でファイル単位に世界を触る。ウォークスルーも孤立チェックも、最終的に欲しい答えは
「どのファイルを見に行くべきか」だから。

変えるのは意味づけ。「このファイルが import しているファイル」（JS 観）ではなく、
「**このファイルが参照している言語要素の定義元ファイル**」——言語レベル依存の
ファイルシステムへの射影——と定義し直す。

depgraph-regen.sh の責務は**この射影を計算すること**になる。計算方法は言語ごとに違う:

| 言語 | 射影の計算 |
|------|-----------|
| JS/TS | import 文のパース（恒等写像。dependency-cruiser 等） |
| Python | import のモジュール解決（ほぼ恒等。pydeps 等） |
| PHP | クラス参照を PSR-4 でファイルに解決 |
| Swift | index store からシンボル参照を導出（完成品 CLI なし。工数が一段重い） |

この対応表を skill.md に列挙する必要はない。生成者は LLM エージェントで、生成時にプロジェクトを
調査して言語の知識を持ち込める。skill.md に書くべきは（a）契約の意味づけ、（b）実施例ひとつ（JS）、
（c）退化の経路、の3つで足りる。

### 2. `depgraph.scope` — グラフのカバー範囲の宣言

現状の退化経路は「ツールがなければ depgraph 自体を未設定にする」の全か無かで、
「一部の言語だけカバーしている」という中間状態を表現できない。これが今回の摩擦の直接原因。

`config.json` に scope（このグラフがカバーする範囲の glob）を追加する:

```json
{
  "depgraph": {
    "regen": ".claude/tdd/depgraph-regen.sh",
    "graph": ".claude/tdd/dependency-graph.json",
    "entry_points": ["bin/*", "lib/server/**"],
    "scope": ["bin/**", "lib/**", "src/**"]
  }
}
```

呼び出し側の分岐:

- **tdd-run 手順7.5（孤立ノードチェック）**: 実装したファイルが scope のどの glob にも一致しなければ
  「グラフ対象外」としてスキップし、findings にその旨を記録する（「孤立」と誤判定しない）
- **tdd-vocab init**: scope 外のパスには depgraph を使わない（ディレクトリ境界の調査のみ）
- `scope` 未設定なら従来どおり全体をカバーしているとみなす（既存プロジェクト互換）

`entry_points` は scope 内に含まれている前提とする（含まれていなければ setup 時の設定ミス）。

### 3. scaffold.sh — コンテキスト→言語のマッピングで分岐

scaffold.sh は既に `context` を引数で受け取っており、多言語プロジェクトでは言語の境界と
コンテキストの境界がほぼ一致する（例: native-shell = Swift、それ以外 = JS）。
なので生成する scaffold.sh に context の分岐を持たせれば足りる:

```bash
case "$CONTEXT" in
  native-shell) SRC_ROOT="NativeShell/Sources"; EXT="swift" ;;
  *)            SRC_ROOT="src";                 EXT="js" ;;
esac
```

tdd-scaffold/skill.md 側の変更は2点:

- プロジェクト構造の調査手順に「言語が複数あるか（コンテキストごとに言語が違うか）」を加える
- 多言語の場合は「コンテキスト→（src ルート・拡張子・スタブ雛形）のマッピングで分岐させる」
  という指針を一段落足す

### 4. scope 外の領域の代替チェック

孤立ノードチェックの目的（どこからも参照されていないコードの検出）を、グラフを経由せず
直接達成するツールがある言語では、それを代替手段として使える（Swift なら Periphery）。

ただし今回は**機構化しない**（config.json に代替チェックコマンドの口を作らない）。
skill.md に「scope 外の領域は、言語ネイティブの未使用コード検出ツールがあれば手動チェックで
代替できる」と一文添えるに留め、必要が繰り返し生じたら機構化を再検討する。

### 5. グラフの限界の明記

どの言語でも射影は完全にはならない（動的 import、DI コンテナ、リフレクション、設定ファイル経由の
結線）。これは JS でも既にそう。グラフは「少なくともこの依存はある」という**下界**として使う道具であり、
孤立チェックの結果は反証（偽陰性リスクの兆候）であって証明ではない。この限界を skill.md に明記する。

## 実装タスク（2026-07-09 実装済み）

- [x] `tdd-scaffold/skill.md`:
  - 調査手順に多言語の確認を追加、多言語時の scaffold 生成指針（「多言語プロジェクト」節）を追加
  - depgraph 節の意味づけを「参照の定義元ファイルへの射影」に書き換え（下界としての限界も明記）
  - config.json の追記例に `scope` を追加、「他の言語」節に多言語時の部分カバー+代替チェックの指針を追加
- [x] `tdd-run/skill.md` 手順7.5: scope 判定の分岐を追加（scope 外は「グラフ対象外」として記録）
- [x] `tdd-vocab/subcmds/init.md`: scope 外パスでは depgraph を使わない旨を注記（手順2・5）
- [x] `CHANGELOG.md` に追記

## 開いた論点

- 代替チェックの機構化（config.json に fallback コマンドの口）: 必要が繰り返し生じてから
- Swift 用 depgraph-regen（index store からの射影計算）: native 系プランが増えて
  手動チェックのコストが目立ってきたら着手
- `bin/depgraph-search.js` は変更不要の想定（scope 判定は呼び出し側の手順に置く）だが、
  実装時に「scope 判定もスクリプト化したほうが確実か」は再確認する

---

## 併記: F-04（problem.md の作業ディレクトリパス誤記）

同じ findings から。検討の結果「検証漏れ」ではなく「コミットされるファイルに絶対パスを
書かせている設計」の問題と判明し、独立した設計になった。
→ `docs/references/workdir-path-resolution.md` を参照。同じ PR に同乗予定。
