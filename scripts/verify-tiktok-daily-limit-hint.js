#!/usr/bin/env node
// verify-tiktok-daily-limit-hint.js
// 守住 dailyLimitReachedHint 8 语言关键词（项目铁律：所有语言必须含 'tip/support developer/come back tomorrow'）
//
// 铁律原文（project_memory.md）：
//   "All 8 language translations for `dailyLimitReachedHint` must contain keywords:
//    'tip/support developer/come back tomorrow'"
//
// 该铁律是商业模式防误伤：tip 提示用户升级打赏，替代付费订阅（项目无订阅功能）。
// 如果某语言漏译或丢关键词，等于砍掉这个 tip 的引导语，等于白送用户免费额度用完也不知道打赏。

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const I18N = path.join(ROOT, 'platforms/tiktok-project/scripts/i18n.js');
const DEFAULT_CFG = path.join(ROOT, 'platforms/tiktok-project/src/config/default.json');
const REMOTE_CFG = path.join(ROOT, 'platforms/tiktok-project/src/config/tiktok-remote-example.json');

const i18nSrc = fs.readFileSync(I18N, 'utf8');

let passed = 0;
let failed = 0;

function check(name, cond, extra) {
  if (cond) {
    console.log('  PASS  ' + name);
    passed++;
  } else {
    console.log('  FAIL  ' + name + (extra ? ' — ' + extra : ''));
    failed++;
  }
}

// 8 语言列表（与 i18n.js langAliases 一致）
const langs = ['en', 'zh-CN', 'ja', 'ko', 'pt', 'es', 'de', 'fr'];

// 解析 i18n.js 8 语言 dailyLimitReachedHint 文本
//   简化的 parser：直接搜 dailyLimitReachedHint: '...' 整段
//   i18n.js 8 语言 dailyLimitReachedHint 全文单引号包起来，文本内 \n 是字面 \\n
function extractHintByLang(lang) {
  // 找 language block：4 空格缩进 + lang key + : + {
  // zh-CN 是带引号的，en/ja/ko/pt/es/de/fr 是裸 key
  const langKeys = lang === 'zh-CN'
    ? ["'zh-CN'", "'zh_CN'", 'zh_CN']
    : [lang, lang.replace('-', '_')];
  const blockRe = new RegExp(
    '^    (' + langKeys.join('|') + '):\\s*\\{',
    'm'
  );
  const blockMatch = i18nSrc.match(blockRe);
  if (!blockMatch) return null;
  const startIdx = blockMatch.index + blockMatch[0].length;
  // 找块的结束 }（深度匹配，跳过字符串内的 { 和 }）
  let depth = 1;
  let i = startIdx;
  let inString = false;
  let stringChar = null;
  let prevChar = '';
  while (i < i18nSrc.length && depth > 0) {
    const c = i18nSrc[i];
    if (inString) {
      if (c === stringChar && prevChar !== '\\') {
        inString = false;
        stringChar = null;
      }
    } else {
      if (c === "'" || c === '"' || c === '`') {
        inString = true;
        stringChar = c;
      } else if (c === '{') {
        depth++;
      } else if (c === '}') {
        depth--;
        if (depth === 0) break;
      }
    }
    prevChar = c;
    i++;
  }
  const block = i18nSrc.slice(startIdx, i);
  const keyRe = /dailyLimitReachedHint:\s*'((?:[^'\\]|\\.)*)'/;
  const m = block.match(keyRe);
  return m ? m[1].replace(/\\n/g, '\n').replace(/\\'/g, "'") : null;
}

console.log('=== verify-tiktok-daily-limit-hint.js ===');
console.log('8 语言 dailyLimitReachedHint 关键词覆盖率（项目铁律）\n');

// 0. i18n.js 存在
check('i18n.js 存在', fs.existsSync(I18N));

// 1. 8 语言全部含 dailyLimitReachedHint
const langResults = {};
for (const lang of langs) {
  const hint = extractHintByLang(lang);
  langResults[lang] = hint;
  check('i18n.js ' + lang + ' dailyLimitReachedHint 已定义', !!hint,
    hint ? null : 'key 未找到或解析失败');
}

// 2. 每个语言的 hint 必须含 3 个关键词中的至少 1 个翻译变体
// 铁律是 "tip/support developer/come back tomorrow" — 3 个语义组
const keywordGroups = {
  'tip/support': /(tip|support|tip the developer|support the developer|支持开发者|打赏|寄付|後援|후원|donativo|donar|donner|apoiar?|apoyar?|unterstützen|soutenir|desenvolvedor|desarrollador|Entwickler|développeur)/i,
  'come back tomorrow': /(come back tomorrow|tomorrow|明天|明日|내일|amanhã|mañana|morgen|demain)/i
};

for (const lang of langs) {
  const hint = langResults[lang] || '';
  const hasTip = keywordGroups['tip/support'].test(hint);
  const hasComeBack = keywordGroups['come back tomorrow'].test(hint);
  check('i18n.js ' + lang + ' dailyLimitReachedHint 含 "tip/support" 关键词', hasTip,
    '实际文本: ' + JSON.stringify(hint.slice(0, 80)));
  check('i18n.js ' + lang + ' dailyLimitReachedHint 含 "come back tomorrow" 关键词', hasComeBack,
    '实际文本: ' + JSON.stringify(hint.slice(0, 80)));
}

// 3. default.json / tiktok-remote-example.json 存在（i18n.js 是运行时副本，config 是 source of truth — 防两边漂移）
//    当前 default.json / remote example 的 i18n 字段为空（运行时 fallback 到 i18n.js 的 DEFAULT_I18N），
//    这里只断言两文件存在 + JSON 格式合法，不强制 i18n 段非空。
check('default.json 存在且 JSON 合法', (function() {
  try { JSON.parse(fs.readFileSync(DEFAULT_CFG, 'utf8')); return true; }
  catch (e) { return false; }
})());
check('tiktok-remote-example.json 存在且 JSON 合法', (function() {
  try { JSON.parse(fs.readFileSync(REMOTE_CFG, 'utf8')); return true; }
  catch (e) { return false; }
})());

// 4. 完整断言
check('i18n.js 8 语言 dailyLimitReachedHint 全部含两个必含关键词',
  langs.every(l => {
    const hint = langResults[l] || '';
    return keywordGroups['tip/support'].test(hint) && keywordGroups['come back tomorrow'].test(hint);
  }),
  '漏语言: ' + langs.filter(l => {
    const hint = langResults[l] || '';
    return !(keywordGroups['tip/support'].test(hint) && keywordGroups['come back tomorrow'].test(hint));
  }).join(', '));

console.log('\n=== summary ===');
console.log('  passed: ' + passed);
console.log('  failed: ' + failed);
if (failed > 0) {
  console.log('\nFAIL: ' + failed + ' check(s) failed');
  console.log('提示: 8 语言 dailyLimitReachedHint 必须含 "tip/support developer" + "come back tomorrow" 关键词翻译。');
  console.log('  这是商业模式铁律 — 删掉等于砍掉 tip 引导，用户额度用完不知道打赏。');
  process.exit(1);
}
console.log('OK: 8 语言 dailyLimitReachedHint 关键词全到位');
process.exit(0);
