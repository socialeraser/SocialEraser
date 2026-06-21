#!/usr/bin/env node
/**
 * verify-syntax.js — 全 platform 源 JS 文件 node --check 语法体检
 *
 * 防"verify 12/12 过但线上 SyntaxError"：之前 content.js 第 26 行
 *   `if (window.__X EraserContentInjected) {`
 * 因 sed 替换把 SocialEraser 改成 "X Eraser"（带空格）导致 JS 标识符非法，
 * 但 verify-tweets-bug-3.js / verify-setconfig.js / verify-actual-x-selectors.js
 * 等所有 verify 脚本都不跑 node --check，所以 12/12 全过但加载即 throw。
 *
 * 此脚本：
 *   1. 遍历 platforms/<platform>/src  +  platforms/<platform>/scripts
 *   2. 遍历 platforms/<platform>/chrome-source  +  platforms/<platform>/edge-source
 *   3. 全部 .js 跑 `node -c` 解析（不执行），失败立即 exit 1
 *   4. 跳过 build output (www / ios / extensions/<...>)
 *
 * 集成到 run-verify.js 调用链。
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SCAN_DIRS = [
  'platforms',
];

// 跳过 build output
const SKIP_SUBSTR = [
  '/www/',
  '/ios/',
  '/android/',
  '/node_modules/',
  '/build/',
  '/dist/',
  '/test/',
  '/tests/',
  '/__tests__/',
];

// 只走 platforms/*/{src,scripts,chrome-source,edge-source}
const ALLOW_SUBSTR = [
  '/src/',
  '/scripts/',
  '/chrome-source/',
  '/edge-source/',
];

function walk(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    return out;  // dir 不存在 → 静默跳过
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      walk(p, out);
    } else if (e.isFile() && e.name.endsWith('.js')) {
      out.push(p);
    }
  }
  return out;
}

let totalFiles = 0;
let passed = 0;
let failed = 0;
const failures = [];

for (const scanDir of SCAN_DIRS) {
  const absDir = path.join(ROOT, scanDir);
  if (!fs.existsSync(absDir)) continue;

  for (const file of walk(absDir)) {
    const rel = path.relative(ROOT, file);

    // 跳过 build output
    if (SKIP_SUBSTR.some(s => rel.includes(s))) continue;

    // 只扫描 ALLOW 列表里的子路径
    if (!ALLOW_SUBSTR.some(s => rel.includes(s))) continue;

    totalFiles++;
    try {
      execSync(`node -c "${file}"`, { stdio: 'pipe' });
      passed++;
    } catch (e) {
      failed++;
      failures.push(rel);
    }
  }
}

console.log('');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`verify-syntax: ${passed}/${totalFiles} files passed node --check`);
if (failed > 0) {
  console.log(`✗ ${failed} syntax error(s):`);
  for (const f of failures) {
    console.log(`    ${f}`);
  }
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  process.exit(1);
}
console.log('✓ All platform JS files parse correctly');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('');
process.exit(0);
