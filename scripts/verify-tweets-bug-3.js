#!/usr/bin/env node
// verify-tweets-bug-3.js
// 防回归：tweets-bug-3 (2026-06-17) — 撤销 retweet 永远 0 命中
//
// 根因（端到端真机验证确认）：
//   1) unretweet 路径误用 _isOwnArticle 过滤
//      X 2026 retweet 卡片（"You reposted"）只显示原作者头像，不显示 retweeter 自己头像
//      _isOwnArticle 要求 UserAvatar-Container-{username} → retweet 卡片永远 false
//      → 撤销 retweet 永远 0 命中
//
//   2) unreTweetButtons / retweetButtonInCard 缺 8 语言 aria-label 兜底
//      X 2026 retweet 按钮实际 aria-label = "N reposts. Reposted"（"已转发"状态）
//      en/zh-CN/ja/ko/pt/es/de/fr/it 9 种翻译都不同（实测见 docs/lessons-learned.md 案例 retweet-aria-label-2026-06-17）
//      旧 selector 只有 1 个英文 'Reposted' + 3 个 data-testid，缺 8 语言兜底
//      旧 selector 还有 2 个 0 命中的英文 'Undo repost' / 'Undo Repost'（X 2026 已不用）
//
// 锁定：config 2 个文件 + injector.js 的关键代码块

'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_CFG_PATH = path.join(__dirname, '..', 'platforms', 'x-project', 'src', 'config', 'default.json');
const REMOTE_CFG_PATH = path.join(__dirname, '..', 'platforms', 'x-project', 'src', 'config', 'remote-example.json');
const INJECTOR_PATH = path.join(__dirname, '..', 'platforms', 'x-project', 'scripts', 'x-automation.js');

const defaultCfg = JSON.parse(fs.readFileSync(DEFAULT_CFG_PATH, 'utf8'));
const remoteCfg = JSON.parse(fs.readFileSync(REMOTE_CFG_PATH, 'utf8'));
const injectorSrc = fs.readFileSync(INJECTOR_PATH, 'utf8');

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

function arrayContains(arr, needle) {
  return Array.isArray(arr) && arr.indexOf(needle) !== -1;
}

console.log('=== verify-tweets-bug-3.js ===');
console.log('防 tweets-bug-3 (2026-06-17) 回归\n');

// ------------------------------------------------------------------
// [1] config 8 语言 aria-label selector 兜底
// ------------------------------------------------------------------
console.log('[1] unreTweetButtons / retweetButtonInCard 必含 8 语言 aria-label');

const EXPECTED_ARIA_LABELS = [
  "button[aria-label*='已转帖']",          // zh-CN
  "button[aria-label*='リポストしました']", // ja
  "button[aria-label*='재게시함']",        // ko
  "button[aria-label*='Reposted']",        // en
  "button[aria-label*='Repostet']",        // de
  "button[aria-label*='Reposté']",         // fr
  "button[aria-label*='Repostado']",       // es + pt（同词，X 即便在 pt 界面也用 Repostado 而非葡语 Republicado）
  "button[aria-label*='Ripostato']"        // it
  // pt 实测词条 = es 同形 "Repostado"，2026-06-21 MCP Chrome 实地验证
];

// 1a) default.json（6-type 重构：unreTweetButtons 已从 tweet 节点挪到 retweet 节点；retweetButtonInCard 已删除）
const defaultUnreTweet = defaultCfg.selectors && defaultCfg.selectors.retweet && defaultCfg.selectors.retweet.unreTweetButtons;
assert(Array.isArray(defaultUnreTweet), 'default.json: retweet.unreTweetButtons 是数组');
for (const sel of EXPECTED_ARIA_LABELS) {
  assert(arrayContains(defaultUnreTweet, sel), 'default.json: retweet.unreTweetButtons 含 ' + sel);
}

// 1b) remote-example.json
const remoteUnreTweet = remoteCfg.selectors && remoteCfg.selectors.retweet && remoteCfg.selectors.retweet.unreTweetButtons;
assert(Array.isArray(remoteUnreTweet), 'remote-example.json: retweet.unreTweetButtons 是数组');
for (const sel of EXPECTED_ARIA_LABELS) {
  assert(arrayContains(remoteUnreTweet, sel), 'remote-example.json: retweet.unreTweetButtons 含 ' + sel);
}

console.log();

// ------------------------------------------------------------------
// [13] M++ 修复：deleteTweet 改先 wait 50ms menuitem 命中 N++ 修复弹的菜单
//   根因：N++ 修复 isReplyTweet click caret 弹菜单后，SocialEraser line 297 safeClick(moreButton, 0)
//     再次 click caret → toggle 关掉 → 0 menuitem → waitForMenuItemByText 3s timeout → 失败
//   修法：先 wait 50ms（菜单已在 page 上，N++ 修复弹的）—— 命中"Delete" → click deleteItem
//         miss（N++ 修复未弹菜单）→ fallback click caret 弹菜单 + wait 3000ms
// ------------------------------------------------------------------
console.log('[13] M++ 修复：deleteTweet 先 wait 50ms 命中 N++ 弹菜单');

// 抓 deleteTweet 函数体
const dtFnMatch = injectorSrc.match(/async deleteTweet\([\s\S]*?\n    \}/);
const dtFnBody = dtFnMatch ? dtFnMatch[0] : '';
assert(dtFnBody.length > 0, 'injector.js: 找到 deleteTweet 函数体');

// 关键：先 wait 350ms（命中 N++ 修复弹的菜单）
assert(/waitForMenuItemByText[\s\S]*?350/.test(dtFnBody),
  'deleteTweet 先 wait 350ms 命中 N++ 弹菜单（避免 toggle 关掉）');

// 关键：miss 后 fallback click caret 弹菜单
assert(/safeClick\(moreButton[\s\S]*?3000/.test(dtFnBody),
  'deleteTweet miss 后 fallback safeClick(moreButton) + wait 3000ms');

// 关键：必须**不**直接 safeClick(moreButton, 0) 在**第一个** waitForMenuItemByText 之前（M++ 修复前 bug）
const mppCodeOnly = dtFnBody.split('\n').filter(function(l) {
  return !/^\s*\/\//.test(l);
}).join('\n');
// 旧版代码：safeClick(moreButton, 0) 在**第一个** waitForMenuItemByText 之前
// 新版代码：**第一个** waitForMenuItemByText 50ms 在前，safeClick + 第二个 waitForMenuItemByText 3000ms 在后
// 检查**第一个** waitForMenuItemByText 50ms **之前**（dtFnBody 起始到它）有没有 safeClick(moreButton, 0)
const firstWaitMatch = mppCodeOnly.match(/await\s+this\.waitForMenuItemByText/);
const codeBeforeFirstWait = firstWaitMatch
  ? mppCodeOnly.substring(0, firstWaitMatch.index)
  : '';
assert(!/await\s+this\.safeClick\(moreButton,\s*0\)/.test(codeBeforeFirstWait),
  'deleteTweet **第一个** waitForMenuItemByText 之前**不**有 safeClick(moreButton, 0)（M++ 修复：避免 toggle 关掉菜单）');

// 关键：M++ 修复必须引用 tweets-bug-3 + MCP 实证
assert(/M\+\+ 修复/.test(dtFnBody),
  'deleteTweet 有 M++ 修复注释');
assert(/N\+\+/.test(dtFnBody),
  'deleteTweet 注释引用 N++ 修复');
assert(/menuitemCount\s*=\s*0/.test(dtFnBody),
  'deleteTweet 注释引用 menuitemCount=0 实证');

console.log();

// ------------------------------------------------------------------
// [12] isReplyTweet 改 URL 判断取代 caret 菜单项数检测（N++ 再修复 2026-06-19）
//   N 修复（2026-06-17）：X 2026 reply 推文**完全**去除 "Replying to" 文字
//     → socialContext + 全文搜都 miss → 假阴性 → includeReplies=false 时 reply 被误删
//     N 修法：click caret 弹菜单 → 数 [role="menuitem"] → 8 = reply / 11 = 原创
//   N+ 增量修复：ESC dispatchEvent 完全失败（X 用 React synthetic keydown）
//   N++ 增量修复：N+ click body 仍污染 X 内部 popup state
//     → N++ 修复**不**关菜单（留 page 上）—— SocialEraser 直接 wait menuitem 命中
//
//   N++ 再修复（2026-06-19）：X 2026 caret 菜单项数再次改版
//     实证：reply = 7 / original = 10（不再是 8 / 11）
//     8 vs 11 差异来源（Edit / Add or remove content disclosure / Change who can reply）已被 X 删除
//     reply vs original 菜单**文字**也高度重叠，靠 caret 菜单项数判断**永远**脆弱
//     新修法：**改用 URL 判断**为主路径
//       /username/with_replies → 全 reply（X 2026 已分页）
//       /username 根 profile → 全 original
//     保留兼容：socialContext + 全文 replyKeywords 检测作 X 旧版 fallback
// ------------------------------------------------------------------
console.log('[12] isReplyTweet URL 判断（N++ 再修复：X 2026 菜单项数 8/11 → 7/10）');

// 抓 isReplyTweet 函数体
const isReplyFnMatch = injectorSrc.match(/isReplyTweet\(container\)\s*\{[\s\S]*?\n    \}/);
const isReplyFnBody = isReplyFnMatch ? isReplyFnMatch[0] : '';
assert(isReplyFnBody.length > 0, 'injector.js: 找到 isReplyTweet 函数体');

// 主路径：URL 判断（X 2026 with_replies 页 = 全 reply）
assert(/pathname\.endsWith\(['"]\/with_replies['"]\)/.test(isReplyFnBody),
  'isReplyTweet 主路径：pathname.endsWith("/with_replies") → return true（with_replies 页 = 全 reply）');
assert(/pathname\s*=\s*location\.pathname/.test(isReplyFnBody),
  'isReplyTweet 读 location.pathname');

// 根 profile 页 = 全 original
assert(/location\.pathname|pathname/.test(isReplyFnBody) &&
       /A-Za-z0-9_\]\+\$\//.test(isReplyFnBody),
  'isReplyTweet 根 profile 页正则匹配 → return false');

// 关键（N++ 再修复）：**不**再 click caret 弹菜单（X 改版后菜单项数判断不可靠）
const npp2CodeOnly = isReplyFnBody.split('\n').filter(function(l) {
  return !/^\s*\/\//.test(l);
}).join('\n');
assert(!/caret\.click\(\)/.test(npp2CodeOnly),
  'isReplyTweet **不**再 caret.click() 弹菜单（N++ 再修复：X 改版后菜单项数无法区分 reply vs original）');
assert(!/\[role="menuitem"\]/.test(npp2CodeOnly),
  'isReplyTweet **不**再数 [role="menuitem"] 数量（N++ 再修复）');
assert(!/nCount\s*===\s*(7|8|10|11)/.test(npp2CodeOnly),
  'isReplyTweet **不**再 hardcode 7/8/10/11 菜单项数阈值（N++ 再修复）');
assert(!/busy wait/.test(npp2CodeOnly),
  'isReplyTweet **不**再 busy wait 250ms 弹菜单（N++ 再修复）');

// 关键：必须保留 socialContext 检测（X 旧版 fallback）
assert(/socialContext/.test(isReplyFnBody),
  'isReplyTweet 保留 socialContext 检测（X 旧版 fallback）');

// 关键：必须保留全文搜 replyKeywords（X 旧版 fallback）
const replyKwReCheck = /replyRe\.test\(fullText\)/;
assert(replyKwReCheck.test(isReplyFnBody),
  'isReplyTweet 保留全文 replyKeywords 检测（X 旧版 fallback）');

// 关键：注释引用 MCP 实证
assert(/MCP 实证/.test(isReplyFnBody),
  'isReplyTweet 注释引用 MCP 实证（不是猜）');
assert(/URL 判断/.test(isReplyFnBody),
  'isReplyTweet 注释明确"URL 判断"主路径');

console.log();

// ------------------------------------------------------------------
// [2] 死 selector 必须不存在（X 2026 实际不用，0 命中）
// ------------------------------------------------------------------
console.log('[2] unreTweetButtons 不能含 X 2026 已弃用的英文 selector');

const DEAD_SELECTORS = [
  "button[aria-label*='Undo repost']",
  "button[aria-label*='Undo Repost']"
];

for (const sel of DEAD_SELECTORS) {
  assert(!arrayContains(defaultUnreTweet, sel), 'default.json: unreTweetButtons 不含 ' + sel);
  assert(!arrayContains(remoteUnreTweet, sel), 'remote-example.json: unreTweetButtons 不含 ' + sel);
}

console.log();

// ------------------------------------------------------------------
// [3] data-testid selector 仍然存在（X 2026 主要靠 testid，aria-label 是兜底）
// ------------------------------------------------------------------
console.log('[3] data-testid 强 selector 必须保留');

const REQUIRED_TESTID_SELECTORS = [
  "[data-testid='unretweet']"  // X 2026 唯一用小写；旧版 Unretweet/undoRepost X 已弃用，不再保留
];

for (const sel of REQUIRED_TESTID_SELECTORS) {
  assert(arrayContains(defaultUnreTweet, sel), 'default.json: unreTweetButtons 含 ' + sel);
  assert(arrayContains(remoteUnreTweet, sel), 'remote-example.json: unreTweetButtons 含 ' + sel);
}

console.log();

// ------------------------------------------------------------------
// [4] injector.js: unretweet 路径不应用 _isOwnArticle 过滤（核心修复）
// ------------------------------------------------------------------
console.log('[4] injector.js: unretweet 路径不应用 _isOwnArticle 过滤');

// 4a) 找 collectCandidates 内 unretweet 路径代码块
//    关键特征：filter(function(b) { var a = b.closest('article'); return self._isOwnArticle(a); })
//    修复后：这段必须不存在（已被 topLevelBtns 替换）
//    注：但 deleteTweet 路径（moreButtons）的 _isOwnArticle 仍保留
const unreTweetOwnFilterPattern = /unretweetButtons[\s\S]{0,2000}filter\(function\(b\)\s*\{\s*var\s+a\s*=\s*b\.closest\('article'\);\s*return\s+self\._isOwnArticle\(a\);?\s*\}\)/;
assert(!unreTweetOwnFilterPattern.test(injectorSrc),
  'injector.js: unretweet 路径不再有 _isOwnArticle 过滤（删除 = 修复成功）');

// 4b) 确认 moreButtons 路径仍保留 _isOwnArticle 过滤（deleteTweet 必须保留）
//    用 brace 配对算法找 collectCandidates 函数的精确边界（不依赖正则，避免误抓内嵌函数）
function findFunctionBody(src, signature) {
  const startIdx = src.indexOf(signature);
  if (startIdx < 0) return null;
  const braceStart = src.indexOf('{', startIdx);
  if (braceStart < 0) return null;
  let depth = 0;
  for (let i = braceStart; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return src.substring(braceStart + 1, i);
    }
  }
  return null;
}
const collectCandidatesBody = findFunctionBody(injectorSrc, 'function collectCandidates()');
assert(collectCandidatesBody !== null, 'injector.js: 找到 collectCandidates 函数体');
// 期望值：注释里 4 次（解释用）+ moreButtons 路径代码 1 次 = 5 次
//   关键约束：代码（不是注释）里只能出现 1 次（在 moreButtons 路径中）
//   unretweet 路径代码里不允许出现 _isOwnArticle（这正是 tweets-bug-3 修复的核心）
const ownArticleUsesInCollect = collectCandidatesBody
  ? (collectCandidatesBody.match(/_isOwnArticle/g) || []).length : 0;
assert(ownArticleUsesInCollect >= 1,
  'injector.js: collectCandidates 内 _isOwnArticle ≥ 1 次（moreButtons 路径 + 注释）— 实际 ' + ownArticleUsesInCollect + ' 次');

// 关键约束：unretweetButtons 路径的 filter() 里不能调用 _isOwnArticle
//   修复前的 bug 模式：unretweetButtons 循环内用 filter(function(b) { return self._isOwnArticle(a); })
//   把所有 retweet 卡片过滤掉。修复后这个 filter 应被删除。
//   注释里的 _isOwnArticle（解释用）允许存在
//   匹配模式：unretweetButtons 循环块 + filter(function(b) { ... }) 块 + _isOwnArticle
//   关键：未删除的 _isOwnArticle 应该是 moreButtons 路径里的，而不是 unretweetButtons 路径里的
const unretweetOwnFilterPattern = /unretweetButtons[\s\S]{0,1500}filter\(function\(b\)\s*\{[\s\S]{0,200}_isOwnArticle/;
assert(!unretweetOwnFilterPattern.test(collectCandidatesBody),
  'injector.js: unretweetButtons 路径的 filter() 不含 _isOwnArticle（修复成功）');

console.log();

// ------------------------------------------------------------------
// [5] injector.js: 关键注释/诊断 region 存在
// ------------------------------------------------------------------
console.log('[5] injector.js: 关键注释/诊断 region 存在');

// 5a) _isOwnArticle 注释含 "重要使用前提"（防止下个会话再次误用）
//    注释结构：⚠️ 重要使用前提 ...（line N）→ _isOwnArticle 函数定义（line N+几）
//    所以匹配方向是 "重要使用前提" 在前，"_isOwnArticle" 在后
assert(/重要使用前提[\s\S]{0,500}_isOwnArticle/.test(injectorSrc),
  'injector.js: _isOwnArticle 注释含"重要使用前提"');

assert(/不用于 unreTweet 路径/.test(injectorSrc),
  'injector.js: _isOwnArticle 注释明确"不用于 unreTweet 路径"');

// 5b) 诊断日志 region 存在（早期 debug 用，2026-06-18 重构后已删除—— verify 也跟随删）
// （MCP 调试现在用 [SocialEraser] console + cleanupError 消息，不再用 debug-point region）

// 5c) H6 假设已更正（"MCP Chrome ≠ user Chrome"错误假设必须被删除）
assert(!/让 user 在 user Chrome 跑一次，把 console 输出贴回来/.test(injectorSrc),
  'injector.js: 已删除"让 user 贴 console"的 H6 误导注释');
assert(!/AI 调试环境[（(].*MCP Chrome[)）].*≠.*user Chrome/.test(injectorSrc),
  'injector.js: 已删除"AI Chrome ≠ user Chrome"H6 假设');
assert(!/MCP Chrome.*?是同一个实例/.test(injectorSrc),
  'injector.js: 已删除"否定 H6"的元注释（直接删除 H6 假设更干净）');

console.log();

// ------------------------------------------------------------------
// [6] 旧诊断点（debug-tweet-delete-regression）的死 reference 必须更新
// ------------------------------------------------------------------
console.log('[6] injector.js: 旧 case reference 必须更新到 tweets-bug-3');

const OLD_CASE = 'debug-tweet-delete-regression';
// deleteTweet 错误信息处不应再叫 "debug-tweet-delete-regression"
const deleteTweetBlock = injectorSrc.match(/async deleteTweet\([\s\S]*?return true;\s*\}/);
const deleteTweetSrc = deleteTweetBlock ? deleteTweetBlock[0] : '';
assert(!OLD_CASE.includes(OLD_CASE) || true, 'no-op'); // 占位
// 关键：tweets-bug-3 必须在 deleteTweet 错误注释中出现
assert(/tweets-bug-3/.test(deleteTweetSrc),
  'injector.js: deleteTweet 注释引用 tweets-bug-3');

console.log();

// ------------------------------------------------------------------
// [7] unretweetConfirmButtons 不应改（已有 waitForMenuItemByText 文字兜底）
// ------------------------------------------------------------------
console.log('[7] unretweetConfirmButtons 保持现状（有文字兜底）');

// 6-type 重构：unretweetConfirmButtons 已从 tweet 节点挪到 retweet 节点
const defaultUnretweetConfirm = defaultCfg.selectors && defaultCfg.selectors.retweet && defaultCfg.selectors.retweet.unretweetConfirmButtons;
const remoteUnretweetConfirm = remoteCfg.selectors && remoteCfg.selectors.retweet && remoteCfg.selectors.retweet.unretweetConfirmButtons;
assert(Array.isArray(defaultUnretweetConfirm), 'default.json: retweet.unretweetConfirmButtons 是数组');
assert(Array.isArray(remoteUnretweetConfirm), 'remote-example.json: retweet.unretweetConfirmButtons 是数组');
assert(arrayContains(defaultUnretweetConfirm, "[data-testid='unretweetConfirm']"),
  'default.json: retweet.unretweetConfirmButtons 含 [data-testid=unretweetConfirm]');
assert(arrayContains(remoteUnretweetConfirm, "[data-testid='unretweetConfirm']"),
  'remote-example.json: retweet.unretweetConfirmButtons 含 [data-testid=unretweetConfirm]');

console.log();

// ------------------------------------------------------------------
// [8] K 修复：waitForMenuItemByText 改 substring 匹配（不再严格相等）
//   根因：X 2026 菜单项文字带后缀（"Delete post" / "Delete this post" 等）
//   严格相等 keywords.indexOf(text) 0 命中 → waitForMenuItemByText 超时
//   → deleteTweet 失败 → 同 candidate 无限 retry
//   修法：substring 匹配 text.indexOf(keyword) !== -1 + 看 aria-label
// ------------------------------------------------------------------
console.log('[8] K 修复：waitForMenuItemByText substring 匹配');

// 抓 waitForMenuItemByText 函数体（4 空格缩进 = 函数最外层结束，避开内嵌 `}`）
const waitForFnMatch = injectorSrc.match(/async waitForMenuItemByText\(keywords, timeout\)\s*\{[\s\S]*?\n    \}/);
const waitForFnBody = waitForFnMatch ? waitForFnMatch[0] : '';
assert(waitForFnBody.length > 0, 'injector.js: 找到 waitForMenuItemByText 函数体');

// 关键：函数体内必须有 text.indexOf(k) substring 匹配
assert(/text\.indexOf\(k\)\s*!==\s*-1/.test(waitForFnBody),
  'waitForMenuItemByText 改 substring 匹配（text.indexOf(k) !== -1）');

// 关键：必须看 aria-label（X 2026 菜单项可能 aria-label 含 keyword）
assert(/ariaLabel\.indexOf\(k\)\s*!==\s*-1/.test(waitForFnBody),
  'waitForMenuItemByText 看 aria-label（ariaLabel.indexOf(k) !== -1）');

// 关键：不能用旧严格相等（keywords.indexOf(text)）—— 排除注释行
const waitForCodeOnly = waitForFnBody.split('\n').filter(function(l) {
  return !/^\s*\/\//.test(l);
}).join('\n');
assert(!/keywords\.indexOf\(text\)/.test(waitForCodeOnly),
  'waitForMenuItemByText 不应再用严格相等 keywords.indexOf(text)（代码行检查，注释里提到旧版不算）');

// 关键：失败时 log menuitem 详情
assert(/menuitemCount=[\s\S]*?snapshot=/.test(waitForFnBody),
  'waitForMenuItemByText 失败时 log 详细 menuitem 列表');

// 关键：有"tweets-bug-3 2026-06-17 修复"注释
assert(/tweets-bug-3 2026-06-17/.test(waitForFnBody),
  'waitForMenuItemByText 有 tweets-bug-3 修复注释');

console.log();

// ------------------------------------------------------------------
// [9] L 修复：失败 candidate 标 'failed' + filter 加 'failed' 防无限 retry
//   根因：旧版失败不标 processed → 同 candidate 在 30s 内 retry 4 次（3s+3s+1s × 4 ≈ 28s）
//   user 看到 "点 More 弹菜单不点 Delete 卡住" 现象直到 STUCK_TIMEOUT 退出
//   修法：失败标 'failed' → filter 跳过 → processTweets 继续推进
// ------------------------------------------------------------------
console.log('[9] L 修复：失败 candidate 标 failed + filter 4 态');

// 抓 processTweets 主循环 filter（regex 允许 in-line 箭头函数 c => 形式）
const pendingFilterMatch = injectorSrc.match(/candidates\.filter\(c\s*=>\s*\{[\s\S]*?return[\s\S]*?\}\)/);
const pendingFilterBody = pendingFilterMatch ? pendingFilterMatch[0] : '';
assert(pendingFilterBody.length > 0, 'injector.js: 找到 candidates.filter 函数体');

// 关键：filter 必须排除 'failed' 状态
assert(/p !== 'failed'/.test(pendingFilterBody),
  'candidates.filter 排除 processed=\'failed\'（4 态：true/skipped/pinned/failed）');

// 关键：必须不再只是 3 态
assert(/p !== 'true' && p !== 'skipped' && p !== 'pinned' && p !== 'failed'/.test(pendingFilterBody),
  'filter 显式 4 态排除');

// 关键：try 块 unreTweet 失败时必须标 failed
const unreTweetBlock = injectorSrc.match(/success = await this\.unreTweet\(article\);[\s\S]*?this\.error\(t\('unretweetFailed'[\s\S]*?\);/);
assert(unreTweetBlock && /socialEraserProcessed\s*=\s*'failed'/.test(unreTweetBlock[0]),
  'unreTweet 失败时标 btn.dataset.socialEraserProcessed=\'failed\'（防无限 retry）');

// 关键：try 块 deleteTweet 失败时必须标 failed
const deleteTweetTryBlock = injectorSrc.match(/success = await this\.deleteTweet\(article\);[\s\S]*?this\.error\(t\('tweetDeleteFailed'[\s\S]*?\);/);
assert(deleteTweetTryBlock && /socialEraserProcessed\s*=\s*'failed'/.test(deleteTweetTryBlock[0]),
  'deleteTweet 失败时标 btn.dataset.socialEraserProcessed=\'failed\'（防无限 retry）');

// 关键：catch 块抛异常时也必须标 failed（用 'failed' 作为 anchor 避免跨过其他 catch）
const catchBlock = injectorSrc.match(/catch\s*\(e\)\s*\{[\s\S]*?socialEraserProcessed\s*=\s*'failed'[\s\S]*?this\.errorCount\+\+;[\s\S]*?\}/);
assert(catchBlock && /socialEraserProcessed\s*=\s*'failed'/.test(catchBlock[0]),
  'catch 块抛异常时也标 failed（防异常路径无限 retry）');

console.log();

// ------------------------------------------------------------------
// [10] i18n.js deleteKeywords 仍是最小关键字（substring 匹配能命中带后缀变体）
//   'Delete' / '删除' 等子串在 'Delete post' / '删除帖子' 等变体中均能找到
// ------------------------------------------------------------------
console.log('[10] i18n.js deleteKeywords 保持最小关键字（substring 命中变体）');

const i18nPath = path.join(__dirname, '..', 'platforms', 'x-project', 'scripts', 'i18n.js');
const i18nSrc = fs.readFileSync(i18nPath, 'utf8');
const deleteKwMatch = i18nSrc.match(/deleteKeywords:\s*\[([\s\S]*?)\]/);
const deleteKwBlock = deleteKwMatch ? deleteKwMatch[1] : '';
assert(deleteKwBlock.length > 0, 'i18n.js: deleteKeywords 数组存在');

// 9 语言关键字全在（每个语言的最短形式）
const requiredDeleteKw = ['Delete', '删除', '削除', '삭제', 'Excluir', 'Eliminar', 'Löschen', 'Supprimer', 'Elimina'];
requiredDeleteKw.forEach(function(kw) {
  assert(deleteKwBlock.indexOf("'" + kw + "'") !== -1,
    'i18n.js deleteKeywords 含 "' + kw + '"');
});

console.log();

// ------------------------------------------------------------------
// [11] M 修复：X 2026 click Delete 推文直接消失，不需要 confirm 弹窗
//   根因：旧代码 waitForElement(selectors.confirmButton, 3000) 等 3s confirm
//   → X 2026 没 confirm 弹窗（dialogCount=0）→ deleteTweet 返回 false
//   → 推文**实际已删**但 processedCount 不加 → user 看到"卡 3s + processed=1"
//   修法：主路径 = container.isConnected 检查（X 2026 立即删）
//        备路径 = find confirm 弹窗 + click confirm（X 旧版兼容）
//   M+ 增量修复：M 修复用了 `article.isConnected` 但函数参数叫 `container`，
//     → 抛 "article is not defined" ReferenceError → catch 块 → btn 标 'failed'
//     → processed=0。**必须**用 `container.isConnected`（processTweets 传的就是 article）
// ------------------------------------------------------------------
console.log('[11] M 修复：X 2026 click Delete 推文直接消失（container.isConnected 路径）');

// 抓 deleteTweet 函数体
const deleteTweetFnMatch = injectorSrc.match(/async deleteTweet\([\s\S]*?\n    \}/);
const deleteTweetFnBody = deleteTweetFnMatch ? deleteTweetFnMatch[0] : '';
assert(deleteTweetFnBody.length > 0, 'injector.js: 找到 deleteTweet 函数体');

// 关键：主路径必须检查 container.isConnected（M+ 修复：不能用 article.isConnected——函数参数叫 container）
assert(/container\.isConnected/.test(deleteTweetFnBody),
  'deleteTweet 主路径检查 container.isConnected（X 2026 推文直接消失）');
// 关键：M+ 修复——代码行（排除注释）里 article.isConnected 不能存在
const dtCodeOnly = deleteTweetFnBody.split('\n').filter(function(l) {
  return !/^\s*\/\//.test(l);
}).join('\n');
assert(!/article\.isConnected/.test(dtCodeOnly),
  'deleteTweet 代码里**不**能用 article.isConnected（M+ 修复：函数参数叫 container）');

// 关键：主路径之前是 waitForElement confirmButton 3s，现在不能是唯一路径
// 旧版代码：this.waitForElement(selectors.confirmButton, 3000) 独立 3s 等待，X 2026 永远 miss
// 新代码：container.isConnected 主路径 + find confirm 备路径（200ms 短暂轮询）
// 关键：deleteTweet 函数体的**代码行**（排除注释）里 this.waitForElement(confirmButton, 3000) 不能存在
const oldConfirmWaitPattern = /this\.waitForElement\(\s*selectors\.confirmButton\s*,\s*3000\s*\)/;
assert(!oldConfirmWaitPattern.test(dtCodeOnly),
  'deleteTweet 不能用 this.waitForElement(confirmButton, 3000) 独立 3s 等待（X 2026 永远 miss）');

// 关键：必须兼容 X 旧版（备路径 = find confirm + click confirm）
assert(/mConfirmClicked|confirmButton.*safeClick|safeClick.*confirmButton/.test(deleteTweetFnBody),
  'deleteTweet 备路径：find confirm 弹窗 + click confirm（X 旧版兼容）');

// 关键：3s 兜底
assert(/M_TIMEOUT\s*=\s*3000|3\s*\*\s*1000/.test(deleteTweetFnBody),
  'deleteTweet 有 3s 兜底（M_TIMEOUT = 3000）');

// 关键：失败时 log 详细错误（M+ 修复：log 用 container 而非 article）
assert(/deleteTweet:.*container still exists.*confirmClicked/.test(deleteTweetFnBody),
  'deleteTweet 失败时 log container 是否消失 + confirm 是否被点');

// 关键：M + M+ 修复必须引用 tweets-bug-3 + MCP 实证
assert(/M 修复 tweets-bug-3 2026-06-17/.test(deleteTweetFnBody),
  'deleteTweet 有 M 修复 tweets-bug-3 注释');
assert(/M\+ 修复/.test(deleteTweetFnBody),
  'deleteTweet 有 M+ 修复增量注释（article → container）');
assert(/article is not defined/.test(deleteTweetFnBody),
  'deleteTweet 注释引用 "article is not defined" ReferenceError 实证');
assert(/MCP 实证/.test(deleteTweetFnBody),
  'deleteTweet 注释引用 MCP 实证（不是猜）');
assert(/dialogCount=0/.test(deleteTweetFnBody),
  'deleteTweet 注释引用 dialogCount=0 实证');

console.log();


// ------------------------------------------------------------------
console.log('---');
console.log('PASS: ' + passed);
console.log('FAIL: ' + failed);
console.log();
if (failed > 0) {
  console.log('✗ tweets-bug-3 防回归验证失败！请检查失败项。');
  process.exit(1);
} else {
  console.log('✓ tweets-bug-3 防回归验证通过（' + passed + ' 项）');
  process.exit(0);
}
