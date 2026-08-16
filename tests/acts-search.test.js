const test = require('node:test');
const assert = require('node:assert');
const { run, fixture } = require('./helpers');

const SEARCH = 'bin/acts-search.js';
const REPO = fixture('acts-basic');

test('actor での絞り込みは actor 別の行為一覧を返す', () => {
  const { code, out } = run(SEARCH, ['-s', '-f', 'actor=執筆者'], REPO);
  assert.strictEqual(code, 0, out);
  assert.ok(out.includes('## 執筆者 (3件)'), out);
  assert.ok(out.includes('act-0001'), out);
  assert.ok(out.includes('act-0003'), out);
});

test('claim のキーワード検索が一致する登記を返す', () => {
  const { code, out } = run(SEARCH, ['下書き'], REPO);
  assert.strictEqual(code, 0, out);
  assert.ok(out.includes('act-0001'), out);
  assert.ok(!out.includes('act-0002'), out);
});

test('id は完全一致で1件を引く', () => {
  const { code, out } = run(SEARCH, ['act-0002'], REPO);
  assert.strictEqual(code, 0, out);
  assert.ok(out.includes('1件'), out);
  assert.ok(out.includes('記事を公開できる'), out);
});

test('settled.project での絞り込みができる', () => {
  const { code, out } = run(SEARCH, ['-s', '-f', 'settled.project=publishing'], REPO);
  assert.strictEqual(code, 0, out);
  assert.ok(out.includes('act-0002'), out);
  assert.ok(out.includes('act-0003'), out);
  assert.ok(!out.includes('act-0001'), out);
});

test('--all で全登記を一覧できる', () => {
  const { code, out } = run(SEARCH, ['-a', '-s'], REPO);
  assert.strictEqual(code, 0, out);
  assert.ok(out.includes('act-0001'), out);
  assert.ok(out.includes('act-0002'), out);
  assert.ok(out.includes('act-0003'), out);
});

test('詳細表示は witness と parent の claim を含む', () => {
  const { code, out } = run(SEARCH, ['act-0003'], REPO);
  assert.strictEqual(code, 0, out);
  assert.ok(out.includes('tests/acceptance/publish.spec.js#記事の公開 > 公開日時を予約できる'), out);
  assert.ok(out.includes('act-0002 — 記事を公開できる'), out);
});

test('詳細表示は resettled（witness-add の清算スナップショット）を含む', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const { copyFixture } = require('./helpers');
  const repo = copyFixture('acts-basic');
  const file = path.join(repo, 'docs/acts.json');
  const ledger = JSON.parse(fs.readFileSync(file, 'utf-8'));
  ledger.acts[1].witness.acceptance.push('tests/acceptance/draft.spec.js#記事の下書き > 保存できる');
  ledger.acts[1].resettled = [{ date: '2026-08-16', project: 'publish-by-api', acceptance: ['tests/acceptance/draft.spec.js#記事の下書き > 保存できる'] }];
  fs.writeFileSync(file, JSON.stringify(ledger));
  const { code, out } = run(SEARCH, ['act-0002'], repo);
  assert.strictEqual(code, 0, out);
  assert.ok(out.includes('**resettled:** 2026-08-16 / publish-by-api'), out);
});

test('一致しない検索はその旨を表示する', () => {
  const { code, out } = run(SEARCH, ['存在しない語'], REPO);
  assert.strictEqual(code, 0, out);
  assert.ok(out.includes('一致する登記なし'), out);
});
