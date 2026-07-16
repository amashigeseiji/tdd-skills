#!/usr/bin/env node
//
// Usage:
//   dict-write.js add     --to <dict.json> [--file <input.json>] [--discovered <name>]
//   dict-write.js update  --to <dict.json> --name <概念名> [--context <dir>] [--file <patch.json>]
//   dict-write.js promote --from <plans/dict.json> [--to <docs/dict.json>] <概念名> ... | --all
//   dict-write.js remove  --from <dict.json> <概念名> ...
//   dict-write.js check   <dict.json>
//
// 語彙辞書（dictionary.json）への書き込み専用スクリプト。検索は dict-search.js。
// すべての書き込みは検証を通過しないと実行されない。詳細は --help を参照。

import fs from 'fs';
import path from 'path';

const DOMAINS = ['application', 'solution', 'pattern'];
const RELATION_TYPES = ['contains', 'belongs_to', 'references'];
const WIP_STATUSES = ['new', 'redefine'];
const ENTRY_FIELDS = ['name', 'en', 'context', 'domain', 'definition', 'relations', 'src', 'heuristic', 'components', 'wip'];
const CONTEXT_FIELDS = ['dir', 'name', 'description', 'primary_users', 'in_scope', 'out_of_scope'];

function findMetaRepo() {
  let d = process.cwd();
  while (d !== '/') {
    if (fs.existsSync(path.join(d, '.claude/tdd/config.json'))) return d;
    d = path.dirname(d);
  }
  return process.cwd();
}

function loadDict(filePath) {
  if (!fs.existsSync(filePath)) return { version: '1', contexts: [], entries: [] };
  const dict = parseJsonRelaxed(fs.readFileSync(filePath, 'utf8'), filePath);
  dict.contexts = dict.contexts || [];
  dict.entries = dict.entries || [];
  return dict;
}

// 既存の dictionary.json の手書きスタイルに合わせる:
// contexts / entries は複数行、深い階層のオブジェクト
// （relations の各要素・wip・components の各要素）は1行。
function fmtInline(value) {
  if (Array.isArray(value)) return '[' + value.map(fmtInline).join(', ') + ']';
  if (value && typeof value === 'object') {
    const body = Object.entries(value).map(([k, v]) => `${JSON.stringify(k)}: ${fmtInline(v)}`);
    return '{ ' + body.join(', ') + ' }';
  }
  return JSON.stringify(value);
}

function serialize(value, depth) {
  const pad = '  '.repeat(depth);
  const padIn = '  '.repeat(depth + 1);
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    return '[\n' + value.map(v => padIn + serialize(v, depth + 1)).join(',\n') + '\n' + pad + ']';
  }
  if (value && typeof value === 'object') {
    if (depth >= 3) return fmtInline(value);
    const body = Object.entries(value).map(([k, v]) => `${padIn}${JSON.stringify(k)}: ${serialize(v, depth + 1)}`);
    return '{\n' + body.join(',\n') + '\n' + pad + '}';
  }
  return JSON.stringify(value);
}

function saveDict(filePath, dict) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, serialize(dict, 0) + '\n');
}

// The stable layer is docs/dictionary.json by convention; everything else
// (plans/<project>/dictionary.json) is the wip layer.
function isStableLayer(filePath) {
  return path.resolve(filePath).endsWith(path.join('docs', 'dictionary.json'));
}

// Strip trailing commas outside of strings so hand-written JSON is accepted.
function stripTrailingCommas(text) {
  let out = '';
  let inStr = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      out += ch;
      if (ch === '\\') out += text[++i] ?? '';
      else if (ch === '"') inStr = false;
    } else if (ch === '"') {
      inStr = true;
      out += ch;
    } else if (ch === ',') {
      let j = i + 1;
      while (j < text.length && /\s/.test(text[j])) j++;
      if (text[j] === '}' || text[j] === ']') continue;
      out += ch;
    } else {
      out += ch;
    }
  }
  return out;
}

function parseJsonRelaxed(text, label) {
  try {
    return JSON.parse(text);
  } catch (e1) {
    try {
      return JSON.parse(stripTrailingCommas(text));
    } catch {
      let loc = '';
      const m = /position (\d+)/.exec(e1.message);
      if (m) {
        const pos = parseInt(m[1], 10);
        const before = text.slice(0, pos);
        const line = before.split('\n').length;
        const col = pos - before.lastIndexOf('\n');
        loc = `（${line}行目 ${col}文字目付近）`;
      }
      fail(`JSONパースエラー${label ? ` [${label}]` : ''}: ${e1.message} ${loc}`);
    }
  }
}

function readInput(fileOpt) {
  const text = fileOpt ? fs.readFileSync(fileOpt, 'utf8') : fs.readFileSync(0, 'utf8');
  if (!text.trim()) fail('入力が空です（stdin または --file でエントリ JSON を渡してください）');
  return parseJsonRelaxed(text, fileOpt || 'stdin');
}

// Normalize input into { contexts: [], entries: [] }.
// Accepts: a single entry, a single context, an array of entries,
// or a { contexts, entries } wrapper.
function normalizeInput(parsed) {
  if (Array.isArray(parsed)) return { contexts: [], entries: parsed };
  if (parsed && typeof parsed === 'object') {
    if (parsed.contexts || parsed.entries) {
      return { contexts: parsed.contexts || [], entries: parsed.entries || [] };
    }
    if (parsed.name !== undefined && parsed.definition !== undefined) {
      return { contexts: [], entries: [parsed] };
    }
    if (parsed.dir !== undefined) return { contexts: [parsed], entries: [] };
  }
  fail('入力の形式を認識できません。エントリ（name/definition あり）、コンテキスト（dir あり）、その配列、または {contexts, entries} を渡してください');
}

// 定義文中の #参照 を、既知の概念名の最長一致で抽出する。
// namesByLength は概念名を文字数降順に並べた配列（長い名前を優先して一致させる）。
// 一致する名前がない #トークン は unresolved として返す（空白・句読点で切り出し）。
function extractInlineRefs(definition, namesByLength) {
  const resolved = [];
  const unresolved = [];
  let i = 0;
  while ((i = definition.indexOf('#', i)) !== -1) {
    const name = namesByLength.find(n => definition.startsWith(n, i + 1));
    if (name) {
      resolved.push(name);
      i += 1 + name.length;
    } else {
      const m = /^[^\s。、）「」]+/.exec(definition.slice(i + 1));
      if (m) unresolved.push(m[0]);
      i += 1 + (m ? m[0].length : 0);
    }
  }
  return { resolved, unresolved };
}

function key(e) {
  return `${e.context}::${e.name}`;
}

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim() !== '';
}

// ---- validation -------------------------------------------------------

function validateContext(ctx) {
  const errors = [];
  const warnings = [];
  const label = `コンテキスト ${ctx.dir ?? ctx.name ?? '(不明)'}`;
  if (!isNonEmptyString(ctx.dir)) errors.push(`${label}: dir が必要です`);
  if (!isNonEmptyString(ctx.name)) errors.push(`${label}: name が必要です`);
  for (const f of Object.keys(ctx)) {
    if (!CONTEXT_FIELDS.includes(f)) warnings.push(`${label}: 未知のフィールド "${f}"`);
  }
  return { errors, warnings };
}

// knownDirs: Set of valid context dir names, universe: entries for reference checks.
function validateEntry(entry, { knownDirs, targetIsStable }) {
  const errors = [];
  const warnings = [];
  const label = `エントリ ${entry.name ?? '(名前なし)'}`;

  if (!isNonEmptyString(entry.name)) errors.push(`${label}: name が必要です`);
  if (!isNonEmptyString(entry.en)) errors.push(`${label}: en（PascalCase の英語名）が必要です`);
  if (!isNonEmptyString(entry.definition)) errors.push(`${label}: definition が必要です`);
  if (!DOMAINS.includes(entry.domain)) {
    errors.push(`${label}: domain は ${DOMAINS.join(' | ')} のいずれか（現在: ${JSON.stringify(entry.domain)}）`);
  }

  if (entry.domain === 'pattern') {
    if (entry.context !== null) errors.push(`${label}: pattern エントリの context は null にする（現在: ${JSON.stringify(entry.context)}）`);
    if (!isNonEmptyString(entry.heuristic)) errors.push(`${label}: pattern エントリには heuristic が必要です`);
  } else {
    if (!isNonEmptyString(entry.context)) {
      errors.push(`${label}: context が必要です（pattern 以外は null 不可）`);
    } else if (!knownDirs.has(entry.context)) {
      errors.push(`${label}: context "${entry.context}" が定義されていません（contexts に追加するか既存の dir を使う）`);
    }
  }

  if (entry.relations !== undefined) {
    if (!Array.isArray(entry.relations)) {
      errors.push(`${label}: relations は配列にする`);
    } else {
      for (const r of entry.relations) {
        if (!RELATION_TYPES.includes(r.type)) {
          errors.push(`${label}: relations.type は ${RELATION_TYPES.join(' | ')} のいずれか（現在: ${JSON.stringify(r.type)}）`);
        }
        if (!isNonEmptyString(r.target)) errors.push(`${label}: relations.target が必要です`);
      }
    }
  }

  if (entry.components !== undefined && !Array.isArray(entry.components)) {
    errors.push(`${label}: components は配列にする`);
  }

  if (entry.wip !== undefined) {
    if (targetIsStable) {
      errors.push(`${label}: 安定層（docs/dictionary.json）へは wip 付きで書けません。promote を使ってください`);
    } else if (!WIP_STATUSES.includes(entry.wip?.status)) {
      errors.push(`${label}: wip.status は ${WIP_STATUSES.join(' | ')} のいずれか`);
    }
  }

  for (const f of Object.keys(entry)) {
    if (!ENTRY_FIELDS.includes(f)) warnings.push(`${label}: 未知のフィールド "${f}"`);
  }

  return { errors, warnings };
}

// Reference checks against the merged universe (docs + target + batch).
// strict=true (promote) turns unresolved references into errors.
function checkReferences(entry, universe, strict = false) {
  const errors = [];
  const warnings = [];
  const names = new Set(universe.map(e => e.name));
  const namesByLength = [...names].sort((a, b) => b.length - a.length);
  const label = `エントリ ${entry.name}`;

  for (const r of entry.relations || []) {
    if (!names.has(r.target)) {
      const msg = `${label}: relations の target "${r.target}" が見つかりません`;
      (strict ? errors : warnings).push(strict ? `${msg}（一緒に昇格するか relations を修正する）` : msg);
    }
  }
  const { resolved, unresolved } = extractInlineRefs(entry.definition || '', namesByLength);
  for (const ref of unresolved) {
    const msg = `${label}: definition 中の参照 #${ref} が見つかりません`;
    (strict ? errors : warnings).push(strict ? `${msg}（一緒に昇格するか定義を修正する）` : msg);
  }

  // contains はライフサイクルの統括宣言なので、相手側からのリンク
  // （relations または #参照、種類は問わない）があることを期待する。
  // belongs_to は子から親への一方的な宣言として正常（既存辞書の規約）。
  for (const r of entry.relations || []) {
    if (r.type !== 'contains') continue;
    const others = universe.filter(e => e.name === r.target && key(e) !== key(entry));
    if (others.length === 0) continue;
    const linked = others.some(o =>
      (o.relations || []).some(r2 => r2.target === entry.name) ||
      extractInlineRefs(o.definition || '', namesByLength).resolved.includes(entry.name)
    );
    if (!linked) warnings.push(`${label}: ${r.type} の相手 "${r.target}" 側にこのエントリへのリンクがありません（双方向性）`);
  }

  // 未解決の #参照 も「関係を書く意図」としては存在するので空扱いにしない
  // （未解決自体は上の警告で報告済み。二重警告を避ける）。
  if ((entry.relations || []).length === 0 && resolved.length === 0 && unresolved.length === 0) {
    warnings.push(`${label}: 関係が空です（孤立概念になります。dict-search.js -o で確認）`);
  }

  return { errors, warnings };
}

// ---- reporting --------------------------------------------------------

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

function report(errors, warnings) {
  if (errors.length > 0) {
    console.error(`## エラー: ${errors.length}件（書き込みは行われませんでした）\n`);
    for (const e of errors) console.error(`- ${e}`);
    if (warnings.length > 0) {
      console.error(`\n## 警告: ${warnings.length}件\n`);
      for (const w of warnings) console.error(`- ${w}`);
    }
    process.exit(1);
  }
  if (warnings.length > 0) {
    console.log(`## 警告: ${warnings.length}件\n`);
    for (const w of warnings) console.log(`- ${w}`);
    console.log('');
  }
}

// Insert the entry after the last entry of the same context to keep the
// file grouped by context (matching the existing hand-maintained layout).
function insertEntry(entries, entry) {
  let last = -1;
  for (let i = 0; i < entries.length; i++) {
    if (entries[i].context === entry.context) last = i;
  }
  if (last === -1) entries.push(entry);
  else entries.splice(last + 1, 0, entry);
}

// ---- subcommands ------------------------------------------------------

function cmdAdd(opts) {
  if (!opts.to) fail('add には --to <dict.json> が必要です');
  const input = normalizeInput(readInput(opts.file));
  const dict = loadDict(opts.to);
  const stable = isStableLayer(opts.to);
  const docsDict = stable ? dict : loadDict(path.join(findMetaRepo(), 'docs/dictionary.json'));

  const errors = [];
  const warnings = [];

  const knownDirs = new Set([
    ...docsDict.contexts.map(c => c.dir),
    ...dict.contexts.map(c => c.dir),
    ...input.contexts.map(c => c.dir),
  ]);

  for (const ctx of input.contexts) {
    const r = validateContext(ctx);
    errors.push(...r.errors);
    warnings.push(...r.warnings);
    if (dict.contexts.some(c => c.dir === ctx.dir)) {
      errors.push(`コンテキスト ${ctx.dir}: 既に存在します（変更は update ではなく直接相談してください）`);
    }
  }

  // Auto-attach wip when writing to the wip layer. An entry sharing a key with
  // an existing docs-side entry is a redefinition, not a fresh discovery —
  // default to that and flag the mismatch if the caller said otherwise.
  for (const entry of input.entries) {
    if (stable) continue;
    const existsInDocs = docsDict.entries.some(e => key(e) === key(entry));
    if (entry.wip === undefined) {
      entry.wip = { status: existsInDocs ? 'redefine' : 'new', discovered: opts.discovered || 'その他' };
    } else if (existsInDocs && entry.wip.status === 'new') {
      warnings.push(`エントリ ${entry.name}: docs 側に同名エントリがありますが wip.status が "new" です（"redefine" の間違いでは？）`);
    }
  }

  const seen = new Set();
  const universe = [...docsDict.entries, ...(stable ? [] : dict.entries), ...input.entries];
  for (const entry of input.entries) {
    const r = validateEntry(entry, { knownDirs, targetIsStable: stable });
    errors.push(...r.errors);
    warnings.push(...r.warnings);
    if (dict.entries.some(e => key(e) === key(entry))) {
      errors.push(`エントリ ${entry.name}: 既に存在します（update を使ってください）`);
    }
    if (seen.has(key(entry))) errors.push(`エントリ ${entry.name}: 入力内で重複しています`);
    seen.add(key(entry));
    const rr = checkReferences(entry, universe);
    errors.push(...rr.errors);
    warnings.push(...rr.warnings);
  }

  report(errors, warnings);

  for (const ctx of input.contexts) dict.contexts.push(ctx);
  for (const entry of input.entries) insertEntry(dict.entries, entry);
  saveDict(opts.to, dict);

  console.log(`${opts.to} に書き込みました:`);
  for (const ctx of input.contexts) console.log(`- コンテキスト追加: ${ctx.name} [${ctx.dir}]`);
  for (const e of input.entries) console.log(`- エントリ追加: ${e.name} [${e.context}/${e.domain}]${e.wip ? ' (wip)' : ''}`);
}

function cmdUpdate(opts) {
  if (!opts.to) fail('update には --to <dict.json> が必要です');
  if (!opts.name) fail('update には --name <概念名> が必要です');
  const patch = readInput(opts.file);
  if (Array.isArray(patch) || typeof patch !== 'object' || patch === null) {
    fail('update の入力は差し替えるフィールドだけを持つオブジェクトにしてください（例: {"definition": "..."}）');
  }

  const dict = loadDict(opts.to);
  const stable = isStableLayer(opts.to);
  const docsDict = stable ? dict : loadDict(path.join(findMetaRepo(), 'docs/dictionary.json'));

  let targets = dict.entries.filter(e => e.name === opts.name);
  if (opts.context !== undefined) {
    const ctxVal = opts.context === 'null' ? null : opts.context;
    targets = targets.filter(e => e.context === ctxVal);
  }
  if (targets.length === 0) fail(`エントリ "${opts.name}" が ${opts.to} に見つかりません`);
  if (targets.length > 1) {
    fail(`エントリ "${opts.name}" が複数あります。--context で特定してください: ${targets.map(e => e.context).join(', ')}`);
  }

  const existing = targets[0];
  const index = dict.entries.indexOf(existing);
  const updated = { ...existing };
  for (const [k, v] of Object.entries(patch)) {
    if (v === null && k !== 'context') delete updated[k];
    else updated[k] = v;
  }

  const knownDirs = new Set([...docsDict.contexts.map(c => c.dir), ...dict.contexts.map(c => c.dir)]);
  const errors = [];
  const warnings = [];
  const r = validateEntry(updated, { knownDirs, targetIsStable: stable });
  errors.push(...r.errors);
  warnings.push(...r.warnings);
  if (key(updated) !== key(existing) && dict.entries.some(e => key(e) === key(updated))) {
    errors.push(`エントリ ${updated.name}: 変更後の名前が既存エントリと重複します`);
  }
  const universe = [...docsDict.entries, ...(stable ? [] : dict.entries.map(e => (e === existing ? updated : e)))];
  const rr = checkReferences(updated, universe);
  errors.push(...rr.errors);
  warnings.push(...rr.warnings);

  report(errors, warnings);

  dict.entries[index] = updated;
  saveDict(opts.to, dict);
  const changed = Object.keys(patch).join(', ');
  console.log(`${opts.to} を更新しました: ${updated.name} [${updated.context}/${updated.domain}]（${changed}）`);
}

function cmdPromote(opts, names) {
  if (!opts.from) fail('promote には --from <plans/dict.json> が必要です');
  const fromDict = loadDict(opts.from);
  const toPath = opts.to || path.join(findMetaRepo(), 'docs/dictionary.json');
  if (!isStableLayer(toPath)) fail(`昇格先 ${toPath} が安定層（docs/dictionary.json）ではありません`);
  const toDict = loadDict(toPath);

  let moving;
  if (opts.all) {
    moving = [...fromDict.entries];
  } else {
    if (names.length === 0) fail('promote する概念名を指定してください（全件は --all）');
    moving = [];
    for (const name of names) {
      const found = fromDict.entries.filter(e => e.name === name);
      if (found.length === 0) fail(`エントリ "${name}" が ${opts.from} に見つかりません`);
      moving.push(...found);
    }
  }
  if (moving.length === 0) {
    console.log('(昇格対象なし)');
    return;
  }

  const errors = [];
  const warnings = [];

  // An entry whose key already exists in docs is a redefinition. wip.status
  // is the recorded intent for that (set by `add`, checked at write time),
  // so a "redefine" entry replaces the docs-side entry in place instead of
  // being rejected as a duplicate; anything else colliding on key is refused.
  const redefines = [];
  const adds = [];
  for (const e of moving) {
    const existing = toDict.entries.find(t => key(t) === key(e));
    if (!existing) {
      adds.push(e);
    } else if (e.wip?.status === 'redefine') {
      redefines.push({ entry: e, existing });
    } else {
      errors.push(`エントリ ${e.name}: 既に安定層に存在します（redefine として昇格するには wip.status を "redefine" にする）`);
    }
  }

  // Contexts referenced by promoted entries must exist in the stable layer;
  // copy them from the wip layer when missing.
  const promotedContexts = [];
  for (const e of moving) {
    if (e.context === null) continue;
    if (toDict.contexts.some(c => c.dir === e.context)) continue;
    if (promotedContexts.some(c => c.dir === e.context)) continue;
    const ctx = fromDict.contexts.find(c => c.dir === e.context);
    if (!ctx) {
      errors.push(`エントリ ${e.name}: context "${e.context}" が安定層にも ${opts.from} にも定義されていません`);
    } else {
      promotedContexts.push(ctx);
    }
  }

  const strip = e => { const copy = { ...e }; delete copy.wip; return copy; };
  const promotedAdds = adds.map(strip);
  const promotedRedefines = redefines.map(({ entry, existing }) => ({ entry: strip(entry), existing }));
  const promoted = [...promotedAdds, ...promotedRedefines.map(r => r.entry)];

  const knownDirs = new Set([...toDict.contexts.map(c => c.dir), ...promotedContexts.map(c => c.dir)]);
  // Redefines replace their existing docs-side entry in the reference universe.
  const replacedExisting = toDict.entries.map(t => {
    const r = promotedRedefines.find(pr => key(pr.existing) === key(t));
    return r ? r.entry : t;
  });
  const universe = [...replacedExisting, ...promotedAdds];
  for (const e of promoted) {
    const r = validateEntry(e, { knownDirs, targetIsStable: true });
    errors.push(...r.errors);
    warnings.push(...r.warnings);
    const rr = checkReferences(e, universe, true); // strict: 安定層の整合性を守る
    errors.push(...rr.errors);
    warnings.push(...rr.warnings);
  }

  report(errors, warnings);

  for (const ctx of promotedContexts) toDict.contexts.push(ctx);
  for (const e of promotedAdds) insertEntry(toDict.entries, e);
  for (const { entry, existing } of promotedRedefines) {
    toDict.entries[toDict.entries.indexOf(existing)] = entry;
  }
  fromDict.entries = fromDict.entries.filter(e => !moving.includes(e));
  saveDict(toPath, toDict);
  saveDict(opts.from, fromDict);

  console.log(`${opts.from} → ${toPath} に昇格しました:`);
  for (const ctx of promotedContexts) console.log(`- コンテキスト昇格: ${ctx.name} [${ctx.dir}]`);
  for (const e of promotedAdds) console.log(`- 追加: ${e.name} [${e.context}/${e.domain}]`);
  for (const { entry } of promotedRedefines) console.log(`- 再定義: ${entry.name} [${entry.context}/${entry.domain}]`);
  if (promotedContexts.length > 0) {
    console.log('\n注: 昇格したコンテキストの定義は plans 側にも残っています（マージで安定層が優先されるため実害はありません）');
  }
}

function cmdRemove(opts, names) {
  if (!opts.from) fail('remove には --from <dict.json> が必要です');
  if (names.length === 0) fail('remove する概念名を指定してください');
  if (isStableLayer(opts.from)) {
    fail('安定層（docs/dictionary.json）からの削除はこのスクリプトでは行いません（人間の判断でリポジトリを直接編集する）');
  }
  const dict = loadDict(opts.from);
  const removed = [];
  for (const name of names) {
    const found = dict.entries.filter(e => e.name === name);
    if (found.length === 0) fail(`エントリ "${name}" が ${opts.from} に見つかりません`);
    removed.push(...found);
  }
  dict.entries = dict.entries.filter(e => !removed.includes(e));
  saveDict(opts.from, dict);
  console.log(`${opts.from} から削除しました:`);
  for (const e of removed) console.log(`- ${e.name} [${e.context}/${e.domain}]`);
}

function cmdCheck(target) {
  if (!target) fail('check には対象の dict.json を指定してください');
  if (!fs.existsSync(target)) fail(`${target} が見つかりません`);
  const dict = loadDict(target);
  const stable = isStableLayer(target);
  const docsDict = stable ? dict : loadDict(path.join(findMetaRepo(), 'docs/dictionary.json'));

  const errors = [];
  const warnings = [];
  const knownDirs = new Set([...docsDict.contexts.map(c => c.dir), ...dict.contexts.map(c => c.dir)]);
  const universe = stable ? dict.entries : [...docsDict.entries, ...dict.entries];

  for (const ctx of dict.contexts) {
    const r = validateContext(ctx);
    errors.push(...r.errors);
    warnings.push(...r.warnings);
  }

  const seen = new Set();
  for (const entry of dict.entries) {
    const r = validateEntry(entry, { knownDirs, targetIsStable: stable });
    errors.push(...r.errors);
    warnings.push(...r.warnings);
    if (seen.has(key(entry))) errors.push(`エントリ ${entry.name}: 重複しています`);
    seen.add(key(entry));
    if (!stable && entry.wip === undefined) {
      warnings.push(`エントリ ${entry.name}: wip フィールドがありません（作業仮説層のエントリには wip を付ける）`);
    }
    const rr = checkReferences(entry, universe);
    errors.push(...rr.errors);
    warnings.push(...rr.warnings);
  }

  if (errors.length === 0 && warnings.length === 0) {
    console.log(`${target}: 問題なし（コンテキスト ${dict.contexts.length}件、エントリ ${dict.entries.length}件）`);
    return;
  }
  report(errors, warnings);
  console.log(`${target}: エラーなし（警告のみ）`);
}

// ---- main -------------------------------------------------------------

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`Usage:
  dict-write.js add     --to <dict.json> [--file <input.json>] [--discovered <name>]
  dict-write.js update  --to <dict.json> --name <概念名> [--context <dir>] [--file <patch.json>]
  dict-write.js promote --from <plans/dict.json> [--to <docs/dict.json>] <概念名> ... | --all
  dict-write.js remove  --from <dict.json> <概念名> ...
  dict-write.js check   <dict.json>

語彙辞書への書き込み専用スクリプト。すべての書き込みは検証を通過しないと実行されない。
エラー（フォーマット違反・重複・未定義 context 等）は書き込みを拒否し、
警告（参照未解決・双方向性の欠け・孤立等）は書き込んだうえで報告する。
定義中の #参照 は、既知の概念名が # の直後からそのまま続いている場合に
最長一致で解決する（例: #問題定義 は「問題」ではなく「問題定義」に解決）。

入力: --file がなければ stdin から JSON を読む。末尾カンマは許容。
  - エントリ1件、エントリの配列、コンテキスト（dir を持つオブジェクト）、
    または {"contexts": [...], "entries": [...]} を受け付ける
  - フォーマットは tdd-vocab/format.json を参照

add:
  plans 配下（作業仮説層）への追加では wip フィールドを自動付与する。
  docs 側に同名エントリがあれば wip.status は自動的に "redefine"、
  なければ "new" になる（明示指定した場合はそちらを使うが、
  docs 側に同名エントリがあるのに "new" を指定していれば警告する）。
  発見元は --discovered で指定（例: --discovered tdd-run）。
  安定層（docs/dictionary.json）へ wip 付きでは書けない。

update:
  渡したフィールドだけを差し替える。フィールドに null を渡すと削除する
  （例: {"wip": null}）。pattern エントリは --context null で特定する。

promote:
  plans → docs へ移動し wip を除去する。安定層の整合性を守るため、
  参照未解決（relations の target / #参照 が docs に存在しない）はエラーになる。
  wip.status: new は docs へ新規追加、wip.status: redefine は docs 側の同名エントリを
  置き換える（in-place）。docs に同名エントリがあるのに wip.status が redefine でない
  場合はエラーになる（add 時点の "new"/"redefine" 取り違え検出をすり抜けた場合の保険）。

check:
  書き込まずにファイル全体を検証する。エラーがあれば exit 1。

Examples:
  node dict-write.js add --to plans/myproject/dictionary.json --discovered "tdd-vocab plan" <<'EOF'
  { "name": "概念名", "en": "ConceptName", "context": "my-context",
    "domain": "application", "definition": "#既存概念 を参照する定義。",
    "relations": [{ "type": "references", "target": "既存概念", "note": "" }] }
  EOF
  node dict-write.js update --to plans/myproject/dictionary.json --name 概念名 <<'EOF'
  { "src": "src/my-context/concept.js" }
  EOF
  node dict-write.js promote --from plans/myproject/dictionary.json 概念名 別の概念名
  node dict-write.js check plans/myproject/dictionary.json`);
    process.exit(0);
  }

  const cmd = args[0];
  const opts = {};
  const positional = [];
  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--to') opts.to = args[++i];
    else if (arg === '--from') opts.from = args[++i];
    else if (arg === '--file') opts.file = args[++i];
    else if (arg === '--name') opts.name = args[++i];
    else if (arg === '--context') opts.context = args[++i];
    else if (arg === '--discovered') opts.discovered = args[++i];
    else if (arg === '--all') opts.all = true;
    else if (arg.startsWith('--')) fail(`未知のオプション: ${arg}`);
    else positional.push(arg);
  }

  if (cmd === 'add') cmdAdd(opts);
  else if (cmd === 'update') cmdUpdate(opts);
  else if (cmd === 'promote') cmdPromote(opts, positional);
  else if (cmd === 'remove') cmdRemove(opts, positional);
  else if (cmd === 'check') cmdCheck(positional[0]);
  else fail(`未知のサブコマンド: ${cmd}（add | update | promote | remove | check）`);
}

main();
