#!/usr/bin/env node
/**
 * check-vocab.js — 辞書・テスト・実装の整合性チェック
 *
 * 使い方: node check-vocab.js [test-dir]
 *   test-dir: テストのルートディレクトリ（デフォルト: tests）
 *             プロジェクトルート（cwd）からの相対パス
 *
 * チェック内容:
 *   - @vocab の参照先エントリが辞書に存在するか
 *   - @test の参照先ファイルが存在するか
 *   - stable エントリに対応する @vocab を持つ実装が存在するか（逆引き）
 *   - テストディレクトリ名が辞書コンテキストの dir フィールドと対応しているか
 */

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const testDirArg = process.argv[2] || 'tests';
const testDir = path.resolve(root, testDirArg);
const testDirBasename = path.relative(root, testDir).split(path.sep)[0];

// ---- パーサー ---------------------------------------------------------------

function parseDictionary(filePath) {
  if (!fs.existsSync(filePath)) return { contexts: [], concepts: [] };
  const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
  const contexts = []; // { name: string, dir: string | null }
  const concepts = [];
  let current = null;

  for (const line of lines) {
    if (line.startsWith('## ')) {
      current = { name: line.slice(3).trim(), dir: null };
      contexts.push(current);
    } else if (line.startsWith('### ')) {
      concepts.push(line.slice(4).trim());
    } else if (current && /^\*\*dir:\*\*/.test(line)) {
      current.dir = line.replace(/^\*\*dir:\*\*\s*/, '').trim();
    }
  }
  return { contexts, concepts };
}

function scanImplementations(dir) {
  const IMPL_EXTS = ['.js', '.ts', '.mjs', '.cjs', '.jsx', '.tsx', '.py', '.rb', '.go'];
  const SKIP_DIRS = new Set(['node_modules', '.git', testDirBasename, 'dist', 'build']);
  const results = [];

  function walk(d) {
    if (!fs.existsSync(d)) return;
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (IMPL_EXTS.some(ext => entry.name.endsWith(ext))) {
        const lines = fs.readFileSync(full, 'utf-8').split('\n');
        const vocabs = [];
        const tests = [];
        for (const line of lines) {
          // @vocab: 概念名 (path/to/dictionary.md#概念名)
          const vm = line.match(/@vocab:?\s+(.+?)\s+\((.+?)\)/);
          if (vm) vocabs.push({ name: vm[1].trim(), ref: vm[2].trim() });
          // @test: path/to/file.test.js
          const tm = line.match(/@test:?\s+(.+)/);
          if (tm) tests.push(tm[1].trim());
        }
        if (vocabs.length || tests.length) results.push({ file: full, vocabs, tests });
      }
    }
  }

  walk(dir);
  return results;
}

function getTestContextDirs(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => e.name);
}

// ---- 収集 -------------------------------------------------------------------

const stableDict = parseDictionary(path.join(root, 'docs/dictionary.md'));
const wipContexts = [];
const wipConcepts = [];

const plansDir = path.join(root, 'plans');
if (fs.existsSync(plansDir)) {
  for (const plan of fs.readdirSync(plansDir)) {
    const wipPath = path.join(plansDir, plan, 'dictionary.md');
    const wip = parseDictionary(wipPath);
    wipContexts.push(...wip.contexts);
    wipConcepts.push(...wip.concepts);
  }
}

const allConcepts = new Set([...stableDict.concepts, ...wipConcepts]);
const allContextDirs = new Set(
  [...stableDict.contexts, ...wipContexts].map(c => c.dir || c.name)
);
const stableConcepts = new Set(stableDict.concepts);
const stableContextDirs = stableDict.contexts.map(c => c.dir || c.name);

const impls = scanImplementations(root);
const testContextDirs = getTestContextDirs(testDir);

// ---- チェック ---------------------------------------------------------------

const errors = [];
const warnings = [];

for (const { file, vocabs, tests } of impls) {
  const rel = path.relative(root, file);

  for (const { name, ref } of vocabs) {
    if (!allConcepts.has(name)) {
      errors.push(`[リンク切れ] ${rel}: @vocab "${name}" — 辞書に存在しない`);
    }
    const dictFile = ref.split('#')[0];
    if (!fs.existsSync(path.join(root, dictFile))) {
      errors.push(`[ファイル不在] ${rel}: @vocab の参照先ファイル "${dictFile}" が存在しない`);
    }
  }

  for (const testRef of tests) {
    if (!fs.existsSync(path.join(root, testRef))) {
      errors.push(`[ファイル不在] ${rel}: @test の参照先 "${testRef}" が存在しない`);
    }
  }
}

// stable エントリに @vocab が存在するか（逆引き）
const implementedConcepts = new Set(impls.flatMap(i => i.vocabs.map(v => v.name)));
for (const concept of stableConcepts) {
  if (!implementedConcepts.has(concept)) {
    warnings.push(`[未実装] stable 概念 "${concept}" を参照する @vocab がない`);
  }
}

// テストディレクトリと辞書コンテキスト dir の対応
for (const dir of testContextDirs) {
  if (!allContextDirs.has(dir)) {
    warnings.push(`[未対応] ${testDirArg}/${dir}/ に対応する辞書コンテキスト（dir フィールド）が存在しない`);
  }
}
for (const dir of stableContextDirs) {
  if (!testContextDirs.includes(dir)) {
    warnings.push(`[テスト不在] stable コンテキストの dir "${dir}" に対応する ${testDirArg}/${dir}/ ディレクトリがない`);
  }
}

// ---- 出力 -------------------------------------------------------------------

if (errors.length === 0 && warnings.length === 0) {
  console.log('✅ 整合性チェック: 問題なし');
  process.exit(0);
}

if (errors.length) {
  console.log('\n❌ エラー:');
  for (const e of errors) console.log('  ' + e);
}
if (warnings.length) {
  console.log('\n⚠️  警告:');
  for (const w of warnings) console.log('  ' + w);
}

process.exit(errors.length > 0 ? 1 : 0);
