# /tdd-vocab promote — wip から stable へ

## 目的

wip に積まれた概念をユーザーが受け入れ、docs/dictionary.json に昇格する。

## 手順

**1. wip の一覧をユーザーに提示する**

`plans/<プラン名>/dictionary.json` を読み、`entries` 配列の各概念を提示する。

各概念について確認する:
- 定義は適切か
- relations は正しく書かれているか（target の概念が存在するか）
- docs/dictionary.json の既存概念と矛盾しないか（検索には dict-search.js を使う）

**2. ユーザーの承認を得た概念を移動する**

`plans/<プラン名>/dictionary.json` の entries から該当エントリを削除し、`docs/dictionary.json` の entries に追加する。移動時に `wip` フィールドは除去する。

**2.5. コンテキストが既存に吸収される場合**

wip コンテキストが既存コンテキストに吸収される（dir 名が変わる）場合:

1. テストディレクトリを移動する:
   ```bash
   mv tests/<wip-dir>/ tests/<stable-dir>/
   ```
2. 移動したファイルを参照する `@test` を書きかえる:
   ```bash
   find . \( -name "*.js" -o -name "*.ts" \) -print0 \
     | xargs -0 grep -l "@test.*tests/<wip-dir>/" \
     | xargs sed -i.bak 's|tests/<wip-dir>/|tests/<stable-dir>/|g'
   ```

**3. 再定義の場合は影響を確認する**

既存概念の意味が変わった場合、docs/dictionary.json の既存エントリを更新し、
影響を受ける可能性のある箇所をユーザーに報告する。
