/**
 * scan-config.cjs — 「どのファイルを実装として走査するか」の共有定義
 *
 * check-vocab.js / generate-map.js / suggest-annotations.js が同じ基準でファイルを集めるための
 * 共通モジュール。走査対象がスクリプトごとにずれると、アノテーションが実在するのに不可視になり
 * `[未実装]` を誤検出する。
 *
 * 走査対象のファイルは git が可視とみなすもの（追跡済み + 未追跡かつ gitignore されていない）に限る。
 * gitignore 済みの生成物・配布物は原本と独立にドリフトし、修正済みの違反を再注入するため、
 * これを走査すると lint 結果が原本の状態ではなくビルドのタイミングに左右される。
 * git リポジトリでない場合はファイルシステムを直接歩く（gitignore は参照できない）。
 *
 * さらに絞り込みを `<meta>/.claude/tdd/config.json` の `vocab_scan` で宣言する:
 *
 *   { "vocab_scan": {
 *       "extensions": [".js", ".swift"],             // 走査する拡張子（宣言したものだけ。未設定なら既定リスト）
 *       "exclude": ["dist-app", "tests/acceptance"], // 見ない場所（基本除外に足す）
 *       "roots": ["src", "lib", "native"]            // 走査するディレクトリ（未設定ならリポジトリ全体）
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
const { execFileSync } = require('child_process');

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
 * ファイルにもディレクトリにも使える（パスの途中の要素が一致すれば除外）。
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
    const segments = path.relative(root, absPath).split(path.sep);
    if (segments.some(seg => names.has(seg))) return true;
    if (paths.size === 0) return false;
    const rel = segments.join('/');
    for (const p of paths) {
      if (rel === p || rel.startsWith(`${p}/`)) return true;
    }
    return false;
  };
}

/**
 * 走査設定を読む。
 *   root         : リポジトリルート（通常 process.cwd()）
 *   implExclude  : 実装ファイルの走査でだけ足す除外（テストディレクトリ等）
 * 返り値の roots は null なら「リポジトリ全体」。
 */
function loadScanConfig(root, { implExclude = [] } = {}) {
  const configPath = findConfigPath(root);
  let declared = {};
  if (configPath) {
    try {
      declared = JSON.parse(fs.readFileSync(configPath, 'utf-8')).vocab_scan || {};
    } catch (e) {
      throw new Error(`config parse failed: ${configPath}\n${e.message}`);
    }
  }
  const excludeEntries = [...BASE_EXCLUDE, ...(declared.exclude || [])].filter(Boolean);
  return {
    configPath,
    declared: Object.keys(declared).length > 0,
    extensions: nonEmptyArray(declared.extensions)
      ? declared.extensions.map(normalizeExt)
      : DEFAULT_EXTENSIONS.slice(),
    exclude: makeExcluder(root, excludeEntries),
    implExclude: makeExcluder(root, [...excludeEntries, ...implExclude.filter(Boolean)]),
    roots: nonEmptyArray(declared.roots) ? declared.roots.slice() : null,
  };
}

// ---- ファイルの可視集合 -------------------------------------------------------

function hasExt(name, extensions) {
  return extensions.some(ext => name.endsWith(ext));
}

function isHidden(root, absPath) {
  return path.relative(root, absPath).split(path.sep).some(seg => seg.startsWith('.'));
}

/** git が可視とみなすファイル（追跡済み + 未追跡かつ gitignore されていないもの） */
function gitVisibleFiles(root) {
  let out;
  try {
    out = execFileSync('git', ['-C', root, 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
      encoding: 'utf-8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch (e) {
    return null;   // git がない・リポジトリでない
  }
  return out.split('\0').filter(Boolean).map(rel => path.join(root, rel));
}

/** git を使えないときの代替。gitignore は参照できないので基本除外だけで刈る */
function walkAllFiles(root, exclude) {
  const results = [];
  function walk(d) {
    if (!fs.existsSync(d)) return;
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const full = path.join(d, entry.name);
      if (exclude(full)) continue;
      if (entry.isDirectory()) walk(full);
      else results.push(full);
    }
  }
  walk(root);
  return results;
}

/** リポジトリ内の可視ファイル一覧（cfg にキャッシュする） */
function visibleFiles(root, cfg) {
  if (!cfg._visibleFiles) {
    const listed = gitVisibleFiles(root);
    cfg._visibleFiles = listed
      ? listed.filter(f => !isHidden(root, f) && fs.existsSync(f))
      : walkAllFiles(root, cfg.exclude);
  }
  return cfg._visibleFiles;
}

function isUnder(dir, file) {
  return file === dir || file.startsWith(dir + path.sep);
}

/**
 * dir 以下の可視ファイルを、除外と拡張子で絞って返す。
 *   exclude : 使う除外器（cfg.exclude か cfg.implExclude）
 */
function filesUnder(root, cfg, dir, { extensions, exclude = cfg.exclude } = {}) {
  const base = path.resolve(root, dir);
  return visibleFiles(root, cfg).filter(f =>
    isUnder(base, f) && !exclude(f) && (!extensions || hasExt(f, extensions))
  );
}

/** dir 直下のディレクトリ名（可視ファイルを1つ以上含み、除外されていないもの） */
function visibleDirsIn(root, cfg, dir) {
  const base = path.resolve(root, dir);
  const names = new Set();
  for (const file of visibleFiles(root, cfg)) {
    if (!isUnder(base, file)) continue;
    const rest = path.relative(base, file).split(path.sep);
    if (rest.length < 2) continue;
    if (cfg.exclude(path.join(base, rest[0]))) continue;
    names.add(rest[0]);
  }
  return [...names];
}

function rootDirs(root, cfg) {
  return cfg.roots ? cfg.roots.map(r => path.resolve(root, r)) : [root];
}

/** 走査設定に従って実装ファイルを集める（絶対パス、重複なし） */
function collectImplFiles(root, cfg) {
  const seen = new Set();
  for (const dir of rootDirs(root, cfg)) {
    for (const f of filesUnder(root, cfg, dir, { extensions: cfg.extensions, exclude: cfg.implExclude })) {
      seen.add(f);
    }
  }
  return [...seen];
}

/**
 * 走査対象の*外*にアノテーションがあるファイルを探す（設定の不足の検出）。
 *   byExt   : 拡張子が走査対象に入っていない → vocab_scan.extensions に足す候補
 *   outside : 拡張子は対象だが roots の外にある → roots か exclude に足す候補
 * exclude で明示的に除外されたもの・gitignore 済みのものは、意図的な除外として報告しない。
 */
function findUnscannedAnnotations(root, cfg) {
  const inRoots = rootDirs(root, cfg);
  const byExt = new Map();
  const outside = [];

  const candidates = filesUnder(root, cfg, root, {
    extensions: CANDIDATE_EXTENSIONS,
    exclude: cfg.implExclude,
  });

  for (const file of candidates) {
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
    } else if (cfg.roots && !inRoots.some(r => isUnder(r, file))) {
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
  filesUnder,
  visibleDirsIn,
  hasExt,
};
