const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { run, copyFixture } = require('./helpers');

const WRITE = 'bin/dict-write.js';
const PLAN = 'plans/demo/dictionary.json';

function entry(overrides) {
  return JSON.stringify({
    name: '記事レンダラー',
    en: 'ArticleRenderer',
    context: 'blog',
    domain: 'solution',
    definition: '#記事 を HTML に変換する装置。',
    relations: [{ type: 'references', target: '記事', note: '' }],
    ...overrides,
  });
}

function add(repo, json) {
  fs.writeFileSync(path.join(repo, 'input.json'), json);
  return run(WRITE, ['add', '--to', PLAN, '--file', 'input.json'], repo);
}

// 検証を通らない src を直接埋め込む（旧仕様で書かれたエントリの再現）
function writeSrcDirectly(repo, src) {
  const file = path.join(repo, PLAN);
  const dict = JSON.parse(fs.readFileSync(file, 'utf-8'));
  dict.entries[0].src = src;
  fs.writeFileSync(file, JSON.stringify(dict));
}

function planEntries(repo) {
  const file = path.join(repo, PLAN);
  if (!fs.existsSync(file)) return [];
  return JSON.parse(fs.readFileSync(file, 'utf-8')).entries;
}

test('src なしのエントリはこれまでどおり書き込める', () => {
  const repo = copyFixture('vocab-basic');
  const { code, out } = add(repo, entry({}));
  assert.strictEqual(code, 0, out);
  assert.strictEqual(planEntries(repo).length, 1);
});

test('src が実在し @vocab もあれば警告なく書き込む', () => {
  const repo = copyFixture('vocab-basic');
  // 合成の正常系: スタブに注釈を書いてから src を登録する
  fs.writeFileSync(
    path.join(repo, 'src/renderer.js'),
    '// @vocab: 記事レンダラー\nfunction render(article) {\n  return article;\n}\n'
  );
  const { code, out } = add(repo, entry({ src: 'src/renderer.js' }));
  assert.strictEqual(code, 0, out);
  assert.ok(!out.includes('警告'), out);
});

test('複数パスをカンマで並べた src は書き込み全体を拒否する', () => {
  const repo = copyFixture('vocab-basic');
  const { code, out } = add(repo, entry({ src: 'src/loader.js, src/other.js' }));
  assert.strictEqual(code, 1);
  assert.ok(out.includes('カンマ'), out);
  assert.deepStrictEqual(planEntries(repo), []);
});

test('関数名を併記した src は書き込み全体を拒否する', () => {
  const repo = copyFixture('vocab-basic');
  const { code, out } = add(repo, entry({ src: 'src/loader.js loadArticle(path)' }));
  assert.strictEqual(code, 1);
  assert.deepStrictEqual(planEntries(repo), []);
});

test('注記を括弧で併記した src は書き込み全体を拒否する', () => {
  const repo = copyFixture('vocab-basic');
  const { code, out } = add(repo, entry({ src: 'src/loader.js（サンプル実装）' }));
  assert.strictEqual(code, 1);
  assert.deepStrictEqual(planEntries(repo), []);
});

test('実在しない src は書き込み全体を拒否する', () => {
  const repo = copyFixture('vocab-basic');
  const { code, out } = add(repo, entry({ src: 'src/renderer.js' }));
  assert.strictEqual(code, 1);
  assert.ok(out.includes('存在しません'), out);
  assert.deepStrictEqual(planEntries(repo), []);
});

test('絶対パスの src は書き込み全体を拒否する', () => {
  const repo = copyFixture('vocab-basic');
  const { code } = add(repo, entry({ src: path.join(repo, 'src/loader.js') }));
  assert.strictEqual(code, 1);
  assert.deepStrictEqual(planEntries(repo), []);
});

test('src の先に当該概念の @vocab が無ければ警告する（書き込みは行う）', () => {
  const repo = copyFixture('vocab-basic');
  const { code, out } = add(repo, entry({ src: 'src/filter.js' }));
  assert.strictEqual(code, 0, out);
  assert.ok(out.includes('@vocab: 記事レンダラー がありません'), out);
  assert.strictEqual(planEntries(repo).length, 1);
});

test('update での src 差し替えにも同じ検証がかかる', () => {
  const repo = copyFixture('vocab-basic');
  assert.strictEqual(add(repo, entry({})).code, 0);

  fs.writeFileSync(path.join(repo, 'patch.json'), JSON.stringify({ src: 'src/loader.js, src/other.js' }));
  const bad = run(WRITE, ['update', '--to', PLAN, '--name', '記事レンダラー', '--file', 'patch.json'], repo);
  assert.strictEqual(bad.code, 1, bad.out);
  assert.strictEqual(planEntries(repo)[0].src, undefined);

  fs.writeFileSync(path.join(repo, 'patch.json'), JSON.stringify({ src: 'src/loader.js' }));
  const good = run(WRITE, ['update', '--to', PLAN, '--name', '記事レンダラー', '--file', 'patch.json'], repo);
  assert.strictEqual(good.code, 0, good.out);
  assert.strictEqual(planEntries(repo)[0].src, 'src/loader.js');
});

test('check は src の記法違反をエラーにする', () => {
  const repo = copyFixture('vocab-basic');
  assert.strictEqual(add(repo, entry({})).code, 0);
  writeSrcDirectly(repo, 'src/loader.js loadArticle(path)');

  const { code, out } = run(WRITE, ['check', PLAN], repo);
  assert.strictEqual(code, 1, out);
  assert.ok(out.includes('関数名・注記・複数パスの併記は不可'), out);
});

test('check は src の実在と @vocab の裏付けを見ない（作業ツリーに依存させない）', () => {
  const repo = copyFixture('vocab-basic');
  assert.strictEqual(add(repo, entry({})).code, 0);
  writeSrcDirectly(repo, 'src/renderer.js');   // まだ生成されていないスタブ

  const { code, out } = run(WRITE, ['check', PLAN], repo);
  assert.strictEqual(code, 0, out);
  assert.ok(!out.includes('存在しません'), out);
  assert.ok(!out.includes('@vocab'), out);
});

test('src に触れない update は既存の src の不備で止まらない', () => {
  const repo = copyFixture('vocab-basic');
  assert.strictEqual(add(repo, entry({})).code, 0);
  writeSrcDirectly(repo, 'src/loader.js loadArticle(path)');

  fs.writeFileSync(path.join(repo, 'patch.json'), JSON.stringify({ definition: '#記事 を HTML に変換する。' }));
  const { code, out } = run(WRITE, ['update', '--to', PLAN, '--name', '記事レンダラー', '--file', 'patch.json'], repo);
  assert.strictEqual(code, 0, out);
});
