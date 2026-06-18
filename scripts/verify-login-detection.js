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
const contentJs = fs.readFileSync(path.join(ROOT, 'chrome-extension/content.js'), 'utf8');
const defaultCfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'chrome-extension/config/default.json'), 'utf8'));
const remoteCfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'chrome-extension/config/remote-example.json'), 'utf8'));

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
for (const cfgName of ['default.json', 'remote-example.json']) {
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
const CHECK_ELEMENTS_8LANG = ['zh-CN', 'zh-TW', 'en', 'ja', 'ko', 'es', 'de', 'fr'];
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
const sidepanelJs = fs.readFileSync(path.join(ROOT, 'chrome-extension/sidepanel.js'), 'utf8');

// 9.1 content.js 必须有 sticky 缓存变量
check('content.js 有 cachedIsLoggedIn sticky 变量',
  /let\s+cachedIsLoggedIn\s*=/.test(contentJs));

// 9.2 content.js 必须有 getEffectiveLoginStatus 函数 + 状态机逻辑
check('content.js 有 getEffectiveLoginStatus 函数',
  /function\s+getEffectiveLoginStatus\s*\(/.test(contentJs));
check('content.js 状态机：cached=true 时不重检 selector',
  /cachedIsLoggedIn\s*===\s*true[\s\S]{0,200}checkIsLoginPage/.test(contentJs));
check('content.js 状态机：返回 null 表示仍在检测',
  // 简化匹配：只要 getEffectiveLoginStatus 函数体内有"return null" 即可
  /function\s+getEffectiveLoginStatus[\s\S]{0,800}return\s+null/.test(contentJs));

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
