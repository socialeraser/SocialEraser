#!/usr/bin/env node
// verify-extensions-sync.js
// 防回归：platforms/<name>-project/scripts/*.js 修改后忘了同步到 extensions/<browser>-<prefix>/
//
// 根因（2026-07-03 教训）：
//   修 P0 死参数 bug 时只改了 platforms/tiktok-project/scripts/tiktok-automation.js，
//   忘了 extensions/chrome-tiktok/ 和 extensions/edge-tiktok/ 这两份副本。
//   实际扩展加载的是 extensions/ 下的副本，源文件是 source of truth 但扩展直接 cp 副本。
//   → 跑测试报 ReferenceError: browseLikeSelectors is not defined，
//     调试时浪费半小时才发现是扩展副本没更新。
//
// 锁定：platforms/<name>-project/scripts/<file>.js 必须字节级一致于
//      extensions/{chrome,edge}-<prefix>/<file>.js
//      （由 scripts/sync-shared.js 负责同步；本脚本只守门，触发后跑 sync-shared.js 即可修复）

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PLATFORMS_DIR = path.join(ROOT, 'platforms');
const EXTENSIONS_DIR = path.join(ROOT, 'extensions');

let passed = 0;
let failed = 0;

function check(name, cond, extra) {
  if (cond) {
    console.log('  PASS  ' + name);
    passed++;
  } else {
    console.log('  FAIL  ' + name + (extra ? ' — ' + extra : ''));
    failed++;
  }
}

function md5Short(buf) {
  // 不依赖 crypto，简单 hash 够区分用
  let h = 0;
  for (let i = 0; i < buf.length; i++) {
    h = ((h << 5) - h + buf.charCodeAt(i)) | 0;
  }
  return ('00000000' + (h >>> 0).toString(16)).slice(-8);
}

console.log('=== verify-extensions-sync.js ===');
console.log('防 platforms/scripts → extensions/* 不同步回归（2026-07-03 教训）\n');

// 1. 扫描所有 platforms/<name>-project/scripts/*.js
if (!fs.existsSync(PLATFORMS_DIR)) {
  console.log('  SKIP  无 platforms/ 目录');
  process.exit(0);
}

const platforms = fs.readdirSync(PLATFORMS_DIR)
  .filter(n => fs.statSync(path.join(PLATFORMS_DIR, n)).isDirectory());

let totalChecked = 0;
const mismatches = [];

for (const platformName of platforms) {
  const scriptsDir = path.join(PLATFORMS_DIR, platformName, 'scripts');
  if (!fs.existsSync(scriptsDir)) continue;
  const prefix = platformName.replace(/-project$/, '');

  const files = fs.readdirSync(scriptsDir).filter(f => f.endsWith('.js'));
  if (files.length === 0) continue;

  for (const file of files) {
    const srcPath = path.join(scriptsDir, file);
    const srcBuf = fs.readFileSync(srcPath);
    const srcHash = md5Short(srcBuf.toString('utf8'));

    // 对应 extensions/{chrome,edge}-<prefix>/<file>
    const targets = [
      path.join(EXTENSIONS_DIR, `chrome-${prefix}`, file),
      path.join(EXTENSIONS_DIR, `edge-${prefix}`, file),
    ];

    for (const tgtPath of targets) {
      if (!fs.existsSync(tgtPath)) {
        check(platformName + '/scripts/' + file + ' → ' + path.relative(ROOT, tgtPath) + ' 存在',
          false, '扩展副本不存在（先跑 node scripts/sync-shared.js）');
        totalChecked++;
        continue;
      }
      const tgtBuf = fs.readFileSync(tgtPath);
      const tgtHash = md5Short(tgtBuf.toString('utf8'));
      const ok = srcHash === tgtHash;
      check(
        platformName + '/scripts/' + file + ' ↔ ' + path.relative(ROOT, tgtPath) + ' 字节一致',
        ok,
        ok ? null : 'src hash ' + srcHash + ' ≠ tgt hash ' + tgtHash
      );
      if (!ok) {
        mismatches.push({ src: srcPath, tgt: tgtPath, platform: platformName, file: file });
      }
      totalChecked++;
    }
  }
}

console.log('\n=== summary ===');
console.log('  passed: ' + passed);
console.log('  failed: ' + failed);
console.log('  checked: ' + totalChecked + ' file pairs across ' + platforms.length + ' platform(s)');

if (failed > 0) {
  console.log('\nFAIL: ' + failed + ' file(s) out of sync');
  console.log('提示: 改完 platforms/<name>-project/scripts/ 下的文件后必须同步到 extensions/。');
  console.log('  跑 node scripts/sync-shared.js 自动同步。');
  if (mismatches.length > 0) {
    console.log('\n  失配详情:');
    for (const m of mismatches) {
      console.log('    ' + path.relative(ROOT, m.src) + '  vs  ' + path.relative(ROOT, m.tgt));
    }
  }
  process.exit(1);
}
console.log('OK: 所有 platforms/scripts 与 extensions/* 副本字节级一致');
process.exit(0);
