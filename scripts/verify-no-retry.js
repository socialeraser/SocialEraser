// 回归检查：cleanup 不再无脑重试（修复 4 runs in 22s 浪费问题）
// 修复背景：旧实现 runCleanupWithRetry(.., 2, ..) 在 0 命中时无条件 sleep 4s 再跑一次，
//   与 waitForArticles(3000) 职责重复，导致每页 cleanup 跑 2 次（4s 浪费 + 用户困惑）。
// 修复：删掉 runCleanupWithRetry，cleanup 本体只跑 1 次。
//       waitForArticles 已用 MutationObserver + 3s 兜底 cover "页面没加载" 场景。
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const checks = [];
const fail = [];
function check(name, cond, detail) {
  checks.push({ name, ok: !!cond, detail });
  if (!cond) fail.push({ name, detail });
}

const contentJs = fs.readFileSync(path.join(ROOT, 'platforms/x-project/scripts/content.js'), 'utf8');
const i18nJs = fs.readFileSync(path.join(ROOT, 'platforms/x-project/scripts/i18n.js'), 'utf8');

// 1. content.js 必须不再有 runCleanupWithRetry 函数定义
check('content.js 已删除 runCleanupWithRetry 函数',
  !/function\s+runCleanupWithRetry\s*\(/.test(contentJs));

// 2. content.js 不能再调用 runCleanupWithRetry
check('content.js 不再调用 runCleanupWithRetry',
  !/runCleanupWithRetry\s*\(/.test(contentJs));

// 3. content.js 必须改为直接调 runCleanupOnce（一次跑完）
check('content.js 改为调 runCleanupOnce(optionsForCurrent, 1, isLast)',
  /runCleanupOnce\s*\(\s*optionsForCurrent\s*,\s*1\s*,\s*isLast\s*\)/.test(contentJs));

// 4. content.js 不再有 "retrying in 4s" 之类的硬编码 4s sleep（防止再被加回来）
check('content.js 不再硬编码 4 秒重试间隔',
  !/setTimeout\s*\(\s*[^)]*,\s*4000\s*\)/.test(contentJs));

// 5. i18n.js 8 语言都不再有 retryingIn 键
const langs = ['en', 'zh-CN', 'zh-TW', 'ja', 'ko', 'es', 'de', 'fr'];
for (const lang of langs) {
  // 找到该语言块（括号配对）
  const startA = "'" + lang + "': {";
  const startB = lang + ": {";
  let startIdx = i18nJs.indexOf(startA);
  if (startIdx < 0) startIdx = i18nJs.indexOf(startB);
  if (startIdx < 0) {
    check('i18n.js 找到 ' + lang + ' 块', false);
    continue;
  }
  let depth = 0;
  let blockEnd = -1;
  for (let i = startIdx; i < i18nJs.length; i++) {
    if (i18nJs[i] === '{') depth++;
    else if (i18nJs[i] === '}') {
      depth--;
      if (depth === 0) { blockEnd = i; break; }
    }
  }
  const block = i18nJs.substring(startIdx, blockEnd);
  check('i18n.js ' + lang + ' 不含 retryingIn 键', !block.includes('retryingIn'));
}

// 6. 保留 waitForArticles（这是合理的"页面没加载"兜底，不能误删）
check('content.js 保留 waitForArticles（MutationObserver + 3s 兜底）',
  /function\s+waitForArticles\s*\(/.test(contentJs) && /waitForArticles\s*\(\s*3000\s*\)/.test(contentJs));

// 7. content.js 删 retry 时同步把注释也清理（防止误导后来人）
const runCleanupWithRetryMention = (contentJs.match(/runCleanupWithRetry/g) || []).length;
check('content.js 中 runCleanupWithRetry 只在"已删除"注释里出现（防止误用）',
  runCleanupWithRetryMention <= 2,
  '出现 ' + runCleanupWithRetryMention + ' 次，应 ≤2（仅在说明性注释中）');

console.log('');
for (const c of checks) {
  console.log((c.ok ? '  ✓  ' : '  ✗  ') + c.name);
}
console.log('');
console.log('  通过: ' + (checks.length - fail.length) + '/' + checks.length);
if (fail.length > 0) {
  console.log('[FAIL]');
  process.exit(1);
}
