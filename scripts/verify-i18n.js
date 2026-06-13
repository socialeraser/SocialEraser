// 临时验证脚本：检查 i18n.js 8 语言 × 9 key 完整性
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
  'cleanupStuck'
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
  ? '\n[OK] 8 languages × 9 keys = 72 entries all present'
  : '\n[FAIL] some keys missing');
process.exit(allOk ? 0 : 1);