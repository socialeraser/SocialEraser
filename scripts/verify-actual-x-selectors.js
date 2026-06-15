#!/usr/bin/env node
// verify-actual-x-selectors.js
// 用真实 X 页面 HTML 源码（用户在 /tests/ 目录保存的）锁定 selector 决策
// 防回归：如果 X 又改版、HTML 文件被改、或 injector.js 里的 selector 跟实际 DOM 不一致 → 立刻报错
//
// 来源：debug-tweets-zero-deleted.md
//   - respost弹出框源码.txt              → 自己的 More 菜单（应含 Delete menuitem）
//   - 删自己的帖子确认框源码.txt          → Delete 确认弹框
//   - 点击自己回复的消息右上角弹出框源码.txt → 回复的 More 菜单（应含 Delete menuitem）
//   - 在转发的帖子下面点击Undo            → 转发 → Undo repost 菜单
//   - with_replies页面远吗.txt            → 推文列表（caret / retweet 按钮入口）
//   - 点击More按钮弹出页面源码.txt        → 通用 More 弹框

'use strict';

const fs = require('fs');
const path = require('path');

const TESTS_DIR = path.join(__dirname, '..', 'tests');
const INJECTOR_PATH = path.join(__dirname, '..', 'chrome-extension', 'lib', 'injector.js');

let passed = 0;
let failed = 0;

function assert(cond, label) {
  if (cond) {
    console.log('  PASS  ' + label);
    passed++;
  } else {
    console.log('  FAIL  ' + label);
    failed++;
  }
}

function countMatches(html, regex) {
  const matches = html.match(regex);
  return matches ? matches.length : 0;
}

function readFile(name) {
  const p = path.join(TESTS_DIR, name);
  if (!fs.existsSync(p)) {
    console.log('  SKIP  file not found: ' + name);
    return null;
  }
  return fs.readFileSync(p, 'utf8');
}

console.log('=== verify-actual-x-selectors.js ===\n');

// ------------------------------------------------------------------
// 1) with_replies 页面：推文卡片核心 testid 数量
// ------------------------------------------------------------------
console.log('[1] with_replies 页面 - 推文卡片核心 testid 数量');
{
  const html = readFile('with_replies页面远吗.txt');
  if (html) {
    const tweets = countMatches(html, /data-testid="tweet"/g);
    const carets = countMatches(html, /data-testid="caret"/g);
    const retweets = countMatches(html, /data-testid="retweet"/g);
    const likes = countMatches(html, /data-testid="like"/g);
    const bookmarks = countMatches(html, /data-testid="bookmark"/g);

    assert(tweets === carets, 'tweet 数量 = caret 数量（' + tweets + ' vs ' + carets + '）— 每张卡片必有 caret');
    assert(tweets === retweets, 'tweet 数量 = retweet 数量（' + tweets + ' vs ' + retweets + '）— 每张卡片必有 retweet 按钮');
    assert(tweets === likes, 'tweet 数量 = like 数量（' + tweets + ' vs ' + likes + '）');
    assert(tweets === bookmarks, 'tweet 数量 = bookmark 数量（' + tweets + ' vs ' + bookmarks + '）');
    assert(tweets > 0, '页面至少有 1 张推文（' + tweets + '）');
  }
}
console.log();

// ------------------------------------------------------------------
// 2) More 菜单：caret 按钮 = aria-label="More" 同一个元素
// ------------------------------------------------------------------
console.log('[2] More 菜单入口 - caret 按钮 = aria-label="More" 同一个元素');
{
  const html = readFile('with_replies页面远吗.txt');
  if (html) {
    // 找 <button ... aria-label="More" ... data-testid="caret" ...> 的 pattern
    const combinedPattern = /aria-label="More"[^>]*data-testid="caret"|data-testid="caret"[^>]*aria-label="More"/g;
    const combined = countMatches(html, combinedPattern);
    const caretsOnly = countMatches(html, /data-testid="caret"/g);
    assert(combined > 0, '存在 caret + aria-label="More" 的组合按钮（' + combined + '）');
    assert(combined === caretsOnly, '所有 caret 都有 aria-label="More"（' + combined + ' vs ' + caretsOnly + '）');
  }
}
console.log();

// ------------------------------------------------------------------
// 3) 自己的 More 菜单：Delete 菜单项无 testid，靠文字匹配
// ------------------------------------------------------------------
console.log('[3] 自己的 More 菜单 - Delete 菜单项存在 + 无 testid');
{
  const html = readFile('respost弹出框源码.txt');
  if (html) {
    const deleteMentions = countMatches(html, />Delete</g);
    assert(deleteMentions >= 1, '存在 ">Delete<" 文字（次数 ' + deleteMentions + '）');

    // data-testid="Delete" 应该 0 命中 —— 关键回归点
    const oldTestId = countMatches(html, /data-testid="Delete"/g);
    assert(oldTestId === 0, 'data-testid="Delete" 0 命中（X 改版后已弃用这个 testid）');

    // 至少 1 个 menuitem 角色
    const menuitems = countMatches(html, /role="menuitem"/g);
    assert(menuitems >= 1, '至少 1 个 menuitem（' + menuitems + '）');
  }
}
console.log();

// ------------------------------------------------------------------
// 4) Delete 确认弹框：使用 confirmationSheetConfirm 通用 testid
// ------------------------------------------------------------------
console.log('[4] Delete 确认弹框 - 按钮 testid = confirmationSheet{Confirm,Cancel}');
{
  const html = readFile('删自己的帖子确认框源码.txt');
  if (html) {
    const confirm = countMatches(html, /data-testid="confirmationSheetConfirm"/g);
    const cancel = countMatches(html, /data-testid="confirmationSheetCancel"/g);
    assert(confirm >= 1, '存在 confirmationSheetConfirm 按钮（' + confirm + '）— 用于点确认删除');
    assert(cancel >= 1, '存在 confirmationSheetCancel 按钮（' + cancel + '）— 用于取消');

    // 标题包含 "Delete post?"，按钮文字是 "Delete"
    const titleMatch = html.indexOf('Delete post?');
    assert(titleMatch !== -1, '确认弹框标题含 "Delete post?"');

    // 弹框里没有 data-testid="Delete"（避免和菜单项混淆）
    const oldTestId = countMatches(html, /data-testid="Delete"/g);
    assert(oldTestId === 0, 'data-testid="Delete" 0 命中（X 改版后确认弹框也没这个 testid）');
  }
}
console.log();

// ------------------------------------------------------------------
// 5) 转发 Undo repost 菜单：unretweetConfirm testid
// ------------------------------------------------------------------
console.log('[5] 转发 Undo repost - 菜单项 testid = unretweetConfirm');
{
  const html = readFile('在转发的帖子下面点击Undo');
  if (html) {
    const unretweetConfirm = countMatches(html, /data-testid="unretweetConfirm"/g);
    assert(unretweetConfirm >= 1, '存在 unretweetConfirm 菜单项（' + unretweetConfirm + '）— X 改版后实际 testid');

    // 关键：unretweetConfirm 必须出现在 role="menuitem" 上下文里
    const unretweetConfirmInMenuitem = countMatches(html, /role="menuitem"[^>]*data-testid="unretweetConfirm"/g);
    assert(unretweetConfirmInMenuitem >= 1, 'unretweetConfirm 在 menuitem 角色里（' + unretweetConfirmInMenuitem + '）');

    // 旧的 aria-label*='Undo repost' 仍然匹配（兼容保留）
    const ariaUndoRepost = countMatches(html, /aria-label\*="Undo repost"/g);
    // 这个 HTML 文件里 aria-label="0 reposts. Repost" 是 retweet 按钮，不是 Undo 按钮
    // 所以应该 0 命中 Undo repost
    // 我们只检查："Undo repost" 文字本身存在
    const undoRepostText = countMatches(html, />Undo repost</g);
    assert(undoRepostText >= 1, '存在 ">Undo repost<" 文字（次数 ' + undoRepostText + '）');
  }
}
console.log();

// ------------------------------------------------------------------
// 6) 自己回复的 More 弹框：Delete menuitem 同样无 testid
// ------------------------------------------------------------------
console.log('[6] 自己回复的 More 弹框 - Delete 菜单项同样无 testid');
{
  const html = readFile('点击自己回复的消息右上角弹出框源码.txt');
  if (html) {
    const deleteMentions = countMatches(html, />Delete</g);
    assert(deleteMentions >= 1, '存在 ">Delete<" 文字（次数 ' + deleteMentions + '）');

    const oldTestId = countMatches(html, /data-testid="Delete"/g);
    assert(oldTestId === 0, 'data-testid="Delete" 0 命中（X 改版后无 testid）');
  }
}
console.log();

// ------------------------------------------------------------------
// 7) injector.js 源码：selector 决策与 HTML 一致
// ------------------------------------------------------------------
console.log('[7] injector.js - 关键 selector 与 HTML 真相一致');
{
  if (fs.existsSync(INJECTOR_PATH)) {
    const src = fs.readFileSync(INJECTOR_PATH, 'utf8');

    // 1. DEFAULT_SELECTORS.tweet.deleteButton 不再是 "[data-testid='Delete']" —— X 已弃用
    assert(
      !/deleteButton:\s*"\[\s*data-testid='Delete'\s*\]"/.test(src),
      'DEFAULT_SELECTORS.tweet.deleteButton 不再是 [data-testid="Delete"]（X 改版后失效）'
    );

    // 2. DEFAULT_SELECTORS.tweet.unreTweetButtons 必须包含 unretweetConfirm
    assert(
      /unreTweetButtons[\s\S]*?\[\s*data-testid='unretweetConfirm'\s*\]/.test(src),
      'DEFAULT_SELECTORS.tweet.unreTweetButtons 第一项是 [data-testid="unretweetConfirm"]'
    );

    // 3. deleteTweet 使用 waitForMenuItemByText，不再 waitForElement(selectors.deleteButton)
    assert(
      /async\s+deleteTweet[\s\S]*?waitForMenuItemByText/.test(src),
      'deleteTweet 内部使用 waitForMenuItemByText（按 8 语言文字匹配）'
    );

    // 4. 8 语言 Delete 关键字全部存在
    const langs = ['Delete', '删除', '削除', '삭제', 'Eliminar', 'Löschen', 'Supprimer'];
    langs.forEach((lang) => {
      assert(
        src.indexOf("'" + lang + "'") !== -1 || src.indexOf('"' + lang + '"') !== -1,
        '8 语言 Delete 关键字包含 "' + lang + '"'
      );
    });

    // 5. unreTweet 走 2 步：点 retweet 按钮 → 等 unretweetConfirm → 8 语言文字兜底
    assert(
      /async\s+unreTweet[\s\S]*?waitForElement\s*\(\s*'\[\s*data-testid="unretweetConfirm"\s*\]'/.test(src),
      'unreTweet 函数第二步：waitForElement unretweetConfirm 菜单项'
    );

    // 6. 8 语言 "Undo repost" 关键字（unreTweet 文字兜底）全部存在
    const unretweetLangs = ['Undo repost', '撤销转推', 'リポストを取り消す', '리트윗 취소', 'Cancelar repost', 'Repost rückgängig machen', 'Annuler le repost'];
    unretweetLangs.forEach((lang) => {
      assert(
        src.indexOf("'" + lang + "'") !== -1 || src.indexOf('"' + lang + '"') !== -1,
        '8 语言 Undo repost 关键字包含 "' + lang + '"'
      );
    });

    // 7. confirmButton 仍是 confirmationSheetConfirm（不要误改）
    assert(
      /confirmButton:\s*"\[\s*data-testid='confirmationSheetConfirm'\s*\]"/.test(src),
      'DEFAULT_SELECTORS.tweet.confirmButton 仍是 [data-testid="confirmationSheetConfirm"]'
    );

    // 8. isRetweetCard 关键修复：retweet 卡片的 caret 必须被过滤
    assert(
      /function\s+isRetweetCard\s*\(\s*button\s*\)/.test(src),
      'isRetweetCard(button) helper 函数存在'
    );
    assert(
      /isRetweetCard\s*\(\s*btns\[i\]\s*\)/.test(src) || /isRetweetCard\s*\(\s*b\s*\)/.test(src),
      'collectCandidates 内 isRetweetCard 过滤 caret 候选'
    );
    // 4 种 retweet 指示器（覆盖 X 改版）
    const retweetIndicators = ['unretweet', 'Unretweet', 'undoRepost', 'Reposted'];
    retweetIndicators.forEach((ind) => {
      assert(
        src.indexOf('"' + ind + '"') !== -1 || src.indexOf("'" + ind + "'") !== -1,
        'isRetweetCard 检测 ' + ind + ' 指示器'
      );
    });

    // 9. isReplyTweet 关键修复：includeReplies=false 时 reply 必须被跳过
    assert(
      /isReplyTweet\s*\(\s*container\s*\)/.test(src),
      'isReplyTweet(container) helper 函数存在'
    );
    assert(
      /tweetOptions[\s\S]*?includeReplies[\s\S]{0,50}=== false[\s\S]{0,200}isReplyTweet/.test(src),
      'processTweets 中 includeReplies=false + isReplyTweet 联合过滤 reply 卡片'
    );
    // 8 语言 "Replying to" 关键字
    const replyKeywords = ['replying to', '回复', '回覆', '返信', '답장', 'respondiendo a', 'antworten', 'répondre', 'rispondendo a'];
    replyKeywords.forEach((kw) => {
      assert(
        src.toLowerCase().indexOf(kw.toLowerCase()) !== -1,
        'isReplyTweet 检测 8 语言 "Replying to" 关键字: ' + kw
      );
    });
  } else {
    console.log('  SKIP  injector.js not found');
  }
}
console.log();

// ------------------------------------------------------------------
// 10) 菜单项数差异 = reply 标识（实战发现 2026-06-15）
//   关键：原创推文 caret 菜单有 Edit / Add/remove content disclosure / Change who can reply
//        reply caret 菜单没这三项（少 3 项，总数从 11 降到 8）
//   用途：未来 isReplyTweet 可作为二次校验（点开菜单后数菜单项数）
// ------------------------------------------------------------------
console.log('[10] 菜单项数 baseline - 原创 vs reply 差异');
{
  const originalMenu = readFile('respost弹出框源码.txt');
  const replyMenu = readFile('点击自己回复的消息右上角弹出框源码.txt');

  if (originalMenu && replyMenu) {
    // 原创菜单应该有的「高级」项
    const originalOnlyItems = [
      { kw: 'Edit', label: 'Edit（原创才有，reply 没有）' },
      { kw: 'Change who can reply', label: 'Change who can reply（原创才有，reply 没有）' },
      { kw: 'Add/remove content disclosure', label: 'Add/remove content disclosure（原创才有，reply 没有）' }
    ];
    originalOnlyItems.forEach((it) => {
      assert(
        originalMenu.indexOf(it.kw) !== -1,
        '原创菜单包含 ' + it.label
      );
      assert(
        replyMenu.indexOf(it.kw) === -1,
        'reply 菜单【不】包含 ' + it.label + '（关键差异 = reply 标识）'
      );
    });

    // 两个菜单都该有的核心项
    const commonItems = ['Delete', 'Pin to your profile', 'View post analytics'];
    commonItems.forEach((kw) => {
      assert(originalMenu.indexOf(kw) !== -1, '原创菜单包含通用项 ' + kw);
      assert(replyMenu.indexOf(kw) !== -1, 'reply 菜单包含通用项 ' + kw);
    });

    // 推论：原创菜单项数 > reply 菜单项数（差 3 项，2026-06-15 实战 = 11 vs 8）
    //   真实 saved HTML 数字可能是 12 vs 9（X 不同状态 / saved 时机不同）
    //   关键：相对差（+3）比绝对数字更稳
    const originalMenuItems = countMatches(originalMenu, /role="menuitem"/g);
    const replyMenuItems = countMatches(replyMenu, /role="menuitem"/g);
    assert(originalMenuItems >= 10, '原创菜单项数 >= 10（' + originalMenuItems + '）');
    assert(replyMenuItems >= 7 && replyMenuItems <= 9, 'reply 菜单项数 7-9（' + replyMenuItems + '）');
    assert(
      originalMenuItems - replyMenuItems === 3,
      '原创比 reply 多 3 项（' + originalMenuItems + ' - ' + replyMenuItems + ' = 3）— reply 标识'
    );
  }
}
console.log();

console.log('=== Result: ' + passed + ' pass, ' + failed + ' fail ===');
process.exit(failed === 0 ? 0 : 1);
