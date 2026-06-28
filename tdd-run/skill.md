# /tdd-run - TDD Practice Skill

You are a TDD practitioner.
**A problem is a state of "cannot do," and implementation is the transformation to "can do."**

> Respond to the user in Japanese throughout this skill.

---

The "can-do" tree is your map. Each node in the tree becomes one test.
When the root node turns green, the problem is solved.

---

## Determine Working Directory

Do this first, before reading any files. `<project>` is a directory name under `plans/`.

### Load config.json and determine the meta-repo root

Search upward from CWD for `.claude/tdd/config.json` and retrieve `meta_repo`:

```bash
bash "$(realpath "${CLAUDE_SKILL_DIR}")/../bin/find-config.sh"
```

Set the `meta_repo` field of the found config.json as `<meta>`.
If not found, run `/tdd-init` first, then return.

### Identify the working repository

Read 2 fields from `<meta>/plans/<project>/problem.md`:

```bash
grep "^\*\*作業レポジトリ:" <meta>/plans/<project>/problem.md
grep "^\*\*作業ディレクトリ:" <meta>/plans/<project>/problem.md
```

- **If `**作業レポジトリ:**` exists**: the value (e.g., `voce-community-ap`) is the working repo name
  - If `**作業ディレクトリ:**` also exists, use its value as `<work_repo_abs>`
  - Otherwise use `<meta>/<repo-name>` as `<work_repo_abs>`
- **If the field is absent**: `<meta>` is `<work_repo_abs>`

### Plans reference path

When `<meta>` and `<work_repo_abs>` **differ** (sub-repo setup):

```
<plans_dir> = <meta>/plans/<project>
```

All plans use `<meta>/plans/<project>/` directly.

When `<meta>` and `<work_repo_abs>` are the **same** (single repo):

```
<plans_dir> = <work_repo_abs>/plans/<project>
```

---

## Files to open at session start

After determining the working directory, read the following with absolute paths:

```bash
cat <plans_dir>/problem.md
cat <plans_dir>/user-story.md 2>/dev/null
```

If problem.md is missing: define the problem first with `/tdd-problem`.

**Dictionary lookup:**
Do not load the entire dictionary. Search on demand:

```bash
node "$(realpath "${CLAUDE_SKILL_DIR}")/../bin/dict-search.js" <concept-name> <plans_dir>
```

Returns the matching entry and its relations (depth 1). Entries under `plans/` take priority over `docs/`.

**If `plans/<project>/dictionary.json` does not exist (new problem):**
Call `/tdd-vocab plan` before building the tree.
Vocabulary defined at this stage is a **working hypothesis** — write it to `plans/<project>/dictionary.json`
(not `docs/dictionary.json`).
WIP vocabulary acts as provisional guardrails.
After implementation and acceptance, promote to stable with `/tdd-vocab promote`.

**Check for `.claude/tdd/scaffold.sh`:**
If it does not exist, call `/tdd-scaffold` to generate it.

---

## The "can-do" tree

```
X は xxx ができる  ← root node (hypothesis for problem resolution)
├── A は aaa ができる
│   ├── D は ddd ができる
│   └── E は eee ができる
└── B は bbb ができる
    └── C は ccc ができる
```

Each node takes the form "Name can [behavior]."
**The name comes first, followed by what it can do.**
"What is X? — something that can xxx." Placing a node means answering this question.

**Write node names in Japanese.**
Japanese concept names prevent implementation identifiers (function names, class names) from leaking into node names.

**The predicate describes behavior — not means.**

| NG | OK |
|----|-----|
| 展開状態マネージャーは localStorage でディレクトリの開閉を管理できる | 展開状態マネージャーはディレクトリの開閉状態を保持して管理できる |

If a technology name (API, library, storage type, protocol, etc.) appears in the predicate,
it is a signal that implementation detail has leaked into the node.

Means selection is the driver's (test code's) responsibility.
When a node pre-selects means, the option of in-memory implementation outside the browser disappears.

**The tree is a test file.**
While writing code for E's test, you should still be aware of X's behavior —
this prevents near-sighted implementation.

The tree may be a semi-lattice (nodes with multiple parents).
Shared nodes are an opportunity for naming.

The tree changes as understanding updates.
However, **when the nature of an upper node changes, cross-check with problem.md** (see step 6).

---

## Test and module design

Tests for modules isolated from the dependency graph — nodes not participating in composition — produce false negatives. Tests keep passing even when the implementation changes.

When multiple implementation options exist, evaluate by: testability (can it be verified independently as a module), dependency traceability (can the dependency be traced in the dependency graph), false-negative risk, and change cost. Options that score poorly on multiple criteria are treated as design problems.

---

## Steps

### 1. Load

Read the above files at session start.

Minimal codebase exploration:
- Confirm entry points (how is this feature reached?)
- Existing related implementations and reusable parts
- Existing type definitions (to avoid duplication and naming conflicts)

### 2. Define and name the root X

Read problem.md and ask: **"What needs to be possible for this problem to be solved?"**

**If user-story.md exists:** Lay out the Then clauses (expected outcomes) from each scenario.
The root "can do" emerges as the common denominator of what can be said when all these Thens hold.
Verify the root by working backwards from the Then clauses — check if it matches the answer from problem.md.
If they don't match, consider whether problem.md or the user stories contains an oversight.

**First check whether existing vocabulary can express it:**
Search with `dict-search.js` to see if existing concepts suffice:

```bash
node "$(realpath "${CLAUDE_SKILL_DIR}")/../bin/dict-search.js" <keyword> <plans_dir>
```

If existing vocabulary suffices, do not create a new name.

If not, define a new X:
Express it as "X is something that can xxx."
The name is a **Japanese concept name** (e.g., `フロントマターテンプレートローダー`).
Once named, add to `plans/<project>/dictionary.json` entries array:
`{"name":"<概念名>","en":"EnglishName","context":"<context>","domain":"application","definition":"xxx ができるもの","relations":[],"src":null,"wip":{"status":"new","discovered":"tdd-run"}}`

Once root X is determined, declare the relationship between the entry point identified in step 1 and X:

```
Entry point: <entry-point-file> → X
```

If the entry point cannot be determined, return to step 1 and complete the investigation.

### 3. Write the root test and leave it red

Write the test for "X can xxx."
Do not make this test green until the tree is complete.

### 4. Decompose the tree and finalize skeleton tests and vocabulary

Decompose "What does X need in order to xxx?" One line per node.
Continue until reaching leaves (granular enough to implement directly).

When naming each node, simultaneously declare the context (domain boundary) in `[context]` form:

```
X は xxx ができる [editor]
├── A は aaa ができる [editor]
└── B は bbb ができる [event]
```

Context represents the domain boundary the node belongs to — it is both a file organization decision
and a design declaration of "which domain does this module's concept belong to?"
When a cross-context dependency arises (parent `[editor]`, child `[event]`, etc.),
re-examine whether that boundary is appropriate from a domain understanding perspective.

Shared nodes in the semi-lattice (referenced by multiple nodes) are also treated as independent files.
If a shared node's context cannot be pinned to one — it doesn't belong to any existing context —
it is a candidate for its own independent domain boundary. Consider defining a new context.

After decomposition, perform a **technology term scan** before finalizing the tree:

Scan all node predicates (the "can [verb]" part) and check for terms in these categories:
- URLs, endpoints, HTTP methods
- Library or framework names
- Storage types (localStorage, DB, S3, etc.)
- Communication protocols, file formats

If found, re-ask "What behavior does this predicate represent?" and rewrite to eliminate the technology term before finalizing the tree.

Next, perform a **scaffolding feasibility check**:

Verify that each node's subject is a valid Japanese concept name.
If URL paths, technical operation descriptions, or camelCase identifiers have crept in, re-examine until you have a nameable concept.

This check eliminates the root cause of "can't write a test" judgments before they occur at the implementation phase.

Next, perform a **loadability check**:

Verify that the module assigned to each node can be loaded in the test execution environment.
The following are considered non-loadable:
- Directly references runtime dependencies unavailable in the test environment (browser APIs, GUI framework contexts, etc.)
- Has side effects on load (event listener registration, screen operations, etc.)

If non-loadable nodes exist, decide between these 2 options before proceeding:
1. **Extract logic to a separate module** — move pure logic to a module loadable in the test environment, change the context declaration in the tree
2. **Do not write a unit test for that node** — explicitly mark the `it()` as "manual verification only" and skip

"Copy logic into the test file to verify" is not an option.

**After decomposition, present the tree to the user and get confirmation before proceeding.**

Once confirmed, first generate `plans/<project>/test-tree.md`.

**Generate test-tree.md:**

At the same time the tree is finalized, record the utilization hypothesis for what this session aims to achieve.
The utilization hypothesis takes the form "if used, this should happen / if this happens, it's off" — commit before implementation.

**If user-story.md exists:** Use the Given/When/Then from each scenario as material.
Each scenario corresponds to one item of "if used, this should happen." The condition under which a scenario fails becomes "if this happens, it's off."
**If user-story.md does not exist:** Use "the state in which it can be said to be solved" from problem.md as material.

Write this together with the user.

```markdown
# テストツリー: <プロジェクト名>

**作成:** YYYY-MM-DD

## できるのツリー

X は xxx ができる [context]
├── A は aaa ができる [context]
│   ├── D は ddd ができる [context]
│   └── E は eee ができる [context]
└── B は bbb ができる [context]

## 利用仮説

- 使ったらこうなるはず: ...
- こうなったら外れ: ...
```

Once test-tree.md is generated, do the following two things simultaneously starting from the tree names.

**Generate test skeleton:**

Place test files under `tests/<dir>/` (`<dir>` is the `[context]` label declared for the node in the tree).
Write `describe()` blocks corresponding to each tree node into test files, preserving the nested structure.
Leave `it()` bodies empty (TODO).

Use the Japanese node name directly as the subject of `describe()`:

```javascript
describe('フロントマターテンプレートローダーは xxx ができる', () => {
  describe('テンプレートマッチャーは aaa ができる', () => {
    it('TODO', () => {})
  })
  describe('フロントマター文字列ビルダーは bbb ができる', () => {
    it('TODO', () => {})
  })
})
```

At this point the tree and test files are in 1-to-1 correspondence.
**Never proceed to implementation without a node appearing in the skeleton.**

**Generate stubs (scaffolding):**

Call `.claude/tdd/scaffold.sh` for each node in the tree:

```bash
.claude/tdd/scaffold.sh <Subject_en> <verb_en> <context>
```

- `Subject_en`: Resolve the node's subject S via the vocabulary's `en:` field — PascalCase English identifier
- `verb_en`: Direct English camelCase translation of the node's verb V
- `context`: The `[context]` label declared in the tree

Each node corresponds to an independent file. When multiple nodes share the same S, the script appends functions to the existing file.

The Japanese name in `describe()` and the English identifier in the implementation correspond to each other — concept declaration (Japanese) and identifier declaration (English) happen in separate phases.
With stubs in place, there is no need to decide "which function to write in" at the implementation phase.

When creating stubs, add types to function signature arguments and return values (`@param`, `@returns`, TypeScript type annotations, etc.).
Placeholders are fine at this stage. If an argument type is complex or corresponds to a data concept, promote it to a type stub.

**Generate type stubs:**

Generate type definitions for dictionary entries corresponding to data concepts.

Criteria for data concepts:
- Definition describes attributes/structure: "something that has ~", "a collection of ~", "the state of ~"
- Appears as an argument/return value passed between other nodes, not as a tree subject (S)
- Expected to appear as the same shape across multiple nodes

Use the vocabulary's `en:` field for type names, defined following language conventions.
Fields can be placeholders. Attach `@vocab` to link to the dictionary entry.

Device concepts (loaders, builders, etc. — those functioning as tree subjects S) become functions/classes, not types, and are excluded.

**Register solution domain vocabulary:**

Among node names that correspond to the solution domain (device, transformation, operation names),
add them to `plans/<project>/dictionary.json` entries array.
Exclude: root nodes, concepts already registered as application domain vocabulary, implementation-detail subdivisions.
Add with `domain:"solution"` in the same format as step 2.

The correspondence between application domain concepts and these will be confirmed during the walkthrough (step 7.5).

### 5. Implement from leaves upward, composing as you go

Starting from leaf nodes, repeat red → green → refactor.
Once green, move up one node and compose.

Writing tests for each node:

```javascript
describe('A は aaa ができる', () => {
  it('xxx したとき yyy になる', () => {
    // Define the interface before implementation
  })
})
```

**References to implementation:**

`@vocab` and `@test` annotations were already written during scaffolding in step 4.
Do not remove or change them when filling in the implementation.

**Test execution command:**

```bash
npm test -- <test-file-path>   # or bun test <file>, etc. — use whichever is detected
```

**Loop prevention (5 consecutive failures):**

```
⚠️  5回のイテレーションで通りませんでした。

次のアクションを選んでください:
- 続ける
- 一時中断（findings.md を生成して問題定義へ）
- 分解の仕方を見直す
```

**Don't miss naming opportunities:**
Pause when you notice:

- Multiple nodes can be grasped together as "a flow of ~"
- A shared semi-lattice node has no name
- You can answer "what are these functions doing?" in one phrase

When you pause, **first check whether existing vocabulary can express it**.
If not, give it a new name and write it to `plans/<project>/dictionary.json`.

**Guidelines for which nodes to register:**
Concepts the user can use to talk about the domain — root nodes and intermediate nodes that feel grounded in domain reality are targets.
Implementation-detail subdivisions (specific algorithms, temporary helpers) are not registered.

When registering something new, search existing concepts with `dict-search.js` first.

**Types and function signatures:**
Attaching types to arguments and return values is the default posture. Types arise both from function relationships and vocabulary relationships.

Finalize the fields of type stubs from step 4 as implementation reveals what they should be. Don't leave them until 7.5.

When you notice the following while writing argument types, extract as a named type:
- The same argument shape appears in multiple functions
- An inline object has grown large
- A type stub was not created in step 4, but it became clear through implementation that it is a data concept

When a type is extracted, attach `@vocab` and define it following language conventions.

### 6. Detecting mutation of upper nodes

When you notice during implementation that the nature of an upper node's "can do" has changed:

1. **Cross-check with problem.md**: Does the new composition resolve the "cannot do" in problem.md?
   - **Yes**: Give the new X a name, update the root test, write to `plans/<project>/dictionary.json`
   - **No**: Identify what is missing and rebuild the tree
2. Report to the user

### 7. Confirm the root turned green

Once composition is complete, confirm the test from step 3 turns green.

When green, ask the user for confirmation.
If the user accepts, proceed to step 7.5.

### 7.5. Dictionary / test / implementation walkthrough

Confirm names are consistent across phases and update `plans/<project>/dictionary.json`.

First create a correspondence table:

```
語彙（plans/dictionary）  | テスト describe()  | 実装（関数・モジュール名）| 型定義
--------------------------|-------------------|--------------------------|-------
ツリービルダー             | なし               | buildTree()              | なし（装置）
ネスト変換                 | ✓                 | buildTree() 内部         | なし
ツリーレンダラー           | ✓                 | renderTreeHtml()         | なし（装置）
記事                      | -                 | -                        | Article（型定義あり）
```

5 points to verify:

- **Vocabulary → test**: Does the name registered in the vocabulary appear in `describe()`?
  Names that disappeared were "quietly resolved" — record in findings.
- **Test → implementation**: Does the subject name in `describe()` match the function/module/class name in implementation?
  Names should have been fixed by scaffolding in step 4, so divergence here means a conversion happened at that stage.
  If divergence is found, record in findings and fix the implementation to the correct name.
  If matching, add implementation references to the `relations` field of the corresponding entry in `plans/<project>/dictionary.json`.
- **Implementation → vocabulary**: Among device names that appear in implementation, consider adding any unregistered ones.
- **Vocabulary → type**: Does a type definition corresponding to data concept vocabulary entries exist?
  If not, define it there. If there was a type stub from step 4, fill in fields confirmed by implementation.
- **Vocabulary → src**: Write the confirmed implementation path into the `"src"` field of each vocabulary entry.
  Also verify it matches the file placement decided during the module boundary check in step 4.

### 8. Integration and behavior verification (make it usable)

Don't stop at test green. Bring the changes to an **actually usable state**:

- Verify that the root module is actually referenced from the entry point declared in step 2.
- Integrate the changes into the user-facing entry point (UI, CLI, endpoint, etc.)
- Run the actual app and confirm end-to-end operation
- If integration requires judgment but information is lacking, integrate with a reasonable default and leave a note in findings

### 8.5. Run user story tests

Once integration and behavior verification are complete, run `/tdd-userstory run <project>`.
Skip if `plans/<project>/user-story.md` does not exist.

**Response by result:**

| Result | Action |
|--------|--------|
| `pass` / `pending` | Proceed to step 9 |
| `fail` (assertion failure) | Record failure details in findings.md and proceed to step 9 (see below) |
| `execution-error` | Enter error handling loop (see below) |

**When `execution-error` — handling loop (max 3 attempts):**

1. Analyze the error and consider a response
2. Present the analysis and response to the user, get approval before implementing
3. Re-run `/tdd-userstory run <project>`
4. If `execution-error` continues, repeat steps 1–3 (max 3 times)

If `execution-error` is not resolved after 3 attempts:

```
⚠️ ユーザーストーリーテストを3回試みましたが実行できませんでした。

エラー種別: <種別>
最後のエラー: <エラーメッセージ>
試みた対応策:
  1回目: <対応内容>
  2回目: <対応内容>
  3回目: <対応内容>

ユーザーストーリーテストをスキップして次のステップへ進みます。
```

Record this in findings.md and proceed to step 9.

**Recording in findings.md:**

For `fail`: Write the failing scenario (US number, scenario name), expected vs actual output, and where to route (/tdd-problem or /tdd-run).

For `execution-error` (3-attempt stop): Write error type, last error message, and 3 attempted responses.

### 9. Implementation observations

Leave notes on what you noticed during implementation in `plans/<project>/observations.md`.
**Routing (where to send back) is decided in tdd-feedback. Write only facts and observations here.**

```markdown
# Observations: <project>

**日時:** YYYY-MM-DD

## 実装中の気づき

- （ツリーの組み換えが起きた場合、その理由）
- （5回連続失敗など、詰まったポイント）
- （スキルの使い方で想定と違ったこと）
- （特になし）
```

---

## Session end

```
✅ 実装が完了しました。

次のステップ: 次セッションで /tdd-feedback <project> を起動する（必須）
```

---

## Constraints

- **Do not rewrite problem.md** (that is /tdd-problem's job)
- **Do not directly edit docs/dictionary.json** (only via /tdd-vocab promote)
- **Do not make the root node test green midway**
- **Keep tests to the minimum that declares "can do"** (don't write them mechanically)
- **Tests verify logic by loading its implementation** — do not write tests that verify local functions defined inside the test file
- **Bring it to a usable state** (production deployment is a separate phase)
- **Use TodoWrite** (track implementation tasks)
- **Write all tree nodes in the skeleton test before starting implementation**
- **The decision to omit a node is made after attempting to write the `it()`** (don't skip before writing)

---

## Deliverables

1. **Tests (the "can-do" tree)** — declares "can do" for each node from root to leaves
2. **Implementation code** — tests pass and integrated at the entry point
3. **Type definitions** (if applicable) — types arising from vocabulary data concepts and function signatures
4. **tests/acceptance/<project>.spec.ts** — acceptance test skeleton (output of `/tdd-userstory run`)
5. **findings.md** (optional)
6. **plans/<project>/dictionary.json** — vocabulary during plan work (written directly by tdd-run)
7. **plans/<project>/test-tree.md** — test tree and utilization hypothesis
