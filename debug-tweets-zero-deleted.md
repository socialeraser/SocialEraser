# debug-tweets-zero-deleted

## ✅ 已解决

**根因**：X 改版后 2 个 selector 失效，tweets cleanup 0 命中

| 位置 | 旧 selector（失效）| 新 selector（已修）|
|------|-------------------|-------------------|
| Delete 菜单项 | `[data-testid='Delete']` | `<div role="menuitem">` + 8 语言文字匹配（`waitForMenuItemByText` helper）|
| Undo repost 菜单项 | 漏了 `unretweetConfirm` | 加上 `[data-testid='unretweetConfirm']` 作首项 |
| Delete 确认按钮 | 旧 `confirmationSheetConfirm` | 不变（一直是对的）|
| Undo repost 流程 | 1 步 click | 2 步 click（点 retweet 按钮 → wait menuitem → click）|

## 证据链

- `tests/respost弹出框源码.txt` — 自己发的推文 More 菜单，"Delete" 文字在 menuitem #1，**无 testid**
- `tests/点击自己回复的消息右上角弹出框源码.txt` — 回复的 More 菜单，同样 "Delete" 文字无 testid
- `tests/删自己的帖子确认框源码.txt` — Delete 确认弹框，**确认按钮 testid = `confirmationSheetConfirm`**（**已正确**）
- `tests/在转发的帖子下面点击Undo` — 转发 Undo 弹窗，**菜单项 testid = `unretweetConfirm`**（**旧代码漏了**）
- `tests/with_replies页面远吗.txt` — 6 张推文卡片，每张都有 `data-testid="caret"` + `aria-label="More"`

## 修复 commit

- `chrome-extension/lib/injector.js` 第 11-35 行：`deleteButton` 改 `null`，`unreTweetButtons` 加上 `unretweetConfirm`
- `chrome-extension/lib/injector.js` 第 222-280 行：`deleteTweet` 改用 `waitForMenuItemByText` helper
- `chrome-extension/lib/injector.js` 第 310-345 行：`unreTweet` 改 2 步流程
- `scripts/verify-actual-x-selectors.js` — **31 项** 回归测试，HTML 真相 ↔ selector 决策 1:1 锁定

## 验证结果

| 脚本 | 结果 |
|------|------|
| `verify-actual-x-selectors.js` | ✅ **31/31** |
| `verify-process-tweets-selectors.js` | ✅ 14/14 |
| 其他 8 个 verify 脚本 | ✅ 全部通过 |
| 6 个 JS 文件语法 | ✅ |

## 调试过程实录（给 lessons-learned 留的素材）

### 阶段 1：完全瞎试（无效）

- ❌ Puppeteer Chrome — npm cache 权限锁死
- ❌ 系统 Chrome 走 MCP — 跑起来了但 X 重定向到 login
- ❌ 公开账号测试 — 同样被 redirect 到 login
- ❌ **用户提供登录态** — Google/X 检测到"自动化软件正在控制浏览器"，直接拒绝登录

**关键教训**：X/Google 反爬虫机制会识别所有 CDP 控制的 Chrome，**自动化测试不可行**。必须靠用户提供真实 HTML 源码。

### 阶段 2：拿到 HTML 真相（关键突破）

用户在 `tests/` 目录放了 5 份 HTML 源码。grep + Python 脚本定位到：

```
Delete menuitem:  <div role="menuitem">  — 无 testid，文字 "Delete"
confirm button:   <button data-testid="confirmationSheetConfirm">
unretweet menuitem: <div role="menuitem" data-testid="unretweetConfirm">
```

### 阶段 3：3 个 selector 修复

1. `deleteButton = null` + `waitForMenuItemByText` 通用 helper
2. `unretweetButtons` 加 `unretweetConfirm` 作首项
3. `unreTweet` 改 2 步流程

## 给 lessons-learned.md 留的素材

**新反模式 3：只备 1 个 selector、不验证真实 DOM**

- 现象：selector 在脑子里想当然，X 改版后默默失效，0 命中但代码不报错
- 教训：用 `verify-actual-x-selectors.js` 把 HTML 真相 + selector 决策 1:1 锁定
- 数据：X 改版有 3 类规律（testid 改 / 业务专属→通用 / 菜单项无 testid），每类都有 1 行注释锁住

**新反模式 4：自动化浏览器 ≠ 真实浏览器**

- 现象：以为换个工具能绕过 X/Google 登录墙
- 教训：3 次变种尝试后**停下来**承认受限，把 HTML 真相交给用户
