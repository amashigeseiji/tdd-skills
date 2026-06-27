"use strict"
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()

// ── Dictionary parser ──────────────────────────────────────────────────────

function parseDictionary(filePath) {
  if (!fs.existsSync(filePath)) return {}
  let dict
  try {
    dict = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  } catch (e) {
    throw new Error(`dictionary parse failed: ${filePath}\n${e.message}`)
  }
  const result = {}   // dir -> [{ word, definition }]
  for (const entry of (dict.entries || [])) {
    if (!entry.context) continue
    const dir = entry.context
    if (!result[dir]) result[dir] = []
    result[dir].push({ word: entry.name, definition: entry.definition || '' })
  }
  return result
}

// ── Annotation block parser ────────────────────────────────────────────────

function extractFunctionName(line) {
  const t = line.trim()
  const patterns = [
    /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/,
    /^(?:export\s+)?(?:async\s+)?const\s+(\w+)\s*=/,
    /^(?:export\s+)?(?:async\s+)?(?:let|var)\s+(\w+)\s*=/,
  ]
  for (const p of patterns) {
    const m = t.match(p)
    if (m) return m[1]
  }
  return null
}

function parseAnnotations(filePath) {
  const lines = fs.readFileSync(filePath, 'utf-8').split('\n')
  const blocks = []   // { vocabs, tests, fn }

  let i = 0
  while (i < lines.length) {
    const t = lines[i].trim()

    if (/^\/\/ @vocab:/.test(t) || /^\/\/ @test:/.test(t)) {
      const block = { vocabs: [], tests: [] }

      while (i < lines.length) {
        const l = lines[i].trim()
        const vocabMatch = l.match(/^\/\/ @vocab:\s+(.+)/)
        if (vocabMatch) { block.vocabs.push(vocabMatch[1].trim()); i++; continue }
        const testMatch = l.match(/^\/\/ @test:\s+(.+)/)
        if (testMatch) { block.tests.push(testMatch[1].trim()); i++; continue }
        break
      }

      // Skip blank lines, then grab the function name from the next line
      while (i < lines.length && lines[i].trim() === '') i++
      block.fn = i < lines.length ? extractFunctionName(lines[i]) : null

      if (block.vocabs.length > 0) blocks.push(block)
    } else {
      i++
    }
  }

  return blocks
}

// ── Test case parser ───────────────────────────────────────────────────────

function parseTestCases(filePath) {
  const absPath = path.join(ROOT, filePath)
  if (!fs.existsSync(absPath)) return []
  const content = fs.readFileSync(absPath, 'utf-8')
  const cases = []
  const re = /^\s*(?:test|it)\s*\(\s*['"`](.+?)['"`]/gm
  let m
  while ((m = re.exec(content)) !== null) cases.push(m[1])
  return cases
}

// ── File discovery ─────────────────────────────────────────────────────────

function findJsFiles(dir) {
  const result = []
  if (!fs.existsSync(dir)) return result
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) result.push(...findJsFiles(full))
    else if (entry.name.endsWith('.js')) result.push(full)
  }
  return result
}

// ── Main ───────────────────────────────────────────────────────────────────

function generate() {
  const dict = parseDictionary(path.join(ROOT, 'docs/dictionary.json'))

  const srcDirs = process.argv.slice(2).length > 0
    ? process.argv.slice(2)
    : ['src', 'lib', 'packages']
  const jsFiles = srcDirs.flatMap(d => findJsFiles(path.join(ROOT, d)))

  // word -> { implements: [file, fn][], tests: Set<testFile>, _seen: Set<string> }
  const wordMap = new Map()

  for (const absFile of jsFiles) {
    const relFile = path.relative(ROOT, absFile)
    for (const block of parseAnnotations(absFile)) {
      for (const vocab of block.vocabs) {
        if (!wordMap.has(vocab)) {
          wordMap.set(vocab, { implements: [], tests: new Set(), _seen: new Set() })
        }
        const entry = wordMap.get(vocab)
        const key = `${relFile}\0${block.fn}`
        if (!entry._seen.has(key)) {
          entry._seen.add(key)
          entry.implements.push([relFile, block.fn])
        }
        for (const t of block.tests) entry.tests.add(t)
      }
    }
  }

  // Cache test cases per file
  const testCaseCache = new Map()
  const getTestCases = (f) => {
    if (!testCaseCache.has(f)) testCaseCache.set(f, parseTestCases(f))
    return testCaseCache.get(f)
  }

  // Assemble output in dictionary order
  const output = {}
  for (const [dir, words] of Object.entries(dict)) {
    const entries = []
    for (const { word, definition } of words) {
      if (!wordMap.has(word)) continue

      const { implements: impl, tests } = wordMap.get(word)

      const testsObj = {}
      for (const testFile of tests) testsObj[testFile] = getTestCases(testFile)

      entries.push({ word, definition, tests: testsObj, implements: impl })
    }
    if (entries.length > 0) output[dir] = entries
  }

  return output
}

const map = generate()
const outPath = path.join(ROOT, 'docs/map.json')
fs.writeFileSync(outPath, JSON.stringify(map, null, 2) + '\n')
console.log(`wrote ${outPath}`)
