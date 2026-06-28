# SocialEraser

Cross-platform X/Twitter batch cleanup tool.

## Current Stage: Chrome Extension (In Development)

### Completed Features

| Feature | Status | Description |
|---|---|---|
| Persistent side panel | ✅ | Chrome Side Panel, never disappears |
| Detect X website | ✅ | Auto-detects x.com / twitter.com |
| Detect login status | ✅ | Multi-language support |
| Batch delete options | ✅ | Tweets / likes / bookmarks / following (Messages not yet supported, see details below) |
| Date / keyword filter | ✅ | UI + logic both implemented |
| Real-time progress display | ✅ | Progress bar + log animation |
| Pause / Stop / Resume | ✅ | State machine control |
| 8 language support | ✅ | en / zh-CN / ja / ko / pt / es / de / fr |
| Remote config | ✅ | Supports remote selector updates |
| Refresh config button | ✅ | Manual refresh in top-right |
| Bottom trust statement | ✅ | Privacy commitment prominently displayed |
| DOM manipulation engine | ✅ | Robust deletion implementation |
| No-backend design | ✅ | Pure frontend, no server required |
| **Batch unfollow Following** | ✅ | Reuses processBookmarks pattern, cellInnerDiv rows + dedicated confirm selectors |
| **Multi-type parallel session** | ✅ | Shared total budget (no more per-type quota recomputation) |
| **No-progress timeout protection** | ✅ | Stops after 30s of no progress (prevents X revision infinite loops) |
| **i18n multi-context sync** | ✅ | storage.onChanged broadcasts language switch across contexts |
| **option-count state machine** | ✅ | pending (gray spinner) → processing (blue spinner) → done (number) |
| **status-card auto-collapse** | ✅ | Smoothly collapses after 1s when normal, immediately expands on error |
| **Login state detection resistant to SPA navigation** | ✅ | **Sticky state machine**: content.js maintains `cachedIsLoggedIn` cache, locks in after one positive detection, the only flip signal is `checkIsLoginPage()` (URL enters login page); selectors use stable sidebar elements (`/compose/post`, `/i/bookmarks`, `AppTabBar_*`) as fallback; removed sidebar 10s retry loop and silent polling (these two layers were the misjudgment source); added `scripts/verify-login-detection.js` with 37 asserts to prevent regression |
| **cleanup no longer blindly retries** | ✅ | Removed `runCleanupWithRetry` (which would unconditionally sleep 4s and re-run on 0 hits), which duplicated the responsibility of `waitForArticles(3000)`; cleanup body now runs only once. Previously, 0-likes users ran cleanup twice per page (totaling 4 times across likes+bookmarks, wasting 8s of 22s); added `scripts/verify-no-retry.js` with 14 asserts to prevent regression |
| **sidepanel element binding assertion** | ✅ | When adding new UI elements, force requirement to bind `els.xxx` in `afterLangLoaded()`, otherwise functions like `updateTweetsOptionsVisibility / getTweetsOptions` will **silently fail** (previously, the 4 new elements for tweets sub-options were missed in binding, sub-options never showed). Added `scripts/verify-sidepanel-bindings.js` with 6 asserts to scan all `els.<name>` references and compare with binding points |
| **dailyUsage race condition fix** | ✅ | Single-flight serial chain (`_dailyUsageChain`) serializes read-modify-write; `.catch` fallback doesn't poison the chain; callback triggered before resolve to guarantee post-write value |
| **Schema alignment (DEFAULT_SELECTORS)** | ✅ | `like.unlikeButtons` (4) + `bookmark.removeButtons` (6) aligned to `config/*.json`; added `scripts/check-schema.js` for automatic scanning to prevent regression |
| **setConfig field-level merge** | ✅ | When remote config has missing keys, no longer wholesale replaces DEFAULT, but merges field-by-field; deep shallow copy of array/object fields to prevent contamination; added `scripts/verify-setconfig.js` with 13 unit-test asserts |
| **Batch delete tweets (Tweets)** | ✅ | Engine `processTweets` + original tweet deletion + Retweet undo repost; includes reply toggle + Pinned detection skip; sidepanel sub-options let users choose "with/without replies" and "with/without retweets" |

### Currently Unsupported Features

| Feature | Status | Description |
|---|---|---|
| Batch delete Messages (DMs) | ❌ | X uses `event.isTrusted` to verify user input; JS events dispatched by content scripts (`dispatchEvent` / `mousedown`+`contextmenu` sequences, etc.) are all rejected by X. See "Why Messages is not supported" below |
| 5000/day free quota | ✅ | Per-day safety cap (prevents X rate-limit / account ban) — counter + tip modal implemented, see "Monetization" below |
| **End-to-end real-device regression** | ✅ | Original Tweets / Replies / Retweets / Likes / Bookmarks all passed real-account regression on 2026-06-28 (Following passed in v1.0.0); only Messages / DMs remain unsupported (see below) |
| Tip / donation (Creem) | ✅ | Support page live + 5 production Creem checkout links wired up (5 tiers: ☕ $1 / 🍕 $3 / 🍱 $5 / 💖 $10 / 🎁 custom); see [docs/business-model.md](docs/business-model.md) |
| Android App | 🔄 | Capacitor project ready, UI to be ported |

### To Be Developed

| Feature | Priority | Description |
|---|---|---|
| Subscription system Creem | P1 | Paid membership to unlock unlimited quota + speed boost |
| Android App | P2 | Capacitor reuses x-automation.js engine |
| iOS App | P2 | Capacitor reuses x-automation.js engine |
| Real data integration for option-count | P3 | Replace current "this session count" semantics, read from profile header |
| Advanced filter rules | P3 | Regex, domain whitelist, batch rule presets |

### Known Issues

| Issue | Priority | Description |
|---|---|---|
| Following confirm dialog selector depends on X's current UI | P2 | `[data-testid='confirmationSheetConfirm']` may break with X revisions, remote config can hot-fix |
| `unfollowUser` old config compatibility | P3 | Compatible with both `unfollowButton` (old string) and `unfollowButtons` (new array) schemas |

### Why Messages (DMs) Are Not Supported

X's Messages list page can **only trigger the Delete conversation menu via right-click (two-finger tap on Mac / right-click on Windows)**. After testing, X validates the `event.isTrusted` field when listening to `contextmenu` / `mousedown` events — only real user input (OS-level events) return `true`.

Chrome extension content script dispatches events using any of the following methods, **all of which fail** (`isTrusted=false`, ignored by X):

| Dispatch method | Result |
|---|---|
| `el.dispatchEvent(new MouseEvent('contextmenu', {...}))` | ✗ Failed |
| `mousedown` + `mouseup` + `contextmenu` sequence | ✗ Failed |
| `pointerdown` + `mousedown` + `mouseup` + `contextmenu` full PointerEvent sequence | ✗ Failed |
| CDP `Input.dispatchMouseEvent` (browser kernel-level) | ✓ Valid (but content script cannot call) |

**The only way to simulate native right-click** is to apply for `chrome.debugger` permission + use `chrome.debugger.sendCommand('Input.dispatchMouseEvent')` in background. This triggers Chrome's permission warning ("This extension can access all data on pages related to this extension"), which significantly impacts publishing and user trust.

**Other types (tweets/likes/bookmarks/following) are not affected** — they use regular `.click()` to trigger deletion; X does not validate `isTrusted` for click, content script can call `el.click()` directly.

**Future possible paths to re-implement Messages**:
1. Apply for `debugger` permission (affects publishing and user trust)
2. Delete directly via X GraphQL API (requires OAuth token, beyond chrome extension scope)
3. Wait for X to drop `isTrusted` validation (low probability event)

## Project Experience

Pitfall summary + design tradeoffs see [docs/lessons-learned.md](docs/lessons-learned.md), core 5 points:

1. **KISS > Over-engineering** — Don't write 50 lines for something that can be done in 5
2. **State changes go sticky, not poll** — Detect once and cache, the only flip signal = explicit user action
3. **State machine needs 3 states**: `null` (unconfirmed) / `true` / `false`
4. **Selectors are not trustworthy** — Must have semantic anchors (href / URL / ARIA), cannot be all `data-testid`
5. **Deleting code is improvement** — Fallback retry / silent polling / old API compat shims need regular review

Last six practical cases ([docs/lessons-learned.md](docs/lessons-learned.md)):
- Login state detection → sticky state machine (`scripts/verify-login-detection.js` 37 asserts)
- cleanup deduplication → removed `runCleanupWithRetry` (`scripts/verify-no-retry.js` 14 asserts)
- sidepanel element missing binding → added 4 lines of `getElementById` binding (`scripts/verify-sidepanel-bindings.js` 6 asserts)
- dailyUsage counter race → single-flight chain `_dailyUsageChain` (`scripts/verify-daily-usage-chain.js` 9 asserts)
- processTweets incremental design → dual-mode scanning + 8-language pinned detection (`check-schema.js` covers moreButtons array upgrade)
- setConfig field merge → manual `_mergeConfig` per-layer shallow merge (`scripts/verify-setconfig.js` 13 asserts)

## Quick Start

This is a **monorepo**. To load the Chrome / Edge extension, you first need to build the deployable folders from the source folders.

```bash
# 1. Install dependencies
npm install

# 2. Generate build output (extensions/chrome-x/, extensions/edge-x/, platforms/*/www/)
npm run sync

# 3. Load the built extension in your browser (see below)
```

### Chrome / Edge Extension

1. Run `npm run sync` to generate `extensions/chrome-x/` (and `extensions/edge-x/`)
2. Open `chrome://extensions/` (or `edge://extensions/`)
3. Enable "Developer mode"
4. Click "Load unpacked"
5. Select `extensions/chrome-x/` (Chrome) or `extensions/edge-x/` (Edge)
6. Open x.com and log in
7. Click the extension icon to open the side panel
8. Check the operations to perform, click "Start Cleanup"

> The `chrome-source/` and `edge-source/` folders contain only the Chrome / Edge MV3 shell (`manifest.json` + `background.js`). The build step (`npm run sync` → `scripts/sync-shared.js`) merges them with `src/` (Web UI) and `scripts/` (core automation) into the final `extensions/<browser>-x/` folders. **You load the merged folder, not the shell folder.**

### Android (Capacitor)

```bash
npm run sync          # generate www/ + cap copy
npm run android:open  # open Android Studio
# then run from Android Studio
```

### Marketing Website (Static)

The `packages/marketing-website/` folder is a static site served at [socialeraser.app](https://socialeraser.app). See `packages/marketing-website/README.md` for details.

## Verification Scripts

> **Why not jest?** This project's verify scripts are **grep source + `assert()` + `process.exit(0/1)`** pure static scans (not unit tests). Runs fast (no jsdom needed), zero dependencies, easy to write "anti-X-revision" type locks (see [docs/lessons-learned.md](docs/lessons-learned.md) section 10 "Asserts outlive comments"). Unified entry is `scripts/run-verify.js`, bound to `npm test`.

### Recommended: Unified Entry

```bash
npm test                          # Run all 13 verify + check-schema
npm run verify                    # Same as npm test
npm run verify:single -- tweets-bug-3     # Run single (auto-prefix verify- and .js suffix)
node scripts/run-verify.js --list         # List all available scripts
```

### Individual Run (Direct Script Also Works)

```bash
node scripts/check-schema.js       # 4 items: DEFAULT_SELECTORS / config/*.json field alignment (prevent remote hot-fix from losing fields)
node scripts/verify-setconfig.js   # 13 items: setConfig field-level merge unit tests (prevent remote missing keys from losing DEFAULT fields, prevent contamination)
node scripts/verify-i18n.js        # i18n 8 languages × 30 keys = 240 entries completeness
node scripts/verify-following.js   # Regression check (following flow, state machine, auto-hide)
node scripts/verify-login-detection.js  # 37 items: login state detection selector robustness + sticky state machine
node scripts/verify-no-retry.js          # 14 items: cleanup no longer blindly retries (prevent 0-likes users running twice per page)
node scripts/verify-sidepanel-bindings.js  # 2 items: sidepanel.js all els.xxx references ↔ getElementById binding 1:1 lock (prevent adding new elements and forgetting to bind; 6-type pre-refactor had 6 items)
node scripts/verify-daily-usage-chain.js  # 9 items: dailyUsage single-flight serial chain (prevent read-modify-write race + .catch chain poisoning + callback order)
node scripts/verify-actual-x-selectors.js  # 31 items: use real X page HTML to lock selector decisions (prevent selectors silently failing after X revision)
```

## Project Structure

```
SocialEraser/                                  # monorepo root
├── packages/
│   ├── marketing-website/                     # Static site (socialeraser.app, Cloudflare Pages)
│   │   ├── index.html                         # English landing
│   │   ├── zh/, ja/                           # Localized landing pages
│   │   ├── platforms/                         # 5 platform sub-pages (x, tiktok, youtube, instagram, facebook)
│   │   ├── about.html, faq, privacy, terms    # Static content pages
│   │   ├── assets/                            # CSS, JS, icons
│   │   └── package.json
│   ├── shared-core/                           # Cross-platform shared utilities (WIP)
│   └── shared-ui/                             # Cross-platform shared components (WIP)
├── platforms/
│   ├── x-project/                             # X (Twitter) Eraser — main project
│   │   ├── chrome-source/                     # Chrome MV3 shell: manifest.json + background.js
│   │   ├── edge-source/                       # Edge MV3 shell: manifest.json + background.js
│   │   ├── android/                           # Capacitor Android Studio project
│   │   ├── ios/                               # Capacitor iOS Xcode project (placeholder)
│   │   ├── scripts/                           # Core automation (loaded by content script)
│   │   │   ├── x-automation.js                # DOM manipulation engine (DEFAULT_SELECTORS)
│   │   │   ├── content.js                     # Content script entry
│   │   │   └── i18n.js                        # 8-language translation tables
│   │   ├── src/                               # Web UI bundle (loaded by side panel)
│   │   │   ├── sidepanel.html, sidepanel.js   # Side panel UI
│   │   │   ├── _locales/                      # 8 Chrome i18n message files
│   │   │   ├── config/                        # default.json + remote-example.json
│   │   │   └── icons/                         # Extension icons (16/48/128)
│   │   ├── capacitor.config.json
│   │   └── package.json
│   └── tiktok-project/                        # TikTok Eraser (planned)
├── scripts/                                   # Build + verification (Node.js)
│   ├── run-verify.js                          # Unified entry for `npm test`
│   ├── check-schema.js                        # DEFAULT_SELECTORS ↔ config/*.json alignment
│   ├── verify-*.js                            # 13 verify scripts
│   ├── deploy-website.sh                      # Cloudflare Pages deploy
│   └── sync-shared.js                         # Build: src/ + scripts/ + *-source/ → extensions/, www/
├── docs/
│   ├── lessons-learned.md                     # Project experience & pitfall summary
│   └── debug-history/                         # Per-bug debug writeups
├── LICENSE                                    # MIT
└── README.md                                  # This file
```

> **Build outputs (gitignored)**: `extensions/chrome-x/`, `extensions/edge-x/`, `platforms/*/www/`, `platforms/*/android/app/src/main/assets/public/`, `platforms/*/ios/App/public/`. All are generated by `npm run sync`.

## Remote Configuration

The config file supports hot update, just update the config file to adapt after X official revisions.

### Configuration Structure

```json
{
  "selectors": {
    "xWebsite": { "patterns": ["x.com", "twitter.com"] },
    "login": { "checkElements": {...}, "loggedInElements": [...] },
    "tweet": { "container": "...", "moreButton": "...", "deleteButton": "...", "confirmButton": "..." },
    "like": { "container": "...", "unlikeButtons": [...] },
    "bookmark": { "container": "...", "removeButtons": [...] },
    "following": { "container": "...", "unfollowButtons": [...], "confirmButton": "..." }
  }
}
```

> **Schema alignment constraint**: `DEFAULT_SELECTORS` in `platforms/x-project/scripts/x-automation.js` and `config/default.json` / `config/remote-example.json` in `platforms/x-project/src/config/` must remain completely consistent.
> When modifying any one place, must synchronously modify the other two places, and run `node scripts/check-schema.js` to verify.

### Deploying Configuration

1. Modify `remote-example.json` content
2. Upload to a publicly accessible URL (e.g., GCS, GitHub Gist)
3. Update `CONFIG_URL` in `platforms/x-project/chrome-source/background.js` (and `edge-source/background.js` if it diverges)

## Technical Features

### ⚠️ Hard Requirement: Multi-language Adaptation

**All user-facing text must use i18n, no language strings hard-coded in code is allowed.**

#### Rules

1. **New text** → First add the translation key in 8 languages in `platforms/x-project/scripts/i18n.js`, then call it in code via `t('key')`
2. **Modify text** → Synchronously update 8 language translations
3. **New UI elements** → Use `data-i18n="key"` or `data-i18n-placeholder="key"` attribute in HTML
4. **Forbidden** JS/HTML with `alert('English text')`, `addLog('Some English')` and other hard-coded strings
5. **Placeholders**: Dynamic content uses `{var}` format, e.g., `t('cleanupCompleted', {count: 10})`

> Note: The Chrome / Edge extension's display name and description (in `chrome-source/manifest.json` and `edge-source/manifest.json`) are localized separately via `platforms/x-project/src/_locales/<lang>/messages.json` (Chrome's native i18n system, not `scripts/i18n.js`).

#### Supported 8 Languages

The "Code" column shows the locale key used in `scripts/i18n.js` (i.e. what you pass to `t('xxx', 'zh-CN')`).

| Code | Language | Chrome `_locales/` folder |
|---|---|---|
| `en` | English | `_locales/en/` |
| `zh-CN` | 简体中文 | `_locales/zh_CN/` |
| `ja` | 日本語 | `_locales/ja/` |
| `ko` | 한국어 | `_locales/ko/` |
| `pt` | Português | `_locales/pt/` |
| `es` | Español | `_locales/es/` |
| `de` | Deutsch | `_locales/de/` |
| `fr` | Français | `_locales/fr/` |

#### Pre-commit Checklist

- [ ] New text added to 8 languages in i18n.js
- [ ] HTML elements use `data-i18n` attribute
- [ ] All addLog/alert/confirm in JS use `t()` function
- [ ] No hard-coded English strings
- [ ] Placeholders `{var}` defined in all 8 languages

#### Example

**Wrong**:
```javascript
alert('Please select at least one option');
addLog('Cleanup started', 'info');
```

**Right**:
```javascript
alert(t('noItemsSelected'));
addLog(t('startingCleanup'), 'info');
```

```html
<!-- Wrong -->
<button>Start Cleanup</button>

<!-- Right -->
<button data-i18n="startCleanup">Start Cleanup</button>
```

### Robustness Design

- **Selector fallback**: One selector failure automatically tries the next
- **Error tolerance**: Stops after max 10 errors, prevents infinite loops
- **Mark processed**: Prevents duplicate operations
- **Remote config**: Selectors updated via remote JSON

### No Backend

- All logic purely frontend
- Config stored in Chrome Storage or remote URL
- No server required

## Development Plan

### Phase 1: Chrome Extension Core ✅
- [x] Side panel UI
- [x] State detection (including login status real-time detection — 3s polling + statusUpdate broadcast)
- [x] Multi-language (8 languages + storage.onChanged cross-context sync)
- [x] DOM manipulation engine (including setConfig field-level merge + Schema alignment protection)
- [x] dailyUsage single-flight serial chain (prevent progress callback concurrent loss count)
- [x] Batch unfollow Following (end-to-end flow passed)
- [x] Batch delete Likes / Bookmarks (engine ready, end-to-end real-device testing)
- [x] Batch delete Messages (downgraded — X validates isTrusted, content script cannot simulate native right click)
- [x] Batch delete Tweets (3 sub-types `processOriginalTweets` / `processReplies` / `processRetweets` + `getOriginalTweetsPageURL` / `getRepliesPageURL` / `getRetweetsPageURL` + cross-page resume + 8-language selector all in place, end-to-end real-device regression testing)
- [x] 5000/day safety cap + tip modal (8 languages, see `scripts/verify-tip-model.js`)

### Phase 2: Chrome Extension Enhancement
- [ ] Date filter logic
- [x] Tip page (5 tiers: $1 / $3 / $5 / $10 / custom) + Creem integration (5 production `https://www.creem.io/payment/prod_*` links live in `support.html`)
- [ ] Tiered support recognition (stretch — public thank-you list, no feature gating)

### Phase 3: Mobile
- [ ] Android App (Capacitor)
- [ ] iOS App (Capacitor)
- [ ] Cross-platform code sharing

## Monetization

SocialEraser uses a **tip / donation model**, not subscriptions. Decision rationale and full plan: [docs/business-model.md](docs/business-model.md).

**Core principle**: All features are free forever. A tip is gratitude, never payment for features.

**Pieces in place**:
- 5000/day **safety cap** (prevents X rate-limit / account ban — not a paywall)
- 8-language tip modal triggered when cap is reached (see `scripts/verify-tip-model.js`)
- Marketing-site [support page](https://socialeraser.app/support.html) with 5 tiers (☕ $1 / 🍕 $3 / 🍱 $5 / 💖 $10 / 🎁 custom) + FAQ
- `success.html` for Creem post-checkout redirect
- Footer Support link in all 12 marketing pages
- Creem account created; 5 production checkout links live (`https://www.creem.io/payment/prod_*`) in `support.html` for the 5 tiers

**Future (deferred until reviews/ratings land)**: monthly + yearly subscriptions, but only as a *second* revenue stream — never replacing the free tier.

## License

MIT
