# Debug: login-stuck-checking

**症状**：Side panel 一直显示 "Checking login status..."，但用户实际已登录 X。
**会话 ID**：`login-stuck-checking`
**状态**：`[CLOSED] 用户确认修复生效（F5 刷新 X 标签页后 Checking → Logged in）`
**日期**：2026-06-16

---

## 一、3 个可证伪假设（来自上一轮静态分析）

| ID | 假设 | 验证方法 | 状态 |
|----|------|----------|------|
| **H1** | `GLOBAL_LOGIN_INDICATORS` 数组中部分 selector 在 X 2026 失效（重点怀疑 `[aria-label*='Account menu']` —— 案例 10 已证明 aria-label 被翻译）| 用 chrome-devtools-mcp 在真实 X 页面跑 8 个 selector 单独命中测试 | 待验证 |
| **H2** | `checkIsLoginPage()` 在 SPA 页面误命中（`document.body.innerText.includes('Sign in' / '登录' ...)` 太宽泛）| 跑 `innerText` substring match 测试，看是否在任何已登录页面也会命中 | 待验证 |
| **H3** | 500ms 首次检测太早，X 侧栏 lazy load 未完成；3s 轮询也 miss 是因为 H1/H2 的 selector 已失效 | 在 SPA 加载完成后跑 8 个 selector，看哪个时点开始能命中 | 待验证 |

---

## 二、收集证据的步骤（不改代码，纯读 DOM）

1. 通过 chrome-devtools-mcp 打开 X 主页（https://x.com/home）
2. 取 snapshot 看侧栏 DOM 结构
3. evaluate_script 跑 8 个 selector 单独命中测试
4. 跑 `checkIsLoginPage` 的 substring match 测试
5. 跑 `getEffectiveLoginStatus` 模拟（手动复现 sticky 状态机）
6. 看 console 消息确认 sticky 缓存的实际值

---

## 三、证据收集记录

### 证据 1：扩展未注入（chrome.runtime.id === null）
```json
{
  "url": "https://x.com/i/bookmarks",
  "xeraserInjected": false,
  "chromeExt": false,
  "chromeRuntimeId": null,
  "xeraserConfig": "undefined",
  "xeraserInjector": "undefined",
  "i18n": "undefined",
  "bodyHasXEraser": false
}
```

### 证据 2：扩展自身完全正常
- chrome://extensions 显示：**已启用 + 在所有网站上 + 允许访问文件网址**
- 来源：`/Volumes/XPSSD/workspaces/X-Eraser/chrome-extension`（本地工作目录）
- manifest content_scripts matches `*://x.com/*` —— 与用户 URL 完全匹配
- 扩展 ID：`hhlogeplejoiaogpcibdgebfloiokegl`

### 证据 3：刷新 X 页面后扩展正常注入 + 检测成功
```
[X-Eraser] i18n.js loading...
[X-Eraser] Detected language: zh-CN
[X-Eraser] Content script loaded on https://x.com/i/bookmarks
[X-Eraser] Config loaded from storage
[X-Eraser] Injector initialized
[X-Eraser] Config initialized, checking status...
[X-Eraser] Global login indicator found: a[href='/compose/post']
[X-Eraser] Login confirmed (sticky cached)
```

### 证据 4：8 个 login selector 在 X 2026 实测（刷新后）
| Selector | 命中 | 备注 |
|----------|------|------|
| `a[href='/compose/post']` | 1 | ✅ 仍能用 |
| `a[href='/i/bookmarks']` | 0 | ❌ X 2026 删了侧栏 bookmarks 直链 |
| `[data-testid^='AppTabBar_']` | 7 | ✅ 仍能用（前缀匹配）|
| `a[href^='/messages']` | 0 | ❌ X 2026 真实路径是 `/i/chat` |
| `a[href^='/notifications']` | 1 | ✅ 仍能用 |
| `[data-testid='SideNav_AccountSwitcher']` | 0 | ❌ 真实值是 `SideNav_AccountSwitcher_Button` |
| `[data-testid='UserAvatar']` | 0 | ❌ 真实值是 `UserAvatar-Container-<username>` |
| `[aria-label*='Account menu']` | 1 | ✅ 英文 locale 命中，非英文 locale 死（案例 10）|

**4/8 已失效**。如果剩 3-4 个全失效，login 检测会卡 null。X 再改版一次就有风险。

### 证据 5：checkIsLoginPage 不误命中
- `bodyTextLength: 1627`
- `loginPageHits: []` —— 已登录的 /home 页面，'Sign in' / '登录' / 'サインイン' 等 16 个关键词全部不匹配
- H2 排除 ✅

### 证据 6：修复后 7 个新 selector 实测（刷新后）
| Selector | 命中数 |
|----------|--------|
| `a[href='/compose/post']` | 1 |
| `a[href='/home']` | 2 |
| `a[href^='/i/chat']` | 1 |
| `a[href^='/notifications']` | 1 |
| `[data-testid^='AppTabBar_']` | 7 |
| `[data-testid^='SideNav_AccountSwitcher']` | 1 |
| `[data-testid^='UserAvatar-Container']` | 6 |

**7/7 全部命中，19 个匹配**。`atLeastOneHit: true`。

---

## 四、根因结论

| 假设 ID | 状态 | 证据 |
|--------|------|------|
| **H1**（selector 失效导致检测失败）| ⚠️ **部分成立** | 4/8 selector 失效，但剩 3-4 个仍能命中，**不是当前卡 Checking 的主因** |
| **H2**（checkIsLoginPage 误命中）| ❌ 排除 | 16 个关键词全不匹配 |
| **H3**（首次检测 500ms 太早）| ❌ 排除 | 即使 SPA 加载慢，3s 轮询会补上 |
| **H4（实际根因）** | ✅ **成立** | 用户的 X 标签页在扩展安装/启用前就已打开，**MV3 规定 content script 只在新页面加载时注入**，扩展从未注入过该 X 标签页 |

**真正根因**：MV3 content script 注入时机与扩展安装/启用时机的耦合，**不是 selector bug**，是 Chrome 扩展机制问题。X 页面需要 F5/Ctrl+R 刷新才能让 content script 注入。

**次要风险**：4/8 login selector 在 X 2026 失效，未来 X 改版可能让 login 检测彻底失败。

---

## 五、修复方案 + 证据对比

| 改动 | 文件 | 状态 |
|------|------|------|
| 删除 4 个失效 selector（`/i/bookmarks` `/messages` 精确 `SideNav_AccountSwitcher` 精确 `UserAvatar`）| content.js / default.json / remote-example.json | ✅ |
| 删除 1 个 aria-label 翻译死（`[aria-label*='Account menu']`）| 同上 | ✅ |
| 加 2 个新工作 selector（`/home` `/i/chat`）+ 2 个改前缀匹配 | 同上 | ✅ |
| 同步 content.js `getLoginConfig()` 内部硬编码 fallback | content.js | ✅ |
| 同步 `verify-login-detection.js` 测试基线 | scripts/verify-login-detection.js | ✅ |
| sidepanel 加 "请刷新 X 页面" 8s 兜底提示 | sidepanel.js / sidepanel.html / lib/i18n.js (8 langs) | ✅ |
| status-card max-height 100→180 容纳 hint | sidepanel.html | ✅ |

### 证据对比

**pre-fix**: 8 个 selector，4/8 失效，0% selector 实测保护，扩展未注入时静默卡 Checking

**post-fix**: 7 个 selector，7/7 命中（19 个匹配），100% selector 实测保护，8s 后弹"请刷新 X 页面"引导

**10/10 verify 全部 PASS**：
- check-schema: 5/0
- verify-i18n: 232 entries
- verify-setconfig: 13/0
- verify-actual-x-selectors: 112/0
- verify-daily-usage-chain: 9/9
- verify-sidepanel-bindings: 6/6
- verify-login-detection: 58/58
- verify-no-retry: 14/14
- verify-tweets-sub-options-grouping: 7/7
- verify-following: 67/67

---

## 六、清理

**等待用户确认**：在 X 标签页按 F5 刷新，验证 "Checking login status..." → "Logged in" 跳转是否正常。

确认通过后，本文件归档至 `docs/debug-history/`，debug session 关闭。
