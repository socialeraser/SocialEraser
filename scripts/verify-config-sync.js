#!/usr/bin/env node
// verify-config-sync.js
// 防回归：default.json 和 x-remote-example.json 内容不同步
//
// 根因（2026-06-19 教训）：
//   之前修 tweets-bug-7（bookmark 改用 cellInnerDiv + unbookmark）只改了 default.json，
//   忘了改 x-remote-example.json。断网时用 default（修了，能用），
//   联网时用 remote（没修，X 2026 改版后失效）—— 同一份修复分两份，行为不一致。
//   i18n 块（deleteKeywords / unretweetKeywords / ...）也有同样问题：
//   remote 加了，default 缺 → 断网时用 default 跑 confirm 按钮只能靠 testid 兜底。
//
// 锁定：default.json 和 x-remote-example.json 的 selectors 内容必须字节级一致

'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_CFG_PATH = path.join(__dirname, '..', 'platforms', 'x-project', 'src', 'config', 'default.json');
const REMOTE_CFG_PATH = path.join(__dirname, '..', 'platforms', 'x-project', 'src', 'config', 'x-remote-example.json');

const defaultCfg = JSON.parse(fs.readFileSync(DEFAULT_CFG_PATH, 'utf8'));
const remoteCfg = JSON.parse(fs.readFileSync(REMOTE_CFG_PATH, 'utf8'));

let passed = 0;
let failed = 0;

function assert(cond, label) {
  if (cond) {
    console.log('  PASS  ' + label);
    passed++;
  } else {
    console.log('  FAIL  ' + label);
    failed++;
  }
}

// 递归按 key 字母排序（用于忽略 JSON key 顺序对字符串比较的影响）
function sortKeysDeep(obj) {
  if (Array.isArray(obj)) return obj.map(sortKeysDeep);
  if (obj && typeof obj === 'object') {
    return Object.keys(obj).sort().reduce((acc, k) => {
      acc[k] = sortKeysDeep(obj[k]);
      return acc;
    }, {});
  }
  return obj;
}

console.log('=== verify-config-sync.js ===');
console.log('防 default.json / x-remote-example.json 不同步回归（2026-06-19 教训）\n');

// 1. 两个文件都存在且 JSON 解析成功
assert(defaultCfg && typeof defaultCfg === 'object', 'default.json 可解析为 JSON');
assert(remoteCfg && typeof remoteCfg === 'object', 'x-remote-example.json 可解析为 JSON');

// 2. 顶层 version 字段一致
assert(
  defaultCfg.version === remoteCfg.version,
  '顶层 version 一致: "' + defaultCfg.version + '" / "' + remoteCfg.version + '"'
);

// 3. 顶层 updated 字段一致
assert(
  defaultCfg.updated === remoteCfg.updated,
  '顶层 updated 一致: "' + defaultCfg.updated + '" / "' + remoteCfg.updated + '"'
);

// 4. selectors 块必须存在
assert(
  defaultCfg.selectors && typeof defaultCfg.selectors === 'object',
  'default.json 有 selectors 块'
);
assert(
  remoteCfg.selectors && typeof remoteCfg.selectors === 'object',
  'x-remote-example.json 有 selectors 块'
);

// 5. selectors 下所有顶层 key 一致（防止漏加 i18n / retweet 等整块）
const defaultKeys = Object.keys(defaultCfg.selectors).sort();
const remoteKeys = Object.keys(remoteCfg.selectors).sort();
assert(
  JSON.stringify(defaultKeys) === JSON.stringify(remoteKeys),
  'selectors 顶层 key 集合一致: [' + defaultKeys.join(', ') + ']'
);

// 6. 语义级一致（排序后 stringify 对比 —— 忽略 key 顺序，但能抓出真正内容差异）
const defaultSorted = JSON.stringify(sortKeysDeep(defaultCfg));
const remoteSorted = JSON.stringify(sortKeysDeep(remoteCfg));
assert(
  defaultSorted === remoteSorted,
  'selectors 内容语义一致（排序后 stringify 比对）'
);

// 7. 字节级一致（防止改了其中一份但忘了另一份 —— JSON 顺序/格式都一样）
const defaultBytes = fs.readFileSync(DEFAULT_CFG_PATH, 'utf8');
const remoteBytes = fs.readFileSync(REMOTE_CFG_PATH, 'utf8');
assert(
  defaultBytes === remoteBytes,
  '两个文件字节级完全一致（' + defaultBytes.length + ' bytes / ' + remoteBytes.length + ' bytes）'
);

// 8. 关键 selector 存在性回归检查（防止有人删 selector）
assert(
  Array.isArray(defaultCfg.selectors.bookmark && defaultCfg.selectors.bookmark.removeButtons) &&
  defaultCfg.selectors.bookmark.removeButtons.indexOf("[data-testid='unbookmark']") !== -1,
  'bookmark.removeButtons 含 unbookmark 兜底（tweets-bug-7 修复）'
);
assert(
  Array.isArray(remoteCfg.selectors.bookmark && remoteCfg.selectors.bookmark.removeButtons) &&
  remoteCfg.selectors.bookmark.removeButtons.indexOf("[data-testid='unbookmark']") !== -1,
  'remote bookmark.removeButtons 含 unbookmark 兜底（tweets-bug-7 修复）'
);
assert(
  defaultCfg.selectors.i18n && defaultCfg.selectors.i18n.deleteKeywords,
  'i18n.deleteKeywords 存在（断网时 confirm 按钮 8 语言兜底）'
);
assert(
  remoteCfg.selectors.i18n && remoteCfg.selectors.i18n.deleteKeywords,
  'remote i18n.deleteKeywords 存在'
);

console.log('\n=== summary ===');
console.log('  passed: ' + passed);
console.log('  failed: ' + failed);
if (failed > 0) {
  console.log('\nFAIL: ' + failed + ' check(s) failed');
  console.log('提示: 改完 config 后必须同步两份文件。');
  console.log('  改 default.json → 同步改 x-remote-example.json（反之亦然）');
  console.log('  或跑 node scripts/sync-config.js 从 source of truth 自动生成另一份');
  process.exit(1);
}
console.log('OK: default.json 和 x-remote-example.json 完全一致');
process.exit(0);
