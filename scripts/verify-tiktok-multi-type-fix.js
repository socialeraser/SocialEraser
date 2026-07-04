// verify-tiktok-multi-type-fix.js
// 守住 2026-07-03 multi-type 修复：
//   1. sidepanel.js startCleanup 成功路径必须调 updateProgress()（防 "Processed: 0/0" 显示 bug）
//   2. sidepanel.js daily limit 路径用 .limit-reached className（防 0/0 显示 bug）
//   3. content.js getPageURLForType 必须接受 knownU 参数并优先用（防 readRepostsTargetUrl race）
//   4. content.js findUsernameFallback 必须存在（覆盖 tiktokstudio / foryou 场景）
//   5. content.js startCleanup 和 checkAndResumePendingCleanup 都必须用 findUsernameFallback 兜底
//   6. content.js multi-type 死循环兜底：拿不到 u 时清 pending + 报 cleanupError，**不再跳 foryou**
//   7. content.js checkAndResumePendingCleanup 拿到 u 后必须直接 force /@user（不依赖 session storage）
//
// 历史教训：
//   - 旧 bug 1：startCleanup 设了 state.totalItems 但没调 updateProgress() → progress card 显示 0/0
//   - 旧 bug 2：tiktokstudio → videos → 跳 foryou → foryou 拿 u → fire-and-forget write + 立即 readRepostsTargetUrl
//     → race condition → nextUrl=null → clearPendingCleanup → remaining types 永远不跑
//   - 旧 bug 3（2026-07-03 新增）：daily limit 路径 progress card 显示 0/0 误导用户
//   - 旧 bug 4（2026-07-03 新增）：tiktokstudio 上 getCurrentUsername + nav-profile 都拿不到 u
//     → 跳 foryou 死循环

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let passed = 0, failed = 0;

function check(name, cond) {
  if (cond) { passed++; console.log('  ✓  ' + name); }
  else { failed++; console.log('  ✗  ' + name); }
}

const sidepanelSrc = fs.readFileSync(
  path.join(ROOT, 'platforms/tiktok-project/src/sidepanel.js'), 'utf8');
const sidepanelHtml = fs.readFileSync(
  path.join(ROOT, 'platforms/tiktok-project/src/sidepanel.html'), 'utf8');
const content = fs.readFileSync(
  path.join(ROOT, 'platforms/tiktok-project/scripts/content.js'), 'utf8');

// strip JS 单行注释（只 strip 行首 `//` 注释，避开 URL 里的 `//`）
function stripJsComments(src) {
  return src.split('\n').map(function(line) {
    const trimmed = line.trim();
    if (trimmed.startsWith('//')) return '';
    return line;
  }).join('\n');
}
const contentStripped = stripJsComments(content);
const sidepanelStripped = stripJsComments(sidepanelSrc);

console.log('=== TikTok multi-type fix (race condition + 0/0 display + findUsernameFallback) ===');

// ━━━ Bug 1: Processed 0/0 显示（成功路径）━━━
// 旧 bug：startCleanup 成功路径设了 state.totalItems = remaining 但没调 updateProgress()，
//   HTML #progress-current / #progress-total 元素保留旧值 0 → 用户看到 "Processed: 0 / 0"。
//   修法：设 state 后立即调 updateProgress() 同步 DOM。

// 1) updateProgress 函数必须存在 + 更新 progressCurrent / progressTotal
check('sidepanel.js updateProgress() 函数存在',
  /function\s+updateProgress\s*\(/.test(sidepanelSrc));
check('sidepanel.js updateProgress() 更新 progressCurrent 元素',
  /function\s+updateProgress[\s\S]{0,500}progressCurrent\.textContent/.test(sidepanelSrc));
check('sidepanel.js updateProgress() 更新 progressTotal 元素',
  /function\s+updateProgress[\s\S]{0,500}progressTotal\.textContent/.test(sidepanelSrc));

// 2) startCleanup 成功路径设了 state.totalItems 之后必须调 updateProgress()
check('sidepanel.js startCleanup 必须设 state.totalItems = remaining',
  /state\.totalItems\s*=\s*remaining\s*;/.test(sidepanelSrc));
check('sidepanel.js startCleanup 成功路径必须在 state.totalItems 设后调 updateProgress()（防 0/0）',
  /state\.totalItems\s*=\s*remaining\s*;[\s\S]{0,2000}?updateProgress\s*\(\s*\)/.test(sidepanelSrc));

// ━━━ Bug 2: daily limit 路径 progress card 文案（防 0/0 误导）━━━
// 旧 bug：daily limit 已达时 progress card 隐藏后被 addLog 复活成 'progress-card active' + 0/0
//   → 用户看到 "Processed: 0/0" 误以为日限制剩余总数变 0 是 bug
// 新实现：className = 'progress-card limit-reached'，progressText 显示 dailyLimitReached
check('sidepanel.js daily limit 路径必须设 className 含 "limit-reached"',
  /if\s*\(\s*remaining\s*<=\s*0\s*\)\s*\{[\s\S]{0,2000}progressCard[\s\S]{0,200}className\s*=\s*['"]progress-card limit-reached['"]/.test(sidepanelStripped));
check('sidepanel.js daily limit 路径必须设 progressText = dailyLimitReached',
  /if\s*\(\s*remaining\s*<=\s*0\s*\)\s*\{[\s\S]{0,3000}progressText\.textContent\s*=\s*t\(['"]dailyLimitReached['"]/.test(sidepanelStripped));
check('sidepanel.js daily limit 路径 progressTotal 必须显示 FREE_LIMIT_PER_DAY 而非 0',
  /if\s*\(\s*remaining\s*<=\s*0\s*\)\s*\{[\s\S]{0,2500}progressTotal\.textContent\s*=\s*String\(\s*FREE_LIMIT_PER_DAY\s*\)/.test(sidepanelStripped));
check('sidepanel.html 必须有 .progress-card.limit-reached CSS',
  /\.progress-card\.limit-reached\s*\{[\s\S]{0,500}border-color/.test(sidepanelHtml));
check('sidepanel.html .limit-reached 必须有 display: block（不依赖 .active）',
  /\.progress-card\.limit-reached\s*\{[\s\S]{0,500}display:\s*block/.test(sidepanelHtml));

// ━━━ Bug 3: getPageURLForType 接受 knownU ━━━
check('content.js getPageURLForType 接受 knownU 参数',
  /async\s+function\s+getPageURLForType\s*\(\s*type\s*,\s*knownU\s*\)/.test(contentStripped));
check('content.js getPageURLForType knownU 已知时同步直接构造 /@user URL（无 race）',
  /if\s*\(\s*knownU\s*&&\s*\(\s*type\s*===\s*['"]reposts['"]/.test(contentStripped) &&
  /return\s+['"]https:\/\/www\.tiktok\.com\/@['"]\s*\+\s*knownU/.test(contentStripped));

// ━━━ Bug 4: findUsernameFallback 兜底提取（tiktokstudio / foryou）━━━
check('content.js findUsernameFallback 函数存在',
  /function\s+findUsernameFallback\s*\(/.test(contentStripped));
check('content.js findUsernameFallback 必须扫 DOM a[href^="/@"]',
  /function\s+findUsernameFallback[\s\S]{0,500}querySelectorAll\(\s*['"]a\[href\][\'"]\s*\)/.test(contentStripped));
check('content.js findUsernameFallback 必须读 document.referrer',
  /function\s+findUsernameFallback[\s\S]{0,800}document\.referrer/.test(contentStripped));

// 4.1) startCleanup handler 必须用 findUsernameFallback
check('content.js startCleanup handler: nav-profile 拿不到时调 findUsernameFallback',
  /var\s+u\s*=\s*getCurrentUsername\(\)\s*;[\s\S]{0,2500}findUsernameFallback\(\s*\)/.test(contentStripped));
// 4.2) checkAndResumePendingCleanup !matchedType 路径也必须用
check('content.js checkAndResumePendingCleanup !matchedType: 兜底用 findUsernameFallback',
  /if\s*\(\s*!matchedType\s*\)\s*\{[\s\S]{0,4000}findUsernameFallback\(\s*\)/.test(contentStripped));
// 4.3) checkAndResumePendingCleanup matchedType 完成后也必须用
check('content.js checkAndResumePendingCleanup matchedType 后: 兜底用 findUsernameFallback',
  /await\s+injector\.startCleanup\(optionsForCurrent\)[\s\S]{0,1500}findUsernameFallback\(\s*\)/.test(contentStripped));

// ━━━ Bug 5: multi-type 死循环兜底（不再跳 foryou）━━━
// 旧 bug 4：tiktokstudio 上 u=null → 跳 foryou → foryou 拿 u → 跳回 foryou → 死循环
// 新实现：拿不到 u 时清 pending + 报 cleanupError，**不再跳 foryou**

// 5.1) startCleanup !matchedType 路径：types.length > 1 时**不再**跳 foryou
check('content.js startCleanup !matchedType: types.length > 1 不应再跳 foryou（死循环兜底）',
  !/if\s*\(\s*!matchedType\s+&&\s+types\.length\s*>\s*0\s*\)\s*\{[\s\S]{0,3000}window\.__TikTokEraserForcePageLoad\(\s*['"]https:\/\/www\.tiktok\.com\/foryou['"]\s*\)/.test(contentStripped));
// 5.2) startCleanup !matchedType 路径：拿不到 u 时**必须**清 pending + 报 cleanupError
check('content.js startCleanup !matchedType: 拿不到 u 时 clearPendingCleanup + cleanupError',
  /if\s*\(\s*!matchedType\s+&&\s+types\.length\s*>\s*0\s*\)\s*\{[\s\S]{0,3500}clearPendingCleanup[\s\S]{0,800}cleanupError/.test(contentStripped));

// 5.3) startCleanup matchedType 完成后：u 解析不出来时**不再**跳 foryou
check('content.js startCleanup matchedType 完成后: u=null 不应再跳 foryou',
  // 匹配 matchedType 分支内的 "跳 foryou" 模式（仅限制 matchedType 内部）
  !/if\s*\(\s*matchedType\s*\)\s*\{[\s\S]{0,5000}window\.__TikTokEraserForcePageLoad\(\s*['"]https:\/\/www\.tiktok\.com\/foryou['"]\s*\)/.test(contentStripped));
// 5.4) startCleanup matchedType 完成后：u 解析不出来时**必须**清 pending + 报 cleanupError
check('content.js startCleanup matchedType 完成后: u=null 必须 clearPendingCleanup + cleanupError',
  /if\s*\(\s*matchedType\s*\)\s*\{[\s\S]{0,6000}clearPendingCleanup[\s\S]{0,1500}cleanupError/.test(contentStripped));

// 5.5) checkAndResumePendingCleanup matchedType 完成后：u 解析不出来时**不再**跳 foryou
check('content.js checkAndResumePendingCleanup matchedType 后: u=null 不应再跳 foryou',
  !/await\s+injector\.startCleanup\(optionsForCurrent\)[\s\S]{0,2000}window\.__TikTokEraserForcePageLoad\(\s*['"]https:\/\/www\.tiktok\.com\/foryou['"]\s*\)/.test(contentStripped));
// 5.6) checkAndResumePendingCleanup matchedType 完成后：u 解析不出来时**必须**清 pending + 报 cleanupError
check('content.js checkAndResumePendingCleanup matchedType 后: u=null 必须 clearPendingCleanup + cleanupError',
  /await\s+injector\.startCleanup\(optionsForCurrent\)[\s\S]{0,2500}clearPendingCleanup[\s\S]{0,800}cleanupError/.test(contentStripped));

// ━━━ Bug 6: checkAndResumePendingCleanup !matchedType 拿到 u 后直接 force /@user ━━━
check('content.js resume !matchedType: waitForElement nav-profile 拿 u',
  /if\s*\(\s*!matchedType\s*\)\s*\{[\s\S]{0,2000}waitForElement\(\s*['"]\[data-e2e="nav-profile"\]['"]\s*,\s*8000\s*\)/.test(contentStripped));
check('content.js resume !matchedType: 拿到 u 后直接 force /@user（不走 session race）',
  /if\s*\(\s*!matchedType\s*\)\s*\{[\s\S]{0,4500}window\.__TikTokEraserForcePageLoad\(\s*['"]https:\/\/www\.tiktok\.com\/@['"]\s*\+\s*u\s*\)/.test(contentStripped));

// ━━━ Bug 7: startCleanup matchedType 路径 knownU + 兜底 ━━━
// 1) getPageURLForType 传 knownU
check('content.js startCleanup matchedType: getPageURLForType 传 knownU 或 fallbackU（防 race）',
  /getPageURLForType\(\s*['"]reposts['"]\s*,\s*(?:u|fallbackU|fallbackU2)\s*\)/.test(contentStripped));
// 2) 已知 u 时直接构造 URL 兜底
check('content.js startCleanup matchedType: 已知 u 时直接构造 URL 兜底',
  /!\s*profileUrl\s*&&\s*(?:u|fallbackU)\s*\)\s*\{[\s\S]{0,400}profileUrl\s*=\s*['"]https:\/\/www\.tiktok\.com\/@['"]\s*\+\s*(?:u|fallbackU)/.test(contentStripped));

// ━━━ Bug 8: checkAndResumePendingCleanup matchedType 完成后 knownU + 兜底 ━━━
// 1) getCurrentUsername() 或 findUsernameFallback 拿 u
check('content.js checkAndResumePendingCleanup matchedType 后: 拿 u（getCurrentUsername 或 fallback）',
  /await\s+injector\.startCleanup\(optionsForCurrent\)[\s\S]{0,1500}(?:getCurrentUsername\(\)|findUsernameFallback\(\))/.test(contentStripped));
// 2) getPageURLForType 传 knownU
check('content.js checkAndResumePendingCleanup matchedType 后: getPageURLForType 传 knownU（防 race）',
  /await\s+injector\.startCleanup\(optionsForCurrent\)[\s\S]{0,2000}getPageURLForType\(\s*['"]reposts['"]\s*,\s*knownU\s*\)/.test(contentStripped));
// 3) 已知 knownU 时直接构造 URL 兜底
check('content.js checkAndResumePendingCleanup matchedType 后: 已知 knownU 时直接构造 URL 兜底',
  /!\s*profileUrl\s*&&\s*knownU\s*\{[\s\S]{0,400}profileUrl\s*=\s*['"]https:\/\/www\.tiktok\.com\/@['"]\s*\+\s*knownU/.test(contentStripped));

console.log('\n' + (failed === 0 ? '✓ all passed' : '✗ ' + failed + ' failed') + ' (' + passed + '/' + (passed + failed) + ')');
process.exit(failed === 0 ? 0 : 1);
