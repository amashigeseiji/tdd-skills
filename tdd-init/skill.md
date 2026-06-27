# /tdd-init - TDDスキル初期化

新しいリポジトリにTDDスキルを**初めて導入するときに一度だけ**実行する。

以下を順に行う:

1. **config.json の作成** — `.claude/tdd/config.json` を作成する
2. **scaffold の初期化** — `/tdd-scaffold` を呼び、`.claude/tdd/scaffold.sh` を生成する
3. **語彙の初期化** — `/tdd-vocab init` を呼び、`docs/dictionary.json` を作成する

`workflow.md`（`.claude/tdd/workflow.md`）は `/tdd-workflow` の初回起動時にヒアリングして生成する。`/tdd-init` では作成しない。

> BC が増えたときの `/tdd-vocab init` の再実行は、`/tdd-init` を経由せず直接呼ぶ。

---

## 手順

### 1. config.json の作成

`.claude/tdd/` ディレクトリが存在しなければ作成する（**現在のディレクトリがメタレポルートであることを確認してから実行する**）:

```bash
mkdir -p .claude/tdd
```

`.claude/tdd/config.json` を作成する。`meta_repo` には現在のディレクトリの絶対パスを記録する:

```json
{
  "meta_repo": "/absolute/path/to/meta-repo"
}
```

`meta_repo` の値は `pwd` で取得した絶対パスをそのまま書く。

**plans/ の追跡設定:**

ユーザーに確認する:

> `plans/` を git で追跡しますか？しない場合は `.gitignore` に追加します。

追跡しない場合:

```bash
echo 'plans/' >> .gitignore
```

`.gitignore` が存在しない場合も同様に作成される。すでに `plans/` が含まれている場合はスキップする。

### 2. scaffold の初期化

`/tdd-scaffold` を呼ぶ。

### 3. 語彙の初期化

`/tdd-vocab init` を呼ぶ。

---

## 成果物

- `.claude/tdd/config.json` — メタレポルートの絶対パス（`meta_repo`）
- `.claude/tdd/scaffold.sh` — スタブ生成スクリプト（tdd-scaffold が作成）
- `docs/dictionary.json` — 初期語彙定義（tdd-vocab init が作成）
