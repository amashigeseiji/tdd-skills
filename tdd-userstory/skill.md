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

#### 2.5. playwright.config の webServer を設定する（Playwright の場合のみ）

Playwright はテスト実行前後のサーバー起動・停止を `webServer` オプションで管理できる。
このステップで設定しておくことで、手順4のテスト実行時に Playwright が自動的に処理する。

```bash
cat playwright.config.*
```

**`webServer` がすでに設定されている場合:** このステップをスキップする。

**設定されていない場合:** プロジェクトの種別からコマンドとポートを推定し、`playwright.config.*` に追記する。

まずプロジェクト種別を判定するために以下を確認する:

```bash
ls package.json Gemfile mix.exs go.mod requirements.txt pyproject.toml Makefile Procfile 2>/dev/null
```

推定の優先順位:

| 検出ファイル | 推定コマンド | 推定ポート |
|------------|------------|----------|
| `package.json`（`scripts.dev` あり） | `npm run dev`（または `yarn dev` / `bun dev`） | package.json または設定ファイルから読む |
| `package.json`（`scripts.start` のみ） | `npm start` | 同上 |
| `Procfile` | `web:` の行のコマンド | Procfile から読む |
| `Makefile`（`dev` / `serve` ターゲットあり） | `make dev` | Makefile から読む |
| `Gemfile` + `config/routes.rb` | `bin/rails server` | 3000 |
| `manage.py` | `python manage.py runserver` | 8000 |
| `mix.exs` | `mix phx.server` | 4000 |
| `go.mod` | `go run .` | ソースから推定、不明なら確認 |

ポートがファイルから確認できない場合はユーザーに確認する。

追記する内容:

```typescript
// playwright.config.ts への追記例
import { defineConfig } from '@playwright/test'

export default defineConfig({
  // ... 既存の設定 ...
  webServer: {
    command: '<推定したコマンド>',
    port: <推定したポート>,
    reuseExistingServer: !process.env.CI,
  },
})
```

`reuseExistingServer: !process.env.CI` の意味:
- ローカル環境: 指定ポートがすでに使用中であれば `command` を実行せずそのまま使う。**ポートバッティングはここで防がれる。**
- CI 環境: 常に `command` から新しく起動する

`port` の値はユーザーが起動しているサーバーと一致している必要がある。ずれていると「既存なし」と判断されて二重起動が起きる。推定したポートが不確かな場合はユーザーに確認してから設定する。

これにより「起動中なら使う、起動中でなければ起動する、テスト終了後に停止する」を Playwright が管理する。

#### 3. テストファイルを生成する

出力先: `tests/acceptance/<project>.spec.ts`（Playwright）または `tests/acceptance/<project>.test.ts`（その他）

user-story.md の各シナリオを Given/When/Then のコメントを保持したままテストコードに変換する。

**アサーションの書き方:**

`tdd-userstory run` は統合と動作確認が完了した後（`tdd-run` 手順 8.5）に呼ばれる。実装が存在する状態で生成するため、コメントだけの骨格ではなく**実際のアサーション**を書く。

アサーションは Then 節を根拠にし、実装コードを読んで具体的な手段を補う:

1. **Then 節を読む** — 「○○が表示される」「△△が返る」という期待を確認する
2. **実装を読む** — ルート・コンポーネント・API ハンドラを確認し、セレクターや戻り値の形を把握する
3. **セマンティックな属性を優先する** — `text=...`・`role=...`・`aria-label=...` を CSS クラスや構造的 ID より優先する
4. **解決できない場合は `// TODO:` を残す** — 実装が見つからない・Then 節が曖昧で確定できない場合に限る

**Playwright の場合:**

```typescript
import { test, expect } from '@playwright/test'

test.describe('US-01: <ストーリータイトル>', () => {
  test('シナリオ 1: <シナリオ名>', async ({ page }) => {
    // Given: <前提条件>
    <前提条件を設定するコード>

    // When: <操作>
    <操作コード>

    // Then: <期待される結果>
    await expect(page.locator('<セマンティックなセレクター>')).toBeVisible()
  })
})
```

**Vitest / Jest の場合:**

```typescript
import { describe, it, expect } from 'vitest' // または jest

describe('US-01: <ストーリータイトル>', () => {
  it('シナリオ 1: <シナリオ名>', async () => {
    // Given: <前提条件>
    <前提条件を設定するコード>

    // When: <操作>
    const result = <操作コード>

    // Then: <期待される結果>
    expect(result).toEqual(<期待値>)
  })
})
```

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
- **Then 節の意図を根拠にアサーションを書く** — 実装コードから逆算（「こう実装されているからこうアサートする」）しない
- **問題定義（problem.md）を変更しない**

---

## 成果物

1. **plans/<project>/user-story.md** — BDD 形式のユーザーストーリー仕様（`create` の成果物）
2. **tests/acceptance/<project>.spec.ts** または **.test.ts** — 受け入れテスト骨格（`run` の成果物）
