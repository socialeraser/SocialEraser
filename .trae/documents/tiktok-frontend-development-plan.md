# TikTok Eraser 开发计划（资深前端架构师视角）

> **版本**：v1.0
> **作者**：Senior Frontend Architect
> **目标**：基于需求分析报告 `tiktok-extension-requirements-and-plan.md`，把 TikTok Eraser 从「核心引擎已就绪」推到「可上架 Chrome Web Store + Edge Web Store」状态
> **范围**：Chrome MV3 + Edge MV3 首发，Android/iOS 推迟到 Q1 2027
> **不做的事**：Comments / Watch History / Drafts 清理；Capacitor 落地；跨页面 auto-resume

---

## 1. 需求可行性分析（先回答用户的问题）

### 1.1 结论：**完全可行，工程量集中且可控**

剩余工作量 ≈ **3800 行新代码 + 200 行改动**，**全部是「翻译 / 接线 / 验证脚本」类组装工作**，不涉及新算法或新架构决策。所有 5 个清理类型的 DOM 引擎已在 [tiktok-automation.js](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/scripts/tiktok-automation.js)（1323 行）里 100% 完成。

### 1.2 已完成基线（10 个文件，~2000 行）

| 文件 | 行数 | 状态 | 引用 |
|---|---|---|---|
| 核心引擎 [tiktok-automation.js](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/scripts/tiktok-automation.js) | 1323 | ✅ 5 process 方法 + 7 helper + view count 解析 + K/M/B 后缀解析 + 8 语言关键字消费 | 第 23-25 行引用 `window.TikTokEraseri18n.DEFAULT_I18N` |
| 入口 [content.js](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/scripts/content.js) | 337 | ✅ 4 种 page type 检测 + 8 语言登录态 + 消息路由 + `__TikTokEraserContentInjected` 防重入 | 第 72-121 行 8 语言关键字 |
| UI 模板 [sidepanel.html](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/src/sidepanel.html) | 648 | ✅ 5 checkbox + 4 维过滤器（含 view count）+ progress + summary + 4 列 footer | 第 517-548 行 5 个 checkbox id 锁定 |
| 清单 [chrome-source/manifest.json](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/chrome-source/manifest.json) | 37 | ✅ host_permissions + content_scripts 顺序 + sidePanel | 第 19-22 行 tiktok.com 双域名 |
| Service Worker [chrome-source/background.js](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/chrome-source/background.js) | ~270 | ✅ 3 级 config fallback + 6 类消息路由 | 第 19 行 CONFIG_URL + 第 21 行注入顺序 |
| Edge 镜像 [edge-source/](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/edge-source/) | ~307 | ✅ Edge update_url + 共享 background | — |
| [README.md](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/README.md) | 58 | ✅ | — |
| [package.json](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/package.json) | 12 | ✅ @capacitor/* | — |
| [capacitor.config.json](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/capacitor.config.json) | 35 | ✅ appId + webDir + 品牌色 | — |
| [CHANGELOG.md](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/CHANGELOG.md) | — | ✅ | — |

### 1.3 风险评估（按等级降序）

| 风险 | 等级 | 缓解 | 来源 |
|---|---|---|---|
| TikTok 反自动化（验证码 / 429）| 中-高 | videos/reposts 800-1200ms 间隔、likes/favorites/following 500-800ms、`maxErrors=10` 自动停止 | 需求 §4.1 |
| Repost 副作用（删除 repost = 删原视频）| 中 | Side Panel 显著 backup tip + 日志首行 `repostWarning` + 文档强调 | 需求 §3.2 |
| TikTok DOM 改版（`data-e2e` 改名）| 中 | 远程配置 24h 热修 + 多 selector 兜底（语义 + aria + data-e2e）+ 3 个 TikTok 专用 verify 脚本 | 需求 §12.1 |
| 8 语言翻译成本 | 中 | 复用 x-project 已有的 key 翻译模板，仅新增 TikTok 特有 key | 需求 §12.3 |
| CWS 审核延迟 | 中 | 不使用任何 remote code、host_permissions 文档化、复用 x-project 审核问题答案 | 需求 §12.3 |
| 跨平台 storage / port 冲突 | 低 | 全部用 `tiktok*` / `TikTok*` 前缀隔离（已在 background.js / content.js 落实） | 需求 §1.2 |

### 1.4 验证（按 x-project 模板可直接复用）

| 复用点 | TikTok 对应 | 备注 |
|---|---|---|
| i18n 引擎（TRANSLATIONS dict + t() + LANG_META）| 复制并改 namespace：`window.TikTokEraseri18n` | 90 个 key × 8 语言 ≈ 720 个翻译条目 |
| 工具函数（safeClick / scrollToBottom / waitFor*）| 已在 tiktok-automation.js 落地 | 5 type 路径更简 |
| daily limit 5000 + 8 语言 tip 弹窗 | 复用模板，硬约束保留 | 8 语言 dailyLimitReachedHint 必须含 "tip / support developer / come back tomorrow" 关键词 |
| `npm run sync` 自动发现 | 0 改动（sync-shared.js 已迭代 `platforms/*-project/`）| — |
| Chrome MV3 manifest 模板 | 复制，host_permissions 改为 tiktok 双域名 | 已有 |

### 1.5 范围澄清

**V1 范围内**（来自需求 §1.1 + §11.1）：
- 5 个清理类型：Videos / Reposts / Likes / Favorites / Following
- 2 端：Chrome MV3 + Edge MV3
- 3 端共用：同一份 `src/` 通过 `npm run sync` 输出到 www + extensions/chrome-tiktok + extensions/edge-tiktok

**V1 范围外**（不做，避免越界）：
- ❌ Comments / Watch History / Drafts / Photos / Albums 清理（V2+）
- ❌ Android / iOS Capacitor 落地
- ❌ 跨页面 auto-resume
- ❌ 定时任务 / 多账号管理 / 数据备份导出
- ❌ 修改 x-project 任何文件（仅做参考复用）

---

## 2. 实施步骤（按依赖顺序，6 个 Phase）

```
Phase 0 (i18n 引擎)  ──→  Phase 1 (sidepanel.js)  ──→  Phase 4 (验证脚本)  ──→  Phase 6 (Build + 文档)
         │                      │                                                     ↑
         └─────→ Phase 2 (config) ────┘                                                │
                Phase 3 (图标) ─────────────────────────────────────────────────────────┘
                Phase 5 (营销页) ────────────────────────────────────────────────────────┘
```

---

### Phase 0：i18n 引擎层（P0，无依赖，~1500 行）

**目标**：让 [tiktok-automation.js:23-25](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/scripts/tiktok-automation.js#L23-L25) 的 `window.TikTokEraseri18n.DEFAULT_I18N` 有值可用，让 sidepanel.html 的 `data-i18n*` 属性有翻译可替换。

#### 步骤 0.1：创建 [scripts/i18n.js](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/scripts/i18n.js)

参考 [x-project/scripts/i18n.js](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/x-project/scripts/i18n.js) 的结构，**严格遵守**：

- **全局命名空间**：`window.TikTokEraseri18n`（区别于 x-project 的 `window.XEraseri18n`）
- **`DEFAULT_I18N` 5 个 TikTok 特有 key**（每 key 8 语言数组）：
  - `cancelKeywords`：`Cancel` / `取消` / `キャンセル` / `취소` / `Cancelar` / `Abbrechen` / `Annuler` / `Annulla`
  - `confirmKeywords`：`Delete` / `删除` / `削除` / `삭제` / `Excluir` / `Eliminar` / `Löschen` / `Supprimer` / `Elimina`
  - `deleteKeywords`：与 `confirmKeywords` 相同（TikTok 多数用 Delete 单一按钮）
  - `unfollowKeywords`：`Unfollow` / `取消关注` / `フォロー解除` / `언팔로우` / `Deixar de seguir` / `Dejar de seguir` / `Nicht mehr folgen` / `Ne plus suivre`
  - `repostKeywords`：`Repost` / `Reposted` / `转发` / `リポスト` / `재게시` / `Repostar` / `Repostear` / `Reposten` / `Republier`
- **`TRANSLATIONS` dict**：8 个语言块（en / zh-CN / ja / ko / pt / es / de / fr），每块约 90 个 key。**关键新增 key**（与 x-project 不重叠）：
  - UI label：`openTikTokWebsite` / `pleaseOpenTikTok` / `tiktokWebsiteDetected` / `pleaseRefreshTikTokPage` / `videos` / `reposts` / `likes` / `favorites` / `following` / `minViewCount` / `maxViewCount` / `viewCountUnlimited` / `archiveLinkText` (含 TikTok data download 链接)
  - 备份提示：`videosBackupTip` / `repostsBackupTip`
  - 日志：`startingVideosCleanup` / `repostWarning` / `repostDeleteWarning` / `unrepostImpossible` / `startingLikesCleanup` / `startingFavoritesCleanup` / `startingFollowingCleanup` / `clickedUnfollow` / `clickedUnlike` / `clickedUnfavorite` 等
- **`SUPPORTED_LANGS = ['en', 'zh-CN', 'ja', 'ko', 'pt', 'es', 'de', 'fr']`**
- **`LANG_META`**：8 语言 flag + native name（与 x-project 完全相同，复用）
- **方法**：`detectLanguage()` / `setLanguage(lang)` / `getLanguage()` / `getSupportedLanguages()` / `getLangMeta(lang)` / `t(key, vars)` / `applyTranslations(rootEl)`
- **storage key**：用 `tiktokPreferredLang` 隔离（x-project 用 `preferredLang`）
- **监听器**：`chrome.storage.onChanged.addListener` 监听 `changes.tiktokPreferredLang`，切换语言即时同步

#### 步骤 0.2：创建 8 个 [src/_locales/](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/src/_locales/) 文件

> **关键澄清**：这 8 个文件**只用于 MV3 manifest 的 `__MSG_ext_name__` / `__MSG_ext_description__` 替换**，每个文件只有 2 个 key。运行时 UI 翻译由 `scripts/i18n.js` 的 `TRANSLATIONS` dict 提供（与 x-project 完全一致的范式）。

每个文件结构：
```json
{
  "ext_name": { "message": "TikTok Eraser", "description": "Extension name" },
  "ext_description": { "message": "<8 语言翻译>", "description": "Extension description" }
}
```

| 文件 | ext_description |
|---|---|
| `en/messages.json` | `Batch cleanup tool for TikTok` |
| `zh_CN/messages.json` | `TikTok 批量清理工具` |
| `ja/messages.json` | `TikTok 一括削除ツール` |
| `ko/messages.json` | `TikTok 일괄 정리 도구` |
| `pt/messages.json` | `Ferramenta de limpeza em massa do TikTok` |
| `es/messages.json` | `Herramienta de limpieza masiva de TikTok` |
| `de/messages.json` | `TikTok Massenbereinigungstool` |
| `fr/messages.json` | `Outil de nettoyage en masse TikTok` |

#### 步骤 0.3：硬约束验证

- ✅ `dailyLimitReachedHint` 8 语言都必须含 "tip / support developer / come back tomorrow" 关键词
- ✅ `considerSupporting` / `gotIt` / `supportProject` 3 个新 key 8 语言完整
- ✅ `sidepanel.html` 第 637 行已含 `<a data-i18n="supportProject" href="https://socialeraser.app/support.html">` —— i18n.js 必须翻译 `supportProject`

---

### Phase 1：Side Panel JS 逻辑层（P0，~1450 行）

**目标**：让 [sidepanel.html](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/src/sidepanel.html) 的 5 个 checkbox、过滤器、按钮、状态卡片、进度卡片、Summary 卡片、4 列 footer 全部有响应。

#### 步骤 1.1：创建 [src/sidepanel.js](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/src/sidepanel.js)

参考 [x-project/src/sidepanel.js](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/x-project/src/sidepanel.js) 模板（约 1466 行），**适配点**：

1. **namespace 全部替换**：
   - `window.XEraseri18n` → `window.TikTokEraseri18n`
   - `getPatterns()` 返回 `['*://tiktok.com/*', '*://www.tiktok.com/*']`
   - `t('openXWebsite')` → `t('openTikTokWebsite')` / `t('xWebsiteDetected')` → `t('tiktokWebsiteDetected')` / `t('xArchive')` → TikTok archive link
   - storage key：`dailyUsage` → `tiktokDailyUsage` / `preferredLang` → `tiktokPreferredLang` / `ratingPrompt` → `tiktokRatingPrompt`
   - 错误日志前缀 `[X Eraser]` → `[TikTok Eraser]`

2. **checkbox 映射**（参考 [sidepanel.html:515-549](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/src/sidepanel.html#L515-L549)）：
   ```javascript
   var TYPE_ID_MAP = {
     'videos': 'videos',
     'reposts': 'reposts',
     'likes': 'likes',
     'favorites': 'favorites',
     'following': 'following'
   };
   ```
   5 个 type 全是顶级 checkbox，无子选项。

3. **过滤器**（[sidepanel.html:567-576](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/src/sidepanel.html#L567-L576) 有 `#filter-view-min` / `#filter-view-max`）：
   ```javascript
   var minVC = (minViewCountEl && minViewCountEl.value !== '') ? Number(minViewCountEl.value) : null;
   var maxVC = (maxViewCountEl && maxViewCountEl.value !== '') ? Number(maxViewCountEl.value) : null;
   if (minVC !== null && (!Number.isFinite(minVC) || minVC < 0)) { /* 校验失败处理 */ }
   if (maxVC !== null && (!Number.isFinite(maxVC) || maxVC < 0)) { /* 校验失败处理 */ }
   var filters = (fromDate || toDate || keyword || minVC !== null || maxVC !== null)
     ? { fromDate, toDate, keyword, minViewCount: minVC, maxViewCount: maxVC } : null;
   ```
   这两个新字段是 TikTok 特有，[tiktok-automation.js:647-659](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/scripts/tiktok-automation.js#L647-L659) `matchesFilter` 已实现消费。

4. **BACKUP TIP 联动**：[sidepanel.html:520-533](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/src/sidepanel.html#L520-L533) 有 2 个 `.backup-tip`（videos + reposts），`syncBackupTip()` 绑定 `opt-videos` / `opt-reposts` 的 change 事件。

5. **页面类型不匹配检查**：增加 pageType-vs-selectedType 警告日志（不阻断 V1）——V1 仅在当前页执行，跨页 auto-resume 是 V2。

6. **i18n key 完整列表**（约 90 个 key，从 x-project 复用 + TikTok 新增）：UI 标签 / 弹窗警告 / 日志消息 / 评分弹窗 4 大类，共 ~720 个翻译条目。

---

### Phase 2：远程配置层（P0，~2 文件，~500 行）

**目标**：让 `TikTokInjector.setConfig` 有真实数据可读 + 远程热修有基础数据可发。

#### 步骤 2.1：创建 [src/config/default.json](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/src/config/default.json)

参考 [x-project/src/config/default.json](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/x-project/src/config/default.json) 的结构（370 行），**TikTok 特有块**：

- `selectors.tiktokWebsite.patterns`：`["tiktok.com", "www.tiktok.com"]`
- `selectors.login.checkElements` / `loggedInElements` / `globalIndicators`：从 [content.js:43-121](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/scripts/content.js#L43-L121) 完整移入
- `selectors.video`：`{ container: ["[data-e2e='user-post-item']", "article"], moreButtons: ["...", "..." 8 语言 aria-label] }`
- `selectors.repost`：`{ cardMarker: ["[data-e2e='repost']", "socialContext 含 repost 关键字"] }`
- `selectors.like`：`{ container, unlikeButtons: ["[data-testid='unlike']", "..." 8 语言] }`
- `selectors.favorite`：`{ container, unfavoriteButtons }`
- `selectors.following`：`{ container, unfollowButtons: ["[data-testid$='-unfollow']", "..." 8 语言], confirmButton }`
- `selectors.common`：`{ articleContainers, confirmButton, socialContext, timeElement, videoText, userInfo: { userCell, userName, userDescription }, viewCount: ["[data-e2e='video-views']", "..."] }`
- `selectors.i18n`：5 个 8 语言关键字数组（与 i18n.js 的 `DEFAULT_I18N` 对齐）
- 顶层：`version: "1.0.0"`, `updated: "2026-06-28"`

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

#### 步骤 2.3：CDN 上传（用户手动，不在代码范围）

将 `tiktok-remote-example.json` 上传至 `https://storage.googleapis.com/social-tool-bucket/tiktok-remote-example.json`（与 [background.js:19](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/chrome-source/background.js#L19) 的 `CONFIG_URL` 一致）。

---

### Phase 3：图标资源（P0，~3 文件）

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

#### 步骤 3.2（可选）：[scripts/render-icons.swift](file:///Volumes/XPSSD/workspaces/SocialEraser/scripts/render-icons.swift) 追加 TikTok 生成逻辑

参考 x-project 用法，SwiftUI 脚本生成 16/48/128 三档 PNG。**非阻塞**，可先用占位 PNG 跑通 build。

---

### Phase 4：验证脚本（P1，3 个新 + 4 个改造）

#### 步骤 4.1：创建 3 个 TikTok 专用 verify 脚本

| 路径 | 基于 | TikTok 特有断言（~8-10 条/脚本）|
|---|---|---|
| [scripts/verify-tiktok-i18n.js](file:///Volumes/XPSSD/workspaces/SocialEraser/scripts/verify-tiktok-i18n.js) | [verify-i18n.js](file:///Volumes/XPSSD/workspaces/SocialEraser/scripts/verify-i18n.js) | 1) 8 个 _locales/messages.json 存在<br>2) 每个含 ext_name + ext_description<br>3) scripts/i18n.js 8 语言 × ~90 个 key 完整<br>4) 8 语言 dailyLimitReachedHint 含 "tip/support developer/come back tomorrow"<br>5) i18n.js 用 `tiktokPreferredLang` 隔离<br>6) `window.TikTokEraseri18n` 命名空间<br>7) chrome.storage.onChanged 监听 `tiktokPreferredLang` |
| [scripts/verify-actual-tiktok-selectors.js](file:///Volumes/XPSSD/workspaces/SocialEraser/scripts/verify-actual-tiktok-selectors.js) | [verify-actual-x-selectors.js](file:///Volumes/XPSSD/workspaces/SocialEraser/scripts/verify-actual-x-selectors.js) | 1) tiktok-automation.js 不引用 x 旧 type（tweet/retweet/bookmark/reply）<br>2) 含 5 个 process 方法<br>3) 含 `parseViewCount`（K/M/B 后缀）<br>4) 暴露 `window.TikTokInjector`<br>5) content.js 暴露 `__TikTokEraserContentInjected`<br>6) content.js 监听 4 种 page type<br>7) manifest.json 含 tiktok.com 双域名 + storage.googleapis.com<br>8) PNG 图标 16/48/128 存在 + > 0 字节 |
| [scripts/verify-tiktok-config-sync.js](file:///Volumes/XPSSD/workspaces/SocialEraser/scripts/verify-tiktok-config-sync.js) | [verify-config-sync.js](file:///Volumes/XPSSD/workspaces/SocialEraser/scripts/verify-config-sync.js) | 1) default.json ↔ tiktok-remote-example.json 字节级一致<br>2) 顶层 version/updated 一致<br>3) selectors 顶层 key 集合一致<br>4) tiktokWebsite.patterns 含 tiktok.com + www.tiktok.com<br>5) i18n 5 key 都有 8 语言条目<br>6) video/like/following selector 块非空 |

#### 步骤 4.2：改造 3 个现有脚本支持多平台

| 脚本 | 改动 | 备注 |
|---|---|---|
| [scripts/check-schema.js](file:///Volumes/XPSSD/workspaces/SocialEraser/scripts/check-schema.js) | 迭代 `platforms/*-project/` | 每 platform 独立例外块（x: login/xWebsite/i18n；tiktok: login/tiktokWebsite/i18n）|
| [scripts/verify-sidepanel-bindings.js](file:///Volumes/XPSSD/workspaces/SocialEraser/scripts/verify-sidepanel-bindings.js) | 迭代 `platforms/*-project/src/` | 每 platform 跑一遍，输出汇总 |
| [scripts/run-verify.js](file:///Volumes/XPSSD/workspaces/SocialEraser/scripts/run-verify.js) | 注册 3 个新脚本 | 在 `ALL_SCRIPTS` 数组末尾追加 3 行 |

[scripts/verify-syntax.js](file:///Volumes/XPSSD/workspaces/SocialEraser/scripts/verify-syntax.js) **0 改动**（已支持多平台，[第 25-27 行](file:///Volumes/XPSSD/workspaces/SocialEraser/scripts/verify-syntax.js#L25-L27) 扫描整个 `platforms/` 目录）。

---

### Phase 5：营销页同步（P1，~1 文件）

**目标**：7-type → 5-type 改造，对齐实际能力，避免 CWS 审核与用户期待不一致。

#### 步骤 5.1：修改 [packages/marketing-website/platforms/tiktok/index.html](file:///Volumes/XPSSD/workspaces/SocialEraser/packages/marketing-website/platforms/tiktok/index.html)

| 改动 | 行号 | 改动前 | 改动后 |
|---|---|---|---|
| H2 标题 | 120 | `Seven Kinds of TikTok Cleanup, One Extension` | `Five Kinds of TikTok Cleanup, One Extension` |
| 删除 Watch History 卡片 | 129 | `<h3>Watch History</h3>` | 删除整行 `<div class="card card--hover">` |
| 删除 Comments 卡片 | 130 | `<h3>Comments</h3>` | 删除整行 `<div class="card card--hover">` |
| Hero 文案 | 8 | 描述包含"5 项" | 已对齐 5 type（无需改）|

**改动前后验证**：
```bash
grep -c "Watch History" packages/marketing-website/platforms/tiktok/index.html   # 改前 ≥ 1，改后 0
grep -c "Comments" packages/marketing-website/platforms/tiktok/index.html        # 改前 ≥ 1，改后 0
```

**保留项目硬约束**：
- ✅ `/support.html` 链接保留
- ✅ 全部外部链接含 `rel="noopener noreferrer"`
- ✅ Reviews section 检查（项目硬约束：< 6 条真实评论前必须隐藏）

---

### Phase 6：Build 验证 + 文档（收尾，~3 文件）

#### 步骤 6.1：跑 `npm run sync` 生成 3 个输出目录

```bash
node scripts/sync-shared.js --no-cap   # 跳过 cap copy（MVP 不需要 android/ios）
```

期望：
- `platforms/tiktok-project/www/` 生成（Capacitor webDir）
- `extensions/chrome-tiktok/` 生成
- `extensions/edge-tiktok/` 生成

#### 步骤 6.2：跑 `npm test` 全量验证

```bash
node scripts/run-verify.js
```

期望：15 个脚本全过（原 12 + 新 3 = 15）。任一失败立即修复。

#### 步骤 6.3：更新文档（3 个文件）

| 文件 | 改动 |
|---|---|
| [README.md](file:///Volumes/XPSSD/workspaces/SocialEraser/README.md) | "TikTok / Not started / Coming Q4 2026" → "✅ MVP ready, pending store submission" |
| [ROADMAP.md](file:///Volumes/XPSSD/workspaces/SocialEraser/ROADMAP.md) | TikTok 里程碑 Q4 2026 → Q3 2026 实际启动 |
| [platforms/tiktok-project/CHANGELOG.md](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/CHANGELOG.md) | 记录本次改动（i18n + sidepanel.js + 8 _locales + 2 config + 3 verify + 3 icon + 4 verify 改造 + 1 营销页）|

---

## 3. 文件改动清单

### 3.1 新建（16 个文件）

| # | 路径 | 行数预估 | Phase |
|---|---|---|---|
| 1 | [platforms/tiktok-project/scripts/i18n.js](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/scripts/i18n.js) | ~1500 | 0 |
| 2 | [platforms/tiktok-project/src/sidepanel.js](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/src/sidepanel.js) | ~1450 | 1 |
| 3-10 | [platforms/tiktok-project/src/_locales/](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/src/_locales/) × 8 | 5 × 8 = 40 | 0 |
| 11 | [platforms/tiktok-project/src/config/default.json](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/src/config/default.json) | ~250 | 2 |
| 12 | [platforms/tiktok-project/src/config/tiktok-remote-example.json](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/src/config/tiktok-remote-example.json) | ~250 | 2 |
| 13-15 | [platforms/tiktok-project/src/icons/](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/src/icons/) × 3 | 二进制 | 3 |
| 16 | [scripts/verify-tiktok-i18n.js](file:///Volumes/XPSSD/workspaces/SocialEraser/scripts/verify-tiktok-i18n.js) | ~150 | 4 |
| 17 | [scripts/verify-actual-tiktok-selectors.js](file:///Volumes/XPSSD/workspaces/SocialEraser/scripts/verify-actual-tiktok-selectors.js) | ~120 | 4 |
| 18 | [scripts/verify-tiktok-config-sync.js](file:///Volumes/XPSSD/workspaces/SocialEraser/scripts/verify-tiktok-config-sync.js) | ~120 | 4 |

**合计**：~3930 行新代码

### 3.2 修改（7 个文件）

| # | 路径 | 改动 | Phase |
|---|---|---|---|
| 1 | [scripts/check-schema.js](file:///Volumes/XPSSD/workspaces/SocialEraser/scripts/check-schema.js) | 迭代 `platforms/*-project/` | 4 |
| 2 | [scripts/verify-sidepanel-bindings.js](file:///Volumes/XPSSD/workspaces/SocialEraser/scripts/verify-sidepanel-bindings.js) | 迭代 `platforms/*-project/src/` | 4 |
| 3 | [scripts/run-verify.js](file:///Volumes/XPSSD/workspaces/SocialEraser/scripts/run-verify.js) | 注册 3 个新脚本 | 4 |
| 4 | [packages/marketing-website/platforms/tiktok/index.html](file:///Volumes/XPSSD/workspaces/SocialEraser/packages/marketing-website/platforms/tiktok/index.html) | 7-type → 5-type | 5 |
| 5 | [README.md](file:///Volumes/XPSSD/workspaces/SocialEraser/README.md) | TikTok 状态更新 | 6 |
| 6 | [ROADMAP.md](file:///Volumes/XPSSD/workspaces/SocialEraser/ROADMAP.md) | TikTok 里程碑更新 | 6 |
| 7 | [platforms/tiktok-project/CHANGELOG.md](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/CHANGELOG.md) | 记录本次改动 | 6 |

**合计**：~200 行改动

### 3.3 外部操作（不在代码改动范围）

- 上传 `tiktok-remote-example.json` 到 `https://storage.googleapis.com/social-tool-bucket/tiktok-remote-example.json`
- 准备 icon PNG 源文件（可用 `scripts/render-icons.swift` 生成）
- 在 Chrome Web Store 提交扩展 zip
- 在 Edge Web Store 提交扩展 zip

---

## 4. 关键决策（已选定）

| 决策点 | 选择 | 依据 |
|---|---|---|
| 是否实现跨页面 auto-resume | ❌ 否（V1）| 需求 §11.3 明确推迟到 V2 |
| 评分弹窗 | ✅ 复用 x-project 模板 | 模板已就绪 |
| Tip model | ✅ 复用（无订阅逻辑）| 项目硬约束 |
| Daily limit | 5000/天 | 与 x-project 一致 |
| Build 工具 | 复用 `npm run sync` | sync-shared.js 已支持自动发现 |
| Capacitor | ❌ 跳过（V1 不上线 Android/iOS）| 用 `--no-cap` 跳过 cap copy |
| verify 脚本分 x 专用 vs 多平台通用 | 两者并存 | 3 个 tiktok 专用 + 4 个改造 |
| i18n.js 位置 | `scripts/i18n.js`（不在 `src/i18n.js` 重复）| 与 x-project 范式一致 |
| storage 命名空间 | `tiktok*` 前缀全隔离 | 与 x-project 不冲突 |

---

## 5. 验证步骤

### 5.1 每 Phase 完成验证

| Phase | 验证命令 |
|---|---|
| 0 | `node -c platforms/tiktok-project/scripts/i18n.js` 通过；8 个 _locales 文件 JSON.parse 成功 |
| 1 | `node -c platforms/tiktok-project/src/sidepanel.js` 通过；`scripts/verify-sidepanel-bindings.js` 通过 |
| 2 | `scripts/verify-tiktok-config-sync.js` 通过；`scripts/check-schema.js` 通过 |
| 3 | `scripts/verify-actual-tiktok-selectors.js` 中 PNG 检查通过 |
| 4 | `npm test` 全部 15 个脚本通过 |
| 5 | `grep -c "Watch History\|Comments" packages/marketing-website/platforms/tiktok/index.html` 期望 0 |
| 6 | `node scripts/sync-shared.js --no-cap` 成功；3 个输出目录生成 |

### 5.2 端到端冒烟（手动，必做）

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

## 6. 不在本次范围（明确边界）

- ❌ 不实现 Comments / Watch History / Drafts 清理（V2+）
- ❌ 不实现 Android / iOS Capacitor 落地
- ❌ 不实现跨页面 auto-resume
- ❌ 不实现 AI 智能推荐删除
- ❌ 不修改 x-project 任何文件（仅做参考复用）
- ❌ 不重命名已有的 x-project 命名（`window.XEraseri18n` / `xRemoteConfig` 等保持不动）
- ❌ 不改 [tiktok-automation.js](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/scripts/tiktok-automation.js) / [content.js](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/scripts/content.js) / [sidepanel.html](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/src/sidepanel.html)（已完成的代码保持稳定）
- ❌ 不创建新的 marketing 文件（仅修改 1 个 tiktok index.html）
