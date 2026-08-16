const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { run, copyFixture } = require('./helpers');

const WRITE = 'bin/acts-write.js';
const LEDGER = 'docs/acts.json';

function entry(overrides) {
  return JSON.stringify({
    actor: '執筆者',
    claim: '記事に画像を添付できる',
    context: 'blog',
    witness: { acceptance: ['tests/acceptance/draft.spec.js#記事の下書き'] },
    settled: { date: '2026-08-05', project: 'image-attachment' },
    ...overrides,
  });
}

function add(repo, json, extraArgs = []) {
  fs.writeFileSync(path.join(repo, 'input.json'), json);
  return run(WRITE, ['add', '--file', 'input.json', ...extraArgs], repo);
}

function ledgerActs(repo) {
  return JSON.parse(fs.readFileSync(path.join(repo, LEDGER), 'utf-8')).acts;
}

// 検証を通らない台帳を直接作る（壊れた台帳の再現。書き込みはツール経由が原則なので
// テストでだけ行う）
function mutateLedger(repo, mutate) {
  const file = path.join(repo, LEDGER);
  const ledger = JSON.parse(fs.readFileSync(file, 'utf-8'));
  mutate(ledger);
  fs.writeFileSync(file, JSON.stringify(ledger));
}

// ---- add --------------------------------------------------------------

test('正しいエントリを登記し id を発番する', () => {
  const repo = copyFixture('acts-basic');
  const { code, out } = add(repo, entry({}));
  assert.strictEqual(code, 0, out);
  const acts = ledgerActs(repo);
  assert.strictEqual(acts.length, 4);
  assert.strictEqual(acts[3].id, 'act-0004');
  assert.strictEqual(acts[3].claim, '記事に画像を添付できる');
});

test('id を含む入力は拒否する（発番はスクリプトが行う）', () => {
  const repo = copyFixture('acts-basic');
  const { code, out } = add(repo, entry({ id: 'act-0009' }));
  assert.strictEqual(code, 1);
  assert.ok(out.includes('発番'), out);
  assert.strictEqual(ledgerActs(repo).length, 3);
});

test('辞書にない actor は登記できない', () => {
  const repo = copyFixture('acts-basic');
  const { code, out } = add(repo, entry({ actor: '編集長' }));
  assert.strictEqual(code, 1);
  assert.ok(out.includes('docs/dictionary.json にありません'), out);
  assert.strictEqual(ledgerActs(repo).length, 3);
});

test('辞書にあっても actor ドメインでない名前は登記できない', () => {
  const repo = copyFixture('acts-basic');
  const { code, out } = add(repo, entry({ actor: '記事レンダラー' }));
  assert.strictEqual(code, 1);
  assert.ok(out.includes('domain が actor ではありません'), out);
  assert.strictEqual(ledgerActs(repo).length, 3);
});

test('witness の指すファイルが存在しなければ登記できない', () => {
  const repo = copyFixture('acts-basic');
  const { code, out } = add(repo, entry({
    witness: { acceptance: ['tests/acceptance/missing.spec.js#記事の下書き'] },
  }));
  assert.strictEqual(code, 1);
  assert.ok(out.includes('存在しません'), out);
  assert.strictEqual(ledgerActs(repo).length, 3);
});

test('witness の describe 表題がファイルに無ければ登記できない', () => {
  const repo = copyFixture('acts-basic');
  const { code, out } = add(repo, entry({
    witness: { acceptance: ['tests/acceptance/draft.spec.js#記事の下書き > 存在しない表題'] },
  }));
  assert.strictEqual(code, 1);
  assert.ok(out.includes('リンク切れ'), out);
  assert.strictEqual(ledgerActs(repo).length, 3);
});

test('witness の無いエントリは登記できない（手動確認のみは v1 対象外）', () => {
  const repo = copyFixture('acts-basic');
  const parsed = JSON.parse(entry({}));
  delete parsed.witness;
  const { code, out } = add(repo, JSON.stringify(parsed));
  assert.strictEqual(code, 1);
  assert.ok(out.includes('witness'), out);
  assert.strictEqual(ledgerActs(repo).length, 3);
});

test('台帳で解決しない parent は登記できない', () => {
  const repo = copyFixture('acts-basic');
  const { code, out } = add(repo, entry({ parent: 'act-9999' }));
  assert.strictEqual(code, 1);
  assert.ok(out.includes('未解決'), out);
  assert.strictEqual(ledgerActs(repo).length, 3);
});

test('evidence: in-use は retro: true と併記しないと登記できない', () => {
  const repo = copyFixture('acts-basic');
  const bad = add(repo, entry({
    settled: { date: '2026-08-05', project: 'image-attachment', evidence: 'in-use' },
  }));
  assert.strictEqual(bad.code, 1, bad.out);
  assert.strictEqual(ledgerActs(repo).length, 3);

  const good = add(repo, entry({
    settled: { date: '2026-08-05', project: 'image-attachment', evidence: 'in-use', retro: true },
  }));
  assert.strictEqual(good.code, 0, good.out);
  assert.strictEqual(ledgerActs(repo).length, 4);
});

// ---- add の防衛線 -----------------------------------------------------

test('防衛線: 同一 actor の同一 claim は書き込まずに候補を提示して止まる', () => {
  const repo = copyFixture('acts-basic');
  const { code, out } = add(repo, entry({ claim: '記事を下書きとして保存できる' }));
  assert.strictEqual(code, 1);
  assert.ok(out.includes('防衛線'), out);
  assert.ok(out.includes('act-0001'), out);
  assert.strictEqual(ledgerActs(repo).length, 3);
});

test('防衛線: 同一 claim は --allow-similar でも越えられない', () => {
  const repo = copyFixture('acts-basic');
  const { code, out } = add(repo, entry({ claim: '記事を下書きとして保存できる' }), ['--allow-similar']);
  assert.strictEqual(code, 1, out);
  assert.strictEqual(ledgerActs(repo).length, 3);
});

test('防衛線: 近接 claim は止まり、--allow-similar でのみ越えられる', () => {
  const repo = copyFixture('acts-basic');
  const near = entry({ claim: '記事を下書き保存できる' });

  const blocked = add(repo, near);
  assert.strictEqual(blocked.code, 1);
  assert.ok(blocked.out.includes('近接'), blocked.out);
  assert.strictEqual(ledgerActs(repo).length, 3);

  const allowed = add(repo, near, ['--allow-similar']);
  assert.strictEqual(allowed.code, 0, allowed.out);
  assert.strictEqual(ledgerActs(repo).length, 4);
});

test('防衛線は同一 actor に限る（別 actor の同一 claim は登記できる）', () => {
  const repo = copyFixture('acts-basic');
  const { code, out } = add(repo, entry({
    actor: '管理者',
    claim: '記事を公開できる',
    witness: { acceptance: ['tests/acceptance/publish.spec.js#記事の公開 > 公開できる'] },
  }));
  assert.strictEqual(code, 0, out);
  assert.strictEqual(ledgerActs(repo).length, 4);
});

// ---- witness-add ------------------------------------------------------

function witnessInput(overrides) {
  return JSON.stringify({
    acceptance: ['tests/acceptance/draft.spec.js#記事の下書き > 保存できる'],
    date: '2026-08-16',
    project: 'publish-by-api',
    ...overrides,
  });
}

function witnessAdd(repo, actId, json, extraArgs = []) {
  fs.writeFileSync(path.join(repo, 'input.json'), json);
  return run(WRITE, ['witness-add', actId, '--file', 'input.json', ...extraArgs], repo);
}

test('witness-add は既存の行為に witness を足し、resettled に清算スナップショットを積む', () => {
  const repo = copyFixture('acts-basic');
  const { code, out } = witnessAdd(repo, 'act-0002', witnessInput({}));
  assert.strictEqual(code, 0, out);
  const acts = ledgerActs(repo);
  assert.strictEqual(acts.length, 3);
  const act = acts.find(a => a.id === 'act-0002');
  assert.deepStrictEqual(act.witness.acceptance, [
    'tests/acceptance/publish.spec.js#記事の公開 > 公開できる',
    'tests/acceptance/draft.spec.js#記事の下書き > 保存できる',
  ]);
  // settled（初回清算）は変わらない
  assert.deepStrictEqual(act.settled, { date: '2026-08-02', project: 'publishing' });
  assert.deepStrictEqual(act.resettled, [{
    date: '2026-08-16',
    project: 'publish-by-api',
    acceptance: ['tests/acceptance/draft.spec.js#記事の下書き > 保存できる'],
  }]);
  // 足した後の台帳は check を通る
  const check = run(WRITE, ['check'], repo);
  assert.strictEqual(check.code, 0, check.out);
});

test('witness-add は台帳にない行為には足せない', () => {
  const repo = copyFixture('acts-basic');
  const { code, out } = witnessAdd(repo, 'act-0099', witnessInput({}));
  assert.strictEqual(code, 1);
  assert.ok(out.includes('act-0099'), out);
});

test('witness-add は実在しないアンカーを足せない', () => {
  const repo = copyFixture('acts-basic');
  const { code, out } = witnessAdd(repo, 'act-0002', witnessInput({
    acceptance: ['tests/acceptance/publish.spec.js#記事の公開 > API で公開できる'],
  }));
  assert.strictEqual(code, 1);
  assert.ok(out.includes('リンク切れ'), out);
  assert.strictEqual(ledgerActs(repo).find(a => a.id === 'act-0002').witness.acceptance.length, 1);
});

test('witness-add は既にある witness を重複して足せない', () => {
  const repo = copyFixture('acts-basic');
  const { code, out } = witnessAdd(repo, 'act-0002', witnessInput({
    acceptance: ['tests/acceptance/publish.spec.js#記事の公開 > 公開できる'],
  }));
  assert.strictEqual(code, 1);
  assert.ok(out.includes('既に witness にあります'), out);
});

test('witness-add は date / project が無いと書かない', () => {
  const repo = copyFixture('acts-basic');
  const { code, out } = witnessAdd(repo, 'act-0002', witnessInput({ date: undefined, project: undefined }));
  assert.strictEqual(code, 1);
  assert.ok(out.includes('date'), out);
  assert.ok(out.includes('project'), out);
  assert.strictEqual(ledgerActs(repo).find(a => a.id === 'act-0002').resettled, undefined);
});

test('check は resettled の壊れたスナップショットを検出する', () => {
  const repo = copyFixture('acts-basic');
  mutateLedger(repo, l => { l.acts[1].resettled = [{ date: '2026/08/16', project: 'x', acceptance: [] }]; });
  const { code, out } = run(WRITE, ['check'], repo);
  assert.strictEqual(code, 1);
  assert.ok(out.includes('resettled[0]'), out);
});

// ---- check ------------------------------------------------------------

test('check は正しい台帳で緑になる', () => {
  const repo = copyFixture('acts-basic');
  const { code, out } = run(WRITE, ['check'], repo);
  assert.strictEqual(code, 0, out);
  assert.ok(out.includes('問題なし'), out);
});

test('check は id の重複を検出する', () => {
  const repo = copyFixture('acts-basic');
  mutateLedger(repo, ledger => { ledger.acts[1].id = 'act-0001'; });
  const { code, out } = run(WRITE, ['check'], repo);
  assert.strictEqual(code, 1, out);
  assert.ok(out.includes('重複'), out);
});

test('check は describe 表題の文言変更を witness のリンク切れとして検出する', () => {
  const repo = copyFixture('acts-basic');
  const spec = path.join(repo, 'tests/acceptance/draft.spec.js');
  fs.writeFileSync(spec, fs.readFileSync(spec, 'utf-8').replace("describe('保存できる'", "describe('保存する'"));
  const { code, out } = run(WRITE, ['check'], repo);
  assert.strictEqual(code, 1, out);
  assert.ok(out.includes('リンク切れ'), out);
});

test('check は辞書にない actor を検出する', () => {
  const repo = copyFixture('acts-basic');
  mutateLedger(repo, ledger => { ledger.acts[0].actor = '編集長'; });
  const { code, out } = run(WRITE, ['check'], repo);
  assert.strictEqual(code, 1, out);
  assert.ok(out.includes('docs/dictionary.json にありません'), out);
});

test('check は解決しない parent を検出する', () => {
  const repo = copyFixture('acts-basic');
  mutateLedger(repo, ledger => { ledger.acts[2].parent = 'act-9999'; });
  const { code, out } = run(WRITE, ['check'], repo);
  assert.strictEqual(code, 1, out);
  assert.ok(out.includes('未解決'), out);
});
