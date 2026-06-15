// 回归检查：dailyUsage 计数走单飞串行链（修复 read-modify-write 竞态）
// 修复背景：cleanupProgress 高频回调触发时，旧实现每次都 get → 修改 → set，
//   三步异步之间没有锁，导致 N 个并发累加只生效 1 次（用 30 条只记 15）。
// 修复：所有 dailyUsage 读写都串到一条 Promise 链（_dailyUsageChain）上。
//
// 本测试锁住 5 个防回归点：
//   1. _dailyUsageChain 模块级 Promise.resolve() 起点存在
//   2. getDailyUsage / incrementDailyUsage 都用串行模式
//   3. 两个函数都有 .catch 兜底（不毒化链）
//   4. incrementDailyUsage 内部 callback 在 resolve 之前触发（写后值）
//   5. 硬约束：chrome.storage 直接读写不能绕过链（防后人退化）
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'chrome-extension/sidepanel.js');
const js = fs.readFileSync(SRC, 'utf8');

const checks = [];
const fail = [];
function check(name, cond, detail) {
  checks.push({ name, ok: !!cond, detail: detail || '' });
  if (!cond) fail.push({ name, detail });
}

// 辅助：从函数名找起点，做 brace counting 提取函数体（兼容任意缩进和嵌套）
function extractFunctionBody(src, funcName) {
  const declRe = new RegExp('function\\s+' + funcName + '\\s*\\([^)]*\\)\\s*\\{');
  const m = declRe.exec(src);
  if (!m) return null;
  const start = declRe.lastIndex - 1; // 指向 `{`
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return src.substring(start + 1, i);
    }
  }
  return null;
}

function extractAllChainBlocks(src) {
  // 匹配 _dailyUsageChain = _dailyUsageChain.then(function() { ... }) 的整段
  // 用 brace counting 取 then 回调的函数体
  const headRe = /_dailyUsageChain\s*=\s*_dailyUsageChain\s*\.\s*then\s*\(\s*function\s*\(\s*\)\s*\{/g;
  const blocks = [];
  let m;
  while ((m = headRe.exec(src)) !== null) {
    const start = headRe.lastIndex - 1;
    let depth = 0;
    for (let i = start; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') {
        depth--;
        if (depth === 0) {
          blocks.push(src.substring(start + 1, i));
          break;
        }
      }
    }
  }
  return blocks;
}

// 1. _dailyUsageChain 模块级 Promise.resolve() 起点存在
check('_dailyUsageChain 模块级 Promise.resolve() 起点存在',
  /var\s+_dailyUsageChain\s*=\s*Promise\.resolve\s*\(\s*\)\s*;/.test(js),
  '声明行应为: var _dailyUsageChain = Promise.resolve();');

// 2. getDailyUsage 走串行链
const getBody = extractFunctionBody(js, 'getDailyUsage');
check('getDailyUsage 内部用 _dailyUsageChain = _dailyUsageChain.then(...) 串行',
  !!getBody && /_dailyUsageChain\s*=\s*_dailyUsageChain\s*\.\s*then\s*\(/.test(getBody),
  getBody ? 'function body 中应出现 _dailyUsageChain = _dailyUsageChain.then(...)' : 'getDailyUsage 函数未找到');

// 3. incrementDailyUsage 走串行链
const incBody = extractFunctionBody(js, 'incrementDailyUsage');
check('incrementDailyUsage 内部用 _dailyUsageChain = _dailyUsageChain.then(...) 串行',
  !!incBody && /_dailyUsageChain\s*=\s*_dailyUsageChain\s*\.\s*then\s*\(/.test(incBody),
  incBody ? 'function body 中应出现 _dailyUsageChain = _dailyUsageChain.then(...)' : 'incrementDailyUsage 函数未找到');

// 4. getDailyUsage 有 .catch 兜底（不毒化链）
check('getDailyUsage 末尾有 .catch 兜底（不毒化整条链）',
  !!getBody && /\.\s*catch\s*\(\s*function\s*\(/.test(getBody),
  '.catch 必须存在——链断了 = 后续所有计数全丢');

// 5. incrementDailyUsage 有 .catch 兜底
check('incrementDailyUsage 末尾有 .catch 兜底（不毒化整条链）',
  !!incBody && /\.\s*catch\s*\(\s*function\s*\(/.test(incBody),
  '.catch 必须存在——链断了 = 后续所有计数全丢');

// 6. incrementDailyUsage 内部 callback 在 resolve() 之前触发（保证写后值）
//    关键代码：set 回调里先 callback(x) 再 resolve(x)
check('incrementDailyUsage 内部 callback 必须在 resolve() 之前触发（写后值保证）',
  !!incBody &&
  /if\s*\(\s*callback\s*\)\s*callback\s*\([^)]+\)\s*;[\s\S]{0,80}resolve\s*\(/.test(incBody),
  '必须形如: if (callback) callback(x); resolve(x); — 不允许先 resolve 后 callback');

// 7. 硬约束：dailyUsage 相关的 chrome.storage.local 调用必须都在 _dailyUsageChain.then 块内
//    只 scope 到 dailyUsage 字段（chrome.storage.local.get(['dailyUsage']) 和
//    chrome.storage.local.set({ dailyUsage: ...)），其他 storage 调用（i18n / UI 状态）不算
//    防退化：未来有人改写"更简单"的实现，直接 chrome.storage.local.get/set 而不走链
const chainBlocks = extractAllChainBlocks(js);
const allChainContent = chainBlocks.join('\n');
const dailyUsageKeyCalls = (js.match(/chrome\.storage\.local\.(get|set)\s*\(\s*\[[^\]]*['"]dailyUsage['"][^\]]*\]\s*,\s*function|chrome\.storage\.local\.set\s*\(\s*\{\s*dailyUsage\s*:/g) || []).length;
const inChainDailyUsageCalls = (allChainContent.match(/chrome\.storage\.local\.(get|set)\s*\(\s*\[[^\]]*['"]dailyUsage['"][^\]]*\]\s*,\s*function|chrome\.storage\.local\.set\s*\(\s*\{\s*dailyUsage\s*:/g) || []).length;
check('dailyUsage 相关的 chrome.storage.local 调用都在 _dailyUsageChain.then 块内（不能绕过链）',
  dailyUsageKeyCalls === inChainDailyUsageCalls && dailyUsageKeyCalls > 0,
  'dailyUsage key 调用 ' + dailyUsageKeyCalls + ' 次, 链内 ' + inChainDailyUsageCalls + ' 次（必须相等且 > 0）');

// 8. 锁住每日 50 条上限常量（防被人悄悄改）
check('FREE_LIMIT_PER_DAY = 50 常量未变',
  /FREE_LIMIT_PER_DAY\s*=\s*50\b/.test(js),
  '免费额度上限必须保持 50（业务合同）');

// 9. _dailyUsageChain 声明附近（向前 200 字符）应有说明性注释
//    关键：注释在声明之前，所以要 look back，不能 look forward
const declIdx = js.search(/_dailyUsageChain\s*=\s*Promise\.resolve\s*\(\s*\)/);
const lookbackWindow = declIdx >= 0 ? js.substring(Math.max(0, declIdx - 200), declIdx) : '';
const hasKeyword = /(竞态|race|串行|单飞|排队|read-modify-write|read[\s_-]?modify[\s_-]?write)/i.test(lookbackWindow);
check('_dailyUsageChain 声明前 200 字符内有说明性注释（解释为什么需要）',
  hasKeyword,
  '注释必须解释"为什么需要链"（防止后人觉得多此一举删掉）');

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
