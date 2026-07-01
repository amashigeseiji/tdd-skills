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
 *   - エントリの src が指すファイルが実在するか
 *   - src が指すファイルに、対応する @vocab がついているか（src と @vocab の矛盾検出）
 */

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const testDirArg = process.argv[2] || 'tests';
const testDir = path.resolve(root, testDirArg);
const testDirBasename = path.relative(root, testDir).split(path.sep)[0];

// ---- パーサー ---------------------------------------------------------------

function parseDictionary(filePath) {
  if (!fs.existsSync(filePath)) return { contexts: [], concepts: [], conceptsByContext: [], entriesWithSrc: [] };
  let dict;
  try {
    dict = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (e) {
    throw new Error(`dictionary parse failed: ${filePath}\n${e.message}`);
  }
  const contexts = (dict.contexts || []).map(c => ({ name: c.name, dir: c.dir }));
  const concepts = (dict.entries || []).map(e => e.name);
  const conceptsByContext = (dict.entries || []).map(e => `${e.context}::${e.name}`);
  const entriesWithSrc = (dict.entries || [])
    .filter(e => e.src)
    .map(e => ({ name: e.name, context: e.context, src: e.src }));
  return { contexts, concepts, conceptsByContext, entriesWithSrc };
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
          // @vocab: 概念名 または @vocab: 概念名[context]
          const vm = line.match(/@vocab:?\s+(.+)/);
          if (vm) {
            const raw = vm[1].trim();
            const ctxMatch = raw.match(/^(.+?)\[([^\]]+)\]$/);
            if (ctxMatch) {
              vocabs.push({ name: ctxMatch[1].trim(), context: ctxMatch[2].trim() });
            } else {
              vocabs.push({ name: raw, context: null });
            }
          }
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

const stableDict = parseDictionary(path.join(root, 'docs/dictionary.json'));
const wipContexts = [];
const wipConcepts = [];
const wipConceptsByContext = [];
const wipEntriesWithSrc = [];

const plansDir = path.join(root, 'plans');
if (fs.existsSync(plansDir)) {
  for (const plan of fs.readdirSync(plansDir)) {
    const wipPath = path.join(plansDir, plan, 'dictionary.json');
    const wip = parseDictionary(wipPath);
    wipContexts.push(...wip.contexts);
    wipConcepts.push(...wip.concepts);
    wipConceptsByContext.push(...wip.conceptsByContext);
    wipEntriesWithSrc.push(...wip.entriesWithSrc);
  }
}

const allEntriesWithSrc = [...stableDict.entriesWithSrc, ...wipEntriesWithSrc];

const allConcepts = new Set([...stableDict.concepts, ...wipConcepts]);
const allConceptsByContext = new Set([...stableDict.conceptsByContext, ...wipConceptsByContext]);
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

  for (const { name, context } of vocabs) {
    if (context) {
      if (!allConceptsByContext.has(`${context}::${name}`)) {
        errors.push(`[リンク切れ] ${rel}: @vocab "${name}[${context}]" — 辞書に存在しない`);
      }
    } else {
      if (!allConcepts.has(name)) {
        errors.push(`[リンク切れ] ${rel}: @vocab "${name}" — 辞書に存在しない`);
      }
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

// src の実在確認・@vocab との矛盾検出（impls は既に scanImplementations() で取得済みのものを再利用）
const vocabFilesByConcept = new Map(); // "name" または "context::name" -> Set<relPath>
for (const { file, vocabs } of impls) {
  const rel = path.normalize(path.relative(root, file));
  for (const { name, context } of vocabs) {
    const key = context ? `${context}::${name}` : name;
    if (!vocabFilesByConcept.has(key)) vocabFilesByConcept.set(key, new Set());
    vocabFilesByConcept.get(key).add(rel);
  }
}

for (const { name, context, src } of allEntriesWithSrc) {
  if (!fs.existsSync(path.join(root, src))) {
    warnings.push(`[src不在] "${name}" の src "${src}" が存在しない`);
    continue;
  }
  const normalizedSrc = path.normalize(src);
  const key = context ? `${context}::${name}` : name;
  const vocabFiles = vocabFilesByConcept.get(key) || vocabFilesByConcept.get(name);
  if (vocabFiles && !vocabFiles.has(normalizedSrc)) {
    warnings.push(`[src不一致] "${name}" の src "${src}" に @vocab がない（@vocab があるのは: ${[...vocabFiles].join(', ')}）`);
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
