# SocialEraser Roadmap

Public-facing development plan. Times are estimates, not commitments. Updated as priorities shift.

## Now — Stability & Launch
- Chrome Web Store launch (X Eraser)
- Chrome Web Store launch (TikTok Eraser) — shipped 2026-07-07
- Edge add-on store launch
- Real-account end-to-end regression tests (tweets / likes / bookmarks / following)
- 5,000/day safety cap + tip model
- Remote selector hot-reload via GitHub-hosted config
- Top feedback channel (✉️ → mailto) + non-modal completion summary card
- **Mobile launch (Q4 2026) — see [docs/mobile-architecture.md](docs/mobile-architecture.md)**
  - iOS App Store submission (StoreKit 2, $9.99/month with 1-week free trial)
  - Google Play submission (Play Billing v6, same price/trial)
  - Cloudflare Worker backend for receipt validation
  - Marketing site pricing page + mobile subscription copy

## Two-Tier Business Model (effective 2026-07-09)

SocialEraser is now a **two-tier product**:

| Tier | Surface | Business model |
|---|---|---|
| **Web** | Chrome/Edge extensions (X + TikTok) | **Free, tip-supported** (Creem). No change. |
| **Mobile** | iOS + Android native apps (TikTok V1) | **Subscription, $9.99/month with 1-week free trial** (StoreKit / Play Billing). |

**Why the split**: Web extensions have zero platform fees, so tip-supported works. Mobile apps have 30% Apple/Google IAP cut + higher dev cost, requiring subscription. The web extension **remains free forever** — this is non-negotiable.

**What this is NOT**:
- Not a freemium tier inside mobile — mobile is either subscribed or locked (after trial ends).
- Not a data-collection grab — Worker stores only subscription receipts, no PII.
- Not a betrayal of the tip model — the tip model applies to Web. Mobile is a separate product surface.

See [`docs/mobile-architecture.md`](docs/mobile-architecture.md) for full design.

## Next (Q4 2026 – Q1 2027) — Mobile & Multi-platform
- **Mobile tier v1 launch** (Q4 2026) — iOS + Android with $9.99/month subscription, 1-week free trial. See [docs/mobile-architecture.md](docs/mobile-architecture.md) for the full design.
- **Mobile tier v2** (Q1 2027) — Annual subscription tier, automatic subscription webhook sync (Apple App Store Server Notifications V2 + Google RTDN), CAPTCHA detection + native intervention UI
- YouTube: unlike videos, un-save, clear watch history
- Instagram: unlike, unfollow, clear saved posts
- Restore reviews section once ≥6 real reviews collected (Chrome Web Store, GitHub stars, Product Hunt)

### TikTok Eraser — explicitly deferred to V2+ (NOT on roadmap until real demand)
The following TikTok cleanup types are intentionally **not** in V1 and have no timeline. They are listed here only to set user expectations — do not infer a commitment from inclusion in this list. If a type accumulates 10+ user requests, it can be promoted to a V2 milestone.
- **Comments** — TikTok Web DOM structure for comment threads is significantly different from like/repost cards; would require a separate `processComments` method and selector schema
- **Watch history** — TikTok Web does not expose a public "watch history" tab (it lives in the mobile app's "Your activity" → "Watch history" only); no Web selector to target
- **Drafts** — TikTok Web does not support drafts at all; this is a mobile-app-only feature
- **Photos / photo carousels** — TikTok rolled out photo posts in 2024 but the Web DOM is still rolling out and `data-e2e` selectors are not yet stable
- **Albums** — same constraint as Photos, deferred until Web DOM stabilizes

## Later (Q2 – Q3 2027) — Multi-platform expansion
- YouTube: unlike videos, un-save, clear watch history
- Instagram: unlike, unfollow, clear saved posts
- Facebook: unlike, unfollow

## Future (2028+) — Ecosystem
- Optional subscription (second revenue stream — free tier never downgrades)
- Advanced filter rules (regex, domain whitelist, batch rule presets)
- "Lifetime supporter" cosmetic badge
- Public thank-you list (THANKS.md)

## Principles (won't change)
1. **Web is 100% local** — no servers, no telemetry, no data ever leaves the browser. (Mobile has a minimal Worker for receipt validation — see "Mobile-specific principles" below.)
2. **Web is tip-supported, never paywalled** — the free version is the version. This is a hard promise to web users.
3. **Open source** — all code public on GitHub
4. **8 languages from day 1** — en / ja / de / pt / fr / ko / zh-CN / es
5. **KISS engineering** — small static files, no build step, no backend (web)
6. **Tip model, not subscription** — applies to **web only**. See `docs/business-model.md`.

### Mobile-specific principles (new as of 2026-07-09)

These apply to the iOS/Android tier only. They do **not** weaken the web principles above.

1. **Mobile uses subscription model** — required by Apple/Google 30% IAP cut + mobile dev cost
2. **Free trial is the only free tier on mobile** — 1 week, then subscription required. No "limited free forever" inside mobile.
3. **No separate app member account** — subscription is bound to App Store / Play Store account via device ID stored in Keychain/Keystore. We do not collect PII.
4. **Backend is minimal** — Cloudflare Workers, $0/month at our scale, no DB, no auth system. Worker stores only receipt-derived subscription state.
5. **Web users do not need to subscribe** — the web extension is free for everyone, always, regardless of mobile subscription status.

## Won't do
- Cloud sync, accounts, or login (web)
- Selling user data (we don't have any)
- Mobile push notifications
- AI-powered "smart cleanup" (overreach — current filters are enough)
- Subscription-required features on **web** (would betray the tip model)
- Web paywall (web is free, period)
- Mobile data collection beyond subscription receipts
- App-side user accounts (subscription is bound to App Store / Play Store account, not a SocialEraser account)
