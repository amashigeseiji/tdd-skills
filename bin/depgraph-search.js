#!/usr/bin/env node
//
// Usage:
//   depgraph-search.js [options] <graph-json> <path-substring>
//
// 正規化済みの依存グラフ JSON をキーワード検索し、指定ファイルの依存先・依存元を
// コンパクトな Markdown で表示する共有スクリプト。プロジェクトごとに再生成しない
// （dict-search.js と同じ位置づけ）。
//
// 入力 JSON の形（プロジェクト側の depgraph.regen が生成する）:
//   { "modules": [ { "source": "<path>", "dependencies": ["<path>", ...] } ] }
// dependencies は forward edge（このファイルが import しているファイル）のみでよい。
// dependents（依存元）はこのスクリプトが起動時に逆引きして計算する。
// 外部パッケージ・未解決の import は事前に除外されている前提。
//
// 詳細は --help を参照。

import fs from 'node:fs'

function loadGraph(graphPath) {
  if (!fs.existsSync(graphPath)) {
    console.error(`依存グラフが見つかりません: ${graphPath}`)
    console.error('先にプロジェクトの depgraph.regen スクリプトを実行してください。')
    process.exit(1)
  }
  return JSON.parse(fs.readFileSync(graphPath, 'utf8'))
}

function buildIndexes(modules) {
  const forward = new Map()
  const backward = new Map()
  for (const m of modules) {
    forward.set(m.source, m.dependencies || [])
    if (!backward.has(m.source)) backward.set(m.source, [])
  }
  for (const m of modules) {
    for (const dep of (m.dependencies || [])) {
      if (!backward.has(dep)) backward.set(dep, [])
      backward.get(dep).push(m.source)
    }
  }
  return { forward, backward }
}

function searchModules(modules, query) {
  const exact = modules.filter(m => m.source === query)
  if (exact.length > 0) return exact
  return modules.filter(m => m.source.includes(query))
}

// direction: 'to' (このファイルが依存している先) | 'from' (このファイルに依存している元)
function expand(startSource, indexes, direction, depth) {
  const index = direction === 'to' ? indexes.forward : indexes.backward
  const seen = new Set([startSource])
  const result = []
  let frontier = [startSource]
  for (let hop = 1; hop <= depth; hop++) {
    const next = []
    for (const source of frontier) {
      const neighbors = index.get(source) ?? []
      for (const n of neighbors) {
        if (!seen.has(n)) {
          seen.add(n)
          result.push({ path: n, hop })
          next.push(n)
        }
      }
    }
    frontier = next
    if (frontier.length === 0) break
  }
  return result
}

function formatList(entries) {
  if (entries.length === 0) return '(なし)'
  return entries.map(e => (e.hop > 1 ? `- ${e.path} (${e.hop} hop)` : `- ${e.path}`)).join('\n')
}

function formatModule(mod, indexes, { showTo, showFrom, depth, summary }) {
  if (summary) {
    const toCount = mod.dependencies?.length ?? 0
    const fromCount = (indexes.backward.get(mod.source) ?? []).length
    return `- ${mod.source} [depends on: ${toCount}, depended on by: ${fromCount}]`
  }
  const lines = [`## ${mod.source}`]
  if (showTo) {
    const direct = expand(mod.source, indexes, 'to', 1)
    const extra = depth > 1 ? expand(mod.source, indexes, 'to', depth).filter(e => e.hop > 1) : []
    lines.push(`\n**依存先 (direct: ${direct.length}${extra.length ? `, +${extra.length} via depth ${depth}` : ''})**`)
    lines.push(formatList([...direct, ...extra]))
  }
  if (showFrom) {
    const direct = expand(mod.source, indexes, 'from', 1)
    const extra = depth > 1 ? expand(mod.source, indexes, 'from', depth).filter(e => e.hop > 1) : []
    lines.push(`\n**依存元 (direct: ${direct.length}${extra.length ? `, +${extra.length} via depth ${depth}` : ''})**`)
    lines.push(formatList([...direct, ...extra]))
  }
  return lines.join('\n')
}

function printHelp() {
  console.log(`Usage:
  depgraph-search.js [options] <graph-json> <path-substring>

Options:
  --to                依存先のみ表示（このファイルが import しているもの）
  --from              依存元のみ表示（このファイルを import しているもの）
                      （--to も --from も指定しない場合は両方表示）
  -d, --depth <n>     推移的に n hop まで展開（デフォルト 1 = 直接のみ）
  -s, --summary       一覧表示（依存数のみの1行形式、マッチが多いときに）
  -h, --help          このヘルプを表示

正規化済みの依存グラフ JSON を読む共有スクリプト。グラフの生成（言語別ツールの実行・
出力の正規化）はプロジェクトごとの depgraph.regen スクリプトが担当する
（tdd-scaffold depgraph が生成。詳細は tdd-scaffold/skill.md 参照）。

Examples:
  depgraph-search.js .claude/tdd/dependency-graph.json app/components/Foo.vue
  depgraph-search.js --from -d3 .claude/tdd/dependency-graph.json lib/client.js   # 影響範囲調査
  depgraph-search.js -s .claude/tdd/dependency-graph.json app/                    # 一覧のみ`)
}

function main() {
  const args = process.argv.slice(2)
  if (args.includes('--help') || args.includes('-h')) {
    printHelp()
    return
  }

  let showTo = false
  let showFrom = false
  let depth = 1
  let summary = false
  const positional = []

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--to') showTo = true
    else if (arg === '--from') showFrom = true
    else if (arg === '--summary' || arg === '-s') summary = true
    else if (arg === '--depth' || arg === '-d') depth = parseInt(args[++i], 10) || 1
    else if (/^-d(\d+)$/.test(arg)) depth = parseInt(arg.slice(2), 10) || 1
    else positional.push(arg)
  }

  const [graphPath, query] = positional
  if (!graphPath || !query) {
    console.error('依存グラフ JSON のパスと検索したいファイルパス（の一部）を指定してください。--help を参照。')
    process.exit(1)
  }

  if (!showTo && !showFrom) {
    showTo = true
    showFrom = true
  }

  const { modules } = loadGraph(graphPath)
  const indexes = buildIndexes(modules)
  const matches = searchModules(modules, query)

  if (matches.length === 0) {
    console.log(`(「${query}」に一致するモジュールなし)`)
    return
  }

  const useSummary = summary || matches.length > 15
  if (useSummary && !summary) {
    console.log(`(${matches.length}件ヒット。詳細を絞るには query を具体化するか -s を使ってください)\n`)
  }

  for (const mod of matches) {
    console.log(formatModule(mod, indexes, { showTo, showFrom, depth, summary: useSummary }))
    console.log('')
  }
}

main()
