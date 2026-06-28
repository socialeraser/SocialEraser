# Changelog

All notable changes to SocialEraser are documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.0.1] — 2026-06-28

### Added
- Top feedback button (✉️) in side panel header — opens default mail client to `support@socialeraser.app` with pre-filled subject `[X Eraser Feedback]`
- Non-modal completion summary card: shows item count, type count, duration, and a support CTA; dismissible via `×`; only shown when at least one item was cleaned
- Generic `data-i18n-title` attribute support in `applyI18n()` for localizable tooltips
- Footer Support link upgraded to brand color (`#f59e0b` / 12px) across all marketing pages
- `success.html` (post-payment landing) restored to full footer structure
- `ROADMAP.md` and `CHANGELOG.md` created; footer links across all 14 marketing pages unified to the full 4-column layout (Brand / Platforms / Product / Company)
- **End-to-end real-device regression passed** for Original Tweets / Replies / Retweets / Likes / Bookmarks on 2026-06-28 (Following already passed in v1.0.0); only Messages / DMs remain unsupported due to X's `event.isTrusted` check
- **Creem production checkout links live** — 5 `https://www.creem.io/payment/prod_*` URLs wired up in `support.html` for the 5 tiers ($1 / $3 / $5 / $10 / Custom); the `#TODO-CREEM-LINK-*` placeholders are no longer present

### Changed
- Renamed local + remote config file from `remote-example.json` to `x-remote-example.json` (platform-prefix consistency; aligned with TikTok). CDN URL `https://storage.googleapis.com/social-tool-bucket/x-remote-example.json` updated; `CONFIG_URL` in `chrome-source/background.js` + `edge-source/background.js` updated; all 6 verify scripts + 3 docs updated. Old `remote-example.json` removed from CDN.

## [1.1.0] — 2026-06-XX

### Added
- 5-tier tip model: $1 Coffee / $3 Pizza (Most Popular) / $5 Lunch / $10 Generous / Custom, via Creem Static Payment Links
- `support.html` landing page (8 languages) with mobile horizontal-scrolling tip cards
- `success.html` post-payment landing (receipt explanation, "back to home" + "get started" actions)
- Android shell (Capacitor 2.5) — project layout, gradle config, web build pipeline
- iOS scaffold placeholder (Capacitor 2.5) — `npx cap add ios` not yet run
- Footer `/support.html` link injected across all 12 marketing pages
- `verify-tip-model.js` regression suite locks the tip-only model invariant
- `verify-i18n-completeness.js` checks all keys × 8 languages

## [1.0.0] — 2026-04-XX

### Added
- Bulk cleanup for X (Twitter):
  - Original tweets
  - Retweets
  - Replies
  - Likes
  - Bookmarks
  - Following
- Date-keyword filtering (e.g. `2024-01..2024-06` and `crypto`)
- Remote selector hot-reload (GitHub CDN) — survive X layout changes without store update
- 5,000 actions/day safety cap
- Pause / Stop / Resume controls
- Side panel UI (Chrome MV3, `chrome.sidePanel` API)
- 8 languages: English / 日本語 / Deutsch / Português / Français / 한국어 / 简体中文 / Español
- Sticky state machine (login + X-site detection) — no polling
- Trust badge footer: "100% Local Processing" with 5 reassurance links
- Field-level config merge from remote CDN
- `verify-sidepanel-bindings.js` (1:1:1 rule enforcement)
- 14 static regression scripts guarding the cleanup core, i18n, footer, and tip model invariants

### Known limitations
- Messages / DMs not supported — X uses `event.isTrusted` to block all JS-dispatched events; would require `chrome.debugger` permission (deferred)
- Mobile not yet released — Android shell ready, iOS pending

## [0.9.0] — 2026-03-XX — Closed beta

### Added
- Initial 4-type cleanup (tweets / likes / bookmarks / following) on internal X test accounts
- Progress bar + log feed
- Date filter (single-month window)
- English + Chinese (Simplified) only

## [0.1.0] — 2026-01-XX — Internal prototype

- Standalone content script + side panel
- Manual DOM-driven click loop for likes
- No safety cap, no pause, no logging
