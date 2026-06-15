# 2026-06-16 /tdd-vocab add の廃止と test-tree.md の導入

## 発端

skill-creator を使ってスキル群の外部レビューを行い、2つの問題が指摘された。

1. `/tdd-vocab add` が tdd-feedback と tdd-refactor から呼ばれているが、tdd-vocab にその定義がない
2. tdd-feedback が「tdd-run が残した利用仮説」を前提にするが、tdd-run にその手順がない

---

## /tdd-vocab add の廃止

### なぜ削除されたか

`add` が必要だった文脈を整理すると:

- **tdd-feedback**: 既存プロジェクトの `plans/<project>/dictionary.md` に概念を追記する
- **tdd-refactor（コードベース横断）**: どのプロジェクトにも属さない新概念を登録する

前者は `plans/<project>/dictionary.md` が既に存在するので、直接追記すれば済む。
後者は「B の同一性」のような重要な発見であり、`plans/<name>/` を新規に作る規模の変更になる。

この規模の変更には problem.md が必要で、problem.md があれば `/tdd-vocab plan` がそのまま使える。
つまり、`add` が担うべき仕事は存在しなかった。

### tdd-refactor の B 独立化フロー（変更後）

1. `plans/<name>/problem.md` を書く（独立したコンテキストとして扱う理由を記述）
2. `/tdd-vocab plan` を呼んで `plans/<name>/dictionary.md` を作る
3. コードの切り出しを実施する

tdd-refactor は意図的にメインフローの外に置かれている（必要なときに呼ぶもの）。
tdd-run のセッション終了に言及は不要。

---

## test-tree.md の導入

### 経緯

以前 `tdd-design` というスキルがあり `design.md` を生成していた。
このスキルが廃止されたとき、利用仮説の記録場所も失われた。

tdd-feedback は「使う前にコミットした利用仮説と照合する」ことで自作自演を防ぐ
（rationale 第8節）が、その仮説の在り処が宙ぶらりんになっていた。

### 設計の判断

tdd-run の手順4（ツリーをユーザーに提示して確認を得る）は、
利用仮説をコミットする自然なタイミングでもある。
実装が始まる前に「使ったらこうなるはず／こうなったら外れ」を書いておける。

`plans/<project>/test-tree.md` に2つを収める:
- できるのツリー（視覚的な構造）
- 利用仮説

ツリーと仮説を同じファイルにするのは、両者が同じ確認の場で生まれるからであり、
tdd-feedback がセッション開始時に一枚で参照できるようにするためでもある。

### 変更後のフロー

- **tdd-run 手順4**: ツリー確認 → test-tree.md 生成 → 骨格テスト生成
- **tdd-feedback 前提**: `test-tree.md` をセッション開始時に読む
- **tdd-feedback 手順2**: `test-tree.md` の利用仮説を照合の一次ソースにする

---

## 実施した変更

- `tdd-refactor/skill.md` — B の独立化: `/tdd-vocab add` → `problem.md` + `/tdd-vocab plan`
- `tdd-feedback/skill.md` — 手順5: `/tdd-vocab add` → `plans/<project>/dictionary.md` に直接追記
- `tdd-run/skill.md` — 手順4に `test-tree.md` 生成を追加、成果物リストに追加
- `tdd-feedback/skill.md` — 前提・bash ブロック・手順2 に `test-tree.md` を追加
