const test = require('node:test');
const assert = require('node:assert');
const { run, fixture, findings } = require('./helpers');

const CHECK = 'tdd-vocab/scripts/check-vocab.js';

test('注釈と辞書が対応していれば指摘しない（記事ローダー）', () => {
  const { out } = run(CHECK, [], fixture('vocab-basic'));
  assert.ok(!out.includes('記事ローダー'), out);
});

test('実装装置を持たないドメイン（application）は逆引きの対象にしない', () => {
  const { out } = run(CHECK, [], fixture('vocab-basic'));
  assert.deepStrictEqual(findings(out, '[未実装]').filter(l => l.includes('"記事"')), []);
});

test('@vocab 行に注記を続けると、記法の診断を添えて報告する', () => {
  const { code, out } = run(CHECK, [], fixture('vocab-basic'));
  assert.strictEqual(code, 1);
  const broken = findings(out, '[リンク切れ]');
  assert.strictEqual(broken.length, 1);
  assert.ok(broken[0].includes('src/status.js'), out);
  assert.ok(out.includes('@vocab 行は概念名のみを取る'), out);
  assert.ok(out.includes('"公開ステータス" は辞書に存在する'), out);
});

test('照合に成功している行には記法の診断を出さない', () => {
  const { out } = run(CHECK, [], fixture('vocab-swift'));
  assert.ok(!out.includes('@vocab 行は概念名のみを取る'), out);
});

test('src の指す概念の @vocab が実装側に1つも無ければ [src未注釈]', () => {
  const { out } = run(CHECK, [], fixture('vocab-basic'));
  const unannotated = findings(out, '[src未注釈]');
  assert.strictEqual(unannotated.length, 1);
  assert.ok(unannotated[0].includes('"フィルター"'), out);
  assert.ok(unannotated[0].includes('src/filter.js'), out);
});

test('@vocab が別のファイルにあるなら [src未注釈] ではなく [src不一致]', () => {
  const { out } = run(CHECK, [], fixture('vocab-basic'));
  const mismatched = findings(out, '[src不一致]');
  assert.strictEqual(mismatched.length, 1);
  assert.ok(mismatched[0].includes('"変換ドライバー"'), out);
  assert.ok(mismatched[0].includes('src/other.js'), out);
  assert.deepStrictEqual(findings(out, '[src未注釈]').filter(l => l.includes('変換ドライバー')), []);
});

test('src が実在しなければ [src不在]（[src未注釈] に吸収しない）', () => {
  const { out } = run(CHECK, [], fixture('vocab-basic'));
  assert.deepStrictEqual(findings(out, '[src不在]'), []);
});

test('Swift の /// @vocab を走査対象として拾う', () => {
  const { code, out } = run(CHECK, [], fixture('vocab-swift'));
  assert.strictEqual(code, 0);
  assert.deepStrictEqual(findings(out, '[未実装]'), []);
  assert.deepStrictEqual(findings(out, '[src未注釈]'), []);
  assert.deepStrictEqual(findings(out, '[走査対象外]'), []);
});
