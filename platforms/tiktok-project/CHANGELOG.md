# TikTok Eraser Changelog

All notable changes to **TikTok Eraser** (SocialEraser for TikTok) are documented in this file.
For the umbrella index across all platforms, see [SocialEraser CHANGELOG](../../CHANGELOG.md).
For the X Eraser format reference, see [X Eraser CHANGELOG](../x-project/CHANGELOG.md).

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
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
