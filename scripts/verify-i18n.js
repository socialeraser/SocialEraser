// 临时验证脚本：检查 i18n.js 8 语言 × N key 完整性
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'chrome-extension/lib/i18n.js');
const src = fs.readFileSync(file, 'utf8');

const required = [
  'followingRequiresNav',
  'startingFollowingCleanup',
  'noUnfollowButtons',
  'clickedUnfollow',
  'clickReturnedFalseConfirm',
  'unfollowedNoConfirm',
  'unfollowFailed',
  'noMoreFollowing',
  'endOfFollowing',
  'cleanupStuck',
  'dailyBudgetExhausted',
  'cleanupAbortedPageNotFound',
  // Tweets 子选项（Step 3 批次清理推文，缩进后 tweetsOptions 标题已删除）
  'includeReplies',
  'includeRetweets',
  'includeRepliesHint',
  'includeRetweetsHint',
  'startingTweetsCleanup',
  'noMoreTweets',
  'pinnedTweetSkipped',
  'unreTweetSuccess',
  'undoRepost',
  'retweetNotDeleted',
  'tweetSkipped',
  'pinnedTweetHint',
  'endOfTweets',
  'tweetDeleteFailed',
  'unretweetFailed',
  'tweetsRequiresNav',
  'tweetDeleted'
];

const langs = ['en', 'zh-CN', 'zh-TW', 'ja', 'ko', 'es', 'de', 'fr'];

let allOk = true;

for (const lang of langs) {
  // 支持带引号（'zh-CN'）和不带引号（en）两种 key 写法
  const startMarkerA = "'" + lang + "': {";
  const startMarkerB = lang + ": {";
  let startIdx = src.indexOf(startMarkerA);
  if (startIdx < 0) startIdx = src.indexOf(startMarkerB);
  if (startIdx < 0) {
    console.log('  MISSING LANG BLOCK:', lang);
    allOk = false;
    continue;
  }
  // 括号配对找语言块结束
  let depth = 0;
  let blockEnd = -1;
  for (let i = startIdx; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) { blockEnd = i; break; }
    }
  }
  if (blockEnd < 0) {
    console.log('  CANNOT FIND END:', lang);
    allOk = false;
    continue;
  }
  const block = src.substring(startIdx, blockEnd);
  for (const key of required) {
    if (!block.includes(key + ':')) {
      console.log('  MISSING', lang, '->', key);
      allOk = false;
    }
  }
}

console.log(allOk
  ? '\n[OK] 8 languages × ' + required.length + ' keys = ' + (8 * required.length) + ' entries all present'
  : '\n[FAIL] some keys missing');

// 语言同步检查：i18n.js 必须读 preferredLang 并监听 storage.onChanged
// 否则用户在 sidepanel 切语言后，content/injector 仍用 navigator.language
const checks = [
  {
    name: 'i18n.js 读 chrome.storage.local.preferredLang',
    ok: src.includes("chrome.storage.local.get(['preferredLang']")
  },
  {
    name: 'i18n.js 监听 chrome.storage.onChanged',
    ok: src.includes('chrome.storage.onChanged.addListener')
  },
  {
    name: 'onChanged handler 过滤 preferredLang 字段',
    ok: src.includes('changes.preferredLang')
  },
  {
    name: 'onChanged handler 验证 TRANSLATIONS[newLang] 存在',
    ok: /TRANSLATIONS\[\s*(?:changes\.preferredLang\.newValue|newLang)\s*\]/.test(src)
  }
];

for (const c of checks) {
  console.log((c.ok ? '[OK]   ' : '[FAIL] ') + c.name);
  if (!c.ok) allOk = false;
}

process.exit(allOk ? 0 : 1);