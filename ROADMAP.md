# SocialEraser Roadmap

Public-facing development plan. Times are estimates, not commitments. Updated as priorities shift.

## Now — Stability & Launch
- Chrome Web Store launch (X Eraser)
- Edge add-on store launch
- Real-account end-to-end regression tests (tweets / likes / bookmarks / following)
- 5,000/day safety cap + tip model
- Remote selector hot-reload via GitHub-hosted config
- Top feedback channel (✉️ → mailto) + non-modal completion summary card

## Next (Q4 2026 – Q1 2027) — Mobile & TikTok
- Android (Capacitor): UI port + QA on real devices
- iOS (Capacitor): scaffold + port
- TikTok project: MVP code complete (5-type + 8-language + verify suite), pending CWS/Edge Web Store submission
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
1. **100% local** — no servers, no telemetry, no data ever leaves the browser
2. **Tip-supported, never paywalled** — the free version is the version
3. **Open source** — all code public on GitHub
4. **8 languages from day 1** — en / ja / de / pt / fr / ko / zh-CN / es
5. **KISS engineering** — small static files, no build step, no backend
6. **Tip model, not subscription** — see `docs/business-model.md`

## Won't do
- Cloud sync, accounts, or login
- Selling user data (we don't have any)
- Mobile push notifications
- AI-powered "smart cleanup" (overreach — current filters are enough)
- Subscription-required features (would betray the tip model)
