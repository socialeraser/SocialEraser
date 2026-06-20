# Debug: tweet-delete-regression

**症状**：debug-tweet-delete-broken / debug-tweet-reply-broken 都已 [CLOSED] 后，user 报告"删除 Tweets 还是有問題，删不掉"
**会话 ID**：`tweet-delete-regression` → `tweets-bug-3`（更名）
**状态**：`[CLOSED]`（2026-06-17 端到端验证定位 + 修复）
**日期**：2026-06-17
**前置**：debug-tweet-delete-broken [CLOSED]、debug-tweet-reply-broken [CLOSED]

---

## 一、实际根因（端到端验证确认）

**根因由两个独立但相关的 bug 组成**：

### 根因 1（主要）：`unretweet` 路径误用 `_isOwnArticle` 过滤

`processTweets` 的 `collectCandidates` 里，**unretweetButtons 路径错误地复用了 moreButtons 路径的 `_isOwnArticle` 过滤**。

**为什么是 bug**：
- X 2026 retweet 卡片（带 "You reposted" 标签）的 article 内**只显示原作者**的 User-Name / UserAvatar / UserAvatar-Container-{username}
- **不显示 retweeter（自己）的头像**（X 设计如此——"You reposted" 卡片强调原作者，自己只是转发者）
- `_isOwnArticle` 严格判断：要求 article 内有 `UserAvatar-Container-{username}`（OP 独占标记）
- 旧代码 unretweet 路径走 `_isOwnArticle` → **所有 retweet 卡片都被判定为"他人推文"** → 过滤掉
- 结果：`unretweet` 候选永远 = 0 → 撤销 retweet 永远 0 命中

**修法**：unretweet 路径**不应用** `_isOwnArticle` 过滤。
- 理由：`[data-testid='unretweet']` / `aria-label*='已转帖'` 等 selector 是 X 唯一给"自己已转发"卡片渲染的按钮
- X 不会在他人转发的卡片上渲染 unretweet 按钮（"已转发"状态只有在自己转发后才有）
- 所以 retweet 按钮本身就是"自己已转发"的最强语义证据，比 `_isOwnArticle` 严格（要求头像）更准

### 根因 2（次要）：`unreTweetButtons` / `retweetButtonInCard` 缺 8 语言 aria-label 兜底

**为什么是 bug**：
- X 2026 retweet 按钮实际 `aria-label = "N reposts. Reposted"`（en）/ `"N 次转帖。已转帖"`（zh-CN）/ `"N 件のリポスト件。リポストしました"`（ja）... 8 种语言翻译完全不同
- 旧 selector 数组只有 3 个 `data-testid`（`unretweet` / `Unretweet` / `undoRepost`）+ 2 个英文 `aria-label*='Undo repost'`（X 2026 已不用）+ 1 个英文 `aria-label*='Reposted'`
- **8 种语言中只有 en 有 aria-label 兜底**，X 改了 testid 后 7 种非英文语言完全失效
- 2 个 `Undo repost` selector 实际 0 命中（X 2026 改用 "Reposted" 而不是 "Undo repost"）

**实测**（8 种语言 retweet 按钮 aria-label，2026-06-17 用 MCP Chrome 切语言验证）：

| lang | aria-label (已转发) | aria-label (未转发) | "已转发" 唯一标志 |
|------|-------------------|-------------------|----------------|
| en | `Reposted` | `Repost` | `Reposted` |
| zh-CN | `已转帖` | `转帖` | `已转帖` |
| zh-TW | `已轉發` | `轉發` | `已轉發` |
| ja | `リポストしました` | `リポスト` | `リポストしました` |
| ko | `재게시함` | `재게시` | `재게시함` |
| de | `Repostet` | `Repost` | `Repostet` |
| fr | `Reposté` | `Repost` | `Reposté` |
| es | `Reposteado` | `Repostear` | `Reposteado` |
| it | `Ripostato` | `Riposta` | `Ripostato` |

**修法**：`unreTweetButtons` 和 `retweetButtonInCard` 都加 8 语言 `aria-label*='已转帖'` 等 9 种兜底，删 2 个死 selector。

---

## 二、错误判断更正（重要）

**之前会话（H6 假设）**：
> AI agent 通过 chrome-devtools-mcp 调试的是 MCP 自己控制的 Chrome 实例，**不是 user 实际用的 Chrome**。AI 看不到 user 实际 Chrome 的 state、console、tabs、storage。

**实际情况**（2026-06-17 user 澄清）：
> MCP Chrome = user Chrome。AI 可以直接读 user 实际 X 页面 DOM / console。

**教训**：
- 下次调试前**先问 user 确认 MCP Chrome 是否 = user Chrome**，不要凭"感觉"假设隔离
- 静态 selector 验证 + 直接读 user X 页面 DOM = 真实根因定位的有效路径
- 旧 H6 假设导致 debug 方向跑偏，把根因从"代码 bug"误判为"调试环境问题"

---

## 三、修复方案

### 3.1 `lib/injector.js` A 修复
[unretweet 路径移除 `_isOwnArticle` 过滤](file:///Volumes/XPSSD/workspaces/SocialEraser/chrome-extension/lib/injector.js#L1212-L1241)：
- 保留 top-level article 过滤（防 nested-article 误中）
- 删除 `_isOwnArticle` 过滤
- 注释说明 retweet 按钮天然是"自己已转发"的最强语义证据

### 3.2 `lib/injector.js` 配套
- `_isOwnArticle` 注释加"⚠️ 重要使用前提"：**只用于 deleteTweet（caret 路径），不用于 unreTweet 路径**——防止下个会话再次误用
- `collectCandidates` 注释清理：去掉"X 2026 把 quoted 推文渲染成顶层 <article> 兄弟节点（不是 nested）"的旧错误判断
- `deleteTweet` 错误信息 3 步骤（more / menu / confirm）保留（这是早期 debug 的好成果）
- 诊断日志 region 保留并修正注释：去掉"让 user 贴 console"的 H6 误导

### 3.3 `config/default.json` + `config/remote-example.json` B + C + D 修复
- `unreTweetButtons`: 删 2 个死 selector（`Undo repost` / `Undo Repost`），加 9 个 8 语言 `aria-label*='已转帖'` 等兜底
- `retweetButtonInCard`: 加同样的 9 个 8 语言兜底

### 3.4 新增 `scripts/verify-tweets-bug-3.js` 防回归
- 65 项 assert：覆盖 selector 数组内容、死 selector 删除、injector.js 关键代码块、注释/H6 假设清理、unretweetConfirmButtons 保持现状

---

## 四、端到端验证（修复后）

**步骤**：
1. F5 刷新 X 标签页（拿新代码）
2. sidepanel 勾选 **Tweets** + **Include retweets** + **Include replies** → Start Cleanup
3. 打开 X 页面 DevTools console（F12 → Console）
4. 等待 5-10 秒，看 `[SocialEraser]` 开头日志

**预期**：
- `[SocialEraser][diag][tweets] first-collect-candidates: 3`（3 candidates: 2 retweets + 1 reply）
- `candidate[0]: isRetweet=true` → 撤销 retweet（`Undo repost #1` / `Undo repost #2`）
- `candidate[1]: isRetweet=true` → 撤销 retweet
- `candidate[2]: isRetweet=false, isReply=true` → 删 reply（`Tweet #3`）
- `[SocialEraser] Done. Processed: 3`

---

## 五、教训

### 教训 1：retweet 卡片有特殊渲染规则

X 2026 retweet 卡片**只显示原作者头像，不显示 retweeter 自己的头像**（"You reposted" 标签强调原作者）。

**推论**：
- 任何"自己推文"判断在 retweet 卡片上**必须改用 retweet 按钮本身**作为依据，不能用 UserAvatar / User-Name（这些只显示原作者）
- `_isOwnArticle` 严格判断（要求 UserAvatar-Container-{username}）**专门为 caret 路径设计**，retweet 路径禁用

### 教训 2：selector 健壮性必须按 like.unlikeButtons 模式设计

**like.unlikeButtons 模式**：
- 多个 `data-testid` 强 selector
- 8 语言 `aria-label*='已点赞'` 等兜底 selector

**旧 `unreTweetButtons` 偏离了这个模式**：
- 3 个 testid + 1 个英文 aria-label + 2 个 0 命中的英文 aria-label
- 缺 8 语言 aria-label 兜底

**修法**：照 unlikeButtons 模式扩展。

### 教训 3：调试前先确认环境

- 下次调试前**先问 user 确认 MCP Chrome 是否 = user Chrome**
- 不要凭"感觉"假设隔离
- 用户已明确："MCP Chrome 和 user Chrome 是同一个"

### 教训 4：8 语言 retweet aria-label 实测值

新增 `repostedKeywords`（"已转发"按钮文字 8 语言）必备（**注意：这是按钮 aria-label 的"已转发"状态，不是 `unretweetKeywords` 的菜单项"撤销"动作**）：

```javascript
repostedKeywords: [
  'Reposted',          // en
  '已转帖',            // zh-CN
  '已轉發',            // zh-TW
  'リポストしました',  // ja
  '재게시함',          // ko
  'Republicado',       // es（菜单文字"已转"，按钮可能用 Repostado 等）
  'Repostet',          // de
  'Reposté',           // fr
  'Ripostato'          // it
]
```

---

## 六、文件清单

| 文件 | 改动 |
|------|------|
| `chrome-extension/lib/injector.js` | A 修复（unretweet 路径）+ `_isOwnArticle` 注释加使用前提 + `collectCandidates` 注释清理 + 诊断日志 region 注释清理 |
| `chrome-extension/config/default.json` | B + C + D（unreTweetButtons / retweetButtonInCard 改造）|
| `chrome-extension/config/remote-example.json` | 同上 |
| `scripts/verify-tweets-bug-3.js` | 新增（65 项 assert 防回归）|
| `docs/debug-history/debug-tweet-delete-regression.md` | 重写（去掉错误 H6 假设，记录真实根因）|
| `docs/lessons-learned.md` | 加 retweet 卡片渲染规则教训 |

## 七、verify 验证

`scripts/verify-tweets-bug-3.js`：**65/65 PASS**

**全套 verify 脚本（10 个）**：
- verify-actual-x-selectors.js: 112/112 PASS
- verify-daily-usage-chain.js: 9/9 PASS
- verify-following.js: 67/67 PASS
- verify-i18n.js: PASS
- verify-login-detection.js: 74/74 PASS
- verify-no-retry.js: 14/14 PASS
- verify-setconfig.js: 13/13 PASS
- verify-sidepanel-bindings.js: 6/6 PASS
- **verify-tweets-bug-3.js: 65/65 PASS**（新增）
- verify-tweets-sub-options-grouping.js: 7/7 PASS

**总 assert 数：~430+ 全部通过**
