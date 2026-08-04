const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { run, copyFixture } = require('./helpers');

const GENERATE = 'tdd-vocab/scripts/generate-map.js';

function mapOf(repo) {
  return JSON.parse(fs.readFileSync(path.join(repo, 'docs/map.json'), 'utf-8'));
}

test('走査対象の JS の @vocab を正側マップに載せる', () => {
  const repo = copyFixture('vocab-basic');
  const { code, out } = run(GENERATE, [], repo);
  assert.strictEqual(code, 0, out);
  const words = mapOf(repo).blog.map(e => e.word);
  assert.ok(words.includes('記事ローダー'), words.join(', '));
  assert.ok(!words.includes('フィルター'), '注釈のない概念は載せない');
});

test('@test の参照先のテストケースを引く', () => {
  const repo = copyFixture('vocab-basic');
  run(GENERATE, [], repo);
  const loader = mapOf(repo).blog.find(e => e.word === '記事ローダー');
  assert.deepStrictEqual(Object.keys(loader.tests), ['tests/blog/loader.spec.js']);
  assert.deepStrictEqual(loader.implements, [['src/loader.js', 'loadArticle']]);
});

test('Swift 実装も正側マップに載る', () => {
  const repo = copyFixture('vocab-swift');
  const { code, out } = run(GENERATE, [], repo);
  assert.strictEqual(code, 0, out);
  const entries = mapOf(repo)['native-shell'];
  assert.deepStrictEqual(entries.map(e => e.word).sort(), ['アプリウィンドウ', 'エラー表示']);
  assert.deepStrictEqual(
    entries.find(e => e.word === 'アプリウィンドウ').implements,
    [['native/Sources/AppWindow.swift', 'AppWindow']]
  );
});
