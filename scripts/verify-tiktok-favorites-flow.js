// verify-tiktok-favorites-flow.js
// 守住 TikTok Favorites 删除流程重写（2026-07-02）：
//   - 从"1 步点已收藏图标"改为镜像 processLikes 的 2 步流程
//     步骤 1: Profile Favorites tab → 卡片 anchor click → 视频页
//     步骤 2: 视频页上点 [data-e2e='favorite-icon']（不是 'browse-favorite-icon'）
//   - 添加 _loadDeletedFavoritesUrls / _saveDeletedFavoritesUrls 持久化跨页 resume
//   - 添加 _processFavoritesBatch 子方法处理 video page 循环
// 8 语言 i18n 文本 `favoritesDeleteComplete` 已加全。
// 实证依据：2026-07-02 MCP 浏览器对 ping.xiang1 For You 页读取 button DOM，
//   实际 data-e2e = 'favorite-icon'（不是 'browse-favorite-icon'）。

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
const configRemote = JSON.parse(fs.readFileSync(
  path.join(ROOT, 'platforms/tiktok-project/src/config/tiktok-remote-example.json'), 'utf8'));
const automation = fs.readFileSync(
  path.join(ROOT, 'platforms/tiktok-project/scripts/tiktok-automation.js'), 'utf8');
const content = fs.readFileSync(
  path.join(ROOT, 'platforms/tiktok-project/scripts/content.js'), 'utf8');
const chromeBg = fs.readFileSync(
  path.join(ROOT, 'platforms/tiktok-project/chrome-source/background.js'), 'utf8');
const edgeBg = fs.readFileSync(
  path.join(ROOT, 'platforms/tiktok-project/edge-source/background.js'), 'utf8');

const favorite = (config.selectors && config.selectors.favorite) || {};

console.log('=== TikTok Favorites flow (mirror processLikes) ===');

// 1. config.selectors.favorite.favoriteItem 存在
check('config.selectors.favorite.favoriteItem 存在',
  Array.isArray(favorite.favoriteItem));
check('config.selectors.favorite.favoriteItem 含 [data-e2e="favorites-item"]',
  favorite.favoriteItem && favorite.favoriteItem.indexOf("[data-e2e='favorites-item']") >= 0);

// 2. config.selectors.favorite.videoBrowseFavoriteIcon 存在
check('config.selectors.favorite.videoBrowseFavoriteIcon 存在',
  Array.isArray(favorite.videoBrowseFavoriteIcon));
check('config.selectors.favorite.videoBrowseFavoriteIcon 至少 5 个 selector',
  favorite.videoBrowseFavoriteIcon && favorite.videoBrowseFavoriteIcon.length >= 5);

// 3. 关键修正：primary selector 必须是 [data-e2e='browse-favorite-icon']
// MCP 实证 2026-07-02 (用户截图+ ping.xiang1 登录态 video page)：
//   - 已登录账号已收藏的视频，data-e2e 是 'browse-favorite-icon'（**不是** 'favorite-icon'）
//   - 'favorite-icon' 出现在 nav bar / profile 区等其他位置，不是 video action bar
//   - parent 是 <button>，SPAN data-e2e，React onClick 绑在 button 上
check('videoBrowseFavoriteIcon primary selector 是 [data-e2e="browse-favorite-icon"]',
  favorite.videoBrowseFavoriteIcon && favorite.videoBrowseFavoriteIcon[0] === "[data-e2e='browse-favorite-icon']");

// 4. videoBrowseFavoriteIcon 列表里 **不能**出现单纯的 "favorite-icon"（错的选择器）
//    注：原错配置 [data-e2e='favorite-icon'] 会命中 nav bar / profile 区域的元素，
//    而不是 video action bar 的书签按钮。
const hasWrongSelector = favorite.videoBrowseFavoriteIcon && favorite.videoBrowseFavoriteIcon.some(s =>
  s === "[data-e2e='favorite-icon']"
);
check('videoBrowseFavoriteIcon 不应以 [data-e2e=\'favorite-icon\'] 作为裸 selector（错位置）',
  !hasWrongSelector);

// 5. fallback selector 覆盖 8 语言
const langPatterns = ['Favorited', 'Favorites', '已收藏', 'お気に入り', '즐겨찾기', 'Favorito', 'Favoris'];
for (const pattern of langPatterns) {
  const found = favorite.videoBrowseFavoriteIcon && favorite.videoBrowseFavoriteIcon.some(s =>
    s.indexOf("aria-label*='" + pattern + "'") >= 0
  );
  check('videoBrowseFavoriteIcon 包含 ' + pattern + ' 语言 fallback',
    found);
}

// 6. 两个 config 文件 byte-level 一致
const localFav = JSON.stringify(config.selectors.favorite);
const remoteFav = JSON.stringify(configRemote.selectors.favorite);
check('default.json 和 tiktok-remote-example.json 的 favorite 配置 byte-level 一致',
  localFav === remoteFav);

// 6b. Following tab 守门（MCP 实证 2026-07-02：TikTok 2026 Following 是独立路由 /following，
//     入口是侧边栏的 <a data-e2e="nav-following">，<span data-e2e="following"> 是 Profile 头部统计
//     文本不可点击。'following-tab' 永远找不到 → 修复：profileTabs.Following 必须是 nav-following）
const profileTabsLocal = (config.selectors.common && config.selectors.common.profileTabs) || {};
const profileTabsRemote = (configRemote.selectors.common && configRemote.selectors.common.profileTabs) || {};
check('profileTabs.Following = [data-e2e="nav-following"]（MCP 实证，侧边栏 a 链接，TikTok 2026 独立路由）',
  profileTabsLocal.Following === "[data-e2e='nav-following']");
check('profileTabs.Following 不应是 [data-e2e="following-tab"]（永远找不到）',
  profileTabsLocal.Following !== "[data-e2e='following-tab']");
check('profileTabs.Following 不应是 [data-e2e="following"]（那是 header 统计区 SPAN 不可点击）',
  profileTabsLocal.Following !== "[data-e2e='following']");
check('profileTabs.Following default.json 和 tiktok-remote-example.json byte-level 一致',
  profileTabsLocal.Following === profileTabsRemote.Following);
check('automation.js _activateProfileTab 命中 <a> 元素时直接 click（不要用 aria-selected 判断）',
  /_activateProfileTab[\s\S]{0,3000}tagName\s*===\s*['"]A['"][\s\S]{0,500}safeClick[\s\S]{0,300}return\s+true/.test(automation));

// 6c. Following URL 守门（MCP 实证 2026-07-02）：
//     - content.js navigateToType('following') 必须跳顶层 'https://www.tiktok.com/following'
//       （/@user/following 路径 TikTok 不识别，会被 redirect 到 foryou）
//     - content.js detectPageType 必须识别顶层 /following 路由
//   2026-07-03 重构：getPageURLForType 已删，navigateToType 是新统一入口。
check('content.js navigateToType("following") 跳顶层 https://www.tiktok.com/following（不带 /@user/）',
  /navigateToType[\s\S]{0,500}type\s*===\s*['"]following['"][\s\S]{0,200}https:\/\/www\.tiktok\.com\/following/.test(content));
check('content.js 不应再返回 /@user/following 路径（TikTok 不识别）',
  !/['"]https:\/\/www\.tiktok\.com\/@['"]\s*\+\s*u\s*\+\s*['"]\/following['"]/.test(content));
check('content.js detectPageType 识别顶层 /following 路由（/^\\/following\\/?$/）',
  /detectPageType[\s\S]{0,2000}if\s*\(\s*\/\^\\\/following\\\/\?\$\//.test(content));
check('content.js detectPageType 不再使用 /@user/following 路径判定 following 页（TikTok 不识别）',
  !/detectPageType[\s\S]{0,2000}\/\^\\\/@[A-Za-z0-9._-]+\\\/following\$/.test(content));


// 7. automation.js 必须实现 processFavorites 2 步流程
check('automation.js 定义 processFavorites 方法',
  /async\s+processFavorites\s*\(/.test(automation));

// 8. processFavorites 流程顺序：waitForContentStable → loadDeletedUrls → activateTab → sleep → processCards
const pfIdx = automation.indexOf('async processFavorites');
const pfEndIdx = automation.indexOf('async _processFavoritesBatch');
const pfBlock = automation.slice(pfIdx, pfEndIdx);

check('processFavorites 先 waitForContentStable',
  /processFavorites[\s\S]{0,2000}waitForContentStable/.test(pfBlock));
check('processFavorites waitForContentStable 等待 favorites-item（MCP 实证正确 selector，来源 default.json.waitForContentStableByType.favorites）',
  /processFavorites[\s\S]{0,2000}waitForContentStable\([\s\S]{0,200}_stableSelectorsFor\(\s*['"]favorites['"]\s*\)/.test(pfBlock));
check('processFavorites 不再调用 _loadDeletedFavoritesUrls（URL 列表机制已取消）',
  !/processFavorites[\s\S]{0,4000}_loadDeletedFavoritesUrls/.test(pfBlock));
check('processFavorites 调用 _activateProfileTab("Favorites")',
  /processFavorites[\s\S]{0,4000}_activateProfileTab\(\s*['"]Favorites['"]\s*\)/.test(pfBlock));
check('processFavorites 找到 card 后 click anchor 进 video 页',
  /processFavorites[\s\S]{0,6000}safeClick\(\s*anchor/.test(pfBlock));
check('processFavorites 调用 _processFavoritesBatch',
  /processFavorites[\s\S]{0,7000}_processFavoritesBatch/.test(pfBlock));

// 8b. 关键 regression 守门：代码里不应残留错误的 user-favorite-item selector
check('automation.js 不应残留 user-favorite-item 错 selector（卡死的根因）',
  automation.indexOf("user-favorite-item") < 0);
check('default.json articleContainers 不应残留 user-favorite-item',
  JSON.stringify(config.selectors.common.articleContainers).indexOf("user-favorite-item") < 0);

// 8c. 多 type state machine 守门（2026-07-02 修复）：
//   手动 startCleanup 必须只跑 matchedType，remaining 写 pending + force page load
//   让 resume 接管。否则 processXxx 内部 SPA 跳转不销毁 context，
//   for 循环 type B 时 page state 还是 type A 离开时的 → processTypeB 卡住/失败。
check('content.js 手动 startCleanup 入口只在 types.length>1 时调 updatePendingCleanup',
  /types\.length\s*>\s*1[\s\S]{0,800}updatePendingCleanup[\s\S]{0,500}pending:\s*\{\s*types:\s*remainingTypes/.test(content));
check('content.js 手动 startCleanup 入口写 types: [matchedType]（单 type，不传整个数组）',
  /types:\s*\[matchedType\]/.test(content));
//   2026-07-04 重构：跑完后 force page load 到 tiktok.com 首页（新 content script 接管）。
//   旧：navigateToType(remainingTypes[0]) 走 SPA 对 profile 类卡住。
//   新：force page load → 新 content script 在首页启动 → checkAndResumePendingCleanup 接管。
check('content.js 手动 startCleanup 入口跑完后 force page load 到 tiktok.com 首页（不再 navigateToType）',
  /if\s*\(\s*types\.length\s*>\s*1\s*\)\s*\{[\s\S]{0,500}__TikTokEraserForcePageLoad\s*\(\s*['"]https:\/\/www\.tiktok\.com\/['"]\s*\)/.test(content) &&
  // 不应再调 navigateToType 跳下个 type
  !/if\s*\(\s*types\.length\s*>\s*1\s*\)\s*\{[\s\S]{0,300}await\s+navigateToType\(\s*remainingTypes\[0\]\s*\)/.test(content));

// 8d. background.js cleanupComplete 不再自动清 pendingCleanup（2026-07-02 修复）：
//   手动 startCleanup 跑完一个 type → onComplete → cleanupComplete。
//   如果 background 在这里 remove pendingCleanup，会清掉 content.js
//   之前为 remainingTypes 写的 pending → multi-type 真的停止。
//   由 content.js 多 type state machine 显式管理 pendingCleanup 生命周期。
check('background.js 不应在 cleanupComplete handler 里 remove pendingCleanup',
  !/cleanupComplete[\s\S]{0,200}chrome\.storage\.session\.remove\(['"]pendingCleanup['"]\)/.test(chromeBg));
check('background.js 不应在 cleanupComplete handler 里 remove pendingCleanup（edge 同步）',
  !/cleanupComplete[\s\S]{0,200}chrome\.storage\.session\.remove\(['"]pendingCleanup['"]\)/.test(edgeBg));
check('content.js 多 type state machine 在剩余 types 跑完后才 clearPendingCleanup（resume 路径）',
  /if\s*\(\s*remainingTypes\.length\s*>\s*0\s*\)\s*\{[\s\S]{0,1500}chrome\.runtime\.sendMessage\(\s*\{\s*target:\s*['"]clearPendingCleanup['"]\s*\}/.test(content));

// 8e. sidepanel 状态机守门（2026-07-04 重构后）：
//   旧（2026-07-02）：手动 startCleanup 临时屏蔽 injector.onComplete 让多 type 中间不发 cleanupComplete。
//     → bug：last type 跑完时 onComplete 已被屏蔽，sidepanel 永远收不到完成消息，UI 卡 isRunning=true。
//   新（2026-07-04）：injector.onComplete 总是同步发 cleanupComplete（setupInjectorCallbacks），
//     sidepanel 用 completedTypesCount 守护 multi-type 状态机。
//   所以：手动 startCleanup 入口 **任何路径都不应再屏蔽 onComplete**（屏蔽就是埋雷）。
// 2026-07-04 修：先 strip JS 单行注释（防注释里"injector.onComplete = function() {}"误匹配，
//   注释里写"不再手动屏蔽"会被 regex 当成代码）。
function stripJsComments(src) {
  return src.split('\n').map(function(line) {
    const idx = line.indexOf('//');
    return idx >= 0 ? line.slice(0, idx) : line;
  }).join('\n');
}
const contentStrippedForOnComplete = stripJsComments(content);
check('content.js 手动 startCleanup 入口不应再屏蔽 injector.onComplete（multi-type 走 counter 守护）',
  !/injector\.onComplete\s*=\s*function\s*\(\s*\)\s*\{\s*\}/.test(contentStrippedForOnComplete));
check('content.js 手动 startCleanup 入口 single-type 路径也不应屏蔽 onComplete（避免永远不通知 sidepanel）',
  !/if\s*\(\s*types\.length\s*>\s*1\s*\)\s*\{[\s\S]{0,1500}injector\.onComplete\s*=\s*function\s*\(\s*\)\s*\{\s*\}/.test(contentStrippedForOnComplete));

// 8f. resume 路径 onComplete 屏蔽守门（2026-07-02 修复）：
//   resume 路径 (checkAndResumePendingCleanup) 跑 matchedType 时如果还有 remainingTypes，
//   必须临时屏蔽 injector.onComplete。原因：automation.js startCleanup 末尾调 onComplete
//   → cleanupComplete → sidepanel 立即 "completed"，但 multi-type 时这是中间步骤，
//   force page load 还在 fire-and-forget 中没真正执行。
//   屏蔽 onComplete → force page load 后新 content script 跑最后 type 时才发 cleanupComplete。
// 8f. 2026-07-03 multi-type 状态机改造：onComplete 不再手动屏蔽/恢复
//   旧设计：startCleanup/auto-resume 路径手动屏蔽 onComplete（injector.onComplete = function() {}），
//     → sidepanel 永远收不到 cleanupComplete，UI 卡 isRunning=true + progress 0/N。
//   新设计：setupInjectorCallbacks 的 onComplete 总是同步发 cleanupComplete（不读 session async），
//     sidepanel 用 completedTypesCount counter 守护是否真完成。
//   守门：resume 路径不应再有 `injector.onComplete = function() {}` 这种手动屏蔽。
//   2026-07-03 修：先 strip JS 单行注释（防注释里"injector.onComplete = function() {}"误匹配）。
function stripJsComments(src) {
  return src.split('\n').map(function(line) {
    const idx = line.indexOf('//');
    return idx >= 0 ? line.slice(0, idx) : line;
  }).join('\n');
}
const contentStripped = stripJsComments(content);
check('content.js resume 路径不应再手动屏蔽 onComplete (injector.onComplete = function() {})',
  !/Running cleanup for:[\s\S]{0,1000}injector\.onComplete\s*=\s*function\s*\(\s*\)\s*\{\s*\}/.test(contentStripped));

// 8g. 2026-07-03 multi-type 状态机：先更新 pendingCleanup 去掉 matchedType
//   旧设计：先 await startCleanup 跑完 → 再 updatePendingCleanup（此时 onComplete 已触发，
//     session 仍包含 matchedType，被 onComplete 误判为"还有 remaining"，不发 cleanupComplete）。
//   新设计：先 updatePendingCleanup 去掉 matchedType（让 onComplete 检查时 pending 只剩 remainingTypes），
//     再 await startCleanup。
//   最后一个 type 跑完时：先 clearPendingCleanup → onComplete 检查 pending 为空 → 真正发 cleanupComplete。
check('content.js resume 路径必须先 updatePendingCleanup 去掉 matchedType（再 await startCleanup）',
  /var remainingTypes[\s\S]{0,500}?if\s*\(\s*remainingTypes\.length\s*>\s*0\s*\)[\s\S]{0,300}?updatePendingCleanup[\s\S]{0,200}?await\s+injector\.startCleanup/.test(contentStripped));
check('content.js resume 路径最后一个 type 必须先 clearPendingCleanup（再 await startCleanup）',
  /else\s*\{[\s\S]{0,300}?clearPendingCleanup[\s\S]{0,200}?await\s+injector\.startCleanup/.test(contentStripped));

// 9. _processFavoritesBatch 必须在 video 页面点 favorite-icon 然后 next
check('automation.js 定义 _processFavoritesBatch 方法',
  /async\s+_processFavoritesBatch\s*\(/.test(automation));
const pfbBlock = automation.slice(pfEndIdx, pfEndIdx + 1000 + automation.slice(pfEndIdx + 1000).indexOf('    async ') + 7);

check('_processFavoritesBatch 调用 waitForElement(browseFavoriteSelectors)',
  /_processFavoritesBatch[\s\S]{0,2000}waitForElement\(\s*browseFavoriteSelectors/.test(pfbBlock));
check('_processFavoritesBatch 点 browse-favorite-icon (已收藏状态 button)',
  /_processFavoritesBatch[\s\S]{0,4000}safeClick\(\s*(browseFavoriteBtn|favoriteClickTarget)/.test(pfbBlock));
check('_processFavoritesBatch 用 closest(button) 兜底（React onClick 绑在 button）',
  /_processFavoritesBatch[\s\S]{0,4000}closest\(\s*['"]button['"]\s*\)/.test(pfbBlock));
check('_processFavoritesBatch 找不到 button 时 click next（at most once 兜底：button 不在 favorited 状态 = 已点过）',
  /_processFavoritesBatch[\s\S]{0,5000}browseFavoriteBtn[\s\S]{0,200}!browseFavoriteBtn[\s\S]{0,1500}nextBtn/.test(pfbBlock));
check('_processFavoritesBatch 不再 push URL 到 _deletedFavoritesUrls（机制已取消）',
  !/_processFavoritesBatch[\s\S]{0,5000}_deletedFavoritesUrls\.push/.test(pfbBlock));
check('_processFavoritesBatch 不再调 _saveDeletedFavoritesUrls（机制已取消）',
  !/_processFavoritesBatch[\s\S]{0,5500}_saveDeletedFavoritesUrls\s*\(/.test(pfbBlock));
check('_processFavoritesBatch 点 next video 按钮',
  /_processFavoritesBatch[\s\S]{0,7000}nextBtn[\s\S]{0,500}disabled/.test(pfbBlock));
check('_processFavoritesBatch 处理 next 按钮 disabled 跳出',
  /_processFavoritesBatch[\s\S]{0,7000}nextBtn[\s\S]{0,800}disabled\s*!==\s*true[\s\S]{0,500}else\s*\{[\s\S]{0,200}break/.test(pfbBlock));

// 10. (removed) 旧的 _load/_save _deleted*Urls 整套机制已取消 — 已在第 15 节检查"已移除"
//     "at most once" 完全靠 selector [data-e2e='browse-favorite-icon'] 只匹配 favorited 状态的 button 来保证

// 11. (removed) 旧的 _deletedFavoritesUrls 字段已取消 — 已在第 15 节检查"已移除"

// 12. (removed) background.js 的 readDeleted*Urls / writeDeleted*Urls handler 已取消 — 已在第 15 节检查"已移除"

// 13. (removed) cleanupComplete 不再清 deleted*Urls — 已在第 15 节检查"不再清"

// 14. i18n.js 8 语言 favoritesDeleteComplete 全部存在
const i18n = fs.readFileSync(
  path.join(ROOT, 'platforms/tiktok-project/scripts/i18n.js'), 'utf8');
const favDelComplete8 = ['Favorites cleanup complete', '收藏清理完成', 'お気に入りのクリーンアップ',
  '즐겨찾기 정리 완료', 'Limpeza de favoritos', 'Limpieza de favoritos',
  'Favoriten-Bereinigung', 'Nettoyage des favoris'];
for (const text of favDelComplete8) {
  check('i18n.js 包含 ' + text,
    i18n.indexOf(text) >= 0);
}

// 15. 手动 Start Cleanup 必须清空 stale _deleted*Urls（防止上轮中断残留卡住当前 run）
//     跨页 auto-resume 必须保留 _deleted*Urls（去重生效）
const contentJs = fs.readFileSync(
  path.join(ROOT, 'platforms/tiktok-project/scripts/content.js'), 'utf8');
check('startCleanup 接受 options.isAutoResume',
  /_isAutoResume\s*=\s*options\.isAutoResume\s*===\s*true/.test(automation));
// 2026-07-02 铁律：取消整个 session storage + in-memory Set 的 URL 列表机制。
// "at most once" 由 selector [data-e2e='browse-favorite-icon'] 等只匹配 favorited 状态的 button 来保证 —
// 按钮已经 unfavorited 时 selector 不匹配，wait timeout 后 click next，整段逻辑天然不会重复点同一视频的 cancel 按钮。
// 旧机制 _loadDeleted*Urls / _saveDeleted*Urls / _resetDeletedUrlsIfNotResume 全部移除。
check('已移除 _resetDeletedUrlsIfNotResume helper（URL 列表机制取消）',
  !/async\s+_resetDeletedUrlsIfNotResume\s*\(/.test(automation));
check('已移除 _loadDeletedFavoritesUrls / _loadDeletedLikesUrls / _loadDeletedRepostUrls（无 session storage 读取）',
  !/async\s+_loadDeleted(?:Favorites|Likes|Repost)Urls\s*\(/.test(automation));
check('已移除 _saveDeletedFavoritesUrls / _saveDeletedLikesUrls / _saveDeletedRepostUrls（无 session storage 写入）',
  !/async\s+_saveDeleted(?:Favorites|Likes|Repost)Urls\s*\(/.test(automation));
check('已移除 _deletedFavoritesUrls / _deletedLikesUrls / _deletedRepostUrls 状态（无 in-memory Set）',
  !/this\._deleted(?:Favorites|Likes|Repost)Urls/.test(automation));
check('已移除 _deleted*Urls 的 indexOf / has / push / add 调用（不再做 URL 去重）',
  !/_deleted(?:Favorites|Likes|Repost)Urls[\s\S]{0,30}\.(?:indexOf|has|push|add)\s*\(/.test(automation));
check('processFavorites 入口不再有 _resetDeletedUrlsIfNotResume 调用',
  !/processFavorites[\s\S]{0,200}_resetDeletedUrlsIfNotResume/.test(automation));
check('processLikes 入口不再有 _resetDeletedUrlsIfNotResume 调用',
  !/processLikes[\s\S]{0,200}_resetDeletedUrlsIfNotResume/.test(automation));
check('processReposts 入口不再有 _resetDeletedUrlsIfNotResume 调用',
  !/processReposts[\s\S]{0,200}_resetDeletedUrlsIfNotResume/.test(automation));
check('chrome-source/background.js 已移除 readDeleted*Urls / writeDeleted*Urls 6 个 message handler',
  !/readDeleted(?:Favorites|Likes|Repost)Urls|writeDeleted(?:Favorites|Likes|Repost)Urls/.test(
    fs.readFileSync(path.join(ROOT, 'platforms/tiktok-project/chrome-source/background.js'), 'utf8')));
check('edge-source/background.js 已移除 readDeleted*Urls / writeDeleted*Urls 6 个 message handler',
  !/readDeleted(?:Favorites|Likes|Repost)Urls|writeDeleted(?:Favorites|Likes|Repost)Urls/.test(
    fs.readFileSync(path.join(ROOT, 'platforms/tiktok-project/edge-source/background.js'), 'utf8')));
check('chrome-source/background.js cleanupComplete 不再清 deleted*Urls（机制已取消，无须清）',
  !/chrome\.storage\.session\.remove\(\s*[\'"]deleted(?:Favorites|Likes|Repost)Urls[\'"]/.test(
    fs.readFileSync(path.join(ROOT, 'platforms/tiktok-project/chrome-source/background.js'), 'utf8')));
check('edge-source/background.js cleanupComplete 不再清 deleted*Urls（机制已取消，无须清）',
  !/chrome\.storage\.session\.remove\(\s*[\'"]deleted(?:Favorites|Likes|Repost)Urls[\'"]/.test(
    fs.readFileSync(path.join(ROOT, 'platforms/tiktok-project/edge-source/background.js'), 'utf8')));
check('automation.js 注释解释取消 URL 列表机制 + selector 唯一性保证 at most once',
  /at most once[\s\S]{0,200}selector[\s\S]{0,300}browse-favorite-icon[\s\S]{0,300}favorited/i.test(automation));

// 16. content.js：sidepanel 手动 Start Cleanup → isAutoResume: false
// 修复 2026-07-02：手动 startCleanup 改走 multi-type state machine，
//   仍传 isAutoResume: false（区别于 auto-resume 路径的 isAutoResume: true）。
//   验证只要 content.js 手动路径中存在 'isAutoResume: false' 字面量即可，
//   不再检查 Object.assign 写法。
check('content.js 手动 Start Cleanup 传 isAutoResume: false',
  /isAutoResume:\s*false/.test(content));
// 17. content.js：checkAndResumePendingCleanup auto-resume → isAutoResume: true
check('content.js checkAndResumePendingCleanup 传 isAutoResume: true',
  /Object\.assign\(\s*\{\}\s*,\s*pending\s*,\s*\{[^}]*isAutoResume:\s*true[^}]*\}\s*\)/.test(contentJs));

// 18. _activateProfileTab 必须用英文 key（防中文硬编码 regression：曾传 '转发' 致英文 UI Reposts 静默卡死）
// 4 个 processXxx 都必须用 e2eMap 里的英文 key，且不能出现中文/日文/韩文等非英文 tabName
const tabNameCalls = automation.match(/_activateProfileTab\(\s*['"]([^'"]+)['"]\s*\)/g) || [];
const allowedTabNames = new Set(['Likes', 'Liked', 'Reposts', 'Repost', 'Videos', 'Video', 'Favorites', 'Favorite', 'Following']);
const badTabNameCalls = tabNameCalls.filter(function(call) {
  var m = call.match(/['"]([^'"]+)['"]/);
  return m && !allowedTabNames.has(m[1]);
});
check('automation.js 4 处 _activateProfileTab 调用都用 e2eMap 允许的英文 key（无中文硬编码）',
  tabNameCalls.length >= 4 && badTabNameCalls.length === 0);
check('automation.js processFavorites 用 "Favorites"',
  /processFavorites[\s\S]{0,4000}_activateProfileTab\(\s*['"]Favorites['"]\s*\)/.test(automation));
check('automation.js processLikes 用 "Liked"（TikTok 真实 tab key）',
  /processLikes[\s\S]{0,4000}_activateProfileTab\(\s*['"]Liked['"]\s*\)/.test(automation));
check('automation.js processReposts 用 "Reposts"（不能是 "转发"）',
  /processReposts[\s\S]{0,4000}_activateProfileTab\(\s*['"]Reposts['"]\s*\)/.test(automation));
check('automation.js processFollowing 用 "Following"',
  /processFollowing[\s\S]{0,4000}_activateProfileTab\(\s*['"]Following['"]\s*\)/.test(automation));
check('_activateProfileTab 对未知 tabName 打 debug warning（防静默失败）',
  /_activateProfileTab[\s\S]{0,800}unknown tabName/.test(automation));

// 19. 铁律：automation.js 和 content.js 不允许硬编码 data-e2e / class* / aria-label
//     允许例外：标准 DOM API（[role="tab"]、article、time[datetime] 等）和 IDs（a#xxx）
const hardcodedPatterns = [
  /["']\[data-e2e=['"][^'"]*['"]\]["']/,        // '[data-e2e="..."]'
  /["']\[data-testid=['"][^'"]*['"]\]["']/,    // '[data-testid="..."]'
  /["']\[class\*?=['"][^'"]*['"]\]["']/,       // '[class*="..."]'
  /["']\[aria-label\*?=['"][^'"]*['"]\]["']/   // '[aria-label*="..."]'
];
function findHardcodedSelectors(text, filename) {
  const hits = [];
  for (let i = 0; i < hardcodedPatterns.length; i++) {
    const re = new RegExp(hardcodedPatterns[i].source, 'g');
    let m;
    while ((m = re.exec(text)) !== null) {
      hits.push({ line: text.substr(0, m.index).split('\n').length, match: m[0] });
    }
  }
  return hits;
}
const autoHard = findHardcodedSelectors(automation, 'tiktok-automation.js');
const cntHard = findHardcodedSelectors(contentJs, 'content.js');
// 允许的硬编码白名单（已知历史合理）：
//   - '[role="tab"]' / '[role="main"]' / 'main, [role="main"]' 标准 ARIA role
//   - 'a[href*=...]' / 'a[href^=...]' 标准 href 选择器
//   - '[data-tt=...]' / '[data-icon=...]' / '[data-testid=...]' 标准 data attribute
//   - '[role="dialog"]' / 'time[datetime]' 标准 ARIA/HTML
//   - '[data-e2e="nav-profile"]' / '[data-e2e="repost-tab"]' 兜底 fallback（config 缺失时
//     getXxx() 才能返回非空值，否则 video page 找不到 tab 就跑不下去）
function isAllowedHardcoded(match) {
  const allowed = [
    '[role="tab"]', '[role="main"]', 'main, [role="main"]', '[role="dialog"]',
    'a[href*=\'/video/\']', 'a[href^=\'/upload\']', 'a[href^=\'/messages\']', 'a[href^=\'/notifications\']',
    '[data-tt=', '[data-icon=', '[data-testid=\'Backspace\']',
    'time[datetime]', '[href=\'/upload\']',
    '[data-e2e="nav-profile"]', '[data-e2e="repost-tab"]'
  ];
  for (let i = 0; i < allowed.length; i++) {
    if (match.indexOf(allowed[i]) >= 0) return true;
  }
  return false;
}
const autoHardFilt = autoHard.filter(function(h) { return !isAllowedHardcoded(h.match); });
const cntHardFilt = cntHard.filter(function(h) { return !isAllowedHardcoded(h.match); });
check('tiktok-automation.js 无铁律禁止的硬编码 selector（白名单外）', autoHardFilt.length === 0);
if (autoHardFilt.length > 0) {
  console.error('  ! 残留:', JSON.stringify(autoHardFilt.slice(0, 5), null, 2));
}
check('content.js 无铁律禁止的硬编码 selector（白名单外）', cntHardFilt.length === 0);
if (cntHardFilt.length > 0) {
  console.error('  ! 残留:', JSON.stringify(cntHardFilt.slice(0, 5), null, 2));
}

// 20. content.js 必须有 window.TikTokEraserConfig 暴露的 selector getter
check('content.js getNavProfileSelector getter 存在',
  /getNavProfileSelector\s*\(/.test(contentJs));
check('content.js getProfileTabs getter 存在',
  /getProfileTabs\s*\(/.test(contentJs));
check('content.js getLoginInputs getter 存在',
  /getLoginInputs\s*\(/.test(contentJs));
check('content.js getCommonSelectors getter 存在',
  /getCommonSelectors\s*\(/.test(contentJs));

// 21. content.js 旧硬编码常量 GLOBAL_LOGIN_INDICATORS / DEFAULT_CHECK_ELEMENTS_8LANG 已删除
check('content.js 不应再硬编码 GLOBAL_LOGIN_INDICATORS',
  !/const\s+GLOBAL_LOGIN_INDICATORS\s*=/.test(contentJs));
check('content.js 不应再硬编码 DEFAULT_CHECK_ELEMENTS_8LANG',
  !/const\s+DEFAULT_CHECK_ELEMENTS_8LANG\s*=/.test(contentJs));

// 22. default.json / tiktok-remote-example.json 必须包含新加的 common 块
const newConfigKeys = [
  'selectors.common.profileIcon', 'selectors.common.loginButton', 'selectors.common.loginInputs',
  'selectors.common.loggedOutIndicators', 'selectors.common.nextVideoArrow',
  'selectors.common.contentContainerProbes', 'selectors.common.diagnostic',
  'selectors.common.profileTabs', 'selectors.common.waitForContentStableByType'
];
for (const path of newConfigKeys) {
  var parts = path.split('.');
  var cur = config;
  for (var p = 0; p < parts.length; p++) {
    cur = cur && cur[parts[p]];
    if (cur === undefined) break;
  }
  check('default.json 含 ' + path, cur !== undefined);
}
// remote-example 必须与 default.json 同步（至少包含同样 key）
for (const path of newConfigKeys) {
  var parts = path.split('.');
  var cur = configRemote;
  for (var p = 0; p < parts.length; p++) {
    cur = cur && cur[parts[p]];
    if (cur === undefined) break;
  }
  check('tiktok-remote-example.json 含 ' + path, cur !== undefined);
}

// 23. automation.js _stableSelectorsFor helper 调用 4 个 processXxx 都正确（reposts/likes/favorites/following）
const typeMatches = automation.match(/waitForContentStable\(\s*this\._stableSelectorsFor\(\s*['"](\w+)['"]\s*\)\s*\)/g) || [];
const calledTypes = typeMatches.map(function(s) { return s.match(/['"](\w+)['"]/)[1]; });
check('automation.js 4 个 processXxx 都用 _stableSelectorsFor helper',
  calledTypes.indexOf('reposts') >= 0
  && calledTypes.indexOf('likes') >= 0
  && calledTypes.indexOf('favorites') >= 0
  && calledTypes.indexOf('following') >= 0);

// 24. content.js 防 querySelectorAll('') 抛错：[].join(',') 之前必须有空数组保护
//     之前 isLoggedOut 的 loginInputs 没保护，config 缺失时 [].join(',') = '' → DOMException SyntaxError
check('content.js isLoggedOut 不允许直接 .join(",") 数组（防 querySelectorAll 抛空 selector 错）',
  !/loginInputSelectors\.join\(['"],['"]\)/.test(contentJs)
  || /loginInputSelectors\.length\s*===\s*0/.test(contentJs));
check('content.js 修复后 isLoggedOut 有空数组 fallback',
  /loginInputSelectors\.length\s*===\s*0[\s\S]{0,500}loginInputSelectors\s*=\s*\[/.test(contentJs));

console.log('');
console.log('  通过: ' + passed + '/' + (passed + failed));
if (failed > 0) {
  console.log('[FAIL]');
  process.exit(1);
}
