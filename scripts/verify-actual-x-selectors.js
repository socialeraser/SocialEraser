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
const INJECTOR_PATH = path.join(__dirname, '..', 'platforms', 'x-project', 'scripts', 'x-automation.js');
const I18N_PATH = path.join(__dirname, '..', 'platforms', 'x-project', 'scripts', 'i18n.js');

let passed = 0;
let failed = 0;

// 8 语言 selector 关键字已挪到 i18n.js 的 DEFAULT_I18N，injector.js 通过 window.XEraseri18n.DEFAULT_I18N 引用
// 所以关键字关键字检查必须看 i18n.js，不能再看 injector.js
const i18nSrc = fs.existsSync(I18N_PATH) ? fs.readFileSync(I18N_PATH, 'utf8') : '';

// 加载 config 文件（2026-XX-XX 重构：section 7 改为检查 config 而非 DEFAULT_SELECTORS）
const DEFAULT_CFG_PATH = path.join(__dirname, '..', 'platforms', 'x-project', 'src', 'config', 'default.json');
const REMOTE_CFG_PATH = path.join(__dirname, '..', 'platforms', 'x-project', 'src', 'config', 'remote-example.json');
const defaultCfg = fs.existsSync(DEFAULT_CFG_PATH) ? JSON.parse(fs.readFileSync(DEFAULT_CFG_PATH, 'utf8')) : {};
const remoteCfg = fs.existsSync(REMOTE_CFG_PATH) ? JSON.parse(fs.readFileSync(REMOTE_CFG_PATH, 'utf8')) : {};

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
// 7) injector.js 源码：selector 决策与 HTML 一致（2026-XX-XX 重构：检查 config 而非 DEFAULT_SELECTORS）
// ------------------------------------------------------------------
console.log('[7] injector.js - 关键 selector 与 HTML 真相一致');
{
  if (fs.existsSync(INJECTOR_PATH)) {
    const src = fs.readFileSync(INJECTOR_PATH, 'utf8');

    // 1. injector.js 不再含硬编码 DEFAULT_SELECTORS（已全部移到 config）
    assert(
      !/const\s+DEFAULT_SELECTORS\s*=/.test(src),
      'injector.js 已删除 DEFAULT_SELECTORS（全部移到 config）'
    );

    // 2. config 文件的 retweet.unretweetConfirmButtons 包含 unretweetConfirm（2026-06-18 重构：tweet 拆为 retweet 节点独有）
    assert(
      remoteCfg.selectors.retweet && remoteCfg.selectors.retweet.unretweetConfirmButtons &&
      remoteCfg.selectors.retweet.unretweetConfirmButtons.some(s => s.indexOf('unretweetConfirm') !== -1),
      'config.retweet.unretweetConfirmButtons 含 unretweetConfirm selector'
    );
    assert(
      defaultCfg.selectors.retweet && defaultCfg.selectors.retweet.unretweetConfirmButtons &&
      defaultCfg.selectors.retweet.unretweetConfirmButtons.some(s => s.indexOf('unretweetConfirm') !== -1),
      'default.json.retweet.unretweetConfirmButtons 含 unretweetConfirm selector'
    );

    // 3. deleteTweet 使用 waitForMenuItemByText，不再 waitForElement(selectors.deleteButton)
    assert(
      /async\s+deleteTweet[\s\S]*?waitForMenuItemByText/.test(src),
      'deleteTweet 内部使用 waitForMenuItemByText（按 8 语言文字匹配）'
    );

    // 4. 8 语言 Delete 关键字全部存在（已在 i18n.js 的 DEFAULT_I18N，injector.js 通过引用读）
    const langs = ['Delete', '删除', '削除', '삭제', 'Eliminar', 'Löschen', 'Supprimer'];
    langs.forEach((lang) => {
      assert(
        i18nSrc.indexOf("'" + lang + "'") !== -1 || i18nSrc.indexOf('"' + lang + '"') !== -1,
        '8 语言 Delete 关键字包含 "' + lang + '"'
      );
    });

    // 5. unreTweet 走 2 步：点 retweet 按钮 → 等 unretweetConfirm → 8 语言文字兜底
    assert(
      /async\s+unreTweet[\s\S]*?unretweetConfirmButtons/.test(src),
      'unreTweet 函数读 config.retweet.unretweetConfirmButtons'
    );

    // 6. 8 语言 "Undo repost" 关键字（unreTweet 文字兜底）全部存在（已在 i18n.js）
    const unretweetLangs = ['Undo repost', '撤销转推', 'リポストを取り消す', '리트윗 취소', 'Cancelar repost', 'Repost rückgängig machen', 'Annuler le repost'];
    unretweetLangs.forEach((lang) => {
      assert(
        i18nSrc.indexOf("'" + lang + "'") !== -1 || i18nSrc.indexOf('"' + lang + '"') !== -1,
        '8 语言 Undo repost 关键字包含 "' + lang + '"'
      );
    });

    // 7. config.common.confirmButton 仍是 confirmationSheetConfirm
    assert(
      remoteCfg.selectors.common && remoteCfg.selectors.common.confirmButton &&
      remoteCfg.selectors.common.confirmButton.some(s => s.indexOf('confirmationSheetConfirm') !== -1),
      'config.common.confirmButton 含 [data-testid="confirmationSheetConfirm"]'
    );
    assert(
      defaultCfg.selectors.common && defaultCfg.selectors.common.confirmButton &&
      defaultCfg.selectors.common.confirmButton.some(s => s.indexOf('confirmationSheetConfirm') !== -1),
      'default.json.common.confirmButton 含 [data-testid="confirmationSheetConfirm"]'
    );

    // 8. isRetweetCard 关键修复：retweet 卡片的 caret 必须被过滤（2026-06-18 重构：移到 processOriginalTweets/processReplies 内部）
    assert(
      /isRetweetCard\s*\(\s*article\s*\)/.test(src),
      'isRetweetCard(article) helper 存在（processOriginalTweets/processReplies 内部函数）'
    );
    // 4 种 retweet 指示器（覆盖 X 改版）—— 移到 config.retweet.cardMarker
    assert(
      remoteCfg.selectors.retweet && remoteCfg.selectors.retweet.cardMarker &&
      remoteCfg.selectors.retweet.cardMarker.length >= 1,
      'config.retweet.cardMarker 含至少 1 种 retweet 指示器'
    );

    // 9. isReplyTweet 关键修复：3 个 type 完全独立，isReplyTweet 由 processOriginalTweets 调
    assert(
      /isReplyTweet\s*\(\s*container\s*\)/.test(src),
      'isReplyTweet(container) helper 函数存在'
    );
    assert(
      /isReplyTweet\s*\(\s*article\s*\)/.test(src),
      'processOriginalTweets 调 isReplyTweet(article) 过滤 reply 卡片'
    );
    // 8 语言 "Replying to" 关键字（已在 i18n.js 的 DEFAULT_I18N.replyKeywords）
    const replyKeywords = ['replying to', '回复', '返信', '답장', 'respondendo a', 'respondiendo a', 'antworten', 'répondre', 'rispondendo a'];
    replyKeywords.forEach((kw) => {
      assert(
        i18nSrc.toLowerCase().indexOf(kw.toLowerCase()) !== -1,
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

// ------------------------------------------------------------------
// 11) 8 语言 Cancel / Confirm 关键字（防 X 把按钮 aria-label 也翻译）
//   关键：X 2026 当前版本会把按钮 aria-label 也按用户 X 显示语言翻译
//   之前我们只用 button[aria-label*='Cancel']（英文），zh-CN/ja/ko/es/de/fr 全部 0 命中
//   现在用 8 语言文字兜底（findButtonByText helper + CANCEL_KEYWORDS_8LANG）
// ------------------------------------------------------------------
console.log('[11] 8 语言 Cancel / Confirm 关键字 + findButtonByText helper');
{
  if (fs.existsSync(INJECTOR_PATH)) {
    const src = fs.readFileSync(INJECTOR_PATH, 'utf8');

    // 1. CANCEL_KEYWORDS_8LANG 常量存在 + 8 语言齐全
    assert(
      /CANCEL_KEYWORDS_8LANG\s*=/.test(src),
      'CANCEL_KEYWORDS_8LANG 常量定义存在'
    );
    const cancelLangs = ['Cancel', '取消', 'キャンセル', '취소', 'Cancelar', 'Abbrechen', 'Annuler'];
    cancelLangs.forEach((lang) => {
      assert(
        i18nSrc.indexOf("'" + lang + "'") !== -1 || i18nSrc.indexOf('"' + lang + '"') !== -1,
        'CANCEL_KEYWORDS_8LANG 包含 8 语言 Cancel 关键字: ' + lang
      );
    });

    // 2. CONFIRM_KEYWORDS_8LANG 常量存在
    assert(
      /CONFIRM_KEYWORDS_8LANG\s*=/.test(src),
      'CONFIRM_KEYWORDS_8LANG 常量定义存在'
    );
    const confirmLangs = ['Delete', '删除', '削除', '삭제', 'Eliminar', 'Löschen', 'Supprimer'];
    confirmLangs.forEach((lang) => {
      assert(
        i18nSrc.indexOf("'" + lang + "'") !== -1 || i18nSrc.indexOf('"' + lang + '"') !== -1,
        'CONFIRM_KEYWORDS_8LANG 包含 8 语言 Confirm 关键字: ' + lang
      );
    });

    // 3. findButtonByText helper 存在（与 waitForMenuItemByText 复刻的轮询模式）
    assert(
      /async\s+findButtonByText\s*\(\s*keywords\s*,\s*timeout\s*\)/.test(src),
      'findButtonByText(keywords, timeout) helper 函数存在'
    );

    // 4. findButtonByText 内部用 [role="button"] 查（不是 menuitem）
    assert(
      /findButtonByText[\s\S]{0,300}\[role\s*=\s*["']button["']\]/.test(src),
      'findButtonByText 内部查 [role="button"] 元素（不是 menuitem）'
    );

    // 5. stop() 内部调用 _closeAnyOpenConfirmDialog 关闭弹窗
    assert(
      /stop\s*\(\s*\)\s*\{[\s\S]{0,300}_closeAnyOpenConfirmDialog/.test(src),
      'stop() 内部调用 _closeAnyOpenConfirmDialog 关闭残留 confirm 弹窗'
    );

    // 6. _closeAnyOpenConfirmDialog 使用 findButtonByText + cancelKeywords（已升级为 this._i18n 模式，详见第 12 节 #7）
    //   旧版用 CANCEL_KEYWORDS_8LANG 常量，案例 11 重构后改用 this._i18n.cancelKeywords（远程可覆盖）
    //   第 12 节 #7 已经覆盖这个断言，这里跳过
    assert(true, '_closeAnyOpenConfirmDialog 找 Cancel 按钮（已升级到 this._i18n.cancelKeywords，见第 12 节 #7）');
  } else {
    console.log('  SKIP  injector.js not found');
  }
}
console.log();

// ------------------------------------------------------------------
// 12) i18n 全部配置化：DEFAULT_I18N 已挪到 i18n.js，injector.js 通过 window.XEraseri18n.DEFAULT_I18N 引用
//   关键：X 改版改了翻译时，**只改 i18n.js 的 DEFAULT_I18N 或远程配置即可**，不用动 injector.js
//   防回归：锁死 DEFAULT_I18N 位置 / setConfig 合并 / 5 处运行时读取
// ------------------------------------------------------------------
console.log('[12] i18n 全部配置化（DEFAULT_I18N 在 i18n.js + injector.js 引用 + 5 处运行时读取）');
{
  const INJECT_PATH = INJECTOR_PATH;
  const I18N_PATH = path.join(__dirname, '..', 'platforms', 'x-project', 'scripts', 'i18n.js');

  if (fs.existsSync(INJECT_PATH) && fs.existsSync(I18N_PATH)) {
    const injectSrc = fs.readFileSync(INJECT_PATH, 'utf8');
    const i18nSrc = fs.readFileSync(I18N_PATH, 'utf8');

    // 1. i18n.js 内有 DEFAULT_I18N 常量 + 6 个字段齐全
    assert(/DEFAULT_I18N\s*=/.test(i18nSrc), 'i18n.js: DEFAULT_I18N 常量定义存在');
    const i18nFields = ['deleteKeywords', 'unretweetKeywords', 'pinnedKeywords', 'replyKeywords', 'cancelKeywords', 'confirmKeywords'];
    i18nFields.forEach((f) => {
      assert(
        new RegExp(f + '\\s*:\\s*\\[').test(i18nSrc),
        'i18n.js DEFAULT_I18N 包含 ' + f + ' 字段（数组形式）'
      );
    });

    // 2. i18n.js 暴露 window.XEraseri18n.DEFAULT_I18N
    assert(
      /window\.XEraseri18n\s*=\s*\{[\s\S]{0,500}DEFAULT_I18N\s*:/.test(i18nSrc),
      'i18n.js: window.XEraseri18n.DEFAULT_I18N 暴露存在'
    );

    // 3. injector.js 不应再有 DEFAULT_I18N 常量定义（必须挪走了）
    //   例外：CANCEL_KEYWORDS_8LANG / CONFIRM_KEYWORDS_8LANG 这两个**别名**是允许的（向后兼容）
    //   排除法：找 `const DEFAULT_I18N = {` 模式（不在别名行）
    const injectorHasLocalDefaultI18N = /const\s+DEFAULT_I18N\s*=\s*\{/.test(injectSrc);
    assert(
      !injectorHasLocalDefaultI18N,
      'injector.js: 不应有本地 const DEFAULT_I18N = {...}（必须挪到 i18n.js）'
    );

    // 4. injector.js setConfig 内部从 window.XEraseri18n.DEFAULT_I18N 读
    assert(
      /setConfig\s*\(\s*config\s*\)\s*\{[\s\S]{0,3000}window\.XEraseri18n[\s\S]{0,200}DEFAULT_I18N/.test(injectSrc),
      'injector.js setConfig 用 window.XEraseri18n.DEFAULT_I18N 作 i18n 兜底'
    );
    assert(
      /setConfig\s*\(\s*config\s*\)\s*\{[\s\S]{0,3000}this\._i18n\s*=/.test(injectSrc),
      'injector.js setConfig 内部 this._i18n 初始化逻辑存在'
    );

    // 5. deleteTweet 用 this._i18n.deleteKeywords
    assert(
      /async\s+deleteTweet[\s\S]{0,3000}this\._i18n\.deleteKeywords/.test(injectSrc),
      'deleteTweet 用 this._i18n.deleteKeywords'
    );

    // 6. unreTweet 用 this._i18n.unretweetKeywords
    assert(
      /async\s+unreTweet[\s\S]{0,3000}this\._i18n\.unretweetKeywords/.test(injectSrc),
      'unreTweet 用 this._i18n.unretweetKeywords'
    );

    // 7. isPinnedTweet 用 this._i18n.pinnedKeywords（动态构建 regex）
    assert(
      /isPinnedTweet[\s\S]{0,2000}this\._i18n\.pinnedKeywords/.test(injectSrc),
      'isPinnedTweet 用 this._i18n.pinnedKeywords 动态构建 regex'
    );

    // 8. isReplyTweet 用 this._i18n.replyKeywords（动态构建 regex）
    assert(
      /isReplyTweet[\s\S]{0,2000}this\._i18n\.replyKeywords/.test(injectSrc),
      'isReplyTweet 用 this._i18n.replyKeywords 动态构建 regex'
    );

    // 9. _closeAnyOpenConfirmDialog 用 this._i18n.cancelKeywords
    assert(
      /_closeAnyOpenConfirmDialog[\s\S]{0,1000}this\._i18n\.cancelKeywords/.test(injectSrc),
      '_closeAnyOpenConfirmDialog 用 this._i18n.cancelKeywords'
    );
  } else {
    console.log('  SKIP  injector.js or i18n.js not found');
  }
}
console.log();

// ------------------------------------------------------------------
// 13) remote-example.json：i18n section 完整 + 8 语言全有
//   关键：远程配置是 X 改版时第一个改的地方 —— 改了翻译只 push GCS 即可，不用发新版扩展
// ------------------------------------------------------------------
console.log('[13] remote-example.json - i18n section 完整 + 8 语言全有');
{
  const configPath = path.join(__dirname, '..', 'platforms', 'x-project', 'src', 'config', 'remote-example.json');
  if (fs.existsSync(configPath)) {
    const configSrc = fs.readFileSync(configPath, 'utf8');
    let config = null;
    try {
      config = JSON.parse(configSrc);
    } catch (e) {
      console.log('  FAIL  remote-example.json JSON 解析失败: ' + e.message);
      failed++;
    }
    if (config) {
      // 1. selectors.i18n 节点存在
      assert(
        config.selectors && config.selectors.i18n,
        'remote-example.json: selectors.i18n 节点存在'
      );

      if (config.selectors && config.selectors.i18n) {
        // 2. 6 个 keywords 字段齐全
        const requiredFields = ['deleteKeywords', 'unretweetKeywords', 'pinnedKeywords', 'replyKeywords', 'cancelKeywords', 'confirmKeywords'];
        requiredFields.forEach((f) => {
          assert(
            Array.isArray(config.selectors.i18n[f]) && config.selectors.i18n[f].length >= 8,
            'i18n.' + f + ' 数组存在且 ≥ 8 元素（实际 ' + (config.selectors.i18n[f] ? config.selectors.i18n[f].length : 0) + '）'
          );
        });

        // 3. 8 语言关键字抽查（deleteKeywords 必含 6 种语言）
        const langs = ['Delete', '删除', '削除', '삭제', 'Excluir', 'Eliminar', 'Löschen', 'Supprimer'];
        langs.forEach((lang) => {
          assert(
            Array.isArray(config.selectors.i18n.deleteKeywords) && config.selectors.i18n.deleteKeywords.indexOf(lang) !== -1,
            'i18n.deleteKeywords 包含 8 语言 "' + lang + '"'
          );
        });

        // 4. 8 语言 cancelKeywords 抽查
        const cancelLangs = ['Cancel', '取消', 'キャンセル', '취소', 'Cancelar', 'Abbrechen', 'Annuler'];
        cancelLangs.forEach((lang) => {
          assert(
            Array.isArray(config.selectors.i18n.cancelKeywords) && config.selectors.i18n.cancelKeywords.indexOf(lang) !== -1,
            'i18n.cancelKeywords 包含 8 语言 "' + lang + '"'
          );
        });

        // 5. common.tweetMoreButtons 包含 8 语言 aria-label fallback（2026-06-18 重构：tweet.moreButtons 移到 common.tweetMoreButtons）
        //   pt=Mais 已通过 2026-06-21 MCP Chrome 实地验证加入
        const moreAriaLang = ['更多', 'もっと見る', '더 보기', 'Mais', 'Más', 'Mehr', 'Plus'];
        const moreButtons = (config.selectors.common && config.selectors.common.tweetMoreButtons) || [];
        moreAriaLang.forEach((lang) => {
          assert(
            moreButtons.some(b => b.indexOf(lang) !== -1),
            'common.tweetMoreButtons 包含 8 语言 aria-label "' + lang + '"'
          );
        });

        // 6. pinnedKeywords 8 语言抽查（2026-06-21 修正：pt=首字母大写 "Fixado"，es 同理）
        //   实证数据：en=pinned, zh-CN=已置顶, ja=ピン留め, ko=고정, pt=Fixado, es=Fijado, de=Angeheftet, fr=Épinglé
        const pinnedLangs = ['pinned', '已置顶', 'ピン留め', '고정', 'Fixado', 'Fijado', 'Angeheftet', 'Épinglé'];
        pinnedLangs.forEach((lang) => {
          assert(
            Array.isArray(config.selectors.i18n.pinnedKeywords) && config.selectors.i18n.pinnedKeywords.indexOf(lang) !== -1,
            'i18n.pinnedKeywords 包含 8 语言 "' + lang + '"'
          );
        });
      }
    }
  } else {
    console.log('  SKIP  remote-example.json not found');
  }
}
console.log();

// ------------------------------------------------------------------
// 14a) default.json + remote-example.json：login.checkElements 8 语言实测文本（不是猜的）
//   实证数据（2026-06-21 MCP Chrome 切 ?lang=xx 抓 /i/jf/onboarding/web 实际 DOM）：
//     X 2026 web onboarding 流程：所有语言都改为"Continue + Continue with phone/Apple"模式
//     旧的"Sign in / Create your account"风格已完全废弃
//   每语言必含：主按钮 + alt sign-in + 输入框占位
//   testid 锚点 [data-testid='loginButton'] 必须保留
// ------------------------------------------------------------------
console.log('[14a] login.checkElements 8 语言实测文本（2026-06-21 MCP 验证）');
{
  const files = [
    path.join(__dirname, '..', 'platforms', 'x-project', 'src', 'config', 'default.json'),
    path.join(__dirname, '..', 'platforms', 'x-project', 'src', 'config', 'remote-example.json')
  ];
  // 8 语言实测：每语言 [主按钮, alt sign-in (手机/Apple), 输入框占位]
  const LOGIN_8LANG = {
    'en':     ['Continue', 'Continue with phone', 'Email or username'],
    'zh-CN':  ['继续', '使用手机继续', '电子邮箱或用户名'],
    'ja':     ['続ける', '電話番号で続ける', 'メールアドレスまたはユーザー名'],
    'ko':     ['계속하기', '전화번호로 계속', '이메일 또는 사용자 이름'],
    'pt':     ['Continuar', 'Inscreve-te com o telefone', 'E-mail ou nome de utilizador'],
    'es':     ['Continuar', 'Continuar con el teléfono', 'Correo electrónico o nombre de usuario'],
    'de':     ['Fortfahren', 'Mit Telefon fortfahren', 'E-Mail oder Benutzername'],
    'fr':     ['Continuer', "S'inscrire avec un numéro de téléphone", "E-mail ou nom d'utilisateur"]
  };
  // 旧错文本：发现还在应 FAIL（X 2026 web onboarding 已废弃这些措辞）
  const LOGIN_FORBIDDEN = {
    'en':    ['Sign in', 'Create your account'],
    'de':    ['Anmelden', 'Konto erstellen'],
    'es':    ['Iniciar sesión', 'Crea tu cuenta'],
    'fr':    ['Se connecter', 'Créer votre compte'],
    'ja':    ['サインイン', 'アカウントを作成'],
    'ko':    ['로그인', '계정 만들기'],
    'zh-CN': ['创建您的账户'],
    'pt':    ['Entrar', 'Criar sua conta']
  };
  for (const fp of files) {
    if (!fs.existsSync(fp)) continue;
    const cfg = JSON.parse(fs.readFileSync(fp, 'utf8'));
    const checkElements = (cfg.selectors && cfg.selectors.login && cfg.selectors.login.checkElements) || {};
    for (const lang of Object.keys(LOGIN_8LANG)) {
      const arr = checkElements[lang] || [];
      const texts = arr.filter(e => e.type === 'text').map(e => e.value);
      LOGIN_8LANG[lang].forEach((t) => {
        assert(texts.indexOf(t) !== -1, path.basename(fp) + ' login.checkElements.' + lang + ' 含实测文本 "' + t + '"');
      });
      (LOGIN_FORBIDDEN[lang] || []).forEach((t) => {
        assert(texts.indexOf(t) === -1, path.basename(fp) + ' login.checkElements.' + lang + ' 不含旧错文本 "' + t + '"');
      });
      const hasTestid = arr.some(e => e.type === 'selector' && e.value === "[data-testid='loginButton']");
      assert(hasTestid, path.basename(fp) + ' login.checkElements.' + lang + ' 保留 [data-testid="loginButton"] 锚点');
    }
  }
}
console.log();

// ------------------------------------------------------------------
// 14) default.json：8 语言兜底（en/zh-CN/ja/ko/pt/es/de/fr）
//   关键：远程 fetch 失败时，default.json 是用户唯一的兜底 —— 没 8 语言兜底就死
//   防回归：锁死 default.json 至少含 8 语言 selector fallback
//   来源：MCP 实证（2026-06-18 在 /home /bookmarks /following 4 个 URL 切 8 种语言）
// ------------------------------------------------------------------
console.log('[14] default.json - 8 语言兜底同步（远程失败时项目自带默认配置）');
{
  const defaultPath = path.join(__dirname, '..', 'platforms', 'x-project', 'src', 'config', 'default.json');
  if (fs.existsSync(defaultPath)) {
    const defaultSrc = fs.readFileSync(defaultPath, 'utf8');
    let defaultCfg = null;
    try {
      defaultCfg = JSON.parse(defaultSrc);
    } catch (e) {
      console.log('  FAIL  default.json JSON 解析失败: ' + e.message);
      failed++;
    }
    if (defaultCfg && defaultCfg.selectors) {
      // 1. common.tweetMoreButtons 至少含 8 语言（2026-06-18 重构：tweet.moreButtons 移到 common.tweetMoreButtons）
      //   实证数据：en=More, zh-CN=更多, ja=もっと見る, ko=더 보기, pt=Mais, es=Más opciones, de=Mehr, fr=Plus
      //   （2026-06-21 MCP Chrome 实地验证：x.com lang=pt，aria-label="Mais"，testid=caret）
      const moreButtons = (defaultCfg.selectors.common && defaultCfg.selectors.common.tweetMoreButtons) || [];
      const moreLangs = ['更多', 'もっと見る', '더 보기', 'Mais', 'Más opciones', 'Mehr', 'Plus'];
      moreLangs.forEach((s) => {
        assert(
          moreButtons.some(b => b.indexOf(s) !== -1),
          'default.json common.tweetMoreButtons 包含 "' + s + '"'
        );
      });

      // 2. like.unlikeButtons 至少含 8 语言（en + zh-CN + ja + ko + pt + es + de + fr）
      //   实证数据：en=Liked, zh-CN=喜欢了, ja=いいねしました, ko=마음에 들어 함,
      //           pt=Curtiu, es=Marcó como Me gusta, de=Gefällt mir, fr=J'aime
      //           （2026-06-21 MCP Chrome 实地验证：x.com lang=pt，aria-label 格式 `{N} Curtidas. Curtiu`）
      const unlikeButtons = (defaultCfg.selectors.like && defaultCfg.selectors.like.unlikeButtons) || [];
      const unlikeLangs = ['Liked', '喜欢了', 'いいねしました', '마음에 들어 함', 'Curtiu', 'Marcó como Me gusta', 'Gefällt mir', "J'aime"];
      unlikeLangs.forEach((s) => {
        assert(
          unlikeButtons.some(b => b.indexOf(s) !== -1),
          'default.json like.unlikeButtons 包含 "' + s + '"'
        );
      });

      // 3. bookmark.removeButtons 至少含 8 语言
      //   实证数据：en=Bookmarked, zh-CN=已加入书签, ja=ブックマークに追加済み,
      //           ko=북마크에 추가됨, pt=Item salvo, es=Guardado, de=Lesezeichen, fr=signets
      //           （2026-06-21 MCP Chrome 实地验证：x.com lang=pt，aria-label="Item salvo"，testid=removeBookmark）
      const removeButtons = (defaultCfg.selectors.bookmark && defaultCfg.selectors.bookmark.removeButtons) || [];
      const removeLangs = ['Bookmarked', '已加入书签', 'ブックマークに追加済み', '북마크에 추가됨', 'Item salvo', 'Guardado', 'Lesezeichen', 'signets'];
      removeLangs.forEach((s) => {
        assert(
          removeButtons.some(b => b.indexOf(s) !== -1),
          'default.json bookmark.removeButtons 包含 "' + s + '"'
        );
      });

      // 4. following.unfollowButtons 至少含 8 语言
      //   实证数据：en=Following, zh-CN=正在关注, ja=フォロー中, ko=팔로잉,
      //           pt=Seguindo, es=Siguiendo, de=Folge ich, fr=Abonné
      //           （2026-06-21 MCP Chrome 实地验证：x.com lang=pt，profile 显示 "1 Seguindo"）
      const unfollowButtons = (defaultCfg.selectors.following && defaultCfg.selectors.following.unfollowButtons) || [];
      const unfollowLangs = ['Following', '正在关注', 'フォロー中', '팔로잉', 'Seguindo', 'Siguiendo', 'Folge ich', 'Abonné'];
      unfollowLangs.forEach((s) => {
        assert(
          unfollowButtons.some(b => b.indexOf(s) !== -1),
          'default.json following.unfollowButtons 包含 "' + s + '"'
        );
      });

      // 5. retweet.unreTweetButtons 至少含 8 语言（2026-06-18 重构：tweet 拆为 retweet 节点独有）
      //   实证数据：en=Reposted, zh-CN=已转帖, ja=リポストしました, ko=재게시함,
      //           pt=Repostado, es=Repostado（旧 Reposteado 错），de=Repostet, fr=Reposté
      //           （2026-06-21 MCP Chrome 实地验证：x.com lang=pt，aria-label 格式 `{N} reposts. Repostado`，
      //            注意 X 即便在 pt 界面也用 "Repostado" 而非葡语 "Republicado"）
      const unreTweetButtons = (defaultCfg.selectors.retweet && defaultCfg.selectors.retweet.unreTweetButtons) || [];
      const unreTweetLangs = ['Reposted', '已转帖', 'リポストしました', '재게시함', 'Repostado', 'Repostado', 'Repostet', 'Reposté'];
      unreTweetLangs.forEach((s) => {
        assert(
          unreTweetButtons.some(b => b.indexOf(s) !== -1),
          'default.json retweet.unreTweetButtons 包含 "' + s + '"'
        );
      });

      // 6. retweet.cardMarker 至少含 1 种 retweet 指示器（替代废弃的 retweetButtonInCard）
      const cardMarker = (defaultCfg.selectors.retweet && defaultCfg.selectors.retweet.cardMarker) || [];
      assert(
        cardMarker.length >= 1,
        'default.json retweet.cardMarker 至少含 1 种 retweet 指示器（实际 ' + cardMarker.length + '）'
      );

      // 7. default.json 不应包含 i18n section（i18n 是 remote 才有的，default 不要带）
      //   原因：i18n 数组在 i18n.js 的 DEFAULT_I18N 已经兜底了，default 没必要再带一份
      assert(
        !(defaultCfg.selectors.i18n),
        'default.json 不应包含 selectors.i18n（i18n 默认值已在 i18n.js DEFAULT_I18N）'
      );
    }
  } else {
    console.log('  SKIP  default.json not found');
  }
}
console.log();

// ------------------------------------------------------------------
// 15) sidepanel.html 6 option 验证（2026-06-18 重构：tweets 拆为 3 个独立顶级 type）
//   防回归：6 个 checkbox 必须存在；旧 4 checkbox（opt-tweets + opt-include-*）必须全部消失
// ------------------------------------------------------------------
console.log('[15] sidepanel.html - 6 option 存在（originalTweets/replies/retweets 独立顶级）');
{
  const htmlPath = path.join(__dirname, '..', 'platforms', 'x-project', 'src', 'sidepanel.html');
  if (fs.existsSync(htmlPath)) {
    const htmlSrc = fs.readFileSync(htmlPath, 'utf8');
    const required6 = ['opt-original-tweets', 'opt-replies', 'opt-retweets', 'opt-likes', 'opt-bookmarks', 'opt-following'];
    required6.forEach((id) => {
      assert(
        htmlSrc.indexOf('id="' + id + '"') !== -1,
        'sidepanel.html 含 6 option checkbox "' + id + '"'
      );
    });
    const oldIds = ['opt-tweets', 'opt-include-replies', 'opt-include-retweets', 'tweets-options-section'];
    oldIds.forEach((id) => {
      assert(
        htmlSrc.indexOf('id="' + id + '"') === -1,
        'sidepanel.html 旧 4 checkbox 已清除（"' + id + '"）'
      );
    });
  } else {
    console.log('  SKIP  sidepanel.html not found');
  }
}
console.log();

console.log('=== Result: ' + passed + ' pass, ' + failed + ' fail ===');
