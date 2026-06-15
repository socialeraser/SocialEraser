// 回归检查：processTweets 的 BUILTIN_MORE_BUTTONS / BUILTIN_UNRETWEET_BUTTONS
// 背景：用户报告 tweets 批量删除 0 命中。诊断后发现 BUILTIN_MORE_BUTTONS 只有 4 个 selector，
//   X 当前 DOM 的 "more" 按钮可能用了 [data-testid="caret"] 之外的形态，需要更宽的兜底。
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const JS = fs.readFileSync(path.join(ROOT, 'chrome-extension/lib/injector.js'), 'utf8');

const checks = [];
const fail = [];
function check(name, cond, detail) {
  checks.push({ name, ok: !!cond, detail: detail || '' });
  if (!cond) fail.push({ name, detail });
}

// 提取 BUILTIN_MORE_BUTTONS 数组内容（用括号计数处理嵌套的 [data-testid='x']）
function extractArray(name) {
  const startRe = new RegExp('const\\s+' + name + '\\s*=\\s*\\[');
  const startMatch = startRe.exec(JS);
  if (!startMatch) return null;
  const startIdx = startMatch.index + startMatch[0].length;
  // 括号计数：从 startIdx 开始，遇见 [ 加 1，遇见 ] 减 1，到 0 结束
  let depth = 1;
  let i = startIdx;
  while (i < JS.length && depth > 0) {
    const ch = JS[i];
    if (ch === '[') depth++;
    else if (ch === ']') {
      depth--;
      if (depth === 0) break;
    }
    // 跳过字符串字面量内的 [ 和 ]（否则 'more' 里的 ] 会误关）
    else if (ch === '"' || ch === "'" || ch === '`') {
      const quote = ch;
      i++;
      while (i < JS.length && JS[i] !== quote) {
        if (JS[i] === '\\') i++;  // skip escape
        i++;
      }
    }
    i++;
  }
  if (depth !== 0) return null;
  const arrayBody = JS.substring(startIdx, i);
  // 提取每个字符串字面量：必须匹配同种引号并支持转义
  const items = [];
  let j = 0;
  while (j < arrayBody.length) {
    const c = arrayBody[j];
    if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      let k = j + 1;
      let value = '';
      while (k < arrayBody.length && arrayBody[k] !== quote) {
        if (arrayBody[k] === '\\' && k + 1 < arrayBody.length) {
          value += arrayBody[k + 1];
          k += 2;
        } else {
          value += arrayBody[k];
          k++;
        }
      }
      if (k < arrayBody.length) {
        items.push(value);
        j = k + 1;
      } else {
        j = k;
      }
    } else {
      j++;
    }
  }
  return items;
}

const moreButtons = extractArray('BUILTIN_MORE_BUTTONS');
const unretweetButtons = extractArray('BUILTIN_UNRETWEET_BUTTONS');

// 1. BUILTIN_MORE_BUTTONS 必须存在且 ≥ 8 个
check('BUILTIN_MORE_BUTTONS 存在且 ≥ 8 个 selector', moreButtons && moreButtons.length >= 8,
  '当前: ' + (moreButtons ? moreButtons.length : 'NOT FOUND'));

// 2. BUILTIN_UNRETWEET_BUTTONS 必须存在且 ≥ 5 个
check('BUILTIN_UNRETWEET_BUTTONS 存在且 ≥ 5 个 selector', unretweetButtons && unretweetButtons.length >= 5,
  '当前: ' + (unretweetButtons ? unretweetButtons.length : 'NOT FOUND'));

// 3. 核心 testid 必须保留（向后兼容）
// 注意：源文件用单引号（"-"[data-testid='more']"），不是双引号
check('BUILTIN_MORE_BUTTONS 保留 [data-testid=\'more\']',
  moreButtons && moreButtons.includes("[data-testid='more']"),
  '向后兼容 — 老扩展升级后还能匹配老的 X DOM');

check('BUILTIN_MORE_BUTTONS 保留 [data-testid=\'caret\']',
  moreButtons && moreButtons.includes("[data-testid='caret']"),
  '向后兼容 — caret 是常见 fallback');

check('BUILTIN_MORE_BUTTONS 保留 button[aria-label*=\'More\']',
  moreButtons && moreButtons.includes("button[aria-label*='More']"),
  '向后兼容 — aria-label 是 i18n 友好的');

// 4. 至少 1 个 role="button" 兜底（避免误中容器元素）
check('BUILTIN_MORE_BUTTONS 至少有 1 个 [role="button"] 形态 selector',
  moreButtons && moreButtons.some(s => /role=['"]button['"]/.test(s)),
  '排他规则：必须是按钮，避免误中 article / svg');

// 5. 至少 1 个非英文 i18n 兜底
check('BUILTIN_MORE_BUTTONS 至少有 1 个 i18n aria-label 兜底（中文/日文/韩文/西语/德语/法语）',
  moreButtons && moreButtons.some(s => /更多|その他|더 보기|más|mehr|plus/i.test(s)),
  'i18n fallback — 默认 en 不命中时走母语');

// 6. unretweet 必须保留 core testid
check('BUILTIN_UNRETWEET_BUTTONS 保留 [data-testid=\'unretweet\']',
  unretweetButtons && unretweetButtons.includes("[data-testid='unretweet']"));

check('BUILTIN_UNRETWEET_BUTTONS 保留 undoRepost / Undo repost 系列',
  unretweetButtons && unretweetButtons.some(s => /undoRepost|undo repost|unretweet|取消转帖|撤销转发/i.test(s)));

// 7. 诊断日志函数必须存在
check('logSelectorMatches 函数存在',
  /function\s+logSelectorMatches\s*\(\s*label\s*,\s*selectors\s*\)/.test(JS),
  '必须 form: function logSelectorMatches(label, selectors)');

// 8. diagnosticLogged 一次性 flag 必须存在
check('diagnosticLogged 一次性 flag 存在',
  /var\s+diagnosticLogged\s*=\s*false/.test(JS),
  '避免每个 iteration 都 spam log');

// 9. collectCandidates 内必须调 logSelectorMatches
check('collectCandidates 内部调 logSelectorMatches（once per cleanup）',
  /function\s+collectCandidates\s*\(\s*\)\s*{[\s\S]{0,500}logSelectorMatches\s*\(/.test(JS),
  '首次调用时打 selector 诊断');

// 10. 必须用 "累积" 模式（不能有 break）—— 防 X 改版后 mixed DOM 漏匹配
check('collectCandidates 不能再用 break 提前退出（累积所有 selector）',
  !/function\s+collectCandidates[\s\S]{0,1500}if\s*\(\s*btns\.length\s*>\s*0\s*\)\s*{\s*addAll[\s\S]{0,200}\bbreak\s*;/.test(JS),
  '之前 break 会漏掉"有的有 caret、有的有 more"的混合 DOM');

// 11. addAll 内部仍要 WeakSet 去重（防重复添加同一按钮）
check('addAll 内部仍用 WeakSet 去重',
  /function\s+addAll[\s\S]{0,300}seen\.has[\s\S]{0,200}seen\.add/.test(JS),
  '多个 selector 命中同一元素时不去重会重复处理');

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
