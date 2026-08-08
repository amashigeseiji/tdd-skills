#!/usr/bin/env node
//
// Usage:
//   acts-search.js [options] <query> [<query2> ...]
//   acts-search.js [options] -f field=value
//   acts-search.js --all
//
// 行為の登記簿（docs/acts.json）を検索するスクリプト。書き込みは acts-write.js。
// 候補を絞るまでがスクリプトの仕事——絞られた一覧の類似判断は AI が行う。
// 詳細は --help を参照。

import fs from 'fs';
import path from 'path';

function findMetaRepo() {
  let d = process.cwd();
  while (d !== '/') {
    if (fs.existsSync(path.join(d, '.claude/tdd/config.json'))) return d;
    d = path.dirname(d);
  }
  return process.cwd();
}

function loadLedger(filePath) {
  if (!fs.existsSync(filePath)) return { version: '1', acts: [] };
  const ledger = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  ledger.acts = ledger.acts || [];
  return ledger;
}

function search(acts, query) {
  return acts.filter(a =>
    (a.claim || '').includes(query) ||
    (a.actor || '').includes(query) ||
    (a.id || '') === query
  );
}

function applyFilters(acts, filters) {
  if (filters.length === 0) return acts;
  return acts.filter(a =>
    filters.every(({ field, value }) => {
      if (field.startsWith('settled.')) {
        return String(a.settled?.[field.slice('settled.'.length)] ?? '') === value;
      }
      return String(a[field] ?? '') === value;
    })
  );
}

function formatAct(act, byId, summary = false) {
  const ctxPart = act.context ? ` [${act.context}]` : '';
  if (summary) {
    const parentPart = act.parent ? ` ↳ ${act.parent}` : '';
    return `- ${act.id}: ${act.claim}${ctxPart}${parentPart} (${act.settled?.date ?? '?'}, ${act.settled?.project ?? '?'})`;
  }
  const lines = [];
  lines.push(`### ${act.id}: ${act.claim}${ctxPart}`);
  if (act.parent) {
    const p = byId.get(act.parent);
    lines.push(`**parent:** ${act.parent}${p ? ` — ${p.claim}` : '（台帳に見つかりません）'}`);
  }
  for (const anchor of act.witness?.acceptance ?? []) {
    lines.push(`**witness:** ${anchor}`);
  }
  if (act.settled) {
    const s = act.settled;
    const flags = [s.retro ? 'retro' : null, s.evidence ? `evidence:${s.evidence}` : null].filter(Boolean);
    lines.push(`**settled:** ${s.date ?? '?'} / ${s.project ?? '?'}${flags.length > 0 ? ` (${flags.join(', ')})` : ''}`);
    if (s.devices && s.devices.length > 0) lines.push(`**devices:** ${s.devices.join(', ')}`);
    if (s.unitTests && s.unitTests.length > 0) lines.push(`**unitTests:** ${s.unitTests.join(', ')}`);
  }
  return lines.join('\n');
}

// actor 別の行為一覧が台帳の基本の見え方——結果は常に actor でグループして表示する。
function printGrouped(acts, byId, summary) {
  const byActor = new Map();
  for (const a of acts) {
    if (!byActor.has(a.actor)) byActor.set(a.actor, []);
    byActor.get(a.actor).push(a);
  }
  for (const [actor, list] of byActor) {
    console.log(`## ${actor} (${list.length}件)\n`);
    for (const a of list) {
      console.log(formatAct(a, byId, summary));
      if (!summary) console.log('');
    }
    if (summary) console.log('');
  }
}

function main() {
  const args = process.argv.slice(2);
  const queries = [];
  const filters = [];
  let summary = false;
  let dumpAll = false;
  let ledgerPath;

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`Usage:
  acts-search.js [options] <query> [<query2> ...]
  acts-search.js [options] -f field=value
  acts-search.js --all [-f field=value]

Options:
  -s, --summary        一覧表示（witness・settled を省いた1行形式）
  -f, --filter f=v     フィールドで絞り込み（複数 -f 可、AND 条件）
                       例: -f actor=執筆者  -f context=blog  -f settled.project=draft-saving
  -a, --all            クエリなしで全登記を一覧
      --ledger <path>  台帳ファイルを指定（既定: <リポジトリ>/docs/acts.json）
  -h, --help           このヘルプを表示

Arguments:
  <query>              検索語（複数指定可）。claim / actor を部分一致、id は完全一致

結果は常に actor 別にグループして表示する。類似判断はしない——
絞られた一覧に対する類似・重複の判断は AI とユーザーが行う。

台帳ファイルの探索:
  カレントディレクトリから上へ .claude/tdd/config.json を探し、
  見つかったディレクトリの docs/acts.json を使う。

Examples:
  acts-search.js 下書き                     # claim のキーワード検索
  acts-search.js -f actor=執筆者            # actor 別の行為一覧
  acts-search.js -s -f context=blog         # コンテキストで絞って一覧
  acts-search.js -a -s                      # 台帳全体を一覧（cat の代わり）
  acts-search.js act-0001                   # id で1件を引く`);
    process.exit(0);
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--summary' || arg === '-s') {
      summary = true;
    } else if (arg === '--filter' || arg === '-f') {
      const expr = args[++i];
      const eq = expr.indexOf('=');
      if (eq === -1) { console.error(`Invalid filter: ${expr}`); process.exit(1); }
      filters.push({ field: expr.slice(0, eq), value: expr.slice(eq + 1) });
    } else if (arg === '--all' || arg === '-a') {
      dumpAll = true;
    } else if (arg === '--ledger') {
      ledgerPath = args[++i];
    } else if (arg.startsWith('-')) {
      console.error(`未知のオプション: ${arg}`);
      process.exit(1);
    } else {
      queries.push(arg);
    }
  }

  if (queries.length === 0 && filters.length === 0 && !dumpAll) {
    console.error('Usage: acts-search.js [-s] [-f field=value] [-a] <query> [<query2> ...]');
    process.exit(1);
  }

  const ledger = loadLedger(ledgerPath || path.join(findMetaRepo(), 'docs/acts.json'));
  const byId = new Map(ledger.acts.map(a => [a.id, a]));

  let matches;
  if (dumpAll) {
    matches = applyFilters(ledger.acts, filters);
  } else if (queries.length > 0) {
    const seen = new Set();
    matches = [];
    for (const query of queries) {
      for (const a of applyFilters(search(ledger.acts, query), filters)) {
        if (!seen.has(a.id)) {
          seen.add(a.id);
          matches.push(a);
        }
      }
    }
  } else {
    matches = applyFilters(ledger.acts, filters);
  }

  if (matches.length === 0) {
    const queryLabel = queries.map(q => `「${q}」`).join(' ');
    const filterLabel = filters.map(f => `${f.field}=${f.value}`).join(', ');
    const label = [queryLabel, filterLabel].filter(Boolean).join(', ');
    console.log(`(${label || '全件'}に一致する登記なし)`);
    return;
  }

  const resultLabel = [
    queries.map(q => `"${q}"`).join(' '),
    filters.map(f => `${f.field}=${f.value}`).join(', '),
    dumpAll ? '全件' : '',
  ].filter(Boolean).join(', ');
  console.log(`## 検索結果: ${resultLabel} — ${matches.length}件\n`);
  printGrouped(matches, byId, summary);
}

main();
