#!/usr/bin/env node
// 回归检查（多平台）：sidepanel.js 引用了哪些 els.xxx，必须有对应绑定
// 背景：之前加了 tweets 子选项的 4 个元素（opt-tweets / tweets-options-section /
//       opt-include-replies / opt-include-retweets）但忘了在 afterLangLoaded() 里绑，
//       导致 updateTweetsOptionsVisibility / getTweetsOptions 静默失效，子选项永远不显示。
// 这个测试会扫描所有 els.xxx 引用点，比对绑定点，缺一即 fail。
//
// 多平台支持：扫描 platforms/*-project/src/sidepanel.js + .html

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PLATFORMS_DIR = path.join(ROOT, 'platforms');

const PROTO_METHODS = new Set([
  'length', 'push', 'pop', 'shift', 'unshift', 'slice', 'splice', 'concat', 'join',
  'sort', 'reverse', 'map', 'forEach', 'filter', 'reduce', 'reduceRight', 'find',
  'findIndex', 'some', 'every', 'includes', 'indexOf', 'lastIndexOf', 'fill', 'flat',
  'flatMap', 'entries', 'keys', 'values', 'from', 'of', 'isArray', 'copyWithin',
  'constructor', 'hasOwnProperty', 'isPrototypeOf', 'propertyIsEnumerable',
  'toString', 'valueOf', 'toLocaleString', 'assign', 'defineProperty', 'then', 'catch', 'finally'
]);

function findPlatforms() {
  if (!fs.existsSync(PLATFORMS_DIR)) return [];
  return fs.readdirSync(PLATFORMS_DIR).filter(name => {
    const p = path.join(PLATFORMS_DIR, name);
    return fs.statSync(p).isDirectory() && /-project$/.test(name);
  });
}

function checkPlatform(platformName) {
  const jsPath = path.join(PLATFORMS_DIR, platformName, 'src', 'sidepanel.js');
  const htmlPath = path.join(PLATFORMS_DIR, platformName, 'src', 'sidepanel.html');
  if (!fs.existsSync(jsPath) || !fs.existsSync(htmlPath)) return null;

  const js = fs.readFileSync(jsPath, 'utf8');
  const html = fs.readFileSync(htmlPath, 'utf8');

  const checks = [];
  const fails = [];
  function check(name, cond, detail) {
    checks.push({ name, ok: !!cond, detail: detail || '' });
    if (!cond) fails.push({ name, detail });
  }

  // 1. 提取所有 els.<name> 引用
  const refs = new Set();
  const refRe = /els\.([a-zA-Z_][a-zA-Z0-9_]*)/g;
  let m;
  while ((m = refRe.exec(js)) !== null) {
    if (!PROTO_METHODS.has(m[1])) refs.add(m[1]);
  }

  // 2. 提取所有 els.<name> = ... 绑定点
  const binds = new Set();
  const bindRe = /els\.([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*document\.getElementById\(['"]([^'"]+)['"]\)/g;
  while ((m = bindRe.exec(js)) !== null) {
    binds.add(m[1]);
  }

  // 3. 关键：每个被引用的 name 都必须有绑定
  const missing = [...refs].filter(n => !binds.has(n));
  check('所有 els.<name> 引用都有对应 getElementById 绑定',
    missing.length === 0,
    '缺失: ' + (missing.length ? missing.join(', ') : '无'));

  // 4. 反向：每个绑定都对应 HTML 里真实的 id
  const htmlIds = new Set([...html.matchAll(/id=['"]([^'"]+)['"]/g)].map(x => x[1]));
  const reIdRe = /els\.([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*document\.getElementById\(['"]([^'"]+)['"]\)/g;
  const orphanBinds = [];
  while ((m = reIdRe.exec(js)) !== null) {
    if (!htmlIds.has(m[2])) orphanBinds.push(m[1] + ' → #' + m[2]);
  }
  check('每个 els 绑定都对应 HTML 里真实存在的 id',
    orphanBinds.length === 0,
    '悬空绑定: ' + (orphanBinds.length ? orphanBinds.join(', ') : '无'));

  return { refs, binds, checks, fails };
}

console.log('');
const platforms = findPlatforms();
let totalRefs = 0, totalBinds = 0, totalChecks = 0, totalFails = 0;

for (const p of platforms) {
  console.log('━━━ ' + p + ' ━━━');
  const result = checkPlatform(p);
  if (!result) {
    console.log('  (sidepanel.js or sidepanel.html missing — SKIP)');
    continue;
  }
  totalRefs += result.refs.size;
  totalBinds += result.binds.size;
  console.log('');
  console.log('  扫描结果: ' + result.refs.size + ' 处 els.<name> 引用, ' + result.binds.size + ' 处绑定');
  console.log('');
  for (const c of result.checks) {
    console.log((c.ok ? '  ✓  ' : '  ✗  ') + c.name + (c.detail && !c.ok ? ' — ' + c.detail : ''));
  }
  console.log('');
  console.log('  通过: ' + (result.checks.length - result.fails.length) + '/' + result.checks.length);
  totalChecks += result.checks.length;
  totalFails += result.fails.length;
}

console.log('━'.repeat(50));
console.log('Summary: ' + (totalChecks - totalFails) + ' passed, ' + totalFails + ' failed (across ' + platforms.length + ' platform(s))');
console.log('Total: ' + totalRefs + ' els.<name> refs, ' + totalBinds + ' bindings');
if (totalFails > 0) {
  console.log('[FAIL]');
  process.exit(1);
}
