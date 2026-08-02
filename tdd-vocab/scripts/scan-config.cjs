/**
 * scan-config.cjs — 「どのファイルを実装として走査するか」の共有定義
 *
 * check-vocab.js / generate-map.js / suggest-annotations.js が同じ基準でファイルを集めるための
 * 共通モジュール。走査対象がスクリプトごとにずれると、アノテーションが実在するのに不可視になり
 * `[未実装]` を誤検出する。
 *
 * 走査範囲は `<meta>/.claude/tdd/config.json` の `vocab_scan` で宣言する:
 *
 *   { "vocab_scan": {
 *       "extensions": [".js", ".swift"],           // 走査する拡張子（宣言したものだけ。未設定なら既定リスト）
 *       "exclude": ["dist-app", "tests/acceptance"], // 見ない場所（基本除外に足す）
 *       "roots": ["src", "lib", "native"]          // 走査するディレクトリ（未設定ならリポジトリ全体）
 *   } }
 *
 * exclude の照合は .gitignore と同じ読み方をする——スラッシュを含まなければディレクトリ名として
 * どの階層でも一致し、含めばリポジトリルートからのパスとして一致する。
 * exclude は「この道具群が見ない場所」であり、実装ファイルの走査にもテストディレクトリの照合にも
 * 一律に効く（片方だけ効くと、抑制したはずの警告が別経路から出る）。
 *
 * 未設定のプロジェクトは従来どおりの既定値で動く。設定の不足は check-vocab.js が
 * `[走査対象外]` として検出し、config.json に足すべき値を提示する。
 *
 * generate-map.js は ESM なので default import で読む: import scanConfig from './scan-config.cjs'
 */

'use strict';

const fs = require('fs');
const path = require('path');

// 既定の走査対象拡張子（config.json の vocab_scan.extensions で置き換えられる）
const DEFAULT_EXTENSIONS = ['.js', '.ts', '.mjs', '.cjs', '.jsx', '.tsx', '.py', '.rb', '.go'];

// どの設定でも走査しないディレクトリ名（vocab_scan.exclude はこれに追加される）
const BASE_EXCLUDE = ['node_modules', '.git', 'dist', 'build'];

// テストディレクトリの慣習名。テストは実装ではないので、テストディレクトリを
// 引数で受け取らないスクリプト（generate-map.js）がこれを除外に使う。
const TEST_DIR_NAMES = ['tests', 'test', 'spec', '__tests__'];

// アノテーションを載せうるソース言語の拡張子の一覧。走査対象そのものではなく、
// 「走査対象に入っていないがアノテーションがありうるファイル」を検出するための候補表。
const CANDIDATE_EXTENSIONS = [
  ...DEFAULT_EXTENSIONS,
  '.vue', '.svelte', '.astro',
  '.swift', '.kt', '.kts', '.java', '.scala', '.rs', '.dart',
  '.php', '.cs', '.c', '.h', '.cpp', '.hpp', '.m', '.mm',
  '.ex', '.exs', '.erl', '.hs', '.clj', '.lua', '.pl', '.sh', '.sql',
];

const ANNOTATION_RE = /@vocab[:\s]/;

// ---- config ----------------------------------------------------------------

function findConfigPath(startDir) {
  let dir = path.resolve(startDir);
  for (;;) {
    const candidate = path.join(dir, '.claude', 'tdd', 'config.json');
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function normalizeExt(ext) {
  const e = String(ext).trim();
  return e.startsWith('.') ? e : `.${e}`;
}

function nonEmptyArray(v) {
  return Array.isArray(v) && v.length > 0;
}

/**
 * 除外の照合器を作る（.gitignore と同じ読み方）。
 *   スラッシュなし: ディレクトリ名としてどの階層でも一致（node_modules など）
 *   スラッシュあり: リポジトリルートからのパスとして一致（tests/acceptance など）
 */
function makeExcluder(root, entries) {
  const names = new Set();
  const paths = new Set();
  for (const entry of entries) {
    const value = String(entry).replace(/^\.\//, '').replace(/\/+$/, '');
    if (!value) continue;
    (value.includes('/') ? paths : names).add(value);
  }
  return absPath => {
    if (names.has(path.basename(absPath))) return true;
    if (paths.size === 0) return false;
    const rel = path.relative(root, absPath).split(path.sep).join('/');
    for (const p of paths) {
      if (rel === p || rel.startsWith(`${p}/`)) return true;
    }
    return false;
  };
}

/**
 * 走査設定を読む。
 *   root         : リポジトリルート（通常 process.cwd()）
 *   extraExclude : 呼び出し側が足す除外ディレクトリ名（テストディレクトリ等）
 * 返り値の roots は null なら「リポジトリ全体」。
 */
function loadScanConfig(root, { extraExclude = [] } = {}) {
  const configPath = findConfigPath(root);
  let declared = {};
  if (configPath) {
    try {
      declared = JSON.parse(fs.readFileSync(configPath, 'utf-8')).vocab_scan || {};
    } catch (e) {
      throw new Error(`config parse failed: ${configPath}\n${e.message}`);
    }
  }
  return {
    configPath,
    declared: Object.keys(declared).length > 0,
    extensions: nonEmptyArray(declared.extensions)
      ? declared.extensions.map(normalizeExt)
      : DEFAULT_EXTENSIONS.slice(),
    exclude: makeExcluder(root, [...BASE_EXCLUDE, ...(declared.exclude || []), ...extraExclude].filter(Boolean)),
    roots: nonEmptyArray(declared.roots) ? declared.roots.slice() : null,
  };
}

// ---- 走査 ------------------------------------------------------------------

function hasExt(name, extensions) {
  return extensions.some(ext => name.endsWith(ext));
}

function walkFiles(dir, exclude, accept) {
  const results = [];
  function walk(d) {
    if (!fs.existsSync(d)) return;
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const full = path.join(d, entry.name);
      if (exclude(full)) continue;
      if (entry.isDirectory()) walk(full);
      else if (accept(entry.name)) results.push(full);
    }
  }
  walk(dir);
  return results;
}

function rootDirs(root, cfg) {
  return cfg.roots ? cfg.roots.map(r => path.resolve(root, r)) : [root];
}

/** 走査設定に従って実装ファイルを集める（絶対パス、重複なし） */
function collectImplFiles(root, cfg) {
  const seen = new Set();
  for (const dir of rootDirs(root, cfg)) {
    for (const f of walkFiles(dir, cfg.exclude, name => hasExt(name, cfg.extensions))) seen.add(f);
  }
  return [...seen];
}

/**
 * 走査対象の*外*にアノテーションがあるファイルを探す（設定の不足の検出）。
 *   byExt   : 拡張子が走査対象に入っていない → vocab_scan.extensions に足す候補
 *   outside : 拡張子は対象だが roots の外にある → roots か exclude に足す候補
 * exclude で明示的に除外されたものは意図的な除外として扱い、報告しない。
 */
function findUnscannedAnnotations(root, cfg) {
  const inRoots = rootDirs(root, cfg);
  const byExt = new Map();
  const outside = [];

  for (const file of walkFiles(root, cfg.exclude, name => hasExt(name, CANDIDATE_EXTENSIONS))) {
    let content;
    try {
      content = fs.readFileSync(file, 'utf-8');
    } catch (e) {
      continue;
    }
    if (!ANNOTATION_RE.test(content)) continue;

    if (!hasExt(file, cfg.extensions)) {
      const ext = path.extname(file);
      if (!byExt.has(ext)) byExt.set(ext, []);
      byExt.get(ext).push(file);
    } else if (cfg.roots && !inRoots.some(r => file === r || file.startsWith(r + path.sep))) {
      outside.push(file);
    }
  }

  return { byExt, outside };
}

module.exports = {
  DEFAULT_EXTENSIONS,
  BASE_EXCLUDE,
  TEST_DIR_NAMES,
  CANDIDATE_EXTENSIONS,
  loadScanConfig,
  collectImplFiles,
  findUnscannedAnnotations,
  walkFiles,
  hasExt,
};
