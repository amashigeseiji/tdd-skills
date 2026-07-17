---
argument-hint: init|plan|promote|annotate|check|migrate
---

# /tdd-vocab - 語彙管理スキル

あなたは語彙管理者です。
`docs/dictionary.json`（安定）と `plans/<プラン名>/dictionary.json`（プラン作業中）を管理します。

## 語彙セットの役割

語彙セットはこのプロジェクトの**行動可能空間を定義します**。

tdd-run が「できる」のツリーを構成するとき、語彙セットにある概念がノードの候補になります。
語彙にない概念でノードを埋めることを抑制し、AIがこのプロジェクト固有の言葉で考えるよう導きます。
これは禁止ではなく方向づけです——語彙にない概念が必要なら wip に登録して使います。

**語彙は互いにリンクして体系をなします。**
各エントリの定義は他の概念を参照することで、語彙全体がネットワーク状に連結されます。
このリンクなしに概念をアドホックに追加していくと、語彙は一貫性を失います。

**語彙はアプリケーションドメイン・ソリューションドメイン・パターン・UI・UIパターン・デザイントークンの6層に分かれます。**

- **アプリケーションドメイン**: ユーザーが問題について語るときに使う言葉。実装手段に依存しない。実装前に定義する。
- **ソリューションドメイン**: 問題をどう解くかの語彙。実装の装置・変換・操作の層。テストツリー確定時に登録し、ウォークスルーで実装と照合して確定させる。
- **パターン** (`domain: "pattern"`): テストツリーの構造的決定を安定させる語彙。ステートマシン・パイプラインのような既知パターン、またはプロジェクト内で抽出した独自パターン。`context: null` でクロスカッティング（特定ドメイン境界に属さない）であることを示す。tdd-run のパターン照合ステップで採用が決まったときに登録する。
- **UI** (`domain: "ui"`): 概念への操作ハンドル（例: 削除ボタンが記事を参照する）、または他のUIエントリをまとめる器（例: ヘッダーが操作部品を含む）。`context` を持ち、属するBCに紐づく。空間的な配置は書かない。tdd-run のUI意図確認ステップで登録する。
- **UIパターン** (`domain: "ui-pattern"`): master-detail のような、一連の操作を支える構造パターン。`pattern` と同じ形（`heuristic` 必須 + `components` で役割名）だが、照合対象が違う——`pattern` はテストツリーの形、`ui-pattern` は `ui` エントリ同士の関係の形。`context: null`。tdd-run のUIパターン照合ステップで採用が決まったときに登録する。
- **デザイントークン** (`domain: "design-token"`): 「削除系は警告色」のような、意味づけられたトンマナ規約。生の色数値・px値は含めない。`context: null`。プロジェクト全体で一度決めて使い回す性質のため、`tdd-run` ではなく `/tdd-vocab init` で初期抽出する。

実装の手段（PostgreSQL・React・OOPのClass等）はここでは明示的に語彙登録しません。
それらは問題領域の概念をどう実現するかの選択であり、エントリの定義の中で必要に応じて言及するに留めます。

## 呼ばれ方

| 呼び出し | タイミング | 目的 |
|---------|-----------|------|
| `/tdd-vocab init` | 既存プロジェクト導入時・BC が増えたとき | コードベースを俯瞰してコンテキストを発見し、語彙を抽出して docs/dictionary.json を作る（design-token の初期抽出も行う） |
| `/tdd-vocab plan` | tdd-run 開始前 | コンテキスト名を確定し、既存 BC との関係を探り、アプリドメイン語彙を plans/ に作る |
| `/tdd-vocab promote` | ユーザーの任意タイミング | plans/ の語彙を docs/dictionary.json に昇格する |
| `/tdd-vocab annotate` | アノテーションなしで書き進めた後・既存コードへの導入時 | 実装を読んで辞書と照合し @vocab / @test アノテーションを付与する |
| `/tdd-vocab check` | 整合性が気になるとき | 孤立概念・リンク切れ・矛盾を確認する |
| `/tdd-vocab migrate` | tdd-skills を更新後・旧プロジェクトに導入するとき | 旧フォーマットを現行に移行する（`dictionary.md` → `dictionary.json` 変換、旧エントリへの `en` 一括付与） |

## 実行

引数に応じて対応するファイルを Read して手順を実行する:

| サブコマンド | ファイル |
|------------|---------|
| `init`     | `${CLAUDE_SKILL_DIR}/subcmds/init.md` |
| `plan`     | `${CLAUDE_SKILL_DIR}/subcmds/plan.md` |
| `promote`  | `${CLAUDE_SKILL_DIR}/subcmds/promote.md` |
| `annotate` | `${CLAUDE_SKILL_DIR}/subcmds/annotate.md` |
| `check`    | `${CLAUDE_SKILL_DIR}/subcmds/check.md` |
| `migrate`  | `${CLAUDE_SKILL_DIR}/subcmds/migrate.md` |

## パスの解決

`docs/dictionary.json` と `plans/*/dictionary.json` は**メタレポルート**からの絶対パスで参照する。
各サブコマンドの冒頭で CWD から上に向かって `.claude/tdd/config.json` を探し、`<meta>` を確定する:

```bash
bash "$(realpath "${CLAUDE_SKILL_DIR}")/../bin/find-config.sh"
```

以降の `docs/` および `plans/` パスはすべて `<meta>/docs/` と `<meta>/plans/` として扱う。
辞書の検索には `node "$(realpath "${CLAUDE_SKILL_DIR}")/../bin/dict-search.js"` を使う。`-s` で1行サマリー、`-n` で名前フィールドのみ検索、`-d1` で関連エントリ展開、複数キーワードを並べると OR 検索。全件を見たいとき（キーワードでは探せない）は `-a` (`--all`)、孤立概念チェックは `-o` (`--orphans`) を使う。
**辞書の中身を確認するときに `dictionary.json` を `cat` や python 等で直接読み出さない**（検索・一覧・孤立チェックは常に dict-search.js を使う）。
書き込み（追加・更新・昇格・削除）には `node "$(realpath "${CLAUDE_SKILL_DIR}")/../bin/dict-write.js"` を使い、`dictionary.json` を Edit/Write や python 等で直接操作しない。使い方は各サブコマンドの手順に、全オプションは `dict-write.js --help` にある。

**`src` フィールドの所有権:** `src` は `tdd-run` の7.5が書き込む代表1ファイルの簡易キャッシュ。`tdd-vocab` の各サブコマンドはこれを読むだけで書き込まない。概念の実装箇所を1件だけ確実に知りたい場合は `grep -rn "@vocab: <概念名>"` する（多対多で正式、`check` が整合性を保証する）。

---

## 制約

- **docs/dictionary.json に書き込むのはこのスキルの promote と migrate のみ**（`dict-write.js promote` は新規・再定義とも反映する / 移行時は `update`。tdd-run は plans/*/dictionary.json に書く）
- **promote はユーザーの承認なしに行わない**
- **再定義は必ず check を経る**
- **新しいエントリを作る前に、既存語彙で表現できないかを確認する**
- **関係フィールドは必須。空のまま登録しない**（独立した原始概念で他の概念と関係を持たない場合は `definition` にその旨を明記する）

## 成果物

- `docs/dictionary.json` — 安定した語彙ネットワーク（ユーザーが受け入れた概念）
- `plans/<プラン名>/dictionary.json` — 未受け入れの語彙（実装中に発見された概念）
