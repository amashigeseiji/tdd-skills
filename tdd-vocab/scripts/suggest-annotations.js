#!/usr/bin/env node
/**
 * suggest-annotations.js — @test アノテーション候補の提案
 *
 * 使い方: node suggest-annotations.js [test-dir]
 *   test-dir: テストのルートディレクトリ（デフォルト: tests）
 *             プロジェクトルート（cwd）からの相対パス
 *
 * @test アノテーションがない実装ファイルに対して、
 * そのファイルを参照しているテストファイルを候補として出力する。
 */

const fs = require('fs');
const path = require('path');
const { loadScanConfig, collectImplFiles, walkFiles, hasExt } = require('./scan-config.cjs');

const root = process.cwd();
const testDirArg = process.argv[2] || 'tests';
const testDir = path.resolve(root, testDirArg);
const testDirBasename = path.relative(root, testDir).split(path.sep)[0];

// 走査範囲は .claude/tdd/config.json の vocab_scan（scan-config.cjs 参照）
const scanConfig = loadScanConfig(root, { extraExclude: [testDirBasename] });

// ---- 収集 -------------------------------------------------------------------

// テスト側にも同じ exclude が効く（受け入れテストは単体テストツリーとは別物なので @test 候補にしない）
const testFiles = walkFiles(testDir, scanConfig.exclude, name => hasExt(name, scanConfig.extensions));
const implFiles = collectImplFiles(root, scanConfig);

// ---- 候補検索 ---------------------------------------------------------------

// テストファイルの内容をキャッシュ
const testContents = new Map();
for (const f of testFiles) {
  testContents.set(f, fs.readFileSync(f, 'utf-8'));
}

function findTestsForImpl(implFile) {
  const basename = path.basename(implFile, path.extname(implFile));
  const results = [];
  for (const [testFile, content] of testContents) {
    if (content.includes(basename)) {
      results.push(path.relative(root, testFile));
    }
  }
  return results;
}

// ---- レポート ---------------------------------------------------------------

const suggestions = [];

for (const implFile of implFiles) {
  const content = fs.readFileSync(implFile, 'utf-8');
  if (/ @test[:\s]/.test(content)) continue; // 既にアノテーションあり

  const candidates = findTestsForImpl(implFile);
  if (candidates.length > 0) {
    suggestions.push({ file: path.relative(root, implFile), tests: candidates });
  }
}

if (suggestions.length === 0) {
  console.log('✅ @test 候補なし（全ファイルに @test があるか、対応するテストが見つからない）');
  process.exit(0);
}

console.log(`📋 @test アノテーション候補 (${suggestions.length} ファイル)\n`);
for (const { file, tests } of suggestions) {
  console.log(`${file}:`);
  for (const t of tests) {
    console.log(`  // @test: ${t}`);
  }
  console.log();
}
