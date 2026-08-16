#!/usr/bin/env node
//
// Usage:
//   acts-write.js add         [--to <acts.json>] [--file <entry.json>] [--allow-similar]
//   acts-write.js witness-add <act-id> [--to <acts.json>] [--file <input.json>]
//   acts-write.js check       [<acts.json>]
//
// 行為の登記簿（docs/acts.json）への書き込み専用スクリプト。検索は acts-search.js。
// すべての書き込みは検証を通過しないと実行されない。詳細は --help を参照。

import fs from 'fs';
import path from 'path';

const ENTRY_FIELDS = ['id', 'actor', 'claim', 'parent', 'context', 'witness', 'settled', 'resettled'];
const WITNESS_FIELDS = ['acceptance'];
const SETTLED_FIELDS = ['date', 'project', 'devices', 'unitTests', 'retro', 'evidence'];
const RESETTLED_FIELDS = ['date', 'project', 'acceptance', 'devices', 'unitTests'];
const EVIDENCE_VALUES = ['findings', 'in-use'];

// 防衛線の近接判定のしきい値（文字バイグラムの Dice 係数）。
// 粗くてよい——見逃しは check や登記の表のレビューが拾う。誤検出は --allow-similar で越えられる。
const SIMILARITY_THRESHOLD = 0.5;

function findMetaRepo() {
  let d = process.cwd();
  while (d !== '/') {
    if (fs.existsSync(path.join(d, '.claude/tdd/config.json'))) return d;
    d = path.dirname(d);
  }
  return process.cwd();
}

function fail(msg) {
  console.error(msg);
  process.exit(1);
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
      fail(`JSONパースエラー${label ? ` [${label}]` : ''}: ${e1.message}`);
    }
  }
}

function loadLedger(filePath) {
  if (!fs.existsSync(filePath)) return { version: '1', acts: [] };
  const ledger = parseJsonRelaxed(fs.readFileSync(filePath, 'utf8'), filePath);
  ledger.acts = ledger.acts || [];
  return ledger;
}

function loadDict(filePath) {
  if (!fs.existsSync(filePath)) return { contexts: [], entries: [] };
  const dict = parseJsonRelaxed(fs.readFileSync(filePath, 'utf8'), filePath);
  dict.contexts = dict.contexts || [];
  dict.entries = dict.entries || [];
  return dict;
}

// dict-write.js と同じ整形方針: 浅い階層は複数行、深い階層（witness / settled）は1行。
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

function saveLedger(filePath, ledger) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, serialize(ledger, 0) + '\n');
}

function readInput(fileOpt) {
  const text = fileOpt ? fs.readFileSync(fileOpt, 'utf8') : fs.readFileSync(0, 'utf8');
  if (!text.trim()) fail('入力が空です（stdin または --file でエントリ JSON を渡してください）');
  return parseJsonRelaxed(text, fileOpt || 'stdin');
}

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim() !== '';
}

function nextId(acts) {
  let max = 0;
  for (const a of acts) {
    const m = /^act-(\d+)$/.exec(a.id || '');
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `act-${String(max + 1).padStart(4, '0')}`;
}

// ---- witness anchors --------------------------------------------------

// アンカーは <レポジトリ相対のテストファイルパス>#<describe表題>（入れ子は ' > ' 区切り）。
// 表題は全文一致の生きた参照——ファイル内容に各表題が現れなくなったらリンク切れとして報告する。
// テストランナーは規定しないため構文解析はせず、表題文字列の出現で判定する（粗くてよい）。
function validateAnchor(anchor, root, label) {
  const errors = [];
  if (!isNonEmptyString(anchor)) {
    errors.push(`${label}: アンカーは非空文字列にする（現在: ${JSON.stringify(anchor)}）`);
    return errors;
  }
  const hash = anchor.indexOf('#');
  if (hash === -1) {
    errors.push(`${label}: アンカー "${anchor}" に # がありません（<テストファイルパス>#<describe表題> の形式にする）`);
    return errors;
  }
  const filePart = anchor.slice(0, hash);
  const titlePart = anchor.slice(hash + 1);
  if (path.isAbsolute(filePart)) {
    errors.push(`${label}: アンカーのパス "${filePart}" が絶対パスです（リポジトリルートからの相対パスにする）`);
    return errors;
  }
  const abs = path.join(root, filePart);
  if (!fs.existsSync(abs)) {
    errors.push(`${label}: アンカーのファイル "${filePart}" が存在しません（リンク切れ）`);
    return errors;
  }
  const content = fs.readFileSync(abs, 'utf8');
  for (const segment of titlePart.split(' > ')) {
    if (!isNonEmptyString(segment)) {
      errors.push(`${label}: アンカー "${anchor}" の describe 表題が空です`);
    } else if (!content.includes(segment)) {
      errors.push(`${label}: describe 表題 "${segment}" が ${filePart} に見つかりません（リンク切れ。文言変更なら登記の更新を諮る）`);
    }
  }
  return errors;
}

// ---- validation -------------------------------------------------------

// dictionary: docs/dictionary.json の中身。knownIds: 台帳内の既存 id（parent 解決用）。
function validateEntry(entry, { dictionary, knownIds, root, isWrite }) {
  const errors = [];
  const warnings = [];
  const label = `エントリ ${entry.id ?? '(id未発番)'}`;

  if (!isNonEmptyString(entry.actor)) {
    errors.push(`${label}: actor が必要です`);
  } else {
    const found = dictionary.entries.filter(e => e.name === entry.actor);
    if (found.length === 0) {
      errors.push(`${label}: actor "${entry.actor}" が docs/dictionary.json にありません（先に語彙登録ルールで登録する）`);
    } else if (!found.some(e => e.domain === 'actor')) {
      errors.push(`${label}: "${entry.actor}" は辞書にありますが domain が actor ではありません（${found.map(e => e.domain).join(', ')}）`);
    }
  }

  if (!isNonEmptyString(entry.claim)) {
    errors.push(`${label}: claim が必要です`);
  } else if (isNonEmptyString(entry.actor) && entry.claim.startsWith(entry.actor)) {
    warnings.push(`${label}: claim が actor 名で始まっています（actor は別フィールドなので主語は含めない）`);
  }

  if (entry.parent !== undefined) {
    if (!isNonEmptyString(entry.parent)) {
      errors.push(`${label}: parent は行為の id の文字列にする（現在: ${JSON.stringify(entry.parent)}）`);
    } else if (!knownIds.has(entry.parent)) {
      errors.push(`${label}: parent "${entry.parent}" が台帳にありません（未解決）`);
    } else if (entry.parent === entry.id) {
      errors.push(`${label}: parent が自分自身を指しています`);
    }
  }

  if (entry.context !== undefined) {
    if (!isNonEmptyString(entry.context)) {
      errors.push(`${label}: context は辞書の context.dir の文字列にする（現在: ${JSON.stringify(entry.context)}）`);
    } else if (!dictionary.contexts.some(c => c.dir === entry.context)) {
      errors.push(`${label}: context "${entry.context}" が docs/dictionary.json の contexts にありません`);
    }
  }

  if (!entry.witness || typeof entry.witness !== 'object' || Array.isArray(entry.witness)) {
    errors.push(`${label}: witness（{ "acceptance": [...] }）が必要です`);
  } else {
    if (!Array.isArray(entry.witness.acceptance) || entry.witness.acceptance.length === 0) {
      errors.push(`${label}: witness.acceptance は1件以上のアンカーの配列にする（手動確認のみの行為は v1 では登記しない）`);
    } else {
      for (const anchor of entry.witness.acceptance) {
        errors.push(...validateAnchor(anchor, root, label));
      }
    }
    for (const f of Object.keys(entry.witness)) {
      if (!WITNESS_FIELDS.includes(f)) warnings.push(`${label}: witness の未知のフィールド "${f}"`);
    }
  }

  if (!entry.settled || typeof entry.settled !== 'object' || Array.isArray(entry.settled)) {
    errors.push(`${label}: settled（date / project を持つオブジェクト）が必要です`);
  } else {
    const s = entry.settled;
    if (!isNonEmptyString(s.date) || !/^\d{4}-\d{2}-\d{2}$/.test(s.date)) {
      errors.push(`${label}: settled.date は YYYY-MM-DD にする（現在: ${JSON.stringify(s.date)}）`);
    }
    if (!isNonEmptyString(s.project)) errors.push(`${label}: settled.project が必要です`);
    if (s.retro !== undefined && s.retro !== true) {
      errors.push(`${label}: settled.retro は true のみ（遡及でなければフィールドごと省く。現在: ${JSON.stringify(s.retro)}）`);
    }
    if (s.evidence !== undefined) {
      if (!EVIDENCE_VALUES.includes(s.evidence)) {
        errors.push(`${label}: settled.evidence は ${EVIDENCE_VALUES.join(' | ')} のいずれか（現在: ${JSON.stringify(s.evidence)}）`);
      } else if (s.evidence === 'in-use' && s.retro !== true) {
        errors.push(`${label}: settled.evidence: "in-use" は実使用遡及の印なので settled.retro: true と併記する`);
      }
    }
    const r = validateSnapshotEvidence(s, `${label}: settled`, { dictionary, root, isWrite });
    errors.push(...r.errors);
    warnings.push(...r.warnings);
    for (const f of Object.keys(s)) {
      if (!SETTLED_FIELDS.includes(f)) warnings.push(`${label}: settled の未知のフィールド "${f}"`);
    }
  }

  if (entry.resettled !== undefined) {
    if (!Array.isArray(entry.resettled)) {
      errors.push(`${label}: resettled は再清算スナップショットの配列にする（witness-add が書く。手で書かない）`);
    } else {
      entry.resettled.forEach((rs, i) => {
        const rl = `${label}: resettled[${i}]`;
        if (!rs || typeof rs !== 'object' || Array.isArray(rs)) {
          errors.push(`${rl}: date / project / acceptance を持つオブジェクトにする`);
          return;
        }
        if (!isNonEmptyString(rs.date) || !/^\d{4}-\d{2}-\d{2}$/.test(rs.date)) {
          errors.push(`${rl}: date は YYYY-MM-DD にする（現在: ${JSON.stringify(rs.date)}）`);
        }
        if (!isNonEmptyString(rs.project)) errors.push(`${rl}: project が必要です`);
        // resettled.acceptance は「そのとき足した witness」のスナップショット。生きた参照は witness.acceptance が担うので、check ではリンクを追わない。
        if (!Array.isArray(rs.acceptance) || rs.acceptance.length === 0 || rs.acceptance.some(a => !isNonEmptyString(a))) {
          errors.push(`${rl}: acceptance は1件以上のアンカー文字列の配列にする`);
        }
        const r = validateSnapshotEvidence(rs, rl, { dictionary, root, isWrite });
        errors.push(...r.errors);
        warnings.push(...r.warnings);
        for (const f of Object.keys(rs)) {
          if (!RESETTLED_FIELDS.includes(f)) warnings.push(`${rl}: 未知のフィールド "${f}"`);
        }
      });
    }
  }

  for (const f of Object.keys(entry)) {
    if (!ENTRY_FIELDS.includes(f)) warnings.push(`${label}: 未知のフィールド "${f}"`);
  }

  return { errors, warnings };
}

// settled / resettled に共通の証拠フィールド（devices / unitTests）の検証。
// どちらも不変のスナップショットなので check ではリンクを追わない。
// 書き込み時だけ、いま書こうとしている参照の実在を警告レベルで確かめる。
function validateSnapshotEvidence(s, label, { dictionary, root, isWrite }) {
  const errors = [];
  const warnings = [];
  if (s.devices !== undefined) {
    if (!Array.isArray(s.devices) || s.devices.some(d => !isNonEmptyString(d))) {
      errors.push(`${label}.devices は非空文字列（装置概念名）の配列にする`);
    } else if (isWrite) {
      for (const d of s.devices) {
        if (!dictionary.entries.some(e => e.name === d)) {
          warnings.push(`${label}.devices の "${d}" が辞書にありません（実在確認できたものだけ書く）`);
        }
      }
    }
  }
  if (s.unitTests !== undefined) {
    if (!Array.isArray(s.unitTests) || s.unitTests.some(t => !isNonEmptyString(t))) {
      errors.push(`${label}.unitTests はアンカー文字列の配列にする`);
    } else if (isWrite) {
      for (const t of s.unitTests) {
        const filePart = t.includes('#') ? t.slice(0, t.indexOf('#')) : t;
        if (!fs.existsSync(path.join(root, filePart))) {
          warnings.push(`${label}.unitTests の "${filePart}" が存在しません（実在確認できたものだけ書く）`);
        }
      }
    }
  }
  return { errors, warnings };
}

// ---- 防衛線（supersede 未設計のための停止） ---------------------------

function bigrams(text) {
  const t = text.replace(/\s+/g, '');
  const set = new Set();
  for (let i = 0; i < t.length - 1; i++) set.add(t.slice(i, i + 2));
  return set;
}

function similarity(a, b) {
  const A = bigrams(a);
  const B = bigrams(b);
  if (A.size === 0 || B.size === 0) return a.trim() === b.trim() ? 1 : 0;
  let common = 0;
  for (const g of A) if (B.has(g)) common++;
  return (2 * common) / (A.size + B.size);
}

// 同一 actor の既存エントリから、claim が同一・近接する候補を返す。
function findNearEntries(acts, entry) {
  const norm = s => s.replace(/\s+/g, '');
  return acts
    .filter(a => a.actor === entry.actor)
    .map(a => ({
      act: a,
      exact: norm(a.claim) === norm(entry.claim),
      score: similarity(a.claim, entry.claim),
    }))
    .filter(c => c.exact || c.score >= SIMILARITY_THRESHOLD);
}

// ---- reporting --------------------------------------------------------

function report(errors, warnings, context) {
  if (errors.length > 0) {
    console.error(`## エラー: ${errors.length}件${context ? `（${context}）` : ''}\n`);
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

// ---- subcommands ------------------------------------------------------

function cmdAdd(opts) {
  const root = findMetaRepo();
  const ledgerPath = opts.to || path.join(root, 'docs/acts.json');
  const entry = readInput(opts.file);

  if (Array.isArray(entry) || typeof entry !== 'object' || entry === null) {
    fail('add の入力はエントリ1件のオブジェクトにしてください（登記は一件ずつ、表＋承認を経て行う）');
  }
  if (entry.id !== undefined) {
    fail('id はスクリプトが発番します（入力に id を含めない。既存エントリへの witness 追加は witness-add を使う）');
  }

  const ledger = loadLedger(ledgerPath);
  const dictionary = loadDict(path.join(root, 'docs/dictionary.json'));

  // 防衛線: 同一 actor で claim が同一・近接する既存エントリがあれば書き込まずに止まる。
  // 上書きするかどうかの判断はしない（supersede は未設計）——候補を提示してユーザーに諮る。
  const near = (isNonEmptyString(entry.actor) && isNonEmptyString(entry.claim))
    ? findNearEntries(ledger.acts, entry)
    : [];
  const blocking = opts.allowSimilar ? near.filter(c => c.exact) : near;
  if (blocking.length > 0) {
    console.error(`## 防衛線: 同一 actor "${entry.actor}" に claim が同一・近接する既存エントリがあります（書き込みは行われませんでした）\n`);
    for (const c of blocking) {
      console.error(`- ${c.act.id}: ${c.act.claim}${c.exact ? '（同一）' : `（近接 ${c.score.toFixed(2)}）`}`);
    }
    console.error('\n上書き（supersede）は未設計です。別の行為として登記してよいかユーザーに諮ってください。');
    console.error('別の行為だと確認できた場合のみ --allow-similar で近接の停止を越えられます（同一 claim は越えられません）。');
    process.exit(1);
  }

  entry.id = nextId(ledger.acts);
  const knownIds = new Set(ledger.acts.map(a => a.id));
  const { errors, warnings } = validateEntry(entry, { dictionary, knownIds, root, isWrite: true });
  report(errors, warnings, '書き込みは行われませんでした');

  ledger.acts.push(orderFields(entry));
  saveLedger(ledgerPath, ledger);
  console.log(`${ledgerPath} に登記しました:`);
  console.log(`- ${entry.id}: ${entry.actor} — ${entry.claim}`);
}

// 保存はスキーマの正規のフィールド順に整える（未知フィールドは警告済みのうえ末尾に残す）
function orderFields(entry) {
  const ordered = {};
  for (const f of ENTRY_FIELDS) if (entry[f] !== undefined) ordered[f] = entry[f];
  for (const k of Object.keys(entry)) if (!(k in ordered)) ordered[k] = entry[k];
  return ordered;
}

// 既存の行為に witness を足す。行為の成立条件（手段・環境）が広がっただけで claim が変わらないとき、
// 行為を複製せずに新しい受け入れテストを目撃者として加える。settled（初回清算のスナップショット）は
// 触らず、追加分の清算は resettled に積む。
function cmdWitnessAdd(opts, actId) {
  const root = findMetaRepo();
  const ledgerPath = opts.to || path.join(root, 'docs/acts.json');
  if (!isNonEmptyString(actId)) fail('witness-add には対象の行為の id（act-NNNN）を指定してください');
  const input = readInput(opts.file);
  if (Array.isArray(input) || typeof input !== 'object' || input === null) {
    fail('witness-add の入力は { "acceptance": [...], "date": "...", "project": "..." } のオブジェクトにしてください');
  }

  const ledger = loadLedger(ledgerPath);
  const dictionary = loadDict(path.join(root, 'docs/dictionary.json'));
  const act = ledger.acts.find(a => a.id === actId);
  if (!act) fail(`${actId} が台帳（${ledgerPath}）にありません`);

  const errors = [];
  const warnings = [];
  const label = `エントリ ${actId}`;
  const existing = new Set(act.witness?.acceptance ?? []);

  if (!Array.isArray(input.acceptance) || input.acceptance.length === 0) {
    errors.push(`${label}: acceptance は1件以上のアンカーの配列にする`);
  } else {
    const seen = new Set();
    for (const anchor of input.acceptance) {
      errors.push(...validateAnchor(anchor, root, label));
      if (existing.has(anchor)) errors.push(`${label}: アンカー "${anchor}" は既に witness にあります`);
      if (seen.has(anchor)) errors.push(`${label}: アンカー "${anchor}" が入力内で重複しています`);
      seen.add(anchor);
    }
  }
  if (!isNonEmptyString(input.date) || !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    errors.push(`${label}: date は YYYY-MM-DD にする（現在: ${JSON.stringify(input.date)}）`);
  }
  if (!isNonEmptyString(input.project)) errors.push(`${label}: project が必要です`);
  const r = validateSnapshotEvidence(input, `${label}: resettled`, { dictionary, root, isWrite: true });
  errors.push(...r.errors);
  warnings.push(...r.warnings);
  for (const f of Object.keys(input)) {
    if (!RESETTLED_FIELDS.includes(f)) warnings.push(`${label}: 未知のフィールド "${f}"`);
  }
  report(errors, warnings, '書き込みは行われませんでした');

  const snapshot = {};
  for (const f of RESETTLED_FIELDS) if (input[f] !== undefined) snapshot[f] = input[f];
  act.witness = act.witness || {};
  act.witness.acceptance = [...(act.witness.acceptance ?? []), ...input.acceptance];
  act.resettled = [...(act.resettled ?? []), snapshot];
  ledger.acts = ledger.acts.map(a => (a.id === actId ? orderFields(act) : a));
  saveLedger(ledgerPath, ledger);
  console.log(`${ledgerPath} の ${actId} に witness を足しました:`);
  console.log(`- ${act.id}: ${act.actor} — ${act.claim}`);
  for (const anchor of input.acceptance) console.log(`  + ${anchor}`);
  console.log(`  resettled: ${input.date} / ${input.project}`);
}

function cmdCheck(opts, target) {
  const root = findMetaRepo();
  const ledgerPath = target || opts.to || path.join(root, 'docs/acts.json');
  if (!fs.existsSync(ledgerPath)) fail(`${ledgerPath} が見つかりません`);
  const ledger = loadLedger(ledgerPath);
  const dictionary = loadDict(path.join(root, 'docs/dictionary.json'));

  const errors = [];
  const warnings = [];
  if (ledger.version !== '1') {
    errors.push(`台帳: version は "1" にする（現在: ${JSON.stringify(ledger.version)}）`);
  }

  const knownIds = new Set(ledger.acts.map(a => a.id));
  const seen = new Set();
  for (const entry of ledger.acts) {
    const label = `エントリ ${entry.id ?? '(idなし)'}`;
    if (!isNonEmptyString(entry.id) || !/^act-\d{4}$/.test(entry.id)) {
      errors.push(`${label}: id は act-NNNN の形式にする（現在: ${JSON.stringify(entry.id)}）`);
    } else if (seen.has(entry.id)) {
      errors.push(`${label}: id が重複しています`);
    }
    seen.add(entry.id);
    const r = validateEntry(entry, { dictionary, knownIds, root, isWrite: false });
    errors.push(...r.errors);
    warnings.push(...r.warnings);
  }

  if (errors.length === 0 && warnings.length === 0) {
    console.log(`${ledgerPath}: 問題なし（登記 ${ledger.acts.length}件）`);
    return;
  }
  report(errors, warnings);
  console.log(`${ledgerPath}: エラーなし（警告のみ、登記 ${ledger.acts.length}件）`);
}

// ---- main -------------------------------------------------------------

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`Usage:
  acts-write.js add         [--to <acts.json>] [--file <entry.json>] [--allow-similar]
  acts-write.js witness-add <act-id> [--to <acts.json>] [--file <input.json>]
  acts-write.js check       [<acts.json>]

行為の登記簿（docs/acts.json）への書き込み専用スクリプト。検索は acts-search.js。
台帳は「使用で清算された挙動主張の登記簿」——載っていること自体が清算済みを意味し、
緑/赤は持たない（通っているかどうかは常にテスト実行から導出する）。
エントリのフォーマットは tdd-feedback/acts-format.json を参照。

add:
  一件を登記する。id（act-NNNN）はスクリプトが発番する（入力に含めない）。
  検証: actor が docs/dictionary.json に domain: actor で存在すること、
  witness.acceptance（1件以上）のアンカー（<テストファイルパス>#<describe表題>、
  入れ子は ' > ' 区切り）が実在のファイル・表題を指すこと、parent が台帳内で
  解決すること、context が辞書の contexts にあること、settled.date / project。
  入力: --file がなければ stdin から JSON を読む。末尾カンマは許容。

  防衛線: 同一 actor で claim が同一・近接する既存エントリを検出したら、
  書き込まずに候補を表示して終了する。行為の成立条件（手段・環境）が広がった
  だけで claim が同じなら witness-add を使う。claim の置き換え（supersede）は
  未設計——判断はユーザーに諮る。別の行為だと確認できた場合のみ --allow-similar
  で近接の停止を越えられる（同一 claim は越えられない）。

witness-add:
  既存の行為に witness（受け入れテスト）を足す。既存の行為が新しい手段・環境でも
  成立することを目撃したとき、行為を複製せずにこちらを使う。
  入力（stdin または --file）: { "acceptance": [<アンカー>...], "date": "YYYY-MM-DD",
  "project": "<プラン名>", "devices": [...], "unitTests": [...] }（devices / unitTests は任意）。
  検証: 行為が台帳にあること、アンカーが実在し既存の witness と重複しないこと、date / project。
  書き込み: witness.acceptance にアンカーを追加し、resettled 配列に清算スナップショット
  { date, project, acceptance, devices?, unitTests? } を積む。settled（初回清算）は変えない。

check:
  書き込まずに台帳全体を同じ規則で検証する。エラーがあれば exit 1。
  witness は生きた参照なのでリンク切れ（ファイル不在・describe 表題の不一致）を
  検出する。settled / resettled は清算時のスナップショット（不変）なのでリンクは追わない。

Examples:
  node acts-write.js add <<'EOF'
  { "actor": "執筆者", "claim": "記事を下書きとして保存できる", "context": "blog",
    "witness": { "acceptance": ["tests/acceptance/draft.spec.js#記事の下書き > 保存できる"] },
    "settled": { "date": "2026-08-01", "project": "draft-saving" } }
  EOF
  node acts-write.js witness-add act-0002 <<'EOF'
  { "acceptance": ["tests/acceptance/publish-by-api.spec.js#記事の公開（API 手段） > 公開できる"],
    "date": "2026-08-16", "project": "publish-by-api" }
  EOF
  node acts-write.js check`);
    process.exit(0);
  }

  const cmd = args[0];
  const opts = {};
  const positional = [];
  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--to') opts.to = args[++i];
    else if (arg === '--file') opts.file = args[++i];
    else if (arg === '--allow-similar') opts.allowSimilar = true;
    else if (arg.startsWith('--')) fail(`未知のオプション: ${arg}`);
    else positional.push(arg);
  }

  if (cmd === 'add') cmdAdd(opts);
  else if (cmd === 'witness-add') cmdWitnessAdd(opts, positional[0]);
  else if (cmd === 'check') cmdCheck(opts, positional[0]);
  else fail(`未知のサブコマンド: ${cmd}（add | witness-add | check）`);
}

main();
