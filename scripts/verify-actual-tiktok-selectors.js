#!/usr/bin/env node
// verify-actual-tiktok-selectors.js
// TikTok 清理引擎 selector / namespace / 5 type 完整性回归检查
//
// 锁定（基于 .trae/documents/tiktok-extension-requirements-and-plan.md §5.3 + §6.1）：
//   1. tiktok-automation.js 含 5 个 process 方法（videos/reposts/likes/favorites/following）
//   2. tiktok-automation.js 含 parseViewCount（K/M/B 后缀，TikTok 特有）
//   3. tiktok-automation.js 暴露 window.TikTokInjector 命名空间
//   4. tiktok-automation.js 不引用 x-project 旧 type 名（tweet/retweet/bookmark/reply）
//   5. content.js 暴露 __TikTokEraserContentInjected 防重入 flag
//   6. content.js 监听 4 种 page type（videos/likes/favorites/following）
//   7. chrome-source/manifest.json 含 3 类 host_permissions
//   8. PNG 图标 16/48/128 存在 + > 0 字节
//   9. sidepanel.js 含 TYPE_ID_MAP 5 项
//  10. content.js 用 'tiktokeraser-logger' port name（vs x 的 'xeraser-logger'）
//  11. config file 含 TikTok 特有 selector 块（video/like/favorite/following/repost）
//
// 任一断言失败 → 退 1；CI 即挂。

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TIKTOK = path.join(ROOT, 'platforms', 'tiktok-project');
const AUTOMATION = path.join(TIKTOK, 'scripts', 'tiktok-automation.js');
const CONTENT = path.join(TIKTOK, 'scripts', 'content.js');
const CHROME_MANIFEST = path.join(TIKTOK, 'chrome-source', 'manifest.json');
const EDGE_MANIFEST = path.join(TIKTOK, 'edge-source', 'manifest.json');
const DEFAULT_CFG = path.join(TIKTOK, 'src', 'config', 'default.json');
const SP_JS = path.join(TIKTOK, 'src', 'sidepanel.js');
const ICONS_DIR = path.join(TIKTOK, 'src', 'icons');

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

function readIfExists(p) {
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, 'utf8');
}

console.log('=== verify-actual-tiktok-selectors.js ===');
console.log('TikTok 5 type × DOM selector × namespace 完整性\n');

// ------------------------------------------------------------------
// 1) tiktok-automation.js: 5 个 process 方法
// ------------------------------------------------------------------
console.log('[1] tiktok-automation.js - 5 个 process 方法');
{
  if (fs.existsSync(AUTOMATION)) {
    const src = fs.readFileSync(AUTOMATION, 'utf8');
    const requiredMethods = [
      'processVideos', 'processReposts', 'processLikes',
      'processFavorites', 'processFollowing'
    ];
    requiredMethods.forEach((m) => {
      assert(
        new RegExp('async\\s+' + m + '\\s*\\(').test(src) ||
        new RegExp(m + '\\s*\\(').test(src),
        'tiktok-automation.js 含 ' + m + ' 方法'
      );
    });
  } else {
    console.log('  SKIP  tiktok-automation.js not found');
  }
}
console.log();

// ------------------------------------------------------------------
// 2) tiktok-automation.js: parseViewCount helper（TikTok 特有 K/M/B 解析）
// ------------------------------------------------------------------
console.log('[2] tiktok-automation.js - parseViewCount helper（K/M/B 后缀）');
{
  if (fs.existsSync(AUTOMATION)) {
    const src = fs.readFileSync(AUTOMATION, 'utf8');
    assert(
      /parseViewCount[\s\S]{0,2000}[KMB]/i.test(src),
      'tiktok-automation.js parseViewCount 内部含 K/M/B 后缀解析'
    );
    assert(
      /parseViewCount[\s\S]{0,2000}1000000/.test(src),
      'tiktok-automation.js parseViewCount 含 1000000（M 后缀数值）'
    );
  } else {
    console.log('  SKIP  tiktok-automation.js not found');
  }
}
console.log();

// ------------------------------------------------------------------
// 3) tiktok-automation.js: window.TikTokInjector 命名空间
// ------------------------------------------------------------------
console.log('[3] tiktok-automation.js - window.TikTokInjector 命名空间');
{
  if (fs.existsSync(AUTOMATION)) {
    const src = fs.readFileSync(AUTOMATION, 'utf8');
    assert(
      /window\.TikTokInjector\s*=/.test(src),
      'tiktok-automation.js 暴露 window.TikTokInjector'
    );
    assert(
      !/window\.XEraserInjector\s*=/.test(src),
      'tiktok-automation.js 不暴露 window.XEraserInjector（避免与 x-project 冲突）'
    );
  } else {
    console.log('  SKIP  tiktok-automation.js not found');
  }
}
console.log();

// ------------------------------------------------------------------
// 4) tiktok-automation.js: 不引用 x-project 旧 type
// ------------------------------------------------------------------
console.log('[4] tiktok-automation.js - 不引用 x-project 旧 type');
{
  if (fs.existsSync(AUTOMATION)) {
    const src = fs.readFileSync(AUTOMATION, 'utf8');
    // 这些是 x-project 用的 type 名（区分度 = 防止 x 代码混入 tiktok）
    const forbiddenTypes = [
      { kw: "'tweets'", label: "'tweets' 旧 type" },
      { kw: "'tweet'", label: "'tweet' 旧 type" },
      { kw: "'retweets'", label: "'retweets' 旧 type（TikTok 不用 retweet）" },
      { kw: "'retweet'", label: "'retweet' 旧 type" },
      { kw: "'bookmarks'", label: "'bookmarks' 旧 type" },
      { kw: "'bookmark'", label: "'bookmark' 旧 type" },
      { kw: "'replies'", label: "'replies' 旧 type（TikTok 不清理回复）" },
      { kw: "'reply'", label: "'reply' 旧 type" },
      { kw: "processOriginalTweets", label: "processOriginalTweets (x 旧方法名)" },
      { kw: "processBookmarks", label: "processBookmarks (x 旧方法名)" },
      { kw: "processReplies", label: "processReplies (x 旧方法名)" },
    ];
    forbiddenTypes.forEach((it) => {
      assert(
        src.indexOf(it.kw) === -1,
        'tiktok-automation.js 不含 ' + it.label
      );
    });
  } else {
    console.log('  SKIP  tiktok-automation.js not found');
  }
}
console.log();

// ------------------------------------------------------------------
// 5) content.js: 防重入 flag __TikTokEraserContentInjected
// ------------------------------------------------------------------
console.log('[5] content.js - 防重入 flag __TikTokEraserContentInjected');
{
  if (fs.existsSync(CONTENT)) {
    const src = fs.readFileSync(CONTENT, 'utf8');
    assert(
      /__TikTokEraserContentInjected/.test(src),
      'content.js 含 __TikTokEraserContentInjected 防重入 flag'
    );
    assert(
      !/__SocialEraserContentInjected/.test(src),
      'content.js 不应使用 x-project 的 __SocialEraserContentInjected'
    );
  } else {
    console.log('  SKIP  content.js not found');
  }
}
console.log();

// ------------------------------------------------------------------
// 6) content.js: 4 种 page type 检测
// ------------------------------------------------------------------
console.log('[6] content.js - 4 种 page type 检测');
{
  if (fs.existsSync(CONTENT)) {
    const src = fs.readFileSync(CONTENT, 'utf8');
    const pageTypes = ['videos', 'likes', 'favorites', 'following'];
    pageTypes.forEach((pt) => {
      assert(
        src.indexOf("'" + pt + "'") !== -1 || src.indexOf('"' + pt + '"') !== -1,
        'content.js 监听 page type: ' + pt
      );
    });
  } else {
    console.log('  SKIP  content.js not found');
  }
}
console.log();

// ------------------------------------------------------------------
// 7) chrome-source/manifest.json: 3 类 host_permissions
// ------------------------------------------------------------------
console.log('[7] manifest.json - host_permissions 完整性');
{
  const chromeManifest = readIfExists(CHROME_MANIFEST);
  const edgeManifest = readIfExists(EDGE_MANIFEST);
  for (const [label, src] of [['chrome-source', chromeManifest], ['edge-source', edgeManifest]]) {
    if (!src) { console.log('  SKIP  ' + label + ' not found'); continue; }
    let m = null;
    try { m = JSON.parse(src); } catch (e) { console.log('  FAIL  ' + label + ' JSON parse error'); failed++; continue; }
    const hostPerms = (m.host_permissions || []);
    const required = ['*://tiktok.com/*', '*://www.tiktok.com/*', 'https://storage.googleapis.com/*'];
    required.forEach((p) => {
      assert(
        hostPerms.indexOf(p) !== -1,
        label + ' host_permissions 含 ' + p
      );
    });
    // 边 store 必须有 update_url
    if (label === 'edge-source') {
      assert(
        typeof m.update_url === 'string' && m.update_url.length > 0,
        'edge-source manifest 含 update_url（Edge Web Store 审核要求）'
      );
    }
  }
}
console.log();

// ------------------------------------------------------------------
// 8) PNG 图标: 16/48/128 存在 + > 0 字节
// ------------------------------------------------------------------
console.log('[8] PNG 图标 - 16/48/128 存在');
{
  for (const size of [16, 48, 128]) {
    const p = path.join(ICONS_DIR, 'icon' + size + '.png');
    if (!fs.existsSync(p)) {
      console.log('  FAIL  icon' + size + '.png 不存在');
      failed++;
      continue;
    }
    const stat = fs.statSync(p);
    assert(stat.size > 0, 'icon' + size + '.png 大小 > 0 (实际 ' + stat.size + ' bytes)');
  }
}
console.log();

// ------------------------------------------------------------------
// 9) sidepanel.js: TYPE_ID_MAP 5 项
// ------------------------------------------------------------------
console.log('[9] sidepanel.js - TYPE_ID_MAP 5 项');
{
  if (fs.existsSync(SP_JS)) {
    const src = fs.readFileSync(SP_JS, 'utf8');
    const required = ['videos', 'reposts', 'likes', 'favorites', 'following'];
    required.forEach((k) => {
      assert(
        new RegExp("['\"]" + k + "['\"]\\s*:").test(src),
        'sidepanel.js TYPE_ID_MAP 含 ' + k
      );
    });
  } else {
    console.log('  SKIP  sidepanel.js not found');
  }
}
console.log();

// ------------------------------------------------------------------
// 10) content.js: port name 用 'tiktokeraser-logger'（与 x 的 'xeraser-logger' 区分）
// ------------------------------------------------------------------
console.log('[10] content.js - port name 用 tiktokeraser-logger');
{
  if (fs.existsSync(CONTENT)) {
    const src = fs.readFileSync(CONTENT, 'utf8');
    assert(
      /['"]tiktokeraser-logger['"]/.test(src),
      'content.js port name 用 tiktokeraser-logger'
    );
    assert(
      !/['"]xeraser-logger['"]/.test(src),
      'content.js 不应用 xeraser-logger（避免与 x-project port 冲突）'
    );
  } else {
    console.log('  SKIP  content.js not found');
  }
}
console.log();

// ------------------------------------------------------------------
// 11) default.json: TikTok 特有 selector 块
// ------------------------------------------------------------------
console.log('[11] default.json - TikTok 特有 selector 块');
{
  if (fs.existsSync(DEFAULT_CFG)) {
    let cfg = null;
    try { cfg = JSON.parse(fs.readFileSync(DEFAULT_CFG, 'utf8')); } catch (e) {
      console.log('  FAIL  default.json JSON parse error: ' + e.message);
      failed++;
    }
    if (cfg && cfg.selectors) {
      // TikTok config 实际有 5 个 type 块 + 1 个 common 块
      // 注意：videos 不是独立块，video 相关 selector 在 common 下（articleContainers / videoMoreButtons / viewCount）
      const required = ['repost', 'like', 'favorite', 'following', 'common'];
      required.forEach((b) => {
        assert(
          cfg.selectors[b] && typeof cfg.selectors[b] === 'object',
          'default.json 含 selectors.' + b + ' 块'
        );
      });
      // common.videoMoreButtons 必含（video 清理的 "···" 按钮 selector，TikTok 特有）
      const videoMoreButtons = (cfg.selectors.common && cfg.selectors.common.videoMoreButtons) || [];
      assert(
        Array.isArray(videoMoreButtons) && videoMoreButtons.length >= 1,
        'default.json common.videoMoreButtons 数组非空（实际 ' + videoMoreButtons.length + '）'
      );
      // common.viewCount 必含（TikTok 特有 K/M/B 解析）
      const viewCount = (cfg.selectors.common && cfg.selectors.common.viewCount) || [];
      assert(
        Array.isArray(viewCount) && viewCount.length >= 1,
        'default.json common.viewCount 数组非空（实际 ' + viewCount.length + '）'
      );
      // common.articleContainers 必含（所有 type 通用）
      const articleContainers = (cfg.selectors.common && cfg.selectors.common.articleContainers) || [];
      assert(
        Array.isArray(articleContainers) && articleContainers.length >= 1,
        'default.json common.articleContainers 数组非空（实际 ' + articleContainers.length + '）'
      );
      // tiktokWebsite.patterns 必含 tiktok.com + www.tiktok.com
      const patterns = (cfg.selectors.tiktokWebsite && cfg.selectors.tiktokWebsite.patterns) || [];
      assert(
        patterns.indexOf('tiktok.com') !== -1,
        'default.json tiktokWebsite.patterns 含 tiktok.com'
      );
      assert(
        patterns.indexOf('www.tiktok.com') !== -1,
        'default.json tiktokWebsite.patterns 含 www.tiktok.com'
      );
    }
  } else {
    console.log('  SKIP  default.json not found');
  }
}
console.log();

// ------------------------------------------------------------------
// 12) 跨平台 storage 隔离：sidepanel.js 用 tiktokDailyUsage
// ------------------------------------------------------------------
console.log('[12] sidepanel.js - storage key 隔离');
{
  if (fs.existsSync(SP_JS)) {
    const src = fs.readFileSync(SP_JS, 'utf8');
    assert(
      /chrome\.storage\.local\.get\(\s*\[\s*['"]tiktokDailyUsage['"]/.test(src),
      'sidepanel.js 读 tiktokDailyUsage（不是裸 dailyUsage）'
    );
    assert(
      !/chrome\.storage\.local\.get\(\s*\[\s*['"]dailyUsage['"]/.test(src),
      'sidepanel.js 不应用裸 dailyUsage key（与 x-project 隔离）'
    );
  } else {
    console.log('  SKIP  sidepanel.js not found');
  }
}
console.log();

// ------------------------------------------------------------------
// 13) manifest version 3 + sidePanel 入口
// ------------------------------------------------------------------
console.log('[13] manifest.json - MV3 + sidePanel 入口');
{
  const chromeManifest = readIfExists(CHROME_MANIFEST);
  if (chromeManifest) {
    let m = null;
    try { m = JSON.parse(chromeManifest); } catch (e) {}
    if (m) {
      assert(m.manifest_version === 3, 'chrome-source manifest_version = 3');
      assert(
        m.side_panel && m.side_panel.default_path === 'sidepanel.html',
        'chrome-source side_panel.default_path = "sidepanel.html"'
      );
    }
  }
}
console.log();

console.log('=== Result: ' + passed + ' pass, ' + failed + ' fail ===');
process.exit(failed > 0 ? 1 : 0);
