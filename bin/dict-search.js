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

function searchContexts(contexts, query) {
  return contexts.filter(c =>
    c.name.includes(query) ||
    (c.description && c.description.includes(query)) ||
    (c.in_scope && c.in_scope.includes(query)) ||
    (c.out_of_scope && c.out_of_scope.includes(query))
  );
}

function formatContext(ctx) {
  const lines = [];
  lines.push(`### ${ctx.name} [context: ${ctx.dir}]`);
  if (ctx.description) lines.push(`**概要:** ${ctx.description}`);
  if (ctx.primary_users) lines.push(`**主な利用者:** ${ctx.primary_users}`);
  if (ctx.in_scope) lines.push(`**スコープ内:** ${ctx.in_scope}`);
  if (ctx.out_of_scope) lines.push(`**スコープ外:** ${ctx.out_of_scope}`);
  return lines.join('\n');
}

function search(entries, query) {
  return entries.filter(e =>
    e.name.includes(query) ||
    (e.en && e.en.toLowerCase().includes(query.toLowerCase())) ||
    e.definition.includes(query)
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

function formatEntry(entry) {
  const lines = [];
  const enPart = entry.en ? ` (${entry.en})` : '';
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

function main() {
  const query = process.argv[2];
  const plansDir = process.argv[3];

  if (!query) {
    console.error('Usage: dict-search.js <query> [<plans_dir>]');
    process.exit(1);
  }

  const metaRepo = findMetaRepo();
  const docDict = loadDict(path.join(metaRepo, 'docs/dictionary.json'));
  const planDict = plansDir
    ? loadDict(path.join(plansDir, 'dictionary.json'))
    : { contexts: [], entries: [] };

  const allEntries = mergeEntries(docDict.entries || [], planDict.entries || []);
  const allContexts = mergeContexts(docDict.contexts || [], planDict.contexts || []);

  const contextMatches = searchContexts(allContexts, query);
  const matches = search(allEntries, query);

  if (contextMatches.length === 0 && matches.length === 0) {
    console.log(`(「${query}」に一致するエントリなし)`);
    return;
  }

  const matchKeys = new Set(matches.map(key));
  const relatedEntries = [];
  for (const m of matches) {
    for (const name of getRelatedNames(m)) {
      for (const e of findByName(allEntries, name)) {
        if (!matchKeys.has(key(e))) {
          relatedEntries.push(e);
          matchKeys.add(key(e));
        }
      }
    }
  }

  console.log(`## 検索結果: "${query}"\n`);
  if (contextMatches.length > 0) {
    console.log(`### コンテキスト (${contextMatches.length}件)\n`);
    for (const c of contextMatches) {
      console.log(formatContext(c));
      console.log('');
    }
  }
  if (matches.length > 0) {
    console.log(`### エントリ (${matches.length}件)\n`);
  }
  for (const e of matches) {
    console.log(formatEntry(e));
    console.log('');
  }
  if (relatedEntries.length > 0) {
    console.log(`### 関連エントリ (${relatedEntries.length}件)\n`);
    for (const e of relatedEntries) {
      console.log(formatEntry(e));
      console.log('');
    }
  }
}

main();
