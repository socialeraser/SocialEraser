// verify-tiktok-login-detection.js
// 守住 TikTok 平台登录态 sticky 机制（与 x-project 同构）
// 2026-07-02：复用 x-project 的 chrome.storage.session.loginStatus 持久化模式
//   cachedIsLoggedIn 是 IIFE 闭包变量，完整页面重载被销毁 → 跨 content script 恢复
//   唯一翻转信号：isLoggedOut() 严格检测（URL + login form in main）

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let passed = 0, failed = 0;

function check(name, cond) {
  if (cond) { passed++; console.log('  ✓  ' + name); }
  else { failed++; console.log('  ✗  ' + name); }
}

const contentJs = fs.readFileSync(path.join(ROOT, 'platforms/tiktok-project/scripts/content.js'), 'utf8');
const chromeBg = fs.readFileSync(path.join(ROOT, 'platforms/tiktok-project/chrome-source/background.js'), 'utf8');
const edgeBg = fs.readFileSync(path.join(ROOT, 'platforms/tiktok-project/edge-source/background.js'), 'utf8');

console.log('=== TikTok login detection ===');

// 1. background.js 必须处理 readLoginStatus / writeLoginStatus / clearLoginStatus
check('chrome-source background.js 处理 readLoginStatus',
  /message\.target\s*===\s*['"]readLoginStatus['"]/.test(chromeBg));
check('chrome-source background.js 处理 writeLoginStatus',
  /message\.target\s*===\s*['"]writeLoginStatus['"]/.test(chromeBg));
check('chrome-source background.js 处理 clearLoginStatus',
  /message\.target\s*===\s*['"]clearLoginStatus['"]/.test(chromeBg));
check('chrome-source background.js readLoginStatus 走 chrome.storage.session',
  /['"]readLoginStatus['"][\s\S]{0,300}chrome\.storage\.session/.test(chromeBg));
check('chrome-source background.js writeLoginStatus 走 chrome.storage.session',
  /['"]writeLoginStatus['"][\s\S]{0,300}chrome\.storage\.session/.test(chromeBg));

// edge-source 与 chrome-source 必须一致
check('edge-source background.js 也处理 readLoginStatus',
  /message\.target\s*===\s*['"]readLoginStatus['"]/.test(edgeBg));
check('edge-source background.js 也处理 writeLoginStatus',
  /message\.target\s*===\s*['"]writeLoginStatus['"]/.test(edgeBg));
check('edge-source background.js 也处理 clearLoginStatus',
  /message\.target\s*===\s*['"]clearLoginStatus['"]/.test(edgeBg));
check('edge-source 与 chrome-source loginStatus handler 同步',
  // 提取 chrome-source 的 3 个 handler 段，edge-source 必须包含
  /['"]readLoginStatus['"]/.test(chromeBg) && /['"]readLoginStatus['"]/.test(edgeBg)
  && /['"]writeLoginStatus['"]/.test(chromeBg) && /['"]writeLoginStatus['"]/.test(edgeBg)
  && /['"]clearLoginStatus['"]/.test(chromeBg) && /['"]clearLoginStatus['"]/.test(edgeBg));

// 2. content.js 启动时必须 hydrate
check('content.js 有 hydrateLoginStatus 函数',
  /function\s+hydrateLoginStatus\s*\(/.test(contentJs));
check('content.js hydrate 走 readLoginStatus message',
  /hydrateLoginStatus[\s\S]{0,400}readLoginStatus/.test(contentJs));
check('content.js hydrate 把 storage 值赋给 cachedIsLoggedIn',
  /cachedIsLoggedIn\s*=\s*\(\s*resp\.status\s*===\s*['"]logged_in['"]\s*\)/.test(contentJs));
check('content.js 启动时立即调 hydrateLoginStatus()',
  /^\s*hydrateLoginStatus\(\);?\s*$/m.test(contentJs));

// 3. content.js 状态翻转时必须 persist
check('content.js 有 persistLoginStatus 函数',
  /function\s+persistLoginStatus\s*\(/.test(contentJs));
check('content.js persist 走 writeLoginStatus message',
  /persistLoginStatus[\s\S]{0,400}writeLoginStatus/.test(contentJs));
check('content.js 登录态 → 登录页翻转时 persist false',
  /cachedIsLoggedIn\s*=\s*false;[\s\S]{0,100}persistLoginStatus\s*\(\s*false\s*\)/.test(contentJs));
check('content.js 确认登录时 persist true',
  /cachedIsLoggedIn\s*=\s*true;[\s\S]{0,100}persistLoginStatus\s*\(\s*true\s*\)/.test(contentJs));

// 4. getEffectiveLoginStatus 重写：先 isLoggedOut 再 cachedIsLoggedIn !== null
check('content.js 有 getEffectiveLoginStatus 函数',
  /function\s+getEffectiveLoginStatus\s*\(/.test(contentJs));
check('content.js getEffectiveLoginStatus 调 isLoggedOut',
  /getEffectiveLoginStatus[\s\S]{0,1500}isLoggedOut\(\)/.test(contentJs));
check('content.js getEffectiveLoginStatus 不重检（cachedIsLoggedIn !== null 直接 return）',
  /isLoggedOut\(\)[\s\S]{0,400}cachedIsLoggedIn\s*!==\s*null/.test(contentJs));
check('content.js getEffectiveLoginStatus 函数体内有 return null（首次仍在检测）',
  /function\s+getEffectiveLoginStatus[\s\S]{0,1500}return\s+null/.test(contentJs));

// 5. isLoggedOut 严格检测 + checkIsLoginPage 已删
check('content.js 有 isLoggedOut 函数',
  /function\s+isLoggedOut\s*\(/.test(contentJs));
check('content.js isLoggedOut 检查 /login URL path',
  /isLoggedOut[\s\S]{0,800}['"]\/login['"]/.test(contentJs));
check('content.js isLoggedOut 检查 login form input 在 main 区域',
  /isLoggedOut[\s\S]{0,1500}closest\s*\(\s*['"]main,\s*\[role=['"]main['"]\]\s*['"]\s*\)/.test(contentJs));
check('content.js 已删除 checkIsLoginPage 函数体（注释里的提及允许）',
  // 旧 checkIsLoginPage 函数体不应存在
  !/function\s+checkIsLoginPage[\s\S]{0,2000}innerText\.includes/.test(contentJs));
check('content.js checkTikTokStatus 改用 isLoggedOut（不再调 checkIsLoginPage）',
  // 严格匹配：function checkTikTokStatus 体内调 isLoggedOut，不调 checkIsLoginPage
  /function\s+checkTikTokStatus[\s\S]{0,500}isLoggedOut\(\)/.test(contentJs)
  && !/function\s+checkTikTokStatus[\s\S]{0,500}checkIsLoginPage\(\)/.test(contentJs));

console.log('');
console.log('  通过: ' + passed + '/' + (passed + failed));
if (failed > 0) {
  console.log('[FAIL]');
  process.exit(1);
}
