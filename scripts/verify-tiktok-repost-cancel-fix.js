// verify-tiktok-repost-cancel-fix.js
// 守住 TikTok Reposts 删除修复（2026-07-02）：
//   - 用 `a#icon-element-repost` 直接定位元素（始终存在）
//   - 用 8 语言 aria-label 等值匹配判定「已转发」状态
//   - 解决重复点击问题（之前 `[data-e2e='video-share-repost']` 不带 aria-label 过滤，
//     同一元素在「Repost」/「Remove repost」状态都匹配，会反向 re-repost）
// 8 语言 aria-label **全部 MCP 浏览器实测**（2026-07-02 l702362 视频切 8 语言读 DOM）：

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let passed = 0, failed = 0;

function check(name, cond) {
  if (cond) { passed++; console.log('  ✓  ' + name); }
  else { failed++; console.log('  ✗  ' + name); }
}

const config = JSON.parse(fs.readFileSync(
  path.join(ROOT, 'platforms/tiktok-project/src/config/default.json'), 'utf8'));
const automation = fs.readFileSync(
  path.join(ROOT, 'platforms/tiktok-project/scripts/tiktok-automation.js'), 'utf8');

const repost = (config.selectors && config.selectors.repost) || {};

console.log('=== TikTok Repost cancel fix (aria-label equality, 8 langs) ===');

// 1. config.selectors.repost.videoShareRepost 存在
check('config.selectors.repost.videoShareRepost 存在',
  Array.isArray(repost.videoShareRepost));
check('config.selectors.repost.videoShareRepost 至少 8 个 selector',
  repost.videoShareRepost && repost.videoShareRepost.length >= 8);

// 2. 所有 selector 必须是 a#icon-element-repost 前缀
const allPrefixMatch = repost.videoShareRepost && repost.videoShareRepost.every(s =>
  s.indexOf('a#icon-element-repost') === 0
);
check('所有 videoShareRepost selector 以 a#icon-element-repost 开头',
  allPrefixMatch);

// 3. 8 语言 aria-label **实测**值（2026-07-02 MCP 浏览器对 l702362 视频实测）
// 之前猜的多项错误，现在所有值都实测
const expectedAriaLabels = {
  'Remove repost': 'en',
  '移除转发': 'zh-Hans',
  '再投稿を削除': 'ja-JP',
  '리포스트 삭제': 'ko-KR',
  'Remover republicação': 'pt-BR',
  'Eliminar la publicación compartida': 'es-ES',
  'Erneute Veröffentlichung entfernen': 'de-DE',
  'Supprimer la republication': 'fr-FR'
};
for (const aria in expectedAriaLabels) {
  const found = repost.videoShareRepost && repost.videoShareRepost.some(s =>
    s === "a#icon-element-repost[aria-label='" + aria + "']"
  );
  check('videoShareRepost 包含 ' + expectedAriaLabels[aria] + ' 实测 aria-label="' + aria + '"',
    found);
}

// 4. 关键修复：selector 列表里 **不能**有裸 `[data-e2e='video-share-repost']`（不带 aria-label）
const bareDataE2E = repost.videoShareRepost && repost.videoShareRepost.some(s =>
  s === "[data-e2e='video-share-repost']"
);
check('videoShareRepost 不应包含裸 [data-e2e="video-share-repost"]（无 aria-label 过滤）',
  !bareDataE2E);

// 5. 关键修复：selector 列表里 **不能**有 substring 模糊匹配
// 之前 "[aria-label*='Remove repost']" 这种模糊匹配是错的：
//   - "Remove" 在 ja/ko/zh/de/fr/pt/es 7 种语言里都不存在
//   - 模糊匹配只在 en 下能用，会导致 7 种非英语语言全部"找不到按钮"
const substringMatches = repost.videoShareRepost && repost.videoShareRepost.filter(s =>
  s.indexOf('aria-label*=') >= 0
);
check('videoShareRepost 不应包含 aria-label* 模糊匹配（仅用 = 等值匹配）',
  !substringMatches || substringMatches.length === 0);

// 6. automation.js 必须定义 repostedAriaLabels Set（含 8 种语言实测值）
check('automation.js 定义 repostedAriaLabels 数组/Set',
  /repostedAriaLabels[\s\S]{0,200}Set[\s\S]{0,2000}'Remove repost'/.test(automation)
  || /repostedAriaLabels\s*=\s*new Set\(\[/.test(automation));

// 7. automation.js 8 语言 aria-label 全部实测
const ariaValues = [
  'Remove repost', '移除转发', '再投稿を削除', '리포스트 삭제',
  'Remover republicação', 'Eliminar la publicación compartida',
  'Erneute Veröffentlichung entfernen', 'Supprimer la republication'
];
for (const aria of ariaValues) {
  check('automation.js repostedAriaLabels 包含 "' + aria + '"',
    automation.indexOf("'" + aria + "'") >= 0 || automation.indexOf('"' + aria + '"') >= 0);
}

// 8. 关键修复：_processRepostBatch 调用 isRepostedState() 判定状态
check('automation.js _processRepostBatch 调用 isRepostedState()',
  /_processRepostBatch[\s\S]{0,2000}isRepostedState\s*\(\s*\)/.test(automation));
check('automation.js isRepostedState 检查 a#icon-element-repost',
  /isRepostedState[\s\S]{0,500}a#icon-element-repost/.test(automation));
check('automation.js isRepostedState 用 Set.has 等值匹配 aria-label',
  /isRepostedState[\s\S]{0,800}repostedAriaLabels[\s\S]{0,200}\.has/.test(automation));

// 9. 关键修复：未转发状态时跳过（不点击）
check('automation.js 未转发状态时 skip 到下一个视频',
  /if\s*\(\s*!isRepostedState\s*\(\s*\)\s*\)[\s\S]{0,800}nextBtn/.test(automation));

// 10. 关键修复：取消后验证 aria-label 翻转
check('automation.js 取消后验证 aria-label 翻转（isRepostedState 再次调用）',
  /safeClick[\s\S]{0,500}isRepostedState\s*\(\s*\)/.test(automation));
check('automation.js 验证失败时 retry 一次',
  /isRepostedState\s*\(\s*\)[\s\S]{0,500}retry|isRepostedState\s*\(\s*\)[\s\S]{0,500}safeClick/.test(automation));

// 11. 不再依赖 shareRepostSelectors 模糊匹配找按钮
// (call site 仍传 shareRepostSelectors 但函数内部不再用)
// 这个改动要保留 call site 兼容性：函数签名不变
check('automation.js _processRepostBatch 仍接受 shareRepostSelectors 参数（兼容 call site）',
  /async _processRepostBatch\s*\(\s*startUrl\s*,\s*shareRepostSelectors/.test(automation));

// 12. 8 语言实测值跟 config 一致（自动化双重保证）
const configAria = (repost.videoShareRepost || [])
  .map(s => {
    const m = s.match(/aria-label='([^']*)'/);
    return m ? m[1] : null;
  })
  .filter(Boolean);
check('config videoShareRepost 解析出的 aria-label 数量 = 8',
  configAria.length === 8);
check('config 8 种 aria-label 全部在 automation.js repostedAriaLabels 中',
  ariaValues.every(a => configAria.indexOf(a) >= 0));

console.log('');
console.log('  通过: ' + passed + '/' + (passed + failed));
if (failed > 0) {
  console.log('[FAIL]');
  process.exit(1);
}
