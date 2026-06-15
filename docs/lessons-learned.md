# X-Eraser 项目经验（Lessons Learned）

> 本文档记录开发过程中**经过实战检验的设计取舍**。目的：让后来人（包括 AI）一眼看清新功能应该走哪条路、避开哪些坑。
>
> 每条原则都附**症状 / 根因 / 修复 / 经验**四段，方便 case-by-case 复用。

---

## 一、核心原则（写代码前先看这五条）

### 1. **KISS > 过度设计**
一件事能用 5 行写完，就别写 50 行。每加一层「兜底机制」之前先问：**现有机制能不能 cover？** 加完文档里必须能写清楚**为什么需要这层**，否则大概率是冗余。

### 2. **状态变更走 sticky，不走 poll**
「登录态 / 配置已加载 / 用户已勾选」这类**不会频繁变化**的状态，**检测一次就缓存，唯一的翻转信号 = 用户的显式动作**。轮询越频繁，错位概率越高（X 改版、SPA 切换、lazy load 都会让 `querySelector` 偶发抓空）。

### 3. **状态机要三态：`null` / `true` / `false`**
- `null` = 尚未确认（让 UI 显示「检测中」，不预判 false 误导用户）
- `true` = 已确认（sticky，唯一翻转信号是显式 logout）
- `false` = 已确认（sticky，唯一翻转信号是显式 login）

不要用 `false` 表示「未检测」，会与「已确认 false」混淆。

### 4. **Selector 不可信，要语义兜底**
X 改 `data-testid` 是日常。任何 selector 列表里**至少要有一个语义锚点**（侧栏链接 href、URL path、ARIA role），不能全是 `data-testid='xxx'` 这种 X 随时会改的字符串。

### 5. **删代码是改进，不是倒退**
看到「兜底 retry」「silent polling」「老 API 兼容 shim」先问：**今天还需要吗？** 如果不需要，今天删比以后删便宜 10 倍。每次重构留下的兼容代码都会变成下一次重构的债务。

---

## 二、案例 1：登录态检测 — 从每 3s 轮询到 sticky 缓存

### 症状
- 用户在 `/home` 显示 "Logged in"
- SPA 跳转到 `/likes` 或 `/bookmarks`
- 侧栏闪一下 "Not logged in"（1-2s 后变回 "Logged in"）

### 根因
- `content.js` 每 3s 调 `checkLoginStatus()` 跑 8 个 `data-testid` selector
- SPA 切换时侧栏 DOM 处于「旧 DOM 已删、新 DOM 未渲染」的中间窗口
- 这次轮询抓到 null → 广播 `isLoggedIn: false` → 侧栏误判
- 下一轮 3s 后才恢复

### 修复
content.js 引入 `cachedIsLoggedIn` sticky 缓存：

```javascript
function getEffectiveLoginStatus() {
  if (!isTargetWebsite()) return false;

  // 唯一能翻转 true → false 的信号：用户进了登录页
  if (cachedIsLoggedIn === true) {
    if (checkIsLoginPage()) { cachedIsLoggedIn = false; return false; }
    return true;
  }
  if (checkIsLoginPage()) { cachedIsLoggedIn = false; return false; }
  if (checkLoginStatus()) { cachedIsLoggedIn = true; return true; }
  return null;  // 仍在检测
}
```

`sidepanel.js` 同步删 100 行：`startLoginCheck` 10s retry + silent 10s 轮询，改成一次 `getStatus` + `applyStatusFromContent` 统一处理。

### 经验
- **「减少检测频率」治标不治本**。从 3s 改成 30s 还是有同样问题。**正确的修法是让检测结果 sticky**，避免重复检测。
- **多上下文的状态同步，要靠广播而不是轮询**。`chrome.runtime.sendMessage({type: 'statusUpdate'})` 推一次，订阅者只关心变化。
- **Sticky 状态的唯一翻转信号 = 显式用户动作**。`checkIsLoginPage()`（URL 进 `/login`）就是显式登出，足够翻转。
- 静默过期（session 失效但 X 不跳 `/login`）是 sticky 的盲点，**故意不修**——false negative 代价 >> false positive。

### 回归测试
`scripts/verify-login-detection.js` 37 项：sticky 变量、状态机分支、sidepanel 简化（删 `startLoginCheck` / `LOGIN_CHECK_DURATION` / 10s silent 轮询）。

---

## 三、案例 2：cleanup 无脑重试 — 删了反而更快

### 症状
用户日志（22 秒内 4 次跑，全 0 processed）：
```
13:10:56 Cleanup started / Types: likes
13:10:58 End of likes / Done. Processed: 0
13:10:58 Retrying in 4 seconds...
13:11:02 Cleanup started / Types: likes        ← 第 2 次（多余）
13:11:03 End of likes / Done. Processed: 0
13:11:03 Switching to Bookmarks page...
13:11:07 Cleanup started / Types: bookmarks
13:11:09 End of bookmarks / Done. Processed: 0
13:11:09 Retrying in 4 seconds...
13:11:13 Cleanup started / Types: bookmarks   ← 第 4 次（多余）
13:11:14 End of bookmarks
```

### 根因
`runCleanupWithRetry(options, 2, isLast)` 无脑重试：任何时候 `processed === 0` 就 sleep 4s 再跑一次。

但**这个职责已经被 `waitForArticles(3000)` 接管了**：
- `waitForArticles` 用 `MutationObserver` 监听 article 元素出现
- 触发后立即启动 cleanup（早触发不等）
- 3s 兜底防止 observer 漏（晚触发不等满）

两层都在做「给 X 页面渲染时间」，叠加 = 2 次跑。

### 修复
删 `runCleanupWithRetry`，cleanup 本体只跑 1 次：
```javascript
// 旧
await runCleanupWithRetry(optionsForCurrent, 2, isLast);
// 新
await runCleanupOnce(optionsForCurrent, 1, isLast);
```

i18n 删 `retryingIn` 键 × 8 语言，verify-i18n 无需改（required 列表本来就没有这个 key）。

### 经验
- **两层机制做同一件事 = 隐性 bug 温床**。`waitForArticles` 负责等渲染，`runCleanupWithRetry` 也负责等渲染，叠加 = 用户看到的「跑两遍」。Review 时主动问：**「这个新加的机制和谁职责重叠？」**
- **「0 命中就 retry」是反模式**。0 命中可能是真的 0（用户没数据），也可能是没加载。区分这两种要靠「页面是否稳定」而不是「0 命中」。`waitForArticles` 已经告诉你页面是否稳定了。
- **`setTimeout(..., 4000)` 是代码异味**。在 retry 循环里硬编码 4s 大概率是「当时看 4s 够用」的心智模型，遇到「页面慢 / 网络卡 / 渲染超时」就会失效。修法是把「页面就绪」变成显式信号（MutationObserver / 事件）而不是 sleep。

### 回归测试
`scripts/verify-no-retry.js` 14 项：函数删除、调用点改写、`setTimeout(.., 4000)` 反模式硬约束（防被人加回来）、i18n 8 语言全部清理 `retryingIn`。

---

## 四、案例 3：sidepanel UI 元素漏绑 — 静默失效比报错更可怕

### 症状
- 侧边栏勾选「Tweets」主选项
- 下方**没有出现**「Include replies / Include retweets」子选项区块
- DevTools 也没有任何报错
- 用户不知道有这个功能，开发者也调不出问题

### 根因
给 tweets 加子选项时**只做了 3 件事里的 2 件**：
1. ✅ HTML 加了元素（`#tweets-options-section`、`#opt-include-replies`、`#opt-include-retweets`）
2. ✅ JS 加了引用函数（`updateTweetsOptionsVisibility`、`getTweetsOptions`）
3. ❌ **`els` 对象没绑** `getElementById`

```javascript
function updateTweetsOptionsVisibility() {
  var checked = !!(els.optTweets && els.optTweets.checked);  // ❌ els.optTweets 是 undefined
                                                          //    && 短路：checked = false
  if (els.tweetsOptionsSection) {                            // ❌ undefined，跳过
    els.tweetsOptionsSection.style.display = ...             // 永远不执行
  }
}
```

更阴险的是**根本没有抛错**：`els.optTweets` 是 `undefined`，`undefined && anything` 不会 throw，只是返回 `undefined`。**静默失效**。

### 修复
在 `afterLangLoaded()` 加 4 行绑定：

```javascript
// Tweets 子选项（必须在 afterLangLoaded 里绑，否则 updateTweetsOptionsVisibility / getTweetsOptions 全失效）
els.optTweets = document.getElementById('opt-tweets');
els.tweetsOptionsSection = document.getElementById('tweets-options-section');
els.optIncludeReplies = document.getElementById('opt-include-replies');
els.optIncludeRetweets = document.getElementById('opt-include-retweets');
```

### 经验
- **静默失效是 UI 调试最可怕的场景**。抛错至少有 stack trace + 红字，静默失效只能靠用户「感觉不对」反馈。本项目之前测了 N 轮没发现，正是因为**没人在 UI 上点开过 Tweets 子区块**。
- **「加 UI 元素 + 加 JS 引用 + 加 `els` 绑定」是 1:1:1 三件套**。少一步就静默失效，**所有 addElement 操作必须同时配对一个 els 绑定**。
- **静态扫描比测试更可靠**。靠点击测试会发现这个 bug，但成本高且不一定覆盖；**静态扫描 `els.<name>` 引用 ↔ `getElementById` 绑定** 是零成本、零漏报的硬护栏。
- **「光跑测试还不够」——必须测用户实际看到的 UI 状态**。每次加新 UI 元素，**人工在浏览器点一遍**作为发版前 checklist。

### 回归测试
`scripts/verify-sidepanel-bindings.js` 6 项：扫描所有 `els.<name>` 引用 ↔ `getElementById` 绑定 1:1 匹配。**新加元素忘绑 = 立即 fail**。

---

## 五、案例 4：dailyUsage 计数竞态 — 单飞链比 mutex 简单

### 症状
- 同一秒内多次 cleanup 进度回调触发 `incrementDailyUsage`
- 计数偶尔**漏写**：用户用了 30 条，chrome.storage 里只记 15
- 触发场景：`cleanupProgress` 高频发（每条一次） + `getDailyUsage` 同时在调

### 根因
`chrome.storage.local.get` → 修改 → `chrome.storage.local.set` 是**三步异步**，两步之间没有锁。多次并发调用时：

```
[A] get → 5
[B] get → 5
[A] set → 6   (5+1)
[B] set → 6   (5+1)   ← 第二次累加丢
```

**两次都 set(6)**，正确应该是 7。read-modify-write 在异步下不是原子的。

### 修复
所有 dailyUsage 读写都串到一条 Promise 链上：

```javascript
var _dailyUsageChain = Promise.resolve();

function incrementDailyUsage(count, callback) {
  _dailyUsageChain = _dailyUsageChain.then(function() {
    return new Promise(function(resolve) {
      chrome.storage.local.get(['dailyUsage'], function(result) {
        // ... read-modify-write 全在这一段里
        chrome.storage.local.set({ dailyUsage: data }, function() {
          if (callback) callback(data.used);   // resolve 之前触发
          resolve();
        });
      });
    });
  }).catch(function(err) {
    console.warn('[X-Eraser] incrementDailyUsage chain step failed:', err.message);
    if (callback) callback(null);   // 兜底不毒化整条链
  });
  return _dailyUsageChain;
}
```

### 经验
- **Promise 链是最朴素的 mutex**。不需要 async/await，不需要 lock 库，**`x = x.then(fn)` 串起来就是 FIFO 串行**。
- **`.catch` 兜底不毒化链**。如果中间一个 then throw，下游所有 then 都不会执行，**链断了 = 后续所有计数全丢**。每个 step 后必须 `.catch` 恢复链。
- **callback 必须在 resolve 之前触发**。`set` 回调里先 callback 再 resolve，调用方拿到的就是写后值；如果先 resolve，调用方可能在值写到 chrome.storage 之前就读到。
- **chrome.storage 的 callback 顺序不可靠**。`storage.local.set` 回调可能在 storage 还没持久化时就触发。**真正的一致性要靠 Promise 链来保证**，不能靠 callback 顺序。

---

## 六、案例 5：processTweets 增量设计 — 双模式扫描 + 语义检测

### 症状
- 用户希望在批量删推文时**同时**清理原创推文和 Retweet
- 但 X 上**两种内容的 UI 完全不同**：
  - 原创推文：点 `...` → Delete
  - Retweet：直接 `Undo repost` 按钮（无 confirm）
- 简单照搬 `processLikes` 模式**只删原创**会漏 retweet
- 想全删又怕把别人的转推也误删

### 根因 / 设计取舍
- X 用同一个 DOM 容器 `[data-testid='tweet']` 装两种内容，**DOM 层无法区分**
- 但**两种内容的交互入口完全不同**：原创是 `...` 菜单的子项，retweet 是固定的"Undo repost"按钮
- 所以**必须在 dispatch 阶段判定**——扫描时同时找两类按钮，按容器归属到对应 handler

### 修复（关键设计点）

```javascript
// 1. 双模式按钮扫描：扫 moreButtons（原创）+ unreTweetButtons（retweet）
for (let s = 0; s < moreSelectors.length; s++) {
  // 匹配到原创推文里的「...」
}
for (let s = 0; s < unretweetSelectors.length; s++) {
  // 匹配到 retweet 里的「Undo repost」
}

// 2. 按 isRetweet 标记 dispatch
for (const el of pending) {
  if (el._isRetweet) await this.unreTweet(el);
  else              await this.deleteTweet(el);
}

// 3. Pinned 检测：8 语言关键字正则（X 改版"置顶"翻译）
const PINNED_REGEX = /(置顶|置於|固定|ピン留め|고정|fixed|pinned)/i;
function isPinnedTweet(container) {
  return PINNED_REGEX.test(container.textContent);
}
```

### 经验
- **同形不同性的 UI 元素要在 dispatch 阶段判定**，不要在选择器层面硬分。`[data-testid='tweet']` 容器在 DOM 层是同一类，**业务层（原创 vs retweet）必须靠辅助 selector + 标记字段区分**。
- **多语言 UI 字符串要走 8 语言正则**。任何 `textContent.includes('X')` 的硬编码只覆盖 en/zh-CN，**8 语言必须各覆盖一遍**。本项目 `isPinnedTweet` 维护一组 8 语言关键字（`pinned` / `置顶` / `ピン留め` 等），新增语言时同步加。
- **每个 action 走独立 handler**。`deleteTweet` 和 `unreTweet` 内部流程差很大（前者 confirm 弹窗，后者无 confirm），**别合并**。合并后任何一个 X 改版都要牵动另一个。
- **删除 `processItems` 里的 generic 循环**。旧的 `for (let i = 0; i < items.length; i++)` 通用循环理论上能 handle tweets，**实际上用 processBookmarks 模式 + 专用 processTweets 更清楚**。**通用代码 + 特定 patch 是腐烂的根源**。

---

## 七、案例 6：setConfig 字段级合并 — 不要用 `{...default, ...remote}` 全替换

### 症状
- 远程 config 升级 v1.0.0 → v1.1.0，新增 `selectors.following.unfollowButtons` 字段（之前是 `unfollowButton` 字符串）
- 用户本地缓存还是 v1.0.0 旧 config
- 全替换模式 `{...DEFAULT, ...remote}` 看似 OK，但**远程 config 缺某些字段时（server 端删了/漏发），会**整块替换 DEFAULT 的整块
- 后果：本地有 30 个 fallback 选择器，远程 config 一覆盖就剩 2 个

### 根因
简单 spread 假设**两边 schema 完全相同**。但远程 config 经常**只发增量字段**（节省 CDN 流量），缺字段是常态，**不是异常**。

### 修复
手写 `_mergeConfig`，**逐层浅合并**：

```javascript
_mergeConfig(defaultConfig, remoteConfig) {
  const merged = {
    ...defaultConfig,
    ...remoteConfig,
    selectors: {
      ...defaultConfig.selectors,         // ← 关键：DEFAULT 全保留
      ...remoteConfig.selectors           // ← 远程只覆盖有的
    }
  };

  if (remoteConfig.selectors?.login?.checkElements) {
    merged.selectors.login = {
      ...defaultConfig.selectors.login,
      ...remoteConfig.selectors.login
    };
  }

  // 数组字段不能浅合并（会拼起来），数组直接用 remote 整个覆盖
  // 这是字段级合并的边界 case，要在注释里写明
  return merged;
}
```

### 经验
- **`{...default, ...remote}` 是「全替换」的别名**。在 schema 演进场景下，**字段缺一就丢一片**。
- **「字段级合并」比「schema 完全匹配」健壮**。远程 config 发增量、本地有 fallback，**这是分布式配置的常态**，不是 corner case。
- **数组字段不能浅合并**。两个 `[1,2,3]` + `[4,5,6]` 合并成 `[1,2,3,4,5,6]` 通常是错的（无意义拼接）。**数组字段必须在 `_mergeConfig` 显式处理**（要么 remote 覆盖，要么 merge 单独算法）。
- **深一层浅拷贝是底线**。`{...default.selectors, ...remote.selectors}` 是浅合并；**对象字段的值是引用共享**，修改一处会污染两边。**数组/对象字段要深一层**。本项目 verify-setconfig.js 有 13 项 assert 防回归。

---

## 八、案例 7：X 改版后 selector 失效 — 验证真实 DOM 而不是想当然

### 症状
- 用户跑 tweets cleanup，看到 `[diagnose] more matches: 3`（以为是成功信号）
- `Done. Processed: 0` —— 0 删除，0 撤销
- 用户在 sidepanel 日志前 5-10 行**根本看不出**问题在哪

### 根因
X 在 2024-2026 改版了 3 类关键 selector，**默默失效**：

| 位置 | X 旧版 | X 新版（实际 DOM）|
|------|--------|---------------|
| Delete 菜单项 | `<a data-testid="Delete">` | `<div role="menuitem">` **无 testid**（只有文字 "Delete"）|
| 确认弹框按钮 | 业务专属 testid（`Delete` / `unretweet`）| 通用 `confirmationSheet{Confirm,Cancel}` |
| Undo repost 菜单项 | 直接按钮 | 菜单项 `data-testid="unretweetConfirm"` |

**3 个静默失败叠加**：
1. `deleteButton: "[data-testid='Delete']"` —— 0 命中，但 `waitForElement` 等 3s 后返回 null 不报错
2. `unreTweetButtons` 漏 `unretweetConfirm` —— retweet 卡片 0 撤销
3. `unreTweet` 1 步 click —— X 改版后是 2 步（点 retweet 按钮 → 菜单 → 点 unretweetConfirm）

### 修复
1. `DEFAULT_SELECTORS.tweet.deleteButton = null`（保留字段仅用于字段级合并兼容，运行时不用）
2. 新增 `waitForMenuItemByText(keywords, timeout)` 通用 helper —— 按 i18n 文字匹配 `role="menuitem"`
3. `unreTweetButtons` 加 `[data-testid='unretweetConfirm']` 作首项
4. `unreTweet` 改 2 步：点 retweet 按钮（container 内） → wait `[data-testid="unretweetConfirm"]`（document 级）→ click

### 经验
- **X 改版有 3 类规律**：testid 改 / 业务专属→通用 / 菜单项无 testid。每类都要在 `verify-actual-x-selectors.js` 加一行注释锁住
- **"8 语言文字匹配"是 X 改版后的最后兜底**——所有菜单项都该按角色 + 文字内容找，不要全靠 testid
- **`waitForMenuItemByText` 是通用 helper**，未来任何"无 testid 菜单项"都能复用
- **HTML 真相比 selector 想象更可靠**。让用户保存 5 份 HTML 源码，比自动化测试 10 次都准

### 回归测试
`scripts/verify-actual-x-selectors.js` — **31 项** assert，**7 个角度**锁住：

| # | 角度 | 关键断言 |
|---|------|----------|
| 1 | with_replies 推文卡片数量 | tweet = caret = retweet = like = bookmark（X 一致性）|
| 2 | caret = aria-label="More" 同一个元素 | combined pattern 数量 = caret 数量 |
| 3 | 自己 More 菜单的 Delete | ">Delete<" 文字 ≥ 1，**`data-testid="Delete"` = 0** |
| 4 | Delete 确认弹框 | `confirmationSheetConfirm` + `confirmationSheetCancel` 各 1，"Delete post?" 标题存在 |
| 5 | 转发 Undo 菜单 | `unretweetConfirm` 在 `role="menuitem"` 里 |
| 6 | 回复的 More 弹框 | Delete 文字 ≥ 1，**`data-testid="Delete"` = 0** |
| 7 | injector.js 源码 | `deleteButton !== "[data-testid='Delete']"` + `unretweetConfirm` 在 `unreTweetButtons` 首项 + `deleteTweet` 用 `waitForMenuItemByText` |

**关键防回归点**：第 7 项直接 grep 源码，**防止有人改回去**用旧的 `[data-testid='Delete']` selector。

---

## 九、反模式（看到就该警觉）

| 反模式 | 案例 | 为什么坏 |
|--------|------|----------|
| **多层机制做同一件事** | `waitForArticles` + `runCleanupWithRetry` 都等渲染 | 叠加成 2 次跑，浪费 + 困惑 |
| **用 selector 频繁 poll 状态** | 8 个 testid 每 3s 跑一次 | X 改版 / SPA 切换 / lazy load 都会让 selector 偶发抓空，sticky 才是正解 |
| **`processed === 0` 就 retry** | 0 likes 用户被重试 1 次 | 0 可能是真 0，无法区分。retry 还掩盖了 selector 失效的 bug |
| **复杂 retry 循环（10s × 1s）** | `startLoginCheck` 跑了 100 行 | 掩盖真问题（页面没加载），不如让 `waitForArticles` 这种显式信号来管 |
| **用 silent mode 静默更新 state** | sidepanel 10s silent 轮询 | 让 UI 和 state 短暂错位，调试时极难定位 |
| **state 预判 false** | sidepanel 初始 `isLoggedIn: false` | 在「检测中」阶段就报「未登录」，误导用户。应该用 `null` 表示未知 |
| **留「以后可能用到」的代码** | 旧 `runCleanupWithRetry` 注释说「保留以备扩展」 | YAGNI。今天删了，3 个月后需要时从 git 找比维护兼容代码便宜 |
| **`setTimeout(4000)` 当默认值** | retry sleep 4s | 心智模型脆弱。改用 MutationObserver / 事件 / Promise 让「就绪」变成显式信号 |
| **加 UI 元素忘绑 `els.xxx`** | tweets 子选项 4 个元素漏绑 → 子区块永远不显示 | UI 元素和 JS 引用是 1:1 关系；用 `verify-sidepanel-bindings.js` 静态扫描强制锁定 |
| **只备 1 个 selector、不验证真实 DOM** | `deleteButton: "[data-testid='Delete']"` 0 命中但代码不报错 | X 改版后默默失效，整个 delete 流程 0 删除；用 `verify-actual-x-selectors.js` 把 HTML 真相 + selector 决策 1:1 锁定 |
| **菜单项只靠 testid 找** | 旧版 `<a data-testid="Delete">` → 新版 `<div role="menuitem">` 无 testid | X 改版后菜单项普遍去掉 testid；按 `role="menuitem"` + 8 语言文字匹配是最后兜底 |
| **自动化浏览器 ≠ 真实浏览器** | 以为换 puppeteer-core / 系统 Chrome 能绕过 X/Google 登录墙 | X/Google 识别所有 CDP 控制的 Chrome；3 次变种尝试后必须**停下来**承认受限 |

---

## 十、防御性约束（写到 test 里的硬护栏）

每修一次 bug，都要在 `scripts/verify-*.js` 加一个测试断言这个 bug 不会再回来。本项目已经积累的 **9 个 verify 脚本**共 **420+ assert**：

- `verify-login-detection.js` 37 项：sticky 状态机 + selector 健壮性
- `verify-no-retry.js` 14 项：cleanup 不再重试 + `setTimeout(.., 4000)` 反模式硬约束
- `verify-following.js` 70 项：流程回归（含 multi-type 跳转）
- `verify-i18n.js` 240 项：8 语言 × 30 key 完整性
- `verify-setconfig.js` 13 项：字段级合并 + 数组不拼接
- `check-schema.js` 4 项：selector schema 对齐（`moreButton` → `moreButtons` 升级不漏）
- `verify-sidepanel-bindings.js` 6 项：sidepanel.js 所有 `els.<name>` 引用 ↔ `getElementById` 绑定 1:1 锁定（防加新元素忘绑）
- `verify-daily-usage-chain.js` 9 项：dailyUsage 单飞串行链（防 read-modify-write 竞态 + .catch 毒化链 + callback 顺序）
- `verify-tweets-sub-options-grouping.js` 7 项：Tweets 子项展开时联动分割线
- **`verify-actual-x-selectors.js` 31 项**（**新**）：用真实 X 页面 HTML 锁定 selector 决策（防 X 改版后 selector 默默失效）

**写完一段代码就写一段 assert**。新机制加进来 = 新 assert 加进来。**Assert 比注释更长寿**——注释会被忽略，assert 不会。

**典型对应关系**（每个案例都至少绑一个 verify 脚本）：

| 案例 | 防回归脚本 |
|------|-----------|
| 案例 1 登录态 sticky | `verify-login-detection.js` 37 项 |
| 案例 2 cleanup 去重 | `verify-no-retry.js` 14 项（含 `setTimeout(.., 4000)` 反模式硬约束）|
| 案例 3 sidepanel 漏绑 | `verify-sidepanel-bindings.js` 6 项 |
| 案例 4 dailyUsage race condition | `verify-daily-usage-chain.js` 9 项 |
| 案例 5 processTweets 双模式 | `verify-following.js` + `check-schema.js`（覆盖 moreButtons 数组升级）|
| 案例 6 setConfig 字段合并 | `verify-setconfig.js` 13 项 |
| **案例 7 X 改版 selector 失效** | **`verify-actual-x-selectors.js` 31 项**（含 HTML 真相 + 源码 grep 双重锁）|

---

## 十一、给 AI 协作的提醒

如果你（AI）看到本项目代码，请按这个优先级判断：

1. **能不能不写？** 这个功能真的需要吗？有没有更简单的实现？
2. **现有机制能不能复用？** 不要新加机制做和别人一样的事
3. **状态变更能不能 sticky？** 不要默认加 setInterval poll
4. **Selector 列表里有没有语义锚点？** 不能全是 X 改版就废的 testid
5. **写完代码有没有加 assert？** 没有的话，bug 下次还会回来
6. **selector 决策有没有 HTML 真相背书？** 静态分析 ≠ 真实 DOM，让用户提供 saved HTML 比 AI 自己想更可靠
7. **遇到反爬虫环境（X/Google 登录墙）别硬试**——3 次变种尝试后停下来，让用户提供真机日志或 HTML 源码

完成一次改动后**回头看一遍代码**——如果能用 5 行说清楚这个改动在做什么，就 pass；如果需要 50 行注释才能说清楚，**大概率是过度设计**。

---

## 十二、案例 8：AI 沙盒的墙 —— puppeteer-mcp 跑不通，chrome-devtools-mcp 跑得通

### 症状
- 想让 AI 直接读用户登录态的 X 页面，验证 selector 是否真能命中
- 装 puppeteer-mcp，反复调 `navigate` 都失败：
  - 没装 Chrome 131 → 错误 `Could not find Chrome (ver. 131.0.6778.204)`
  - 装 Chrome 131 → `npm error EPERM`（缓存目录被 root 锁）
  - 改用 `launchOptions.executablePath` 指向系统 Chrome 149 → `options.filter is not a function`
- 让用户**自己**打开带 `--remote-debugging-port=9222` 的 Chrome，再用 Node 连 9222 → `ECONNREFUSED`
- 用户能看到 Chrome 进程在跑（`ps aux` 能看到 `--remote-debugging-port=9222`），但我这边就是连不上
- 折腾 5 轮后用户提醒：「你装个 chrome-devtools-mcp 不就行了？」 —— **一次就跑通**

### 根因
- **AI 跑的进程在沙盒里**，跟用户日常 Mac **不在同一个网络空间**
- puppeteer-mcp 是**在 AI 沙盒里启动的**：
  - 它启动的 Chrome 也在沙盒里
  - 沙盒里的 Chrome 没有用户的登录 cookie
  - 想让沙盒里的 Chrome 连用户 Mac 上的 Chrome 9222 → 网络隔离 → `ECONNREFUSED`
- chrome-devtools-mcp 是**装在用户 Mac 上的**：
  - 它直接连用户 Mac 上的 Chrome 9222
  - 不经过 AI 沙盒 → 没有网络隔离
  - 用户 Chrome 已经登录 → 它直接用登录态

### 修复
**用户**装 chrome-devtools-mcp：

```bash
claude mcp add chrome-devtools npx chrome-devtools-mcp@latest
```

（具体命令以 chrome-devtools-mcp 官方文档为准）。装完后 **AI 端不需要任何特殊配置**，直接用 `mcp__chrome-devtools__*` 工具。

### 经验

**核心原则**：**「AI 沙盒里的工具 ≠ 用户机器上的工具」**

| 能力 | 沙盒里能做的 | 用户机器上能做的 |
|------|-------------|----------------|
| 读文件 | ✓ 用户显式分享过的 | ✓ 整个文件系统 |
| 跑测试 | ✓ 单元测试 | ✓ 集成测试（需要登录态的）|
| 控制浏览器 | △ 只能起新的、无登录态 | ✓ 直接接已有 Chrome、有登录态 |
| 写文件 | △ 受限（不能动系统文件）| ✓ 完整 |
| 跨网络 | ✗ 受限 | ✓ 完整 |

**4 条新约束**：

1. **遇到「需要登录态」的需求，先想 chrome-devtools-mcp 类的「跑在用户端」的工具，不要默认用 puppeteer-mcp**
2. **AI 沙盒里能「装」的不一定能在沙盒里「用」** —— 装 Chrome 131 失败、`ECONNREFUSED` 失败、各种 npm EPERM 失败都是同一根因
3. **3 次变种尝试失败后必须停**，问用户有没有「在用户机器上跑」的方案。**用户其实往往比 AI 更懂生态**
4. **不要预设「AI 能直接干」** —— AI 干很多事需要**用户装东西**。把这个事实摆到台面上，比反复在沙盒里撞墙更高效

### AI 协作反模式（新加）

| 反模式 | 表现 | 后果 |
|--------|------|------|
| **「沙盒里能跑通就行」** | 只试沙盒内的工具 | 用户需求满足不了（要登录态、要用户数据）|
| **「用我能用的工具硬试」** | 反复试 puppeteer-mcp 不同 launchOptions | 浪费 5 轮，最后用户给方案 |
| **「我自己也能装上」** | 试图用 npm 装到沙盒里 | 撞 npm 缓存权限墙 |
| **「生态就这一种工具」** | 不知道有 chrome-devtools-mcp | 卡死在已知工具上 |

**对 AI 的提醒**：

- 知识库是「海量的」，但**思维不要被自己已知的 1-2 个工具框死**
- 听到用户说「你装个 X 不就行了」，**先别犟**，X 也许真的能解决
- 「AI 沙盒」和「用户机器」是两个世界，**很多事只有用户能启动**

### 相关 verify / 文档
- 无新增 verify 脚本（这是工具选型问题，不是代码 bug）
- `docs/lessons-learned.md` 第十一节「给 AI 协作的提醒」同步加第 8 条：「需要登录态的需求优先用 chrome-devtools-mcp 等跑在用户端的 MCP」

---

## 十三、案例 9：菜单项数 = reply 标识（chrome-devtools-mcp 实战发现）

### 症状
- 用户在 xiangping5211 profile /with_replies 页面有 3 条推文：1 原创 + 1 转发 + 1 回复
- 旧版 `isReplyTweet(container)` **只**查 `socialContext` 元素的 textContent
- 实战发现：「I like SpaceX」（**回复**）的 article **没有** `socialContext` 元素（X 在用户自己 profile 视图隐藏）
- 后果：旧版 `isReplyTweet` 返回 false → 跟 includeReplies=false 不匹配 → 误删 reply

### 根因
- X 的 DOM 在不同视图（home timeline / profile / search）下展示**不一致**
- 「Replying to」标注主要在 home timeline（socialContext 里）显示，**profile /with_replies 不显示**
- 旧实现依赖单一 DOM 标记（socialContext），碰到不显示的视图就漏

### 修复
**1. 双层检测（`isReplyTweet` 重构）**：
```javascript
isReplyTweet(container) {
  if (!container) return false;
  // 1) 优先查 socialContext（旧行为，X 旧版/部分视图仍会显示）
  var socialContext = container.querySelector("[data-testid='socialContext']");
  if (socialContext) {
    var scText = (socialContext.textContent || '').toLowerCase();
    if (/replying to|回复|回覆|返信|답장|respondiendo a|antworten|répondre|rispondendo a/i.test(scText)) {
      return true;
    }
  }
  // 2) 兜底：扫描整个 article textContent
  //    适用于：X 不显示 socialContext，但 reply 链接 text 仍带这些词
  var fullText = (container.textContent || '').toLowerCase();
  return /replying to|in reply to|回复\s*@|回覆\s*@|返信先|답장\s*@/i.test(fullText);
}
```

**2. 第二种 reply 标识（菜单项数差异）—— 真机实战发现 2026-06-15**：

打开 caret 菜单后数菜单项数：
- 原创推文菜单 = **11 项**（含 `Edit` / `Add/remove content disclosure` / `Change who can reply`）
- reply 推文菜单 = **8 项**（少这 3 项）
- **差 3 项 = reply 标识**

> 这是 100% 可靠的标识，但**只能在 click 之后**数，作为二次校验用。

**3. verify 脚本加 baseline 锁**（`verify-actual-x-selectors.js` 第 10 节）：
- 原创菜单项数 ≥ 10
- reply 菜单项数 7-9
- 差值 = 3（**这个相对差比绝对数字更稳**）

### 经验

| 经验 | 体现 |
|------|------|
| **DOM 在不同视图下展示不一致** | profile / home timeline / search 渲染策略不同，selector 必须在多个视图都验证 |
| **多标识联合检测 = 更稳** | 单一 DOM 标记易漏，socialContext + 全文搜 + 菜单项数（3 路）联合才能扛住 X 改版 |
| **真机验证胜过 saved HTML** | saved HTML 是「某一时刻的快照」，可能已过期；用 chrome-devtools-mcp 实时看才是真相 |
| **「相对差」比「绝对数字」更稳** | 11 vs 8 容易变（X 改版加项），但「差 3 项」这个规律不容易变 |

### 回归测试
- `verify-actual-x-selectors.js` 第 10 节：3 路标识 + 差值 3 = 9 项新 assert
- 实战 E2E 流程已通过：删 3 条（原创 + 转发 + 回复）全部成功，无误删

### 给 AI 的提醒
- 「用户自己看 saved HTML 告诉我」是**次优解**，「我实时通过 MCP 看」是**最优解**
- 修 selector bug 时，**至少 2 路独立检测**（不要单点依赖）
- 「X 改版」是常态，**baseline 用相对差锁**而不是绝对数字

---

## 十四、MCP 浏览器启动步骤（沉淀给以后的项目用）

> 这是从「沙盒连不上 Chrome」到「chrome-devtools-mcp 跑通」全过程的**可复用操作手册**。
> 任何需要登录态、要操作用户浏览器、要看真实 DOM 的项目，**都可以按这个流程来**。

### 前置条件
- Mac / Linux 桌面（Windows 类似）
- 用户已登录目标网站（X / Facebook / 任何要登录态的）
- Node 22.12.0+（很多新 MCP 要求）

### 步骤

#### 1. 装 nvm + Node 22.12.0（如果还没装）

```bash
# 装 nvm（如果连不上 GitHub，用 gitee 镜像）
git clone https://gitee.com/mirrors/nvm.git ~/.nvm
cd ~/.nvm && git checkout v0.40.1

# 加到 ~/.bash_profile（或 ~/.zshrc）
echo '
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
' >> ~/.bash_profile

# 重开终端
nvm install 22.12.0
nvm use 22.12.0
node -v   # 确认 v22.12.0+
```

#### 2. 装目标 MCP

```bash
# 用 nvm 装的 node 跑 npm（避免 Trae/VSCode 内置 node 版本太旧）
/Users/你的用户名/.nvm/versions/node/v22.12.0/bin/npm install -g chrome-devtools-mcp
```

> 注意：npm 全局 prefix 可能被改到项目盘（`/Volumes/.../.npm-global/`），
> 装完用 `/Users/你的用户名/.nvm/versions/node/v22.12.0/bin/npm root -g` 查真实路径

#### 3. 找入口文件路径

```bash
cat /真实路径/lib/node_modules/chrome-devtools-mcp/package.json | grep -A 2 '"bin"'
```

输出大概：
```json
"bin": {
  "chrome-devtools-mcp": "./build/src/bin/chrome-devtools-mcp.js"
}
```

记下完整路径：
```
/Volumes/.../lib/node_modules/chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js
```

#### 4. 写 Trae / VSCode MCP 配置

`~/.trae-cn/mcp_servers.json` 或 Trae 设置 → MCP → 手动配置：

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "/Users/你的用户名/.nvm/versions/node/v22.12.0/bin/node",
      "args": [
        "/Volumes/.../lib/node_modules/chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js",
        "--browserUrl=http://localhost:9222"
      ]
    }
  }
}
```

**关键 3 点**：
1. `command` = nvm node 绝对路径（**不是** npx，避免 PATH 撞 Trae 内置 node）
2. `args[0]` = 入口 JS 绝对路径
3. `args[1]` = `--browserUrl=http://localhost:9222`（**必填**，连你已登录的 Chrome）

#### 5. 启动 Chrome 带调试端口

```bash
# 完全退出 Chrome
pkill -9 "Google Chrome" 2>/dev/null
sleep 2

# 用独立 user-data-dir 启动（避开 macOS 集成）
mkdir -p /tmp/eraser-chrome-profile
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 \
  --user-data-dir=/tmp/eraser-chrome-profile \
  > /tmp/chrome.log 2>&1 &

# 验证
sleep 3
lsof -iTCP:9222 -sTCP:LISTEN
```

看到 Chrome 进程在监听 9222 就行。

#### 6. 重启 Trae / VSCode

完全退出 → 重开 → 工具列表里看到 `mcp__chrome-devtools__*` 一组新工具 = 装好。

#### 7. 用 MCP 自助干活

直接告诉 AI：
- 「去 x.com/某账号/with_replies 抓真实 DOM」
- 「分析这个菜单有几项」
- 「点这个按钮，看会弹什么」

AI 跑完给你结果。

### 关键踩坑点（之前都遇到过）

| 坑 | 解决 |
|----|------|
| node 版本太旧（< 22.12.0）| 用 nvm 装新版，**command 用绝对路径** |
| 装到 nvm 默认目录但找不到入口 | `npm root -g` 看真实 prefix，**入口路径以这个为准** |
| Chrome 没带调试端口启动 | 必须先 `pkill -9` 杀干净的 Chrome 实例，再 `&` 后台启动 |
| Chrome 双击打开（没参数），9222 不监听 | 看 `lsof -iTCP:9222 -sTCP:LISTEN`，**没监听就是没启对** |
| MCP 默认启无头 Chrome（拿不到登录态）| **必填** `--browserUrl=http://localhost:9222` 参数 |
| 沙盒里 curl localhost:9222 失败 | 正常，**那堵墙跨不过**，MCP 必须跑在用户机器上 |
| node 命令撞 Trae 内置 node | `command` 用 nvm node 绝对路径，**别用 npx** |
| **脚本必须跑在用户机器上，不是 AI 沙盒** | Trae 的 terminal 跟 Mac 桌面不在同进程空间，`pkill / lsof / 启动 Chrome` 都跨不过去 | 启动类脚本（kill 进程 / 起 GUI / 查端口）**只让用户在 Mac 终端跑**，AI 沙盒只跑只读 / 编译类 |

### 适用范围

- ✅ 看登录态的 X / Facebook / Instagram DOM
- ✅ 自动化点按钮、填表单、抓数据
- ✅ 端到端测试 Web 应用
- ✅ 任何「要登录态、要用户数据」的需求

- ❌ 沙盒内独立爬虫（登录态过不去）
- ❌ 绕过 X / Google 反爬虫（做不到）
- ❌ 跨用户/跨账号（每个 MCP 只能连一个 Chrome 实例）
