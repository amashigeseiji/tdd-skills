# problem.md から絶対パスをなくす（作業ディレクトリの実行時解決）

**日付:** 2026-07-09
**出典:** tenjuu99-blog `plans/archives/error-visibility/findings.md` の F-04
（problem.md に存在しない絶対パスが記録されていた）
**関連:** `docs/references/multilang-scaffold-depgraph.md`（同じ findings の F-03。同じ PR に同乗予定）、
`docs/references/tdd-skills-feedback-todo.md` の D 7-2（find-config.sh 拡張。本件が一部を先取りする）

## 背景 / 問題意識

findings の F-04 は当初「tdd-problem がパスを検証せずに書き出している」という指摘だった。
しかし検討の結果、より深い問題が見つかった:

**problem.md は git にコミットされるファイルなのに、`**作業ディレクトリ:**` フィールドに
絶対パスを書かせている。** 絶対パスは「そのマシンでの解決結果」であって、複数台の PC で
リポジトリを扱うと壊れる。コミットされるファイルに書いてよいのは「解決の入力」
（マシン非依存の識別子）だけで、絶対パスへの解決は実行時にマシンごとに行うべきである。

誤記（F-04 の症状）は検証漏れというより、このフィールドの設計の帰結:

- tdd-problem のフォーマットは単一レポ構成でも**常に**このフィールドを書かせる
  （`tdd-problem/skill.md` フォーマット節「作業レポジトリを省略した場合は `<meta>` の絶対パス」）
- 一方 tdd-run の読み手側は、`作業レポジトリ` フィールドがないときこのフィールドを**読まない**
  （`<meta>` をそのまま使う）
- つまり単一レポ構成では「常に書かれ、検証されず、読まれもしない」フィールドになっており、
  誤った値が居座れる

## 現状の変数解決の整理

| 変数 | 現状の解決方法 | マシン非依存か |
|------|--------------|--------------|
| `<meta>` | find-config.sh が CWD から `.claude/tdd/config.json` を上方探索 | ○（実行時解決） |
| `**作業レポジトリ:**` | problem.md に記録されたサブディレクトリ**名** | ○（相対的） |
| `**作業ディレクトリ:**` | problem.md に記録された**絶対パス** | ×（本件の対象） |

`作業ディレクトリ` が本来担っていた役割は「作業レポジトリが `<meta>` のサブディレクトリでは
ない配置」への逃げ道。この逃げ道をマシン非依存にするのが本設計。

## 設計

### 1. `**作業ディレクトリ:**` フィールドを廃止する

problem.md にはマシン非依存の識別子（`**作業レポジトリ:**` の名前）だけを残す。
tdd-problem のフォーマットからこのフィールドを削除する。

### 2. 絶対パスへの解決は実行時に行う

解決アルゴリズム:

1. `作業レポジトリ` フィールドなし → `<work_repo_abs>` = `<meta>`（現行どおり）
2. あり、かつ `<meta>/<名前>` が存在 → それを使う（現行どおり）
3. どちらでもない → `.claude/tdd/config.local.json`（マシンごと・git 非追跡）の
   `repos.<名前>` を引く。存在検証して使う
4. 引けない → ユーザーに絶対パスを聞き、ディレクトリの存在を検証したうえで
   config.local.json に保存する（次回からは 3 で解決される）

```json
// .claude/tdd/config.local.json（コミットしない。マシンごとに作られる）
{
  "repos": {
    "example-app": "/Users/xxx/dev/example-app"
  }
}
```

tdd-init に「`.claude/tdd/config.local.json` を .gitignore に追加する」手順を足す。

### 3. 解決ロジックは find-config.sh に実装する（散文の重複を避ける）

この解決は tdd-run / tdd-feedback の2箇所に散文で重複することになるため、
find-config.sh を拡張して3変数を直接出力させる:

```
$ bin/find-config.sh <project>
META=/path/to/meta
WORK_REPO=/path/to/work-repo
PLANS_DIR=/path/to/meta/plans/<project>
```

- 引数なしなら従来どおり `<meta>` のみ出力（後方互換）
- 手順4（ユーザーに聞く）は対話が必要なのでスクリプトには入れない。
  スクリプトは `WORK_REPO=UNRESOLVED:<名前>` を返し、聞いて config.local.json に
  保存する部分だけをスキル側の散文に置く

これは保留中の D 7-2（find-config.sh 拡張。3スキルの重複散文 各~30行を削除）の一部先取り。
7-2 は D 内でも優先度が高い位置づけ（7-1 → find-config.sh 拡張 → 7-3）だったため、
先行しても D の議論を狭めない。

### 4. 既存 problem.md の移行

既存の problem.md に残る `**作業ディレクトリ:**` はフォールバックヒントに格下げする:

- 解決アルゴリズムの 3 で引けないとき、このフィールドがあり**かつパスが実在すれば**使う。
  そのうえで config.local.json への移行（保存とフィールド削除）を促す
- パスが実在しなければ（F-04 の症状）無視して 4 へ進む

## 実装タスク（2026-07-09 実装済み）

- [x] `bin/find-config.sh`: `<project>` 引数での3変数出力を追加（後方互換維持）。
  単一レポ/サブディレクトリ/config.local.json/レガシーフィールド/UNRESOLVED/エラー終了の
  6シナリオを手動テストで確認済み
- [x] `tdd-problem/skill.md`: フォーマットから `**作業ディレクトリ:**` を削除
  （`**作業レポジトリ:**` に「絶対パスは書かない」を明記）
- [x] `tdd-run/skill.md`・`tdd-feedback/skill.md`: 変数解決の散文を find-config.sh 呼び出し+
  UNRESOLVED 時の対話手順に置き換え
- [x] `tdd-init/skill.md`: config.local.json の .gitignore 追加手順
- [x] `CHANGELOG.md`: フィールド廃止とマイグレーションを記載
- [x] 横断確認: tdd-userstory は `<meta>/plans` のみ参照で解決不要。tdd-workflow の
  ヒアリング質問（サブレポのパス→名前）と `docs/workflow.md` の記述を追随させた

## 開いた論点

- config.local.json のスキーマに将来なにを載せるか（マシン依存の設定の受け皿になりうる。
  例: 依存グラフツールのローカルパス）。今回は `repos` のみ
