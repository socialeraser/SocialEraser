#!/usr/bin/env node
// verify-scroll-to-bottom.js
// 防回归：scrollToBottom 不靠经验时间（2026-06-18 修复）
// 锁定：injector.js 的 scrollToBottom 签名 + 不再有 sleep(1500) + RAF 轮询

'use strict';

const fs = require('fs');
const path = require('path');

const INJECTOR_PATH = path.join(__dirname, '..', 'platforms', 'x-project', 'scripts', 'x-automation.js');
const injectorSrc = fs.readFileSync(INJECTOR_PATH, 'utf8');

let passed = 0;
let failed = 0;
function assert(cond, label) {
  if (cond) { console.log('  PASS  ' + label); passed++; }
  else { console.log('  FAIL  ' + label); failed++; }
}

console.log('=== verify-scroll-to-bottom.js ===\n');

// 1. scrollToBottom 不再接受 scrollDelay 参数
assert(
  /async\s+scrollToBottom\s*\(\s*\)/.test(injectorSrc),
  'scrollToBottom() 不再接受参数（去掉 scrollDelay）'
);

// 2. 不再调用 sleep(scrollDelay) / sleep(1500)
assert(
  !/scrollToBottom[^)]*sleep\(/.test(injectorSrc),
  'scrollToBottom 内部不再调 sleep(...)（不靠经验时间）'
);

// 3. 6 处调用全部无参数
const callMatches = injectorSrc.match(/await\s+this\.scrollToBottom\s*\([^)]*\)/g) || [];
const oldCalls = callMatches.filter(c => /\(\d+\)/.test(c));
assert(
  oldCalls.length === 0,
  '所有 scrollToBottom 调用都不带参数（剩 ' + oldCalls.length + ' 处带数字参数）'
);
assert(
  callMatches.length === 6,
  'scrollToBottom 调用点为 6 处（3 个 process 函数 × empty + maxEmptyScrolls）'
);

// 4. scrollToBottom 内部用 requestAnimationFrame（RAF 轮询）
const scrollBody = injectorSrc.match(/async\s+scrollToBottom\s*\([^)]*\)\s*\{[\s\S]*?\n\s{4}\}/);
assert(
  scrollBody && /requestAnimationFrame\s*\(\s*rafTick\s*\)/.test(scrollBody[0]),
  'scrollToBottom 内部用 requestAnimationFrame 轮询'
);

// 5. scrollToBottom 内部找容器（article 或 cellInnerDiv）
assert(
  scrollBody && /getContainerSelector|querySelectorAll\(.article.\)|querySelectorAll\(.\[data-testid=.cellInnerDiv.\].\)/.test(scrollBody[0]),
  'scrollToBottom 内部找 article 或 cellInnerDiv 容器（不靠 scrollHeight）'
);

// 6. scrollToBottom 内部用 STABLE_FRAMES 稳定判定
assert(
  scrollBody && /STABLE_FRAMES/.test(scrollBody[0]),
  'scrollToBottom 内部用 STABLE_FRAMES 判定"到底"（不靠经验时间）'
);

// 7. scrollToBottom 内部有 MAX_FRAMES 兜底
assert(
  scrollBody && /MAX_FRAMES/.test(scrollBody[0]),
  'scrollToBottom 内部有 MAX_FRAMES 兜底'
);

// 8. scrollToBottom 不再使用 document.documentElement.scrollHeight 作为稳定信号
//   （仍可能在 fallback 路径用，但不作为 RAF 轮询对象）
assert(
  scrollBody && !/lastHeight\s*=\s*document\.documentElement\.scrollHeight/.test(scrollBody[0]),
  'scrollToBottom 不再用 lastHeight = scrollHeight 作为稳定信号'
);

// 9. 3 个 process 函数入口都有 waitForContentStable
const processLikesMatch = injectorSrc.match(/async\s+processLikes\s*\([^)]*\)\s*\{[\s\S]*?await\s+this\.waitForContentStable/);
const processBookmarksMatch = injectorSrc.match(/async\s+processBookmarks\s*\([^)]*\)\s*\{[\s\S]*?await\s+this\.waitForContentStable/);
const processFollowingMatch = injectorSrc.match(/async\s+processFollowing\s*\([^)]*\)\s*\{[\s\S]*?await\s+this\.waitForContentStable/);
assert(
  !!processLikesMatch,
  'processLikes 入口调 waitForContentStable'
);
assert(
  !!processBookmarksMatch,
  'processBookmarks 入口调 waitForContentStable'
);
assert(
  !!processFollowingMatch,
  'processFollowing 入口调 waitForContentStable'
);

// 10. scrollToBottom 加载完新内容后自动滚回顶部（UX 修复）
assert(
  scrollBody && /loadedNewContent/.test(scrollBody[0]) && /window\.scrollTo\(0,\s*0\)/.test(scrollBody[0]),
  'scrollToBottom 加载完新内容后自动 scrollTo(0,0) 滚回顶部（不留在底部）'
);

// 11. safeClick 不用 scrollIntoView smooth（避免 X 虚拟列表死循环）
const safeClickMatch = injectorSrc.match(/async\s+safeClick\s*\([^)]*\)\s*\{[\s\S]*?(?=\n\s{4}async\s|\n\s{4}\/\/|\n\s{0,2}\}\s*\n)/);
assert(
  safeClickMatch && !/behavior:\s*'smooth'/.test(safeClickMatch[0]),
  'safeClick 不用 scrollIntoView smooth（改 auto 避免 X 虚拟列表死循环）'
);

// 12. safeClick scrollIntoView 后有 maxFrames 兜底
assert(
  safeClickMatch && /SCROLL_MAX_FRAMES/.test(safeClickMatch[0]),
  'safeClick scrollIntoView 后有 maxFrames 兜底（不死循环）'
);

// 13. waitForElement 调用不再用 2000 帧（33s）兜底 —— 改成 600 帧（10s）
const waitForElement2000 = injectorSrc.match(/waitForElement\([^)]*2000[^)]*\)/g) || [];
assert(
  waitForElement2000.length === 0,
  'waitForElement 不再传 2000 帧（33s 兜底太长）。剩余调用: ' + JSON.stringify(waitForElement2000)
);

console.log('\n=== Result: ' + passed + ' pass, ' + failed + ' fail ===');
process.exit(failed > 0 ? 1 : 0);
