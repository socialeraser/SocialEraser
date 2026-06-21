// 回归检查：sidepanel.js 的 "已处理" 跨 type + 跨 X 页面 累加
// 修复背景（用户报告）：
//   现象：3 个 type 各清 1 条，sidepanel 显示 "Processed: 1 / 50"，
//   cleanupCompleted log 也是 "Total processed: 1"。
//
//   真正根因（2026-06-21 复盘）：
//     x-automation 的 this.processedCount 在 content script 每次 page
//     navigation（/likes → /replies → /retweets → /bookmarks → /following）
//     重新注入时归零（新 XEraserInjector 实例），所以 msg.data.count 只
//     是当前 type 当前页的局部计数，不是真正的跨页累计。
//     证据：日志 "Retweet undone #1..#7"（累计的话应是 #3..#9）、
//          "Removed bookmark #1"（应是 #10）→ 证实每页 processedCount 归零。
//
//   老 fix（commit 2ac79df）"state.processedItems = newCount" 直接覆盖，
//   在老版本（所有 type 在同一页串行处理、content script 不重注入）下能
//   work，但在 6-type 重构 + 跨页导航后是错的 —— 把累计总数覆成当前
//   type 当前页的局部计数。
//
//   真修复（2026-06-21）：在 sidepanel 端维护跨 type + 跨页累计：
//     ```js
//     // cleanupTypeStart 时快照"到目前为止的跨 type 累计总数"
//     state.typeStartCumulative = state.processedItems;
//     // cleanupProgress 时用基线 + 本 type 本页的 local 计数 = 真正累计
//     state.processedItems = state.typeStartCumulative + newCount;
//     ```
//
// 本测试锁住 16 个防回归点（8 静态 + 8 动态）
//   静态 (8)：
//     1. state 对象有 processedItems: 0
//     2. state 对象有 typeStartCumulative: 0
//     3. handler 用 `state.processedItems = (typeStartCumulative + newCount)`
//        （关键：跨 type + 跨页累计算法）
//     4. handler 不再用 `state.processedItems = newCount`（老 fix，已被证伪）
//     5. handler 不再用 `state.processedItems +=`（high-water-mark 累加已废弃）
//     6. handler 不再有 `state.processedMax` 字段使用（已废弃）
//     7. handler 用 `state.typeStartCumulative || 0` 兜底
//     8. startCleanup 里 processedItems = 0 显式重置
//   动态 (8)：
//     A. 场景A: 3 type × 1 item（跨页 newCount 重置为 1 每次）→ 累计 = 3
//     B. 场景B: 5 type 真实混合（0/2/0/3/1）→ 累计 = 6
//     C. 场景C: state undefined → 防御性兜底
//     D. 场景D: 重复 count → processedItems 保持最新值
//     E. 场景E: 单 type 5 items → processedItems = 5
//     F. 场景F: sidepanel reload mid-cleanup + 跨页 newCount → 仍能正确累计
//     G. 场景G: 完全空 state + 跨页 → 累计正确
//     H. 场景H: 0 命中 type × 多个 → 不影响累计

const fs = require('fs');
const path = require('path');

const SIDEPANEL_PATH = path.join(
  __dirname, '..', 'platforms', 'x-project', 'src', 'sidepanel.js'
);

const checks = [];
function check(name, condition, detail) {
  checks.push({ name, pass: !!condition, detail: detail || '' });
}

// ---- 静态检查：源代码里是否真的写入了修复 ----
const src = fs.readFileSync(SIDEPANEL_PATH, 'utf8');

const stateBlockMatch = src.match(/var\s+state\s*=\s*\{([\s\S]*?)\n\s*\};/);
check(
  'state 对象字面量存在',
  !!stateBlockMatch,
  stateBlockMatch ? '找到 var state = { ... }' : '找不到 state 字面量'
);

const stateBlock = stateBlockMatch ? stateBlockMatch[1] : '';
check(
  'state 对象里 processedItems: 0 已初始化（防 undefined 比较陷阱）',
  /processedItems:\s*0\b/.test(stateBlock),
  'state 字面量里必须有 processedItems: 0'
);
check(
  'state 对象里 typeStartCumulative: 0 已初始化（跨 type 累计基线）',
  /typeStartCumulative:\s*0\b/.test(stateBlock),
  'state 字面量里必须有 typeStartCumulative: 0'
);
check(
  'handler 用 `baseTotal + newCount` 算法（关键：跨 type + 跨页累计）',
  /baseTotal\s*\+\s*newCount\b/.test(src) ||
  /typeStartCumulative[^\n]*\+\s*newCount/.test(src),
  '必须用 `state.typeStartCumulative + newCount` 计算跨 type 累计（不能直接覆盖）'
);
check(
  'handler 不再用 `state.processedItems = newCount`（老 fix：每页 newCount 归零会覆盖累计）',
  !/state\.processedItems\s*=\s*newCount\s*;/.test(src),
  '老 fix `state.processedItems = newCount` 在跨 X 页面导航下会丢失累计（newCount 每页归零）'
);
check(
  'handler 不再用 `state.processedItems +=`（high-water-mark 累加已废弃）',
  !/state\.processedItems\s*\+=/.test(src),
  '7d4928e 引入的 `state.processedItems +=` 是 bug 源，必须删掉'
);
check(
  'handler 不再有 `state.processedMax` 字段使用（已废弃）',
  !/state\.processedMax\b/.test(src),
  'state.processedMax 是 high-water-mark 时代的遗留，应已删除'
);
check(
  'handler 用 `state.typeStartCumulative || 0` 兜底（防 state undefined）',
  /state\.typeStartCumulative\s*\|\|\s*0\b/.test(src),
  '基线计算必须用 `|| 0` 兜底防 undefined'
);
check(
  'startCleanup 里 processedItems = 0 显式重置',
  /state\.processedItems\s*=\s*0\s*;/.test(src),
  'startCleanup 必须显式重置 processedItems（避免上轮值污染）'
);

// ---- 动态功能模拟测试（把 handler 逻辑在 node 里跑一遍）----

// 模拟精简版 sidepanel handler 逻辑（锁定当前修复算法：typeStartCumulative + newCount）
function makeHandler() {
  const state = {
    isRunning: false,
    processedItems: 0,
    typeStartCumulative: 0,
    currentType: null
  };

  function startCleanup() {
    state.isRunning = true;
    state.processedItems = 0;
    state.typeStartCumulative = 0;
  }

  // cleanupTypeStart：快照"到目前为止跨 type 累计总数"作为基线
  function cleanupTypeStart(type) {
    state.currentType = type;
    state.typeStartCumulative = state.processedItems || 0;
  }

  // cleanupProgress：state.processedItems = 基线 + 当前 type 当前页的 local 计数
  //   （x-automation 每次新页面注入会归零 processedCount，所以 newCount 是
  //    "本 type 本页" 的局部计数，基线 = "前面所有 type 累计"）
  function cleanupProgress(newCount) {
    const baseTotal = state.typeStartCumulative || 0;
    const prevTotal = state.processedItems || 0;
    state.processedItems = baseTotal + newCount;
    if (state.currentType) {
      // option-count 直接用 newCount（本 type 本页的 local 计数）
      state._lastOptionCount = newCount;
    }
    return prevTotal;
  }

  return { state, startCleanup, cleanupTypeStart, cleanupProgress };
}

// 场景 A：3 个 type × 1 item，跨 X 页面 newCount 每次都从 1 开始
//   真实场景：likes 页面推 1（newCount=1）→ 跳到 replies 页面推 1（newCount=1 重置）
//            → 跳到 tweets 页面推 1（newCount=1 重置）
//   期望累计 = 1 + 1 + 1 = 3
(function scenarioA() {
  const h = makeHandler();
  h.startCleanup();
  h.cleanupTypeStart('likes');
  h.cleanupProgress(1);
  h.cleanupTypeStart('replies');
  h.cleanupProgress(1);  // 跨 X 页面 navigation → newCount 重新从 1 开始
  h.cleanupTypeStart('tweets');
  h.cleanupProgress(1);
  check('场景A (3 type × 1 item, 跨页 newCount 重置): 累计 processedItems = 3',
    h.state.processedItems === 3,
    '实际=' + h.state.processedItems + ', 期望 3（基线+newCount 算法）');
})();

// 场景 B：5 type 真实混合（likes 0, replies 2, retweets 0, bookmarks 3, following 1）
//   每跨 X 页面 newCount 重置一次，模拟真实 x.com 清理行为
(function scenarioB() {
  const h = makeHandler();
  h.startCleanup();
  h.cleanupTypeStart('likes');
  h.cleanupProgress(0);  // 0 命中 → 跨页
  h.cleanupTypeStart('replies');
  h.cleanupProgress(1);
  h.cleanupProgress(2);
  h.cleanupTypeStart('retweets');
  h.cleanupProgress(0);  // 0 命中 → 跨页
  h.cleanupTypeStart('bookmarks');
  h.cleanupProgress(1);
  h.cleanupProgress(2);
  h.cleanupProgress(3);
  h.cleanupTypeStart('following');
  h.cleanupProgress(1);
  // 累计 = 0 + 2 + 0 + 3 + 1 = 6
  check('场景B (5 type 真实混合): 累计 processedItems = 6',
    h.state.processedItems === 6,
    '实际=' + h.state.processedItems + ', 期望 6 (0+2+0+3+1)');
})();

// 场景 C：state undefined → 防御性兜底
(function scenarioC() {
  const h = makeHandler();
  h.state.processedItems = undefined;
  h.state.typeStartCumulative = undefined;
  h.cleanupTypeStart('likes');
  h.cleanupProgress(1);
  check('场景C (state undefined): processedItems = 1（|| 0 兜底生效）',
    h.state.processedItems === 1,
    '实际=' + h.state.processedItems + ', 期望 1');
})();

// 场景 D：重复 count（同值推多次）→ processedItems 保持
(function scenarioD() {
  const h = makeHandler();
  h.startCleanup();
  h.cleanupTypeStart('likes');
  h.cleanupProgress(1);
  h.cleanupProgress(1);
  h.cleanupProgress(1);
  check('场景D (重复 count): processedItems = 1',
    h.state.processedItems === 1,
    '实际=' + h.state.processedItems + ', 期望 1');
})();

// 场景 E：单 type 5 items（不跨页、不跨 type）
(function scenarioE() {
  const h = makeHandler();
  h.startCleanup();
  h.cleanupTypeStart('likes');
  h.cleanupProgress(1);
  h.cleanupProgress(2);
  h.cleanupProgress(3);
  h.cleanupProgress(4);
  h.cleanupProgress(5);
  check('场景E (单 type 5 items): processedItems = 5',
    h.state.processedItems === 5,
    '实际=' + h.state.processedItems + ', 期望 5');
})();

// 场景 F：sidepanel reload mid-cleanup + 跨页 newCount 重置
//   最贴近用户报告的真实场景：sidepanel 关闭再开，state 变 undefined，
//   但 x-automation 继续跨页推 newCount
(function scenarioF() {
  const h = makeHandler();
  h.startCleanup();
  h.cleanupTypeStart('likes');
  h.cleanupProgress(2);  // likes 2
  // 模拟 sidepanel reload：所有 state 字段变 undefined
  h.state.processedItems = undefined;
  h.state.typeStartCumulative = undefined;
  // x-automation 跳到 replies 页推 3
  h.cleanupTypeStart('replies');
  h.cleanupProgress(3);
  // 再跳到 bookmarks 页推 1
  h.cleanupTypeStart('bookmarks');
  h.cleanupProgress(1);
  // 期望：清理中途 reload 也能累计，但因为没有 cleanupTypeStart
  // 把 likes 的 2 累到基线（reopen 时 state 是空的），
  // 所以累计 = 0 + 3 + 1 = 4（reload 丢的 2 不可恢复，是预期行为）
  // 关键：reload 后不能卡在 0 或 1（用户报告的 bug）
  check('场景F (sidepanel reload mid-cleanup + 跨页): processedItems = 4（reload 后不卡 0/1）',
    h.state.processedItems === 4,
    '实际=' + h.state.processedItems + ', 期望 4（reload 后的可见累计；用户报告的卡 0/1 bug 不能复现）');
})();

// 场景 G：完全空 state（reload 后 startCleanup 都没跑）+ 跨页 newCount
(function scenarioG() {
  const h = makeHandler();
  h.state.processedItems = undefined;
  h.state.typeStartCumulative = undefined;
  h.cleanupTypeStart('likes');
  h.cleanupProgress(2);
  h.cleanupTypeStart('replies');
  h.cleanupProgress(3);
  check('场景G (完全空 state + 跨页): processedItems = 5',
    h.state.processedItems === 5,
    '实际=' + h.state.processedItems + ', 期望 5 (2+3)');
})();

// 场景 H：0 命中 type × 多个 → 不影响累计
//   （模拟用户清完所有 likes 都没找到匹配 → likes 0, bookmarks 0, tweets 5）
(function scenarioH() {
  const h = makeHandler();
  h.startCleanup();
  h.cleanupTypeStart('likes');
  h.cleanupProgress(0);
  h.cleanupTypeStart('bookmarks');
  h.cleanupProgress(0);
  h.cleanupTypeStart('tweets');
  h.cleanupProgress(5);
  check('场景H (0 命中 + 5 命中): processedItems = 5',
    h.state.processedItems === 5,
    '实际=' + h.state.processedItems + ', 期望 5（0 命中 type 不影响累计）');
})();

// ---- 输出 ----
console.log('');
for (const c of checks) {
  const mark = c.pass ? '\x1b[32m  ✓\x1b[0m' : '\x1b[31m  ✗\x1b[0m';
  console.log(`${mark}  ${c.name}`);
  if (!c.pass && c.detail) {
    console.log(`     \x1b[31m${c.detail}\x1b[0m`);
  }
}
console.log('');

const passed = checks.filter(c => c.pass).length;
const failed = checks.length - passed;
console.log(`通过: ${passed}/${checks.length}`);
if (failed > 0) {
  console.log(`[FAIL]  ${failed} 项检查未通过`);
  process.exit(1);
} else {
  console.log(`[PASS]  全部 ${checks.length} 项防回归检查通过`);
  process.exit(0);
}
