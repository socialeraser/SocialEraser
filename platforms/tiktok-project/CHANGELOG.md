# TikTok Eraser Changelog

All notable changes to **TikTok Eraser** (SocialEraser for TikTok) are documented in this file.
For the umbrella index across all platforms, see [SocialEraser CHANGELOG](../../CHANGELOG.md).
For the X Eraser format reference, see [X Eraser CHANGELOG](../x-project/CHANGELOG.md).

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

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
