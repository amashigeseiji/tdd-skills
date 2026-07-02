# /tdd-vocab check — 整合性確認

## 目的

語彙ネットワーク全体の整合性を確認する。

## 確認項目

**体系性の確認:**
- **孤立概念**: 関係フィールドが空、またはどの概念からも参照されていない
  → 独立した原始概念であれば問題ないが、理由が書かれていなければ要確認。検出には次を使う（`dictionary.json` を cat して目視で確認しない）:
  ```bash
  node "$(realpath "${CLAUDE_SKILL_DIR}")/../bin/dict-search.js" -o [<plans_dir>]
  ```
- **リンク切れ**: 関係フィールドのアンカーリンク先（`[概念名](#概念名)`）が辞書に存在しない
  → 参照先を追加するか、リンクを修正する
- **双方向性の確認**: `contains: B` を持つ A に対して、B に `belongs_to: A` が書かれているか（逆も同様）
  → 片側だけの場合は意図的かを確認。意図的な場合は補足に理由が書かれていれば問題なし

**一貫性の確認:**

まず全件を一覧する（`dictionary.json` を cat して目視で確認しない）:

```bash
node "$(realpath "${CLAUDE_SKILL_DIR}")/../bin/dict-search.js" -a -s [<plans_dir>]
```

- **重複**: 同じ概念が複数のエントリとして登録されていないか
- **矛盾**: 定義が互いに矛盾していないか
- **競合**: docs/dictionary.json と plans/<プラン名>/dictionary.json で同一概念が異なる定義を持っていないか

**未解決の確認:**
- wip に再定義フラグのあるエントリが放置されていないか

**実装・テストとの整合性:**

以下の順で2つのスクリプトを実行する（辞書ファイルだけでは確認できない）。

```bash
# 1. カバレッジマップを生成（語彙 → 実装 → テストの接続状況）
node ${CLAUDE_SKILL_DIR}/scripts/generate-map.js [src-dirs]
# src-dirs 省略時は src, lib, packages を探索。docs/map.json に出力される。

# 2. 整合性チェック（壊れ・欠けを検出）
node ${CLAUDE_SKILL_DIR}/scripts/check-vocab.js [test-dir]
# test-dir 省略時は tests/ を使用。
```

`generate-map.js` が出す「繋がっているもの（正側）」と `check-vocab.js` が出す「壊れているもの・欠けているもの（負側）」を合わせて読み、整合性の全体像を報告する。

`check-vocab.js` が確認する内容:
- `@vocab` の参照先エントリが辞書に存在するか
- `@test` の参照先ファイルが存在するか
- stable エントリに対応する `@vocab` を持つ実装が存在するか（逆引き）
- テストディレクトリ名が辞書コンテキストの `dir` フィールドと対応しているか
- エントリの `src` が指すファイルが実在するか
- `src` が指すファイルに、対応する `@vocab` が実際についているか（`src` と `@vocab` の矛盾検出。
  `src` は `tdd-run` が書く代表1ファイルの簡易キャッシュなので、実装がリネーム・分割された後に
  古いパスのまま残ることがある）
