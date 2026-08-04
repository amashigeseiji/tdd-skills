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
 *   - stable エントリに対応する @vocab を持つ実装が存在するか（逆引き。solution / ui のみ）
 *   - テストディレクトリ名が辞書コンテキストの dir フィールドと対応しているか
 *   - エントリの src が指すファイルが実在するか
 *   - src が指すファイルに、対応する @vocab がついているか（src と @vocab の矛盾検出）
 *   - src を持つ概念の @vocab が実装側に1つも無いか（src の宣言が裏付けを持つかの確認）
 *   - 走査対象の外に @vocab があるか（走査設定の不足の検出）
 *
 * 走査範囲は .claude/tdd/config.json の vocab_scan で宣言する（scan-config.cjs 参照）。
 */

const fs = require('fs');
const path = require('path');
const { loadScanConfig, collectImplFiles, findUnscannedAnnotations, visibleDirsIn } = require('./scan-config.cjs');

const root = process.cwd();
const testDirArg = process.argv[2] || 'tests';
const testDir = path.resolve(root, testDirArg);
const testDirBasename = path.relative(root, testDir).split(path.sep)[0];
const scanConfig = loadScanConfig(root, { implExclude: [testDirBasename] });
const configLabel = scanConfig.configPath
  ? path.relative(root, scanConfig.configPath) || scanConfig.configPath
  : '.claude/tdd/config.json';

// 逆引き（[未実装]）の対象ドメイン。application / actor / pattern / ui-pattern / design-token は
// 設計上、対応する実装装置を持たない（ユーザーが問題を語る言葉・行為の担い手・横断的な規約）。
const IMPL_DOMAINS = new Set(['solution', 'ui']);

// @vocab 行は行末までを概念名として読む。同じ行に注記を続けると説明文込みの文字列が
// 概念名として照合され、リンク切れの理由が読み取りにくくなる。照合に失敗した値が
// 注記を含んでいそうなときだけ、この区切りで前半を取り出して診断に添える。
const NOTE_SEPARATOR_RE = /[—–]|\s-\s|。|、|（|\(/;
// 区切り記号を持たない値を「長すぎる」と判定する閾値（概念名としての実用上限）
const NAME_LENGTH_LIMIT = 24;
const HINT_INDENT = ' '.repeat(13);

// ---- パーサー ---------------------------------------------------------------

function parseDictionary(filePath) {
  if (!fs.existsSync(filePath)) {
    return { contexts: [], concepts: [], conceptsByContext: [], entriesWithSrc: [], implConcepts: [] };
  }
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
  // 逆引きの対象になるのは実装装置を持つドメインのエントリだけ
  const implConcepts = (dict.entries || [])
    .filter(e => IMPL_DOMAINS.has(e.domain))
    .map(e => e.name);
  return { contexts, concepts, conceptsByContext, entriesWithSrc, implConcepts };
}

function scanImplementations() {
  const results = [];

  for (const full of collectImplFiles(root, scanConfig)) {
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
          vocabs.push({ name: ctxMatch[1].trim(), context: ctxMatch[2].trim(), raw });
        } else {
          vocabs.push({ name: raw, context: null, raw });
        }
      }
      // @test: path/to/file.test.js
      const tm = line.match(/@test:?\s+(.+)/);
      if (tm) tests.push(tm[1].trim());
    }
    if (vocabs.length || tests.length) results.push({ file: full, vocabs, tests });
  }

  return results;
}

// テスト側のコンテキストディレクトリ。可視ファイルを1つも持たないディレクトリ
// （gitignore 済み・空）は数えない。
function getTestContextDirs(dir) {
  if (!fs.existsSync(dir)) return [];
  return visibleDirsIn(root, scanConfig, dir);
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
const stableImplConcepts = new Set(stableDict.implConcepts);
const stableContextDirs = stableDict.contexts.map(c => c.dir || c.name);

const impls = scanImplementations();
const testContextDirs = getTestContextDirs(testDir);

// ---- チェック ---------------------------------------------------------------

const errors = [];
const warnings = [];

function isKnownConcept(name, context) {
  return context ? allConceptsByContext.has(`${context}::${name}`) : allConcepts.has(name);
}

// 照合に失敗した @vocab 値が、概念名に注記を続けた書き方に見えるかを診断する。
// 見えなければ null（記法以外の理由での照合失敗には何も足さない）。
function noteHint(raw, context) {
  const m = raw.match(NOTE_SEPARATOR_RE);
  const head = m ? raw.slice(0, m.index).trim() : null;
  if (!head && raw.length <= NAME_LENGTH_LIMIT) return null;
  let hint = `${HINT_INDENT}→ @vocab 行は概念名のみを取る（行末までが概念名として照合される）。注記は次の行に書く`;
  if (head && isKnownConcept(head, context)) {
    hint += `\n${HINT_INDENT}  "${head}" は辞書に存在する`;
  }
  return hint;
}

for (const { file, vocabs, tests } of impls) {
  const rel = path.relative(root, file);

  for (const { name, context, raw } of vocabs) {
    if (!isKnownConcept(name, context)) {
      const label = context ? `${name}[${context}]` : name;
      const hint = noteHint(raw, context);
      errors.push(`[リンク切れ] ${rel}: @vocab "${label}" — 辞書に存在しない` + (hint ? `\n${hint}` : ''));
    }
  }

  for (const testRef of tests) {
    if (!fs.existsSync(path.join(root, testRef))) {
      errors.push(`[ファイル不在] ${rel}: @test の参照先 "${testRef}" が存在しない`);
    }
  }
}

// stable エントリに @vocab が存在するか（逆引き。solution / ui のみ）
const implementedConcepts = new Set(impls.flatMap(i => i.vocabs.map(v => v.name)));
for (const concept of stableImplConcepts) {
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
  if (!vocabFiles) {
    // src は「この概念はこのファイルにある」という宣言なので、裏付けの @vocab が
    // 実装側のどこにも無いなら、書き忘れか src の指し先の誤り。
    warnings.push(`[src未注釈] "${name}" の src "${src}" にこの概念の @vocab がない（実装側のどこにも見つからない）`);
  } else if (!vocabFiles.has(normalizedSrc)) {
    warnings.push(`[src不一致] "${name}" の src "${src}" に @vocab がない（@vocab があるのは: ${[...vocabFiles].join(', ')}）`);
  }
}

// テストディレクトリと辞書コンテキスト dir の対応
for (const dir of testContextDirs) {
  if (!allContextDirs.has(dir)) {
    warnings.push(
      `[未対応] ${testDirArg}/${dir}/ に対応する辞書コンテキスト（dir フィールド）が存在しない\n` +
      `         → BC 単位で切られたディレクトリでないなら ${configLabel} の vocab_scan.exclude に "${testDirArg}/${dir}" を追加する`
    );
  }
}
for (const dir of stableContextDirs) {
  if (!testContextDirs.includes(dir)) {
    warnings.push(`[テスト不在] stable コンテキストの dir "${dir}" に対応する ${testDirArg}/${dir}/ ディレクトリがない`);
  }
}

// 走査対象の外に @vocab があるか（走査設定の不足の検出）
const { byExt: unscannedByExt, outside: unscannedOutside } = findUnscannedAnnotations(root, scanConfig);

for (const [ext, files] of unscannedByExt) {
  const sample = files.slice(0, 3).map(f => path.relative(root, f)).join(', ');
  warnings.push(
    `[走査対象外] ${ext} の ${files.length} ファイルに @vocab があるが走査していない（${sample}${files.length > 3 ? ' ほか' : ''}）\n` +
    `             → ${configLabel} の vocab_scan.extensions に "${ext}" を追加する`
  );
}
if (unscannedOutside.length) {
  const sample = unscannedOutside.slice(0, 3).map(f => path.relative(root, f)).join(', ');
  warnings.push(
    `[走査対象外] vocab_scan.roots の外の ${unscannedOutside.length} ファイルに @vocab がある（${sample}${unscannedOutside.length > 3 ? ' ほか' : ''}）\n` +
    `             → ${configLabel} の vocab_scan.roots に足すか、走査すべきでないなら vocab_scan.exclude に足す`
  );
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
