// 回归检查：打赏模式（X+）落地完整性
//
// 背景：2026-06-23 决定从"免费 + 订阅升级"改为"免费 + 5000 上限（安全阈值）+ 打赏支持"，
// 营销站长期承诺"no quota, no paywall"。本脚本锁住关键不变量：
//
//   1. sidepanel.js 不再含 isPremium / showUpgradeModal / subscription 相关代码
//      —— 防后人把打赏变订阅、给营销站和用户传递矛盾信号
//   2. 5000/日上限保留 —— 是 platform 限流的安全阈值，不是商业门槛
//   3. i18n.js 8 语言都包含 3 个新 key：considerSupporting / gotIt / supportProject
//   4. i18n.js 8 语言的 dailyLimitReachedHint 全部提到"打赏/支持开发者"概念
//   5. sidepanel.html 的 footer 含 Support 链接（用户找不到打赏入口 = 转化率 = 0）
//   6. sidepanel.js 含 showTipModal 函数（替代 showUpgradeModal）
//   7. 营销站 12 个 HTML 文件 footer 都含 Support 链接（点 /support.html）
//   8. support.html / success.html 存在且 5 档按钮齐（防 5 档少 1 档）
//
// 任一断言失败 → 退 1；CI 即挂。
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SP = path.join(ROOT, 'platforms/x-project/src/sidepanel.js');
const I18N = path.join(ROOT, 'platforms/x-project/scripts/i18n.js');
const HTML = path.join(ROOT, 'platforms/x-project/src/sidepanel.html');

const sp = fs.readFileSync(SP, 'utf8');
const i18n = fs.readFileSync(I18N, 'utf8');
const html = fs.readFileSync(HTML, 'utf8');

const checks = [];
const fail = [];
function check(name, cond, detail) {
  checks.push({ name, ok: !!cond, detail: detail || '' });
  if (!cond) fail.push({ name, detail });
}

// 1. sidepanel.js 不应再含 isPremium 变量 / showUpgradeModal 函数
check('sidepanel.js 不含 isPremium 变量（打赏模式无会员分支）',
  !/\bisPremium\b/.test(sp),
  'isPremium 出现 — 检查是否引入了会员/订阅逻辑');
check('sidepanel.js 不含 showUpgradeModal 函数（弹窗已重命名为 showTipModal）',
  !/\bshowUpgradeModal\b/.test(sp),
  'showUpgradeModal 出现 — 弹窗应改名为 showTipModal');
check('sidepanel.js 不含 subscription.active 引用（打赏模式无订阅状态）',
  !/subscription\s*\.\s*active/.test(sp),
  'subscription.active 出现 — 是否在引入订阅状态？');

// 2. 5000/日上限保留（防限流封号的安全阈值，不是商业门槛）
check('FREE_LIMIT_PER_DAY = 5000 常量保留',
  /FREE_LIMIT_PER_DAY\s*=\s*5000\b/.test(sp),
  '上限 5000 是 platform 安全阈值，不应被偷偷改');

// 3. i18n.js 8 语言 × 3 新 key 完整性
const langs = ['en', 'zh-CN', 'ja', 'ko', 'pt', 'es', 'de', 'fr'];
const newKeys = ['considerSupporting', 'gotIt', 'supportProject'];

function findLangBlock(src, lang) {
  const startMarkerA = "'" + lang + "': {";
  const startMarkerB = lang + ": {";
  let startIdx = src.indexOf(startMarkerA);
  if (startIdx < 0) startIdx = src.indexOf(startMarkerB);
  if (startIdx < 0) return null;
  let depth = 0;
  let blockEnd = -1;
  for (let i = startIdx; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) { blockEnd = i; break; }
    }
  }
  return blockEnd < 0 ? null : src.substring(startIdx, blockEnd);
}

let missingI18n = [];
for (const lang of langs) {
  const block = findLangBlock(i18n, lang);
  if (!block) { missingI18n.push(lang + '(lang block not found)'); continue; }
  for (const key of newKeys) {
    if (!block.includes(key + ':')) missingI18n.push(lang + '/' + key);
  }
}
check('i18n.js 8 语言 × 3 新 key 完整 (considerSupporting / gotIt / supportProject)',
  missingI18n.length === 0,
  '缺失: ' + (missingI18n.length ? missingI18n.join(', ') : '无'));

// 4. 8 语言的 dailyLimitReachedHint 都应该出现"打赏/支持开发者/come back tomorrow"等打赏口径词
//    每语言独立列关键词（CJK 不适用 \b 边界）
const hintKeywordsByLang = {
  en:     ['developer', 'support', 'tomorrow'],
  'zh-CN': ['开发者', '支持', '明天', '打赏'],
  ja:     ['開発者', 'サポート', '明日', '寄付'],
  ko:     ['개발자', '후원', '내일'],
  pt:     ['desenvolvedor', 'apoiar', 'amanhã', 'doação'],
  es:     ['desarrollador', 'apoyar', 'mañana', 'donar'],
  de:     ['Entwickler', 'unterstützen', 'morgen', 'Spende'],
  fr:     ['développeur', 'soutenir', 'demain', 'don']
};
const hintReachedLangs = [];
const hintMissedLangs = [];
for (const lang of langs) {
  const block = findLangBlock(i18n, lang);
  if (!block) continue;
  const hintMatch = block.match(/dailyLimitReachedHint:\s*'([^']+)'/);
  if (!hintMatch) continue;
  const hintText = hintMatch[1];
  const keywords = hintKeywordsByLang[lang] || [];
  const hit = keywords.some(kw => hintText.includes(kw));
  if (hit) hintReachedLangs.push(lang);
  else hintMissedLangs.push(lang + ' [' + keywords.join('|') + ']');
}
check('8 语言 dailyLimitReachedHint 全部引导用户"明天再来 / 支持开发者"',
  hintReachedLangs.length === langs.length,
  '未命中: ' + (hintMissedLangs.length ? hintMissedLangs.join(', ') : '无'));

// 5. sidepanel.html footer 含 Support 链接
check('sidepanel.html footer 含 Support 链接（点 support.html）',
  /href\s*=\s*["']https:\/\/socialeraser\.app\/support\.html["']/.test(html),
  '缺少 <a href="https://socialeraser.app/support.html">');
check('sidepanel.html footer Support 链接带 data-i18n="supportProject"',
  /data-i18n\s*=\s*["']supportProject["']/.test(html),
  'Support 链接应带 data-i18n 才会在切语言时跟着变');

// 6. showTipModal 函数存在（替代 showUpgradeModal）
check('sidepanel.js 含 showTipModal 函数（替代 showUpgradeModal）',
  /function\s+showTipModal\s*\(/.test(sp),
  '弹窗函数应改名为 showTipModal');

// 7. 营销站 12 个 HTML 文件 footer 都含 Support 链接
const MW_ROOT = path.join(ROOT, 'packages/marketing-website');
const MW_FILES = [
  'index.html', 'zh/index.html', 'ja/index.html',
  'about.html', 'help.html', 'privacy.html', 'terms.html',
  'platforms/x/index.html', 'platforms/tiktok/index.html',
  'platforms/youtube/index.html', 'platforms/instagram/index.html',
  'platforms/facebook/index.html',
];
const mwMissing = [];
for (const rel of MW_FILES) {
  const p = path.join(MW_ROOT, rel);
  if (!fs.existsSync(p)) { mwMissing.push(rel + '(missing file)'); continue; }
  const text = fs.readFileSync(p, 'utf8');
  if (!/href\s*=\s*["'][^"']*\/support\.html["']/.test(text)) {
    mwMissing.push(rel);
  }
}
check('营销站 12 文件 footer 都含 /support.html 链接',
  mwMissing.length === 0,
  '缺失: ' + (mwMissing.length ? mwMissing.join(', ') : '无'));

// 8. support.html / success.html 存在 + 5 档按钮齐
const SUPPORT = path.join(MW_ROOT, 'support.html');
const SUCCESS = path.join(MW_ROOT, 'success.html');
check('support.html 存在',
  fs.existsSync(SUPPORT),
  '打赏落地页缺失');
check('success.html 存在',
  fs.existsSync(SUCCESS),
  'Creem 回跳感谢页缺失');

if (fs.existsSync(SUPPORT)) {
  const supportText = fs.readFileSync(SUPPORT, 'utf8');
  const tierPrices = ['$1', '$3', '$5', '$10', 'Custom'];
  const tierMissing = tierPrices.filter(p => !supportText.includes(p));
  check('support.html 5 档按钮齐全 ($1 / $3 / $5 / $10 / Custom)',
    tierMissing.length === 0,
    '缺失: ' + (tierMissing.length ? tierMissing.join(', ') : '无'));
  // Creem 链接必须都已就位（占位符 #TODO-CREEM-LINK-* 应已全部替换为真实 creem.io 链接）
  const remainingPlaceholders = (supportText.match(/#TODO-CREEM-LINK-/g) || []).length;
  const creemLinks = (supportText.match(/https:\/\/www\.creem\.io\/(test\/)?payment\/prod_[A-Za-z0-9]+/g) || []).length;
  check('support.html 5 个 Creem 支付链接已就位 (无占位符残留 + 5 个 creem.io 链接)',
    remainingPlaceholders === 0 && creemLinks === 5,
    '占位符残留: ' + remainingPlaceholders + ' / creem.io 链接: ' + creemLinks + ' (期望 0 / 5)');
}

console.log('');
for (const c of checks) {
  console.log((c.ok ? '  ✓  ' : '  ✗  ') + c.name);
  if (!c.ok && c.detail) console.log('       detail: ' + c.detail);
}
console.log('');
console.log('  通过: ' + (checks.length - fail.length) + '/' + checks.length);
if (fail.length > 0) {
  console.log('[FAIL]');
  process.exit(1);
}
