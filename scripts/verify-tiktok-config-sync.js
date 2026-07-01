#!/usr/bin/env node
// verify-tiktok-config-sync.js
// 防 default.json 和 tiktok-remote-example.json 内容不同步
//
// 根因（2026-06-19 x-project 教训）：
//   之前修 tweets-bug-7（bookmark 改用 cellInnerDiv + unbookmark）只改了 default.json，
//   忘了改 x-remote-example.json。断网时用 default（修了，能用），
//   联网时用 remote（没修，X 2026 改版后失效）—— 同一份修复分两份，行为不一致。
//   i18n 块（deleteKeywords / unretweetKeywords / ...）也有同样问题。
//
// 锁定：default.json 和 tiktok-remote-example.json 的内容必须字节级一致

'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_CFG_PATH = path.join(__dirname, '..', 'platforms', 'tiktok-project', 'src', 'config', 'default.json');
const REMOTE_CFG_PATH = path.join(__dirname, '..', 'platforms', 'tiktok-project', 'src', 'config', 'tiktok-remote-example.json');

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
// 排除 _comment 字段（元数据，非 selector —— 跟 check-schema.js 行为一致）
function sortKeysDeep(obj) {
  if (Array.isArray(obj)) return obj.map(sortKeysDeep);
  if (obj && typeof obj === 'object') {
    return Object.keys(obj).sort().reduce((acc, k) => {
      if (k.startsWith('_')) return acc;
      acc[k] = sortKeysDeep(obj[k]);
      return acc;
    }, {});
  }
  return obj;
}

// 剥除 _comment 字段后的纯 JSON 文本（用于字节级比较）
function stripComments(s) {
  return s.replace(/"_[A-Za-z_]+"\s*:\s*"[^"]*"\s*,?\s*/g, '').replace(/,(\s*[}\]])/g, '$1');
}

console.log('=== verify-tiktok-config-sync.js ===');
console.log('防 default.json / tiktok-remote-example.json 不同步回归\n');

// 1. 两个文件都存在且 JSON 解析成功
assert(defaultCfg && typeof defaultCfg === 'object', 'default.json 可解析为 JSON');
assert(remoteCfg && typeof remoteCfg === 'object', 'tiktok-remote-example.json 可解析为 JSON');

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
  'tiktok-remote-example.json 有 selectors 块'
);

// 5. selectors 下所有顶层 key 一致
const defaultKeys = Object.keys(defaultCfg.selectors).sort();
const remoteKeys = Object.keys(remoteCfg.selectors).sort();
assert(
  JSON.stringify(defaultKeys) === JSON.stringify(remoteKeys),
  'selectors 顶层 key 集合一致: [' + defaultKeys.join(', ') + ']'
);

// 6. 语义级一致（排序后 stringify 对比）
const defaultSorted = JSON.stringify(sortKeysDeep(defaultCfg));
const remoteSorted = JSON.stringify(sortKeysDeep(remoteCfg));
assert(
  defaultSorted === remoteSorted,
  'selectors 内容语义一致（排序后 stringify 比对）'
);

// 7. 字节级一致（剥除 _comment 字段后）
const defaultBytes = stripComments(fs.readFileSync(DEFAULT_CFG_PATH, 'utf8'));
const remoteBytes = stripComments(fs.readFileSync(REMOTE_CFG_PATH, 'utf8'));
assert(
  defaultBytes === remoteBytes,
  '两个文件 _comment 字段剥除后内容一致（' + defaultBytes.length + ' bytes / ' + remoteBytes.length + ' bytes）'
);

// 8. tiktokWebsite.patterns 必含 tiktok.com + www.tiktok.com
const defaultPatterns = (defaultCfg.selectors.tiktokWebsite && defaultCfg.selectors.tiktokWebsite.patterns) || [];
const remotePatterns = (remoteCfg.selectors.tiktokWebsite && remoteCfg.selectors.tiktokWebsite.patterns) || [];
assert(
  defaultPatterns.indexOf('tiktok.com') !== -1 && defaultPatterns.indexOf('www.tiktok.com') !== -1,
  'default.json tiktokWebsite.patterns 含 tiktok.com + www.tiktok.com'
);
assert(
  remotePatterns.indexOf('tiktok.com') !== -1 && remotePatterns.indexOf('www.tiktok.com') !== -1,
  'tiktok-remote-example.json tiktokWebsite.patterns 含 tiktok.com + www.tiktok.com'
);

// 9. i18n 5 key 都有 8 语言条目
const i18nKeys = ['cancelKeywords', 'confirmKeywords', 'deleteKeywords', 'unfollowKeywords', 'repostKeywords'];
i18nKeys.forEach((k) => {
  const arr = (defaultCfg.selectors.i18n && defaultCfg.selectors.i18n[k]) || [];
  assert(
    Array.isArray(arr) && arr.length >= 8,
    'default.json i18n.' + k + ' 数组 ≥ 8 语言（实际 ' + arr.length + '）'
  );
  const arrR = (remoteCfg.selectors.i18n && remoteCfg.selectors.i18n[k]) || [];
  assert(
    Array.isArray(arrR) && arrR.length >= 8,
    'tiktok-remote-example.json i18n.' + k + ' 数组 ≥ 8 语言（实际 ' + arrR.length + '）'
  );
});

// 10. selector 块非空
const requiredBlocks = ['repost', 'like', 'favorite', 'following'];
requiredBlocks.forEach((b) => {
  const dBlock = defaultCfg.selectors[b] || {};
  const rBlock = remoteCfg.selectors[b] || {};
  const dKeys = Object.keys(dBlock).filter(k => !k.startsWith('_'));
  const rKeys = Object.keys(rBlock).filter(k => !k.startsWith('_'));
  assert(
    dKeys.length >= 1,
    'default.json selectors.' + b + ' 块非空（实际 ' + dKeys.length + ' fields: ' + dKeys.join(',') + '）'
  );
  assert(
    rKeys.length >= 1,
    'tiktok-remote-example.json selectors.' + b + ' 块非空（实际 ' + rKeys.length + ' fields: ' + rKeys.join(',') + '）'
  );
});

// 11. common.viewCount 数组非空（TikTok 特有）
const dViewCount = (defaultCfg.selectors.common && defaultCfg.selectors.common.viewCount) || [];
const rViewCount = (remoteCfg.selectors.common && remoteCfg.selectors.common.viewCount) || [];
assert(
  Array.isArray(dViewCount) && dViewCount.length >= 1,
  'default.json common.viewCount 数组非空（实际 ' + dViewCount.length + '）'
);
assert(
  Array.isArray(rViewCount) && rViewCount.length >= 1,
  'tiktok-remote-example.json common.viewCount 数组非空（实际 ' + rViewCount.length + '）'
);

// 12. common.videoMoreButtons 数组非空（video 清理的 "···" 按钮 selector）
const dMore = (defaultCfg.selectors.common && defaultCfg.selectors.common.videoMoreButtons) || [];
const rMore = (remoteCfg.selectors.common && remoteCfg.selectors.common.videoMoreButtons) || [];
assert(
  Array.isArray(dMore) && dMore.length >= 1,
  'default.json common.videoMoreButtons 数组非空（实际 ' + dMore.length + '）'
);
assert(
  Array.isArray(rMore) && rMore.length >= 1,
  'tiktok-remote-example.json common.videoMoreButtons 数组非空（实际 ' + rMore.length + '）'
);

// 13. login.checkElements 8 语言都有条目
const langs = ['en', 'zh-CN', 'ja', 'ko', 'pt', 'es', 'de', 'fr'];
const dCheck = (defaultCfg.selectors.login && defaultCfg.selectors.login.checkElements) || {};
const rCheck = (remoteCfg.selectors.login && remoteCfg.selectors.login.checkElements) || {};
const missingLoginLangs = [];
langs.forEach((l) => {
  if (!Array.isArray(dCheck[l]) || dCheck[l].length === 0) missingLoginLangs.push('default/' + l);
  if (!Array.isArray(rCheck[l]) || rCheck[l].length === 0) missingLoginLangs.push('remote/' + l);
});
assert(
  missingLoginLangs.length === 0,
  'login.checkElements 8 语言齐全（缺失: ' + (missingLoginLangs.length ? missingLoginLangs.join(', ') : '无') + '）'
);

// 14. repost.cardMarker 非空（Repost 识别用）
const dRepostMarker = (defaultCfg.selectors.repost && defaultCfg.selectors.repost.cardMarker) || [];
const rRepostMarker = (remoteCfg.selectors.repost && remoteCfg.selectors.repost.cardMarker) || [];
assert(
  Array.isArray(dRepostMarker) && dRepostMarker.length >= 1,
  'default.json repost.cardMarker 数组非空（实际 ' + dRepostMarker.length + '）'
);
assert(
  Array.isArray(rRepostMarker) && rRepostMarker.length >= 1,
  'tiktok-remote-example.json repost.cardMarker 数组非空（实际 ' + rRepostMarker.length + '）'
);

console.log('\n=== summary ===');
console.log('  passed: ' + passed);
console.log('  failed: ' + failed);
if (failed > 0) {
  console.log('\nFAIL: ' + failed + ' check(s) failed');
  console.log('提示: 改完 config 后必须同步两份文件。');
  console.log('  改 default.json → 同步改 tiktok-remote-example.json（反之亦然）');
  process.exit(1);
}
console.log('OK: default.json 和 tiktok-remote-example.json 完全一致');
process.exit(0);
