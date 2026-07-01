// 回归检查：登录态检测的 selector 健壮性
// 修复背景：/home → /likes 或 /bookmarks SPA 跳转时，原 GLOBAL_LOGIN_INDICATORS
//   包含 [data-testid='AppBody-Assistor']（X 已移除）和 [data-testid='tweetTextarea_0']（仅 /home 存在），
//   导致 checkLoginStatus 在 /likes /bookmarks 误判为未登录。
// 修复：用侧栏稳定元素（compose / bookmarks / messages / notifications 链接）兜底。
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const checks = [];
const fail = [];
function check(name, cond, detail) {
  checks.push({ name, ok: !!cond, detail });
  if (!cond) fail.push({ name, detail });
}

// 1. 读取 3 个文件（lib/config.js 已删 —— 2026-XX-XX 重构移除了死代码）
const contentJs = fs.readFileSync(path.join(ROOT, 'platforms/x-project/scripts/content.js'), 'utf8');
const defaultCfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'platforms/x-project/src/config/default.json'), 'utf8'));
const remoteCfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'platforms/x-project/src/config/x-remote-example.json'), 'utf8'));

// 2. 必须含有的侧栏稳定 selector（任何登录页都有）
// 2026-XX-XX 精简：删 a[href='/i/bookmarks']（X 2026 侧栏已无 bookmarks 直链）
//   改测 a[href='/home'] + a[href^='/i/chat']（X 2026 真实路径）
const REQUIRED_SIDEBAR_ANCHORS = [
  "a[href='/compose/post']",                  // 撰写链接
  "a[href='/home']",                          // Home 链接
  "a[href^='/i/chat']",                       // Direct Messages（X 2026 路径）
  "a[href^='/notifications']",                // 通知链接
  "[data-testid^='AppTabBar_']",              // 任意侧栏 tab
  "[data-testid^='SideNav_AccountSwitcher']", // 账户切换（前缀匹配，X 加了 _Button 后缀）
  "[data-testid^='UserAvatar-Container']",    // 用户头像（前缀匹配，X 加了 -<username> 后缀）
];

// 3. 必须删除的脆弱 selector（已 X 改版 / 仅 /home 存在）
const FORBIDDEN = [
  "[data-testid='AppBody-Assistor']",  // X 已移除
  "[data-testid='tweetTextarea_0']",   // 仅 /home 存在
];

// 4. content.js GLOBAL_LOGIN_INDICATORS 必须包含所有侧栏锚点
for (const anchor of REQUIRED_SIDEBAR_ANCHORS) {
  const escaped = anchor.replace(/'/g, "\\'").replace(/\^/g, '\\^').replace(/\[/g, '\\[').replace(/\]/g, '\\]');
  // 简单 substring 匹配（考虑引号转义）
  const has = contentJs.includes(anchor) || contentJs.includes(anchor.replace(/'/g, "\\'"));
  check('content.js GLOBAL_LOGIN_INDICATORS 含 ' + anchor, has);
}

// 5. content.js 必须删除脆弱 selector
for (const bad of FORBIDDEN) {
  // 必须从 GLOBAL_LOGIN_INDICATORS 数组区域不再出现
  const indicatorsStart = contentJs.indexOf('GLOBAL_LOGIN_INDICATORS = [');
  const indicatorsEnd = contentJs.indexOf('];', indicatorsStart);
  const indicatorsBlock = contentJs.substring(indicatorsStart, indicatorsEnd);
  const stillPresent = indicatorsBlock.includes(bad);
  check('content.js GLOBAL_LOGIN_INDICATORS 不含 ' + bad, !stillPresent);
}

// 6. config/*.json loggedInElements 必须包含所有侧栏锚点
for (const cfgName of ['default.json', 'x-remote-example.json']) {
  const cfg = cfgName === 'default.json' ? defaultCfg : remoteCfg;
  const loggedIn = cfg.selectors && cfg.selectors.login && cfg.selectors.login.loggedInElements;
  check(cfgName + ' 有 selectors.login.loggedInElements', Array.isArray(loggedIn) && loggedIn.length > 0);
  if (Array.isArray(loggedIn)) {
    const values = loggedIn.map(e => e.value);
    for (const anchor of REQUIRED_SIDEBAR_ANCHORS) {
      check(cfgName + '.loggedInElements 含 ' + anchor, values.includes(anchor));
    }
    for (const bad of FORBIDDEN) {
      check(cfgName + '.loggedInElements 不含 ' + bad, !values.includes(bad));
    }
  }
}

// 7. content.js DEFAULT_CHECK_ELEMENTS_8LANG 必须 8 语言齐全 + 包含 loginButton 稳定 selector
//    （原本是 lib/config.js DEFAULT_CONFIG.selectors.login.checkElements，
//      2026-XX-XX 重构移到这里 —— lib/config.js 已删，兜底统一在 content.js）
const CHECK_ELEMENTS_8LANG = ['zh-CN', 'en', 'ja', 'ko', 'pt', 'es', 'de', 'fr'];
const checkElementsStart = contentJs.indexOf('DEFAULT_CHECK_ELEMENTS_8LANG = {');
const checkElementsEnd = checkElementsStart >= 0 ? contentJs.indexOf('};', checkElementsStart) + 2 : -1;
const checkElementsBlock = checkElementsStart >= 0 ? contentJs.substring(checkElementsStart, checkElementsEnd) : '';

check('content.js DEFAULT_CHECK_ELEMENTS_8LANG 存在', checkElementsBlock.length > 0);
for (const lang of CHECK_ELEMENTS_8LANG) {
  const langStart = checkElementsBlock.indexOf("'" + lang + "':");
  check('DEFAULT_CHECK_ELEMENTS_8LANG 含 ' + lang, langStart > 0);
  if (langStart > 0) {
    const langEnd = checkElementsBlock.indexOf(']', langStart) + 1;
    const langBlock = checkElementsBlock.substring(langStart, langEnd);
    check(lang + ' 块含 [data-testid=\'loginButton\']', langBlock.includes("'loginButton'"));
    check(lang + ' 块至少有 2 条文字 + 1 条 selector', langBlock.split('{').length >= 4); // { type:..., value:... } × 3
  }
}
check('getLoginConfig 兜底引用 DEFAULT_CHECK_ELEMENTS_8LANG',
  contentJs.includes('checkElements: DEFAULT_CHECK_ELEMENTS_8LANG'));

// 8. content.js getLoginConfig() 兜底也必须包含
//    注：extractArrayBlock 函数定义在 section 7 之前（与配置扫描逻辑共享）
function extractArrayBlock(source, key) {
  const start = source.indexOf(key + ': [');
  if (start < 0) return '';
  let depth = 0;
  for (let i = start + key.length + 2; i < source.length; i++) {
    const ch = source[i];
    if (ch === '[') depth++;
    else if (ch === ']') {
      if (depth === 0) return source.substring(start, i + 1);
      depth--;
    }
  }
  return source.substring(start);
}
const glcBlock = extractArrayBlock(
  contentJs.substring(contentJs.indexOf('getLoginConfig')),
  'loggedInElements'
);
if (glcBlock) {
  for (const anchor of REQUIRED_SIDEBAR_ANCHORS) {
    check('content.js getLoginConfig 兜底含 ' + anchor, glcBlock.includes(anchor));
  }
  for (const bad of FORBIDDEN) {
    check('content.js getLoginConfig 兜底不含 ' + bad, !glcBlock.includes(bad));
  }
}

// ============================================================
// 9. sticky 状态机（修复 /home→/likes 闪 Not logged in 的核心）
// ============================================================
const sidepanelJs = fs.readFileSync(path.join(ROOT, 'platforms/x-project/src/sidepanel.js'), 'utf8');

// 9.1 content.js 必须有 sticky 缓存变量
check('content.js 有 cachedIsLoggedIn sticky 变量',
  /let\s+cachedIsLoggedIn\s*=/.test(contentJs));

// 9.2 content.js 必须有 getEffectiveLoginStatus 函数 + 状态机逻辑
check('content.js 有 getEffectiveLoginStatus 函数',
  /function\s+getEffectiveLoginStatus\s*\(/.test(contentJs));
check('content.js 状态机：cached=true 时不重检 selector',
  // 2026-07-01 重写：先用 isLoggedOut() 检查登出（唯一翻转信号），
  //   然后 cachedIsLoggedIn !== null 时直接 return，不跑 checkLoginStatus()
  /isLoggedOut\(\)[\s\S]{0,400}cachedIsLoggedIn\s*!==\s*null/.test(contentJs));
check('content.js 状态机：返回 null 表示仍在检测',
  // 简化匹配：只要 getEffectiveLoginStatus 函数体内有"return null" 即可
  // 2026-07-01: 函数体因 persistLoginStatus 插入变长，扩大窗口到 1500 字符
  /function\s+getEffectiveLoginStatus[\s\S]{0,1500}return\s+null/.test(contentJs));

// 9.3 sidepanel.js 必须 init state.isLoggedIn 为 null（不要预设 false）
check('sidepanel.js state.isLoggedIn 初始为 null（显示"检测中"，不预判"未登录"）',
  /isLoggedIn:\s*null/.test(sidepanelJs));

// 9.4 sidepanel.js 不再有 10s retry 循环和 silent 轮询（删除过度设计）
check('sidepanel.js 已删除 startLoginCheck 函数',
  !/function\s+startLoginCheck\s*\(/.test(sidepanelJs));
check('sidepanel.js 已删除 LOGIN_CHECK_DURATION 常量',
  !/LOGIN_CHECK_DURATION/.test(sidepanelJs));
check('sidepanel.js 已删除 10s silent 轮询 setInterval',
  !/setInterval\s*\(\s*function\s*\(\s*\)\s*\{\s*checkXTabStatus\s*\(\s*true\s*\)\s*;\s*\}\s*,\s*10000\s*\)/.test(sidepanelJs));

// 9.5 sidepanel.js 必须有 applyStatusFromContent 工具函数（统一处理 content 响应）
check('sidepanel.js 有 applyStatusFromContent 函数',
  /function\s+applyStatusFromContent\s*\(/.test(sidepanelJs));

// 9.6 content.js checkXStatus 必须用 getEffectiveLoginStatus
check('content.js checkXStatus 走 sticky 状态机',
  /isX\s*\?\s*getEffectiveLoginStatus/.test(contentJs));

// 9.7 content.js 必须有 isLoggedOut 严格登出检测（替代原 checkIsLoginPage）
//    2026-07-01：原 checkIsLoginPage 用 innerText.includes() 模糊匹配，
//    在 account switcher / share dialog / tooltip 含 "Sign in" 文字的页面会误判。
//    新版只查 URL 路径 + 登录表单 input 在主区域。
check('content.js 有 isLoggedOut 函数',
  /function\s+isLoggedOut\s*\(/.test(contentJs));
check('content.js isLoggedOut 检查 URL pathname 是 /login',
  /isLoggedOut[\s\S]{0,800}['"]\/login['"]/.test(contentJs));
check('content.js isLoggedOut 检查 login form input 在 main 区域',
  /isLoggedOut[\s\S]{0,1500}closest\s*\(\s*['"]main,\s*\[role=['"]main['"]\]\s*['"]\s*\)/.test(contentJs));
check('content.js 已删除 checkIsLoginPage 模糊 innerText 匹配',
  // 旧的 innerText.includes 误判源头必须被删除（注释里的提及允许）
  // 检查函数体：function checkIsLoginPage 之后到函数结束不应有 innerText.includes
  !/function\s+checkIsLoginPage[\s\S]{0,2000}innerText\.includes/.test(contentJs));
check('content.js getEffectiveLoginStatus 调 isLoggedOut（替代 checkIsLoginPage）',
  /getEffectiveLoginStatus[\s\S]{0,1500}isLoggedOut\(\)/.test(contentJs));

// ============================================================
// 10. sticky 持久化（修复 forcePageLoad 跳页后侧栏闪 "Not logged in"）
//    cachedIsLoggedIn 是 IIFE 闭包变量，完整页面重载被销毁。
//    必须经 chrome.storage.session 持久化才能跨 content script 生命周期。
// ============================================================
const backgroundJs = fs.readFileSync(path.join(ROOT, 'platforms/x-project/chrome-source/background.js'), 'utf8');

// 10.1 background.js 必须处理 readLoginStatus / writeLoginStatus / clearLoginStatus
check('background.js 处理 readLoginStatus message',
  /message\.target\s*===\s*['"]readLoginStatus['"]/.test(backgroundJs));
check('background.js 处理 writeLoginStatus message',
  /message\.target\s*===\s*['"]writeLoginStatus['"]/.test(backgroundJs));
check('background.js 处理 clearLoginStatus message',
  /message\.target\s*===\s*['"]clearLoginStatus['"]/.test(backgroundJs));
check('background.js readLoginStatus 走 chrome.storage.session',
  /['"]readLoginStatus['"][\s\S]{0,300}chrome\.storage\.session/.test(backgroundJs));
check('background.js writeLoginStatus 走 chrome.storage.session',
  /['"]writeLoginStatus['"][\s\S]{0,300}chrome\.storage\.session/.test(backgroundJs));

// 10.2 content.js 启动时必须 hydrate（从 storage 读回 cachedIsLoggedIn）
check('content.js 有 hydrateLoginStatus 函数',
  /function\s+hydrateLoginStatus\s*\(/.test(contentJs));
check('content.js hydrate 走 readLoginStatus message',
  /hydrateLoginStatus[\s\S]{0,400}readLoginStatus/.test(contentJs));
check('content.js hydrate 把 storage 值赋给 cachedIsLoggedIn',
  /cachedIsLoggedIn\s*=\s*\(\s*resp\.status\s*===\s*['"]logged_in['"]\s*\)/.test(contentJs));
check('content.js 启动时立即调 hydrateLoginStatus()',
  /^\s*hydrateLoginStatus\(\);?\s*$/m.test(contentJs));

// 10.3 content.js 状态翻转时必须 persist
check('content.js 有 persistLoginStatus 函数',
  /function\s+persistLoginStatus\s*\(/.test(contentJs));
check('content.js persist 走 writeLoginStatus message',
  /persistLoginStatus[\s\S]{0,400}writeLoginStatus/.test(contentJs));
check('content.js 登录态 → 登录页翻转时 persist false',
  /cachedIsLoggedIn\s*=\s*false;[\s\S]{0,100}persistLoginStatus\s*\(\s*false\s*\)/.test(contentJs));
check('content.js 确认登录时 persist true',
  /cachedIsLoggedIn\s*=\s*true;[\s\S]{0,100}persistLoginStatus\s*\(\s*true\s*\)/.test(contentJs));

// 输出
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
