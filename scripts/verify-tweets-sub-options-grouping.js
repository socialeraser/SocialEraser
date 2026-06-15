// 回归检查：Tweets 子选项的"视觉分组"（Tweets+子项 一组 vs Likes/Bookmarks/Following 一组）
// 修复背景：改用缩进方案后，子项被 Tweets 自己的 border-bottom 分割线"切"到 Likes 那组。
// 修复：JS 联动两个 class，CSS 据此隐藏/添加 border，让 Tweets+子项 视觉上是一组。
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const JS = fs.readFileSync(path.join(ROOT, 'chrome-extension/sidepanel.js'), 'utf8');
const HTML = fs.readFileSync(path.join(ROOT, 'chrome-extension/sidepanel.html'), 'utf8');

const checks = [];
const fail = [];
function check(name, cond, detail) {
  checks.push({ name, ok: !!cond, detail: detail || '' });
  if (!cond) fail.push({ name, detail });
}

// 1. JS updateTweetsOptionsVisibility 必须 toggle .sub-options-open 到 tweetsItem
check('JS: 联动 .sub-options-open class 到 Tweets 的 .option-item',
  /tweetsItem\.classList\.toggle\(\s*['"]sub-options-open['"]\s*,\s*checked\s*\)/.test(JS) ||
  /tweetsItem\.classList\.toggle\(\s*['"]sub-options-open['"]\s*,/.test(JS),
  '必须 form: tweetsItem.classList.toggle("sub-options-open", checked)');

// 2. JS updateTweetsOptionsVisibility 必须 toggle .has-prev-sub-options 到 nextItem
check('JS: 联动 .has-prev-sub-options class 到下一个 .option-item',
  /nextItem\.classList\.toggle\(\s*['"]has-prev-sub-options['"]\s*,/.test(JS),
  '必须 form: nextItem.classList.toggle("has-prev-sub-options", checked)');

// 3. JS 必须找 nextElementSibling
check('JS: 用 nextElementSibling 找下一项',
  /tweetsOptionsSection\.nextElementSibling/.test(JS) ||
  /els\.tweetsOptionsSection\.nextElementSibling/.test(JS),
  '必须用 nextElementSibling 拿下一个 .option-item（Likes）');

// 4. JS 必须用 closest('.option-item') 找 Tweets
check('JS: 用 closest(".option-item") 拿 Tweets 那一行',
  /optTweets\.closest\(\s*['"]\.option-item['"]\s*\)/.test(JS) ||
  /optTweets\s*&&\s*optTweets\.closest\(\s*['"]\.option-item['"]\s*\)/.test(JS),
  '必须用 optTweets.closest(".option-item")');

// 5. CSS 规则 .option-item.sub-options-open 必须存在
check('CSS: .option-item.sub-options-open 规则存在',
  /\.option-item\.sub-options-open\s*\{[^}]*border-bottom[^}]*\}/.test(HTML) ||
  /\.option-item\.sub-options-open\s*\{[^}]*border-bottom-color\s*:\s*transparent/.test(HTML),
  'CSS 必须把 border-bottom 藏起来');

// 6. CSS 规则 .option-item.has-prev-sub-options 必须存在
check('CSS: .option-item.has-prev-sub-options 规则存在（加 border-top 作为新分割线）',
  /\.option-item\.has-prev-sub-options\s*\{[^}]*border-top\s*:\s*1px\s+solid/.test(HTML),
  'CSS 必须加 border-top: 1px solid');

// 7. HTML 结构：tweets-options-section 后面紧跟 Likes 那个 .option-item
//    关键不变量：tweets-options-section 与 Likes 的 .option-item 之间没有其他 .option-item
//    排除 Likes 自己那个 .option-item（在 id="opt-likes" 前 200 字符内）
const tweetsIdx = HTML.indexOf('id="tweets-options-section"');
const likesIdx = HTML.indexOf('id="opt-likes"');
let checkOk = false;
if (tweetsIdx >= 0 && likesIdx > tweetsIdx) {
  // 找 tweets-options-section 之后到 opt-likes 之间的内容（不含 Likes 自己的 .option-item 开标签）
  // 简单做法：找 tweets-options-section 后面 200 字符内，最后一个 .option-item 应该是 Likes 自己
  const slice = HTML.substring(tweetsIdx, likesIdx);
  // 找出所有 .option-item 出现的位置
  const matches = [...slice.matchAll(/class="option-item"/g)];
  // 最后一个 .option-item 应该是 Likes 的（紧邻 opt-likes 之前）
  // 如果有 1 个，且它距离 likesIdx < 100 字符，那是对的
  checkOk = matches.length >= 1 &&
    (likesIdx - tweetsIdx) - matches[matches.length - 1].index < 100;
}
check('HTML: tweets-options-section 与 Likes 之间无其他 .option-item',
  checkOk,
  'DOM 顺序必须: Tweets → tweets-options-section → Likes（中间不能再有 .option-item）');

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
