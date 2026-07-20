# Business Model — Two-Tier (Web Free + Tip / Mobile Subscription)

> **TL;DR**: SocialEraser is now a two-tier product. **Web (Chrome/Edge extensions) is free, tip-supported, never paywalled** — this is a hard promise that has not changed. **Mobile (iOS/Android native apps) uses subscription** — $9.99/month with a 1-week free trial — because Apple/Google charge a 30% IAP fee that the tip model cannot cover.
>
> See [`mobile-architecture.md`](mobile-architecture.md) for the full mobile design.

## 0. Two-Tier Summary (effective 2026-07-09)

| Tier | Surface | Price | Revenue Model | Free Option |
|---|---|---|---|---|
| **Web** | Chrome / Edge browser extensions (X + TikTok) | Free | Tip jar (Creem: $1/$3/$5/$10/custom) | Free forever, no cap beyond safety limit |
| **Mobile** | iOS / Android native apps (TikTok V1) | $9.99/month | App Store / Play Store IAP subscription | 1-week free trial, then locked |

**Hard rule**: The web extension is **free, forever, for all users**, regardless of mobile subscription status. The two tiers are independent. A user who subscribes on mobile gets no additional web features; a user who tips on web gets no additional mobile features. There is no cross-tier upsell.

---

## 1. Decision (Web tier — unchanged)

The web tier uses the X+ model (see §5): a single product, a single payment surface (Creem), a single psychological contract (gratitude, not entitlement). No tiers, no premium features, no monthly/yearly subscriptions on web.

**This decision is not changing.** Anyone who joined SocialEraser for the web extension can continue using it exactly as before, forever, free. We do not introduce "premium" features on web, we do not lower the 5000/day cap for non-tippers, and we do not display subscription prompts in the web extension.

## 2. Why the web tier stays tip-only

We considered four business models before picking the tip jar for **web**:

| Model | Pros | Cons | Verdict |
|---|---|---|---|
| **Pure free, no ask** | Maximum trust, zero ops | Zero revenue — can't fund CDN, dev account, or testing X accounts | ❌ Rejected |
| **Freemium (subscription gates features)** | Predictable MRR, classic SaaS | Forces us to **cripple** the free tier to make Premium attractive — destroys the "free means free" promise; also requires backend (license keys, OAuth) we don't have | ❌ Rejected |
| **Hard daily cap (pay to unlock)** | Easy to explain, conversion-optimized | Functionally identical to a paywall — same trust problem as Freemium | ❌ Rejected |
| **Tip jar + soft cap (X+)** | No backend, no entitlement logic, preserves trust; revenue scales with goodwill | Variable revenue, psychologically harder to convert | ✅ **Selected for web** |

The deciding factor for **web**: **we have no backend**. A subscription model on web would require storing license keys, validating them per-session, and revoking them on cancel — all of which need a server. A tip page that redirects to Creem's hosted checkout is the *only* payment model that works with our no-backend web architecture.

## 3. Why mobile uses subscription (new as of 2026-07-09)

The mobile tier **cannot** use the tip-only model because:

1. **Apple App Store 3.1.1** mandates that any digital subscription purchased in an iOS app must use Apple's IAP. We cannot direct users to a web page to pay for in-app functionality.
2. **Google Play Store** has the same policy.
3. **Apple charges 30% on IAP** (15% after the first year of subscription, or for small business program). Google charges 15% from the first dollar.
4. **Mobile dev cost is 2-3x** web dev cost (SwiftUI + Kotlin, App Store review, device testing).

A $3 tip on web nets SocialEraser $3. A $9.99/month subscription on mobile nets ~$7.00 after Apple's 30% cut. The economics are different, and tip-only cannot sustain mobile development.

**What we did NOT do**:
- We did not introduce a "limited free tier" on web to push users toward mobile. Web is fully featured, free, no paywall.
- We did not make the mobile app free with ads. Ads are hostile to the user trust model.
- We did not require web users to create an account to "sync" anything. The two tiers are independent.

**What we DID do**:
- Mobile uses IAP (StoreKit 2 / Play Billing v6) — required, no workaround.
- Mobile subscriptions are bound to the App Store / Play Store account, not a SocialEraser account. We don't collect PII.
- The 1-week free trial is built into the IAP product configuration (introductory offer). No custom trial logic in app code.
- The backend is **minimal**: one Cloudflare Worker validates receipts and issues JWTs. No user database, no email collection, no analytics.

See [`mobile-architecture.md`](mobile-architecture.md) §5 for the Worker design and §6/§7 for iOS/Android implementation.

## 4. The 5000/day cap: safety, not paywall

The marketing site says "free, no quota, no trial." The extension caps at 5000 deletions/day. **This is the most important thing to keep straight** — they are not contradictory:

- **Marketing site promise**: We will not *charge* for features. We will not *gate* features behind a paywall. We will not *sell your data* to fund features.
- **5000/day cap**: A platform-safety limit. X (and every other platform) starts rate-limiting and may suspend accounts that bulk-delete too aggressively. 5000/day is a conservative number that keeps your account safe. We will **not** raise this for paying users — that would put your account at risk, defeating the whole point.

The cap shows up as a **tip modal**, not a paywall. The button text is "☕ Support the developer", not "Upgrade to Pro". The secondary button is "Got it" (close), not "Continue with free tier" (which would imply the free tier is limited).

The modal copy (English):
> Daily safety limit reached (5000/5000)
>
> To protect your account from rate limiting, we pause cleanup at 5000/day.
>
> Come back tomorrow — or support the developer to keep this free tool maintained.

8 languages see `platforms/x-project/scripts/i18n.js` keys `dailyLimitReached` / `dailyLimitReachedHint` / `considerSupporting` / `gotIt` / `supportProject` / `upgradeToPremium`. The key `upgradeToPremium` is **deliberately misnamed** for historical reasons; its value is the tip CTA, not a subscription upsell. The verify script `scripts/verify-tip-model.js` locks this in.

## 5. Why Creem (web tier)

- **No backend required**: Creem hosts the checkout, handles the redirect, and emails the receipt. We receive a webhook that "someone tipped $3" (the most-common tier) and the email they chose to share — nothing else.
- **Card data never touches us**: We literally cannot leak what we never receive.
- **Multi-currency + tax**: Creem handles it.
- **Hostile to chargebacks?** Acceptable trade-off for the no-backend simplicity.
- **No subscription by default**: Creem's "tip jar" products don't require monthly billing setup, which fits our "no subscription yet" stance.

Alternatives considered:
- **Stripe Payment Links**: Same hosted-checkout idea, but requires more setup, doesn't handle EU VAT as nicely, and has no "tip jar" affordance.
- **GitHub Sponsors / Open Collective**: Strong for transparency, but conversion rate is much lower (extra friction) and the revenue signal is weaker.
- **Crypto / on-chain**: Donations work but terrify mainstream users. Not ready.

## 6. What we have today (P0 — done)

| Piece | Status | File |
|---|---|---|
| 5000/day counter (single-flight serial chain, no race) | ✅ | `platforms/x-project/src/sidepanel.js` |
| Tip modal (8 languages, replaces `showUpgradeModal`) | ✅ | `platforms/x-project/src/sidepanel.js` |
| i18n keys for tip model in 8 languages | ✅ | `platforms/x-project/scripts/i18n.js` |
| Marketing-site [support page](https://socialeraser.app/support.html) with 5 tiers + FAQ | ✅ | `packages/marketing-website/support.html` |
| `success.html` post-checkout redirect target | ✅ | `packages/marketing-website/success.html` |
| Footer Support link in all 12 marketing pages | ✅ | `scripts/inject-support-footer.py` |
| Verify script locks the tip model | ✅ | `scripts/verify-tip-model.js` |
| **Creem checkout links** | ✅ 5 production Static Payment Links live in `support.html` (`https://www.creem.io/payment/prod_*`, one per tier: $1 / $3 / $5 / $10 / Custom) | [packages/marketing-website/support.html](packages/marketing-website/support.html) |

## 7. What comes next (P1+ — deferred for web)

These are intentionally **not** in the current sprint for the **web tier**. We want to see organic usage + review/rating data first to know what users actually value. **Mobile tier has its own roadmap in [`mobile-architecture.md`](mobile-architecture.md) §11.**

| Item | Why deferred |
|---|---|
| Monthly + yearly subscriptions on web | **Decided not to add on web.** The web tier is tip-only forever. Mobile tier has subscriptions instead — see [`mobile-architecture.md`](mobile-architecture.md). |
| Public thank-you list | Stretch goal. No feature gating — just a `THANKS.md` in the repo |
| **Re-enable the "Reviewed by Real Users" section** in `index.html` / `zh/` / `ja/` | Currently hidden behind `<!-- REVIEWS-HIDDEN ... -->` in all 3 home pages — the 6 review cards were fabricated to fill the layout, and **Creem's TOS bans fabricated testimonials** used to promote a paid product. Re-enable only when we have **at least 6 real quotes** collected from public sources (Chrome Web Store reviews, GitHub stars, Product Hunt comments, Twitter mentions). The `<!-- REVIEWS-HIDDEN -->` block in HTML references this row. |
| "Lifetime supporter" cosmetic badge in side panel | Stretch goal. Visual only, zero functional impact |

## 8. Anti-patterns to avoid

These are decisions we've made and will defend in code review:

1. **Do not** add a "Premium" badge, label, or color treatment to the side panel. The only difference between users is "has tipped" / "hasn't tipped" — and the extension literally doesn't know which.
2. **Do not** change the 5000/day cap based on payment status. Period.
3. **Do not** add analytics to the support page beyond what Creem provides. The extension must remain zero-knowledge about whether the user has ever tipped.
4. **Do not** use words like "upgrade", "premium", "plan" in user-facing copy. Even `upgradeToPremium` is a key name; the value is "☕ Support the developer". The verify script checks for forbidden words.
5. **Do not** make the support link a popup, modal, or auto-trigger. It's a footer link. Users find it if they want it.

## 9. Open questions

- **Mobile subscription refund policy**: Per Apple/Google default. iOS refund requests go through reportaproblem.apple.com. Android refund requests go through Google Play support. We don't process refunds directly. See [`mobile-architecture.md`](mobile-architecture.md) §10.5.
- **Mobile subscription price changes**: If we change the $9.99/month price, Apple/Google require 30 days notice to existing subscribers. New subscribers see the new price immediately.
- **VAT / sales tax for EU users (web)**: Handled by Creem, but worth a one-line disclaimer on the support page.
- **Large donations ($200+)**: Some companies want an invoice. Email `support@socialeraser.app` — FAQ on the support page already says this.
