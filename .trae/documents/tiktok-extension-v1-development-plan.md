# TikTok Eraser 实施计划（v1，可上架 CWS + Edge Web Store）

> **版本**：v1.1
> **作者**：Senior Frontend Architect
> **范围**：Chrome MV3 + Edge MV3（首发），Android/iOS 推迟到 Q1 2027
> **基础**：`.trae/documents/tiktok-extension-requirements-and-plan.md`（已完成的需求分析）
> **关联文件**：
> - 旧实施计划 [tiktok-implementation-plan.md](file:///Volumes/XPSSD/workspaces/SocialEraser/.trae/documents/tiktok-implementation-plan.md) — 内容基本一致，本计划聚焦"剩余执行"
> - 旧开发计划 [tiktok-frontend-development-plan.md](file:///Volumes/XPSSD/workspaces/SocialEraser/.trae/documents/tiktok-frontend-development-plan.md) — 内容基本一致，本计划聚焦"剩余执行"

---

## 1. 需求可行性分析

### 1.1 结论：**完全可行，工程量明确可控**

5 个清理类型（Videos / Reposts / Likes / Favorites / Following）的核心引擎已 100% 完成。所有剩余工作量集中在 **3 块纯组装工作**：

1. **UI/翻译层**（sidepanel.js + 8 语言 _locales）
2. **配置 + 资源**（default.json + tiktok-remote-example.json + PNG 图标）
3. **验证脚本**（3 个 TikTok 专用 + 4 个现有脚本扩展为多平台）

**不涉及新算法或新架构决策**。所有代码模式（i18n engine / safeClick / daily limit 弹窗 / 评分弹窗 / 远程热修）已在 x-project 验证并稳定运行。

### 1.2 已完成基线（11 个文件，~3700 行）

| 文件 | 行数 | 状态 | 说明 |
|---|---|---|---|
| [tiktok-automation.js](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/scripts/tiktok-automation.js) | 1323 | ✅ | 5 process 方法 + 7 helper + view count K/M/B 解析 + 8 语言关键字消费 |
| [content.js](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/scripts/content.js) | 337 | ✅ | 4 种 page type 检测 + 8 语言登录态 + 消息路由 + `__TikTokEraserContentInjected` 防重入 |
| [sidepanel.html](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/src/sidepanel.html) | 648 | ✅ | 5 checkbox + 4 维过滤器（含 view count）+ progress + summary + 4 列 footer |
| [scripts/i18n.js](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/scripts/i18n.js) | 1402 | ✅ | **本会话已完成** —— 8 语言 × ~90 key + DEFAULT_I18N 5 key + storage 隔离 |
| [chrome-source/manifest.json](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/chrome-source/manifest.json) | 37 | ✅ | host_permissions + content_scripts 顺序 + sidePanel |
| [chrome-source/background.js](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/chrome-source/background.js) | ~270 | ✅ | 3 级 config fallback + 6 类消息路由 |
| [edge-source/*](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/edge-source/) | ~307 | ✅ | Edge update_url + 共享 background |
| [README.md](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/README.md) | 58 | ✅ | 项目说明 |
| [package.json](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/package.json) | 12 | ✅ | @capacitor/* |
| [capacitor.config.json](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/capacitor.config.json) | 35 | ✅ | appId + webDir + 品牌色 |
| [CHANGELOG.md](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/CHANGELOG.md) | — | ✅ | — |

### 1.3 剩余工作量（共 16 个新文件 + 6 个改动）

```
~3700 行新代码：
  - sidepanel.js           ~1450 行
  - 8 × _locales/...        5 行 × 8 = 40 行
  - 2 × config/*.json     ~250 行 × 2 = 500 行
  - 3 × PNG 图标          二进制 0 行
  - 3 × verify-*.js 脚本  ~400 行
  
~200 行改动：
  - 3 个 verify 脚本扩展为多平台
  - 1 个 marketing 文件 7-type → 5-type
  - 2 个 doc 文件更新
```

### 1.4 风险评估

| 风险 | 等级 | 缓解 | 来源 |
|---|---|---|---|
| TikTok 反自动化（验证码 / 429）| 中-高 | videos/reposts 800-1200ms 间隔、likes/favorites/following 500-800ms、`maxErrors=10` 自动停止 | 需求 §4.1 |
| Repost 副作用（删除 repost = 删原视频）| 中 | Side Panel 显著 backup tip + 日志首行 `repostWarning` | 需求 §3.2 |
| TikTok DOM 改版 | 中 | 远程配置 24h 热修 + 多 selector 兜底 + 3 个 TikTok 专用 verify 脚本 | 需求 §12.1 |
| 8 语言翻译成本 | 低 | i18n.js 已在 1402 行落地，90 个 key × 8 语言完整 | 本会话已完成 |
| CWS 审核延迟 | 中 | 不使用任何 remote code、host_permissions 文档化 | 需求 §12.3 |
| 跨平台 storage / port 冲突 | 低 | 全部用 `tiktok*` / `TikTok*` 前缀隔离 | 需求 §1.2 |

### 1.5 范围澄清

**V1 范围内**（来自需求 §1.1 + §11.1）：
- 5 个清理类型：Videos / Reposts / Likes / Favorites / Following
- 2 端：Chrome MV3 + Edge MV3
- 3 端共用：同一份 `src/` 通过 `npm run sync` 输出到 www + extensions/chrome-tiktok + extensions/edge-tiktok

**V1 范围外**（明确不做）：
- ❌ Comments / Watch History / Drafts / Photos / Albums 清理（V2+）
- ❌ Android / iOS Capacitor 落地
- ❌ 跨页面 auto-resume
- ❌ 定时任务 / 多账号管理 / 数据备份导出
- ❌ 修改 x-project 任何文件（仅做参考复用）

---

## 2. 实施步骤（按依赖顺序，6 个 Phase）

```
Phase 0 (i18n 引擎) ✅ [已完成]  ──→  Phase 1 (sidepanel.js)  ──→  Phase 4 (验证脚本)  ──→  Phase 6 (Build + 文档)
                                              │                                                     ↑
                                              └─────→ Phase 2 (config) ────┐                        │
                                                    Phase 3 (图标) ────────────────────────────────┘
                                                    Phase 5 (营销页) ───────────────────────────────┘
```

---

### Phase 0：i18n 引擎层 ✅ 已完成

**状态**：✅ [scripts/i18n.js](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/scripts/i18n.js) 已完成（1402 行）

**已完成内容**：
- ✅ `window.TikTokEraseri18n` 命名空间（区别于 x-project 的 `window.XEraseri18n`）
- ✅ `DEFAULT_I18N` 5 个 TikTok 特有 key（`cancelKeywords` / `confirmKeywords` / `deleteKeywords` / `unfollowKeywords` / `repostKeywords`），每 key 8 语言数组
- ✅ `TRANSLATIONS` dict 8 语言块（en / zh-CN / ja / ko / pt / es / de / fr），每块约 90 key
- ✅ `SUPPORTED_LANGS` + `LANG_META`（8 语言 flag + native name）
- ✅ `t()` / `setLanguage()` / `getLanguage()` / `detectLanguage()` / `getLangMeta()` 方法
- ✅ storage key 隔离：`tiktokPreferredLang`（区别于 x-project 的 `preferredLang`）
- ✅ `chrome.storage.onChanged` 监听 `changes.tiktokPreferredLang`
- ✅ 硬约束：8 语言 `dailyLimitReachedHint` 含 "tip / support developer / come back tomorrow" 关键词

---

### Phase 1：Side Panel JS 逻辑层（P0，无依赖，~1450 行）

**目标**：让 [sidepanel.html](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/src/sidepanel.html) 的 5 个 checkbox、过滤器、按钮、状态卡片、进度卡片、Summary 卡片、4 列 footer 全部有响应。

#### 步骤 1.1：创建 [src/sidepanel.js](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/src/sidepanel.js)

参考 [x-project/src/sidepanel.js](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/x-project/src/sidepanel.js) 模板（约 1466 行），**严格遵守**：

**1. namespace 全部替换**：
- `window.XEraseri18n` → `window.TikTokEraseri18n`
- `getPatterns()` → `['*://tiktok.com/*', '*://www.tiktok.com/*']`
- `t('openXWebsite')` → `t('openTikTokWebsite')` / `t('pleaseOpenX')` → `t('pleaseOpenTikTok')` / `t('xWebsiteDetected')` → `t('tiktokWebsiteDetected')`
- `t('xArchive')` → `t('archiveLinkText')`（TikTok data download 链接）
- storage key：`dailyUsage` → `tiktokDailyUsage` / `preferredLang` → `tiktokPreferredLang` / `ratingPrompt` → `tiktokRatingPrompt`
- 错误日志前缀：`[X Eraser]` → `[TikTok Eraser]`

**2. checkbox 映射**（参考 [sidepanel.html:515-549](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/src/sidepanel.html#L515-L549)）：

```javascript
var TYPE_ID_MAP = {
  'videos': 'videos',
  'reposts': 'reposts',
  'likes': 'likes',
  'favorites': 'favorites',
  'following': 'following'
};
```

5 个 type 全是顶级 checkbox，**无子选项**。

**3. 过滤器**（[sidepanel.html:567-576](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/src/sidepanel.html#L567-L576) 含 `#filter-view-min` / `#filter-view-max`）：

```javascript
var minVC = (minViewCountEl && minViewCountEl.value !== '') ? Number(minViewCountEl.value) : null;
var maxVC = (maxViewCountEl && maxViewCountEl.value !== '') ? Number(maxViewCountEl.value) : null;
if (minVC !== null && (!Number.isFinite(minVC) || minVC < 0)) { /* 校验失败处理 */ }
if (maxVC !== null && (!Number.isFinite(maxVC) || maxVC < 0)) { /* 校验失败处理 */ }
var filters = (fromDate || toDate || keyword || minVC !== null || maxVC !== null)
  ? { fromDate, toDate, keyword, minViewCount: minVC, maxViewCount: maxVC } : null;
```

这两个新字段是 TikTok 特有，[tiktok-automation.js:647-659](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/scripts/tiktok-automation.js#L647-L659) `matchesFilter` 已实现消费。

**4. BACKUP TIP 联动**（[sidepanel.html:520-533](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/src/sidepanel.html#L520-L533)）：
- 2 个 `.backup-tip`（videos + reposts）
- `syncBackupTip()` 绑定 `opt-videos` / `opt-reposts` 的 change 事件
- 勾上 → `.option-item` 加 `.show-backup-tip` → CSS 把 `.backup-tip` 从 `display:none` 切到 `display:flex`

**5. 页面类型不匹配检查**（V1 仅 warning，不阻断）：
- 检测 `state.pageType` vs 选中的 type
- 不匹配 → `addLog('typeRequiresNav', 'warn')` 提示用户
- V1 行为：仅当前页执行；跨页 auto-resume 是 V2

**6. i18n key 完整列表**（约 90 个 key，从 x-project 复用 + TikTok 新增）：
- UI 标签（35+ key）：`openTikTokWebsite` / `pleaseLogin` / `checking` / `tiktokWebsiteDetected` / `videos` / `reposts` / `likes` / `favorites` / `following` / `minViewCount` / `maxViewCount` / `viewCountUnlimited` / `archiveLinkText` / ...
- 备份提示（2 key）：`videosBackupTip` / `repostsBackupTip`
- 弹窗警告（8 key）：`noItemsSelected` / `dailyLimitReached` / `dailyLimitReachedHint` / `upgradeToPremium` / ...
- 日志消息（35+ key）：`startingVideosCleanup` / `repostWarning` / `startingLikesCleanup` / `startingFavoritesCleanup` / `startingFollowingCleanup` / `clickedUnfollow` / `clickedUnlike` / `clickedUnfavorite` / ...
- 评分弹窗（10+ key）：`ratePromptTitle` / `ratePromptBody` / `ratePromptLabel1..5` / `ratePromptSkip` / ...

**7. 关键修复（从 x-project 复用）**：
- `_dailyUsageChain` 单飞串行链（防 read-modify-write 竞态）
- `state.typeStartCumulative` 初始化为 0（不能依赖 cleanupTypeStart 兜底）
- `syncBackupTip` 必须在 `bindEvents` 之后调
- Status card `8s` 卡在"检测中"时弹刷新提示

**8. 验证**：
```bash
node -c platforms/tiktok-project/src/sidepanel.js   # 语法检查
node scripts/verify-sidepanel-bindings.js           # checkbox / data-i18n 绑定验证
```

---

### Phase 2：远程配置层（P0，~2 文件，~500 行）

**目标**：让 `TikTokInjector.setConfig` 有真实数据可读 + 远程热修有基础数据可发。

#### 步骤 2.1：创建 [src/config/default.json](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/src/config/default.json)

参考 [x-project/src/config/default.json](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/x-project/src/config/default.json) 结构（370 行），**TikTok 特有块**：

```json
{
  "version": "1.0.0",
  "updated": "2026-06-28",
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
      "moreButtons": ["...", "..." /* 8 lang aria-label */ ]
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

**消费点**（[tiktok-automation.js:55-95](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/scripts/tiktok-automation.js#L55-L95) 已写好读取路径）：
- `config.common.confirmButton` / `socialContext` / `timeElement` / `videoText` / `userInfo.*` / `viewCount`
- `config.video.moreButtons` / `container`
- `config.like.unlikeButtons` / `container`
- `config.favorite.unfavoriteButtons` / `container`
- `config.following.unfollowButtons` / `container` / `confirmButton`
- `config.repost.cardMarker`
- `config.login.*`（由 content.js 消费）

#### 步骤 2.2：创建 [src/config/tiktok-remote-example.json](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/src/config/tiktok-remote-example.json)

**字节级与 default.json 完全一致**（防回归 —— x-project 2026-06-19 tweets-bug-7 教训：只改 default 不改 remote，断网时能跑、联网时不能跑，行为不一致）。

#### 步骤 2.3：CDN 上传（**用户手动，不在代码范围**）

将 `tiktok-remote-example.json` 上传至 `https://storage.googleapis.com/social-tool-bucket/tiktok-remote-example.json`（与 [background.js:19](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/chrome-source/background.js#L19) 的 `CONFIG_URL` 一致）。

#### 步骤 2.4：验证

```bash
node scripts/verify-tiktok-config-sync.js   # 字节级一致 + schema 对齐
node scripts/check-schema.js                 # selectors 字段对齐
```

---

### Phase 3：图标资源（P0，3 个 PNG 文件）

#### 步骤 3.1：创建 3 个 PNG 图标

| 路径 | 尺寸 |
|---|---|
| [src/icons/icon16.png](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/src/icons/icon16.png) | 16×16 |
| [src/icons/icon48.png](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/src/icons/icon48.png) | 48×48 |
| [src/icons/icon128.png](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/src/icons/icon128.png) | 128×128 |

**关键设计**（基于项目记忆 lessons-learned）：
- 主色：TikTok Pink `#FE2C55` + Cyan `#25F4EE` 渐变背景
- 中心元素：音符 ♪ 或 TikTok logo 简化版
- **必须 RGB 模式，无 alpha 通道**（lesson: palette PNG alpha 通道在 dark theme 显黑边）

**PNG 验证**（用 PIL 抽样 4 角 + 4 边中点）：
```python
from PIL import Image
img = Image.open('icon128.png')
samples = [
    (0, 0), (img.width-1, 0),
    (0, img.height-1), (img.width-1, img.height-1),
    (img.width//2, 0), (img.width//2, img.height-1),
    (0, img.height//2), (img.width-1, img.height//2)
]
for pos in samples:
    pixel = img.getpixel(pos)
    assert img.mode == 'RGB', f"Image mode is {img.mode}, must be RGB"
    print(f"  corner {pos}: {pixel}")
# 任一像素是 RGBA(0,0,0,0) 都会在 dark theme 显黑边
```

#### 步骤 3.2（可选）：[scripts/render-icons.swift](file:///Volumes/XPSSD/workspaces/SocialEraser/scripts/render-icons.swift) 追加 TikTok 生成逻辑

参考 x-project 用法，SwiftUI 脚本生成 16/48/128 三档 PNG。**非阻塞**，可先用占位 PNG 跑通 build。

---

### Phase 4：验证脚本（P1，3 个新 + 3 个改造）

#### 步骤 4.1：创建 3 个 TikTok 专用 verify 脚本

| 路径 | 基于 | TikTok 特有断言 |
|---|---|---|
| [scripts/verify-tiktok-i18n.js](file:///Volumes/XPSSD/workspaces/SocialEraser/scripts/verify-tiktok-i18n.js) | [verify-i18n.js](file:///Volumes/XPSSD/workspaces/SocialEraser/scripts/verify-i18n.js) | 1) 8 个 `_locales/<lang>/messages.json` 存在<br>2) 每个含 `ext_name` + `ext_description`<br>3) `scripts/i18n.js` 8 语言 × ~90 key 完整<br>4) 8 语言 `dailyLimitReachedHint` 含 "tip / support developer / come back tomorrow"<br>5) i18n.js 用 `tiktokPreferredLang` 隔离<br>6) `window.TikTokEraseri18n` 命名空间<br>7) `chrome.storage.onChanged` 监听 `tiktokPreferredLang`<br>8) i18n.js 含 `DEFAULT_I18N` 5 key × 8 语言 |
| [scripts/verify-actual-tiktok-selectors.js](file:///Volumes/XPSSD/workspaces/SocialEraser/scripts/verify-actual-tiktok-selectors.js) | [verify-actual-x-selectors.js](file:///Volumes/XPSSD/workspaces/SocialEraser/scripts/verify-actual-x-selectors.js) | 1) tiktok-automation.js 不引用 x 旧 type（`tweet` / `retweet` / `bookmark` / `reply`）<br>2) 含 5 个 process 方法（`processVideos` / `processReposts` / `processLikes` / `processFavorites` / `processFollowing`）<br>3) 含 `parseViewCount`（K/M/B 后缀）<br>4) 暴露 `window.TikTokInjector`<br>5) content.js 暴露 `__TikTokEraserContentInjected`<br>6) content.js 监听 4 种 page type<br>7) manifest.json 含 `*://tiktok.com/*` + `*://www.tiktok.com/*` + `https://storage.googleapis.com/*`<br>8) PNG 图标 16/48/128 存在 + > 0 字节 |
| [scripts/verify-tiktok-config-sync.js](file:///Volumes/XPSSD/workspaces/SocialEraser/scripts/verify-tiktok-config-sync.js) | [verify-config-sync.js](file:///Volumes/XPSSD/workspaces/SocialEraser/scripts/verify-config-sync.js) | 1) `default.json` ↔ `tiktok-remote-example.json` 字节级一致<br>2) 顶层 `version` / `updated` 一致<br>3) `selectors` 顶层 key 集合一致<br>4) `tiktokWebsite.patterns` 含 `tiktok.com` + `www.tiktok.com`<br>5) i18n 5 key 都有 8 语言条目<br>6) `video` / `like` / `following` selector 块非空<br>7) `common.viewCount` 数组非空（TikTok 特有） |

#### 步骤 4.2：改造 3 个现有脚本支持多平台

| 脚本 | 改动 | 备注 |
|---|---|---|
| [scripts/check-schema.js](file:///Volumes/XPSSD/workspaces/SocialEraser/scripts/check-schema.js) | 迭代 `platforms/*-project/` | 每 platform 独立例外块（x: `login`/`xWebsite`/`i18n`；tiktok: `login`/`tiktokWebsite`/`i18n`）|
| [scripts/verify-sidepanel-bindings.js](file:///Volumes/XPSSD/workspaces/SocialEraser/scripts/verify-sidepanel-bindings.js) | 迭代 `platforms/*-project/src/` | 每 platform 跑一遍，输出汇总 |
| [scripts/run-verify.js](file:///Volumes/XPSSD/workspaces/SocialEraser/scripts/run-verify.js) | 在 `ALL_SCRIPTS` 数组末尾追加 3 行 | 注册 3 个新 verify 脚本 |

[scripts/verify-syntax.js](file:///Volumes/XPSSD/workspaces/SocialEraser/scripts/verify-syntax.js) **0 改动**（已支持多平台，[第 25-27 行](file:///Volumes/XPSSD/workspaces/SocialEraser/scripts/verify-syntax.js#L25-L27) 扫描整个 `platforms/` 目录）。

#### 步骤 4.3：验证

```bash
npm test   # 期望 12 (现有) + 3 (新) = 15 个脚本全过
```

---

### Phase 5：营销页同步（P1，~1 文件）

**目标**：7-type → 5-type 改造，对齐实际能力，避免 CWS 审核与用户期待不一致。

#### 步骤 5.1：修改 [packages/marketing-website/platforms/tiktok/index.html](file:///Volumes/XPSSD/workspaces/SocialEraser/packages/marketing-website/platforms/tiktok/index.html)

| 改动 | 行号 | 改动前 | 改动后 |
|---|---|---|---|
| H2 标题 | 120 | `Seven Kinds of TikTok Cleanup, One Extension` | `Five Kinds of TikTok Cleanup, One Extension` |
| 删除 Watch History 卡片 | 129 | `<h3>Watch History</h3>` | 删除整行 `<div class="card card--hover">` |
| 删除 Comments 卡片 | 130 | `<h3>Comments</h3>` | 删除整行 `<div class="card card--hover">` |

**改动前后验证**：
```bash
grep -c "Watch History" packages/marketing-website/platforms/tiktok/index.html   # 改前 ≥ 1，改后 0
grep -c "Comments" packages/marketing-website/platforms/tiktok/index.html        # 改前 ≥ 1，改后 0
```

**保留项目硬约束**：
- ✅ `/support.html` 链接保留（全 14 文件全含）
- ✅ 全部外部链接含 `rel="noopener noreferrer"`
- ✅ Reviews section 检查（项目硬约束：< 6 条真实评论前必须隐藏）

---

### Phase 6：Build 验证 + 文档（收尾，~3 文件）

#### 步骤 6.1：跑 `npm run sync` 生成 3 个输出目录

```bash
node scripts/sync-shared.js --no-cap   # 跳过 cap copy（MVP 不需要 android/ios）
```

**期望输出**：
- `platforms/tiktok-project/www/` 生成（Capacitor webDir）
- `extensions/chrome-tiktok/` 生成（Chrome MV3）
- `extensions/edge-tiktok/` 生成（Edge MV3）

#### 步骤 6.2：跑 `npm test` 全量验证

```bash
npm test
```

**期望**：15 个脚本全过（原 12 + 新 3 = 15）。任一失败立即修复。

#### 步骤 6.3：更新 [README.md](file:///Volumes/XPSSD/workspaces/SocialEraser/README.md) — TikTok 状态

找到"TikTok / Not started / Coming Q4 2026" 段落，改为：

```markdown
## Platforms

- **X Eraser** — ✅ Shipped (Chrome Web Store + Edge Web Store, v1.0.1)
- **TikTok Eraser** — ✅ MVP ready, pending store submission
```

#### 步骤 6.4：更新 [ROADMAP.md](file:///Volumes/XPSSD/workspaces/SocialEraser/ROADMAP.md) — TikTok 里程碑

找到 TikTok 相关段落，标记 Q3 2026 → 实际启动（"TikTok Eraser MVP — code complete, store submission pending"）。

#### 步骤 6.5：更新 [platforms/tiktok-project/CHANGELOG.md](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/CHANGELOG.md)

记录本次改动：

```markdown
## [Unreleased]

### Added
- i18n engine (`scripts/i18n.js`) with 8-language support
- side panel logic (`src/sidepanel.js`) with view count filter
- 8 locale files (`src/_locales/<lang>/messages.json`)
- bundled + remote config (`src/config/{default,tiktok-remote-example}.json`)
- 3 verify scripts (`scripts/verify-tiktok-{i18n,actual-tiktok-selectors,config-sync}.js`)
- 3 icon files (`src/icons/icon{16,48,128}.png`)

### Changed
- 3 existing verify scripts (check-schema, verify-sidepanel-bindings, run-verify) now support `platforms/*-project/`
- marketing website (`packages/marketing-website/platforms/tiktok/index.html`) 7-type → 5-type
```

---

## 3. 文件改动清单

### 3.1 新建文件（16 个）

| # | 路径 | 行数预估 | 依赖 |
|---|---|---|---|
| 1 | [platforms/tiktok-project/src/sidepanel.js](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/src/sidepanel.js) | ~1450 | i18n.js（已完成）+ sidepanel.html（已完成）|
| 2 | [platforms/tiktok-project/src/_locales/en/messages.json](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/src/_locales/en/messages.json) | 5 | 无 |
| 3 | [platforms/tiktok-project/src/_locales/zh_CN/messages.json](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/src/_locales/zh_CN/messages.json) | 5 | 无 |
| 4 | [platforms/tiktok-project/src/_locales/ja/messages.json](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/src/_locales/ja/messages.json) | 5 | 无 |
| 5 | [platforms/tiktok-project/src/_locales/ko/messages.json](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/src/_locales/ko/messages.json) | 5 | 无 |
| 6 | [platforms/tiktok-project/src/_locales/pt/messages.json](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/src/_locales/pt/messages.json) | 5 | 无 |
| 7 | [platforms/tiktok-project/src/_locales/es/messages.json](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/src/_locales/es/messages.json) | 5 | 无 |
| 8 | [platforms/tiktok-project/src/_locales/de/messages.json](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/src/_locales/de/messages.json) | 5 | 无 |
| 9 | [platforms/tiktok-project/src/_locales/fr/messages.json](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/src/_locales/fr/messages.json) | 5 | 无 |
| 10 | [platforms/tiktok-project/src/config/default.json](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/src/config/default.json) | ~250 | 无 |
| 11 | [platforms/tiktok-project/src/config/tiktok-remote-example.json](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/src/config/tiktok-remote-example.json) | ~250 | default.json（必须字节级一致）|
| 12 | [platforms/tiktok-project/src/icons/icon16.png](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/src/icons/icon16.png) | 二进制 | 无 |
| 13 | [platforms/tiktok-project/src/icons/icon48.png](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/src/icons/icon48.png) | 二进制 | 无 |
| 14 | [platforms/tiktok-project/src/icons/icon128.png](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/src/icons/icon128.png) | 二进制 | 无 |
| 15 | [scripts/verify-tiktok-i18n.js](file:///Volumes/XPSSD/workspaces/SocialEraser/scripts/verify-tiktok-i18n.js) | ~150 | i18n.js + 8 _locales |
| 16 | [scripts/verify-actual-tiktok-selectors.js](file:///Volumes/XPSSD/workspaces/SocialEraser/scripts/verify-actual-tiktok-selectors.js) | ~120 | tiktok-automation.js + content.js + manifest |
| 17 | [scripts/verify-tiktok-config-sync.js](file:///Volumes/XPSSD/workspaces/SocialEraser/scripts/verify-tiktok-config-sync.js) | ~120 | default.json + tiktok-remote-example.json |

### 3.2 修改文件（6 个）

| # | 路径 | 改动 |
|---|---|---|
| 1 | [scripts/check-schema.js](file:///Volumes/XPSSD/workspaces/SocialEraser/scripts/check-schema.js) | 迭代 `platforms/*-project/` |
| 2 | [scripts/verify-sidepanel-bindings.js](file:///Volumes/XPSSD/workspaces/SocialEraser/scripts/verify-sidepanel-bindings.js) | 迭代 `platforms/*-project/src/` |
| 3 | [scripts/run-verify.js](file:///Volumes/XPSSD/workspaces/SocialEraser/scripts/run-verify.js) | 在 `ALL_SCRIPTS` 数组末尾追加 3 行 |
| 4 | [packages/marketing-website/platforms/tiktok/index.html](file:///Volumes/XPSSD/workspaces/SocialEraser/packages/marketing-website/platforms/tiktok/index.html) | 7-type → 5-type 改造 |
| 5 | [README.md](file:///Volumes/XPSSD/workspaces/SocialEraser/README.md) | TikTok 状态更新 |
| 6 | [ROADMAP.md](file:///Volumes/XPSSD/workspaces/SocialEraser/ROADMAP.md) | TikTok 里程碑更新 |
| 7 | [platforms/tiktok-project/CHANGELOG.md](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/CHANGELOG.md) | 记录本次改动 |

### 3.3 外部操作（不在代码改动范围）

- 上传 `tiktok-remote-example.json` 到 `https://storage.googleapis.com/social-tool-bucket/tiktok-remote-example.json`（CDN 写权限属于用户）
- 准备 icon PNG 源文件（可用 [scripts/render-icons.swift](file:///Volumes/XPSSD/workspaces/SocialEraser/scripts/render-icons.swift) 生成，或从素材库取）
- 在 Chrome Web Store 提交扩展 zip（`extensions/chrome-tiktok/` 打包后）
- 在 Edge Web Store 提交扩展 zip（`extensions/edge-tiktok/` 打包后）

---

## 4. 执行顺序

```
Phase 1 (sidepanel.js) ──→ Phase 4 (验证脚本) ──→ Phase 6 (Build + 文档)
   │                            ↑
   └─────→ Phase 2 (config) ────┘
         Phase 3 (图标)
         Phase 5 (营销页)
```

**关键依赖**：
- Phase 0 已完成（i18n.js 1402 行就位）
- Phase 1 可立即开始（依赖 i18n.js + sidepanel.html，**两者都已就绪**）
- Phase 2 独立可与 Phase 1 并行
- Phase 3 完全独立，可与任何阶段并行
- Phase 4 依赖 Phase 1/2/3 完成
- Phase 5 完全独立
- Phase 6 必须在所有 Phase 完成后

---

## 5. 假设与决策

### 5.1 假设（基于现有代码与项目规范）

1. **i18n.js 位置**：放在 `platforms/tiktok-project/scripts/i18n.js`（与 x-project 范式一致），**不**在 `src/i18n.js` 重复。`sidepanel.html` 引用 `<script src="i18n.js">`，构建时 `scripts/i18n.js` 会覆盖 `src/i18n.js`（如后者不存在则不覆盖）。
2. **storage 命名空间**：用 `tiktokPreferredLang` / `tiktokDailyUsage` / `tiktokRemoteConfig` / `tiktokRatingPrompt` 前缀隔离。
3. **8 语言顺序**：`['en', 'zh-CN', 'ja', 'ko', 'pt', 'es', 'de', 'fr']`（与 x-project 完全一致）。
4. **5 type 全部顶级 checkbox**：无子选项。
5. **VIEW COUNT filter**：在 sidepanel.html 已有 `#filter-view-min` / `#filter-view-max` 输入框，sidepanel.js 需读取并传给 `startCleanup.options.filters.minViewCount/maxViewCount`。
6. **跨页面跳转**：V1 不实现，仅在 startCleanup 启动时记录 warning。
7. **营销页改造范围**：仅 `packages/marketing-website/platforms/tiktok/index.html` 一个文件。
8. **图标资源**：用 [scripts/render-icons.swift](file:///Volumes/XPSSD/workspaces/SocialEraser/scripts/render-icons.swift) 生成（如可执行）或用户手动提供。

### 5.2 决策点（已选定，无需询问）

| 决策点 | 选择 | 依据 |
|---|---|---|
| 是否实现跨页面 auto-resume | ❌ 否（V1）| 需求 §11.3 明确推迟到 V2 |
| 评分弹窗 | ✅ 复用 x-project 模板 | 需求 §10.2 要求 i18n 8 语言完整，模板已就绪 |
| Tip model | ✅ 复用（无订阅逻辑）| 项目硬约束 |
| Daily limit | 5000/天 | 与 x-project 一致 |
| Build 工具 | 复用 `npm run sync` | 0 改动（sync-shared.js 已支持自动发现）|
| Capacitor | ❌ 跳过（V1 不上线 Android/iOS）| 需求 §11.2 推迟到 Q1 2027，使用 `--no-cap` 跳过 cap copy |

---

## 6. 验证步骤

### 6.1 每个 Phase 完成的验证

| Phase | 验证命令 |
|---|---|
| Phase 1 | `node -c platforms/tiktok-project/src/sidepanel.js` + `node scripts/verify-sidepanel-bindings.js` |
| Phase 2 | `node scripts/verify-tiktok-config-sync.js` + `node scripts/check-schema.js` |
| Phase 3 | `node scripts/verify-actual-tiktok-selectors.js` 中 PNG 检查通过 |
| Phase 4 | `npm test` 全部 15 个脚本通过 |
| Phase 5 | `grep -c "Watch History\|Comments" packages/marketing-website/platforms/tiktok/index.html` 期望 0 |
| Phase 6 | `node scripts/sync-shared.js --no-cap` 成功；3 个输出目录生成 |

### 6.2 端到端冒烟（手动，必做）

加载 `extensions/chrome-tiktok/` 到 Chrome，打开 `https://www.tiktok.com/@xxx`：

1. ✅ Side Panel 弹出
2. ✅ Status Card 显示 "TikTok website detected" + "Logged in"
3. ✅ 5 个 checkbox 渲染正确（videos/reposts 默认不勾选；likes/favorites/following 默认勾选）
4. ✅ 4 维过滤器渲染正确（from date / to date / keyword / min views / max views）
5. ✅ 勾选 likes → 点击 Start → 进度条 + 日志实时更新
6. ✅ 暂停 / 继续 / 停止 按钮可用
7. ✅ 完成后 summary 卡片弹出，CTA 链接到 support.html
8. ✅ 切换语言 → 立即生效（日文/中文/西文任一）
9. ✅ daily limit 弹窗测试：临时把 `FREE_LIMIT_PER_DAY` 改成 1 → 第二次启动应弹 tip 弹窗

---

## 7. 不在本次范围

明确**不做**的事（避免越界）：
- ❌ 不实现 Comments / Watch History / Drafts 清理（V2+）
- ❌ 不实现 Android / iOS Capacitor 落地
- ❌ 不实现跨页面 auto-resume
- ❌ 不实现 AI 智能推荐删除
- ❌ 不修改 x-project 任何文件（仅做参考复用）
- ❌ 不重命名已有的 `window.XEraseri18n` / `xRemoteConfig` / `xeraser-logger` 等 x-project 命名
- ❌ 不改 `tiktok-automation.js` / `content.js` / `sidepanel.html`（已完成的代码保持稳定）
- ❌ 不创建新的 marketing 文件（仅修改 1 个 tiktok index.html）
