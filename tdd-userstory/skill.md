# /tdd-userstory - ユーザーストーリースキル

ユーザーストーリーを BDD 形式（Given/When/Then）で定義し、受け入れテストとして実行します。

---

## /tdd-userstory create

`problem.md` からユーザーストーリーを BDD 形式で生成し、`plans/<project>/user-story.md` に保存します。

**呼び出し元:** `/tdd-problem`（problem.md 保存直後）

### 手順

#### 1. problem.md を読む

```bash
cat plans/<project>/problem.md
```

#### 2. ユーザーストーリーを抽出する

problem.md の各セクションをストーリーにマッピングする:

| problem.md のセクション | user-story.md への変換 |
|------------------------|----------------------|
| やりたいこと | ロール（誰が）・目的（何をしたいか） |
| 解決したと言える状態 | シナリオの Then（期待される結果） |
| 障害・制約 | シナリオの Given（前提条件・文脈） |
| 観察された症状 | シナリオの When（何が起きたとき） |

「やりたいこと」が複数ある場合、それぞれを独立したストーリー（US-01, US-02, ...）として書く。

各ストーリーには以下を書く:
- **正常系シナリオ**: 問題が解決されたと言える典型的な操作の流れ
- **境界・エラー系シナリオ**: 「解決したと言える状態」に含まれる例外ケース

シナリオは**ユーザーの操作と知覚できる結果**で書く。実装の詳細（関数名・データ構造・ライブラリ）は書かない。

#### 3. user-story.md を生成する

下記フォーマットで `plans/<project>/user-story.md` を作成する。

---

### user-story.md のフォーマット

```markdown
# ユーザーストーリー: <プロジェクト名>

**生成:** YYYY-MM-DD
**ソース:** plans/<project>/problem.md v<バージョン>

---

## US-01: <ストーリーのタイトル>

**ロール:** <誰が>
**目的:** <何をしたいか>
**価値:** <それによって何が得られるか>

### シナリオ 1: <シナリオ名>

```
Given <前提条件>
When <操作・アクション>
Then <期待される結果>
```

### シナリオ 2: <シナリオ名>

```
Given <前提条件>
When <操作・アクション>
Then <期待される結果>
```

---

## US-02: ...
```

---

## /tdd-userstory run

`user-story.md` のシナリオをテストコードに変換して実行し、結果を返します。
エラーへの対応とリトライは呼び出し元（`/tdd-run`）が担います。

**呼び出し元:** `/tdd-run`（手順8.5）

### 手順

#### 1. user-story.md を読む

```bash
cat plans/<project>/user-story.md
```

存在しない場合: `/tdd-userstory create <project>` を先に実行してください、と伝えてスキップする。

#### 2. テストフレームワークを検出する

```bash
ls playwright.config.* 2>/dev/null
cat package.json 2>/dev/null
find tests -name "*.spec.*" -o -name "*.test.*" 2>/dev/null | head -5
```

検出の優先順位:

| 検出条件 | 使用フレームワーク |
|---------|-----------------|
| `playwright.config.*` が存在 | Playwright |
| `package.json` の dependencies/devDependencies に `vitest` | Vitest |
| `package.json` の dependencies/devDependencies に `jest` | Jest |
| 上記のいずれも検出できない | フォールバック（後述） |

#### 3. テストファイルを生成する

出力先: `tests/acceptance/<project>.spec.ts`（Playwright）または `tests/acceptance/<project>.test.ts`（その他）

user-story.md の各シナリオを Given/When/Then のコメントを保持したままテストコードに変換する。

**Playwright の場合:**

```typescript
import { test, expect } from '@playwright/test'

test.describe('US-01: <ストーリータイトル>', () => {
  test('シナリオ 1: <シナリオ名>', async ({ page }) => {
    // Given: <前提条件>

    // When: <操作>

    // Then: <期待される結果>
    // expect(...).toBe(...)
  })
})
```

**Vitest / Jest の場合:**

```typescript
import { describe, it, expect } from 'vitest' // または jest

describe('US-01: <ストーリータイトル>', () => {
  it('シナリオ 1: <シナリオ名>', async () => {
    // Given: <前提条件>

    // When: <操作>

    // Then: <期待される結果>
    // expect(...).toBe(...)
  })
})
```

生成したテストファイルは**骨格（コメントのみ）の状態**で書く。
`tdd-run` の単体テストツリーは「できる」の宣言だが、受け入れテストは「使ったとき何が起きるか」の確認。
骨格の状態で実行し、未実装（`pending`）として記録する。
ユーザーが `user-story.md` のシナリオを確認した上で、骨格に実際のアサーションを追記する。

**フォールバック（フレームワーク未検出時）:**

テストコードは生成せず、代わりに `tests/acceptance/<project>-manual.md` を出力する。
内容: user-story.md の各シナリオを手動確認チェックリスト形式に変換したもの。

#### 4. テストを実行する

```bash
# Playwright
npx playwright test tests/acceptance/<project>.spec.ts

# Vitest
npx vitest run tests/acceptance/<project>.test.ts

# Jest
npx jest tests/acceptance/<project>.test.ts
```

#### 5. 結果を報告する

以下のいずれかを呼び出し元に返す。

**`pass` / `pending`（テストが実行できた）:**

```
📋 ユーザーストーリーテスト: <pass / pending>

フレームワーク: <検出したフレームワーク>
生成ファイル: tests/acceptance/<project>.spec.ts

シナリオ一覧:
  US-01 シナリオ 1: <pending / pass>
  US-01 シナリオ 2: <pending / pass>
  ...
```

**`fail`（アサーション失敗）:**

```
📋 ユーザーストーリーテスト: fail

失敗シナリオ:
  US-01 シナリオ 1: <シナリオ名>
    期待: <Then の内容>
    実際: <テスト出力>
  ...
```

**`execution-error`（テストが実行できなかった）:**

```
📋 ユーザーストーリーテスト: execution-error

エラー種別: <環境エラー / 構文エラー / 実行時エラー>
エラー内容: <エラーメッセージ>
```

エラー種別の判断基準:

| エラー種別 | 判断基準 |
|----------|---------|
| 環境エラー | モジュール未解決・コマンドが見つからない |
| 構文エラー | パースエラー・インポート失敗 |
| 実行時エラー | テストは起動するがセットアップで落ちる |

---

## 制約

- **user-story.md は problem.md の言葉で書く** — 実装の詳細（関数名・技術名）は書かない
- **受け入れテストは `tdd-run` の単体テストツリーと別ディレクトリに置く** — `tests/acceptance/` に限定
- **自動生成したテストを green にしない** — 骨格の状態でコミットし、アサーションはユーザーが書く
- **問題定義（problem.md）を変更しない**

---

## 成果物

1. **plans/<project>/user-story.md** — BDD 形式のユーザーストーリー仕様（`create` の成果物）
2. **tests/acceptance/<project>.spec.ts** または **.test.ts** — 受け入れテスト骨格（`run` の成果物）
