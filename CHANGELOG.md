# CHANGELOG

## 2026-07-08

### Changed
- **`tdd-vocab migrate` に「en 未設定エントリへの一括付与」（移行2）を追加** —
  `en`（PascalCase 英語名）が必須化される前に登録されたエントリが残っている辞書は
  `dict-write.js check` が常に exit 1 になる（tenjuu99-blog の feedback F-06 で発覚。
  該当 95 件中 46 件）。migrate を「.md → .json 変換（移行1）」と「en 一括付与（移行2）」の
  2 部構成に再編。移行2は対象洗い出し → 英語名の提案とユーザー承認 → `dict-write.js update`
  で en のみパッチ → check で確認、の手順。命名判断を含むため承認なしでは書き込まない。

## 2026-07-07

### Added
- **`dict-write.js` を追加（辞書への書き込み専用スクリプト）** — JSON 配列への要素追加・更新が
  文字列置換ベースの Edit ツールで表現しづらく、python 等で `dictionary.json` を直接操作する
  抜け道になっていた（dictionary-read-write.md P-03）。`add`（wip 自動付与）・`update`（フィールド
  差し替え）・`promote`（wip 除去、参照未解決は安定層保護のためエラー）・`remove`・`check`
  （検証のみ）を提供し、すべての書き込みはフォーマット・重複・context 存在・参照整合の検証を
  通過しないと実行されない。入力は stdin または `--file` の JSON（末尾カンマ許容）。
  `tdd-vocab plan`（手順6）・`tdd-vocab promote`（手順1〜3）・`tdd-run`（手順4のパターン登録と
  ソリューションドメイン語彙登録、手順7.5の src 書き込み）を dict-write.js を使うよう更新し、
  辞書の読み取り（dict-search.js）と書き込み（dict-write.js）の分離が完成した。

### Changed
- **tdd-feedback の手順順序を反転（利用インタビュー → 成果物レビュー → promote 判断）** —
  従来は「成果物レビュー → promote → インタビュー」の順で、インタビュー直前に
  ソリューションへの棲みつきを再構築し、利用の事実より先に安定層へコミットしており、
  「設計を擁護しない」「白紙で聞く」の規律と矛盾していた。反転により「使ったらどうだったか」が
  語彙昇格の入力になる。あわせて役割分担を明記（レビュー=「昇格すべきか」の判断、
  promote=機械的整合性の検証）し、skill.md 内の NOTE（要検討）を解消した。
- **tdd-feedback のクローズ判断 A にテストのライフサイクル二層化を追加** —
  アーカイブ時、辞書の安定層に昇格した概念に対応する describe() ブロックだけを残し、
  それ以外は畳む（`tests/acceptance/` は常に残す）。プランは畳まれるのにテストだけが
  文脈を失って残り続ける非対称（テストの孤児化）を防ぐ。
- **tdd-feedback の成果物レビューに test-tree.md（初期仮説）と現在の describe() 構造の
  比較を追加** — test-tree.md は初期仮説の記録として読み、初期ツリーと最終ツリーの差分を
  「このプランで理解がどう動いたか」の記録として評価する。

### Fixed
- **`#参照` の解決を前方一致から既知概念名の最長一致に変更（dict-search.js / dict-write.js）** —
  従来はトークンを切り出してから双方向の前方一致で照合していたため、`#問` のような
  不完全な参照が「問題」に偽解決され、promote の安定層保護（参照未解決エラー）を
  すり抜けられた。今後は # の直後に既知の概念名がそのまま続く場合のみ、最長一致で
  解決する（`#問題定義` は「問題」ではなく「問題定義」に解決）。これにより
  スペースを含む名前（`#dwell in（棲みつく）` 等）への参照も正しく1つの名前として
  解決され、dict-search.js の関連展開（`-d`）・孤立チェック（`-o`）・一覧の関連表示が
  正確になった。既存の docs/dictionary.json は変更なしで全参照が解決される。
## 2026-07-03

### Added
- **`dict-search.js` に `-a`/`--all`（全件一覧）と `-o`/`--orphans`（孤立概念チェック）を追加** —
  キーワードや filter を知らないと何も見られない仕様だったため、作業仮説辞書の全体像確認や
  「どの概念からも参照されていないか」の確認時に `dictionary.json` を直接 cat/python 操作する
  抜け道になっていた。`tdd-vocab plan`（手順5）・`tdd-vocab check`（孤立概念・一貫性の確認）・
  `tdd-run`（辞書ルックアップ節）から、cat の代わりにこれらのフラグを使うよう更新。

## 2026-07-02

### Fixed
- **`config.json` の `meta_repo` 廃止** — メタレポルートの絶対パスをファイルに保存していたため、
  clone/移動先ごとに値が食い違い、コミットもできなかった。`meta_repo` はもともと
  「config.json が見つかったディレクトリ」と常に同じ値なので、`bin/find-config.sh` が
  そのディレクトリ自体を返す形に変更し、ファイルへの保存を廃止（`bin/dict-search.js` も同様）。
  `config.json` は存在自体がメタレポルートの目印となり、内容は空でよい。
  各 skill.md の `<meta>` 取得手順を「find-config.sh が返したディレクトリ」に統一。

## 2026-07-01

### Added
- **依存グラフ検索アダプタの導入**
  - `bin/depgraph-search.js` を新設。正規化済み依存グラフ JSON を読み、`--to`/`--from`/`-d`/`-s`
    で問い合わせる共有スクリプト（`dict-search.js` と同じ位置づけで、プロジェクトごとに再生成しない）。
  - `/tdd-scaffold depgraph` を新設。プロジェクト固有の `.claude/tdd/depgraph-regen.sh`
    （言語別ツールを実行し、出力を上記の正規化 JSON に変換するだけの薄いスクリプト）と
    `config.json` の `depgraph.regen`/`depgraph.graph`/`depgraph.entry_points` を生成する
    （任意機能・未設定でも従来通り動作する）。
  - `tdd-run` 7.5 に「実装 → 依存グラフ」の孤立ノード検出（6点目）を追加。構成に組み込まれていない
    実装を偽陰性リスクとして findings に記録する。
  - `tdd-vocab init` の手順2・5に、依存グラフの fan-in/fan-out を境界推測の傍証として使う手順を追加。
  - `tdd-vocab check`（`check-vocab.js`）に `src` フィールドの実在チェックと `@vocab` との矛盾検出を追加。
  - `format.json`/`tdd-vocab/skill.md` に `src` フィールドの所有権（`tdd-run` が書く・`tdd-vocab` は読むだけ）を明記。
  - 詳細設計は `docs/references/archives/dependency-graph-in-tdd-run.md` を参照（組み込み完了により archives へ移動）。

### Changed
- **tdd-vocab plan のトークン削減**
  - `problem.md` フォーマットに `**コンテキスト:**` フィールドを追加。ヒアリング中にスコープの
    呼び名が自然に出てきた場合のみ書く（`tdd-problem`）。これまで `tdd-vocab plan` は毎回このフィールドが
    無いままユーザーに聞き直していた。
  - `tdd-vocab plan` 手順3を、problem.md の「`/tdd-run への申し送り`」に既にある概念候補リストを
    起点にする形に変更。ゼロから本文を解析する手間を削減。
  - `tdd-vocab plan` の手順冒頭に、problem.md は `tdd-run` が起動時に既に読み込んでいるので
    再度 Read/cat しない旨を明記。同一セッション内での二重読み込みを防ぐ。

## 2026-06-30

### Added
- **パターン辞書層と照合ステップ** (PR #7)
  - `tdd-run` でパターン辞書（`pattern.json`）を参照し、実装の照合ステップを追加。
  - `docs/references/pattern.md` を `docs/references/archives/` に移動。

## 2026-06-28

### Added
- **dict-search.js の機能拡張** (PR #6)
  - `--summary / -s` フラグ: 語彙のサマリーのみ出力。
  - `-n / --name-only` フラグ: 名前のみ出力（トークン節約）。
  - 複数ワード検索対応。
  - `contexts` フィールドも検索対象に追加。

### Changed
- **スキル指示文を英語化** (PR #6)
  - 各スキルの `skill.md` の指示文を英語に統一。日本語の意図コメントは残す方向。
  - `tdd-feedback`・`tdd-refactor` の辞書ロードを `dict-search` に統一。
  - `config.json` 探索ロジックを `bin/find-config.sh` に切り出し。

- **トークン削減と auto モード廃止** (PR #5)
  - `tdd-run` の auto モードを廃止。
  - `dict-search.js` 呼び出しをトークン節約フラグ付きに更新。

- **サブコマンド手順を `subcmds/` に分離** (PR #3)
  - `tdd-vocab` のサブコマンド手順を個別ファイルに分割。スキル本体のトークン消費を削減。

### Fixed
- `dictionary.md` への残存参照を `dictionary.json` に修正 (PR #3)
- 現状の仕様と合わない例示を除去 (PR #4)

### Migration
- `tdd-vocab migrate` で旧形式 `dictionary.md` を `dictionary.json` に変換可能（`/tdd-update` 実行時に自動案内）。

## 2026-06-27

### Added
- **型定義の観点** (PR #1)
  - `tdd-run`・`tdd-refactor` に型定義（型エイリアス・インターフェース）の観察点を追加。

### Changed
- **辞書を JSON 形式に移行・オンデマンド検索に切り替え** (PR #2)
  - `dictionary.md` → `dictionary.json` に移行。
  - `bin/dict-search.js` を新設し、各スキルから呼び出す形に変更。
  - `@vocab` アノテーションに `[context]` オプションを追加。

## 2026-06-26

### Changed
- git 操作をスキルから除去（`tdd-run` 等でのコミット指示を削除）。

## 2026-06-23–24

### Added
- イシュートラッカー連携ブランチ対応（`external-branch-skill` との連携設計）。
- `branch_name_template`・`plans` サブレポ分離・external-branch-skill PR チェック追加。

### Fixed
- CWD 非依存のパス解決に変更（`config.json` 経由）。
- symlink 経由のパス解決を修正。

## 2026-06-17

### Added
- **`tdd-scaffold` スキルを新設**
  - scaffolding を「指示関係の保守」として再設計。

## 2026-06-16

### Added
- **`tdd-refactor` スキルを新設**
  - リファクタリングフェーズを独立スキルとして分離。
- **`tdd-userstory` スキルを新設**
  - ユーザーストーリーを `tdd-problem`・`tdd-run` の入力源として統合。
- `tdd-run` に scaffolding ステップを追加し、命名の宣言性を強制する仕組みを整備。
- `rationale` §7 にシンボルとしての命名・インターフェース宣言の説明を追加。

### Changed
- テストツリーの命名を日本語に戻し、辞書に `en:` フィールドを追加。

## 2026-06-14–15

### Added
- GPL v3 ライセンスを追加。
- `tdd-problem` に辞書参照・複数問題・問題ネットワークの仕組みを追加。
- 辞書・テスト・実装の相互参照マップ出力機能。
- `docs/rationale.md` を追加（スキルの設計思想ドキュメント）。

### Changed
- `tdd-vocab` のコマンド体系を整理（`survey→init`、`init→plan`）。

## 2026-06-10

- 初回コミット。`tdd-problem`・`tdd-vocab`・`tdd-workflow` の原型を設置。
