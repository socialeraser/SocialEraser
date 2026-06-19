// 回归检查：sidepanel.js 引用了哪些 els.xxx，必须有对应绑定
// 背景：之前加了 tweets 子选项的 4 个元素（opt-tweets / tweets-options-section /
//       opt-include-replies / opt-include-retweets）但忘了在 afterLangLoaded() 里绑，
//       导致 updateTweetsOptionsVisibility / getTweetsOptions 静默失效，子选项永远不显示。
// 这个测试会扫描所有 els.xxx 引用点，比对绑定点，缺一即 fail。
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'chrome-extension/sidepanel.js');
const HTML = path.join(ROOT, 'chrome-extension/sidepanel.html');
const js = fs.readFileSync(SRC, 'utf8');
const html = fs.readFileSync(HTML, 'utf8');

const checks = [];
const fail = [];
function check(name, cond, detail) {
  checks.push({ name, ok: !!cond, detail: detail || '' });
  if (!cond) fail.push({ name, detail });
}

// 1. 提取所有 els.<name> 引用（不区分大小写敏感）
//    排除 JS 原型方法（Array / Object / Promise）以避免把 els.length、els.forEach 等误判为"未绑定"
const PROTO_METHODS = new Set([
  'length', 'push', 'pop', 'shift', 'unshift', 'slice', 'splice', 'concat', 'join',
  'sort', 'reverse', 'map', 'forEach', 'filter', 'reduce', 'reduceRight', 'find',
  'findIndex', 'some', 'every', 'includes', 'indexOf', 'lastIndexOf', 'fill', 'flat',
  'flatMap', 'entries', 'keys', 'values', 'from', 'of', 'isArray', 'copyWithin',
  'constructor', 'hasOwnProperty', 'isPrototypeOf', 'propertyIsEnumerable',
  'toString', 'valueOf', 'toLocaleString', 'assign', 'defineProperty', 'then', 'catch', 'finally'
]);
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

// 4. 反向：每个绑定都对应 HTML 里真实的 id（防止"绑了一个不存在的 id"这种错位）
const htmlIds = new Set([...html.matchAll(/id=['"]([^'"]+)['"]/g)].map(x => x[1]));
const reIdRe = /els\.([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*document\.getElementById\(['"]([^'"]+)['"]\)/g;
const orphanBinds = [];
while ((m = reIdRe.exec(js)) !== null) {
  if (!htmlIds.has(m[2])) orphanBinds.push(m[1] + ' → #' + m[2]);
}
check('每个 els 绑定都对应 HTML 里真实存在的 id',
  orphanBinds.length === 0,
  '悬空绑定: ' + (orphanBinds.length ? orphanBinds.join(', ') : '无'));

console.log('');
console.log('  扫描结果: ' + refs.size + ' 处 els.<name> 引用, ' + binds.size + ' 处绑定');
console.log('');
for (const c of checks) {
  console.log((c.ok ? '  ✓  ' : '  ✗  ') + c.name + (c.detail && !c.ok ? ' — ' + c.detail : ''));
}
console.log('');
console.log('  通过: ' + (checks.length - fail.length) + '/' + checks.length);
if (fail.length > 0) {
  console.log('[FAIL]');
  process.exit(1);
}
