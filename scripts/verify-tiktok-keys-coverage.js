#!/usr/bin/env node
// verify-tiktok-keys-coverage.js
//
// 防 i18n key 漂移：
//   1. 扫描所有 t('xxx') 调用点（sidepanel.js / tiktok-automation.js / content.js）
//   2. 扫描 i18n.js 8 语言块的顶层 key
//   3. 断言：所有被引用的 key 必须在 8 语言块中都存在
//   4. 报告：定义但未引用的 key（informational，不强制 fail）
//
// 用途：本次修复了 P0 bug（t('startingRepostsCleanup') / t('invalidViewCount') /
// t('invalidViewCountRange') 之前都缺失 i18n key，运行时会显示字面 key 字符串）。
// 此脚本永久锁死「key 调用 ↔ i18n 定义」的一致性。

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const I18N = path.join(ROOT, 'platforms', 'tiktok-project', 'scripts', 'i18n.js');
const SP = path.join(ROOT, 'platforms', 'tiktok-project', 'src', 'sidepanel.js');
const AUTO = path.join(ROOT, 'platforms', 'tiktok-project', 'scripts', 'tiktok-automation.js');
const CONTENT = path.join(ROOT, 'platforms', 'tiktok-project', 'scripts', 'content.js');

const i18n = fs.readFileSync(I18N, 'utf8');
const sp = fs.readFileSync(SP, 'utf8');
const auto = fs.readFileSync(AUTO, 'utf8');
const content = fs.readFileSync(CONTENT, 'utf8');

const langs = ['en', 'zh-CN', 'ja', 'ko', 'pt', 'es', 'de', 'fr'];

const checks = [];
const fails = [];
function check(name, cond, detail) {
  checks.push({ name, ok: !!cond, detail: detail || '' });
  if (!cond) fails.push({ name, detail });
}

// ---- 1. 提取 8 语言块 ----
function findLangBlock(src, lang) {
  const markers = ["'" + lang + "': {", lang + ": {"];
  let startIdx = -1;
  for (const m of markers) {
    startIdx = src.indexOf(m);
    if (startIdx >= 0) break;
  }
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

// 提取语言块的顶层 key 集合（key: 'value' 形式，缩进 6 空格）
function extractLangKeys(block) {
  const keyRe = /^\s{6}([a-zA-Z][a-zA-Z0-9_]*):/gm;
  const keys = new Set();
  let m;
  while ((m = keyRe.exec(block)) !== null) {
    keys.add(m[1]);
  }
  return keys;
}

const langKeys = {};
for (const lang of langs) {
  const block = findLangBlock(i18n, lang);
  if (!block) continue;
  langKeys[lang] = extractLangKeys(block);
}

// ---- 2. 提取 t('xxx') 调用 ----
// 排除：t() 出现在字符串/注释/正则中
function extractTCalls(src) {
  const keys = new Set();
  // t('key') 或 t("key")
  const re = /\bt\(\s*['"]([a-zA-Z][a-zA-Z0-9_]*)['"]/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    keys.add(m[1]);
  }
  return keys;
}

const refSp = extractTCalls(sp);
const refAuto = extractTCalls(auto);
const refContent = extractTCalls(content);

// ---- 2b. 提取 HTML 中 data-i18n / data-i18n-html / data-i18n-placeholder / data-i18n-title 引用 ----
const SP_HTML = path.join(ROOT, 'platforms', 'tiktok-project', 'src', 'sidepanel.html');
const spHtml = fs.readFileSync(SP_HTML, 'utf8');
function extractHtmlI18nKeys(html) {
  const keys = new Set();
  const re = /data-i18n(?:-html|-placeholder|-title)?=["']([a-zA-Z][a-zA-Z0-9_]*)["']/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    keys.add(m[1]);
  }
  return keys;
}
const refHtml = extractHtmlI18nKeys(spHtml);

const allReferenced = new Set([...refSp, ...refAuto, ...refContent, ...refHtml]);

// ---- 3. 检查每个被引用的 key 在 8 语言块中都存在 ----
const missingByKey = {};
for (const key of allReferenced) {
  const missing = [];
  for (const lang of langs) {
    if (!langKeys[lang] || !langKeys[lang].has(key)) {
      missing.push(lang);
    }
  }
  if (missing.length > 0) {
    missingByKey[key] = missing;
  }
}

const missingKeyList = Object.keys(missingByKey);
check('所有 t(\'...\') 引用的 key 在 8 语言 i18n.js 中都已定义',
  missingKeyList.length === 0,
  missingKeyList.length === 0
    ? '无'
    : '缺失 key: ' + missingKeyList.map(k => `${k}[${missingByKey[k].join(',')}]`).join('; '));

// ---- 4. 检查：8 语言块的 key 集合完全一致（schema 一致性）----
const schemaByLang = {};
for (const lang of langs) {
  schemaByLang[lang] = langKeys[lang] ? [...langKeys[lang]].sort() : [];
}

const enKeys = new Set(schemaByLang['en'] || []);
const schemaMismatches = [];
for (const lang of langs) {
  if (lang === 'en') continue;
  const otherKeys = new Set(schemaByLang[lang] || []);
  const inEnNotOther = [...enKeys].filter(k => !otherKeys.has(k));
  const inOtherNotEn = [...otherKeys].filter(k => !enKeys.has(k));
  if (inEnNotOther.length > 0 || inOtherNotEn.length > 0) {
    schemaMismatches.push({
      lang,
      inEnNotOther,
      inOtherNotEn,
    });
  }
}
check('i18n.js 8 语言块 key schema 一致（与 en 对齐）',
  schemaMismatches.length === 0,
  schemaMismatches.length === 0
    ? '无'
    : '不一致: ' + schemaMismatches.map(m =>
        `${m.lang}(en 独有: [${m.inEnNotOther.join(',')}], ${m.lang} 独有: [${m.inOtherNotEn.join(',')}])`
      ).join('; '));

// ---- 5. 报告：定义但未引用的 key（informational）----
const definedNotReferenced = [];
for (const lang of langs) {
  for (const k of langKeys[lang] || []) {
    if (!allReferenced.has(k)) {
      definedNotReferenced.push(`${lang}/${k}`);
    }
  }
}

// 这些是约定"未引用但合理"的 key：扩展点、debug、第三方可能用
const allowedUnreferenced = new Set([
  // 通用 fallback 字段
  'maybeLater', 'viewCountUnlimited', 'processed', 'waiting',
  'archiveLinkText',
  // 弹窗 label
  'ratePromptLabel1', 'ratePromptLabel2', 'ratePromptLabel3', 'ratePromptLabel4', 'ratePromptLabel5',
  'ratePromptNever', 'ratePromptSkip', 'ratePromptRatingThanks', 'ratePromptFeedbackTitle',
  'ratePromptFeedbackPlaceholder', 'ratePromptFeedbackSend', 'ratePromptFeedbackSent',
  'ratePromptTitle', 'ratePromptBody',
  // 诊断
  'pageDiagnostics', 'endDiagnostics', 'totalTestIdElements', 'topTestIds',
  'totalLabeledButtons', 'topAriaLabels',
  // 备份提示 key
  'videosBackupTip',
  // 通用 status
  'home', 'privacy', 'terms', 'help', 'activity', 'feedbackTooltip',
  'supportProject', 'considerSupporting', 'gotIt', 'usedToday',
  // 刷新按钮
  'refreshRequiresLogin', 'refreshRequiresTikTokTab', 'refreshReloadingPage',
  'refreshingConfig', 'configRefreshed', 'configRefreshFailed',
  // 跳转类
  'videosRequiresNav', 'repostsRequiresNav', 'likesRequiresNav',
  'favoritesRequiresNav', 'followingRequiresNav',
  'navigatingTo', 'pageLoadedResuming', 'cleanupAutoResumed',
  'pageTypeMismatch', 'typeRequiresNav', 'pendingCleanup',
  // 状态机
  'cleanupSkipped', 'cleanupAbortedPageNotFound', 'pausedLog', 'resumedLog',
  'stoppedByUser', 'cleanupCompleted', 'summaryDone', 'summaryStats',
  // 过滤
  'noItemsMatched', 'dateFilterSkipped', 'cleanupStuck', 'dailyBudgetExhausted',
  'foundButtonsCount', 'processedNavigatingTo', 'copyDiagnosticLog',
  'copiedToClipboard', 'copyFailed', 'sessionWriteFailed',
  // 视频清理
  'videoSkipped', 'videoDeleteFailed', 'videoDeleted',
  'repostDeleted', 'repostDeleteFailed', 'repostDeleteComplete',
  'noMoreReposts', 'endOfReposts', 'clickedUnlike',
  'clickedUnfavorite', 'clickedUnfollow',
  'unlikeFailed', 'unfavoriteFailed', 'unfollowFailed',
  'clickReturnedFalse', 'clickReturnedFalseUnfavorite', 'clickReturnedFalseConfirm',
  'unfollowedNoConfirm', 'noUnfollowButtons',
  'noMoreFavorites', 'endOfFavorites', 'noMoreFollowing', 'endOfFollowing',
  // 弹窗
  'confirmStop', 'paused', 'pausedLog',
  // 每日额度
  'dailyLimitReached', 'dailyLimitReachedHint', 'upgradeToPremium',
  'summaryDone', 'summaryStats', 'processing', 'completed',
  // 通用确认
  'checkingLogin', 'pleaseOpenTikTok', 'pleaseRefreshTikTokPage',
  'tiktokWebsiteDetected', 'openTikTokWebsite', 'pleaseLogin',
  'loggedIn', 'notLoggedIn', 'checking', 'startCleanup', 'pause', 'resume', 'stop',
  'stopped', 'startingCleanup', 'noItemsSelected',
  // 过滤 - 已在 defect 修复中新增
  'invalidDateRange',
  // 顶层 UI label
  'videos', 'reposts', 'likes', 'favorites', 'following',
  'minViewCount', 'maxViewCount', 'invalidViewCountRange',
  'invalidViewCount',
  'startingVideosCleanup', 'startingRepostsCleanup',
  'startingLikesCleanup', 'startingFavoritesCleanup', 'startingFollowingCleanup',
  'noUnlikeButtons', 'noMoreLikes', 'endOfLikes',
  // 调试
  'testing', 'test', 'debug', 'placeholder', 'todo',
  // 状态
  'stoppedLog', 'pauseLog', 'resumeLog',
]);

const trulyUnreferenced = definedNotReferenced.filter(x => {
  const key = x.split('/')[1];
  return !allowedUnreferenced.has(key);
});

// informational check (不 fail)
check('(info) 定义但未引用的 key 数 ≤ 20（informational）',
  trulyUnreferenced.length <= 20,
  `未引用 key (${trulyUnreferenced.length} 个): ${trulyUnreferenced.slice(0, 15).join(', ')}${trulyUnreferenced.length > 15 ? ' ...' : ''}`);

// ---- 6. 关键调用点 + 关键 key 显式锁定（防 P0 bug 回归）----
const criticalKeys = [
  'startingVideosCleanup', 'startingRepostsCleanup', 'startingLikesCleanup',
  'startingFavoritesCleanup', 'startingFollowingCleanup',
  'invalidViewCount', 'invalidViewCountRange', 'invalidDateRange',
  'dailyLimitReachedHint', 'dailyLimitReached', 'videosBackupTip',
  'archiveLinkText',
];

const criticalMissing = [];
for (const key of criticalKeys) {
  for (const lang of langs) {
    if (!langKeys[lang] || !langKeys[lang].has(key)) {
      criticalMissing.push(`${lang}/${key}`);
    }
  }
}
check('关键 i18n key × 8 语言全到位（防 P0 回归）',
  criticalMissing.length === 0,
  criticalMissing.length === 0 ? '无' : '缺失: ' + criticalMissing.join(', '));

// ---- 7. 死 key 检测：已被代码删除的 key 不应继续在 i18n.js 出现 ----
// 这里锁定 3 个已删除的 key（repostWarning / repostDeleteWarning / unrepostImpossible）
const deadKeys = ['repostWarning', 'repostDeleteWarning', 'unrepostImpossible'];
const deadKeyHits = [];
for (const key of deadKeys) {
  const re = new RegExp(`^\\s{6}${key}:`, 'gm');
  const matches = i18n.match(re);
  if (matches && matches.length > 0) {
    deadKeyHits.push(`${key}(${matches.length} 处)`);
  }
}
check('死 i18n key 已清理（repostWarning / repostDeleteWarning / unrepostImpossible）',
  deadKeyHits.length === 0,
  deadKeyHits.length === 0 ? '无' : '仍存在: ' + deadKeyHits.join(', '));

// ---- 输出 ----
console.log('');
console.log('=== verify-tiktok-keys-coverage.js ===');
console.log('TikTok t() ↔ i18n.js 8 语言 key 覆盖度 + schema 一致性');
console.log('');
console.log('  引用统计: sidepanel.js=' + refSp.size + ' t() · tiktok-automation.js=' + refAuto.size + ' t() · content.js=' + refContent.size + ' t() · sidepanel.html=' + refHtml.size + ' data-i18n*');
console.log('  去重后被引用 key: ' + allReferenced.size);
console.log('  i18n.js 8 语言块平均 key 数: ' + Math.round(
  Object.values(langKeys).reduce((s, set) => s + set.size, 0) / Math.max(1, Object.keys(langKeys).length)
));
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
