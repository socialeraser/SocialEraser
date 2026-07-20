# SocialEraser Mobile + Business Architecture v1.0

> **Status**: Design — locked decisions as of 2026-07-09. Implementation not started.
> **Audience**: Engineers / AI agents who will implement the mobile tier.
> **Scope**: Native mobile (iOS + Android) for TikTok. Web extension (X + TikTok) is **unchanged** in business model.

> **总览 / Document Overview**
> 本文档是 SocialEraser 移动端（iOS + Android）实施的设计总览，AI 可以据此直接进入开发。
>
> **核心决策**（不允许重新讨论）：
> 1. **业务模型**：Web 端免费 + Tip 永久不变（不可触碰）；移动端用 $9.99/月订阅，1 周免费试用
> 2. **架构**：双 WebView 模式（可见控制面板 + 不可见 tiktok.com），不引入纯原生 UI
> 3. **后端**：Cloudflare Workers 验票 + JWT，$0/月，~200-400 行 TS
> 4. **用户体系**：不收集 PII，订阅绑定 App Store/Play Store 账号，不做 App 会员登录
>
> **章节地图**：
> - **§0-1**：TL;DR + 已锁决策（先读这两节）
> - **§2-3**：业务模型 + 9 个原生 UI 屏幕规格
> - **§4-5**：双 WebView 架构 + Cloudflare Worker 后端
> - **§6-7**：iOS / Android 实施（StoreKit 2 + Play Billing v6）
> - **§8-9**：构建流水线 + 营销站文案更新
> - **§10**：App Store 合规（Apple 4.3 是最大风险）
> - **§11**：10 阶段实施清单
> - **§12-13**：开放决策 + 风险
> - **§14-15**：文件清单 + 引用
>
> **使用方式**：
> - AI 开工前：读 §0 → §1 → §11（确认阶段）→ 对应章节
> - 每个章节开头有中文 **导读 / Reading Guide**，快速理解设计意图
> - 看到 §12 Open Decisions 必须停下来 ping 用户，不能自行决定
> - §14 列出"不要碰"的文件（Web 端的所有代码）

---

## 0. TL;DR

| Layer | Decision |
|---|---|
| Business model | **Web stays free + tip-supported (Creem). Mobile is a paid subscription with 1-week free trial.** |
| Why | Mobile dev cost is real (iOS + Android × 2 × 4-6 weeks). Apple/Google 30% IAP cut is unavoidable. Tip alone cannot cover mobile development. |
| Mobile app architecture | **Two-WebView pattern**: 1 visible WebView (control panel = existing `sidepanel.html` adapted to mobile) + 1 headless WebView (loads `tiktok.com` with desktop UA, runs `tiktok-automation.js`). Native UI = shell (welcome, login, settings, paywall). |
| Backend | **Cloudflare Workers** for receipt validation (Apple + Google) and JWT issuance. Free tier covers the entire user base. ~200-400 lines TypeScript. |
| User accounts | **No app member login.** Use Apple/Google IAP. Trial auto-handled by StoreKit / Play Billing introductory offer. |
| Web extension | **Zero changes.** Same code, same tip model, same 5000/day cap, same "Tip-Supported" copy. |
| Brand promise delta | Web: "100% local, tip-only, never paywalled" — **preserved**. Mobile: "Subscription-based, 1-week free trial, free features are limited" — **new product surface, new contract.** |

---

## 1. Locked Decisions

These were decided in conversation and must NOT be re-opened during implementation:

1. **Mobile uses IAP (StoreKit 2 / Play Billing v6), not Stripe + email magic link.** Apple App Store 3.1.1 forbids directing digital subscription purchases outside the IAP.
2. **No app-side member registration / login.** Only login is TikTok login. Premium status is bound to device (Keychain/Keystore device ID), not user account.
3. **Two-WebView pattern, not pure-native UI.** Existing `sidepanel.html` + `sidepanel.js` is reused 100% as the in-app control panel. Pure-native would require rewriting ~2000 lines of UI in SwiftUI + Compose, contradicting the project's 3-end-share principle.
4. **Headless WebView loads `https://www.tiktok.com/` directly with desktop UA.** No `index.html` redirect. Existing `tiktok-automation.js` is injected as a `WKUserScript` (iOS) / `addJavascriptInterface` (Android) and runs unmodified.
5. **Desktop UA in WebView.** Mobile WebView default mobile UA triggers TikTok to serve mobile DOM, which breaks existing `data-e2e` selectors. Desktop UA is the standard solution used by all comparable TikTok helper tools.
6. **Cloudflare Workers for backend.** No DB, no server, no maintenance. Workers + KV covers the entire use case at $0/month.
7. **Subscription gates the entire app on mobile** (after trial ends). No "free tier inside mobile" — keeps the model simple and aligns with App Store rules.
8. **Web extension business model is unchanged.** No code, copy, or pricing changes. The Tip model, Creem integration, 5000/day cap, "Tip-Supported" copy all stay as-is.
9. **No post content preview native cards.** The current sidepanel does not show post previews; this is consistent with TweetEraser, Semiphemeral, etc. Adding preview is deferred to V2+ based on real user demand.
10. **Web is the "community / free" surface. Mobile is the "convenience" surface.** This is the new brand framing.

---

## 2. Business Model

> **导读 / Reading Guide**
> 业务模型。本节解释 Web 端为什么保持免费 + Tip（这是用户的硬承诺，不可动摇），移动端为什么必须用订阅（Apple/Google 收 30% IAP 抽成，Tip 模型无法覆盖）。
>
> - **Web tier 不可触碰**：所有 Chrome/Edge 扩展代码、文案、Tip 流程、5000/日 限额保持原样
> - **Mobile tier 必须用 IAP**：不能用 Stripe 或网页支付，违反 Apple 3.1.1 / Google Play 政策
> - **价格已锁定 $9.99/月**（见 §2.3），1 周免费试用由 StoreKit / Play Billing 的 introductory offer 自动处理
> - **不存 PII**：Worker 只存 `sub:{deviceId}` 订阅状态，deviceId 是随机 UUID 不是个人身份

### 2.1 Web Extension — Unchanged

| Aspect | Value |
|---|---|
| Price | Free, no paywall |
| Revenue | Tip-supported (Creem: 5 tiers $1/$3/$5/$10/custom) |
| Daily cap | 5000 / day (safety, not paywall) |
| Data collection | None (100% local) |
| Account required | No |
| Subscription | No |
| Brand promise | "Tip-Supported, never paywalled" |

**Implementation note for AI**: Do NOT touch `platforms/x-project/`, `platforms/tiktok-project/` Chrome/Edge code, or any marketing-site copy that says "free", "tip", "no subscription" for the Web tier.

### 2.2 Mobile — New Subscription Tier

| Aspect | Value |
|---|---|
| Price (proposed, adjustable) | **$9.99 / month** with **1-week free trial** (introductory offer) |
| Alternative tier (V2) | $19.99 / year with 1-week free trial (V1 ships monthly only) |
| Free trial | 1 week, auto-handled by StoreKit / Play Billing |
| Auto-renewal | Yes, monthly |
| Cancellation | User cancels in App Store / Play Store settings (not in app) |
| Refund | Per Apple / Google policy (handled by their support) |
| Restore purchases | Required by Apple — Restore button in Settings page |
| Account required | No (device-bound subscription) |
| Data collection | Receipt (Apple/Google), device ID (random UUID, Keychain/Keystore) |
| What "free" means | First 7 days = full access. After that, app is locked behind paywall. |

### 2.3 Pricing Notes

The decided price is **$9.99/month**. Rationale:

- **Premium pricing, niche tool**: The product is for power users who need bulk deletion. The audience is small but high-intent. Lower price points (e.g. $1.99, $2.99) signal "commodity" and may erode perceived value.
- **Apple/Google cut is significant**: At $9.99, after 30% Apple IAP cut, we net ~$7.00. At $2.99, we net ~$2.10. The difference is the entire dev cost of the mobile tier. A meaningful subscription price is required to cover that cost.
- **Comparable benchmark**: TweetEraser Pro is $9.99 (one-time lifetime license). Our $9.99/month is a different model but the same price point — signals "this is a real product".

Adjustments to consider (none of these have been decided):

| Option | Pros | Cons |
|---|---|---|
| $9.99/month (chosen) | Premium positioning, covers 30% cut, leaves $7 for dev cost | Higher friction than $1.99, fewer total subscribers |
| $4.99/month | Lower friction | After 30% cut nets ~$3.50; barely covers 1 dev hour/month per subscriber |
| $2.99/month | Standard SaaS price point | After 30% cut nets ~$2.10; unsustainable at any meaningful subscriber count |
| Annual only (e.g. $79.99/year) | Better LTV, fewer churn touch-points | Worse short-term cash flow, harder conversion |

**Final pricing decision is locked at $9.99/month** for V1. See §12 for the original decision table.

### 2.4 Free Trial Mechanics

| Platform | Mechanism |
|---|---|
| iOS | `Product.SubscriptionInfo.introductoryOffer` configured in App Store Connect. StoreKit auto-handles: first 7 days free, then auto-charges $9.99. User can cancel anytime during trial. |
| Android | "Free trial" offer type in Google Play Console subscription setup. Play Billing auto-handles. |

**App code** only needs to:
1. Check `product.subscription?.introductoryOffer?.isEligible` to know if user can start trial
2. Show "Start 1-week free trial" button
3. After StoreKit/Play Billing completes, send receipt to Cloudflare Worker
4. Worker validates, stores in KV, returns JWT
5. App stores JWT in Keychain/Keystore

**No trial state tracking in app code.** StoreKit/Play Billing is the source of truth. The Worker is the receipt authority.

### 2.5 Refund / Cancellation

- **iOS**: User refunds / cancels via App Store → Apple's `App Store Server Notifications` (V2) send server-to-server webhook to our Worker endpoint → Worker updates KV → next app launch sees expired status → app locks.
- **Android**: Same via `Real-time Developer Notifications` (RTDN) Pub/Sub.
- **Grace period**: If payment fails, Apple/Google grants a configurable grace period (default 16 days for monthly). User keeps access during grace. Worker must check `isInBillingRetry` field in receipt.

For V1, we can skip the webhook integration and rely on the app refreshing the receipt on launch. This is a known limitation that can be fixed in V2. See §13.

### 2.6 Brand Messaging Updates

**Changes to public-facing copy** (see §9 for full list):

| Surface | Old copy | New copy |
|---|---|---|
| Marketing site (home, FAQ) | "Free forever. Tip-supported." | "Free on Web. Mobile requires subscription." |
| Pricing page (NEW) | (none) | 3-tier: Free Web / Free Mobile Trial / Mobile Subscription $9.99/month |
| Terms of Service | (no mobile clause) | Add mobile subscription terms: auto-renewal, cancellation, refund per Apple/Google policy |
| Privacy Policy | (100% local) | Add: "Mobile apps collect receipts from Apple/Google for subscription validation" |
| Support page | (tip tiers only) | Add: "Mobile subscription is managed via your App Store / Play Store account" |

---

## 3. Native UI Screens

### 3.1 Final Screen List

| # | Screen | Type | Description |
|---|---|---|---|
| 1 | Welcome | Native | First-launch onboarding. 3 pages (SwipeView). "Continue" button → Home. |
| 2 | Home | WebView (control panel) | `sidepanel.html` adapted to mobile width. Type selection, filters, Start/Stop, progress, log. |
| 3 | TikTok Login | Native (with headless WebView) | Two tabs: "Scan QR" (Camera/Photo picker) + "Username/Password" (form). The actual login happens in a hidden WebView; native UI only captures the result. |
| 4 | Settings | Native | List: Language, Theme (Auto/Light/Dark), Restore Purchases, About, Open Source Licenses |
| 5 | FAQ | WebView (marketing site) | Loads `https://socialeraser.app/faq.html` |
| 6 | Terms | WebView (marketing site) | Loads `https://socialeraser.app/terms.html` |
| 7 | Privacy | WebView (marketing site) | Loads `https://socialeraser.app/privacy.html` |
| 8 | Contact | Native | `mailto:support@socialeraser.app` link + 3 social links (GitHub, X, Reddit) |
| 9 | Paywall | Native (with IAP sheet) | Shown when trial expired / not subscribed. CTA "Start 1-week free trial" → StoreKit / Play Billing sheet |

**Screens explicitly excluded**:
- ~~App member registration / login~~ — use IAP
- ~~Post content preview cards~~ — deferred to V2+
- ~~Multi-account switcher~~ — V2+
- ~~Stats dashboard~~ — V2+

### 3.2 Screen Specifications

Detailed UX specs for each screen. AI implementer should follow these directly.

#### 3.2.1 Welcome (Native, first launch only)

```
┌─────────────────────────────────┐
│  [Skip]                         │
│                                 │
│      [Large logo]               │
│                                 │
│  Welcome to Eraser for TikTok  │
│  Bulk-clean your TikTok in     │
│  under 60 seconds.             │
│                                 │
│  • 5 cleanup types              │
│  • 8 languages                  │
│  • 100% on your device          │
│                                 │
│  [● ○ ○]    (page indicator)   │
│                                 │
│  [Continue]                     │
└─────────────────────────────────┘
```

3 swipeable pages, each with one feature highlight. Last page button changes to "Get Started" → Home.

#### 3.2.2 Home (WebView, the existing `sidepanel.html`)

Renders `sidepanel.html` at mobile viewport (375-414px). Required changes to `sidepanel.html`:
- `@media (max-width: 600px)` block: stack cards vertically, larger touch targets (44px min)
- Top app bar: add native "Settings" gear icon (right) — implemented by native shell, not in HTML
- Bottom safe area: respect iOS home indicator / Android nav bar (16px bottom padding)

The control panel is otherwise **unchanged** — same logic, same i18n, same config.

#### 3.2.3 TikTok Login (Native)

```
┌─────────────────────────────────┐
│  ← Login to TikTok              │
│                                 │
│  [Scan QR]  [Username/Password]│
│  ─────────                      │
│                                 │
│  ┌─────────────────────────┐   │
│  │                         │   │
│  │      [QR Code]          │   │
│  │      240 × 240          │   │
│  │                         │   │
│  │  Open TikTok → Profile  │   │
│  │  → ⚙️ → Scan QR Code   │   │
│  └─────────────────────────┘   │
│                                 │
│  Status: Waiting for scan...    │
└─────────────────────────────────┘
```

- "Scan QR" tab: shows the QR code extracted from the headless WebView (which is loading tiktok.com/login)
- "Username/Password" tab: simple form, native submits to WebView via JS bridge
- Status updates via bridge: "Waiting for scan..." → "Logged in as @user" → auto-navigates to Home

#### 3.2.4 Settings (Native)

```
┌─────────────────────────────────┐
│  ← Settings                     │
│                                 │
│  LANGUAGE          English  ›   │
│  THEME             Auto     ›   │
│  ──────────────────────────     │
│  RESTORE PURCHASES              │
│  ABOUT                  v1.0.0  │
│  OPEN SOURCE LICENSES        ›  │
│  ──────────────────────────     │
│  Sign out of TikTok             │
│  Clear WebView data             │
└─────────────────────────────────┘
```

- "Language": picker with 8 options. Setting stored in Capacitor Preferences, broadcast to WebView via bridge.
- "Theme": Auto / Light / Dark. Native UI follows; WebView gets a class hint via bridge.
- "Restore Purchases": triggers StoreKit / Play Billing restore flow, then refreshes receipt via Worker.
- "Sign out of TikTok": clears WKWebsiteDataStore (iOS) / WebView cookies (Android).
- "Clear WebView data": full WebView cache clear.

#### 3.2.5 Paywall (Native, when subscription required)

```
┌─────────────────────────────────┐
│  ✕                              │
│                                 │
│      Eraser for TikTok          │
│      Premium                    │
│                                 │
│  Your free trial has ended.     │
│                                 │
│  • 5 cleanup types              │
│  • 8 languages                  │
│  • 5000 / day safety cap        │
│  • 100% on your device          │
│                                 │
│  ┌─────────────────────────┐   │
│  │ 1 week free            │   │
│  │ then $9.99 / month     │   │
│  │ [Start Free Trial]     │   │
│  └─────────────────────────┘   │
│                                 │
│  Cancel anytime in App Store    │
│  settings. Auto-renews monthly. │
│                                 │
│  [Restore Purchases]            │
│  [Privacy] [Terms]              │
└─────────────────────────────────┘
```

The "Start Free Trial" button triggers StoreKit / Play Billing purchase sheet. After completion:
- iOS: `Transaction.finish()` is called, app checks transaction state, sends receipt to Worker
- Android: equivalent flow with Play Billing v6

The paywall is **modal** — it blocks all other screens until user either subscribes or dismisses (which logs them out and shows a stripped Home with "Subscribe" CTA everywhere).

---

## 4. Mobile App Architecture

> **导读 / Reading Guide**
> 移动端架构核心。**双 WebView 模式**：1 个可见 WebView（控制面板）+ 1 个不可见 WebView（tiktok.com + 自动化脚本）。
>
> - **WebView-A 可见**：加载 `www/index.html`（即 `sidepanel.html`），用户操作这里
> - **WebView-B 不可见**：加载 `tiktok.com` 用 desktop UA，注入 `tiktok-automation.js` 跑自动化
> - **JS ↔ Native bridge**：用 `window.__SocialEraserBridge` 发事件，用 `window.__SocialEraserNative` 接命令
> - **关键决策：用 desktop UA 不是为了 UI**，是为了 TikTok 服务端返回桌面 DOM，让现有 `data-e2e` selector 全部复用
> - **不引入纯原生 UI**：避免重写 2000+ 行 UI，违反项目 3 端共用铁律
> - **文件树和 Bridge 协议在 §4.3 / §4.5**

### 4.1 Two-WebView Pattern

```
┌────────────────────────────────────────────────────────┐
│  Native App Shell (SwiftUI / Compose)                  │
│  ┌──────────────────────────────────────────────┐    │
│  │  Screen router (Welcome / Home / Login /    │    │
│  │  Settings / FAQ / Paywall)                  │    │
│  └──────────────────────────────────────────────┘    │
│         │                                              │
│  ┌──────┴───────────────────────────────────────┐    │
│  │  Bridge (Capacitor / native)                 │    │
│  │  - log    : native ← WebView                 │    │
│  │  - progress: native ← WebView                │    │
│  │  - startCleanup: native → WebView            │    │
│  │  - loginState: native ←→ WebView             │    │
│  └──────────────────────────────────────────────┘    │
│         │                          │                   │
│  ┌──────┴────────────┐  ┌──────────┴────────────┐    │
│  │  Visible WebView  │  │  Headless WebView     │    │
│  │  (sidepanel.html) │  │  (tiktok.com)         │    │
│  │  - mobile viewport│  │  - desktop UA         │    │
│  │  - user touches   │  │  - offscreen render   │    │
│  │  - shows progress │  │  - runs automation    │    │
│  └───────────────────┘  └───────────────────────┘    │
│                                                        │
│  Cloudflare Worker (api.socialeraser.app)              │
│  - receipt validation (Apple / Google)                 │
│  - JWT issuance / refresh                              │
│  - subscription state in KV                            │
└────────────────────────────────────────────────────────┘
```

### 4.2 Component Diagram

- **Native shell** (SwiftUI on iOS, Compose on Android): owns screen router, holds IAP receipt, manages 2 WKWebView / WebView instances, handles IAP flow.
- **Visible WebView**: loads `www/index.html` (mirror of `sidepanel.html` with mobile CSS). User interacts here for Type selection, filters, Start/Stop.
- **Headless WebView**: loads `https://www.tiktok.com/` with custom User-Agent set to desktop Chrome. Injects `tiktok-automation.js` as a user script. Never displayed; only `evaluateJavascript` results matter.
- **Bridge**: bidirectional message channel. Native ↔ WebView.
- **Cloudflare Worker**: receipt authority and subscription state.

### 4.3 File Layout

```
platforms/tiktok-project/
├── src/                            # Web UI (3-end shared, sync-shared.js outputs to www/)
│   ├── sidepanel.html              # Control panel
│   ├── sidepanel.js                # Control panel logic (with bridge adapter)
│   ├── i18n.js
│   ├── config/
│   │   ├── default.json
│   │   └── tiktok-remote-example.json
│   ├── _locales/                   # 8 languages
│   └── icons/
├── scripts/                        # Core automation (sync-shared.js copies to extensions/*)
│   ├── tiktok-automation.js        # Runs in headless WebView
│   ├── content.js
│   └── i18n.js
├── chrome-source/
├── edge-source/
├── capacitor.config.json           # NEW: webContentsDebuggingEnabled=false in production
├── www/                            # Build output (gitignored)
├── android/                        # NEW: npx cap add android
│   └── app/
│       └── src/main/
│           ├── assets/public/      # Synced from www/
│           ├── java/com/socialeraser/tiktok/
│           │   ├── MainActivity.kt
│           │   ├── EraserApp.kt
│           │   ├── ui/             # Compose screens
│           │   │   ├── WelcomeScreen.kt
│           │   │   ├── HomeScreen.kt
│           │   │   ├── LoginScreen.kt
│           │   │   ├── SettingsScreen.kt
│           │   │   ├── PaywallScreen.kt
│           │   │   ├── FaqScreen.kt
│           │   │   ├── TermsScreen.kt
│           │   │   ├── PrivacyScreen.kt
│           │   │   └── ContactScreen.kt
│           │   ├── web/            # WebView wrappers
│           │   │   ├── ControlWebView.kt
│           │   │   ├── HeadlessTikTokWebView.kt
│           │   │   └── Bridge.kt
│           │   ├── iap/            # Play Billing
│           │   │   ├── BillingManager.kt
│           │   │   └── SubscriptionState.kt
│           │   └── design/         # Theme, colors
│           ├── res/
│           └── AndroidManifest.xml
└── ios/                            # NEW: npx cap add ios
    └── App/
        └── App/
            ├── AppDelegate.swift
            ├── SceneDelegate.swift
            ├── EraserApp.swift
            ├── Views/              # SwiftUI screens
            │   ├── WelcomeView.swift
            │   ├── HomeView.swift
            │   ├── LoginView.swift
            │   ├── SettingsView.swift
            │   ├── PaywallView.swift
            │   ├── FaqView.swift
            │   ├── TermsView.swift
            │   ├── PrivacyView.swift
            │   └── ContactView.swift
            ├── Web/                # WKWebView wrappers
            │   ├── ControlWebView.swift
            │   ├── HeadlessTikTokWebView.swift
            │   └── Bridge.swift
            ├── IAP/                # StoreKit 2
            │   ├── StoreManager.swift
            │   └── SubscriptionState.swift
            └── Design/              # Theme
                └── Theme.swift

workers/                             # NEW: Cloudflare Worker
├── wrangler.toml
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                    # Main entry, router
│   ├── apple.ts                    # Apple receipt validation
│   ├── google.ts                   # Google receipt validation
│   ├── jwt.ts                      # JWT sign/verify
│   ├── kv.ts                       # KV access
│   └── types.ts                    # Shared types
└── README.md
```

### 4.4 WebView Configuration

#### 4.4.1 Visible WebView (Control Panel)

| Property | Value | Why |
|---|---|---|
| Source | `file:///android_asset/public/index.html` (Android) / `Bundle.main.url(forResource: "public/index", withExtension: "html")` (iOS) | Local file, fast load |
| JavaScript | Enabled | Required for sidepanel.js |
| DOM storage | Enabled | Required for i18n caching |
| User-Agent | Default (mobile) | Loads mobile CSS in sidepanel.html |
| Viewport | `width=device-width, initial-scale=1.0` | Standard |
| Cookies | None needed | sidepanel.html is local |
| Layout | Fills visible area | — |

#### 4.4.2 Headless WebView (tiktok.com)

| Property | Value | Why |
|---|---|---|
| Source | `https://www.tiktok.com/` | Direct URL load |
| JavaScript | Enabled | Required for tiktok-automation.js |
| DOM storage | Enabled | Required for TikTok session |
| Cookies | Enabled, persistent | TikTok login state |
| User-Agent | `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36` | Desktop UA → desktop DOM |
| Viewport | `width=1280` (iOS via `WKWebpagePreferences`) | Force desktop layout |
| Visibility | iOS: frame = `CGRect(x: -10000, y: -10000, w: 1, h: 1)` (offscreen) / Android: `View.INVISIBLE` | Hidden but rendered |
| Mixed content | Allowed (x-project config) | TikTok assets may be http |
| User script injection | `tiktok-automation.js` injected at `document_start` | Standard content script timing |

#### 4.4.3 iOS WKWebView User Script Injection

```swift
let userScript = WKUserScript(
    source: tiktokAutomationJS,  // bundled string from app bundle
    injectionTime: .atDocumentStart,
    forMainFrameOnly: true
)
let controller = WKUserContentController()
controller.addUserScript(userScript)
let config = WKWebViewConfiguration()
config.userContentController = controller
config.defaultWebpagePreferences.allowsContentJavaScript = true
let webView = WKWebView(frame: .zero, configuration: config)
```

`scripts/tiktok-automation.js` is copied from `platforms/tiktok-project/scripts/` to the iOS bundle via `sync-shared.js` (new target: `ios/App/App/public/`).

### 4.5 JS ↔ Native Bridge

#### 4.5.1 Bridge Protocol (WebView → Native)

```js
// In tiktok-automation.js or sidepanel.js
window.__SocialEraserBridge = {
  emit(type, payload) {
    if (window.webkit?.messageHandlers?.socialEraser) {
      window.webkit.messageHandlers.socialEraser.postMessage({ type, payload });
    } else if (window.androidBridge?.socialEraser) {
      window.androidBridge.socialEraser.postMessage(JSON.stringify({ type, payload }));
    }
  }
};
```

Event types:
- `log` `{ level, msg }` — log line for native UI to display
- `progress` `{ processed, total, type }` — cleanup progress
- `loginState` `{ status: 'logged_in'|'logged_out', username? }` — login state change
- `loginQrUrl` `{ url }` — extracted QR code image URL for login
- `cleanupComplete` `{ type, success, count }` — single type done
- `error` `{ type, message }` — fatal error

#### 4.5.2 Bridge Protocol (Native → WebView)

```js
// In sidepanel.js (replaces chrome.runtime.sendMessage)
window.__SocialEraserNative = {
  startCleanup(type, filters) { ... },
  pauseCleanup() { ... },
  resumeCleanup() { ... },
  stopCleanup() { ... },
  getLoginState() { return Promise<{ status, username? }> },
  setLanguage(lang) { ... },
  setTheme(theme) { ... }
};
```

Native side uses `evaluateJavascript` to call these. Example (iOS):

```swift
webView.evaluateJavaScript("window.__SocialEraserNative.startCleanup('likes', \(filtersJSON))")
```

#### 4.5.3 sidepanel.js Adapter

The existing `sidepanel.js` uses `chrome.runtime.sendMessage` to talk to background. For mobile, we need an adapter that swaps to bridge calls. Pattern:

```js
// platforms/tiktok-project/src/sidepanel.js (top of file)
const isNative = !!(window.Capacitor || window.__SocialEraserNative);
const sendMessage = isNative
  ? (msg) => window.__SocialEraserNative.send(msg)
  : (msg) => chrome.runtime.sendMessage(msg);
```

This allows the same `sidepanel.js` to work in both Chrome sidepanel and mobile WebView. The `chrome.*` calls have to be replaced with bridge calls throughout the file. AI implementer should:

1. Grep all `chrome.runtime.sendMessage` calls in `sidepanel.js`
2. Grep all `chrome.storage` calls
3. Wrap with the adapter pattern
4. Keep all state machine / UI logic untouched

### 4.6 Lifecycle

- **App backgrounded** → pause automation, save state to storage
- **App foregrounded** → check subscription status, resume or show paywall
- **App killed** → receipt and JWT in Keychain/Keystore survive; on next launch, validate JWT (or refresh via Worker)
- **WebView crash** → reload headless WebView, re-inject user script, re-attach bridge handlers

---

## 5. Cloudflare Worker Backend

> **导读 / Reading Guide**
> 后端只做一件事：验票。Apple 用 `buy.itunes.apple.com/verifyReceipt`，Google 用 `androidpublisher.googleapis.com`，验完存 KV 发 JWT。
>
> - **$0/月**：Cloudflare 免费额度 100K 请求/天，足够个人项目
> - **不存 PII、不做分析、不存访问日志**：跟项目"100% local"原则一致
> - **4 个 endpoint**（§5.1）：Apple 验票、Google 验票、查询订阅、刷新 JWT
> - **V2 加 webhook**：Apple App Store Server Notifications V2 + Google RTDN（自动同步订阅状态，避免用户开 App 时才发现过期）
> - **Worker 代码量**：~200-400 行 TypeScript，包含 `jose` 库做 JWT

### 5.1 Endpoints

| Method | Path | Purpose | Auth |
|---|---|---|---|
| POST | `/v1/receipt/apple` | Validate Apple receipt, return JWT | None (receipt is the proof) |
| POST | `/v1/receipt/google` | Validate Google receipt, return JWT | None (purchase token is the proof) |
| GET | `/v1/subscription/:deviceId` | Get current subscription state | None (deviceId is the lookup key) |
| POST | `/v1/subscription/refresh` | Refresh JWT (when expiring) | None (existing JWT) |
| POST | `/v1/webhook/apple` | Apple App Store Server Notifications V2 | Apple signature verification |
| POST | `/v1/webhook/google` | Google RTDN | Google Pub/Sub JWT verification |

For V1, webhook endpoints are **not implemented** (see §2.5). Listed for V2 reference.

### 5.2 Data Model (KV)

Key format: `sub:{deviceId}` (deviceId = random UUID, generated client-side, stored in Keychain/Keystore)

Value (JSON):
```json
{
  "deviceId": "uuid",
  "platform": "ios" | "android",
  "productId": "com.socialeraser.tiktok.monthly",
  "status": "trial" | "active" | "expired" | "billing_retry" | "cancelled",
  "trialEndsAt": "2026-07-16T12:00:00Z",
  "expiresAt": "2026-07-16T12:00:00Z",
  "originalTransactionId": "...",
  "createdAt": "2026-07-09T12:00:00Z",
  "updatedAt": "2026-07-09T12:00:00Z"
}
```

**No PII is stored.** Only the receipt-derived subscription state. No email, no name, no TikTok username.

### 5.3 JWT Spec

```json
{
  "sub": "deviceId-uuid",
  "premium": true,
  "exp": 1735689600,
  "iat": 1735603200,
  "iss": "socialeraser.app"
}
```

- **Algorithm**: HS256 (HMAC-SHA256, shared secret in `wrangler secret put JWT_SECRET`)
- **Expiration**: 30 days
- **Refresh**: app calls `/v1/subscription/refresh` when JWT is within 7 days of exp
- **Verification**: app stores JWT, includes in `Authorization: Bearer <jwt>` header for Worker calls (V2+; V1 has no follow-up calls after first validation)

### 5.4 Apple Receipt Validation

```typescript
// Apple verifyReceipt endpoint
const APPLE_PROD_URL = 'https://buy.itunes.apple.com/verifyReceipt';
const APPLE_SANDBOX_URL = 'https://sandbox.itunes.apple.com/verifyReceipt';

async function validateAppleReceipt(receiptB64: string, env: Env): Promise<AppleReceipt> {
  // 1. Try production
  let resp = await fetch(APPLE_PROD_URL, {
    method: 'POST',
    body: JSON.stringify({ 'receipt-data': receiptB64, password: env.APPLE_SHARED_SECRET })
  });
  let data = await resp.json() as AppleVerifyResponse;
  
  // 2. If status 21007, retry with sandbox
  if (data.status === 21007) {
    resp = await fetch(APPLE_SANDBOX_URL, {
      method: 'POST',
      body: JSON.stringify({ 'receipt-data': receiptB64, password: env.APPLE_SHARED_SECRET })
    });
    data = await resp.json();
  }
  
  // 3. Validate
  if (data.status !== 0) throw new Error(`Apple validation failed: status ${data.status}`);
  if (!data.latest_receipt_info || data.latest_receipt_info.length === 0) {
    throw new Error('No active subscription in receipt');
  }
  
  // 4. Extract latest subscription
  const latest = data.latest_receipt_info.sort(
    (a, b) => parseInt(b.expires_date_ms) - parseInt(a.expires_date_ms)
  )[0];
  
  return {
    productId: latest.product_id,
    transactionId: latest.original_transaction_id,
    expiresAt: new Date(parseInt(latest.expires_date_ms)),
    isInBillingRetry: data.pending_renewal_info?.[0]?.is_in_billing_retry_period === '1',
    isTrial: latest.is_trial_period === 'true'
  };
}
```

### 5.5 Google Receipt Validation

```typescript
async function validateGoogleReceipt(
  packageName: string,
  subscriptionId: string,
  purchaseToken: string,
  env: Env
): Promise<GoogleReceipt> {
  // 1. Get Google access token from service account
  const accessToken = await getGoogleAccessToken(env.GOOGLE_SERVICE_ACCOUNT);
  
  // 2. Call Google Play Developer API
  const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${packageName}/purchases/subscriptionsv2/tokens/${purchaseToken}`;
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const data = await resp.json() as GoogleSubscriptionV2;
  
  // 3. Validate
  if (!data.lineItems?.[0]) throw new Error('No active subscription');
  const item = data.lineItems[0];
  
  return {
    productId: subscriptionId,
    transactionId: purchaseToken,
    expiresAt: new Date(item.expiryTime),
    isInBillingRetry: item.lineItemState === 'IN_BILLING_RETRY',
    isTrial: item.lineItemState === 'IN_TRIAL'
  };
}
```

### 5.6 Project Structure

See §4.3 for the `workers/` tree. Key files:
- `src/index.ts` — request router
- `src/apple.ts` — Apple-specific logic
- `src/google.ts` — Google-specific logic
- `src/jwt.ts` — sign/verify with `jose` library
- `src/kv.ts` — typed KV access
- `src/types.ts` — shared TypeScript types

### 5.7 Deployment

```bash
cd workers/
npm install
npx wrangler login
npx wrangler kv:namespace create SUBSCRIPTIONS
# Paste returned namespace_id into wrangler.toml [[kv_namespaces]] section
npx wrangler secret put APPLE_SHARED_SECRET
# Paste the App Store Connect App-Specific Shared Secret
npx wrangler secret put JWT_SECRET
# Generate a random 32+ char string
npx wrangler secret put GOOGLE_SERVICE_ACCOUNT
# Paste the JSON of a Google Cloud service account with Play Android Developer API access
npx wrangler deploy
# Outputs: https://socialeraser-api.workers.dev
# (Map to api.socialeraser.app via Cloudflare DNS later)
```

---

## 6. iOS Implementation

> **导读 / Reading Guide**
> iOS 实现。Capacitor + SwiftUI + StoreKit 2。
>
> - **包名 `com.socialeraser.tiktok`**，应用名 "Eraser for TikTok"
> - **`StoreManager.swift`** 是 IAP 入口（§6.2）：`loadProducts()` / `purchase()` / `restorePurchases()` / `updateSubscriptionState()`
> - **`Bridge.swift`** 是 WebView ↔ 原生通信层（§6.3），遵守 `WKScriptMessageHandler` 协议
> - **WKWebView 隐藏**：用 `frame = CGRect(x: -10000, y: -10000, w: 1, h: 1)`（不是 `isHidden = true`），保证渲染管线不被打断
> - **生产 `webContentsDebuggingEnabled: false`**：x-project 当前是 `true`（调试模式），生产构建必须改回 `false`
> - **App Store 上架需要**：`com.apple.developer.in-app-payments` entitlement、StoreKit configuration、demo 账号（不能用自己的）

### 6.1 Capacitor Config

```json
{
  "appId": "com.socialeraser.tiktok",
  "appName": "Eraser for TikTok",
  "webDir": "www",
  "ios": {
    "allowsLinkPreview": true,
    "webviewSnapshots": false
  },
  "android": {
    "allowMixedContent": true,
    "webContentsDebuggingEnabled": false,
    "backgroundColor": "#0F0F0F"
  },
  "plugins": {
    "SplashScreen": {
      "launchShowDuration": 2000,
      "backgroundColor": "#0F0F0F",
      "showSpinner": false
    },
    "StatusBar": {
      "style": "DARK",
      "backgroundColor": "#0F0F0F"
    },
    "CapacitorStorage": {
      "clearOnUpgrade": false
    }
  },
  "bundledWebRuntime": false
}
```

**Production check**: `webContentsDebuggingEnabled: false` (was `true` in x-project, must be false for production).

### 6.2 StoreKit 2 Integration

`ios/App/App/IAP/StoreManager.swift`:

```swift
import StoreKit

@MainActor
class StoreManager: ObservableObject {
    @Published var products: [Product] = []
    @Published var subscriptionState: SubscriptionState = .unknown
    
    static let productID = "com.socialeraser.tiktok.monthly"
    
    func loadProducts() async {
        do {
            let loaded = try await Product.products(for: [Self.productID])
            self.products = loaded
        } catch {
            print("Failed to load products: \(error)")
        }
    }
    
    func purchase() async throws -> Transaction? {
        guard let product = products.first else { return nil }
        let result = try await product.purchase()
        switch result {
        case .success(let verification):
            let transaction = try checkVerified(verification)
            await transaction.finish()
            await updateSubscriptionState()
            return transaction
        case .pending, .userCancelled:
            return nil
        @unknown default:
            return nil
        }
    }
    
    func updateSubscriptionState() async {
        var state: SubscriptionState = .expired
        for await result in Transaction.currentEntitlements {
            if case .verified(let transaction) = result {
                if transaction.revocationDate == nil {
                    state = transaction.productID == Self.productID ? .active : state
                }
            }
        }
        self.subscriptionState = state
    }
    
    func restorePurchases() async throws {
        try await AppStore.sync()
        await updateSubscriptionState()
    }
    
    private func checkVerified<T>(_ result: VerificationResult<T>) throws -> T {
        switch result {
        case .verified(let safe): return safe
        case .unverified: throw StoreError.failedVerification
        }
    }
}

enum SubscriptionState: Equatable {
    case unknown
    case trial(daysRemaining: Int)
    case active
    case expired
    case billingRetry
}

enum StoreError: Error {
    case failedVerification
}
```

### 6.3 Native-Bridge Code

`ios/App/App/Web/Bridge.swift`:

```swift
import WebKit

class Bridge: NSObject, WKScriptMessageHandler {
    weak var webView: WKWebView?
    let onMessage: (String, [String: Any]) -> Void
    
    init(onMessage: @escaping (String, [String: Any]) -> Void) {
        self.onMessage = onMessage
    }
    
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any],
              let type = body["type"] as? String,
              let payload = body["payload"] as? [String: Any] else { return }
        onMessage(type, payload)
    }
    
    func call(_ type: String, _ payload: [String: Any]) {
        let json = try? JSONSerialization.data(withJSONObject: ["type": type, "payload": payload])
        guard let jsonString = String(data: json!, encoding: .utf8) else { return }
        let js = "window.__SocialEraserNative.dispatch(\(jsonString))"
        webView?.evaluateJavaScript(js, completionHandler: nil)
    }
}
```

### 6.4 SwiftUI Screens

Each screen is a SwiftUI `View`. Pattern: `@StateObject` for managers (StoreManager, Bridge), `@State` for local UI state. Example:

`ios/App/App/Views/PaywallView.swift`:

```swift
struct PaywallView: View {
    @StateObject var store = StoreManager()
    @State var isPurchasing = false
    @Environment(\.dismiss) var dismiss
    
    var body: some View {
        VStack(spacing: 24) {
            // ... UI ...
            Button {
                Task {
                    isPurchasing = true
                    if let _ = try? await store.purchase() {
                        // purchase success, store handles state update
                    }
                    isPurchasing = false
                }
            } label: {
                if isPurchasing {
                    ProgressView()
                } else {
                    Text("Start 1-Week Free Trial")
                }
            }
            .disabled(isPurchasing)
            
            Button("Restore Purchases") {
                Task { try? await store.restorePurchases() }
            }
        }
        .task { await store.loadProducts() }
    }
}
```

### 6.5 Production Build

```bash
cd platforms/tiktok-project
npx cap add ios
npx cap copy ios
npx cap open ios
# → Opens Xcode
# → Select Team, set Bundle ID to com.socialeraser.tiktok
# → Capabilities: Sign in with Apple (Apple ID), In-App Purchase
# → Product → Archive → Distribute App
```

---

## 7. Android Implementation

> **导读 / Reading Guide**
> Android 实现。Capacitor + Jetpack Compose + Play Billing v6。
>
> - **包名 `com.socialeraser.tiktok`**
> - **`BillingManager.kt`** 是 IAP 入口（§7.2），对应 iOS 的 `StoreManager`
> - **`Bridge.kt`** 用 `@JavascriptInterface`（§7.3），对应 iOS 的 `WKScriptMessageHandler`
> - **WebView 隐藏**：用 `View.INVISIBLE`（不是 `View.GONE`），保证 `evaluateJavascript` 时序可靠
> - **生产 `webContentsDebuggingEnabled: false`**
> - **Play Store 上架需要**：Google Play Billing 权限、Service Account JSON（给 Worker 用）、demo 账号
> - **iOS vs Android 主要差异**：StoreKit 用 `Transaction`，Play Billing 用 `Purchase`；事件模型不同但业务逻辑可以 1:1 对应

### 7.1 Capacitor Config

Same as iOS (see §6.1).

### 7.2 Play Billing v6 Integration

`android/app/src/main/java/com/socialeraser/tiktok/iap/BillingManager.kt`:

```kotlin
import com.android.billingclient.api.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

class BillingManager(private val activity: Activity) : PurchasesUpdatedListener {
    private var billingClient: BillingClient = BillingClient.newBuilder(activity)
        .setListener(this)
        .enablePendingPurchases()
        .build()
    
    private val _state = MutableStateFlow<SubscriptionState>(SubscriptionState.Unknown)
    val state: StateFlow<SubscriptionState> = _state
    
    companion object {
        const val PRODUCT_ID = "eraser_premium_monthly"
    }
    
    fun start() {
        billingClient.startConnection(object : BillingClientStateListener {
            override fun onBillingSetupFinished(result: BillingResult) {
                if (result.responseCode == BillingClient.BillingResponseCode.OK) {
                    queryProducts()
                    queryPurchases()
                }
            }
            override fun onBillingServiceDisconnected() { /* retry */ }
        })
    }
    
    fun launchPurchaseFlow(activity: Activity) {
        val productList = listOf(
            QueryProductDetailsParams.Product.newBuilder()
                .setProductId(PRODUCT_ID)
                .setProductType(BillingClient.ProductType.SUBS)
                .build()
        )
        val params = QueryProductDetailsParams.newBuilder().setProductList(productList).build()
        billingClient.queryProductDetailsAsync(params) { result, productDetailsList ->
            if (result.responseCode == BillingClient.BillingResponseCode.OK) {
                val productDetails = productDetailsList.firstOrNull() ?: return@queryProductDetailsAsync
                val offerToken = productDetails.subscriptionOfferDetails?.firstOrNull()?.offerToken ?: return@queryProductDetailsAsync
                val flowParams = BillingFlowParams.newBuilder()
                    .setProductDetailsParamsList(
                        listOf(BillingFlowParams.ProductDetailsParams.newBuilder()
                            .setProductDetails(productDetails)
                            .setOfferToken(offerToken)
                            .build())
                    ).build()
                billingClient.launchBillingFlow(activity, flowParams)
            }
        }
    }
    
    override fun onPurchasesUpdated(result: BillingResult, purchases: List<Purchase>?) {
        if (result.responseCode == BillingClient.BillingResponseCode.OK && purchases != null) {
            for (purchase in purchases) {
                handlePurchase(purchase)
            }
        }
    }
    
    private fun handlePurchase(purchase: Purchase) {
        if (purchase.purchaseState == Purchase.PurchaseState.PURCHASED) {
            // Acknowledge purchase
            if (!purchase.isAcknowledged) {
                val params = AcknowledgePurchaseParams.newBuilder()
                    .setPurchaseToken(purchase.purchaseToken)
                    .build()
                billingClient.acknowledgePurchase(params) { /* ... */ }
            }
            // Send to Cloudflare Worker
            // ...
        }
    }
    
    private fun queryProducts() { /* similar to launchPurchaseFlow */ }
    private fun queryPurchases() { /* check existing entitlements */ }
}
```

### 7.3 Native-Bridge Code

`android/app/src/main/java/com/socialeraser/tiktok/web/Bridge.kt`:

```kotlin
import android.webkit.JavascriptInterface
import android.webkit.WebView

class Bridge(private val webView: WebView, val onMessage: (String, JSONObject) -> Unit) {
    
    @JavascriptInterface
    fun postMessage(jsonString: String) {
        val json = JSONObject(jsonString)
        val type = json.getString("type")
        val payload = json.getJSONObject("payload")
        onMessage(type, payload)
    }
    
    fun call(type: String, payload: JSONObject) {
        val json = JSONObject().apply {
            put("type", type)
            put("payload", payload)
        }
        webView.evaluateJavascript("window.__SocialEraserNative.dispatch(${json})", null)
    }
}

// Attach in WebView setup:
webView.addJavascriptInterface(Bridge(webView) { type, payload -> 
    // dispatch to native handler
}, "socialEraser")
```

### 7.4 Compose Screens

`android/app/src/main/java/com/socialeraser/tiktok/ui/PaywallScreen.kt`:

```kotlin
@Composable
fun PaywallScreen(billingManager: BillingManager, onClose: () -> Unit) {
    val context = LocalContext.current
    val state by billingManager.state.collectAsState()
    var isPurchasing by remember { mutableStateOf(false) }
    
    Column(modifier = Modifier.fillMaxSize().padding(24.dp)) {
        // ... UI ...
        Button(
            onClick = {
                isPurchasing = true
                billingManager.launchPurchaseFlow(context as Activity)
            },
            enabled = !isPurchasing
        ) {
            if (isPurchasing) CircularProgressIndicator() else Text("Start 1-Week Free Trial")
        }
        TextButton(onClick = { /* restore */ }) { Text("Restore Purchases") }
    }
}
```

### 7.5 Production Build

```bash
cd platforms/tiktok-project
npx cap add android
> **导读 / Reading Guide**
> 构建流水线影响分析。结论：**`scripts/sync-shared.js` V1 0 改动**。
>
> - 现有脚本已经 `src/ → www/ → npx cap copy → android/ + ios/`
> - 唯一要验证（§8.2）：`scripts/tiktok-automation.js` 是否被 `npx cap copy` 打包到 iOS bundle。如果没，加一行自定义 copy step
> - **新增 4 个 verify 脚本**（§8.3）：mobile-build / bridge-protocol / worker-spec / mobile-copy
> - **不动 sync-shared.js 的原因**：现有 3 端共用逻辑是项目铁律，改它会牵连 Web 扩展构建

npx cap copy android
npx cap open android
# → Opens Android Studio
# → Set applicationId, sign with release keystore
# → Build → Generate Signed Bundle / APK → AAB
```

---

## 8. Sync Pipeline Updates

### 8.1 sync-shared.js Changes

The existing `scripts/sync-shared.js` already handles `extensions/{chrome,edge}-<prefix>/`. New requirement: it should also copy to mobile platforms after `npx cap copy` is run.

The current script already runs `npx cap copy` (step 3 in §1.1 of project memory). For TikTok with mobile, the same flow works:

1. `src/` → `www/`
2. `www/` → `android/app/src/main/assets/public/` (via `npx cap copy`)
3. `www/` → `ios/App/App/public/` (via `npx cap copy`)

**No changes to sync-shared.js required for V1.** Just ensure `capacitor.config.json` exists in `platforms/tiktok-project/`.

### 8.2 New Bundle Resource

For iOS, the `tiktok-automation.js` file must be included in the iOS bundle so WKWebView can inject it. The current sync copies it to `extensions/`. New path: `ios/App/App/public/tiktok-automation.js` (after `npx cap copy`).

If `npx cap copy` doesn't include the `scripts/` directory, we need to add a custom copy step in `sync-shared.js`. Verification needed during implementation.

### 8.3 Verify Scripts to Add

| Script | Purpose |
|---|---|
| `scripts/verify-tiktok-mobile-build.js` | Check that `platforms/tiktok-project/{android,ios}/` exist, that sync outputs `tiktok-automation.js` to both, that `capacitor.config.json` has correct appId |
| `scripts/verify-tiktok-bridge-protocol.js` | Check that `sidepanel.js` uses the bridge adapter, not raw `chrome.runtime.sendMessage` |
| `scripts/verify-worker-spec.js` | Check that all 4 Worker endpoints exist in `src/index.ts` |
| `scripts/verify-mobile-copy.js` | Check that marketing-site changes include "Mobile subscription" copy |

---

## 9. Website Updates (Marketing)

> **导读 / Reading Guide**
> 营销站文案更新。**Web 端文案 0 改动**，只加/改移动端相关内容。
>
> - **新增 `pricing.html`**（8 语言）：3 档（Free Web / Free Mobile Trial / Mobile Subscription $9.99/月）
> - **加 6 条移动端 FAQ**（§9.4，8 语言）：订阅取消、跨设备、退款、家庭共享、隐私、独立
> - **改 `index.html` 主页 CTA**（§9.2）：从 "Get SocialEraser for X" 改为 "Free on Web, $9.99/month on Mobile"
> - **改 `platforms/tiktok/index.html`**：加移动端订阅 badge + iOS/Android 链接
> - **改 `terms.html` / `privacy.html` / `support.html`**：增加移动端订阅相关条款（§9.5 / §9.6）
> - **`scripts/verify-copy-uniformity.js`** 要加新文案模式（§9.2 末尾）

### 9.1 New Page: Pricing (`/pricing` or `/pricing.html`)

8-language page explaining the two-tier model.

**Sections**:
- Hero: "Free on Web. Subscribe on Mobile."
- Tier 1: Web Extension — Free, Tip-Supported (current content, no changes)
- Tier 2: Mobile Free Trial — 1 week, then $9.99/month
- Tier 3: Mobile Annual — Coming in V2
- FAQ: 6 new questions about mobile subscription (cancellation, refund, trial, family sharing, restore, multi-device)
- Footer: existing links

### 9.2 Home Page Updates

`packages/marketing-website/index.html` (and 7 locale variants):

**Changes**:
1. Hero CTA: change from "Get SocialEraser for X" to "Get SocialEraser — Free on Web, $9.99/month on Mobile"
2. Add badge on mobile endpoint cards: "1-week free trial"
3. Update "Free forever" → "Free on Web" (in `verify-copy-uniformity.js` patterns)
4. FAQ section: add 3 mobile-specific questions

**Verify**: `scripts/verify-copy-uniformity.js` must be updated to recognize the new copy:
- Old: "Free forever", "Free during launch"
- New: "Free on Web", "Subscription on Mobile", "1-week free trial"

### 9.3 Platform Hub Updates

`packages/marketing-website/platforms/tiktok/`:

**Changes**:
- Add mobile badge with trial info
- Update download section: Chrome / Edge free, Android / iOS $9.99/month
- Footer: add pricing link

### 9.4 FAQ Additions

Add 6 new Q&A pairs (8 languages):

1. **Q: Why is mobile paid when the web extension is free?**
   A: Apple and Google charge a 30% fee on app subscriptions. The web extension has no such fee, so we can keep it free with tips. Mobile dev cost is also higher, so we use subscriptions to sustain it.

2. **Q: How do I cancel my subscription?**
   A: iOS: Settings → [your name] → Subscriptions → Eraser for TikTok → Cancel. Android: Google Play → Subscriptions → Eraser for TikTok → Cancel.

3. **Q: Can I get a refund?**
   A: Refunds are handled by Apple / Google per their policies. iOS: reportaproblem.apple.com. Android: support.google.com/googleplay/workflow/9975.

4. **Q: What happens to my data if I unsubscribe?**
   A: We don't store your TikTok credentials (they live in your device's secure storage). When you unsubscribe, the app stops working, but your TikTok account is unaffected.

5. **Q: Can I use the same subscription on multiple devices?**
   A: iOS: yes, via Apple Family Sharing (up to 6 family members). Android: yes, if you sign in with the same Google account on multiple devices.

6. **Q: Do I need a SocialEraser account?**
   A: No. Your subscription is bound to your App Store / Play Store account, not a SocialEraser account. We don't collect any personal information.

### 9.5 Terms / Privacy Updates

`terms.html` (8 languages):
- Add section: "Mobile Subscriptions" — auto-renewal disclosure, cancellation process, refund policy reference to Apple/Google, price changes with 30 days notice

`privacy.html` (8 languages):
- Update data collection: "We collect subscription receipts from Apple/Google to validate your subscription. We do not collect your name, email, or TikTok credentials."
- Update retention: "Receipts are stored in Cloudflare Workers KV for the duration of your subscription plus 30 days, then deleted."

### 9.6 Support Page Updates

`support.html` (8 languages):
- New section above tip tiers: "Mobile Subscription"
- New FAQ: "I subscribed on mobile, can I use the web extension?"
  A: Yes, the web extension is free for everyone regardless of mobile subscription status. They are independent.

---

## 10. App Store / Play Store Compliance

> **导读 / Reading Guide**
> App Store / Google Play 合规。**最危险的是 Apple 4.3（"复制其他服务功能"）**。
>
> - **必做 4 项**（§10.1-10.4）：demo video、demo 账号、Restore Purchases 按钮、订阅披露
> - **订阅披露 7 项**（§10.5）：价格、续费周期、自动续费说明、取消流程、隐私链接、服务条款链接、本地化价格
> - **隐私标签**（§10.3）：声明只收集 Purchase History（订阅凭证），不收集 PII
> - **CAPTCHA 风险**（§10.7）：V1 接受，V2 加原生介入 UI
> - **Apple 4.3 appeal 模板**提前准备好（提交前就要写好），首次提交被拒的可能性有 30-50%

### 10.1 Apple App Store 4.3 — "Replicating Other Service Functionality"

**Risk**: Apple may reject the app as "an app that replicates functionality of another app" because TikTok is itself an app.

**Mitigations**:
1. **Submit with a demo video** showing user-initiated bulk cleanup (not automation)
2. **Emphasize user ownership** — "Clean YOUR OWN content" in app description, screenshots, and paywall
3. **Position as productivity tool** — categories: Productivity, Utilities (not Social Networking)
4. **Avoid keyword spam** — description should not mention "TikTok" in the first 3 lines (Apple may treat as competitive)
5. **Prepare 4.3 appeal letter** in advance, explaining the use case and user benefit

### 10.2 Apple App Store 3.1.1 — In-App Purchase Required

**Rule**: Any digital subscription purchased in the app must use IAP. Directing users to web purchase is forbidden.

**Our approach**: All mobile subscriptions use StoreKit 2. No Stripe. No web purchase flow inside the app. This is fully compliant.

### 10.3 Privacy Labels (Apple) / Data Safety (Google)

**Apple App Store Connect → App Privacy**:
- **Data Not Collected** for: Contact Info, Financial Info, Health, etc.
- **Data Not Linked to You** for: Usage Data, Diagnostics
- **Data Collected**: Purchase History (Apple ID-linked), Diagnostics (crash logs, optional)

**Google Play Console → Data Safety**:
- **Data shared**: None
- **Data collected**: Purchase History (account-linked)
- **Security practices**: Data encrypted in transit (HTTPS)

### 10.4 Restore Purchases

**Required by Apple**: App must have a "Restore Purchases" button that calls `AppStore.sync()`. Place in Settings page.

### 10.5 Subscription Disclosures

**Required by Apple**:
- Title and length of subscription ("1 month")
- Price ($9.99)
- Frequency of billing ("$9.99 every month")
- Total cost over a year ("$35.88 / year if not cancelled")
- Auto-renewal disclosure ("Subscription automatically renews unless cancelled at least 24 hours before the end of the current period")
- Cancellation process ("Manage in App Store Settings")
- Privacy policy link
- Terms of service link
- Localized pricing

The `PaywallScreen` must include all of the above. Use Apple's standard `Product.PurchaseOption` data + the `Product.subscription?.subscriptionPeriod` for the period.

### 10.6 Demo Account for Reviewers

**Required**: When submitting, provide a TikTok account that Apple's review team can use to test the login + cleanup flow.

- Create a dedicated TikTok account: `applereview@socialeraser.app` (with a recognizable name)
- Pre-populate with a few test videos, likes, and follows
- Include credentials in App Store Connect → App Review Information → "Sign-in information"
- Do NOT use your personal account

### 10.7 TikTok Anti-Bot Considerations

**Risk**: TikTok may detect automation and trigger CAPTCHA or rate limit.

**Mitigations**:
- The 800-1200ms click interval (already in `tiktok-automation.js`) is human-like
> **导读 / Reading Guide**
> 10 个阶段清单，**Phase 0 必须先做**（决策锁定），不能直接进 Phase 1。
>
> - **Phase 0**（1 天）：确认 §12 Open Decisions 全部 10 项。**前 2 项已锁定**（价格、是否 annual），其余 8 项需要用户确认
> - **Phase 1**（2-3 天）：Cloudflare Worker 后端
> - **Phase 2-3**（1 周）：TikTok 项目脚手架（`npx cap add`）+ Bridge 层
> - **Phase 4-5**（3 周）：iOS + StoreKit 2
> - **Phase 6-7**（3 周）：Android + Play Billing v6
> - **Phase 8**（1 周）：营销站更新（pricing.html + 6 FAQ + terms/privacy/support）
> - **Phase 9**（1-2 周）：提交审核（含可能的 4.3 拒应对和复议）
> - **Phase 10**（持续）：监控 Worker 错误率、V2 加 webhook、加 annual tier

- The desktop UA in WebView may raise flags (UA says desktop, IP/device says mobile) — monitor for CAPTCHA prompts
- If CAPTCHA appears, show a native UI: "Please complete this verification, then tap Continue" — user solves CAPTCHA in WebView, automation resumes

**V1 limitation**: We accept CAPTCHA risk. If it becomes a blocker, V2 will add CAPTCHA detection + native intervention UI.

---

## 11. Implementation Phases

### Phase 0: Decision Lock-in (1 day, no code)

**Status: 7/10 LOCKED, 2 pending action, 1 deferred** (as of 2026-07-11)

- [x] User confirms pricing (**$9.99/month — LOCKED**)
- [x] User confirms trial length (**1 周 — LOCKED**)
- [x] User confirms 1 subscription tier for V1 (**monthly only — LOCKED**)
- [x] User confirms Web tier stays free (no change to extension business model)
- [x] User confirms brand name (**"Eraser for TikTok Premium" — LOCKED**)
- [x] User confirms refund policy (**Apple/Google default — LOCKED**)
- [x] User confirms iOS Family Sharing (**enabled — LOCKED**)
- [x] User confirms Cloudflare account (**已有 socialeraser.app**)
- [ ] **ACTION**: Pay Google Play Console $25 to activate account (Google 已注册未付费)
- [ ] **ACTION**: Register Apple Developer Program $99/year (**deferred to Phase 4 之前**)
- [ ] User confirms brand messaging updates (see §9) — **覆盖 §9 营销站文案**

### Phase 1: Cloudflare Worker Backend (2-3 days)

- [ ] Create Apple App-Specific Shared Secret in App Store Connect
- [ ] Create Google Cloud service account with Play Android Developer API access
- [ ] Scaffold `workers/` project (wrangler init, package.json, tsconfig)
- [ ] Implement `src/index.ts` (router)
- [ ] Implement `src/apple.ts` (verifyReceipt, status extraction)
- [ ] Implement `src/google.ts` (subscriptionsv2 API, service account auth)
- [ ] Implement `src/jwt.ts` (sign/verify with `jose`)
- [ ] Implement `src/kv.ts` (typed KV access)
- [ ] Deploy to Cloudflare Workers
- [ ] Test: send test receipt, verify JWT returned, verify KV populated
- [ ] Add `scripts/verify-worker-spec.js` (file existence + endpoint coverage)

### Phase 2: TikTok Project Mobile Scaffold (1 day)

- [ ] `npx cap add android` and `npx cap add ios` in `platforms/tiktok-project/`
- [ ] Update `capacitor.config.json` (appId, appName, webContentsDebuggingEnabled=false in prod)
- [ ] Verify `npx cap copy` syncs `www/` → `android/app/src/main/assets/public/` and `ios/App/App/public/`
- [ ] Verify `scripts/tiktok-automation.js` is bundled into the app (iOS: copy to `ios/App/App/public/`; Android: in `assets/public/`)
- [ ] Test: run app on iOS Simulator, verify both WebViews load

### Phase 3: Bridge Layer (3-5 days)

- [ ] Add `window.__SocialEraserBridge` in `tiktok-automation.js` and `sidepanel.js`
- [ ] Add `window.__SocialEraserNative` shim in `sidepanel.js` (for native → JS calls)
- [ ] Refactor `sidepanel.js` to use bridge adapter instead of `chrome.runtime.sendMessage`
- [ ] Implement iOS `Bridge.swift` (WKScriptMessageHandler)
- [ ] Implement Android `Bridge.kt` (JavascriptInterface)
- [ ] Implement iOS `ControlWebView.swift` (loads `sidepanel.html` from bundle)
- [ ] Implement Android `ControlWebView.kt` (loads `index.html` from assets)
- [ ] Implement iOS `HeadlessTikTokWebView.swift` (loads tiktok.com with desktop UA, hidden)
- [ ] Implement Android `HeadlessTikTokWebView.kt` (same, with desktop UA)
- [ ] Test: send "log" from `tiktok-automation.js`, receive in native

### Phase 4: Native UI Screens — iOS (2-3 weeks)

- [ ] WelcomeView (3 swipeable pages, Get Started CTA)
- [ ] HomeView (hosts ControlWebView, with Settings gear)
- [ ] LoginView (QR tab + Username/Password tab, status updates)
- [ ] SettingsView (Language, Theme, Restore, About, Clear Data)
- [ ] PaywallView (Start Free Trial, Restore, Privacy/Terms links)
- [ ] FaqView, TermsView, PrivacyView (load marketing-site URLs in WebView)
- [ ] ContactView (mailto + 3 social links)
- [ ] Design system: colors, typography, dark mode
- [ ] App icon, splash screen, App Store assets
- [ ] Test on iOS Simulator + real device

### Phase 5: StoreKit 2 Integration (1 week)

- [ ] Create subscription product in App Store Connect
- [ ] Implement `StoreManager.swift` (load products, purchase, restore, update state)
- [ ] Integrate `StoreManager` with `PaywallView`
- [ ] On purchase success: send receipt to Worker, store JWT in Keychain
- [ ] On app launch: check JWT validity, refresh if near expiry
- [ ] Test: full purchase → receipt validation → JWT → premium unlock flow
- [ ] Test: sandbox subscription renewal, cancellation, refund

### Phase 6: Native UI Screens — Android (2-3 weeks)

Mirror of Phase 4 in Kotlin + Jetpack Compose.

### Phase 7: Play Billing v6 Integration (1 week)

Mirror of Phase 5 with `BillingManager.kt`.

### Phase 8: Website Updates (1 week)

- [ ] Create `pricing.html` (8 languages)
- [ ] Update `index.html` (8 languages) — copy, badges
- [ ] Update `platforms/tiktok/index.html` (8 languages) — mobile subscription CTAs
- [ ] Add 6 mobile FAQ entries (8 languages)
- [ ] Update `terms.html` (8 languages) — mobile subscription terms
- [ ] Update `privacy.html` (8 languages) — receipt collection disclosure
- [ ] Update `support.html` (8 languages) — mobile section
- [ ] Update `verify-copy-uniformity.js` patterns
- [ ] Run full marketing-site verify suite

### Phase 9: App Store Submission (1-2 weeks)

- [ ] App Store Connect: app metadata, screenshots, privacy labels, demo account
- [ ] Google Play Console: app metadata, data safety form, content rating
- [ ] Submit for review
- [ ] Handle potential 4.3 rejection (appeal if needed)
- [ ] Iterate on reviewer feedback

### Phase 10: Post-Launch (ongoing)

- [ ] Monitor Worker request volume, error rate
- [ ] Implement webhook endpoints (V2 — automatic subscription status sync)
- [ ] Implement CAPTCHA detection + native intervention (V2 — if needed)
- [ ] Ad（ a 全部过完bs**7条LOCKED，2 用户动手，1条推迟**（of 2026-07-1）
- [ ] Expand to other platforms (YouTube, Instagram) on mobile (V3+)

>   缴 Google Play Console $25 注册费已注册未付费）
>   - 注册 Prrm$99年（推迟到Phs 4 之前
---（已锁定） 1 周 / Eraser for TikTok Premium / Apple/Google默认 / iOS启用
Phase 0 还剩 个 check 没勾（品牌文案校对见§9）可顺手在§9文案落稿后勾掉
## 12. Open Decisions (need user input before implementation)

> **导读 / Reading Guide**
> 10 条决策，**前 2 条已锁定**（价格 $9.99/月、是否 annual）。其余 8 条需要你确认后才能进 Phase 1。
>
> - **必填项**（不进 Phase 1 无法动手）：#4-7 账号准备（Apple Developer / Google Play / Cloudflare）
> - **可调整项**：#3 试用长度、#8 品牌名、#9 退款策略、#10 家庭共享
> - **AI 行为约束**：遇到这 10 项时，**必须停下来 ping 用户**，不能自行决定

| # | Decision | Status / Default | How to confirm | Resolution (2026-07-11) |
|---|---|---|---|---|
| 1 | Monthly subscription price | **$9.99 / month — LOCKED** | See §2.3 for rationale | $9.99 / month |
| 2 | Annual subscription tier in V1? | **No, V1 monthly only — LOCKED** | Annual tier deferred to V2 | No, V1 monthly only |
| 3 | Free trial length | 1 week | User confirms or adjusts | **1 周 — LOCKED** |
| 4 | App Store Connect / Google Play Console accounts | Not yet created | User creates accounts | Apple **deferred to Phase 4**; Google **registered but needs $25 payment** |
| 5 | Apple Developer Program enrollment | Not yet active ($99/year) | User enrolls | **Deferred to Phase 4 之前** |
| 6 | Google Play Developer account | Not yet active ($25 one-time) | User creates | **Account exists, need to pay $25 to activate** |
| 7 | Cloudflare account for Workers | Need to verify exists | User confirms | **已有 socialeraser.app — 无需新建** |
| 8 | Brand name for mobile subscription | "Eraser for TikTok Premium" | User confirms or adjusts | **Eraser for TikTok Premium — LOCKED** |
| 9 | Refund policy specifics | Per Apple/Google default (30 days iOS, 48h Android) | User confirms or customizes | **走 Apple/Google 默认 — LOCKED** |
| 10 | Family Sharing on iOS | Enabled by default | User decides | **启用 — LOCKED** |

---

## 13. Risks & Mitigations

> **导读 / Reading Guide**
> 10 条风险 + 缓解。**高风险：Apple 4.3 拒**。**中风险：TikTok 反爬 + 品牌承诺变化**。
>
> - **V1 接受 CAPTCHA 风险**：V2 加原生介入 UI
> - **V1 接受 desktop UA + 移动 IP 不一致的风控**：监控转化率，必要时切回 mobile UA + 新 selector 集
> - **Apple 30% 抽成是结构性约束**：靠价格（$9.99）而不是靠降本
> - **Web 端用户"期望移动免费"**：用 FAQ + Pricing 页解释（不是技术问题，是沟通问题）
> - **品牌承诺变化**：在 ROADMAP.md §"Two-Tier Business Model" 公开说明

| Risk | Severity | Mitigation |
|---|---|---|
| Apple 4.3 rejection | High | Demo video, user-ownership framing, productivity category, 4.3 appeal letter |
| TikTok anti-bot detection (CAPTCHA) | Medium | 800-1200ms click interval; native intervention UI for CAPTCHA (V2) |
| Desktop UA + mobile IP mismatch flagged | Medium | Accept as known risk; if blocked, fall back to mobile UA + new selector set |
| Apple IAP 30% cut makes subscription unsustainable | Low | Adjust price ($3.99) or annual tier (V2) to compensate |
| Worker KV eventual consistency | Low | V1 only reads own deviceId, no cross-region queries |
| Web extension users expect mobile to be free | Medium | Clear communication: "Free on Web" copy everywhere; FAQ addresses it |
| Brand promise shift (Tip-only → Mobile subscription) | Medium | Documented in ROADMAP.md; FAQ explains why; Web extension stays Tip-only |
| App Store review delays (esp. first submission) | Medium | Plan for 2-4 weeks of review iterations in Phase 9 |
| Worker cost at scale | Low | Free tier covers 100K requests/day = ~10K active users; paid tier is $5/month |
| Lost user trust due to business model change | Medium | Transparent FAQ, clear opt-out (cancel anytime), web stays free |

---

## 14. File Manifest

### Files to CREATE

```
docs/mobile-architecture.md                                # This document
workers/wrangler.toml
workers/package.json
workers/tsconfig.json
workers/src/index.ts
workers/src/apple.ts
workers/src/google.ts
workers/src/jwt.ts
workers/src/kv.ts
workers/src/types.ts
workers/README.md
platforms/tiktok-project/android/                          # npx cap add android
platforms/tiktok-project/ios/                              # npx cap add ios
platforms/tiktok-project/ios/App/App/IAP/StoreManager.swift
platforms/tiktok-project/ios/App/App/Web/Bridge.swift
platforms/tiktok-project/ios/App/App/Web/ControlWebView.swift
platforms/tiktok-project/ios/App/App/Web/HeadlessTikTokWebView.swift
platforms/tiktok-project/ios/App/App/Views/WelcomeView.swift
platforms/tiktok-project/ios/App/App/Views/HomeView.swift
platforms/tiktok-project/ios/App/App/Views/LoginView.swift
platforms/tiktok-project/ios/App/App/Views/SettingsView.swift
platforms/tiktok-project/ios/App/App/Views/PaywallView.swift
platforms/tiktok-project/ios/App/App/Views/FaqView.swift
platforms/tiktok-project/ios/App/App/Views/TermsView.swift
platforms/tiktok-project/ios/App/App/Views/PrivacyView.swift
platforms/tiktok-project/ios/App/App/Views/ContactView.swift
platforms/tiktok-project/ios/App/App/Design/Theme.swift
platforms/tiktok-project/android/app/src/main/java/com/socialeraser/tiktok/iap/BillingManager.kt
platforms/tiktok-project/android/app/src/main/java/com/socialeraser/tiktok/web/Bridge.kt
platforms/tiktok-project/android/app/src/main/java/com/socialeraser/tiktok/web/ControlWebView.kt
platforms/tiktok-project/android/app/src/main/java/com/socialeraser/tiktok/web/HeadlessTikTokWebView.kt
platforms/tiktok-project/android/app/src/main/java/com/socialeraser/tiktok/ui/WelcomeScreen.kt
platforms/tiktok-project/android/app/src/main/java/com/socialeraser/tiktok/ui/HomeScreen.kt
platforms/tiktok-project/android/app/src/main/java/com/socialeraser/tiktok/ui/LoginScreen.kt
platforms/tiktok-project/android/app/src/main/java/com/socialeraser/tiktok/ui/SettingsScreen.kt
platforms/tiktok-project/android/app/src/main/java/com/socialeraser/tiktok/ui/PaywallScreen.kt
platforms/tiktok-project/android/app/src/main/java/com/socialeraser/tiktok/ui/FaqScreen.kt
platforms/tiktok-project/android/app/src/main/java/com/socialeraser/tiktok/ui/TermsScreen.kt
platforms/tiktok-project/android/app/src/main/java/com/socialeraser/tiktok/ui/PrivacyScreen.kt
platforms/tiktok-project/android/app/src/main/java/com/socialeraser/tiktok/ui/ContactScreen.kt
platforms/tiktok-project/android/app/src/main/java/com/socialeraser/tiktok/design/Theme.kt
packages/marketing-website/pricing.html                    # 8 languages
scripts/verify-tiktok-mobile-build.js
scripts/verify-tiktok-bridge-protocol.js
scripts/verify-worker-spec.js
scripts/verify-mobile-copy.js
```

### Files to MODIFY

```
ROADMAP.md                                                 # Add Mobile principles, update Now section
docs/business-model.md                                     # Add Mobile tier section
packages/marketing-website/index.html                      # 8 languages, copy updates
packages/marketing-website/faq.html                        # 8 languages, 6 new Q&A
packages/marketing-website/terms.html                      # 8 languages, mobile subscription terms
packages/marketing-website/privacy.html                    # 8 languages, receipt collection disclosure
packages/marketing-website/support.html                    # 8 languages, mobile section
packages/marketing-website/platforms/tiktok/index.html     # 8 languages, mobile subscription CTAs
platforms/tiktok-project/capacitor.config.json             # appId, appName, webContentsDebuggingEnabled=false
platforms/tiktok-project/src/sidepanel.js                  # Bridge adapter (chrome.* → __SocialEraserNative)
platforms/tiktok-project/scripts/tiktok-automation.js      # Add __SocialEraserBridge.emit
scripts/verify-copy-uniformity.js                          # Add new copy patterns
scripts/run-verify.js                                      # Add new verify scripts to aggregate list
```

### Files NOT to touch (Web tier preserved)

```
platforms/x-project/**                                     # X Web extension — unchanged
platforms/tiktok-project/chrome-source/**                  # Chrome Web extension — unchanged
platforms/tiktok-project/edge-source/**                    # Edge Web extension — unchanged
extensions/chrome-tiktok/**                                # Chrome Web extension build output — unchanged
extensions/edge-tiktok/**                                  # Edge Web extension build output — unchanged
```

---

## 15. References

### External Documentation

- [Apple StoreKit 2 Documentation](https://developer.apple.com/documentation/storekit)
- [Apple App Store Server Notifications V2](https://developer.apple.com/documentation/appstoreserverapi)
- [Google Play Billing v6](https://developer.android.com/google/play/billing)
- [Google Real-time Developer Notifications](https://developer.android.com/google/play/billing/rtdn-reference)
- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [Cloudflare Workers KV](https://developers.cloudflare.com/workers/runtime-apis/kv/)
- [Capacitor iOS Documentation](https://capacitorjs.com/docs/ios)
- [Capacitor Android Documentation](https://capacitorjs.com/docs/android)
- [Apple App Store Review Guidelines 4.3](https://developer.apple.com/app-store/review/guidelines/#spam)
- [Apple App Store Review Guidelines 3.1.1](https://developer.apple.com/app-store/review/guidelines/#in-app-purchase)

### Project Internal References

- [`ROADMAP.md`](../../ROADMAP.md) — public roadmap (must be updated to reflect mobile tier)
- [`docs/business-model.md`](../business-model.md) — current business model (must be updated)
- [`platforms/tiktok-project/README.md`](../../platforms/tiktok-project/README.md) — TikTok project overview
- [`platforms/x-project/README.md`](../../platforms/x-project/README.md) — X project (Capacitor precedent)
- [`scripts/sync-shared.js`](../../scripts/sync-shared.js) — build pipeline (no changes needed for V1)
- [`scripts/verify-tip-model.js`](../../scripts/verify-tip-model.js) — tip model verify (must remain passing)
- [`scripts/verify-copy-uniformity.js`](../../scripts/verify-copy-uniformity.js) — copy verify (must be updated)

### Project Iron Rules (from project_memory.md)

These MUST be preserved when implementing mobile:

- All 8 language translations for `dailyLimitReachedHint` must contain "tip/support developer/come back tomorrow" keywords (Web tier only)
- All critical selectors must be validated via MCP before code submission
- Testing must be done in standard Chrome browser (Web), and on real iOS Simulator / Android Emulator (Mobile)
- Tab element lookup must be async (waitForElement), not `document.querySelector` sync
- All selectors must be in config JSON files, not hardcoded
- Force page load must use `window.location.href` (sync), not fire-and-forget IPC
- Page load detection must use polling, not fixed sleep delays
- 8-language stable selectors are critical (`data-e2e` for TikTok, ARIA fallback)

### Cross-Platform Development Rules (from project_memory.md)

When implementing mobile, apply these Web rules:

- "100% local" — Web extension is 100% local. Mobile app is local for the user's TikTok session, but does contact Worker for receipt validation. This is the ONE exception.
- "Tip model" — Web stays tip-only. Mobile uses subscription, which is a separate product surface.
- "KISS engineering" — Don't over-engineer. The two-WebView pattern reuses existing `sidepanel.html` instead of rewriting as native UI.
- "Deleting code is improvement" — Don't add fallback retry, silent polling, or old-API compat shims.

---

**Document version**: 1.0
**Last updated**: 2026-07-09
**Author**: AI-assisted design (conversation 2026-07-09)
**Next review**: After Phase 0 decisions are confirmed
