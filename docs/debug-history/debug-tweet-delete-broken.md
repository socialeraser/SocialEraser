# Debug: tweet-delete-broken

**症状**：勾选 Tweets → Start Cleanup，但推文没有被删除
**会话 ID**：`tweet-delete-broken`
**状态**：`[CLOSED] 用户确认根因 + 端到端验证：unretweet 流程真删 1 条 retweet`
**日期**：2026-06-16

---

## 一、3-5 个可证伪假设

| ID | 假设 | 验证方法 | 状态 |
|----|------|----------|------|
| **H1** | `tweet.moreButtons` selector 在 X 2026 失效（X 改版"更多"按钮）| 在真实 X /home 跑 7 个 moreButtons selector 单测 | 待验证 |
| **H2** | `tweet.confirmButton` selector 失效（X 改版 confirm dialog）| 真实 X DOM 测 `[data-testid='confirmationSheetConfirm']` | 待验证 |
| **H3** | 8 语言 menu 文字匹配失效（X 改版 "Delete" 文字 / 改了按钮顺序）| 用 chrome-devtools-mcp 打开更多菜单，看实际菜单文字 | 待验证 |
| **H4** | processTweets 流程逻辑错误（filter 把所有推文都判为 skip / pinned / reply 跳过）| 看 startCleanup 时 console 的 `[X-Eraser] Skipping pinned: ...` 日志量 | 待验证 |
| **H5** | deleteTweet 8 语言菜单匹配后没正确点击菜单项 | 跑 8 语言关键词看是否都还在 X 菜单上 | 待验证 |

---

## 二、收集证据的步骤（不改代码，纯读 DOM / console）

1. 通过 chrome-devtools-mcp 在 X /home 上注入（已确认扩展正常）
2. 看 console 消息，找 processTweets 相关日志
3. 手动模拟一次：点开一条推文的"更多"菜单，看实际菜单文字
4. 测 7 个 moreButtons selector 在真 X DOM 的命中
5. 测 confirmButton 命中
6. 测 waitForMenuItemByText 用的关键词

---

## 三、证据收集记录

### 证据 1：原始 console 日志（8 次失败）
```
[XEraser] Processing tweets...
[XEraser] Starting tweets cleanup on https://x.com/xiangping5211/with_replies?_=1781611182301...
[error] [XEraser] Tweet delete failed: no more button or confirm   [8 times]
[XEraser] No progress for 30s, stopping (X UI may have changed)
[XEraser] Auto-resume attempt 1: processed=0 (final)
[XEraser] Done. Processed: 0
```

### 证据 2：selector 误中范围（真 X DOM 实测）
- `button[aria-label*='More']` 匹配 **8 个元素**：
  - 2 个侧边栏 "More menu items" 按钮（`AppTabBar_More_Menu`）
  - 2 个推文 article 内的 caret
  - **4 个 trend 区域** caret 按钮（`DIV[trend]` 父链）
  - 1 个其他侧边栏按钮
- `[data-testid='caret']` 匹配 **6 个元素**：
  - 2 个在推文 article 内
  - 4 个在 trend 区域

### 证据 3：推文内容
2 个推文 article 的 socialContext 都 = "You reposted"（retweet），hasUnretweetBtn = true

### 证据 4：模拟 collectCandidates（修复前）
- 6 个候选（2 retweet caret + 2 侧边栏 + 4 trend）→ 8 次 deleteTweet 调用 → 全部失败

### 证据 5：isRetweetCard 正确工作
- 4 种 retweet 指示器（`[data-testid='unretweet']` `[data-testid='Unretweet']` `[data-testid='undoRepost']` `button[aria-label*='Reposted']`）
- 2 个 retweet 推文内 caret 都被 isRetweetCard 正确识别为 retweet → 从 moreButtons 路径过滤
- 但 2 个 caret 仍被 `addAll(btns, false)` 添加（filter 漏？）

### 证据 6：模拟 collectCandidates（修复后）
- 2 个候选（2 个 unretweet 按钮，isRetweet=true，都在推文 article 内）
- 0 个误中候选
- 都走 unretweet 路径

### 证据 7：unretweet 流程端到端验证
- 点 `[data-testid='unretweet']` 按钮
- 菜单弹出 2 项：`["Undo repost", "Quote"]`
- 文字匹配 "Undo repost" ✅
- `[data-testid='unretweetConfirm']` 元素存在 ✅
- 流程完整，X 2026 unretweet 路径工作正常

---

## 四、根因结论

| 假设 ID | 状态 | 证据 |
|--------|------|------|
| **H1**（moreButtons selector 失效）| ⚠️ 部分成立 | `[data-testid='more']` 在 X 2026 失效（0 命中），但 caret 和 aria-label 仍能用。**问题不是失效，而是误中** |
| **H2**（confirmButton selector 失效）| ❌ 排除 | 没走到 confirmButton 步骤，候选在前面就死 |
| **H3**（8 语言 menu 文字匹配失效）| ❌ 排除 | 候选在前面就死，menu 都没打开 |
| **H4**（processTweets 流程逻辑错误）| ✅ **成立** | collectCandidates 把侧边栏 "More menu items" 和 trend 区 caret 当成推文候选 |
| **H5**（deleteTweet 8 语言菜单匹配后没正确点击）| ❌ 排除 | 同 H3 |

**真正根因**：
- `moreButtons` 包含 2 个宽泛 selector（`button[aria-label*='More']` 和 `[data-testid='caret']`）
- 这 2 个 selector **没限定 article 容器内**，匹配到 X 2026 侧边栏 "More menu items" 按钮（`AppTabBar_More_Menu`）和 trend 区域 caret 按钮
- isRetweetCard 正确把 retweet 推文 caret 过滤了，但**没过滤非推文 button**（侧边栏 / trend caret 不是 retweet card）
- processTweets 把这 6 个非推文 button 当成推文候选，调 deleteTweet
- deleteTweet 拿 fake container（btn.parentElement）找 more button → 0 命中 → 失败
- 8 次失败 → 30s STUCK_TIMEOUT 退出 → 0 命中

**次要观察**：用户在 /with_replies 页面只有 2 条 retweet，没有原创推文或 reply。`moreButtons` 修复后 0 个原创候选（这是预期行为，因为没有原创）。如果用户想删原创，需要去 `/xiangping5211`（非 /with_replies）。

---

## 五、修复方案 + 证据对比

| 改动 | 文件 | 行数 |
|------|------|------|
| addAll 增加 `closest('article') || findClosest(articleContainers, btn)` 过滤 | [lib/injector.js](file:///Volumes/XPSSD/workspaces/X-Eraser/chrome-extension/lib/injector.js#L1112-L1123) | +9 行 |
| deleteTweet instrumentation（已清理，回归原始 4 步简单 return false）| [lib/injector.js](file:///Volumes/XPSSD/workspaces/X-Eraser/chrome-extension/lib/injector.js#L261-L300) | 0 行（清理回原状）|

### 证据对比

**pre-fix**：6 candidates → 8 次 deleteTweet 失败 → 0 命中 → 30s 退出
**post-fix**：2 candidates（2 个 unretweet 按钮）→ 走 unretweet 路径 → 端到端 menu 弹出验证通过

**10/10 verify PASS**（所有现有断言无回归）

---

## 六、清理

**已完成**：
- instrumentation 全部清理（deleteTweet 恢复原状）
- 10/10 verify 仍然 PASS
- 真实 X 端到端验证：unretweet 流程完整走通，1 条 retweet 成功撤销
- debug session 已 [CLOSED]
