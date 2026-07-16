#!/usr/bin/env node
//
// Usage:
//   dict-search.js [options] <query> [<query2> ...] [<plans_dir>]
//   dict-search.js [options] -f field=value
//
// 語彙辞書（dictionary.json）をキーワード検索するスクリプト。
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

function loadDict(filePath) {
  if (!fs.existsSync(filePath)) return { contexts: [], entries: [] };
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
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

function namesSortedByLength(entries) {
  return [...new Set(entries.map(e => e.name))].sort((a, b) => b.length - a.length);
}

// Merge two entry arrays. planEntries override docEntries for same (context, name).
function mergeEntries(docEntries, planEntries) {
  const map = new Map();
  for (const e of docEntries) map.set(`${e.context}::${e.name}`, e);
  for (const e of planEntries) map.set(`${e.context}::${e.name}`, e);
  return Array.from(map.values());
}

function mergeContexts(docContexts, planContexts) {
  const map = new Map();
  for (const c of docContexts) map.set(c.dir, c);
  for (const c of planContexts) map.set(c.dir, c);
  return Array.from(map.values());
}

function searchContexts(contexts, query, nameOnly = false) {
  return contexts.filter(c =>
    c.name.includes(query) ||
    (!nameOnly && c.description && c.description.includes(query)) ||
    (!nameOnly && c.in_scope && c.in_scope.includes(query)) ||
    (!nameOnly && c.out_of_scope && c.out_of_scope.includes(query))
  );
}

function formatContext(ctx, summary = false) {
  if (summary) return `- ${ctx.name} [context: ${ctx.dir}]`;
  const lines = [];
  lines.push(`### ${ctx.name} [context: ${ctx.dir}]`);
  if (ctx.description) lines.push(`**概要:** ${ctx.description}`);
  if (ctx.primary_users) lines.push(`**主な利用者:** ${ctx.primary_users}`);
  if (ctx.in_scope) lines.push(`**スコープ内:** ${ctx.in_scope}`);
  if (ctx.out_of_scope) lines.push(`**スコープ外:** ${ctx.out_of_scope}`);
  return lines.join('\n');
}

function search(entries, query, nameOnly = false) {
  return entries.filter(e =>
    e.name.includes(query) ||
    (e.en && e.en.toLowerCase().includes(query.toLowerCase())) ||
    (!nameOnly && e.definition.includes(query))
  );
}

function getRelatedNames(entry, namesByLength) {
  const fromDef = extractInlineRefs(entry.definition, namesByLength).resolved;
  const fromRels = (entry.relations || []).map(r => r.target);
  return [...new Set([...fromDef, ...fromRels])];
}

function findByName(entries, name) {
  return entries.filter(e => e.name === name);
}

function key(e) { return `${e.context}::${e.name}`; }

function isExactMatch(name, queries) {
  return queries.some(q => q === name);
}

function expandRelations(seeds, allEntries, depth, seenKeys, namesByLength) {
  if (depth === 0) return [];
  const result = [];
  let frontier = seeds;
  for (let d = 0; d < depth; d++) {
    const next = [];
    for (const m of frontier) {
      for (const name of getRelatedNames(m, namesByLength)) {
        for (const e of findByName(allEntries, name)) {
          if (!seenKeys.has(key(e))) {
            seenKeys.add(key(e));
            result.push(e);
            next.push(e);
          }
        }
      }
    }
    frontier = next;
    if (frontier.length === 0) break;
  }
  return result;
}

function formatEntry(entry, summary = false, namesByLength = []) {
  const enPart = entry.en ? ` (${entry.en})` : '';
  const wipPart = entry.wip ? ` [wip:${entry.wip.status}]` : '';
  if (summary) {
    const related = getRelatedNames(entry, namesByLength);
    const relPart = related.length > 0 ? ` → ${related.join(', ')}` : '';
    return `- ${entry.name}${enPart} [${entry.context}/${entry.domain}]${wipPart}${relPart}`;
  }
  const lines = [];
  lines.push(`### ${entry.name}${enPart} [${entry.context}/${entry.domain}]${wipPart}`);
  lines.push(`**定義:** ${entry.definition}`);
  if (entry.relations && entry.relations.length > 0) {
    lines.push('**関係:**');
    for (const r of entry.relations) {
      const ctx = r.context ? ` [${r.context}]` : '';
      const note = r.note ? ` — ${r.note}` : '';
      lines.push(`- ${r.type}: ${r.target}${ctx}${note}`);
    }
  }
  if (entry.src) lines.push(`**src:** ${entry.src}`);
  return lines.join('\n');
}

function applyFilters(entries, filters) {
  if (filters.length === 0) return entries;
  return entries.filter(e =>
    filters.every(({ field, value }) => String(e[field] ?? '') === value)
  );
}

// An entry is flagged when it has nothing pointing out (empty relations / no
// inline #ref in its definition) and/or nothing pointing in (no other entry
// references it). Either condition alone is grounds for the human to confirm
// intent ("legitimate primitive concept" vs. "accidentally disconnected").
function findOrphans(allEntries) {
  const namesByLength = namesSortedByLength(allEntries);
  return allEntries
    .map(entry => {
      const reasons = [];
      if (getRelatedNames(entry, namesByLength).length === 0) reasons.push('関係フィールドが空');
      const hasIncoming = allEntries.some(e2 =>
        key(e2) !== key(entry) && getRelatedNames(e2, namesByLength).includes(entry.name)
      );
      if (!hasIncoming) reasons.push('どこからも参照されていない');
      return { entry, reasons };
    })
    .filter(r => r.reasons.length > 0);
}

function main() {
  const args = process.argv.slice(2);
  const queries = [];
  const filters = [];
  let plansDir;
  let summary = false;
  let depth = 0;
  let nameOnly = false;
  let dumpAll = false;
  let orphans = false;
  let stableOnly = false;

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`Usage:
  dict-search.js [options] <query> [<query2> ...] [<plans_dir>]
  dict-search.js [options] -f field=value
  dict-search.js --all [-f field=value] [<plans_dir>]
  dict-search.js --orphans [<plans_dir>]

Options:
  -s, --summary        一覧表示（定義・関係を省いた1行形式）
  -n, --name-only      name / en フィールドのみ検索（definition を除外）
  -d, --depth <n>      関連エントリを n 段まで展開（デフォルト 0）
                       例: -d1  -d 2  --depth 3
  -f, --filter f=v     フィールドで絞り込み（複数 -f 可、AND 条件）
                       例: -f context=core  -f domain=testing
  -a, --all            クエリなしで全コンテキスト・全エントリを一覧（-f と併用可）
  -o, --orphans        孤立概念チェック: 関係フィールドが空、または
                       どこからも参照されていないエントリを列挙
      --stable-only    安定層（docs/dictionary.json）のみを検索し、
                       <plans_dir> の同名エントリによる上書きを無視する
                       （redefine 時に docs 側の現行定義を確認する用途）
  -h, --help           このヘルプを表示

Arguments:
  <query>              検索語（複数指定可）。name / en / definition を部分一致
  <plans_dir>          / ~ ./ ../ で始まるパスをプロジェクト辞書ディレクトリと判定
                       <plans_dir>/dictionary.json を追加でロードし、同名エントリを上書き

辞書ファイルの探索:
  カレントディレクトリから上へ .claude/tdd/config.json を探し、
  見つかったディレクトリの docs/dictionary.json を使う。
  見つからなければカレントディレクトリの docs/dictionary.json を使う。

Examples:
  dict-search.js テスト
  dict-search.js -s テスト                  # 一覧形式
  dict-search.js -n テスト                  # name/en のみ検索
  dict-search.js -d1 テスト                 # 関連エントリを1段展開
  dict-search.js -f context=core            # フィルタのみ（全件）
  dict-search.js -f context=core テスト     # フィルタ + キーワード
  dict-search.js テスト ./plans/myproject   # プロジェクト辞書を追加
  dict-search.js -a -s ./plans/myproject    # 辞書全体を一覧（cat の代わり）
  dict-search.js -o ./plans/myproject       # 孤立概念チェック
  dict-search.js --stable-only -d1 概念名   # docs 側の現行定義を確認（redefine 前）`);
    process.exit(0);
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--summary' || arg === '-s') {
      summary = true;
    } else if (arg === '--name-only' || arg === '-n') {
      nameOnly = true;
    } else if (arg === '--depth' || arg === '-d') {
      depth = parseInt(args[++i], 10) || 0;
    } else if (/^-d(\d+)$/.test(arg)) {
      depth = parseInt(arg.slice(2), 10) || 0;
    } else if (arg === '--filter' || arg === '-f') {
      const expr = args[++i];
      const eq = expr.indexOf('=');
      if (eq === -1) { console.error(`Invalid filter: ${expr}`); process.exit(1); }
      filters.push({ field: expr.slice(0, eq), value: expr.slice(eq + 1) });
    } else if (arg === '--all' || arg === '-a') {
      dumpAll = true;
    } else if (arg === '--orphans' || arg === '-o') {
      orphans = true;
    } else if (arg === '--stable-only') {
      stableOnly = true;
    } else if (/^(\/|~|\.\.?\/|[A-Za-z]:\\)/.test(arg)) {
      plansDir = arg;
    } else {
      queries.push(arg);
    }
  }

  if (queries.length === 0 && filters.length === 0 && !dumpAll && !orphans) {
    console.error('Usage: dict-search.js [-s] [-n] [-d <depth>] [-f field=value] [-a] [-o] <query> [<query2> ...] [<plans_dir>]');
    process.exit(1);
  }

  const metaRepo = findMetaRepo();
  const docDict = loadDict(path.join(metaRepo, 'docs/dictionary.json'));
  const planDict = (plansDir && !stableOnly)
    ? loadDict(path.join(plansDir, 'dictionary.json'))
    : { contexts: [], entries: [] };

  const allEntries = mergeEntries(docDict.entries || [], planDict.entries || []);
  const allContexts = mergeContexts(docDict.contexts || [], planDict.contexts || []);
  const namesByLength = namesSortedByLength(allEntries);

  if (orphans) {
    const results = findOrphans(allEntries);
    if (results.length === 0) {
      console.log('(孤立概念なし)');
      return;
    }
    console.log(`## 孤立概念チェック: ${results.length}件\n`);
    for (const { entry, reasons } of results) {
      const enPart = entry.en ? ` (${entry.en})` : '';
      console.log(`- ${entry.name}${enPart} [${entry.context}/${entry.domain}] — ${reasons.join(', ')}`);
    }
    return;
  }

  // Collect deduplicated results across all queries.
  const seenContextDirs = new Set();
  const seenEntryKeys = new Set();
  const contextMatches = [];
  const matches = [];

  if (dumpAll) {
    for (const c of allContexts) {
      seenContextDirs.add(c.dir);
      contextMatches.push(c);
    }
    for (const e of applyFilters(allEntries, filters)) {
      seenEntryKeys.add(key(e));
      matches.push(e);
    }
  } else if (queries.length > 0) {
    for (const query of queries) {
      for (const c of searchContexts(allContexts, query, nameOnly)) {
        if (!seenContextDirs.has(c.dir)) {
          seenContextDirs.add(c.dir);
          contextMatches.push(c);
        }
      }
      for (const e of applyFilters(search(allEntries, query, nameOnly), filters)) {
        if (!seenEntryKeys.has(key(e))) {
          seenEntryKeys.add(key(e));
          matches.push(e);
        }
      }
    }
  } else {
    // --filter only: apply to all entries (no text search)
    for (const e of applyFilters(allEntries, filters)) {
      if (!seenEntryKeys.has(key(e))) {
        seenEntryKeys.add(key(e));
        matches.push(e);
      }
    }
  }

  if (contextMatches.length === 0 && matches.length === 0) {
    const queryLabel = queries.map(q => `「${q}」`).join(' ');
    const filterLabel = filters.map(f => `${f.field}=${f.value}`).join(', ');
    const label = [queryLabel, filterLabel].filter(Boolean).join(', ');
    console.log(`(${label}に一致するエントリなし)`);
    return;
  }

  const relatedEntries = expandRelations(matches, allEntries, depth, seenEntryKeys, namesByLength);

  const resultLabel = [
    queries.map(q => `"${q}"`).join(' '),
    filters.map(f => `${f.field}=${f.value}`).join(', '),
  ].filter(Boolean).join(', ');
  console.log(`## 検索結果: ${resultLabel}\n`);
  if (contextMatches.length > 0) {
    console.log(`### コンテキスト (${contextMatches.length}件)\n`);
    for (const c of contextMatches) {
      const expand = !summary || isExactMatch(c.name, queries);
      console.log(formatContext(c, !expand));
      if (expand) console.log('');
    }
    if (summary) console.log('');
  }
  if (matches.length > 0) {
    console.log(`### エントリ (${matches.length}件)\n`);
    for (const e of matches) {
      const expand = !summary || isExactMatch(e.name, queries);
      console.log(formatEntry(e, !expand, namesByLength));
      if (expand) console.log('');
    }
    if (summary) console.log('');
  }
  if (relatedEntries.length > 0) {
    console.log(`### 関連エントリ (${relatedEntries.length}件)\n`);
    for (const e of relatedEntries) {
      console.log(formatEntry(e, summary, namesByLength));
      if (!summary) console.log('');
    }
  }
}

main();
