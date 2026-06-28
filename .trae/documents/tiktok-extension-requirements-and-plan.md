# SocialEraser TikTok 平台需求分析报告

> **版本**：v1.0（重构自 tiktok-extension-requirements-and-plan.md）
> **受众**：工程师（架构师 + 浏览器扩展开发 + 移动端复用 + DevOps）
> **定位**：本报告描述 TikTok 平台 MVP 的"是什么"和"为什么"，不描述"怎么实现"；实施细节由独立 plan 跟踪。

---

## 1. 项目概述（Overview）

### 1.1 背景与目标

**背景**：SocialEraser 是一个跨社交平台的批量清理工具集，已上线 X Eraser 平台（Chrome/Edge MV3 + Capacitor Android）。用户对"批量删除内容"的需求普遍存在 —— 内容创作者定期清理冷启动视频、用户重置账号前清空痕迹、隐私敏感者一次性抹除痕迹 —— 而各平台官方未提供批量操作。

**目标**：在已有 x-project 统一框架下，落地 **TikTok Eraser** MVP，覆盖 5 种清理类型（Videos / Reposts / Likes / Favorites / Following），首发 Chrome MV3 + Edge MV3，3 端（Web 扩展 + Android + iOS）共用同一套 Web UI 源码。

**非目标**（V1 不做）：评论清理、观看历史清理、相册/草稿清理、批量导出备份、定时任务、跨账号管理。

### 1.2 与 x-project 的关系

TikTok-project 是 x-project 的**平台平级副本**，两者在 monorepo 中并列、共享统一开发规范：

| 维度 | x-project | tiktok-project | 共享方式 |
|---|---|---|---|
| Monorepo 入口 | `platforms/x-project/` | `platforms/tiktok-project/` | npm workspaces 自动发现 |
| Web UI 源 | `src/sidepanel.html` | `src/sidepanel.html` | 复制改写（不共享运行时） |
| 核心引擎 | `scripts/x-automation.js` (2174 行, 6 type) | `scripts/tiktok-automation.js` (1323 行, 5 type) | 复制并精简 |
| Content script | `scripts/content.js` (~600 行) | `scripts/content.js` (337 行) | 复制并精简 |
| i18n 引擎 | `scripts/i18n.js` + `src/_locales/8 lang` | 同结构（待创建） | 必须与 x-project 同步 8 语言 |
| 远程配置 | `src/config/{default, remote-example}.json` | 同结构（待创建） | 独立 schema，独立 CDN path |
| Build pipeline | `scripts/sync-shared.js` (通用) | 完全 0 改动 | 自动 pick up `platforms/*-project/` |
| Verify 脚本 | `scripts/verify-*.js` | 扩展 3 个新脚本 | 复用 x-project 模式 |
| Marketing 页 | `packages/marketing-website/platforms/x/` | `packages/marketing-website/platforms/tiktok/` | 独立 landing，但 footer/导航复用 |

**关键命名约定**（与 x-project 同源）：
- 全局防重入 flag：x-project 用 `window.__SocialEraserContentInjected`；TikTok 用 `window.__TikTokEraserContentInjected`（不冲突，**故意分前缀**）
- Storage key：x-project 用 `xRemoteConfig`；TikTok 用 `tiktokRemoteConfig`（同上）
- Port name：x-project 用 `xeraser-logger`；TikTok 用 `tiktokeraser-logger`
- Injector 全局：x-project 暴露 `window.XEraserInjector`；TikTok 暴露 `window.TikTokInjector`

**为什么命名要分前缀**：未来多平台共存时（YouTube、Instagram 等），防重入 flag、storage、port、injector 都可能同时存在于同一 page context（如跨平台账号同步扩展）。分前缀是预防性设计。

### 1.3 关键约束

| 约束 | 取值 | 出处 |
|---|---|---|
| 8 语言必须完整 | en / zh-CN / ja / ko / pt / es / de / fr | x-project 硬约束，强制复用 |
| Tip model 禁止订阅 | 不含 `isPremium` / `showUpgradeModal` / `subscription.active` | x-project 硬约束 |
| Daily limit | 5000/天 | x-project 现状 |
| Daily limit tip 弹窗 8 语言 | 必须含 "tip / support developer / come back tomorrow" 关键词 | x-project 硬约束 |
| 远程配置 CDN | `https://storage.googleapis.com/social-tool-bucket/tiktok-remote-example.json` | 与 x-project 同 bucket 不同 prefix |
| `*://tiktok.com/*` + `*://www.tiktok.com/*` + `https://storage.googleapis.com/*` | host_permissions 必含 | CWS 审核 + 远程配置拉取 |
| 品牌色 | `#FE2C55`（粉）+ `#25F4EE`（青）+ `#0F0F0F`（黑）| TikTok 官方品牌 |
| 不使用 remote code | selector 仅从远程 JSON 读取域名列表，不执行 | CWS 审核 |
| 不假造用户评论 | 营销页 ≤ 6 真实评论前隐藏 reviews section | x-project 教训 |
| 外部链接 `rel="noopener noreferrer"` | 全站 14 个页面 | x-project 硬约束 |
| 8 语言 dailyLimitReachedHint | 必须含 'tip/support developer/come back tomorrow' 关键词 | x-project 硬约束 |

---

## 2. 目标用户与场景（Users & Scenarios）

### 2.1 用户画像

| 用户类型 | 占比（预估） | 核心痛点 | 关键诉求 |
|---|---|---|---|
| **内容创作者** | 40% | 早期作品质量差 / 冷启动视频 / 试水内容想清理 | 视频按时间 + 播放量筛选 |
| **重启账号者** | 35% | 想彻底删除痕迹后从零开始 | 一次性大批量删除 |
| **隐私敏感者** | 20% | 历史点赞 / 收藏暴露兴趣轨迹 | Likes + Favorites 重点清理 |
| **断舍离关注者** | 5% | 关注列表臃肿（>1000），想清理营销号 / 不活跃号 | Following 批量取关 |

### 2.2 5 个清理类型对应的核心场景

**User Story 1 — Videos（内容创作者）**
> 作为一个内容创作者，我上传了 200+ 条 TikTok 视频，其中 50 条是早期试水内容（播放量 < 100），我希望批量筛选并删除这些视频，保留播放量 ≥ 1000 的内容。

**User Story 2 — Reposts（重启账号者）**
> 作为一个想重启账号的用户，我过去转发过 80 条别人的视频，但我不想用 TikTok Web 的"撤销 repost"功能（因为它仍然显示在原帖上），我接受"删除 repost = 删除该视频（连带原视频一起消失）"的副作用。

**User Story 3 — Likes（隐私敏感者）**
> 作为一个隐私敏感者，我过去点赞了 5000+ 条视频，但点赞列表会暴露我的兴趣轨迹。我想一键清空点赞（除了一些我特别喜欢的可以保留）。

**User Story 4 — Favorites（内容创作者）**
> 作为一个内容创作者，我收藏了 200+ 条"教学类"视频作为素材库，现在想清理收藏但保留几条关键参考。

**User Story 5 — Following（断舍离者）**
> 作为一个关注了 1500+ 账号的用户，我想批量取关所有"营销号 / 不活跃号"，但保留我认识的朋友。

### 2.3 关键交互流

#### 2.3.1 标准清理流程

```
用户打开 tiktok.com
  → 浏览器扩展图标激活 → 点击 → Side Panel 弹出
  → Side Panel 检测当前 URL pattern:
      - tiktok.com/@username → page type = videos
      - tiktok.com/@username/likes → page type = likes
      - tiktok.com/@username/favorites → page type = favorites
      - tiktok.com/@username/following → page type = following
      - 其他 → page type = unknown，提示跳转
  → 用户勾选 1-5 个清理类型 + 填写过滤器（可选）
  → 点击 "Start Cleanup" 按钮
  → Side Panel 通过 chrome.runtime.sendMessage 发 startCleanup 命令
  → Background 转发给 content.js
  → Content.js 把命令交给 TikTokInjector.startCleanup()
  → TikTokInjector 串行执行 5 个 process 方法
  → 实时通过 chrome.runtime.connect 推送 onLog / onProgress / onComplete
  → Side Panel 实时更新进度条 + 日志 + summary 卡片
```

#### 2.3.2 跨页面自动导航流程（V1 暂不实现，记录为 V2）

> 未来 V2：当用户在 profile 主页选 "Likes" 时，content.js 自动 chrome.tabs.update 跳转到 `tiktok.com/@username/likes`，resume 清理。
> V1 仅在当前页执行；如果 type 与 page type 不匹配，提示用户手动跳转。

#### 2.3.3 远程热修流程

```
Background Service Worker 启动 / alarm 触发（24h 一次）
  → fetch('https://storage.googleapis.com/social-tool-bucket/tiktok-remote-example.json')
  → 解析 + 校验 schema（与 default.json 字段对齐）
  → chrome.storage.local.set({ tiktokRemoteConfig: parsed })
  → Content.js 启动时从 storage 读，调用 TikTokInjector.setConfig()
  → Injector 字段级合并 selector（远程只覆盖显式提供的字段）
  → 后续清理操作使用远程 selector
```

#### 2.3.4 每日额度流程

```
Side Panel 启动时
  → chrome.storage.local.get('tiktokDailyUsage')
  → 计算 remaining = FREE_LIMIT_PER_DAY (5000) - used
  → 显示在 status 卡片
  → 每次 cleanup 完成 → 更新 used = used + processed
  → 当 used >= FREE_LIMIT_PER_DAY
      → 弹 tip 弹窗（8 语言必含 tip/support developer/come back tomorrow）
      → 禁用 "Start Cleanup" 按钮
      → 显示 "Come back tomorrow" 倒计时（基于 localStorage 上次 reset 时间）
```

---

## 3. 功能需求（Functional Requirements）

> 每个 type 给出：目标 + 行为 + 边界 + 成功标准。

### 3.1 Videos 清理

**目标**：批量删除用户在 TikTok 已发布的视频（自己发布的内容）。

**前置页面**：`tiktok.com/@username`（profile 主页）

**行为**：
1. 检测页面上每个 video 卡片右上角 "···" 按钮
2. 点击 "···" → 弹出操作菜单
3. 菜单中匹配 "Delete" 关键字（8 语言：`Delete` / `删除` / `削除` / `삭제` / `Excluir` / `Eliminar` / `Löschen` / `Supprimer` / `Elimina`）
4. 弹出确认对话框 → 点击 confirm 按钮
5. 等待 video 卡片从 DOM 移除（MO 监听）

**边界**：
- 不删除正在被播放的视频（TikTok 标记为"正在播放"）
- 不删除带 "Pinned" 标记的视频（TikTok 暂不支持置顶视频，预留防御）
- 视频被过滤器跳过 → 标记 `data-social-eraser-processed="skipped"`

**成功标准**：
- 5 条测试视频在 30 秒内全部删除
- 删除后刷新页面，5 条视频不再出现
- 删除过程中无 TikTok 反自动化拦截（无验证码、无 429）

### 3.2 Reposts 清理

**目标**：批量删除用户转发的视频（repost）。

**重要约束**（产品决策）：
- TikTok Web **没有"撤销 repost"独立操作** —— 删除 repost = 删除该视频（连带原视频一起消失）
- 这与 X 的"Undo repost"（保留原帖，仅移除转发记录）行为不同
- 必须在 Side Panel 显著提示用户这一副作用

**前置页面**：`tiktok.com/@username`

**行为**：
1. 通过 socialContext / `[data-e2e="repost"]` 识别 repost 卡片（8 语言关键字匹配 `Repost` / `Reposted` / `转发` / `リポスト` / `재게시` 等）
2. 走与 Videos 完全相同的 3 步删除流程
3. 在 Side Panel 备份提示中明确告知："删除 Reposts = 同时删除原视频"
4. 首次启动 processReposts 时，在日志中输出 `repostWarning` + `startingRepostsCleanup`

**边界**：
- 仅识别带 socialContext "Repost" 标记的卡片，不误伤原创视频
- 8 语言 repost 关键字从 `selectors.i18n.repostKeywords` 读取

**成功标准**：
- 3 条 repost 视频在 30 秒内全部删除
- 删除后原视频从原用户 profile 也消失（用户接受此副作用）
- 提示文案 8 语言完整显示

### 3.3 Likes 清理

**目标**：批量取消点赞。

**前置页面**：`tiktok.com/@username/likes`（likes 标签页）

**行为**：
1. 检测页面上每个已点赞的 ❤ 按钮（红色 filled heart）
2. 点击 ❤ 按钮 → 1 步直接取消点赞（无确认对话框）
3. 等待按钮状态变化（filled → outlined）

**边界**：
- 不误点未点赞的按钮（unfilled heart 是无法点的）
- likes 页是 grid 布局，selector 需识别 `[data-e2e="user-liked-item"]`

**成功标准**：
- 10 条 liked videos 在 15 秒内全部取消点赞
- 取消后 likes tab 显示为空
- 取消过程中无 TikTok 反自动化拦截

### 3.4 Favorites 清理

**目标**：批量取消收藏。

**前置页面**：`tiktok.com/@username/favorites`（favorites 标签页）

**行为**：
1. 检测页面上每个已收藏的 🔖 按钮（黄色 filled bookmark）
2. 点击 🔖 按钮 → 1 步直接取消收藏（无确认对话框）
3. 等待按钮状态变化（filled → outlined）

**边界**：
- 不误点未收藏的按钮
- favorites 页是 grid 布局，selector 需识别 `[data-e2e="user-favorite-item"]`

**成功标准**：
- 10 条 favorited videos 在 15 秒内全部取消收藏
- 取消后 favorites tab 显示为空

### 3.5 Following 清理

**目标**：批量取关账号。

**前置页面**：`tiktok.com/@username/following`（following 列表页）

**行为**：
1. 检测页面上每个 "Following" 按钮（绿色 filled button）
2. 点击 "Following" 按钮 → 弹出确认菜单
3. 菜单中匹配 "Unfollow" 关键字（8 语言：`Unfollow` / `取消关注` / `フォロー解除` / `팔로우 취소` 等）
4. 等待按钮状态变化（Following → Follow）

**边界**：
- 不误点 "Follow" 按钮（已取关的会变成 Follow）
- following 列表是 user cell，selector 需识别 `[data-e2e="user-following-item"]`

**成功标准**：
- 10 个 accounts 在 30 秒内全部取关
- 取关后该账号从 following 列表移除
- 关键词 "Unfollow" 在 8 语言下均能匹配

### 3.6 过滤器

**支持的过滤维度**（5 个 type 都可用）：

| 维度 | 控件 | 范围 | 应用对象 |
|---|---|---|---|
| Date from | `<input type="date">` | ISO date | videos / reposts / likes / favorites / following |
| Date to | `<input type="date">` | ISO date | 同上 |
| Keyword | `<input type="text">` | 任意字符串 | videos / reposts（视频描述）/ following（用户名 + bio）|
| Min view count | `<input type="number">` | ≥ 0 | videos / reposts（TikTok 特有）|
| Max view count | `<input type="number">` | ≥ 0 | videos / reposts（TikTok 特有）|

**AND 关系**：所有过滤条件取交集，任一不满足则跳过该 item。

**View count 解析**（TikTok 特有）：
- 显示格式：`1.2K` / `3.4M` / `5B` / `123`
- 解析：K=1000 / M=1,000,000 / B=1,000,000,000
- 失败（无 view count 元素）→ `viewCount: null` → 不参与 view count 过滤

### 3.7 状态展示

| 状态卡片 | 内容 | 触发条件 |
|---|---|---|
| **Status** | tiktok.com 检测 + 登录态 | 始终 |
| **Progress** | 当前清理进度（百分比 + 数量）| 清理运行中 |
| **Log** | 实时日志（最近 50 条）| 清理运行中 |
| **Summary** | 完成统计（processed / errors / 时长）| 清理完成 |

**State 转移**：
- `idle` → `running`（用户点 Start）
- `running` → `paused`（用户点 Pause）
- `paused` → `running`（用户点 Resume）
- `running` / `paused` → `stopped`（用户点 Stop / 关闭 progress 卡片）
- `stopped` → `idle`（用户点 Close summary 卡片）

---

## 4. 非功能需求（Non-Functional Requirements）

### 4.1 性能

| 指标 | 取值 | 出处 |
|---|---|---|
| 单 item 清理平均耗时 | ≤ 1.0s | x-project 现状 0.9s/item，TikTok DOM 略简 |
| 点击间隔（videos / reposts 删除）| 800-1200ms | TikTok 反自动化比 X 严，X 用 500ms |
| 点击间隔（likes / favorites 取消）| 500-800ms | 单步操作，间隔可短 |
| 点击间隔（following 取关）| 500-800ms | 单步 + 确认 |
| 批量上限 | 5000/天/账号 | 防止滥用 + 模拟人类行为 |
| Side Panel 启动 | ≤ 200ms | chrome.sidePanel API |
| 远程配置拉取 | ≤ 1s | background fetch 24h 一次 |
| content.js 注入 | 立即（document_start）| manifest 配置 |
| 清理完成 → 状态更新 | ≤ 100ms | 实时推送 |

### 4.2 兼容性

| 维度 | 要求 |
|---|---|
| Chrome 版本 | ≥ 88（MV3 引入）|
| Edge 版本 | ≥ 88（Chromium-based）|
| macOS | ≥ 10.15（Catalina）|
| Windows | ≥ Windows 10 |
| Linux | Ubuntu 20.04+ / Fedora 32+ |
| Android | 推迟到 Q1 2027（Capacitor）|
| iOS | 推迟到 Q1 2027（Capacitor）|
| 网络 | 需联网（远程配置拉取）|

### 4.3 安全性

| 项 | 要求 |
|---|---|
| 远程代码执行 | 禁止（仅读取远程 JSON 域名列表）|
| host_permissions 白名单 | `*://tiktok.com/*` + `*://www.tiktok.com/*` + `https://storage.googleapis.com/*` |
| 远程配置 HTTPS | 强制（拒绝 HTTP 降级）|
| 密码 / Token 处理 | 不接触 TikTok 登录态；不存储任何凭据 |
| 日志内容 | 不含用户凭证、cookie、token |
| CWS 审核回答 | "No, I am not using Remote code"（X-project 教训：审核对远程代码敏感）|
| CSP 兼容 | 不注入 inline script / 不 eval |
| 外部链接 | `rel="noopener noreferrer"` 全站强制 |

### 4.4 i18n 完整性

**8 语言**：en / zh-CN / ja / ko / pt / es / de / fr

**硬约束**（与 x-project 同步）：
- 每个新增 key 必须 8 语言全部翻译
- 验证：`scripts/verify-tiktok-i18n.js` 在 CI 中强制执行
- 缺一语言 → CI 失败 → 拒绝合并

**新增 key 命名空间**（TikTok 特有）：
- UI label：`videos` / `reposts` / `likes` / `favorites` / `following` / `viewCountFrom` / `viewCountTo` / `minViewCount` / `maxViewCount`
- 备份提示：`videosBackupTip` / `repostsBackupTip`（含 TikTok archive 链接）
- 8 语言关键字：`repostKeywords`（`Repost` / `已转发` / `リポスト` / `재게시` 等）
- 日志：`startingVideosCleanup` / `repostWarning` / `repostDeleteWarning` / `unrepostImpossible`
- 弹窗：`dailyLimitReachedHint`（必含 "tip / support developer / come back tomorrow"）

### 4.5 可维护性

| 维度 | 要求 |
|---|---|
| Selector 远程热修 | 改 selector → 上传 CDN → 用户无需更新扩展 |
| Schema 对齐 | `default.json` ↔ `remote-example.json` 字段严格一致 |
| Verify 脚本 | 3 个 TikTok 专用 + 复用 x-project 9 个共 12 个 |
| Tip model 解耦 | 不含订阅逻辑（与 x-project 同步）|
| 命名空间隔离 | TikTok 全局变量 / storage key / port name 用 `tiktok` / `TikTok` 前缀 |
| 文档 | README.md 描述状态 + 复用机制 + 验证步骤 |

---

## 5. 技术架构（Technical Architecture）

### 5.1 模块结构图

```
platforms/tiktok-project/
├── README.md                      # 项目说明（已完成）
├── package.json                   # npm 依赖（已完成，@capacitor/*）
├── capacitor.config.json          # Capacitor 配置（已完成，appId + webDir）
├── chrome-source/                 # Chrome MV3 source（已完成）
│   ├── manifest.json
│   └── background.js
├── edge-source/                   # Edge MV3 source（已完成）
│   ├── manifest.json              # 含 update_url 指向 Edge Web Store
│   └── background.js              # 与 chrome-source 共享
├── scripts/                       # Content script 注入（已完成）
│   ├── tiktok-automation.js       # TikTokInjector 核心引擎
│   └── content.js                 # 入口 + 消息路由
├── src/                           # Web UI 唯一来源（部分完成）
│   ├── sidepanel.html             # 5 type 选项 UI（已完成）
│   ├── sidepanel.js               # ❌ 待创建
│   ├── i18n.js                    # ❌ 待创建
│   ├── _locales/                  # 8 语言（❌ 全部待创建）
│   │   ├── en/messages.json
│   │   ├── zh_CN/messages.json
│   │   ├── ja/messages.json
│   │   ├── ko/messages.json
│   │   ├── pt/messages.json
│   │   ├── es/messages.json
│   │   ├── de/messages.json
│   │   └── fr/messages.json
│   ├── config/                    # 远程配置（❌ 全部待创建）
│   │   ├── default.json
│   │   └── remote-example.json
│   └── icons/                     # 16/48/128 PNG（❌ 待创建）
└── android/  ios/                 # Capacitor 平台（推迟到 Q1 2027）
```

### 5.2 数据流

```
┌──────────────────┐
│   TikTok DOM     │
│  (tiktok.com)    │
└────────┬─────────┘
         │ 注入 tiktok-automation.js + content.js
         ↓
┌──────────────────┐
│  Content Script  │
│  (content.js)    │ ← page type detection, login state
│  TikTokInjector  │ ← DOM operations
└────────┬─────────┘
         │ chrome.runtime.sendMessage / chrome.runtime.connect
         ↓
┌──────────────────┐
│  Background SW   │
│ (background.js)  │ ← config prefetch, message routing
└────────┬─────────┘
         │ chrome.runtime.sendMessage
         ↓
┌──────────────────┐
│   Side Panel     │
│  (sidepanel.html)│ ← user UI, status, progress
│   sidepanel.js   │
└──────────────────┘
         ↑↓
    chrome.storage.local
    { tiktokRemoteConfig, tiktokDailyUsage }
```

**消息类型**（content → background → sidepanel）：

| type | payload | 触发条件 |
|---|---|---|
| `statusUpdate` | `{ pageType, username, isLoggedIn }` | 页面变化 / 登录态变化（节流 1s）|
| `cleanupLog` | `{ message, level }` | injector.log() 调用 |
| `cleanupProgress` | `{ processed, message }` | injector.progress() 调用 |
| `cleanupError` | `{ message }` | injector.error() 调用 |
| `cleanupTypeStart` | `{ itemType }` | processItems 入口 |
| `cleanupTypeComplete` | `{ itemType, processed }` | processItems 出口 |
| `cleanupComplete` | `{ processed, errors }` | startCleanup 全部完成 |

**消息类型**（sidepanel → background → content）：

| type | payload | 触发条件 |
|---|---|---|
| `startCleanup` | `{ types: [], maxPerType, filters }` | 点 Start |
| `pauseCleanup` | `{}` | 点 Pause |
| `resumeCleanup` | `{}` | 点 Resume |
| `stopCleanup` | `{}` | 点 Stop |
| `getCleanupStatus` | `{}` | 状态轮询（节流）|
| `getPageInfo` | `{}` | 初始化时一次性 |

### 5.3 DOM 引擎（TikTokInjector）

**核心类**：[tiktok-automation.js](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/scripts/tiktok-automation.js) 中 `class TikTokInjector`

**5 个 process 方法**（V1 入口）：

| 方法 | 路径 | DOM 锚点 | 删除步骤 |
|---|---|---|---|
| `processVideos` | `tiktok.com/@username` | `[data-e2e="user-post-item"]` 容器 + 右上 "···" 按钮 | 3 步：more → Delete menu → confirm |
| `processReposts` | `tiktok.com/@username` | 同上 + `socialContext` 含 repost 关键字 | 复用 deleteVideo 3 步 |
| `processLikes` | `tiktok.com/@username/likes` | `[data-e2e="user-liked-item"]` + ❤ unlike button | 1 步：直接点 unlike |
| `processFavorites` | `tiktok.com/@username/favorites` | `[data-e2e="user-favorite-item"]` + 🔖 unfavorite button | 1 步：直接点 unfavorite |
| `processFollowing` | `tiktok.com/@username/following` | `[data-e2e="user-following-item"]` + "Following" 按钮 | 2 步：Following → Unfollow confirm |

**复用 XEraserInjector 模式**（[tiktok-automation.js:97-145](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/scripts/tiktok-automation.js#L97-L145)）：
- `findElement` / `findElements` / `findClosest` — 通用 selector 工具，try-catch 兜底
- `safeClick` ([tiktok-automation.js:147-190](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/scripts/tiktok-automation.js#L147-L190)) — 3 种事件兜底（`click` / `MouseEvent` / `PointerEvent`）+ 60 帧 scroll-into-view + 1000ms scroll 超时
- `scrollToBottom` ([tiktok-automation.js:192-271](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/scripts/tiktok-automation.js#L192-L271)) — MO + RAF 事件驱动，30 帧稳定 + 300 帧上限
- `waitForElement` ([tiktok-automation.js:273-287](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/scripts/tiktok-automation.js#L273-L287)) — RAF 帧数驱动
- `waitForContentStable` ([tiktok-automation.js:289-368](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/scripts/tiktok-automation.js#L289-L368)) — 30 帧稳定 + 600 帧上限 + 3 次 scroll trigger
- `waitForMenuItemByText` ([tiktok-automation.js:462-493](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/scripts/tiktok-automation.js#L462-L493)) — `[role="menuitem"]` 扫描 + 8 语言文字匹配
- `_findButtonByText` ([tiktok-automation.js:1142-1164](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/scripts/tiktok-automation.js#L1142-L1164)) — 文字 + aria-label 匹配
- `extractMeta` / `matchesFilter` / `parseViewCount` — 过滤器元数据

**关键差异（vs XEraserInjector）**：
1. **click 间隔更长**（800ms vs 500ms）— TikTok 反自动化检测更严格
2. **view count 解析**（TikTok 特有）— `parseViewCount` 支持 K/M/B 后缀
3. **Repost 特殊处理** — 识别 socialContext 中的 repost 关键字，调用同一 `deleteVideo` 方法
4. **topLevelRule 简化** — TikTok DOM 不像 X 那样有嵌套 article，只需 `article` 一层

### 5.4 状态机

**登录态**（[content.js:204-224](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/scripts/content.js#L204-L224)）：
```
null (未检测) ──detect──→ true (已确认登录)
                       └→ false (已确认未登录 / 在登录页)
```
- **sticky cache**：`cachedIsLoggedIn` 一旦确认 true 不会自动变 false（避免 SPA 导航误判）
- 例外：URL 进入 `/login` 或 `/signup` → 强制 false

**清理运行态**（TikTokInjector）：
```
idle ──startCleanup()──→ running ──pause()──→ paused
                          ↑                      │
                          └──────resume()────────┘
                          │
                          └──stop() / completion──→ idle
```

**单 type 进度标记**（`data-social-eraser-processed`）：
- `true` — 已处理成功
- `skipped` — 被过滤器跳过
- `failed` — 处理失败（错误次数超 maxErrors 后停止）
- 未设置 — 待处理

### 5.5 过滤器实现

**元数据提取**（[tiktok-automation.js:584-630](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/scripts/tiktok-automation.js#L584-L630)）：

```javascript
{
  dateISO: 'YYYY-MM-DD' | null,   // 从 <time datetime="..."> 提取
  text: string,                    // videoText (videos/reposts/likes/favorites)
                                    // 或 userName + userDescription (following)
  viewCount: number | null         // 仅 videos/reposts
}
```

**匹配规则**（[tiktok-automation.js:647-659](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/scripts/tiktok-automation.js#L647-L659)）：
- 所有条件 AND 关系
- `fromDate` / `toDate`：`<` / `>` 字典序比较 ISO 字符串（YYYY-MM-DD 格式保证）
- `keyword`：case-insensitive `indexOf` 匹配
- `minViewCount` / `maxViewCount`：仅在 `viewCount != null` 时生效（无 view count 的视频不参与过滤）

**view count 解析**（[tiktok-automation.js:634-644](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/scripts/tiktok-automation.js#L634-L644)）：
- 正则：`/^([\d.]+)\s*([KMB]?)$/i`
- `K=1000` / `M=1,000,000` / `B=1,000,000,000`
- 解析失败返回 null（不抛异常）

---

## 6. Selector & i18n 策略

### 6.1 Selector 兜底原则

**核心原则**（与 x-project 一致）：
> 每个 type 至少 1 个语义锚点（href / role / aria），不能全靠 data-testid / data-e2e

**为什么**：TikTok 改版时优先改 data-e2e（机器可读），改 aria-label 风险更高（破坏无障碍）。语义锚点如 `a[href='/upload']` 是产品逻辑，改的概率最低。

**实际 selector 优先级**（高 → 低）：
1. **产品语义**：`a[href='/upload']` / `[role="menuitem"]` / `time[datetime]`
2. **aria-label 8 语言**：`button[aria-label*='已点赞']` 等多语言兜底
3. **data-e2e / data-testid**：`[data-e2e="user-post-item"]` — 稳定但可能改
4. **CSS class**：`class*='video'` — 极度不稳，不推荐

**TikTok 特有锚点**（待实测验证）：
- `a[href='/upload']` — 上传链接，登录用户专属
- `[data-e2e="user-post-item"]` — profile 视频卡
- `[data-e2e="user-liked-item"]` — likes 视频卡
- `[data-e2e="user-favorite-item"]` — favorites 视频卡
- `[data-e2e="user-following-item"]` — following user 卡
- `[data-e2e="profile-icon"]` — 顶栏用户头像

### 6.2 i18n 8 语言覆盖

**8 语言**（与 x-project 同步）：
| code | 语言 | 翻译策略 |
|---|---|---|
| en | English | 原生 |
| zh-CN | 简体中文 | 人工翻译（与 zh-TW 不同）|
| ja | 日本語 | 人工翻译 |
| ko | 한국어 | 人工翻译 |
| pt | Português | 人工翻译（pt-BR / pt-PT 通用）|
| es | Español | 人工翻译（es-ES / es-MX 通用）|
| de | Deutsch | 人工翻译 |
| fr | Français | 人工翻译 |

**i18n 关键字分组**（`selectors.i18n` 块）：

| key | 用途 | TikTok 8 语言示例 |
|---|---|---|
| `cancelKeywords` | 取消按钮 | `Cancel` / `取消` / `キャンセル` / `취소` / `Cancelar` / `Cancelar` / `Abbrechen` / `Annuler` |
| `confirmKeywords` | 确认按钮 | `Delete` / `删除` / `削除` / `삭제` / `Excluir` / `Eliminar` / `Löschen` / `Supprimer` |
| `deleteKeywords` | 删除菜单项 | 同 confirmKeywords（TikTok 多数用 Delete）|
| `unfollowKeywords` | 取关菜单项 | `Unfollow` / `取消关注` / `フォロー解除` / `팔로우 취소` / `Deixar de seguir` / `Dejar de seguir` / `Nicht mehr folgen` / `Ne plus suivre` |
| `repostKeywords` | Repost 标记 | `Repost` / `转发` / `リポスト` / `재게시` / `Repostar` / `Repostear` / `Reposten` / `Republier` |
| `unrepostKeywords` | 撤销 repost（TikTok 暂不支持）| 占位空数组 |

### 6.3 远程热修协议

**CDN URL**：`https://storage.googleapis.com/social-tool-bucket/tiktok-remote-example.json`

**3 级 fallback**：
1. **远程**（CDN 拉取，24h 缓存）— 优先级最高
2. **storage 缓存**（上次成功拉的版本）— 离线降级
3. **bundled default**（`src/config/default.json`）— 内置兜底，永远可用

**字段级合并**（[tiktok-automation.js:55-95](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/scripts/tiktok-automation.js#L55-L95)）：
- 远程 JSON 浅拷贝到本地 merged
- 远程只覆盖显式提供的字段，未提供的字段保持 bundled 默认
- 数组字段浅拷贝防止污染 source config
- i18n 关键字数组同理（远程可整体替换某 key 的 8 语言列表）

**Schema 对齐**（`scripts/check-schema.js`）：
- `default.json` 与 `remote-example.json` 的 `selectors` 块字段名严格一致
- 排除块：`login`（独立 merge）/ `tiktokWebsite`（独立 merge）/ `i18n`（远程可整体覆盖）
- 字段缺失 → CI 失败 → 拒绝合并（避免远程热修把某个 selector 块缺失导致 fallback）

**HTTPS 强制**：background fetch 拒绝 HTTP URL（即使 CDN 配置错误也不会降级到明文）。

---

## 7. UI/UX 需求

### 7.1 Side Panel 布局

**结构**（从上到下，[sidepanel.html:481-641](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/src/sidepanel.html#L481-L641)）：

```
┌─────────────────────────────────────┐
│ Header                              │
│   Logo (🎵 + "TikTok Eraser" + v0.1)│
│   [🌐] [↻] [✉️]                     │  ← Language/Refresh/Feedback
├─────────────────────────────────────┤
│ Status Card (auto-collapse)         │
│   ● Checking tiktok.com...          │
│   ● Checking login...               │
│   ⚠ Login hint (if not logged in)  │
├─────────────────────────────────────┤
│ Options Card                        │
│   ☐ Your Videos           [0]       │
│      ⚠ Backup tip (Videos)          │
│   ☐ Reposts               [0]       │
│      ⚠ Backup tip (Reposts)         │
│   ☑ Likes                 [0]       │
│   ☑ Favorites             [0]       │
│   ☑ Following             [0]       │
├─────────────────────────────────────┤
│ Filter Section                      │
│   From date: [____]                 │
│   To date:   [____]                 │
│   Keyword:   [____]                 │
│   Min views: [____]                 │
│   Max views: [____]                 │
├─────────────────────────────────────┤
│ [ Start Cleanup ] (gradient btn)    │
├─────────────────────────────────────┤
│ Progress Card (when running)        │
│   ● Processing... [×]               │
│   ████████░░ 60%                    │
│   Processed: 123                    │
│   [log area]                        │
│   [Copy Diagnostic Log]             │
├─────────────────────────────────────┤
│ Summary Card (when complete)        │
│   ✅ Done! [×]                      │
│   Processed 123 in 2 min            │
│   [☕ Support the developer]         │
├─────────────────────────────────────┤
│ [ Open TikTok Website ]             │  (when not on tiktok.com)
├─────────────────────────────────────┤
│ Trust Badge                         │
│   🛡️ 100% Local Processing          │
│   [Home] [Help] [☕ Support] [⭐ Rate]│  ← 4-column footer
└─────────────────────────────────────┘
```

### 7.2 5 个 type 的展示与备份提示

| Type | Checkbox id | 默认 | 备份提示 | 提示触发 |
|---|---|---|---|---|
| Videos | `opt-videos` | ☐ | ⚠️ 永久删除不可恢复，建议下载 TikTok archive | 勾选时展开 |
| Reposts | `opt-reposts` | ☐ | ⚠️ Reposts 不能单独撤销，删除即删原视频 | 勾选时展开 |
| Likes | `opt-likes` | ☑ | （无）| - |
| Favorites | `opt-favorites` | ☑ | （无）| - |
| Following | `opt-following` | ☑ | （无）| - |

**为什么 Videos/Reposts 默认不勾选**：删除不可逆（Videos）或破坏性副作用（Reposts），强制用户主动确认。
**为什么 Likes/Favorites/Following 默认勾选**：取消点赞/收藏/关注是"可逆 + 风险低"操作。

### 7.3 进度/状态/日志/总结卡片交互

**Status Card**：
- 正常状态 → 延迟 1s 自动收起（节省空间）
- 异常状态 → 持续显示，红色 dot 警示
- Login hint → 未登录时显示"请先登录"提示

**Progress Card**：
- 显示旋转 spinner + "Processing..." 文字
- 进度条 = `processed / total * 100%`（total = maxPerType）
- 日志区域最多 50 条，超出自动 trim 顶部
- `[×]` 关闭按钮 → 等同 Stop（不删除已完成 item）

**Summary Card**：
- 显示 emoji ✅ + "Done!" + 统计文案
- "Support the developer" CTA 链接到 `https://socialeraser.app/support.html`

### 7.4 品牌色

| 颜色 | hex | 用途 |
|---|---|---|
| TikTok Pink | `#FE2C55` | 主操作按钮、强调色、备份提示边框 |
| TikTok Cyan | `#25F4EE` | 次要强调、processing 高亮、渐变终止 |
| TikTok Black | `#0F0F0F` | 背景色（与 TikTok dark mode 一致）|
| Zinc 800 | `#18181b` | 卡片背景 |
| Zinc 700 | `#27272a` | 边框、按钮次背景 |
| Zinc 500 | `#71717a` | 次要文字、placeholder |
| Green 500 | `#22c55e` | 成功状态、trust badge |
| Red 500 | `#ef4444` | 错误状态、Stop 按钮 |
| Yellow 500 | `#eab308` | 警告状态、Checking 状态 |
| Amber 500 | `#fbbf24` | 备份提示文字（`videosBackupTip`）|

**渐变**：主按钮 `linear-gradient(135deg, #FE2C55, #25F4EE)`，进度条 `linear-gradient(90deg, #FE2C55, #25F4EE)`。

### 7.5 8 语言切换

- 点击 🌐 按钮 → 下拉菜单显示 8 语言
- 每项：🇺🇸 English / 🇨🇳 简体中文 / 🇯🇵 日本語 / 🇰🇷 한국어 / 🇵🇹 Português / 🇪🇸 Español / 🇩🇪 Deutsch / 🇫🇷 Français
- 切换 → i18n.js 切换 DEFAULT_LANG → sidepanel 重新渲染（`data-i18n` / `data-i18n-html` / `data-i18n-placeholder` 替换）
- 选择持久化到 `chrome.storage.local` key `tiktokLanguage`

---

## 8. 数据需求

### 8.1 远程配置 schema

`src/config/default.json` 与 `src/config/remote-example.json` 必须字段一致：

```json
{
  "version": "1.0.0",
  "updated": "YYYY-MM-DD",
  "selectors": {
    "tiktokWebsite": {
      "patterns": ["tiktok.com", "www.tiktok.com"]
    },
    "login": {
      "checkElements": { /* 8 lang × {type, value}[] */ },
      "loggedInElements": [ /* {type, value}[] */ ],
      "globalIndicators": [ /* selector strings */ ]
    },
    "video": {
      "container": ["[data-e2e='user-post-item']", "article"],
      "moreButtons": ["...", "..."]   /* 8 lang aria-label 兜底 */
    },
    "repost": {
      "cardMarker": ["[data-e2e='repost']", "..."]
    },
    "like": {
      "container": ["[data-e2e='user-liked-item']", "article"],
      "unlikeButtons": ["[data-testid='unlike']", "..."]
    },
    "favorite": {
      "container": ["[data-e2e='user-favorite-item']", "article"],
      "unfavoriteButtons": ["[data-testid='unfavorite']", "..."]
    },
    "following": {
      "container": ["[data-e2e='user-following-item']", "[data-testid='cellInnerDiv']"],
      "unfollowButtons": ["[data-testid$='-unfollow']", "..."],
      "confirmButton": ["..."]
    },
    "common": {
      "articleContainers": ["[data-e2e='user-post-item']", "article"],
      "confirmButton": ["..."],
      "socialContext": ["[data-testid='socialContext']"],
      "timeElement": ["time[datetime]"],
      "videoText": ["[data-testid='video-desc']", "..."],
      "userInfo": {
        "userCell": ["[data-testid='UserCell']"],
        "userName": ["[data-testid='User-Name']"],
        "userDescription": ["[data-testid='UserDescription']"]
      },
      "viewCount": ["[data-e2e='video-views']", "..."]
    },
    "i18n": {
      "cancelKeywords": [ /* 8 lang */ ],
      "confirmKeywords": [ /* 8 lang */ ],
      "deleteKeywords": [ /* 8 lang */ ],
      "unfollowKeywords": [ /* 8 lang */ ],
      "repostKeywords": [ /* 8 lang */ ]
    }
  }
}
```

**字段约束**：
- `tiktokWebsite` / `login` / `i18n` 由独立 merge 路径处理，**不**入 `check-schema.js` 比对
- 其他所有 selector 块必须字段对齐（key 名一致，可选 value 内容可不同）
- `_comment` 字段不参与比对（metadata）

### 8.2 chrome.storage.local 结构

| Key | Type | 用途 | 写入时机 |
|---|---|---|---|
| `tiktokRemoteConfig` | object | 远程拉取的 config 缓存 | background fetch 成功 |
| `tiktokDailyUsage` | `{ date: 'YYYY-MM-DD', count: number }` | 每日使用量 | 每次 cleanup 完成 |
| `tiktokLanguage` | `'en' \| 'zh-CN' \| ...` | 用户选择的语言 | 切换语言时 |

**重置规则**：`tiktokDailyUsage.date` 与当前日期不一致 → 重置 count 为 0。

### 8.3 过滤器参数

Side Panel → Content 传递格式：

```javascript
{
  fromDate: 'YYYY-MM-DD' | null,
  toDate: 'YYYY-MM-DD' | null,
  keyword: string | null,        // 已 lowercase
  minViewCount: number | null,   // TikTok 特有
  maxViewCount: number | null    // TikTok 特有
}
```

**校验**：
- 日期格式必须 ISO `YYYY-MM-DD`（HTML5 `<input type="date">` 保证）
- view count 必须非负整数
- keyword 长度 ≤ 200（防止误粘贴长文本导致性能问题）

---

## 9. 集成与构建

### 9.1 3 端代码共享

**核心机制**：`src/` 是 Web UI 唯一来源（Single Source of Truth），通过 `npm run sync` 输出 3 套：

```
src/sidepanel.html  ─┬─→ www/                  (Capacitor webDir)
                    ├─→ extensions/chrome-tiktok/   (Chrome MV3)
                    └─→ extensions/edge-tiktok/     (Edge MV3)
```

**同步规则**（`scripts/sync-shared.js`）：
- `src/` → `www/` 整目录复制
- `src/sidepanel.html` 额外复制为 `www/index.html`（Capacitor WebView 入口）
- `src/` + `scripts/` + `chrome-source/` → `extensions/chrome-tiktok/`
- `src/` + `scripts/` + `edge-source/` → `extensions/edge-tiktok/`
- 任何 `platforms/*-project/` 含 `src/` 即被自动 pick up（**0 改动**支持新平台）

### 9.2 npm run sync 自动发现

`scripts/sync-shared.js:165-176` 扫描 `platforms/*-project/`，对每个含 `src/` 的目录执行同步。**TikTok 已被支持，无需修改 sync-shared.js**。

### 9.3 CWS / Edge Web Store 上架要求

**Chrome Web Store 必含**：
- `host_permissions`: `*://tiktok.com/*` + `*://www.tiktok.com/*` + `https://storage.googleapis.com/*`（CWS 审核必问）
- `permissions`: `storage` / `activeTab` / `sidePanel` / `tabs` / `scripting`
- `icons`: 16/48/128 PNG
- `default_locale`: `en`
- `_locales/en/messages.json` + 7 个其他语言

**Edge Web Store 额外要求**：
- `manifest.json` 含 `update_url: "https://clients2.partner.microsoft.com/..."`（x-project 已配置）
- Edge Chromium-based 与 Chrome MV3 完全兼容，无需代码分叉

**审核常见问题**（x-project 教训）：
- "Are you using Remote code?" → 答 "No"（仅读取远程 JSON 配置）
- "Why do you need host_permissions for tiktok.com?" → 解释：content script 注入到 TikTok 页面以执行 DOM 操作
- "Why do you need storage.googleapis.com?" → 解释：远程配置 CDN 用于 selector 热修

### 9.4 Capacitor 复用 webDir

**当前状态**（[capacitor.config.json](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/capacitor.config.json)）：
- `appId: com.socialeraser.tiktok`
- `appName: TikTok Eraser`
- `webDir: www`
- `backgroundColor: #0F0F0F`
- Splash 2s 启动

**Android**（推迟到 Q1 2027）：
- `npx cap add android` 生成 `platforms/tiktok-project/android/`
- 复用 x-project Android 工程模板

**iOS**（推迟到 Q1 2027）：
- `npx cap add ios` 生成 `platforms/tiktok-project/ios/`
- 复用 x-project iOS 工程模板

---

## 10. 验收标准（Acceptance Criteria）

### 10.1 5 个 type 功能验收

**Videos 验收**：
- [ ] 在 `tiktok.com/@username` 选中 5 条视频
- [ ] 启动 cleanup
- [ ] 30 秒内 5 条视频全部从 profile 消失
- [ ] TikTok 不触发验证码 / 429 拦截
- [ ] 日志显示 5 条 "Video #N deleted"
- [ ] 进度条从 0% → 100% 平滑过渡

**Reposts 验收**：
- [ ] 在 `tiktok.com/@username` 选中 3 条 repost
- [ ] 启动 cleanup
- [ ] 30 秒内 3 条 repost 全部消失
- [ ] 日志首行显示 "repostWarning"
- [ ] Side Panel backup tip 折叠时默认显示 8 语言
- [ ] 不误伤非 repost 的原创视频

**Likes 验收**：
- [ ] 在 `tiktok.com/@username/likes` 选中 10 条 liked video
- [ ] 启动 cleanup
- [ ] 15 秒内 10 条全部取消点赞
- [ ] 按钮状态从 filled ❤ → outlined ♡
- [ ] likes tab 列表为空

**Favorites 验收**：
- [ ] 在 `tiktok.com/@username/favorites` 选中 10 条
- [ ] 启动 cleanup
- [ ] 15 秒内 10 条全部取消收藏
- [ ] favorites tab 列表为空

**Following 验收**：
- [ ] 在 `tiktok.com/@username/following` 选中 10 个
- [ ] 启动 cleanup
- [ ] 30 秒内 10 个全部取关
- [ ] 按钮从 "Following" → "Follow"
- [ ] following 列表为空

### 10.2 8 语言验收

- [ ] Side Panel UI 全部 key 8 语言完整（验证脚本自动检查）
- [ ] TikTok 8 语言关键字（cancel/confirm/delete/unfollow/repost）齐全
- [ ] 切换语言 → 立即生效，无需刷新
- [ ] 语言选择持久化（重启浏览器后保持）
- [ ] backup tip 8 语言文案正确（特别是 "删除 Reposts" 表述）

### 10.3 性能验收

- [ ] 单 item 平均耗时 ≤ 1.0s
- [ ] Daily limit 5000/账号 准确生效
- [ ] Daily limit 触发 → 弹 tip 弹窗（8 语言 + 含 "tip/support developer/come back tomorrow"）
- [ ] click 间隔 800-1200ms（videos/reposts）/ 500-800ms（likes/favorites/following）
- [ ] Side Panel 启动 ≤ 200ms
- [ ] 远程配置拉取 ≤ 1s
- [ ] 进度更新延迟 ≤ 100ms

### 10.4 兼容性验收

- [ ] Chrome ≥ 88 加载 `extensions/chrome-tiktok/` 无错误
- [ ] Edge ≥ 88 加载 `extensions/edge-tiktok/` 无错误
- [ ] macOS / Windows / Linux 三平台均能跑通 5 type 清理
- [ ] 扩展图标在 toolbar 正常显示
- [ ] Side Panel 弹出 / 关闭正常

### 10.5 安全验收

- [ ] 不注入 inline script
- [ ] 不 eval 远程代码
- [ ] host_permissions 严格白名单
- [ ] HTTPS 强制（拒绝 HTTP 远程配置 URL）
- [ ] 外部链接全部 `rel="noopener noreferrer"`
- [ ] 日志不含用户凭证 / cookie / token
- [ ] CWS 审核问题清单全部答对

### 10.6 Verify 脚本验收

- [ ] `npm test` 全绿
- [ ] `scripts/verify-tiktok-i18n.js` 8 语言 × TikTok 新 key 完整
- [ ] `scripts/verify-actual-tiktok-selectors.js` 真实 TikTok DOM 验证 selector 决策
- [ ] `scripts/verify-tiktok-config-sync.js` default.json ↔ remote-example.json 对齐
- [ ] `scripts/check-schema.js` 迭代 `platforms/*-project/`（扩展后）
- [ ] `scripts/verify-syntax.js` 扫所有 `platforms/*-project/scripts/`
- [ ] `scripts/verify-sidepanel-bindings.js` 扫所有 `platforms/*-project/src/sidepanel.js`

---

## 11. 范围之外（Out of Scope）

### 11.1 V1 不实现的清理类型

| 类型 | 原因 | 未来 V2 计划 |
|---|---|---|
| **Watch History** | TikTok settings → Privacy → Clear history 已有内置单次操作 | V2.1 |
| **Comments** | 与 Reposts 高重叠，DOM 差异大（评论列表 ≠ 视频列表）| V2.2 |
| **Photos / Albums** | 涉及图床 + 视频转码，复杂度高 | V2.3 |
| **Drafts** | TikTok Web 暂不支持草稿管理 | 等 TikTok 开放 API |
| **Liked Comments** | 二级嵌套 | V2.4 |
| **Saved Sounds** | TikTok Music 版权复杂 | 暂不计划 |

### 11.2 V1 不实现的端

| 端 | 状态 | 计划 |
|---|---|---|
| **Chrome MV3** | ✅ 首发 | - |
| **Edge MV3** | ✅ 首发 | - |
| **Android (Capacitor)** | 推迟 | Q1 2027 |
| **iOS (Capacitor)** | 推迟 | Q1 2027 |
| **Firefox / Safari** | 不支持 | 视用户需求决定 |

### 11.3 V1 不实现的功能

| 功能 | 原因 |
|---|---|
| 跨页面 auto-resume | 增加复杂度，V1 仅当前页执行 |
| 定时任务 | V1 仅手动触发 |
| 多账号管理 | V1 仅当前登录账号 |
| 数据备份导出 | TikTok 官方已有 data archive |
| AI 智能识别 | 与 X Eraser 一致，KISS > 过度设计 |

### 11.4 V2 路线图

- Comments 清理（需重新设计 DOM selector）
- Watch History 集成（官方按钮触发）
- Android/iOS Capacitor 落地
- Photos/Albums 清理
- 跨账号 multi-account
- AI 智能推荐删除（基于 view count / engagement 自动建议）

---

## 12. 风险与缓解

### 12.1 技术风险

| 风险 | 等级 | 触发条件 | 缓解 |
|---|---|---|---|
| **TikTok 反自动化检测** | 高 | 连续 5+ 次点击间隔 < 800ms | 1) 强制 800-1200ms 间隔<br>2) 错误次数超 maxErrors 自动停止<br>3) 远程配置可调整 click delay |
| **Repost 不可独立删除** | 中 | 用户不理解"删除 repost = 删原视频" | 1) Side Panel 显著备份提示<br>2) 日志首行 `repostWarning`<br>3) 文档 + FAQ 双重说明 |
| **TikTok DOM 改版** | 中 | `data-e2e` 字段改名 / 移动 | 1) 远程配置 24h 拉取<br>2) 多 selector 兜底（data-e2e + aria + role）<br>3) `verify-actual-tiktok-selectors.js` 锁定 |
| **daily limit 误判** | 低 | localStorage 清空 / 时区切换 | 1) 用 `Date.toDateString()` 而非时间戳<br>2) 跨时区用 UTC 日期<br>3) daily limit 由 background 统一管理 |
| **Content script 重复注入** | 低 | manifest content_scripts + chrome.scripting.executeScript 双触发 | 1) `window.__TikTokEraserContentInjected` 防重入<br>2) 与 x-project 命名分前缀 |

### 12.2 业务风险

| 风险 | 等级 | 缓解 |
|---|---|---|
| **Marketing 7-type → 5-type 范围缩小** | 中 | FAQ 强调"More types coming — Watch History/Comments 在 V2 路线图" |
| **Repost 副作用与 X Eraser 行为差异** | 中 | Side Panel backup tip 显著提示 + 文档强调 |
| **TikTok 平台政策变更** | 中 | 远程热修 + 跟随官方政策调整 selector |
| **TikTok 反自动化加强 → 验证码** | 高 | 错误次数超阈值自动停止 + 提示用户手动完成剩余 |

### 12.3 工程风险

| 风险 | 等级 | 缓解 |
|---|---|---|
| **Selector schema 与 x-project 命名冲突** | 低 | TikTok 用 `video/like/favorite/following/repost`，避开 x 的 `tweet/retweet/reply` |
| **8 语言翻译成本** | 中 | 1) 复用 x-project 已有的 8 语言 key 翻译模板<br>2) 仅新增 TikTok 特有 key（videos/reposts/favorites/repostKeywords 等）<br>3) 机器翻译初稿 + 人工校对 |
| **3 端共享代码漂移** | 低 | 1) 每次大版本同步 x-project 和 tiktok-project<br>2) 共享 helper（safeClick / scrollToBottom）抽到 `packages/shared-core/`（WIP）|
| **verify 脚本扩展** | 低 | 复用 x-project `verify-*.js` 模式 + 扩展 3 个 TikTok 专用 |
| **CWS 审核延迟** | 中 | 1) 提前准备好审核问题清单（参照 x-project 经历）<br>2) 不使用任何 remote code<br>3) host_permissions 说明文档化 |

---

## 附录 A：当前进展与下一步

### A.1 已完成（5 类，10 文件）

| 文件 | 行数 | 评估 |
|---|---|---|
| [README.md](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/README.md) | 58 | ✅ 项目说明完整 |
| [package.json](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/package.json) | 12 | ✅ @capacitor/* 依赖 |
| [capacitor.config.json](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/capacitor.config.json) | 35 | ✅ appId + webDir + 品牌色 |
| [chrome-source/manifest.json](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/chrome-source/manifest.json) | 37 | ✅ host_permissions + sidePanel |
| [chrome-source/background.js](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/chrome-source/background.js) | ~40 | ✅ service worker |
| [edge-source/manifest.json](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/edge-source/manifest.json) | ~37 | ✅ 含 update_url |
| [edge-source/background.js](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/edge-source/background.js) | ~40 | ✅ 与 chrome 共享 |
| [scripts/tiktok-automation.js](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/scripts/tiktok-automation.js) | 1323 | ✅ 5 type + helpers 完整 |
| [scripts/content.js](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/scripts/content.js) | 337 | ✅ 登录态 + page type + 消息路由 |
| [src/sidepanel.html](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/src/sidepanel.html) | 648 | ✅ 5 type + 过滤器 + 进度 + summary |

### A.2 待办（5 类，14 文件）

| 文件 | 优先级 | 依赖 |
|---|---|---|
| [scripts/i18n.js](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/scripts/i18n.js) | P0 | 无（参考 x-project）|
| [src/sidepanel.js](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/src/sidepanel.js) | P0 | sidepanel.html |
| [src/_locales/en/messages.json](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/src/_locales/en/messages.json) | P0 | manifest.json (default_locale) |
| [src/_locales/zh_CN/messages.json](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/src/_locales/zh_CN/messages.json) | P0 | 同上 |
| [src/_locales/ja/messages.json](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/src/_locales/ja/messages.json) | P0 | 同上 |
| [src/_locales/ko/messages.json](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/src/_locales/ko/messages.json) | P0 | 同上 |
| [src/_locales/pt/messages.json](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/src/_locales/pt/messages.json) | P0 | 同上 |
| [src/_locales/es/messages.json](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/src/_locales/es/messages.json) | P0 | 同上 |
| [src/_locales/de/messages.json](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/src/_locales/de/messages.json) | P0 | 同上 |
| [src/_locales/fr/messages.json](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/src/_locales/fr/messages.json) | P0 | 同上 |
| [src/config/default.json](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/src/config/default.json) | P0 | tiktok-automation.js setConfig |
| [src/config/remote-example.json](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/src/config/remote-example.json) | P0 | default.json |
| [src/icons/icon{16,48,128}.png](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/src/icons/) | P0 | CWS 审核 |
| [scripts/verify-tiktok-i18n.js](file:///Volumes/XPSSD/workspaces/SocialEraser/scripts/verify-tiktok-i18n.js) | P1 | i18n.js + _locales |
| [scripts/verify-actual-tiktok-selectors.js](file:///Volumes/XPSSD/workspaces/SocialEraser/scripts/verify-actual-tiktok-selectors.js) | P1 | tiktok-automation.js |
| [scripts/verify-tiktok-config-sync.js](file:///Volumes/XPSSD/workspaces/SocialEraser/scripts/verify-tiktok-config-sync.js) | P1 | default.json + remote-example.json |

### A.3 跨平台扩展（需修改的现有脚本）

| 脚本 | 改动 |
|---|---|
| [scripts/check-schema.js](file:///Volumes/XPSSD/workspaces/SocialEraser/scripts/check-schema.js) | 从只检查 x-project 改为迭代 `platforms/*-project/` |
| [scripts/verify-syntax.js](file:///Volumes/XPSSD/workspaces/SocialEraser/scripts/verify-syntax.js) | 扫所有 `platforms/*-project/scripts/` |
| [scripts/verify-sidepanel-bindings.js](file:///Volumes/XPSSD/workspaces/SocialEraser/scripts/verify-sidepanel-bindings.js) | 扫所有 `platforms/*-project/src/sidepanel.js` |
| [scripts/run-verify.js](file:///Volumes/XPSSD/workspaces/SocialEraser/scripts/run-verify.js) | 注册 3 个新 verify 脚本 |
| [packages/marketing-website/platforms/tiktok/index.html](file:///Volumes/XPSSD/workspaces/SocialEraser/packages/marketing-website/platforms/tiktok/index.html) | 7-type → 5-type（删 Watch History + Comments 卡片）|
| [README.md](file:///Volumes/XPSSD/workspaces/SocialEraser/README.md) | TikTok 状态从 "not started" → 实际状态 |
| [ROADMAP.md](file:///Volumes/XPSSD/workspaces/SocialEraser/ROADMAP.md) | TikTok 里程碑从 Q4 2026 - Q1 2027 → 实际启动 |

### A.4 立即可执行（无依赖）

按以下顺序：

1. **创建 i18n.js**（参考 [x-project/scripts/i18n.js](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/x-project/scripts/i18n.js)）
   - DEFAULT_I18N 包含 8 语言 cancelKeywords/confirmKeywords/deleteKeywords/unfollowKeywords/repostKeywords
   - DEFAULT_LANG = 'en'，SUPPORTED_LANGS = 8 个
   - t() 函数与 x-project 签名一致

2. **创建 sidepanel.js**（与 sidepanel.html 配套）
   - 实现 status detection、option toggle、filter input、start/pause/stop、language switcher
   - 通过 chrome.runtime.sendMessage 与 background 通信

3. **创建 8 个 _locales/messages.json**
   - 从 x-project 复制改 TikTok 特有 key（videos/reposts/favorites/repostKeywords 等）
   - 8 语言全部完整（verify-tiktok-i18n 强制）

4. **创建 config/{default,remote-example}.json**
   - 字段对齐 [x-project default.json](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/x-project/src/config/default.json)
   - TikTok 特有 block：tiktokWebsite / video / repost / like / favorite / following

5. **创建 3 个 verify 脚本**（P1，先 i18n 后 selectors 后 config-sync）

6. **Marketing 同步**：7-type → 5-type

7. **Build 验证**：`npm run sync` → 加载 `extensions/chrome-tiktok/` 端到端测试
