// 全量回归检查：批量删除 Following 功能
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const checks = [];
const fail = [];
function check(name, cond, detail) {
  checks.push({ name, ok: !!cond, detail });
  if (!cond) fail.push({ name, detail });
}

// 1. JSON 合法性
const defaultCfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'platforms/x-project/src/config/default.json'), 'utf8'));
const remoteCfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'platforms/x-project/src/config/x-remote-example.json'), 'utf8'));
check('default.json JSON 合法', true);
check('x-remote-example.json JSON 合法', true);

// 2. JSON 中 following 配置结构
const newKeys = ['container', 'unfollowButtons', 'confirmButton'];
for (const cfgName of ['default.json', 'x-remote-example.json']) {
  const cfg = cfgName === 'default.json' ? defaultCfg : remoteCfg;
  const f = cfg.selectors && cfg.selectors.following;
  check(`${cfgName} 含 following 配置`, !!f, JSON.stringify(f).slice(0, 100));
  for (const k of newKeys) {
    check(`${cfgName}.following.${k} 存在`, f && (k in f));
  }
  check(`${cfgName}.following.unfollowButtons 是数组`, Array.isArray(f && f.unfollowButtons));
  check(`${cfgName}.following.unfollowButtons 至少 2 个`, f && f.unfollowButtons && f.unfollowButtons.length >= 2);
  // 旧字段不应残留
  check(`${cfgName}.following.unfollowButton (旧) 不应存在`, !(f && 'unfollowButton' in f));
  check(`${cfgName}.following.followingTab (旧) 不应存在`, !(f && 'followingTab' in f));
  check(`${cfgName}.following.followingTabValue (旧) 不应存在`, !(f && 'followingTabValue' in f));
}

// 3. content.js 改动
const content = fs.readFileSync(path.join(ROOT, 'platforms/x-project/scripts/content.js'), 'utf8');
check('content.js 含 getFollowingPageURL', content.includes('function getFollowingPageURL()'));
check('content.js getPageURLForType 含 following 分支',
  /getPageURLForType\s*\([^)]*\)\s*{[\s\S]*?if\s*\(\s*type\s*===\s*['"]following['"]\s*\)\s*return\s+getFollowingPageURL\(\)/.test(content));
check('content.js handleStartCleanup 含 following 跳转',
  /types\.indexOf\(['"]following['"]\)\s*>=\s*0/.test(content));
check('content.js detectPageType 含 /following 检测', content.includes("url.includes('/following')"));

// 4. injector.js 改动
const injector = fs.readFileSync(path.join(ROOT, 'platforms/x-project/scripts/x-automation.js'), 'utf8');
// 2026-XX-XX 案例 6 改造后 selector 不再走 DEFAULT_SELECTORS 而是从 config.following 读
// 改测：injector 内部有 following 分支 + 引用 this.config.following.unfollowButtons / confirmButton
check('injector 读 this.config.following.unfollowButtons 数组',
  /this\.config\.following\s*\n?\s*\.unfollowButtons/.test(injector) ||
  /this\.config\s*&&\s*this\.config\.following\s*&&\s*Array\.isArray\(\s*this\.config\.following\.unfollowButtons/.test(injector) ||
  /Array\.isArray\(\s*selectors\.unfollowButtons\s*\)/.test(injector));
check('injector 读 this.config.following.confirmButton（带回退到 common.confirmButton）',
  /following\.confirmButton[\s\S]{0,80}common\.confirmButton/.test(injector) ||
  /following\s*&&\s*this\.config\.following\.confirmButton/.test(injector));
check('injector 含 processFollowing 方法',
  /async\s+processFollowing\s*\(\s*maxItems\s*\)/.test(injector));
check('injector processItems 含 following 分支',
  /if\s*\(\s*itemType\s*===\s*['"]following['"]\s*\)\s*{\s*await\s+this\.processFollowing/.test(injector));
check('injector shouldFilter 含 following',
  /shouldFilter\s*\([^)]*\)\s*{[\s\S]*?itemType\s*===\s*['"]following['"]/.test(injector));
check('injector unfollowUser 兼容 unfollowButtons 数组',
  /unfollowUser[\s\S]*?Array\.isArray\(selectors\.unfollowButtons\)/.test(injector));
// 2026-XX-XX 案例 6 改造后：extractMeta for following 不再硬编码 User-Name selector，改从 this.config.common.userInfo.userName 读
// 改测：extractMeta 内部有 following 分支 + 读 userInfo.userName
check('injector extractMeta 支持 following 文本提取（走 config.common.userInfo）',
  /extractMeta[\s\S]*?itemType\s*===\s*['"]following['"][\s\S]*?userInfo/.test(injector));

// Bug fix：无进展超时（订阅用户不应被批量时长卡住）
const oldTotalTimeout = injector.match(/MAX_DURATION_MS|startedAt/g);
check('injector 不再有"总时长超时"（订阅用户不受批量时长限制）',
  !oldTotalTimeout || oldTotalTimeout.length === 0,
  '仍存在 ' + (oldTotalTimeout && oldTotalTimeout.length) + ' 处旧字段');
const stuckTimeoutCount = injector.match(/STUCK_TIMEOUT_MS\s*=\s*30000/g);
check('injector 使用"无进展超时"（6 处：6-type 重构后 6 个 process 函数各 1：processLikes / processBookmarks / processFollowing / processOriginalTweets / processReplies / processRetweets）',
  stuckTimeoutCount && stuckTimeoutCount.length === 6,
  '实际 ' + (stuckTimeoutCount && stuckTimeoutCount.length) + ' 处');
// 6-type 重构后：likes/bookmarks/originalTweets/replies/retweets 各 1 处，following 2 处（confirmByTestid 命中 + no confirm dialog 兜底）
const resetCount = injector.match(/processedCount\+\+[\s\S]{0,100}lastProgressTime\s*=\s*Date\.now\(\)/g);
check('injector 每个 processedCount++ 都重置无进展计时器（7 处：6 个 process 函数 success 分支，但 processFollowing 有 2 个 success 分支）',
  resetCount && resetCount.length === 7,
  '实际 ' + (resetCount && resetCount.length) + ' 处（预期 7：likes 1 + bookmarks 1 + following 2 + originalTweets 1 + replies 1 + retweets 1）');
check('injector 使用 cleanupStuck i18n key（不再有 cleanupTimeout）',
  injector.includes("t('cleanupStuck')") && !injector.includes("t('cleanupTimeout')"));

// Bug fix：maxPerType 是总预算，不应每个 type 都拿
check('injector 修正 maxPerType 作为总预算共享（不再每个 type 直接传 maxPerType）',
  /Math\.max\(\s*0\s*,\s*totalBudget\s*-\s*this\.processedCount\s*\)/.test(injector),
  '缺少 totalBudget - processedCount 剩余预算计算');
check('injector 预算归零时 break（不再无脑遍历所有 type）',
  /remainingForType\s*<=\s*0[\s\S]{0,200}break/.test(injector),
  '缺少 remainingForType <= 0 break 逻辑');

// 新功能：option-count 状态机（pending → processing → done）
check('injector 暴露 onTypeStart / onTypeComplete 回调',
  injector.includes('this.onTypeStart = null') && injector.includes('this.onTypeComplete = null'));
check('injector 在每个 type 循环里调 onTypeStart + onTypeComplete',
  /this\.onTypeStart\s*\(\s*type\s*\)/.test(injector) &&
  /this\.onTypeComplete\s*\(\s*type\s*,\s*typeProcessed\s*\)/.test(injector));

const sidepanelJs2 = fs.readFileSync(path.join(__dirname, '..', 'platforms/x-project/src/sidepanel.js'), 'utf8');
const sidepanelHtml2 = fs.readFileSync(path.join(__dirname, '..', 'platforms/x-project/src/sidepanel.html'), 'utf8');

check('content.js 转发 cleanupTypeStart / cleanupTypeComplete 到 sidepanel',
  content.includes("type: 'cleanupTypeStart'") && content.includes("type: 'cleanupTypeComplete'"));

check('sidepanel.js 监听 cleanupTypeStart（pending → processing）',
  sidepanelJs2.includes("msg.type === 'cleanupTypeStart'"));
check('sidepanel.js 监听 cleanupTypeComplete（processing → done）',
  sidepanelJs2.includes("msg.type === 'cleanupTypeComplete'"));

check('sidepanel.js 有 setOptionState 状态机函数（idle/pending/processing/done）',
  /function\s+setOptionState\([^)]*state/.test(sidepanelJs2) &&
  /pending/.test(sidepanelJs2) && /processing/.test(sidepanelJs2) && /done/.test(sidepanelJs2));

check('sidepanel.js Start Cleanup 时把所有项 reset 后设选中项 pending',
  /resetAllOptionStates\s*\(\s*\)/.test(sidepanelJs2) &&
  /options\.forEach[\s\S]{0,200}setOptionState\(\s*type\s*,\s*['"]pending['"]\s*\)/.test(sidepanelJs2));

check('sidepanel.js Stop 时 reset 所有 option-count 到 idle',
  /function\s+stopCleanup\s*\(\s*\)\s*\{[\s\S]*?resetAllOptionStates\s*\(\s*\)/.test(sidepanelJs2) &&
  /function\s+onStopped\s*\(\s*\)\s*\{[\s\S]*?resetAllOptionStates\s*\(\s*\)/.test(sidepanelJs2));

check('sidepanel.html 有 spinner 动画 + pending/processing/done 三态样式',
  /@keyframes\s+option-spin/.test(sidepanelHtml2) &&
  /\.option-item\.pending/.test(sidepanelHtml2) &&
  /\.option-item\.processing/.test(sidepanelHtml2) &&
  /\.option-item\.done/.test(sidepanelHtml2));

// 新功能：status-card 一切正常时延迟 1s 自动收起
check('sidepanel.html status-card 有 id="status-card"',
  /id="status-card"/.test(sidepanelHtml2));
check('sidepanel.html status-card.hidden 样式存在（max-height:0 / opacity:0 / transition）',
  /\.status-card\.hidden/.test(sidepanelHtml2) &&
  /max-height:\s*0/.test(sidepanelHtml2) &&
  /opacity:\s*0/.test(sidepanelHtml2) &&
  /transition:/.test(sidepanelHtml2));

check('sidepanel.js state 包含 statusHideTimer 字段',
  /statusHideTimer:\s*null/.test(sidepanelJs2));

check('sidepanel.js updateUI 末尾有 auto-hide 逻辑（allOk + 1s 定时器 + add hidden）',
  /var\s+allOk\s*=/.test(sidepanelJs2) &&
  /state\.isX\s*&&\s*state\.isLoggedIn\s*===\s*true/.test(sidepanelJs2) &&
  /setTimeout\(/.test(sidepanelJs2) &&
  /classList\.add\(['"]hidden['"]\)/.test(sidepanelJs2) &&
  /},\s*1000\s*\)/.test(sidepanelJs2));

check('sidepanel.js auto-hide 异常时立即重新展开（clearTimeout + removeClass hidden）',
  /clearTimeout\(\s*state\.statusHideTimer\s*\)/.test(sidepanelJs2) &&
  /statusCard\.classList\.remove\(['"]hidden['"]\)/.test(sidepanelJs2));

// 结构性检查：每个 UI checkbox 都有对应的 getXxxPageURL + processXxx / handler
// 防止"checkbox 在 UI 上但底层未实现"的状态混淆
// 注意：不包含 'messages' —— X 的消息按钮 click handler 校验 isTrusted
//   content script 注入的 click 事件 isTrusted=false，会被静默忽略
//   详见 README "已知限制" + lessons-learned 案例，特性主动不支持
// 6-type 重构（2026-06-17）：tweets 拆成 originalTweets / replies / retweets 3 个独立顶层类型
//   - type 用 camelCase（processXxx 函数名 + getPageURLForType 分支 key 一致）
//   - domId 用 kebab-case（sidepanel.html 实际 id 形式：opt-original-tweets 而非 opt-originalTweets）
const uiTypes = [
  { type: 'originalTweets', domId: 'original-tweets' },
  { type: 'replies',        domId: 'replies' },
  { type: 'retweets',       domId: 'retweets' },
  { type: 'likes',          domId: 'likes' },
  { type: 'bookmarks',      domId: 'bookmarks' },
  { type: 'following',      domId: 'following' },
];
uiTypes.forEach(function(item) {
  const type = item.type;
  const domId = item.domId;
  // 1. UI checkbox 存在（用 domId 匹配 HTML id）
  const checkboxRe = new RegExp('id="opt-' + domId + '"');
  check('结构完整性：UI 有 opt-' + domId + ' checkbox', checkboxRe.test(sidepanelHtml2));

  // 2. content.js 有 getPageURLForType 分支
  const getUrlRe = new RegExp("type === '" + type + "'[\\s\\S]{0,80}get\\w*PageURL\\([^)]*\\)");
  check('结构完整性：getPageURLForType 覆盖 ' + type, getUrlRe.test(content));

  // 3. injector.js 有对应处理（processXxx 专用 OR 通用循环 handler）
  const hasProcess = new RegExp('process' + type.charAt(0).toUpperCase() + type.slice(1) + '\\(').test(injector);
  const hasHandler = new RegExp("itemType\\s*===\\s*['\"]" + type + "['\"]").test(injector);
  check('结构完整性：injector 有 ' + type + ' 的处理（processXxx 或 handler）', hasProcess || hasHandler);
});

// 5. i18n.js 改动（已有脚本 verify-i18n.js 检查，跳过）

// 6. sidepanel.html / sidepanel.js 不应破坏
const sidepanelHtml = fs.readFileSync(path.join(ROOT, 'platforms/x-project/src/sidepanel.html'), 'utf8');
check('sidepanel.html 含 opt-following checkbox', sidepanelHtml.includes('id="opt-following"'));
const sidepanelJs = fs.readFileSync(path.join(ROOT, 'platforms/x-project/src/sidepanel.js'), 'utf8');
check('sidepanel.js checkboxIds 含 following', /checkboxIds\s*=\s*\[[\s\S]*?['"]opt-following['"]/.test(sidepanelJs));
check('sidepanel.js optionNames 含 following', /optionNames\s*=\s*\[[\s\S]*?['"]following['"]/.test(sidepanelJs));

// 7. 不留死代码：content.js handleStartCleanup 中 6 个跳转分支应保持一致结构
//   6-type 重构后：replies/retweets 跳 /with_replies（pageType === 'tweetTimeline'），
//   所以 pageType 判定值与 types.indexOf 的 type 不一定一致（replies/retweets 用 tweetTimeline，其他 4 个用 type 自身），
//   不再用 \1 反向引用，直接数 types.indexOf('X') 出现次数
const navBranches = content.match(/types\.indexOf\(['"](\w+)['"]\)\s*>=\s*0\s*&&/g);
check('handleStartCleanup 含 6 个跳转分支（6-type 重构后）', navBranches && navBranches.length === 6,
  '实际: ' + (navBranches && navBranches.length));

// 报告
console.log('=== Following 批量取消关注 — 回归检查 ===\n');
for (const c of checks) {
  console.log((c.ok ? '  ✓' : '  ✗') + '  ' + c.name + (c.detail && !c.ok ? '  →  ' + c.detail : ''));
}
console.log('\n  通过: ' + (checks.length - fail.length) + '/' + checks.length);
if (fail.length) {
  console.log('\n[FAIL]');
  process.exit(1);
} else {
  console.log('\n[OK] 全部通过');
}