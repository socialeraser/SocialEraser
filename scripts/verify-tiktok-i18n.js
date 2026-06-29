#!/usr/bin/env node
// verify-tiktok-i18n.js
// TikTok 8 语言 × N key 完整性 + namespace / storage 隔离
//
// 锁定（与 x-project verify-i18n.js 平行，但 TikTok 特有）：
//   1. 8 个 _locales/<lang>/messages.json 都存在 + 含 ext_name + ext_description
//   2. scripts/i18n.js 8 语言块完整 + dailyLimitReachedHint 含 "tip/support/come back tomorrow" 口径
//   3. i18n.js 用 window.TikTokEraseri18n 命名空间（不是 x 的 window.XEraseri18n）
//   4. i18n.js 用 tiktokPreferredLang storage key（不是 x 的 preferredLang）
//   5. i18n.js 监听 chrome.storage.onChanged.tiktokPreferredLang
//   6. i18n.js DEFAULT_I18N 5 key × 8 语言完整（cancelKeywords/confirmKeywords/
//      deleteKeywords/unfollowKeywords/repostKeywords）
//
// 任一断言失败 → 退 1；CI 即挂。

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const I18N = path.join(ROOT, 'platforms', 'tiktok-project', 'scripts', 'i18n.js');
const LOCALES_DIR = path.join(ROOT, 'platforms', 'tiktok-project', 'src', '_locales');
const SP = path.join(ROOT, 'platforms', 'tiktok-project', 'src', 'sidepanel.js');
const SP_HTML = path.join(ROOT, 'platforms', 'tiktok-project', 'src', 'sidepanel.html');

const i18n = fs.readFileSync(I18N, 'utf8');
const sp = fs.readFileSync(SP, 'utf8');
const spHtml = fs.readFileSync(SP_HTML, 'utf8');

// 注：i18n.js 内部用 'zh-CN'（hyphen），Chrome locale 文件夹用 'zh_CN'（underscore，CWS 规范）
// 统一用 hyphen 在 langs 数组里，文件夹路径用 langAliases 翻译
const langs = ['en', 'zh-CN', 'ja', 'ko', 'pt', 'es', 'de', 'fr'];
const langAliases = { 'zh-CN': 'zh_CN' };

const checks = [];
const fails = [];
function check(name, cond, detail) {
  checks.push({ name, ok: !!cond, detail: detail || '' });
  if (!cond) fails.push({ name, detail });
}

// 1. 8 个 _locales 文件存在 + ext_name + ext_description
let localeMissing = [];
for (const lang of langs) {
  const folder = langAliases[lang] || lang;
  const file = path.join(LOCALES_DIR, folder, 'messages.json');
  if (!fs.existsSync(file)) { localeMissing.push(folder + '(file missing)'); continue; }
  let json;
  try {
    json = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    localeMissing.push(folder + '(JSON parse error: ' + e.message + ')');
    continue;
  }
  if (!json.ext_name || !json.ext_name.message) localeMissing.push(folder + '/ext_name');
  if (!json.ext_description || !json.ext_description.message) localeMissing.push(folder + '/ext_description');
}
check('8 个 _locales/<lang>/messages.json 存在 + 含 ext_name + ext_description',
  localeMissing.length === 0,
  '缺失: ' + (localeMissing.length ? localeMissing.join(', ') : '无'));

// 2. 找到 i18n.js 中每个语言块
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

// 3. 8 语言 dailyLimitReachedHint 关键字（与 x-project 同步）
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
check('i18n.js 8 语言 dailyLimitReachedHint 全部引导用户"明天再来 / 支持开发者"',
  hintReachedLangs.length === langs.length,
  '未命中: ' + (hintMissedLangs.length ? hintMissedLangs.join(', ') : '无'));

// 4. i18n.js 暴露 window.TikTokEraseri18n 命名空间（不是 x 的 window.XEraseri18n）
check('i18n.js 暴露 window.TikTokEraseri18n 命名空间',
  /window\.TikTokEraseri18n\s*=/.test(i18n),
  '未找到 window.TikTokEraseri18n = ...');
check('i18n.js 不暴露 window.XEraseri18n（避免与 x-project 命名冲突）',
  !/window\.XEraseri18n\s*=/.test(i18n),
  'window.XEraseri18n 不应出现在 tiktok-project');

// 5. storage key 用 tiktokPreferredLang（不是 preferredLang）
check('i18n.js 读 chrome.storage.local.tiktokPreferredLang',
  /chrome\.storage\.local\.get\(\s*\[\s*['"]tiktokPreferredLang['"]/.test(i18n),
  '应使用 tiktokPreferredLang 作为 storage key');
check('i18n.js 监听 chrome.storage.onChanged.tiktokPreferredLang',
  /changes\.tiktokPreferredLang/.test(i18n),
  'onChanged handler 应过滤 tiktokPreferredLang');
check('i18n.js 不引用 x-project 的 preferredLang 裸 key',
  !/chrome\.storage\.local\.get\(\s*\[\s*['"]preferredLang['"]/.test(i18n),
  '裸 preferredLang key 是 x-project 的命名空间，tiktok-project 应使用 tiktokPreferredLang');

// 6. i18n.js 8 语言块必须含核心 UI key（与 sidepanel.html 的 data-i18n 对齐）
const requiredKeys = [
  // UI 标签
  'videos', 'reposts', 'likes', 'favorites', 'following',
  'minViewCount', 'maxViewCount', 'viewCountUnlimited',
  'startCleanup', 'pause', 'resume', 'stop',
  // 状态
  'loggedIn', 'notLoggedIn', 'checking', 'tiktokWebsiteDetected',
  // 备份提示
  'videosBackupTip', 'repostsBackupTip',
  // 弹窗
  'dailyLimitReachedHint', 'dailyLimitReached', 'noItemsSelected',
  // 日志
  'startingCleanup', 'cleanupCompleted', 'stoppedByUser',
];

const missingI18n = [];
for (const lang of langs) {
  const block = findLangBlock(i18n, lang);
  if (!block) { missingI18n.push(lang + '(lang block not found)'); continue; }
  for (const key of requiredKeys) {
    if (!block.includes(key + ':')) missingI18n.push(lang + '/' + key);
  }
}
check('i18n.js 8 语言 × 核心 key 完整 (videos/reposts/likes/favorites/following/minViewCount/...)',
  missingI18n.length === 0,
  '缺失: ' + (missingI18n.length ? missingI18n.slice(0, 10).join(', ') + (missingI18n.length > 10 ? ' ...' : '') : '无'));

// 7. DEFAULT_I18N 5 key × 8 语言完整
const defaultI18nKeys = ['cancelKeywords', 'confirmKeywords', 'deleteKeywords', 'unfollowKeywords', 'repostKeywords'];
const defaultI18nBlock = i18n.match(/const\s+DEFAULT_I18N\s*=\s*\{[\s\S]*?\n\s*\};/);
const defaultI18nMissing = [];
if (!defaultI18nBlock) {
  defaultI18nMissing.push('DEFAULT_I18N block not found');
} else {
  const block = defaultI18nBlock[0];
  for (const key of defaultI18nKeys) {
    if (!block.includes(key + ':')) defaultI18nMissing.push(key);
  }
  // 每个 key 的数组必须含 8 项
  for (const key of defaultI18nKeys) {
    const arrMatch = block.match(new RegExp(key + ':\\s*\\[([^\\]]+)\\]'));
    if (arrMatch) {
      const items = arrMatch[1].split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
      if (items.length < 8) {
        defaultI18nMissing.push(key + ' (only ' + items.length + ' langs)');
      }
    }
  }
}
check('i18n.js DEFAULT_I18N 5 key × 8 语言完整 (cancelKeywords/confirmKeywords/deleteKeywords/unfollowKeywords/repostKeywords)',
  defaultI18nMissing.length === 0,
  '缺失: ' + (defaultI18nMissing.length ? defaultI18nMissing.join(', ') : '无'));

// 8. sidepanel.js 用 TikTokEraseri18n 引用（不是 XEraseri18n）
check('sidepanel.js 引用 window.TikTokEraseri18n（不是 window.XEraseri18n）',
  /window\.TikTokEraseri18n/.test(sp) || /TikTokEraseri18n/.test(sp),
  'sidepanel.js 应使用 TikTokEraseri18n 命名空间');
check('sidepanel.js 不用 x-project 命名空间',
  !/window\.XEraseri18n/.test(sp),
  'sidepanel.js 不应引用 window.XEraseri18n');

// 9. sidepanel.js 用 tiktokDailyUsage / tiktokPreferredLang storage key
check('sidepanel.js 读 chrome.storage.local.tiktokDailyUsage（不是 dailyUsage）',
  /chrome\.storage\.local\.get\(\s*\[\s*['"]tiktokDailyUsage['"]/.test(sp),
  'storage key 应用 tiktok 前缀');
check('sidepanel.js 写 chrome.storage.local.tiktokDailyUsage',
  /chrome\.storage\.local\.set\(\s*\{\s*tiktokDailyUsage:/.test(sp),
  'storage key 应用 tiktok 前缀');

// 10. sidepanel.html 含 5 个 type checkbox + view count filter + 2 个 backup tip
check('sidepanel.html 含 5 个 type checkbox (opt-videos/opt-reposts/opt-likes/opt-favorites/opt-following)',
  /id=["']opt-videos["']/.test(spHtml) &&
  /id=["']opt-reposts["']/.test(spHtml) &&
  /id=["']opt-likes["']/.test(spHtml) &&
  /id=["']opt-favorites["']/.test(spHtml) &&
  /id=["']opt-following["']/.test(spHtml),
  '5 个 type checkbox 缺失');
check('sidepanel.html 含 view count filter 输入框 (filter-view-min / filter-view-max)',
  /id=["']filter-view-min["']/.test(spHtml) && /id=["']filter-view-max["']/.test(spHtml),
  'view count filter 缺失');
check('sidepanel.html 含 videos + reposts backup tip',
  /class=["'][^"']*backup-tip[^"']*["']/.test(spHtml),
  '2 个 backup tip 缺失');

// 11. i18n.js 8 语言块大小至少 ~30 key（防止某语言块偷工减料）
const tooSmallLangs = [];
for (const lang of langs) {
  const block = findLangBlock(i18n, lang);
  if (!block) continue;
  // 简单数 colon = 顶级 key 数
  const keyCount = (block.match(/^\s{6}\w+:/gm) || []).length;
  if (keyCount < 30) tooSmallLangs.push(lang + '(' + keyCount + ' keys)');
}
check('i18n.js 8 语言块 ≥ 30 key 完整',
  tooSmallLangs.length === 0,
  '过小: ' + (tooSmallLangs.length ? tooSmallLangs.join(', ') : '无'));

// 12. SUPPORTED_LANGS 数组必须 8 语言
const supportedLangsMatch = i18n.match(/var\s+SUPPORTED_LANGS\s*=\s*\[([^\]]+)\]/);
let supportedLangsOk = false;
if (supportedLangsMatch) {
  const arr = supportedLangsMatch[1].split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
  supportedLangsOk = arr.length === 8 && langs.every(l => arr.includes(l));
}
check('i18n.js SUPPORTED_LANGS 含 8 语言 (en/zh-CN/ja/ko/pt/es/de/fr)',
  supportedLangsOk,
  'SUPPORTED_LANGS 数组不完整');

// 输出
console.log('');
console.log('=== verify-tiktok-i18n.js ===');
console.log('TikTok 8 语言 × N key 完整性 + namespace / storage 隔离');
console.log('');
for (const c of checks) {
  console.log((c.ok ? '  ✓  ' : '  ✗  ') + c.name);
  if (!c.ok && c.detail) console.log('       detail: ' + c.detail);
}
console.log('');
console.log('  通过: ' + (checks.length - fails.length) + '/' + checks.length);
if (fails.length > 0) {
  console.log('\n[FAIL] ' + fails.length + ' check(s) failed');
  process.exit(1);
}
process.exit(0);
