// verify-rating-prompt-threshold.js
// 守住 "How was your cleanup?" 评分框弹出阈值与 suppression 规则
// 2026-07-02 修改：阈值 >0，去掉 30 天冷却 + neverAsk 限制
//   hasRated 检查保留：评过分的用户不再骚扰
//   8 语言 cooldown / skipCount / neverAsk 字段保留在 storage schema 中以兼容老数据
//   但 maybeShowRatingPrompt 不再读取 neverAsk / skipCount

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let passed = 0, failed = 0;

function check(name, cond) {
  if (cond) { passed++; console.log('  ✓  ' + name); }
  else { failed++; console.log('  ✗  ' + name); }
}

const xSidepanel = fs.readFileSync(path.join(ROOT, 'platforms/x-project/src/sidepanel.js'), 'utf8');
const tkSidepanel = fs.readFileSync(path.join(ROOT, 'platforms/tiktok-project/src/sidepanel.js'), 'utf8');

console.log('=== Rating prompt threshold & suppression ===');

// x-project: 评分提示阈值（注释里可能含 "评分提示" 等，距离 > 40 字符）
check('x-project sidepanel.js 评分提示阈值是 > 0（不再 > 1）',
  /processedItems\s*>\s*0[\s\S]{0,200}setTimeout\s*\(\s*maybeShowRatingPrompt/.test(xSidepanel));
check('x-project sidepanel.js 评分提示不再用 > 1',
  !/processedItems\s*>\s*1[\s\S]{0,200}setTimeout\s*\(\s*maybeShowRatingPrompt/.test(xSidepanel));

// tiktok-project: 评分提示阈值
check('tiktok-project sidepanel.js 评分提示阈值是 > 0',
  /processedItems\s*>\s*0[\s\S]{0,200}setTimeout\s*\(\s*maybeShowRatingPrompt/.test(tkSidepanel));
check('tiktok-project sidepanel.js 评分提示不再用 > 1',
  !/processedItems\s*>\s*1[\s\S]{0,200}setTimeout\s*\(\s*maybeShowRatingPrompt/.test(tkSidepanel));

// 总结卡仍然用 > 0（不变）
check('x-project sidepanel.js 总结卡阈值仍是 > 0',
  /processedItems\s*>\s*0[\s\S]{0,200}showSummaryCard/.test(xSidepanel));
check('tiktok-project sidepanel.js 总结卡阈值仍是 > 0',
  /processedItems\s*>\s*0[\s\S]{0,200}showSummaryCard/.test(tkSidepanel));

// maybeShowRatingPrompt 内部不再 suppress neverAsk
// 用 negative lookbehind 思路：取函数体到 closing brace，断言其中不含 .neverAsk
// 简化方案：检查"skipCount >= RATING_MAX_SKIPS" + "ageMs < RATING_COOLDOWN_MS" 这两个老代码模式是否还存在
check('x-project maybeShowRatingPrompt 不再 check skipCount/cooldown（无老 if 块）',
  // 旧版：if (s.skipCount >= RATING_MAX_SKIPS) { ... if (ageMs < RATING_COOLDOWN_MS) ... }
  // 新版：只剩 if (s.hasRated) return;
  !/function\s+maybeShowRatingPrompt[\s\S]{0,2000}s\.skipCount\s*>=\s*RATING_MAX_SKIPS/.test(xSidepanel)
  && !/function\s+maybeShowRatingPrompt[\s\S]{0,2000}ageMs\s*<\s*RATING_COOLDOWN_MS/.test(xSidepanel));
check('x-project maybeShowRatingPrompt 不再 check neverAsk（无 s.neverAsk 引用）',
  !/function\s+maybeShowRatingPrompt[\s\S]{0,2000}s\.neverAsk/.test(xSidepanel));

check('tiktok-project maybeShowRatingPrompt 不再 check skipCount/cooldown（无老 if 块）',
  !/function\s+maybeShowRatingPrompt[\s\S]{0,2000}s\.skipCount\s*>=\s*RATING_MAX_SKIPS/.test(tkSidepanel)
  && !/function\s+maybeShowRatingPrompt[\s\S]{0,2000}ageMs\s*<\s*RATING_COOLDOWN_MS/.test(tkSidepanel));
check('tiktok-project maybeShowRatingPrompt 不再 check neverAsk（无 s.neverAsk 引用）',
  !/function\s+maybeShowRatingPrompt[\s\S]{0,2000}s\.neverAsk/.test(tkSidepanel));

// hasRated 检查保留（防骚扰评过分的用户）
check('x-project maybeShowRatingPrompt 保留 hasRated 检查',
  /function\s+maybeShowRatingPrompt[\s\S]{0,500}s\.hasRated/.test(xSidepanel));
check('tiktok-project maybeShowRatingPrompt 保留 hasRated 检查',
  /function\s+maybeShowRatingPrompt[\s\S]{0,500}s\.hasRated/.test(tkSidepanel));

console.log('');
console.log('  通过: ' + passed + '/' + (passed + failed));
if (failed > 0) {
  console.log('[FAIL]');
  process.exit(1);
}
