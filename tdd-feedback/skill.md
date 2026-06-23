# /tdd-feedback - TDD利用フィードバックスキル

tdd-run が完了したら必ず起動する。**別セッションで動かす**（実装の文脈から離れるため）。

このセッションでは三つの役割を順に担い、最後にこのプランをクローズするか戻すかを判断する:

1. **成果物レビュー** — 語彙とソリューション構造をまとめて評価し、問題なければ promote
2. **利用インタビュー** — 実際に使ったユーザーから事実と印象を集める
3. **クローズ判断** — findings をもとにプランを閉じるか、同一プランに戻すか、新規プランに移すかを決める

ルーティング（どこに戻すか、どう閉じるか）はこのセッションで一本化する。tdd-run からは戻さない。

---

## 前提

1. **tdd-run が完了していること**（実装コード・テスト・observations.md が存在する）
2. **変更が利用可能な状態であること**（実アプリで動かせる）
3. 利用インタビューは**実際に使ってから**行う。未使用なら、インタビューを待つか「ウォークスルー」だと明示する

---

## 読み込み

まず CWD から上に向かって `.claude/tdd/config.json` を探し、パスを確定する:

```bash
d=$(pwd)
while [ "$d" != "/" ]; do
  [ -f "$d/.claude/tdd/config.json" ] && cat "$d/.claude/tdd/config.json" && break
  d=$(dirname "$d")
done
```

- `<meta>` = config.json の `meta_repo`
- `<work_repo_abs>` = problem.md の `**作業ディレクトリ:**`（なければ `<meta>`）
- `<wt>` = `<work_repo_abs>/tdd/<project>`

worktree がなければ再追加する:

```bash
if [ ! -d "<wt>" ]; then
  git -C <work_repo_abs> worktree add <wt> tdd/<project>
fi
```

```bash
cat <wt>/plans/<project>/problem.md
cat <wt>/plans/<project>/test-tree.md 2>/dev/null
cat <wt>/plans/<project>/observations.md 2>/dev/null
cat <wt>/plans/<project>/dictionary.md 2>/dev/null
cat <meta>/docs/dictionary.md 2>/dev/null
```

---

## 手順

### 1. 成果物レビュー

語彙とソリューション構造をセットで評価し、簡潔なレポートを作る。

**語彙の評価:**
- この概念群は問題に対するソリューションとして適切か
- 概念間の関係は整合しているか。孤立した概念はないか
- ソリューションはもっと構造化できるか

**ソリューション構造の評価:**
- observations.md の気づきを確認する
- test-tree.md のツリー構造は問題を解くのに適切だったか
- ツリーの組み換えが起きた場合、その原因は何か

**レポート形式（簡潔に）:**

```
## 成果物レビュー

語彙（plans/<project>/dictionary.md）:
- （問題なし / 懸念点があれば記述）

ソリューション構造（test-tree.md）:
- （問題なし / 懸念点があれば記述）

観察メモ（observations.md）:
- （特記事項があれば記述）
```

問題がなければ `/tdd-vocab promote` を呼び、wip 語彙を `docs/dictionary.md` に昇格する。
問題があれば promote を保留し、findings に記録する。

> **NOTE（要検討）:** `/tdd-vocab promote` の照合プロセス（辞書マッピングの検証）を
> レビュー前に読み込んでおくべきかは未決定。promote 側の検証がレビューと重複する可能性がある。

### 2. 利用インタビュー

インタビュアーとしての立場（重要）:
- **設計を擁護しない** — 実装の文脈から離れ、白紙で聞く
- **誘導しない** —「良かったですか？」と聞かない。起きたことを聞く
- **ユーザーの代わりに解釈しない** — 印象をほどくのはユーザー本人。あなたは解像度を上げる質問をする

#### 2-1. 操作の事実を取る

印象の前に、何が行われたかを取る。
- どんな操作をしたか（入力・設定・出力の粒度で）
- 出力そのものを見せてもらう（可能なら）

利用仮説に「試してほしい操作」があれば、操作の事実は最初から分かっている。照合から入れる。

#### 2-2. 利用仮説を照合する

test-tree.md の利用仮説（なければ problem.md の「解決したと言える状態」）に対し、実際に起きたことはどちらだったか。
- 期待どおりか、外れ側か、どちらとも言えないか
- 利用仮説そのものが的外れだった（測る相手が違った）なら、それも記録

#### 2-3. 印象の解像度を上げる

粗い印象を、ユーザー自身の言葉でほどいてもらう。あなたは解釈せず、ほどけるように問う。

- **場所を特定**: 「全部？ 特定のもの？ 画面のどこを見てそう感じた？」
- **軸を複数差し出して選ばせる**: 「一個一個が大きい？ 詰まってる？ 大小がバラついてる？ どれが近い？（複数可）」
- **対比で引き出す**: 「どうなっていたら『ちょうどいい』だった？」
- **結果に接地**: 「その出力は、目的に使えそうだった？」

### 3. findings.md の生成

1〜2 で集めた素材をまとめ、findings.md を生成する。**事実の節と解釈の節を必ず分ける。**

### 4. クローズ判断

findings.md の内容とユーザーの状態をもとに、以下の三択から選ぶ。

#### A. クローズ（アーカイブ）

条件:
- findings に満足している
- 辞書マッピングが完了している（promote 済み）
- この問題に対して特に不満がない

アクション:

worktree（`<wt>`）は「読み込み」セクションで確定済み。最新ファイルを同期してからアーカイブする:

```bash
# 最新の plans/<project>/ と docs/dictionary.md を worktree に同期
mkdir -p <wt>/plans/archives
cp -r <meta>/plans/<project>/. <wt>/plans/<project>/
cp <meta>/docs/dictionary.md <wt>/docs/dictionary.md 2>/dev/null || true

# worktree 内でアーカイブ先に移動
mv <wt>/plans/<project>/ <wt>/plans/archives/<project>/
```

`commit_plans` が `true` であれば、worktree 内でコミットする:

```bash
git -C <wt> add plans/archives/<project>/
git -C <wt> add -u
git -C <wt> commit -m "archive: <project>"
```

`commit_plans` が `false` の場合はコミットしない。

メタレポのクリーンアップ:

```bash
# plans/<project>/ を削除（worktree 側にアーカイブ済み）
rm -rf <meta>/plans/<project>/

# docs/dictionary.md を元に戻す（変更は worktree にコミット済み）
git -C <meta> checkout -- docs/dictionary.md 2>/dev/null || true
```

worktree を削除する（ブランチ `tdd/<project>` は残す）:

```bash
git -C <work_repo_abs> worktree remove <wt>
```

ユーザーへ報告する:

```
アーカイブは `tdd/<project>` ブランチにコミットしました。
```

#### B. 同一プランへの戻し

条件: 既存の problem が明らかに未達（problem の定義に問題があるか、解法に問題がある）

| 原因 | 戻し先 |
|------|--------|
| 問題定義の見落とし・条件の誤り | /tdd-problem（同一 plan） |
| ツリーの分解・合成の見直し | /tdd-run（同一 plan、次サイクル） |
| スキルとの摩擦（想定した使い方とのズレ） | tdd-skills リポジトリの更新 |

#### C. クローズ + 新規プランへの移行

条件: 問題自体は達成されているが、フィードバックを通じて**新しい問題意識**が生まれた、または**リファクタリング計画**の相談がある

- この plan 自体は A と同様にアーカイブする
- 新しい問題意識・リファクタ計画については、別の plan として `/tdd-problem` を起動するよう促す

---

## findings.md のフォーマット

```markdown
# Findings: <project>

**日時:** YYYY-MM-DD
**対象:** plans/<project>/

## 操作の事実
- 何をしたか（入力・設定・出力）。再現できる粒度で

## 利用仮説の照合
- 利用仮説: 使ったらこうなるはず／こうなったら外れ
- 実際: 期待側 / 外れ側 / どちらとも言えない

## 印象（ユーザーの言葉）
- 粗い印象 → 解像度を上げた言い直し（本人の言葉のまま）

## 発見（解釈・原因の仮説、戻し先つき）

### F-01: <タイトル>
**戻し先:** /tdd-problem（同一 plan） | /tdd-run（同一 plan） | tdd-skills | 新規 plan
**出どころ:** 成果物レビュー / 利用インタビュー / observations.md
**解釈・原因の仮説:** ...（事実ではなく仮説として）
**推奨される対応:** ...
```

---

## 制約

- **設計を擁護しない／誘導しない**（インタビュー中）
- **ユーザーの代わりに解釈しない**（解像度を上げる質問に徹する）
- **事実の節と解釈の節を混ぜない**
- **未使用の状態で想像を聞かない**（接地しない）
- **コードを書かない**（直しは戻し先のフェーズで）
- **時間見積もりはしない**

---

## 成果物

1. **plans/<project>/findings.md** — 成果物レビュー・利用インタビューの統合結果（戻し先つき）
2. **docs/dictionary.md** への昇格（語彙レビューが通った場合）
3. **plans/archives/<project>/** — クローズ時にプランディレクトリごとアーカイブ
