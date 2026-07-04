# TikTok Eraser Changelog

All notable changes to **TikTok Eraser** (SocialEraser for TikTok) are documented in this file.
For the umbrella index across all platforms, see [SocialEraser CHANGELOG](../../CHANGELOG.md).
For the X Eraser format reference, see [X Eraser CHANGELOG](../x-project/CHANGELOG.md).

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning follows [Semantic Versioning](https://semver.org/).

## [Unreleased] - 2026-07-04

### Fixed
- **Multi-type 流程卡死 bug**：选中 ≥ 2 个 Type 时，处理完第 1 个 Type 后停在了最后一个视频播放那，没有开始第 2 个 Type。根因：`__TikTokEraserForcePageLoad` 用 `chrome.runtime.sendMessage({target:'forceNavigation'})` 让 background 调 `chrome.tabs.update` 触发跳转，但 MV3 service worker 必须被事件唤醒才能处理消息，IPC + 唤醒延迟几秒，期间 content script 继续跑、sidepanel 已经 addLog "Type 1 of 3 done, loading next..."，但 tab 实际上没跳走 → 用户看到"停在了最后一个视频播放那"。修法：`__TikTokEraserForcePageLoad` 内部**优先 `window.location.href = url`**（同步触发 page 销毁，不依赖 IPC、不依赖 service worker 是否在线），`chrome.tabs.update` 路径保留为兜底。MCP 实证：`/@ping.xiang1` 页设 `window.location.href = 'https://www.tiktok.com/'` 后 page 真的销毁，location.pathname 真的变成 `/`。TikTok SPA 路由只拦截 `pushState`/`replaceState`，不拦截 `window.location.href =` 触发的整页加载。
- **Following 空状态假成功 bug**：用户 0 关注时，选 Following 类型会报"Unfollowed #1 (no confirm dialog)"。根因：`unfollowButtons` selector `button[aria-label*='Following']` 在英文 UI 下会误匹配**侧边栏 Following 导航按钮**本身（aria-label='Following'），点击无 confirm dialog → `processedCount++` → 假成功。修法：①所有 unfollowButtons selector 限定到 `[data-e2e='user-following-item']` 容器内（深度防御）②`processFollowing` 在 `waitForContentStable` 之后加 0 following item 早退检查 + 触发 `onTypeComplete`（让多 type 流程继续）。MCP 实证 2026-07-04 @ping.xiang1（0 following）: user-following-item=0, card-followbutton=20 (suggested), button[aria-label*='Following']=1 (sidebar nav)。
- **翻页守门**：4 个 processXxx（Reposts / Likes / Favorites / Following）都必须有 scrollToBottom 翻页调用，防止"删完第 1 页就停"。

### Added
- 新增 verify 脚本 `scripts/verify-tiktok-multi-type-fix.js`（守住 force page load 同步路径）。
- 新增 verify 脚本 `scripts/verify-tiktok-daily-limit-hint.js`（守住 8 语言 dailyLimitReachedHint 含 tip/support developer/come back tomorrow 关键词）。
- 新增 verify 脚本 `scripts/verify-extensions-sync.js`（守住 platforms/* ↔ extensions/* 字节级一致，防 sync 漏掉）。
- 新增 CHANGELOG 日期戳（`[Unreleased] - YYYY-MM-DD`）。

## [Unreleased] - 2026-07-03

### Fixed
- **Favorites 流程重写**：原"1 步点已收藏图标"在 Profile Favorites tab 上的 card 不可点，改为镜像 Likes 的 2 步流程（Favorites tab 卡片 anchor click → video 详情页 → 点 `span[data-e2e="favorite-icon"]` 取消）。添加 `_loadDeletedFavoritesUrls` / `_saveDeletedFavoritesUrls` 持久化跨页 resume。实证依据：2026-07-02 MCP 浏览器对 ping.xiang1 For You 页读取 DOM，实际 `data-e2e="favorite-icon"`（不是之前猜的 `browse-favorite-icon`），parent button 本身无 data-e2e。
- **Edge `background.js` 同步**：补上 7/1 漏掉的 `readDeletedLikesUrls` / `writeDeletedLikesUrls` handler（之前 Edge extension 会因为 handler 缺失导致 likes 流程跨页 resume 失败），同时加上 `readDeletedFavoritesUrls` / `writeDeletedFavoritesUrls`。

### Added
- 新增 verify 脚本 `scripts/verify-tiktok-favorites-flow.js`（46 项断言），守住 Favorites 新流程的 selector / 流程顺序 / session 持久化 / 8 语言 i18n。
- i18n engine (`scripts/i18n.js`, 1450 lines) — 8 languages, `window.TikTokEraseri18n` namespace, `tiktokPreferredLang` storage isolation, top-of-file comment documenting the `zh-CN` (hyphen) ↔ `zh_CN` (underscore) `langAliases` mapping that bridges the i18n.js canonical form with Chrome MV3's required `_locales/zh_CN/` directory name
- side panel logic (`src/sidepanel.js`, 1326 lines) — 5-type checkboxes, view count filter, backup tip linkage, daily limit, rating prompt
- 8 locale manifest files (`src/_locales/<lang>/messages.json`) — ext_name + ext_description per language
- bundled + remote config (`src/config/{default.json, tiktok-remote-example.json}`) — 239 lines each, byte-level identical
- 3 PNG icons (`src/icons/icon{16,48,128}.png`) — RGB mode, no alpha channel (dark-theme safe)
- 3 TikTok-specific verify scripts (`scripts/verify-tiktok-{i18n,actual-tiktok-selectors,config-sync}.js`)
- 3-end code sharing build (`npm run sync`) — outputs `platforms/tiktok-project/www/`, `extensions/chrome-tiktok/`, `extensions/edge-tiktok/`
- top-level `ROADMAP.md` — added an explicit "TikTok Eraser — explicitly deferred to V2+" subsection listing Comments / Watch history / Drafts / Photos / Albums with per-item rationale, so users do not infer a commitment from their absence in V1

### Changed
- `scripts/run-verify.js` — registers 3 new TikTok verify scripts (15 → 18 total)
- `scripts/check-schema.js` — already multi-platform (no change)
- `scripts/verify-sidepanel-bindings.js` — already multi-platform (no change)
- `scripts/verify-syntax.js` — already multi-platform (no change)
- marketing website (`packages/marketing-website/platforms/tiktok/index.html`) — 7-type → 5-type alignment (removed Watch History + Comments cards)
- top-level `README.md` and `ROADMAP.md` — TikTok status updated from "planned" to "MVP ready, pending CWS submission"
- `src/icons/icon{16,48,128}.png` — flattened alpha channel to `#0F0F0F` (TikTok brand dark) and re-saved as RGB to eliminate the dark-theme black-border artifact (4 corners previously `RGBA(0,0,0,0)`; now solid background, lesson-learned rule enforced)
- `src/sidepanel.html` `.btn-danger` (Stop) — switched from brand gradient to pure red `#ef4444` to restore destructive-action visual signal that was lost when Pause/Stop were unified to the Start gradient. Pause (`.btn-warning`) keeps the brand gradient to signal "safe to resume"; Stop aligns with the x-project btn-danger convention
- marketing website Reposts card copy — replaced misleading "keep the original creator's video intact" claim (which contradicts actual behavior: deleting a repost = deleting that video) with the accurate "removing a repost also removes that video from your profile" wording
- marketing website Following card copy — removed unimplemented sub-options ("by list, by non-mutual, or by activity") that have no UI controls; copy now describes the actual bulk-unfollow behavior + Pause/Stop continuation flow

### Planned for v0.1.0 (MVP)
- Bulk cleanup for TikTok (Web extension, MV3):
  - Your Videos (with `data-e2e` selector fallback)
  - Reposts (warning: TikTok Web does not expose independent repost undo; this deletes the original reposted video)
  - Likes
  - Favorites
  - Following
- Date / keyword / view-count filters
- 5,000 actions/day safety cap (inherited from X Eraser)
- Pause / Stop / Resume controls
- Side panel UI (Chrome MV3, `chrome.sidePanel` API)
- 8 languages (en / zh-CN / ja / ko / pt / es / de / fr) — same set as X Eraser
- 3-end code sharing: `src/` → `www/` + `extensions/chrome-tiktok/` + `extensions/edge-tiktok/`
- `npm run sync` will auto-discover the new platform and wire up the build pipeline

### Already landed (project bootstrap)
- `chrome-source/manifest.json` + `chrome-source/background.js` (Manifest V3, host permissions for `*://tiktok.com/*`, `*://www.tiktok.com/*`)
- `edge-source/manifest.json` + `edge-source/background.js` (with `update_url` for Microsoft Store)
- `scripts/tiktok-automation.js` (1323 lines: `TikTokInjector` class, 5 `process*` methods, fallback selectors via `data-e2e` + semantic anchors)
- `scripts/content.js` (337 lines: sticky login-state cache, page-type detection, message routing, remote-config initialization)
- `src/sidepanel.html` (648 lines: 5-type options with backup-tip warnings for Videos / Reposts, filter section, progress / log / summary cards, brand color `#FE2C55` / `#25F4EE`)
- `capacitor.config.json` (Capacitor 2.5 wiring for future Android / iOS sync)
- See [`../../.trae/documents/tiktok-extension-requirements-and-plan.md`](../../.trae/documents/tiktok-extension-requirements-and-plan.md) for the full v0.1.0 scope, 12-chapter engineer-oriented requirements analysis, and phase 4-8 task list
