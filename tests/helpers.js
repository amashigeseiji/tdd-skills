// テスト用の共通ヘルパー。
// スクリプトはトップレベルで実行して process.exit() するので、require せず子プロセスで走らせる。

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const FIXTURES = path.join(__dirname, 'fixtures');

/** スクリプトを cwd で実行し、終了コードと出力を返す（stdout と stderr は結合して読む） */
function run(script, args, cwd) {
  const r = spawnSync(process.execPath, [path.join(REPO, script), ...args], {
    cwd,
    encoding: 'utf-8',
  });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

/** フィクスチャをそのまま実行する（読み取りのみのスクリプト用。git 可視判定の経路を通る） */
function fixture(name) {
  return path.join(FIXTURES, name);
}

/** フィクスチャを一時ディレクトリに複製する（書き込みを伴うスクリプト用） */
function copyFixture(name) {
  const dest = fs.mkdtempSync(path.join(os.tmpdir(), `tdd-skills-${name}-`));
  fs.cpSync(fixture(name), dest, { recursive: true });
  return dest;
}

/** 出力から指定した種別の指摘だけを取り出す（"[src未注釈]" 等） */
function findings(out, label) {
  return out.split('\n').filter(line => line.includes(label)).map(line => line.trim());
}

module.exports = { run, fixture, copyFixture, findings, REPO };
