# Business Model — Tip / Donation (X+ Decision)

> **TL;DR**: SocialEraser is free forever. A tip is welcome, never required. The 5000/day cap is a platform-safety limit, not a paywall. We do not gate features behind payment.

## 1. Decision

We chose **X+ in the design matrix** (see §3): a single product, a single payment surface (Creem), a single psychological contract (gratitude, not entitlement). No tiers, no premium features, no monthly/yearly subscriptions (yet).

Future evolution (P1, deferred) is to **add** subscriptions as a *second* revenue stream for users who want to support more aggressively — but the free tier stays free.

## 2. Why not subscriptions first

We considered four business models before picking the tip jar:

| Model | Pros | Cons | Verdict |
|---|---|---|---|
| **Pure free, no ask** | Maximum trust, zero ops | Zero revenue — can't fund CDN, dev account, or testing X accounts | ❌ Rejected |
| **Freemium (subscription gates features)** | Predictable MRR, classic SaaS | Forces us to **cripple** the free tier to make Premium attractive — destroys the "free means free" promise; also requires backend (license keys, OAuth) we don't have | ❌ Rejected |
| **Hard daily cap (pay to unlock)** | Easy to explain, conversion-optimized | Functionally identical to a paywall — same trust problem as Freemium | ❌ Rejected |
| **Tip jar + soft cap (X+)** | No backend, no entitlement logic, preserves trust; revenue scales with goodwill | Variable revenue, psychologically harder to convert | ✅ **Selected** |

The deciding factor: **we have no backend**. A subscription model would require storing license keys, validating them per-session, and revoking them on cancel — all of which need a server. A tip page that redirects to Creem's hosted checkout is the *only* payment model that works with our no-backend architecture.

## 3. The 5000/day cap: safety, not paywall

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

## 4. Why Creem

- **No backend required**: Creem hosts the checkout, handles the redirect, and emails the receipt. We receive a webhook that "someone tipped $3" (the most-common tier) and the email they chose to share — nothing else.
- **Card data never touches us**: We literally cannot leak what we never receive.
- **Multi-currency + tax**: Creem handles it.
- **Hostile to chargebacks?** Acceptable trade-off for the no-backend simplicity.
- **No subscription by default**: Creem's "tip jar" products don't require monthly billing setup, which fits our "no subscription yet" stance.

Alternatives considered:
- **Stripe Payment Links**: Same hosted-checkout idea, but requires more setup, doesn't handle EU VAT as nicely, and has no "tip jar" affordance.
- **GitHub Sponsors / Open Collective**: Strong for transparency, but conversion rate is much lower (extra friction) and the revenue signal is weaker.
- **Crypto / on-chain**: Donations work but terrify mainstream users. Not ready.

## 5. What we have today (P0 — done)

| Piece | Status | File |
|---|---|---|
| 5000/day counter (single-flight serial chain, no race) | ✅ | `platforms/x-project/src/sidepanel.js` |
| Tip modal (8 languages, replaces `showUpgradeModal`) | ✅ | `platforms/x-project/src/sidepanel.js` |
| i18n keys for tip model in 8 languages | ✅ | `platforms/x-project/scripts/i18n.js` |
| Marketing-site [support page](https://socialeraser.app/support.html) with 5 tiers + FAQ | ✅ | `packages/marketing-website/support.html` |
| `success.html` post-checkout redirect target | ✅ | `packages/marketing-website/success.html` |
| Footer Support link in all 12 marketing pages | ✅ | `scripts/inject-support-footer.py` |
| Verify script locks the tip model | ✅ | `scripts/verify-tip-model.js` |
| **Creem checkout links** | ⏳ Placeholders `#TODO-CREEM-LINK-1/3/5/10/CUSTOM` in `support.html` | — |

## 6. What comes next (P1+ — deferred)

These are intentionally **not** in the current sprint. We want to see organic usage + review/rating data first to know what users actually value.

| Item | Why deferred |
|---|---|
| Replace `#TODO-CREEM-LINK-*` placeholders with real Creem checkout URLs | Need to set up the 4 products in Creem dashboard — 1-time work, but blocks the page going live as a "real" payment page |
| Monthly + yearly subscriptions | Only as a *second* stream, never replacing the free tier. We want to know what people would pay for *before* we build it |
| Public thank-you list | Stretch goal. No feature gating — just a `THANKS.md` in the repo |
| "Lifetime supporter" cosmetic badge in side panel | Stretch goal. Visual only, zero functional impact |
| Webhook handler in a future backend (if we ever get one) | Required to grant license keys if/when we add premium features. Not needed for tip model |

## 7. Anti-patterns to avoid

These are decisions we've made and will defend in code review:

1. **Do not** add a "Premium" badge, label, or color treatment to the side panel. The only difference between users is "has tipped" / "hasn't tipped" — and the extension literally doesn't know which.
2. **Do not** change the 5000/day cap based on payment status. Period.
3. **Do not** add analytics to the support page beyond what Creem provides. The extension must remain zero-knowledge about whether the user has ever tipped.
4. **Do not** use words like "upgrade", "premium", "plan" in user-facing copy. Even `upgradeToPremium` is a key name; the value is "☕ Support the developer". The verify script checks for forbidden words.
5. **Do not** make the support link a popup, modal, or auto-trigger. It's a footer link. Users find it if they want it.

## 8. Open questions

- **Refund policy**: Creem's default is 30 days, no questions asked. Fine for tips. If we add subscriptions, we'll need a clearer written policy on the support page.
- **VAT / sales tax for EU users**: Handled by Creem, but worth a one-line disclaimer on the support page.
- **Large donations ($200+)**: Some companies want an invoice. Email `support@socialeraser.app` — FAQ on the support page already says this.
