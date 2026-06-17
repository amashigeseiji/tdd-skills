# TDD支援スキル

Claude Code で、問題定義・語彙定義・実装を分離して開発を進めるためのスキルセットです。

## 概要

開発を **問題定義 → 実装（TDD）→ 利用フィードバック** の流れで進めます。
セッションを分割することでトークン消費を抑えつつ、各フェーズの責務を明確にして
「問題」と「解決」、「事実」と「解釈」の混同を防ぎます。
利用フィードバックは、使ってみて生じたズレを次のループに戻す入口で、全体は再帰的に回ります。

語彙管理（`/tdd-vocab`）は問題領域の概念を**コンテキスト**（関心の範囲）ごとに管理します。
辞書の各コンテキストは「アプリケーションドメイン（問題の言葉）」と「ソリューションドメイン（解法の装置）」の2層に分かれます。
実装フェーズ（`/tdd-run`）が辞書に直接書き込み、`/tdd-vocab promote` で安定版に昇格します。

### なぜフェーズを分けるか

問題定義と解決案の策定を同じフェーズで行うと、解決手段が問題の記述に紛れ込む
（「正規化が必要」「パディングが足りない」は解決領域の言葉であり、問題そのものではない）。
使用の事実とその解釈を同じ場で書くと、接地した事実と作り手の作文が混ざる。

責務を分ける:

- **問題定義** — 何が適切か。問題の言葉だけで書く。解決手段は一切書かない
- **実装（TDD）** — 何を実現するか（系の定義・語彙定義）と、どう実装するか（テスト・合成）を
  一貫して行う。利用可能な状態にする
- **リファクタリング** — 別セッションで、辞書・テスト・実装・problem を横断して理解とコードのズレを観察し、コードに転写する。複数の run の後に全コンテキストを同時に見る立場が重要
- **語彙管理** — 問題領域の概念をネットワーク状に管理する。AIの行動可能空間を定義するガードレール
- **利用フィードバック** — 実際に使い、何が起きたかを集め、利用仮説と照合する。ズレが次のループを開く

### なぜ設計を独立フェーズにしないか

「設計フェーズ」を別に設けると、分解が事前の成果物として固定され、実装者はそれを受け取るだけになる。
しかし分解と合成は実装の責務であり、実装しながら合成の形が見えてきて初めて系の真の姿が分かる。
だから `/tdd-run` が系の定義から分解・テスト・合成まで一貫して行う。

## スキル構成

### `/tdd-problem` - 問題定義

**目的:** 問題領域を問題の言葉で確定する

- 観察された現象から問題を言語化（解決手段を持ち込まない）
- 「何が適切か」「解決したと言える状態」を定性的に定義
- 問題を語る上で登場した概念を申し送り（語彙定義の種）
- problem.md 保存後に `/tdd-userstory create` を呼び、ユーザーストーリーを生成する
- **成果物:** `plans/<project>/problem.md`、`plans/<project>/user-story.md`
- **やらないこと:** 解決手段・テスト・実装を書かない

### `/tdd-userstory` - ユーザーストーリー

**目的:** ユーザーストーリーを BDD 形式で定義し、受け入れテストとして実行する

| 呼び出し | タイミング | 目的 |
|---------|-----------|------|
| `/tdd-userstory create` | `/tdd-problem` 終了時 | `problem.md` から Given/When/Then のユーザーストーリーを生成する |
| `/tdd-userstory run` | `/tdd-run` 手順8の後 | ストーリーをアサーションつき受け入れテストに変換して実行する |

- ストーリーは problem.md の言葉（実装詳細なし）で書く
- `run` はプロジェクトのテスト設定を検出し（Playwright 優先）、`tests/acceptance/` にテストを生成する
- アサーションは Then 節を根拠に、実装コードを読んで具体的な手段を補う。Then 節が曖昧・実装が見つからない場合のみ `// TODO:` を残す
- Playwright 使用時は `playwright.config` の `webServer` を確認し、未設定なら自動設定する（開発サーバーの起動・停止を Playwright が管理）
- 実行エラーは `/tdd-run` が分析・対応・リトライを担う（最大3回）
- **成果物:** `plans/<project>/user-story.md`（create）、`tests/acceptance/<project>.spec.ts`（run）

### `/tdd-run` - 実装（TDD）

**目的:** 何を実現するかを定義し、テスト駆動で実装して利用可能な状態にする

- フィーチャー着手前に `/tdd-vocab plan` を呼び、コンテキスト名を確定して既存 BC との関係を探る
- 「できる」のツリーを構成する。ユーザーの確認後、即座に2つを行う:
  - **骨格テストの生成**: ツリーの全ノードを `describe()` としてテストファイルに書く（`it()` は TODO）
  - **ソリューションドメイン語彙の登録**: ノード名のうち装置・変換・操作に相当するものを `plans/<project>/dictionary.md` に書く
- ルートのテストは最初に書いて red のまま置き、末端から実装して上へ合成する
- ルートが green になったら辞書・テスト・実装のウォークスルーを行い、名前の一貫性を確認する
- 変更を利用可能な状態にする（入口に組み込み、実アプリで動かして確認）
- **完了の定義:** テスト緑だけでなく、利用可能（実アプリで動かせる）になって完了
- **成果物:** テスト（「できる」のツリー）、利用可能になった実装、`plans/<project>/dictionary.md`への追記

### `/tdd-scaffold` - スキャフォールディング初期化

**目的:** プロジェクト固有のスタブ生成スクリプトを作成する

- プロジェクトの言語・フレームワーク・ディレクトリ規約を調査する
- `.claude/tdd/scaffold.sh` を生成して保存する（`<Subject> <verb> <context>` の呼び出し規約）
- スクリプトはソースファイルとテストファイルのスタブを生成し、`@vocab`・`@test` アノテーションを付与する
- `/tdd-run` のセッション開始時に `.claude/tdd/scaffold.sh` が存在するかを確認し、なければ自動で呼び出す（ユーザーへの確認不要）
- **成果物:** `.claude/tdd/scaffold.sh`（実行権限付き）
- **やらないこと:** 実装の中身の生成・既存スタブの上書き（同一主語に対しては追記）

### `/tdd-refactor` - リファクタリング

**目的:** 別セッションで辞書・テスト・実装・problem を横断して観察し、コードに転写する

- 実装文脈から離れた視点で5つの観点から観察する:
  (a) 意味的な整合（辞書定義と実装の読み比べ）、
  (b) 構造的な正確さ（@vocab/@test のリンク確認）、
  (c) 理解可能性、
  (d) 未使用コードの削除、
  (e) コンテキスト横断の構造パターン（技術的 crosscut / ドメインを示す crosscut / B の同一性）
- 発見した問題と実施計画をユーザーに提示し、承認後に変更する
- 複数の tdd-run の後にコードベース全体を見渡すと、個別セッションでは見えなかった構造パターン（B の同一性）が検出できる
- **成果物:** 変更されたコード、更新されたアノテーション、必要な場合は辞書の wip 登録
- **やらないこと:** 振る舞いの変更・problem.md の書き直し・承認なしの辞書 stable 更新

### `/tdd-feedback` - 利用フィードバック

**目的:** tdd-run 完了後に必ず起動する。語彙・ソリューションのレビュー、利用インタビュー、findings のルーティングを一本化する

- **語彙レビュー**: wip 語彙が問題に対するソリューションとして適切かを照合。問題なければ `/tdd-vocab promote` を実行
- **ソリューション構造レビュー**: observations.md を読み、ツリーの分解が適切だったかを確認
- **利用インタビュー**: 実際に使ったユーザーから操作の事実・利用仮説の照合・印象を収集（設計を擁護しない、誘導しない）
- **findings のルーティング**: 全発見をここで一本化。tdd-run からは戻さない
- **別セッションで動かす**（実装の文脈から離れるため）
- **成果物:** `plans/<project>/findings.md`（戻し先つき）、`docs/dictionary.md`（promote 後）
- **やらないこと:** 設計の擁護・誘導質問・コード修正

### `/tdd-cycle` - オーケストレーター（自動実行）

**目的:** problem.md を起点に tdd-run → tdd-refactor を自律実行し、完了後にユーザーへ一括報告する

- ユーザーへの確認なしに実行フェーズを完走する（auto mode）
- 自律的に決定した事項（ツリー構造・モジュール境界・利用仮説）を `auto-decisions.md` に記録する
- 完了後に語彙・テストツリー・リファクタリング計画を一括報告する
- 報告フェーズでユーザーが promote と refactor の承認を行う
- **前提:** `plans/<project>/problem.md` が存在すること（/tdd-problem で作成済み）
- **成果物:** テスト・実装・`auto-decisions.md`・`refactor-plan.md`（+ promote 後の `docs/dictionary.md`）

### `/tdd-vocab` - 語彙管理

**目的:** 語彙のコンテキスト構造を管理し、`docs/dictionary.md` の品質を保つ

語彙セットはAIの行動可能空間を定義するガードレール。
概念は互いにリンクして体系をなす（孤立した概念はアドホックな追加の兆候）。
辞書はコンテキスト（関心の範囲）ごとにセクションを持ち、各コンテキストが
アプリケーションドメイン（問題の言葉）とソリューションドメイン（解法の装置）の2層に分かれる。

| 呼び出し | タイミング | 目的 |
|---------|-----------|------|
| `/tdd-vocab init` | 既存プロジェクト導入時 | コードベースを俯瞰してコンテキストを発見し、語彙を抽出して `docs/dictionary.md` を作る |
| `/tdd-vocab plan` | tdd-run 開始前 | コンテキスト名を確定し、既存 BC との関係を探り、アプリドメイン語彙を `plans/` に作る |
| `/tdd-vocab promote` | `/tdd-feedback` 内の語彙レビュー後 | `plans/<project>/dictionary.md` の語彙を `docs/dictionary.md` に昇格する |
| `/tdd-vocab check` | 整合性が気になるとき | 孤立概念・リンク切れ・矛盾を確認する |

## ワークフロー

```
初回（既存プロジェクト導入時）:
  /tdd-vocab init
  → docs/dictionary.md（コンテキスト骨格）

セッション1: 問題定義
  /tdd-problem
  → plans/<project>/problem.md
  → /tdd-userstory create（自動実行）→ plans/<project>/user-story.md

セッション2: 実装（対話モード）
  /tdd-vocab plan  → plans/<project>/dictionary.md（アプリドメイン語彙、コンテキスト確定）
  /tdd-run
    開始時: worktree 作成 → .claude/tdd/scaffold.sh を確認 → なければ /tdd-scaffold を自動実行
    ツリー確定 → 骨格テスト生成 + ソリューションドメイン語彙を plans/ に書く
    実装完了 → ウォークスルー（辞書・テスト・実装の照合）
    統合完了 → /tdd-userstory run（自動実行）→ tests/acceptance/<project>.spec.ts
    終了時: observations.md 生成 → git commit → worktree remove
  → テスト（「できる」のツリー）+ 実装（利用可能な状態）+ アサーションつき受け入れテスト

セッション3: フィードバック（必須・tdd-run の直後に起動）
  /tdd-feedback
    語彙レビュー → 問題なければ /tdd-vocab promote を実行
    ソリューション構造レビュー（observations.md を素材に）
    利用インタビュー（実際に使ってから）
    findings.md 生成（全ルーティングをここで決定）
  → plans/<project>/findings.md、docs/dictionary.md（promote 後）
  → ズレがあれば problem / run へ戻り、次のループへ

セッション2（別法）: 実装（auto モード）
  /tdd-cycle <project>
  → tdd-run を自律実行 → tdd-feedback の成果物レビューを自律実行
  → 完了後に一括報告 → 利用インタビューとクローズ判断をユーザーと実施

任意のタイミング:
  /tdd-refactor  → 蓄積したコードに対していつでも起動できる
```

### フィードバックの戻し先

実装中・利用中の発見（findings.md）は、性質によって戻し先を振り分ける:

| 発見の性質 | 戻し先 |
|-----------|--------|
| **問題の発見**（適切さの条件自体の見落とし、新たな制約） | `/tdd-problem`（problem.md へ） |
| **ツリーの再構築**（分解・合成の見直しが必要） | `/tdd-run`（次サイクル） |

```
「問題の発見」 → /tdd-problem で problem.md 更新 → /tdd-run
「ツリーの再構築」 → /tdd-run で次サイクル
```

## 成果物の連鎖

```
problem.md ──→  user-story.md  ──→  「できる」のツリー + 実装  ──→（refactor）──→  findings.md
（何が適切か）   （BDD仕様）          （系の定義・語彙・テスト・        理解とコードの       （使ってどうだったか）
                                     利用可能な状態）                  ズレを転写
                                             │                                          │
                                     tests/acceptance/                                  │
                                     （アサーションつき受け入れテスト）                     │
     ↑                                                                                  │
     └──────────────（ズレ → findings → problem/run に戻り、次のループ）──────────────────┘

plans/<project>/dictionary.md  →（promote）→  docs/dictionary.md
（作業中の語彙。コンテキスト×2ドメイン）         （安定した語彙ネットワーク）
```

## ファイル構造

```
plans/
  <project>/
    problem.md               # 問題定義（/tdd-problem）
    user-story.md            # BDD形式のユーザーストーリー仕様（/tdd-userstory create）
    dictionary.md            # 作業中の語彙（/tdd-vocab plan・/tdd-run が書く）
    test-tree.md             # テストツリーと利用仮説（/tdd-run）
    auto-decisions.md        # 自律決定の記録（/tdd-cycle auto モード時のみ）
    refactor-plan.md         # リファクタリング計画（/tdd-cycle・/tdd-refactor）
    findings.md              # 実装・利用からの戻り（事実＋解釈・戻し先つき）。削除せず history/ へ
    history/
      problem-v1.md
      findings-run-v1.md     # 反映後にアーカイブ（対応バージョンを明記）

docs/
  dictionary.md              # 安定した語彙ネットワーク（/tdd-vocab promote 後）

src/
  xxx.js                     # 実装（/tdd-run）
  xxx.test.js                # 「できる」のツリー（/tdd-run が構成）

tests/
  acceptance/
    <project>.spec.ts        # アサーションつき受け入れテスト（/tdd-userstory run）

.claude/
  tdd/
    scaffold.sh              # スタブ生成スクリプト（/tdd-scaffold が生成、/tdd-run が呼び出す）
```

## 各成果物の要点

### problem.md（/tdd-problem）
- 問題（観察された症状と、その背後の問題を区別）
- 障害・制約
- 範囲外
- 解決したと言える状態（定性的）
- /tdd-run への申し送り（語彙定義の種になる概念・開いている問い）

### user-story.md（/tdd-userstory create）
- ロール・目的・価値（誰が何をしたいか）
- Given/When/Then のシナリオ（正常系・境界/エラー系）
- problem.md の言葉で書く（実装詳細・技術名は書かない）

### findings.md（/tdd-run・/tdd-feedback）
- 「事実」の節: 操作の事実・利用仮説の照合・印象（ユーザーの言葉）
- 「解釈・原因の仮説」の節: 発見ごとに **戻し先**（/tdd-problem か /tdd-run か）を明記
- **削除せず**、反映後は対応バージョンを明記して history/ へアーカイブ

### docs/dictionary.md（/tdd-vocab promote）
- コンテキスト（`##`）ごとにアプリケーションドメインとソリューションドメインの2層を持つ
- 各エントリは他の概念とのリンク（関係）を必ず持つ
- `plans/<project>/dictionary.md` が作業中の語彙（promote で昇格する）

## 制約まとめ

| | やること | やらないこと |
|---|---|---|
| /tdd-problem | 問題の言語化 | 解決手段・テスト・実装 |
| /tdd-userstory | BDD仕様の生成・アサーションつき受け入れテストの実行 | problem.md の変更・テストの green 化 |
| /tdd-scaffold | scaffold.sh の生成（/tdd-run が自動で呼び出す） | 実装の中身の生成・既存スタブの上書き |
| /tdd-cycle | tdd-run + tdd-feedback 成果物レビューの自律実行・一括報告 | 実行中のユーザー確認・promote の無断実施 |
| /tdd-run | 語彙定義・系の定義・テスト構成・実装・利用可能な状態にする・observations.md 生成 | 問題の再定義・findings のルーティング・vocab promote・本番デプロイ |
| /tdd-refactor | 辞書・テスト・実装の横断観察・コード変更・語彙 wip 登録 | 振る舞いの変更・problem.md の書き直し・承認なしの辞書 stable 更新 |
| /tdd-feedback | 語彙レビュー・ソリューション構造レビュー・利用インタビュー・findings ルーティング・vocab promote | 設計の擁護・誘導質問・ユーザーの代わりの解釈・コード修正 |
| /tdd-vocab | コンテキスト発見・語彙の整合性確認・昇格 | docs/dictionary.md の直接編集（promote 以外）・ユーザー承認なしの昇格 |

共通: 時間見積もりはしない。

## トラブルシューティング

### problem.md が見つからない
`/tdd-problem` で先に問題を定義する。

### テストが5回連続で失敗
1. 続ける　2. findings.md を生成して問題定義へ　3. ツリーの分解を見直す

### 実装中に問題の見方が変わった
発見を findings.md に記録（「問題の発見」として）、次セッションで `/tdd-problem` へ。

## このスキルを再設計するとき

スキルの構造そのものを変えるなら、まず「なぜこの形か」を読む（使うときは不要）:

- `CLAUDE.md` — 再設計時の入口（このリポジトリで作業すると自動ロード）
- `docs/rationale.md` — なぜこの形か（思考枠組み／深いモデルの本体）
- `docs/notes/` — そこに至った思考・対話の記録
