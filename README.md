# X-Eraser

跨平台 X/Twitter 批量清理工具。

## 当前阶段：Chrome Extension (开发中)

### 已完成功能

| 功能 | 状态 | 说明 |
|------|------|------|
| 常驻侧边栏 | ✅ | Chrome Side Panel，不消失 |
| 检测X网站 | ✅ | 自动识别 x.com / twitter.com |
| 检测登录状态 | ✅ | 多语言支持 |
| 批量删除选项 | ✅ | 推文/点赞/书签/关注（私信暂不支持，详见下方说明）|
| 日期/关键字筛选 | ✅ | UI + 逻辑均已实现 |
| 实时进度显示 | ✅ | 进度条 + 日志动画 |
| 暂停/停止/继续 | ✅ | 状态机控制 |
| 8种语言支持 | ✅ | en/zh-CN/zh-TW/ja/ko/es/de/fr |
| 远程配置 | ✅ | 支持远程更新选择器 |
| 刷新配置按钮 | ✅ | 右上角手动刷新 |
| 底部信任文案 | ✅ | 突出显示隐私承诺 |
| DOM 操作引擎 | ✅ | 健壮的删除实现 |
| 无后端设计 | ✅ | 纯前端，无需服务器 |
| **批量取关 Following** | ✅ | 复用 processBookmarks 模式，cellInnerDiv 行 + 独立 confirm 选择器 |
| **多 type 并行 session** | ✅ | 总预算共享（不再每 type 重复算额度）|
| **无进展超时保护** | ✅ | 30s 无进展即停（防 X 改版死循环）|
| **i18n 多上下文同步** | ✅ | storage.onChanged 跨 context 广播语言切换 |
| **option-count 状态机** | ✅ | pending（灰 spinner）→ processing（蓝 spinner）→ done（数字）|
| **status-card 自动收起** | ✅ | 状态正常时延迟 1s 平滑收起，异常立即展开 |
| **登录态检测抗 SPA 跳转** | ✅ | **Sticky 状态机**：content.js 维护 `cachedIsLoggedIn` 缓存，一次正向检测后锁住，唯一翻转信号是 `checkIsLoginPage()`（URL 进登录页）；selector 用侧栏稳定元素（`/compose/post`、`/i/bookmarks`、`AppTabBar_*`）兜底；删除侧栏 10s retry 循环和 silent 轮询（这两层是误判源头）；新增 `scripts/verify-login-detection.js` 37 assert 防回归 |
| **cleanup 不再无脑重试** | ✅ | 删除 `runCleanupWithRetry`（0 命中时无条件 sleep 4s 再跑一遍），与 `waitForArticles(3000)` 职责重复；改为 cleanup 本体只跑 1 次。修复前 0 likes 用户每页跑 2 次（共 4 次跨 likes+bookmarks，22s 浪费 8s）；新增 `scripts/verify-no-retry.js` 14 assert 防回归 |
| **sidepanel 元素绑定断言** | ✅ | 加新 UI 元素时强制要求在 `afterLangLoaded()` 绑 `els.xxx`，否则 `updateTweetsOptionsVisibility / getTweetsOptions` 等函数会**静默失效**（之前 tweets 子选项 4 个新元素漏绑，子选项永远不显示）。新增 `scripts/verify-sidepanel-bindings.js` 6 assert 扫描所有 `els.<name>` 引用比对绑定点 |
| **dailyUsage race condition 修复** | ✅ | 单飞串行链（`_dailyUsageChain`）串行化 read-modify-write；`.catch` 兜底不毒化链；callback 在 resolve 之前触发保证写后值 |
| **Schema 对齐（DEFAULT_SELECTORS）** | ✅ | `like.unlikeButtons`（4 个）+ `bookmark.removeButtons`（6 个）已对齐到 `config/*.json`；新增 `scripts/check-schema.js` 自动扫描防止回归 |
| **setConfig 字段级合并** | ✅ | 远程 config 缺键时不再整个块替换 DEFAULT，而是按字段合并；数组/对象字段深一层浅拷贝避免污染；新增 `scripts/verify-setconfig.js` 13 assert 单测 |
| **批量删除推文（Tweets）** | ✅ | 引擎 `processTweets` + 原创删推文 + Retweet 撤销 repost；含回复开关 + Pinned 检测跳过；sidepanel 子选项可让用户选"含/不含回复"和"含/不含 retweet" |

### 暂不支持的功能

| 功能 | 状态 | 说明 |
|------|------|------|
| 批量删除 Messages（私信）| ❌ | X 使用 `event.isTrusted` 验证用户输入，content script 派发的 JS 事件（`dispatchEvent` / `mousedown`+`contextmenu` 等序列）全部被 X 拒绝。详见下方"为何 Messages 不支持" |
| 实际删除操作 | 🔄 | 核心引擎已就绪，端到端真机测试中 |
| 批量删除推文 | 🔄 | `deleteTweet` 方法已存在，缺 `getTweetsPageURL` 跳转和 tweets 专用配置 |
| 免费额度 50/天 | 🔄 | 计数器已 per-type 化，弹窗未实现 |
| 订阅系统 Creem | 🔄 | 架构待设计 |
| Android App | 🔄 | Capacitor 工程已就绪，UI 待移植 |

### 待开发功能

| 功能 | 优先级 | 说明 |
|------|--------|------|
| 订阅系统 Creem | P1 | 付费会员解锁无限额度 + 速度加成 |
| Android App | P2 | Capacitor 复用 injector.js 引擎 |
| iOS App | P2 | Capacitor 复用 injector.js 引擎 |
| 真实数据接入 option-count | P3 | 替代当前的"本次处理条数"语义，从 profile 头部读取 |
| 高级过滤规则 | P3 | 正则、域名白名单、批量规则预设 |

### 已知问题

| 问题 | 优先级 | 说明 |
|------|--------|------|
| Following confirm 弹窗选择器依赖 X 当前 UI | P2 | `[data-testid='confirmationSheetConfirm']` 可能随 X 改版失效，remote config 可热修 |
| `unfollowUser` 旧配置兼容 | P3 | 已兼容 `unfollowButton`（旧字符串）和 `unfollowButtons`（新数组）两种 schema |
| 批量删除推文（Tweets）| P2 | 引擎 `deleteTweet` 已实现，缺 `getTweetsPageURL` 跳转和 tweets 专用配置（moreButton / deleteButton / confirmButton）|

### 为何 Messages（私信）不支持

X 的 Messages 列表页**只能通过 right-click（mac 两指点击 / Windows 右键）触发 Delete conversation 菜单**。经测试，X 在监听 `contextmenu` / `mousedown` 等事件时**校验 `event.isTrusted` 字段**——只有真实用户输入（OS 级事件）才为 `true`。

Chrome extension content script 用以下任一方式派发事件，**全部失败**（`isTrusted=false`，被 X 忽略）：

| 派发方式 | 结果 |
|---------|------|
| `el.dispatchEvent(new MouseEvent('contextmenu', {...}))` | ✗ 失败 |
| `mousedown` + `mouseup` + `contextmenu` 序列 | ✗ 失败 |
| `pointerdown` + `mousedown` + `mouseup` + `contextmenu` 完整 PointerEvent 序列 | ✗ 失败 |
| CDP `Input.dispatchMouseEvent`（浏览器内核级）| ✓ 有效（但 content script 无法调用）|

**唯一能模拟 native right click 的方式**是申请 `chrome.debugger` 权限 + background 用 `chrome.debugger.sendCommand('Input.dispatchMouseEvent')`。这会触发 Chrome 的权限警告（"该扩展程序可以访问与此扩展程序相关的页面上的所有数据"），对发布和用户信任有显著负面影响。

**其他类型（tweets/likes/bookmarks/following）不受影响**——它们用普通 `.click()` 触发删除，X 不对 click 校验 `isTrusted`，content script 直接调用 `el.click()` 即可。

**未来重新实现 Messages 的可能路径**：
1. 申请 `debugger` 权限（影响发布和用户信任）
2. 通过 X GraphQL API 直接删除（需要 OAuth token，超出 chrome extension 范畴）
3. 等待 X 改版放弃 `isTrusted` 校验（小概率事件）

## 项目经验

踩坑总结 + 设计取舍详见 [docs/lessons-learned.md](file:///Volumes/XPSSD/workspaces/X-Eraser/docs/lessons-learned.md)，核心 5 条：

1. **KISS > 过度设计** — 一件事 5 行能写完就别写 50 行
2. **状态变更走 sticky，不走 poll** — 检测一次就缓存，唯一翻转信号 = 显式用户动作
3. **状态机要三态**：`null`（未确认） / `true` / `false`
4. **Selector 不可信** — 必须有语义锚点（href / URL / ARIA），不能全是 `data-testid`
5. **删代码是改进** — 兜底 retry / silent polling / 老 API 兼容 shim 都要定期回头审视

最近六次实战案例（[docs/lessons-learned.md](file:///Volumes/XPSSD/workspaces/X-Eraser/docs/lessons-learned.md)）：
- 登录态检测 → sticky 状态机（`scripts/verify-login-detection.js` 37 项 assert）
- cleanup 去重 → 删 `runCleanupWithRetry`（`scripts/verify-no-retry.js` 14 项 assert）
- sidepanel 元素漏绑 → 加 4 行 `getElementById` 绑定（`scripts/verify-sidepanel-bindings.js` 6 项 assert）
- dailyUsage 计数竞态 → 单飞链 `_dailyUsageChain`（`scripts/verify-daily-usage-chain.js` 9 项 assert）
- processTweets 增量设计 → 双模式扫描 + 8 语言 pinned 检测（`check-schema.js` 覆盖 moreButtons 数组升级）
- setConfig 字段合并 → 手写 `_mergeConfig` 逐层浅合并（`scripts/verify-setconfig.js` 13 项 assert）

## 安装使用

### Chrome 扩展

1. 打开 `chrome://extensions/`
2. 开启「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择 `chrome-extension` 文件夹
5. 打开 x.com 并登录
6. 点击扩展图标，打开侧边栏
7. 勾选要执行的操作，点击「开始清理」

## 验证脚本

> **为什么不用 jest？** 本项目的 verify 脚本是 **grep 源码 + `assert()` + `process.exit(0/1)`** 的纯静态扫描（不是单元测试）。跑得快（不需要 jsdom）、零依赖、易于写"防 X 改版"类锁（参见 [docs/lessons-learned.md](file:///Volumes/XPSSD/workspaces/X-Eraser/docs/lessons-learned.md) 第十节「Assert 比注释更长寿」）。统一入口是 `scripts/run-verify.js`，已被 `npm test` 绑定。

### 推荐：统一入口

```bash
npm test                          # 跑全部 13 个 verify + check-schema
npm run verify                    # 同 npm test
npm run verify:single -- tweets-bug-3     # 跑单个（自动补 verify- 前缀和 .js 后缀）
node scripts/run-verify.js --list         # 列出全部可用脚本
```

### 单跑（也可直跑原脚本）

```bash
node scripts/check-schema.js       # 4 项：DEFAULT_SELECTORS / config/*.json 字段对齐（防 remote 热修丢字段）
node scripts/verify-setconfig.js   # 13 项：setConfig 字段级合并单测（防远程缺键时丢 DEFAULT 字段、防污染）
node scripts/verify-i18n.js        # i18n 8 语言 × 30 keys = 240 entries 完整性
node scripts/verify-following.js   # 回归检查（following 流程、状态机、auto-hide）
node scripts/verify-login-detection.js  # 37 项：登录态检测 selector 健壮性 + sticky 状态机
node scripts/verify-no-retry.js          # 14 项：cleanup 不再无脑重试（防 0 likes 用户每页跑 2 次）
node scripts/verify-sidepanel-bindings.js  # 2 项：sidepanel.js 所有 els.xxx 引用 ↔ getElementById 绑定 1:1 锁定（防加新元素忘绑；6-type 重构前 6 项）
node scripts/verify-daily-usage-chain.js  # 9 项：dailyUsage 单飞串行链（防 read-modify-write 竞态 + .catch 毒化链 + callback 顺序）
node scripts/verify-actual-x-selectors.js  # 31 项：用真实 X 页面 HTML 锁定 selector 决策（防 X 改版后 selector 默默失效）
```

## 项目结构

```
X-Eraser/
├── chrome-extension/       # Chrome 扩展（当前开发重点）
│   ├── lib/
│   │   ├── config.js     # 远程配置加载
│   │   ├── i18n.js       # 多语言支持
│   │   └── injector.js    # DOM 操作引擎
│   ├── content.js         # 注入脚本
│   ├── sidepanel.html/js  # 侧边栏 UI
│   ├── background.js      # 后台脚本
│   └── config/
│       ├── default.json   # 本地后备配置
│       └── remote-example.json  # 远程配置示例
└── android/               # Android 原生项目（待开发）
```

## 远程配置

配置文件支持热更新，X 官方改版后只需更新配置文件即可适配。

### 配置结构

```json
{
  "selectors": {
    "xWebsite": { "patterns": ["x.com", "twitter.com"] },
    "login": { "checkElements": {...}, "loggedInElements": [...] },
    "tweet": { "container": "...", "moreButton": "...", "deleteButton": "...", "confirmButton": "..." },
    "like": { "container": "...", "unlikeButtons": [...] },
    "bookmark": { "container": "...", "removeButtons": [...] },
    "following": { "container": "...", "unfollowButtons": [...], "confirmButton": "..." }
  }
}
```

> **schema 对齐约束**：`DEFAULT_SELECTORS`（`chrome-extension/lib/injector.js`）和
> `config/default.json` / `config/remote-example.json` 的 selector 字段必须保持完全一致。
> 修改任一处时必须同步修改其他两处，并跑 `node scripts/check-schema.js` 验证。

### 部署配置

1. 修改 `remote-example.json` 内容
2. 上传到可公开访问的 URL（如 GCS、GitHub Gist）
3. 更新 `background.js` 中的 `CONFIG_URL`

## 技术特点

### ⚠️ 硬性要求：多语言适配

**所有面向用户的文案必须使用 i18n，禁止在代码中硬编码任何语言字符串。**

#### 规则

1. **新增文案** → 先在 `lib/i18n.js` 的 8 种语言中添加翻译键，再在代码中通过 `t('key')` 调用
2. **修改文案** → 同步更新 8 种语言的翻译
3. **新增 UI 元素** → HTML 中使用 `data-i18n="key"` 或 `data-i18n-placeholder="key"` 属性
4. **禁止** 在 JS/HTML 中出现 `alert('English text')`、`addLog('Some English')` 等硬编码字符串
5. **占位符**：动态内容用 `{var}` 形式，如 `t('cleanupCompleted', {count: 10})`

#### 支持的 8 种语言

| 代码 | 语言 |
|------|------|
| `en` | English |
| `zh-CN` | 简体中文 |
| `zh-TW` | 繁體中文 |
| `ja` | 日本語 |
| `ko` | 한국어 |
| `es` | Español |
| `de` | Deutsch |
| `fr` | Français |

#### 检查清单（提交前必查）

- [ ] 新文案已添加到 i18n.js 的 8 种语言
- [ ] HTML 元素使用了 `data-i18n` 属性
- [ ] JS 中所有 addLog/alert/confirm 使用了 `t()` 函数
- [ ] 没有硬编码的英文字符串
- [ ] 占位符 `{var}` 在 8 种语言中都有定义

#### 示例

**错误**：
```javascript
alert('Please select at least one option');
addLog('Cleanup started', 'info');
```

**正确**：
```javascript
alert(t('noItemsSelected'));
addLog(t('startingCleanup'), 'info');
```

```html
<!-- 错误 -->
<button>Start Cleanup</button>

<!-- 正确 -->
<button data-i18n="startCleanup">Start Cleanup</button>
```

### 健壮性设计

- **选择器容错**：一个选择器失败自动尝试下一个
- **错误容忍**：最多10次错误后停止，防止死循环
- **标记已处理**：防止重复操作
- **远程配置**：选择器通过远程 JSON 更新

### 无后端

- 所有逻辑纯前端实现
- 配置存储在 Chrome Storage 或远程 URL
- 无需服务器支撑

## 开发计划

### Phase 1: Chrome Extension 核心 ✅
- [x] 侧边栏 UI
- [x] 状态检测（含 login status 实时检测——3s 轮询 + statusUpdate 广播）
- [x] 多语言（8 种语言 + storage.onChanged 跨 context 同步）
- [x] DOM 操作引擎（含 setConfig 字段级合并 + Schema 对齐保护）
- [x] dailyUsage 单飞串行链（防 progress 回调并发丢计数）
- [x] 批量取关 Following（端到端流程通过）
- [x] 批量删除 Likes / Bookmarks（引擎就绪，端到端真机测试中）
- [x] 批量删除 Messages（已降级——X 校验 isTrusted，content script 无法模拟 native right click）
- [ ] 批量删除 Tweets（引擎 `deleteTweet` 已实现，缺 `getTweetsPageURL` + tweets 专用 selector 配置）
- [ ] 免费额度 50/天弹窗

### Phase 2: Chrome Extension 完善
- [ ] 日期过滤逻辑
- [ ] 订阅系统（Creem）
- [ ] 会员解锁

### Phase 3: 移动端
- [ ] Android App (Capacitor)
- [ ] iOS App (Capacitor)
- [ ] 跨端代码共享

## License

MIT
