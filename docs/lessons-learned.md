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

## 八、反模式（看到就该警觉）

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

---

## 九、防御性约束（写到 test 里的硬护栏）

每修一次 bug，都要在 `scripts/verify-*.js` 加一个测试断言这个 bug 不会再回来。本项目已经积累的 6 个 verify 脚本共 **380+ assert**：

- `verify-login-detection.js` 37 项：sticky 状态机 + selector 健壮性
- `verify-no-retry.js` 14 项：cleanup 不再重试 + `setTimeout(.., 4000)` 反模式硬约束
- `verify-following.js` 70 项：流程回归（含 multi-type 跳转）
- `verify-i18n.js` 240 项：8 语言 × 30 key 完整性
- `verify-setconfig.js` 13 项：字段级合并 + 数组不拼接
- `check-schema.js` 4 项：selector schema 对齐（`moreButton` → `moreButtons` 升级不漏）
- `verify-sidepanel-bindings.js` 6 项：sidepanel.js 所有 `els.<name>` 引用 ↔ `getElementById` 绑定 1:1 锁定（防加新元素忘绑）

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

---

## 十、给 AI 协作的提醒

如果你（AI）看到本项目代码，请按这个优先级判断：

1. **能不能不写？** 这个功能真的需要吗？有没有更简单的实现？
2. **现有机制能不能复用？** 不要新加机制做和别人一样的事
3. **状态变更能不能 sticky？** 不要默认加 setInterval poll
4. **Selector 列表里有没有语义锚点？** 不能全是 X 改版就废的 testid
5. **写完代码有没有加 assert？** 没有的话，bug 下次还会回来

完成一次改动后**回头看一遍代码**——如果能用 5 行说清楚这个改动在做什么，就 pass；如果需要 50 行注释才能说清楚，**大概率是过度设计**。
