// verify-tiktok-repost-cancel-fix.js
// 守住 TikTok Reposts 删除修复（2026-07-02）：
//   - 用 `a#icon-element-repost` 直接定位元素（始终存在）
//   - 用 8 语言 aria-label 等值匹配判定「已转发」状态
//   - 解决重复点击问题（之前 `[data-e2e='video-share-repost']` 不带 aria-label 过滤，
//     同一元素在「Repost」/「Remove repost」状态都匹配，会反向 re-repost）
// 8 语言 aria-label **全部 MCP 浏览器实测**（2026-07-02 l702362 视频切 8 语言读 DOM）：

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let passed = 0, failed = 0;

function check(name, cond) {
  if (cond) { passed++; console.log('  ✓  ' + name); }
  else { failed++; console.log('  ✗  ' + name); }
}

const config = JSON.parse(fs.readFileSync(
  path.join(ROOT, 'platforms/tiktok-project/src/config/default.json'), 'utf8'));
const automation = fs.readFileSync(
  path.join(ROOT, 'platforms/tiktok-project/scripts/tiktok-automation.js'), 'utf8');

const repost = (config.selectors && config.selectors.repost) || {};

console.log('=== TikTok Repost cancel fix (aria-label equality, 8 langs) ===');

// 1. config.selectors.repost.videoShareRepost 存在
check('config.selectors.repost.videoShareRepost 存在',
  Array.isArray(repost.videoShareRepost));
check('config.selectors.repost.videoShareRepost 至少 8 个 selector',
  repost.videoShareRepost && repost.videoShareRepost.length >= 8);

// 2. 所有 selector 必须是 a#icon-element-repost 前缀
const allPrefixMatch = repost.videoShareRepost && repost.videoShareRepost.every(s =>
  s.indexOf('a#icon-element-repost') === 0
);
check('所有 videoShareRepost selector 以 a#icon-element-repost 开头',
  allPrefixMatch);

// 3. 8 语言 aria-label **实测**值（2026-07-02 MCP 浏览器对 l702362 视频实测）
// 之前猜的多项错误，现在所有值都实测
const expectedAriaLabels = {
  'Remove repost': 'en',
  '移除转发': 'zh-Hans',
  '再投稿を削除': 'ja-JP',
  '리포스트 삭제': 'ko-KR',
  'Remover republicação': 'pt-BR',
  'Eliminar la publicación compartida': 'es-ES',
  'Erneute Veröffentlichung entfernen': 'de-DE',
  'Supprimer la republication': 'fr-FR'
};
for (const aria in expectedAriaLabels) {
  const found = repost.videoShareRepost && repost.videoShareRepost.some(s =>
    s === "a#icon-element-repost[aria-label='" + aria + "']"
  );
  check('videoShareRepost 包含 ' + expectedAriaLabels[aria] + ' 实测 aria-label="' + aria + '"',
    found);
}

// 4. 关键修复：selector 列表里 **不能**有裸 `[data-e2e='video-share-repost']`（不带 aria-label）
const bareDataE2E = repost.videoShareRepost && repost.videoShareRepost.some(s =>
  s === "[data-e2e='video-share-repost']"
);
check('videoShareRepost 不应包含裸 [data-e2e="video-share-repost"]（无 aria-label 过滤）',
  !bareDataE2E);

// 5. 关键修复：selector 列表里 **不能**有 substring 模糊匹配
// 之前 "[aria-label*='Remove repost']" 这种模糊匹配是错的：
//   - "Remove" 在 ja/ko/zh/de/fr/pt/es 7 种语言里都不存在
//   - 模糊匹配只在 en 下能用，会导致 7 种非英语语言全部"找不到按钮"
const substringMatches = repost.videoShareRepost && repost.videoShareRepost.filter(s =>
  s.indexOf('aria-label*=') >= 0
);
check('videoShareRepost 不应包含 aria-label* 模糊匹配（仅用 = 等值匹配）',
  !substringMatches || substringMatches.length === 0);

// 6. automation.js 必须定义 repostedAriaLabels Set（含 8 种语言实测值）
check('automation.js 定义 repostedAriaLabels 数组/Set',
  /repostedAriaLabels[\s\S]{0,200}Set[\s\S]{0,2000}'Remove repost'/.test(automation)
  || /repostedAriaLabels\s*=\s*new Set\(\[/.test(automation));

// 7. automation.js 8 语言 aria-label 全部实测
const ariaValues = [
  'Remove repost', '移除转发', '再投稿を削除', '리포스트 삭제',
  'Remover republicação', 'Eliminar la publicación compartida',
  'Erneute Veröffentlichung entfernen', 'Supprimer la republication'
];
for (const aria of ariaValues) {
  check('automation.js repostedAriaLabels 包含 "' + aria + '"',
    automation.indexOf("'" + aria + "'") >= 0 || automation.indexOf('"' + aria + '"') >= 0);
}

// 8. 关键修复：_processRepostBatch 调用 isRepostedState() 判定状态
check('automation.js _processRepostBatch 调用 isRepostedState()',
  /_processRepostBatch[\s\S]{0,2000}isRepostedState\s*\(\s*\)/.test(automation));
check('automation.js isRepostedState 检查 a#icon-element-repost',
  /isRepostedState[\s\S]{0,500}a#icon-element-repost/.test(automation));
check('automation.js isRepostedState 用 Set.has 等值匹配 aria-label',
  /isRepostedState[\s\S]{0,800}repostedAriaLabels[\s\S]{0,200}\.has/.test(automation));

// 9. 关键修复：未转发状态时跳过（不点击）
check('automation.js 未转发状态时 skip 到下一个视频',
  /if\s*\(\s*!isRepostedState\s*\(\s*\)\s*\)[\s\S]{0,800}nextBtn/.test(automation));

// 10. 关键修复：取消后验证 aria-label 翻转
check('automation.js 取消后验证 aria-label 翻转（isRepostedState 再次调用）',
  /safeClick[\s\S]{0,500}isRepostedState\s*\(\s*\)/.test(automation));
check('automation.js 验证失败时 retry 一次',
  /isRepostedState\s*\(\s*\)[\s\S]{0,500}retry|isRepostedState\s*\(\s*\)[\s\S]{0,500}safeClick/.test(automation));

// 11. 2026-07-03 P0 修复：移除 shareRepostSelectors / startUrl 死参数
//   死参数 1：shareRepostSelectors — 旧版用于「share dialog 内 [data-e2e='share-repost']」模糊匹配，
//             但该 selector 在已转发 / 未转发状态都命中，会导致 re-repost。
//             新版 _removeRepostFromVideoPage 直接用 aria-label 等值匹配 8 语言「已转发」状态
//             （见 isRepostedState + repostedAriaLabels Set），不再需要模糊匹配参数。
//   死参数 2：startUrl — _processRepostBatch 内部从未读过此值（卡内 anchor click 已经在 caller 完成）。
check('automation.js _processRepostBatch 不再接受 shareRepostSelectors / startUrl 参数',
  /async _processRepostBatch\s*\(\s*maxItems\s*,\s*lastProgressTime\s*\)/.test(automation));
check('automation.js _processLikesBatch 不再接受 browseLikeSelectors / startUrl 参数',
  /async _processLikesBatch\s*\(\s*maxItems\s*,\s*lastProgressTime\s*\)/.test(automation));
check('automation.js _processFavoritesBatch 不再接受 browseFavoriteSelectors / startUrl 参数',
  /async _processFavoritesBatch\s*\(\s*maxItems\s*,\s*lastProgressTime\s*\)/.test(automation));

// 12. 8 语言实测值跟 config 一致（自动化双重保证）
const configAria = (repost.videoShareRepost || [])
  .map(s => {
    const m = s.match(/aria-label='([^']*)'/);
    return m ? m[1] : null;
  })
  .filter(Boolean);
check('config videoShareRepost 解析出的 aria-label 数量 = 8',
  configAria.length === 8);
check('config 8 种 aria-label 全部在 automation.js repostedAriaLabels 中',
  ariaValues.every(a => configAria.indexOf(a) >= 0));

// 13. 2026-07-03 P0 修复守门：_process*Batch 内部必须声明对应 selector 变量
//   历史教训：把 shareRepostSelectors / browseLikeSelectors / browseFavoriteSelectors 从
//   函数签名移除时，只删了参数 + 注释，没在函数体内部重新声明 const，导致
//   "browseLikeSelectors is not defined" ReferenceError 在每个 unlike 失败一次。
//   修法：每个 _process*Batch 内部必须有自己的 const 声明，从 this.config 读。
//   验证：函数体内部能找到对应的 const 声明，紧跟函数签名之后。
function findFnBody(src, name) {
  const m = src.match(new RegExp('async\\s+' + name + '\\s*\\([^)]*\\)\\s*\\{'));
  if (!m) return null;
  const start = m.index + m[0].length;
  let depth = 1, i = start;
  while (i < src.length && depth > 0) {
    const c = src[i];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) break; }
    i++;
  }
  return src.slice(start, i);
}
const repostsBody = findFnBody(automation, '_processRepostBatch');
const likesBody = findFnBody(automation, '_processLikesBatch');
const favoritesBody = findFnBody(automation, '_processFavoritesBatch');
check('_processRepostBatch 函数体可解析', !!repostsBody);
check('_processLikesBatch 函数体可解析', !!likesBody);
check('_processFavoritesBatch 函数体可解析', !!favoritesBody);
// 死参数移除后，函数体必须自己声明对应 const（防 ReferenceError）
check('_processRepostBatch 内部声明 shareRepostSelectors 已不再需要（用 a#icon-element-repost）',
  !/\bshareRepostSelectors\b/.test(repostsBody || ''));
check('_processLikesBatch 内部声明 const browseLikeSelectors',
  /const\s+browseLikeSelectors\s*=/.test(likesBody || ''));
check('_processFavoritesBatch 内部声明 const browseFavoriteSelectors',
  /const\s+browseFavoriteSelectors\s*=/.test(favoritesBody || ''));

// 14. 2026-07-03 实测修订：彻底删除 likes / favorites 内的所有"二次确认"逻辑
//   教训链：
//     1. 之前 P1-4/P1-5 加 aria-pressed="true" 守门 → 错的（TikTok button 不设 aria-pressed）
//        → 改用 selector 重查 + retry → 触发"点两次 = 净 0" bug（用户报"遗留 1 条没删干净"）
//     2. 实测日志时序：
//        12:04:03 [Favorites] Retry: selector still matches after click
//        12:04:04 Clicked unfavorite button #1  ← 第一次 click 实际成功了
//        12:04:06 [Favorites] Skip: selector still matches after retry
//        → 第一次 click 已 unfavorite，但 selector 重查时 DOM 还没翻（500ms-2s 延迟），
//          误判为"状态没翻" → retry 再 click → **重新 favorite 回去**。
//   正确做法：完全删 retry / sanity-check。信任入口 selector 限定状态。
//   守门：函数体内不应再出现 aria-pressed / findElement 重查 / _tikTokRetried / "Retry:" / "Skip:" 守门逻辑。
function stripJsComments(src) {
  return src.split('\n').map(function(line) {
    const idx = line.indexOf('//');
    return idx >= 0 ? line.slice(0, idx) : line;
  }).join('\n');
}
const likesCode = stripJsComments(likesBody || '');
const favoritesCode = stripJsComments(favoritesBody || '');
// a. 不应再有 aria-pressed 二次确认
check('_processLikesBatch 不应再 getAttribute(aria-pressed)',
  !/getAttribute\s*\(\s*['"]aria-pressed['"]\s*\)/.test(likesCode));
check('_processFavoritesBatch 不应再 getAttribute(aria-pressed)',
  !/getAttribute\s*\(\s*['"]aria-pressed['"]\s*\)/.test(favoritesCode));
// b. 不应再 retry（防"点两次 = 净 0" bug）
check('_processLikesBatch 不应再有 _tikTokRetried 重试（防点两次还原）',
  !/_tikTokRetried/.test(likesCode));
check('_processFavoritesBatch 不应再有 _tikTokRetried 重试（防点两次还原）',
  !/_tikTokRetried/.test(favoritesCode));
// c. 不应再重查 selector 做 sanity check click（点完后 findElement + 再 click 是反模式）
check('_processLikesBatch 不应再 findElement 重查 browseLikeSelectors 后再 click',
  !/findElement\s*\(\s*browseLikeSelectors\s*\)/.test(likesCode));
check('_processFavoritesBatch 不应再 findElement 重查 browseFavoriteSelectors 后再 click',
  !/findElement\s*\(\s*browseFavoriteSelectors\s*\)/.test(favoritesCode));
// d. 不应再 hardcode 中英文 retry/skip 守门日志
check('_processLikesBatch 不应再 hardcode [Likes] Retry/Skip 守门日志',
  !/this\.log\(\s*['"]\[Likes\]\s*(Retry|Skip)/.test(likesCode));
check('_processFavoritesBatch 不应再 hardcode [Favorites] Retry/Skip 守门日志',
  !/this\.log\(\s*['"]\[Favorites\]\s*(Retry|Skip)/.test(favoritesCode));

// 15. 2026-07-03 nav-profile 找不到兜底改为 navigateToType 重构（用户指定规则）：
//   旧关键行为（已废弃）：
//     a. multi-type cleanup：找不到 nav-profile → 跳 foryou 让 resume 接管
//     b. single-type cleanup：找不到 nav-profile → clearPendingCleanup + send cleanupError + sendResponse errorCode='NO_NAV_PROFILE'
//   新关键行为（2026-07-03 简化）：
//     navigateToType() 统一入口，navigateToProfileViaSidebar() 找不到 nav-profile 时
//     自动 force page load 跳首页（foryou，首页一定有 sidebar）→ 递归再试 → 永不失败。
//   守门：content.js 中"找 nav-profile"必须走 navigateToProfileViaSidebar 函数（不要在 handler 里散开写 username 提取）。
//     单 type / 多 type 不再分流（都走 navigateToType 即可），不再有 NO_NAV_PROFILE errorCode。
//     findUsernameFallback / getPageURLForType / getCurrentUsername 用于拼 URL 的用法全部不存在。
const contentJsSrc = fs.readFileSync(path.join(__dirname, '../platforms/tiktok-project/scripts/content.js'), 'utf8');
// a. navigateToType 函数存在
check('content.js: navigateToType 函数存在（统一入口）',
  /async function navigateToType\s*\(/.test(contentJsSrc));
// b. navigateToProfileViaSidebar 函数存在
check('content.js: navigateToProfileViaSidebar 函数存在（找 nav-profile.click）',
  /async function navigateToProfileViaSidebar\s*\(/.test(contentJsSrc));
// c. navigateToProfileViaSidebar 找不到 nav-profile → 跳首页（foryou）兜底
check('content.js: navigateToProfileViaSidebar 找不到 nav-profile 跳首页（foryou）兜底',
  contentJsSrc.indexOf('navigateToProfileViaSidebar') >= 0 &&
  contentJsSrc.indexOf("__TikTokEraserForcePageLoad('https://www.tiktok.com/'") >= 0);
// d. findUsernameFallback / getPageURLForType / resolveUsername 全部不存在（过度设计已删）
check('content.js: findUsernameFallback 已删除',
  !/findUsernameFallback/.test(contentJsSrc));
check('content.js: getPageURLForType 已删除',
  !/getPageURLForType/.test(contentJsSrc));
check('content.js: resolveUsername 已删除',
  !/resolveUsername/.test(contentJsSrc));
// e. writeRepostsTargetUrl / readRepostsTargetUrl IPC 不再使用（背景 handler 已删，content.js 也不能再发）
check('content.js: writeRepostsTargetUrl / readRepostsTargetUrl IPC 已删除',
  !/writeRepostsTargetUrl/.test(contentJsSrc) && !/readRepostsTargetUrl/.test(contentJsSrc));
// f. setCurrentUsername 调用已删（tiktok-automation.js 也不应有此方法）
const autoSrc = fs.readFileSync(path.join(__dirname, '../platforms/tiktok-project/scripts/tiktok-automation.js'), 'utf8');
check('content.js + tiktok-automation.js: setCurrentUsername 死代码已清理',
  !/setCurrentUsername/.test(contentJsSrc) && !/setCurrentUsername/.test(autoSrc));

// 16. 2026-07-03 取消 i18n key noNavProfileHint（navigateToType 永不失败，错误文案死路径）
//   旧：noNavProfileHint 在 i18n.js 必须出现 8 次（每个语言块 1 次）
//   新：noNavProfileHint 在 i18n.js 中不存在
const i18nSrc = fs.readFileSync(path.join(__dirname, '../platforms/tiktok-project/scripts/i18n.js'), 'utf8');
check('i18n.js: noNavProfileHint 已清理（navigateToType 永不失败）',
  (i18nSrc.match(/noNavProfileHint/g) || []).length === 0);

// 17. 2026-07-03 multi-type 跳转改为 navigateToType 统一入口（2026-07-03 重构）：
//   旧逻辑（已删）：videos 完成后 profileUrl 为空 → 跳 foryou 让 resume 接管。
//   新逻辑：所有跳转走 navigateToType(type)：
//     - videos/following: 直跳硬编码 URL（不读 username）
//     - reposts/likes/favorites: 走 navigateToProfileViaSidebar() 找 nav-profile.click
//   守门：content.js 中所有 type 跳转路径必须调 navigateToType，而不是直接 force page load foryou 或拼接 @user URL。
check('content.js: videos 完成后跳转走 navigateToType（不再 force page load foryou）',
  !/profileUrl[12]?\s*=\s*getPageURLForType\(['"]reposts['"]\)/.test(contentJsSrc));
check('content.js: startCleanup handler 调 navigateToType 而不是 getPageURLForType',
  /startCleanup[\s\S]{0,3000}?navigateToType\(/.test(contentJsSrc));
check('content.js: checkAndResumePendingCleanup 调 navigateToType',
  /checkAndResumePendingCleanup[\s\S]{0,3000}?navigateToType\(/.test(contentJsSrc));

// 18. 2026-07-03 daily limit 路径清理 stale state（修复 progress card "0/0" 残留）：
//   关键行为：daily limit reached 路径（remaining <= 0）必须显式清 state.totalItems=0
//   + 隐藏 progress card，避免下次进入时显示 stale "X/5000"。
const sidepanelSrc = fs.readFileSync(path.join(ROOT, 'platforms/tiktok-project/src/sidepanel.js'), 'utf8');
check('sidepanel.js: daily limit 路径必须显式清 state.totalItems=0 + 隐藏 progress card',
  /remaining\s*<=\s*0[\s\S]{0,800}state\.totalItems\s*=\s*0[\s\S]{0,800}progressCard[\s\S]{0,300}className\s*=\s*'progress-card'/.test(sidepanelSrc));

// 19. 2026-07-03 daily limit 路径 addLog 副作用抑制（修复 addLog 重新激活 progress card "0/0"）：
//   旧 bug：line 882 隐藏 progress card 后调 addLog(t('dailyLimitReached'))，
//     addLog 内部 !isRunning && !isPaused 触发重新激活成 'progress-card active'，覆盖 daily limit reset
//     → 用户看到 progress card "复活" 显示 0/0。
//   新逻辑：daily limit 路径 addLog 前 state.isRunning=true 抑制副作用，addLog 后 state.isRunning=false 恢复。
//   守门：daily limit 路径（if (remaining <= 0) {...}）内 addLog 调用必须在 state.isRunning=true 之后、state.isRunning=false 之前。
// 2026-07-03 修：regex 必须识别 `if (remaining <= 0) {` 结构，不是 `remaining <= 0 {`。
const dailyLimitBlockMatch = sidepanelSrc.match(/if\s*\(\s*remaining\s*<=\s*0\s*\)\s*\{[\s\S]{0,3000}?showTipModal\([\s\S]{0,200}?\)\s*;\s*return\s*;\s*\}/);
check('sidepanel.js: daily limit 路径 addLog 必须在 state.isRunning=true 之后调用（抑制副作用）',
  dailyLimitBlockMatch !== null &&
  /state\.isRunning\s*=\s*true\s*;[\s\S]{0,500}?addLog\(\s*t\(['"]dailyLimitReached['"]/.test(dailyLimitBlockMatch[0]));
check('sidepanel.js: daily limit 路径 addLog 之后必须 state.isRunning=false 恢复',
  dailyLimitBlockMatch !== null &&
  /addLog\(\s*t\(['"]dailyLimitReached['"][\s\S]{0,500}?state\.isRunning\s*=\s*false\s*;/.test(dailyLimitBlockMatch[0]));

// 20. 2026-07-03 setupInjectorCallbacks.onComplete 改造（multi-type 卡死修复）：
//   旧逻辑：startCleanup/auto-resume 路径手动屏蔽 onComplete（injector.onComplete = function() {}），
//     → sidepanel 永远收不到 cleanupComplete，UI 卡 isRunning=true + progress 0/N。
//   新逻辑：onComplete 总是同步发 cleanupComplete（不读 session async），sidepanel 用 multi-type
//     counter 守护是否真正完成。
//   守门：content.js setupInjectorCallbacks 中 onComplete 不能包含 chrome.runtime.sendMessage 异步读 pending。
//   也不能包含 `injector.onComplete = function() {}` 这种手动屏蔽。
check('content.js: setupInjectorCallbacks.onComplete 不应包含异步读 pendingCleanup（避免 forcePageLoad 销毁 cb 跑不完）',
  !/ij\.onComplete\s*=\s*function[\s\S]{0,500}?chrome\.runtime\.sendMessage\(\s*\{\s*target\s*:\s*['"]readPendingCleanup['"]/.test(contentJsSrc));
check('content.js: startCleanup 路径不应再手动屏蔽 onComplete (injector.onComplete = function() {})',
  !/var\s+savedOnComplete\s*=\s*injector\.onComplete\s*;[\s\S]{0,200}?injector\.onComplete\s*=\s*function\s*\(\s*\)\s*\{\s*\}\s*;/.test(contentJsSrc));
check('content.js: 不应再有 __TikTokEraserSavedOnComplete 全局变量（已废弃）',
  !/__TikTokEraserSavedOnComplete/.test(contentJsSrc));
check('content.js: auto-resume 路径不应再手动屏蔽 onComplete (defaultOnComplete 模式已废弃)',
  !/var\s+defaultOnComplete\s*=\s*injector\.onComplete/.test(contentJsSrc));

// 21. 2026-07-03 sidepanel multi-type counter 守护 onCleanupComplete：
//   旧 bug：每次 startCleanup 调用结束都发 cleanupComplete，多 type 拆分中间步骤也会让 sidepanel
//     进入"完成"状态（设 isRunning=false + 显示 summary），但实际还有 type 没跑。
//   新逻辑：sidepanel 维护 completedTypesCount 计数器，只有当 === cleanupOptions.types.length 时
//     才走 onCleanupComplete。
//   守门：sidepanel.js cleanupComplete 处理必须先累加 completedTypesCount + 比较 totalTypes。
check('sidepanel.js: state.completedTypesCount 必须初始化为 0',
  /completedTypesCount\s*:\s*0/.test(sidepanelSrc));
check('sidepanel.js: startCleanup 时必须重置 completedTypesCount=0',
  /state\.limitReached\s*=\s*false\s*;[\s\S]{0,200}?state\.completedTypesCount\s*=\s*0/.test(sidepanelSrc));
check('sidepanel.js: cleanupComplete 处理必须累加 completedTypesCount',
  /cleanupComplete[\s\S]{0,500}?state\.completedTypesCount\s*=\s*\(state\.completedTypesCount\s*\|\|\s*0\)\s*\+\s*1/.test(sidepanelSrc));
check('sidepanel.js: completedTypesCount < totalTypes 时必须跳过 onCleanupComplete（return）',
  /state\.completedTypesCount\s*<\s*totalTypes[\s\S]{0,300}?return\s*;/.test(sidepanelSrc));
check('sidepanel.js: completedTypesCount >= totalTypes 时才走 onCleanupComplete',
  /state\.completedTypesCount\s*<\s*totalTypes[\s\S]{0,500}?onCleanupComplete\(\)/.test(sidepanelSrc));

// 22. 2026-07-03 i18n.js typeProgressUpdate 必须 8 语言齐备：
//   用途：sidepanel 在 multi-type 中间步骤 cleanupComplete 时 addLog(typeProgressUpdate, 'info')
//     告诉用户"已完成 X/Y 种类型，正在加载下一种"。
check('i18n.js: typeProgressUpdate 至少 8 个实例（8 语言各 1 个）',
  (i18nSrc.match(/typeProgressUpdate\s*:/g) || []).length >= 8);
check('i18n.js: typeProgressUpdate 必须含 {done} 和 {total} 占位符',
  /typeProgressUpdate:\s*['"][^'"]*\{done\}[^'"]*\{total\}[^'"]*['"]/.test(i18nSrc));

// 23. 2026-07-04 clickProfileTab 统一入口（修复从 / 主页入口不点 tab 的 bug）：
//   用户报：在 tiktok.com 主页点 Start Cleanup 跳到 /@user 后不点 tab，
//   但在 /@user 直接点 Start Cleanup 会点 tab。
//   根因：旧逻辑 handleStartCleanup + checkAndResumePendingCleanup 各有一个 tabMap 块，
//     用 document.querySelector 同步查 tab（SPA race 时漏点），且 navigateToType
//     只负责"跳到 /@user"不管点 tab。
//   修法：
//     1. content.js 新增 clickProfileTab(type) → waitForElement(20s) + click
//     2. navigateToType 对 reposts/likes/favorites 调 clickProfileTab
//     3. handleStartCleanup + checkAndResumePendingCleanup 删 tabMap 块
//     4. handleStartCleanup + checkAndResumePendingCleanup 在 navigateToType 后
//        若 firstType 是 profile 类则 matchedType=firstType 走 cleanup 分支
// a. clickProfileTab 函数存在
check('content.js: clickProfileTab 函数存在（统一入口）',
  /async function clickProfileTab\s*\(\s*type\s*\)\s*\{/.test(contentJsSrc));
// b. clickProfileTab 内部用 waitForElement（不能用 document.querySelector 同步查）
const clickProfileTabBodyMatch = contentJsSrc.match(/async function clickProfileTab\s*\(\s*type\s*\)\s*\{([\s\S]*?)\n  \}/);
const clickProfileTabBody = clickProfileTabBodyMatch ? clickProfileTabBodyMatch[1] : '';
check('content.js: clickProfileTab 内部用 waitForElement 等 tab（防 SPA race 漏点）',
  /waitForElement\s*\(/.test(clickProfileTabBody));
check('content.js: clickProfileTab 超时阈值 20000ms（用户 spec：等页面加载完最多 20s）',
  /waitForElement\s*\(\s*selector\s*,\s*20000\s*\)/.test(clickProfileTabBody));
// c. clickProfileTab 调 .click() 真实点击
check('content.js: clickProfileTab 调用 .click()',
  /tabEl\.click\s*\(\s*\)/.test(clickProfileTabBody));
// d. clickProfileTab 从 config.getProfileTabs() 读 selector（不硬编码）
check('content.js: clickProfileTab 通过 window.TikTokEraserConfig.getProfileTabs() 读 selector（不硬编码）',
  /TikTokEraserConfig\.getProfileTabs\s*\(\s*\)/.test(clickProfileTabBody));
// e. navigateToType 内部对 reposts/likes/favorites 调 clickProfileTab
const navigateToTypeBodyMatch = contentJsSrc.match(/async function navigateToType\s*\(\s*type\s*\)\s*\{([\s\S]*?)\n  \}/);
const navigateToTypeBody = navigateToTypeBodyMatch ? navigateToTypeBodyMatch[1] : '';
check('content.js: navigateToType 对 reposts/likes/favorites 调 clickProfileTab',
  /type\s*===\s*['"]reposts['"]/.test(navigateToTypeBody) &&
  /type\s*===\s*['"]likes['"]/.test(navigateToTypeBody) &&
  /type\s*===\s*['"]favorites['"]/.test(navigateToTypeBody) &&
  /clickProfileTab\s*\(\s*type\s*\)/.test(navigateToTypeBody));
// f. handleStartCleanup 不应再有 tabMap 块（document.querySelector 同步查 tab → SPA race 漏点）
const handleStartCleanupBodyMatch = contentJsSrc.match(/message\.type\s*===\s*['"]startCleanup['"][\s\S]*?if\s*\(matchedType\)\s*\{/);
const handleStartCleanupBody = handleStartCleanupBodyMatch ? handleStartCleanupBodyMatch[0] : '';
check('content.js: handleStartCleanup 已删除 tabMap 块（document.querySelector 同步查 tab）',
  !/const\s+tabMap\s*=/.test(handleStartCleanupBody) &&
  !/if\s*\(\s*!matchedType\s*&&\s*isProfilePage\s*\)\s*\{[\s\S]{0,800}?tabMap/.test(handleStartCleanupBody));
// g. handleStartCleanup 在 navigateToType 后给 profile 类设 matchedType（让 cleanup 跑起来）
check('content.js: handleStartCleanup navigateToType 后给 reposts/likes/favorites 设 matchedType',
  /await\s+navigateToType\s*\(\s*firstType\s*\)[\s\S]{0,500}?firstType\s*===\s*['"]reposts['"][\s\S]{0,300}?matchedType\s*=\s*firstType/.test(handleStartCleanupBody));
// h. checkAndResumePendingCleanup 不应再有 tabMap 块
// 提取范围要超过第一个 if (!matchedType) {，包含 navigateToType 块（避免第一次匹配截断在 navigateToType 之前）
// 用 "matchedType = types[0];" 锚到实际代码（注释里也可能出现，优先取最近的可执行语句）
const checkAndResumeBodyMatch = contentJsSrc.match(/async function checkAndResumePendingCleanup\s*\(\s*\)\s*\{[\s\S]*?if\s*\(\s*!matchedType\s*\)\s*\{[\s\S]*?await\s+navigateToType\s*\(\s*types\[0\]\s*\)[\s\S]*?matchedType\s*=\s*types\[0]\s*;/);
const checkAndResumeBody = checkAndResumeBodyMatch ? checkAndResumeBodyMatch[0] : '';
check('content.js: checkAndResumePendingCleanup 已删除 tabMap 块',
  !/const\s+tabMap\s*=/.test(checkAndResumeBody) &&
  !/if\s*\(\s*!matchedType\s*&&\s*isProfilePage\s*\)\s*\{[\s\S]{0,800}?tabMap/.test(checkAndResumeBody));
// i. checkAndResumePendingCleanup 在 navigateToType 后给 profile 类设 matchedType
check('content.js: checkAndResumePendingCleanup navigateToType 后给 reposts/likes/favorites 设 matchedType',
  /await\s+navigateToType\s*\(\s*types\[0\]\s*\)/.test(checkAndResumeBody) &&
  /types\[0\]\s*===\s*['"]reposts['"]/.test(checkAndResumeBody) &&
  /matchedType\s*=\s*types\[0\]/.test(checkAndResumeBody));
// j. 死代码清理：RESERVED_PATHS 应当被删除（按 memory 2026-07-03 早就该删，漏网了）
check('content.js: RESERVED_PATHS 死代码已清理',
  !/const\s+RESERVED_PATHS\s*=/.test(contentJsSrc));

// 24. 2026-07-04 multi-type 流程修：跑完一个 type 后 force page load 到 tiktok.com 首页
//   用户报：选中 3 个 Type（reposts+likes+favorites），跑完 reposts 后停在 video player，
//   type 2 没启动。diagnostic log 显示 "Type 1 of 3 done, loading next..." 后没动静。
//   根因：旧逻辑 handleStartCleanup / checkAndResumePendingCleanup 跑完 matchedType 后
//     调 navigateToType(remainingTypes[0])，对 profile 类（reposts/likes/favorites）
//     走 SPA nav，不销毁 page → 新 content script 不会启动 → 下个 type 永远不跑。
//   修法：跑完 matchedType 后 force page load 到 tiktok.com 首页（用户 spec：
//     "处理完这个Type后，如果还有Type没处理，则跳转到tiktok.com首页，继续下一轮"）。
//   新 content script 在首页启动 → checkAndResumePendingCleanup 接管 → 跳到下个 type 的目标页。
// a. handleStartCleanup matchedType 分支：跑完 startCleanup 后 force page load 到 tiktok.com
check('content.js: handleStartCleanup 跑完 startCleanup 后 force page load 到 tiktok.com 首页（不再调 navigateToType）',
  /if\s*\(\s*document\.readyState\s*===\s*['"]complete['"]\s*\)\s*\{[\s\S]*?await\s+injector\.startCleanup[\s\S]*?if\s*\(\s*types\.length\s*>\s*1\s*\)\s*\{[\s\S]*?__TikTokEraserForcePageLoad\s*\(\s*['"]https:\/\/www\.tiktok\.com\/['"]\s*\)/.test(contentJsSrc) &&
  // 同时不该再调 navigateToType 跳下个 type
  !/await\s+injector\.startCleanup[\s\S]{0,500}?if\s*\(\s*types\.length\s*>\s*1\s*\)\s*\{[\s\S]{0,200}?await\s+navigateToType\s*\(\s*remainingTypes\[0\]\s*\)/.test(contentJsSrc));
// b. handleStartCleanup 还在 load-event path 上镜像这个行为
check('content.js: handleStartCleanup load-event path 也用 force page load 不用 navigateToType',
  /window\.addEventListener\s*\(\s*['"]load['"]\s*,\s*async\s+function[\s\S]*?await\s+injector\.startCleanup[\s\S]*?__TikTokEraserForcePageLoad\s*\(\s*['"]https:\/\/www\.tiktok\.com\/['"]\s*\)/.test(contentJsSrc));
// c. checkAndResumePendingCleanup matchedType 分支：跑完 startCleanup 后 force page load
check('content.js: checkAndResumePendingCleanup 跑完 startCleanup 后 force page load 到 tiktok.com 首页',
  /await\s+injector\.startCleanup\s*\(\s*optionsForCurrent\s*\)[\s\S]*?if\s*\(\s*remainingTypes\.length\s*>\s*0\s*\)\s*\{[\s\S]*?__TikTokEraserForcePageLoad\s*\(\s*['"]https:\/\/www\.tiktok\.com\/['"]\s*\)/.test(contentJsSrc) &&
  // 同时不该再调 navigateToType 跳下个 type
  !/await\s+injector\.startCleanup\s*\(\s*optionsForCurrent\s*\)[\s\S]{0,500}?if\s*\(\s*remainingTypes\.length\s*>\s*0\s*\)\s*\{[\s\S]{0,200}?await\s+navigateToType\s*\(\s*remainingTypes\[0\]\s*\)/.test(contentJsSrc));

// 25. 2026-07-04 multi-type 流程卡死 bug 修：__TikTokEraserForcePageLoad 必须用
//   window.location.href 同步触发 page 销毁，**不能**用 fire-and-forget IPC 让 background
//   调 chrome.tabs.update（MV3 service worker 唤醒延迟几秒 → tab 没真的跳走 → user
//   看到"停在了最后一个视频播放那"）。
// 守门铁律：forcePageLoad 实现必须用 window.location.href 作为首选，chrome.tabs.update
//   只能作为兜底。
const forcePageLoadMatch = contentJsSrc.match(
  /window\.__TikTokEraserForcePageLoad\s*=\s*function\s*\(\s*url\s*\)\s*\{([\s\S]*?)\n\s*\};/
);
check('content.js: __TikTokEraserForcePageLoad 函数存在', !!forcePageLoadMatch);
const forcePageLoadBody = forcePageLoadMatch ? forcePageLoadMatch[1] : '';
check('content.js: __TikTokEraserForcePageLoad 首选 window.location.href = url（同步、可靠、不依赖 IPC）',
  /window\.location\.href\s*=\s*url/.test(forcePageLoadBody));
// 兜底必须保留 chrome.tabs.update（如果 window.location.href 抛错时）
check('content.js: __TikTokEraserForcePageLoad 保留 chrome.tabs.update 作为兜底',
  /chrome\.runtime\.sendMessage\s*\(\s*\{\s*target:\s*['"]forceNavigation['"]/.test(forcePageLoadBody) ||
  /chrome\.runtime\.sendMessage.*forceNavigation/s.test(forcePageLoadBody));
// 关键守门：fire-and-forget IPC（只有 sendMessage 没有 location.href）不能是首选
// 修法是 location.href 在 sendMessage 之前
const windowLocationIdx = forcePageLoadBody.indexOf('window.location.href');
const sendMessageIdx = forcePageLoadBody.indexOf('chrome.runtime.sendMessage');
check('content.js: __TikTokEraserForcePageLoad 中 window.location.href 必须出现在 chrome.runtime.sendMessage 之前（首要路径）',
  windowLocationIdx >= 0 && sendMessageIdx > windowLocationIdx);

// 26. 2026-07-04 Following 空状态假成功 bug 修：用户 0 关注时，
//   旧 unfollowButtons selector（如 `button[aria-label*='Following']`）会误匹配**侧边栏
//   Following 导航按钮**本身（aria-label='Following'），点击无 confirm dialog → processedCount++
//   → 假成功「Unfollowed #1 (no confirm dialog)」。
// 修法（双层防御）：
//   A) 所有 unfollowButtons selector 必须以 `[data-e2e='user-following-item']` 开头
//      强制只在真正的 following 列表项内查找。
//   B) processFollowing 函数体内必须有 0 user-following-item 早退检查 + 触发 onTypeComplete。
// 铁律：未登录或 0 关注时，processedCount 必须保持原值，**不能**假成功。
const following = (config.selectors && config.selectors.following) || {};
const unfollowBtns = Array.isArray(following.unfollowButtons) ? following.unfollowButtons : [];
check('26a. config.selectors.following.unfollowButtons 存在且 >= 1 个',
  unfollowBtns.length >= 1);
check('26b. 所有 unfollowButtons selector 必须在 [data-e2e=user-following-item] 容器内（避免误匹配侧边栏 nav）',
  unfollowBtns.length > 0 && unfollowBtns.every(s => s.indexOf("[data-e2e='user-following-item']") === 0));
check('26c. 不允许裸 button[aria-label*=\'Following\'] selector（会误匹配侧边栏 nav）',
  !unfollowBtns.some(s => /^button\[aria-label\*=['"]Following['"]\]/.test(s.trim())));
check('26d. 不允许裸 button[data-e2e=\'follow-button\'] selector（会误匹配 card-followbutton Follow 按钮）',
  !unfollowBtns.some(s => s.trim() === "button[data-e2e='follow-button']"));

// 26B. processFollowing 函数体内必须有 0 user-following-item 早退检查
const processFollowingMatch = automation.match(
  /async\s+processFollowing\s*\(\s*maxItems\s*\)\s*\{([\s\S]*?)\n\s{4}\}/,
);
check('26e. tiktok-automation.js: processFollowing 函数存在', !!processFollowingMatch);
const processFollowingBody = processFollowingMatch ? processFollowingMatch[1] : '';
check('26f. processFollowing 体内有 user-following-item selector 引用（硬编码或 config 均可）',
  /\[data-e2e=['"]user-following-item['"]\]/.test(processFollowingBody));
// 早退必须调用 onTypeComplete 让多 type 流程继续
const findElementsIdx = processFollowingBody.indexOf('findElements(');
const onTypeCompleteIdx = processFollowingBody.indexOf('onTypeComplete');
const noMoreFollowingIdx = processFollowingBody.indexOf('noMoreFollowing');
check('26g. processFollowing 早退分支 findElements → onTypeComplete → log noMoreFollowing 顺序正确',
  findElementsIdx >= 0 && onTypeCompleteIdx > findElementsIdx && noMoreFollowingIdx > findElementsIdx);

// 27. 2026-07-04 翻页守门：所有 4 个 processXxx 必须有 scrollToBottom 调用，
//   防止「删完第 1 页就停」bug。结构要求：
//     - while (this.isRunning && this.processedCount < maxItems && ...)
//     - pending.length === 0 → emptyScrolls++ → scrollToBottom() → continue
//     - emptyScrolls > maxEmptyScrolls → break
//     - !hasMore（scrollToBottom 返回 false）→ break
const processFuncs = [
  { name: 'processReposts', start: 978 },
  { name: 'processLikes', start: 1255 },
  { name: 'processFavorites', start: 1474 },
  { name: 'processFollowing', start: 1686 }
];
for (const pf of processFuncs) {
  // 截取从 processXxx 起始到下一个 processXxx 或文件末尾
  const nextStarts = processFuncs.map(p => p.start).filter(s => s > pf.start);
  const endLine = nextStarts.length > 0 ? Math.min(...nextStarts) : Infinity;
  const lines = automation.split('\n');
  const body = lines.slice(pf.start - 1, endLine === Infinity ? lines.length : endLine - 1).join('\n');
  const hasScroll = /scrollToBottom\s*\(/.test(body);
  const hasWhile = /while\s*\(\s*this\.isRunning\s*&&\s*this\.processedCount\s*<\s*maxItems\s*&&/.test(body);
  const hasEmptyScrolls = /emptyScrolls\s*>\s*maxEmptyScrolls/.test(body);
  const hasHasMoreBreak = /scrollToBottom\s*\(\s*\)\s*;[\s\S]{0,200}?if\s*\(\s*!\s*hasMore\s*\)\s*\{[\s\S]{0,200}?break/.test(body);
  check(`27a. ${pf.name} 函数体必须有 while 循环 (isRunning && processedCount<maxItems)`, hasWhile);
  check(`27b. ${pf.name} 函数体必须有 scrollToBottom() 翻页调用`, hasScroll);
  check(`27c. ${pf.name} 函数体必须有 emptyScrolls > maxEmptyScrolls 退出条件`, hasEmptyScrolls);
  check(`27d. ${pf.name} 函数体必须有 !hasMore 退出条件（scrollToBottom 返 false）`, hasHasMoreBreak);
}

console.log('');
console.log('  通过: ' + passed + '/' + (passed + failed));
if (failed > 0) {
  console.log('[FAIL]');
  process.exit(1);
}
