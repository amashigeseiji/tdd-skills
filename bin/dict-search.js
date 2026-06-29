#!/usr/bin/env node
// Usage: dict-search.js <query> [<plans_dir>]
// Searches docs/dictionary.json and optionally plans/<project>/dictionary.json.
// Returns matching entries and their related entries (depth 1).

import fs from 'fs';
import path from 'path';

function findMetaRepo() {
  let d = process.cwd();
  while (d !== '/') {
    const configPath = path.join(d, '.claude/tdd/config.json');
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      return config.meta_repo || d;
    }
    d = path.dirname(d);
  }
  return process.cwd();
}

function loadDict(filePath) {
  if (!fs.existsSync(filePath)) return { contexts: [], entries: [] };
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

// Extract concept names from #語彙 notation in definition text.
// Matches #name followed by space or Japanese punctuation.
function extractInlineRefs(definition) {
  const matches = definition.match(/#([^\s。、）「」]+)/g) || [];
  return matches.map(m => m.slice(1));
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

function getRelatedNames(entry) {
  const fromDef = extractInlineRefs(entry.definition);
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

function expandRelations(seeds, allEntries, depth, seenKeys) {
  if (depth === 0) return [];
  const result = [];
  let frontier = seeds;
  for (let d = 0; d < depth; d++) {
    const next = [];
    for (const m of frontier) {
      for (const name of getRelatedNames(m)) {
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

function formatEntry(entry, summary = false) {
  const enPart = entry.en ? ` (${entry.en})` : '';
  if (summary) {
    const related = getRelatedNames(entry);
    const relPart = related.length > 0 ? ` → ${related.join(', ')}` : '';
    return `- ${entry.name}${enPart} [${entry.context}/${entry.domain}]${relPart}`;
  }
  const lines = [];
  lines.push(`### ${entry.name}${enPart} [${entry.context}/${entry.domain}]`);
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

function main() {
  const args = process.argv.slice(2);
  const queries = [];
  const filters = [];
  let plansDir;
  let summary = false;
  let depth = 0;
  let nameOnly = false;

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
    } else if (/^(\/|~|\.\.?\/|[A-Za-z]:\\)/.test(arg)) {
      plansDir = arg;
    } else {
      queries.push(arg);
    }
  }

  if (queries.length === 0 && filters.length === 0) {
    console.error('Usage: dict-search.js [-s] [-n] [-d <depth>] [-f field=value] <query> [<query2> ...] [<plans_dir>]');
    process.exit(1);
  }

  const metaRepo = findMetaRepo();
  const docDict = loadDict(path.join(metaRepo, 'docs/dictionary.json'));
  const planDict = plansDir
    ? loadDict(path.join(plansDir, 'dictionary.json'))
    : { contexts: [], entries: [] };

  const allEntries = mergeEntries(docDict.entries || [], planDict.entries || []);
  const allContexts = mergeContexts(docDict.contexts || [], planDict.contexts || []);

  // Collect deduplicated results across all queries.
  const seenContextDirs = new Set();
  const seenEntryKeys = new Set();
  const contextMatches = [];
  const matches = [];

  if (queries.length > 0) {
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

  const relatedEntries = expandRelations(matches, allEntries, depth, seenEntryKeys);

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
      console.log(formatEntry(e, !expand));
      if (expand) console.log('');
    }
    if (summary) console.log('');
  }
  if (relatedEntries.length > 0) {
    console.log(`### 関連エントリ (${relatedEntries.length}件)\n`);
    for (const e of relatedEntries) {
      console.log(formatEntry(e, summary));
      if (!summary) console.log('');
    }
  }
}

main();
