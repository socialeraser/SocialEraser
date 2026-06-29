# TikTok Eraser 实施计划

> **版本**：v1.0
> **作者**：Senior Frontend Architect
> **目标**：基于 `.trae/documents/tiktok-extension-requirements-and-plan.md`（已完成的需求分析报告），落地 TikTok Eraser MVP 至 CWS / Edge Web Store 可上架状态
> **范围**：仅 Chrome MV3 + Edge MV3（Android/iOS 推迟到 Q1 2027）

---

## 1. 需求可行性分析（Feasibility）

### 1.1 结论：**完全可行，工程量明确可控**

5 个清理类型（Videos / Reposts / Likes / Favorites / Following）的核心引擎已 100% 完成，剩余工作量集中在 **i18n 层 + 远程配置 + 验证脚本** 三块 —— 都是从 x-project 复用模板的纯翻译/组装工作，不涉及新的算法或架构决策。

### 1.2 已完成基线（5/5 引擎代码 + 2/2 入口）

| 文件 | 行数 | 状态 | 说明 |
|---|---|---|---|
| [tiktok-automation.js](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/scripts/tiktok-automation.js) | 1323 | ✅ 已完成 | 5 个 process 方法 + 7 个 helper + 过滤器 + view count 解析 |
| [content.js](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/scripts/content.js) | 337 | ✅ 已完成 | 8 语言登录态 + 4 种 page type 检测 + 消息路由 |
| [sidepanel.html](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/src/sidepanel.html) | 648 | ✅ 已完成 | 5 type 复选框 + 4 维过滤器（含 view count）+ progress + summary |
| [chrome-source/manifest.json](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/chrome-source/manifest.json) | 37 | ✅ 已完成 | host_permissions 含 tiktok.com + storage CDN |
| [chrome-source/background.js](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/chrome-source/background.js) | ~270 | ✅ 已完成 | 远程 config 3 级 fallback + 消息路由 |
| [edge-source/*](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/edge-source/) | ~37+270 | ✅ 已完成 | Edge Web Store update_url + 共享 background |

### 1.3 风险评估

| 风险 | 等级 | 缓解 | 来源 |
|---|---|---|---|
| TikTok DOM 改版（data-e2e 改名）| 中 | 远程配置 24h 热修 + 多 selector 兜底（语义 + aria + data-e2e）+ 3 个 TikTok 专用 verify 脚本 | 需求 §12.1 |
| TikTok 反自动化检测（验证码 / 429）| 中-高 | videos/reposts 800-1200ms 间隔、likes/favorites/following 500-800ms、maxErrors=10 自动停止 | 需求 §12.1 |
| Repost 副作用（删除 repost = 删原视频）| 中 | Side Panel 显著 backup tip + 日志首行 `repostWarning` + 文档强调 | 需求 §3.2 |
| 跨平台 storage / port 冲突 | 低 | 已用 `tiktokRemoteConfig` / `tiktokeraser-logger` / `__TikTokEraserContentInjected` / `TikTokInjector` 全部前缀隔离 | 需求 §1.2 |
| 8 语言翻译成本 | 中 | 复用 x-project 已有的 key 翻译模板，仅新增 TikTok 特有 key | 需求 §12.3 |
| CWS 审核延迟 | 中 | 不使用任何 remote code、host_permissions 文档化、复用 x-project 审核问题答案 | 需求 §12.3 |

### 1.4 范围澄清

**已确认在 V1 范围内**（来自需求 §1.1 + §11.1）：
- 5 个清理类型：Videos / Reposts / Likes / Favorites / Following
- 2 端：Chrome MV3 + Edge MV3
- 3 端共用：同一份 `src/sidepanel.html` 通过 `npm run sync` 输出到 www + extensions/chrome-tiktok + extensions/edge-tiktok

**已确认在 V1 范围外**（不在本次实施范围）：
- ❌ Comments / Watch History / Drafts / Photos / Albums 清理（V2+）
- ❌ Android / iOS Capacitor 落地（推迟到 Q1 2027）
- ❌ 跨页面 auto-resume（V1 仅当前页执行，type 与 page type 不匹配时提示用户手动跳转）
- ❌ 定时任务 / 多账号管理 / 数据备份导出

### 1.5 与 x-project 的复用关系

| 模式 | TikTok 复用方式 |
|---|---|
| 工具函数（safeClick / scrollToBottom / waitFor*）| 复制精简（5 type 不需要 retweet / bookmark 复杂路径）|
| i18n 引擎（TRANSLATIONS dict + t() + LANG_META）| 复制并改 namespace：`window.TikTokEraseri18n` |
| daily limit 5000 + 8 语言 tip 弹窗 | 复用 x-project 模板，硬约束保留（"tip/support developer/come back tomorrow" 关键词）|
| `npm run sync` 自动发现 | 0 改动（sync-shared.js 已迭代 `platforms/*-project/`）|
| Chrome MV3 manifest 模板 | 复制，host_permissions 改为 `*://tiktok.com/*` + `*://www.tiktok.com/*` |

---

## 2. 实施步骤

### Phase 0：i18n 引擎层（P0，无依赖，~3 文件）

**目标**：让 tiktok-automation.js 第 23-25 行 `window.TikTokEraseri18n.DEFAULT_I18N` 有值可用

**步骤 0.1**：创建 [scripts/i18n.js](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/scripts/i18n.js)

参考 [x-project/scripts/i18n.js](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/x-project/scripts/i18n.js) 的结构，**严格遵守**：

- 全局命名空间：`window.TikTokEraseri18n`（区别于 x-project 的 `window.XEraseri18n`）
- `DEFAULT_I18N` 5 个 key（TikTok 特有）：
  - `cancelKeywords`：8 语言 `Cancel` / `取消` / `キャンセル` / `취소` / `Cancelar` / `Abbrechen` / `Annuler`
  - `confirmKeywords`：`Delete` / `删除` / `削除` / `삭제` / `Excluir` / `Eliminar` / `Löschen` / `Supprimer`
  - `deleteKeywords`：与 confirmKeywords 相同（TikTok 多数用 Delete 单一按钮）
  - `unfollowKeywords`：`Unfollow` / `取消关注` / `フォロー解除` / `언팔로우` / `Deixar de seguir` / `Dejar de seguir` / `Entfolgen` / `Ne plus suivre`
  - `repostKeywords`：`Repost` / `Reposted` / `转发` / `リポスト` / `재게시` / `Repostado` / `Repostear` / `Repostet` / `Republier`
- `SUPPORTED_LANGS = ['en', 'zh-CN', 'ja', 'ko', 'pt', 'es', 'de', 'fr']`
- `LANG_META`：8 语言 flag + native name（与 x-project 完全相同，复用）
- `detectLanguage()`：从 `navigator.language` 推断
- `setLanguage(lang) / getLanguage() / getSupportedLanguages() / getLangMeta(lang)` 四个方法
- **`chrome.storage.local.get(['tiktokPreferredLang'])`** 启动时覆盖检测值（x-project 用 `preferredLang`，TikTok 用前缀隔离）
- **`chrome.storage.onChanged.addListener` 监听 `changes.tiktokPreferredLang`**，切换语言即时同步

**步骤 0.2**：创建 [src/_locales/](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/src/_locales/) 下 8 个 `messages.json`

**关键澄清**：这 8 个文件**只用于 MV3 manifest 的 `__MSG_ext_name__` / `__MSG_ext_description__` 替换**，每个文件只有 2 个 key。运行时 UI 翻译由 `scripts/i18n.js` 的 `TRANSLATIONS` dict 提供（与 x-project 完全一致的范式）。

每个文件结构：
```json
{
  "ext_name": { "message": "TikTok Eraser", "description": "Extension name" },
  "ext_description": { "message": "<8 语言翻译>", "description": "Extension description" }
}
```

8 个翻译：
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

**步骤 0.3**：创建 [src/i18n.js](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/src/i18n.js) 副文件（如需要）

复盘：x-project 把 i18n 引擎放在 `scripts/i18n.js`（被 content_scripts 加载，注入 page context），sidepanel.html 的 `<script src="i18n.js">` 在构建时由 `scripts/i18n.js` 覆盖。TikTok 应**完全遵循此模式**，**不要在 `src/i18n.js` 也放一份**——会与 `scripts/i18n.js` 冲突。

---

### Phase 1：Side Panel JS 逻辑层（P0，~1 文件）

**目标**：让 sidepanel.html 的按钮和事件有响应

**步骤 1.1**：创建 [src/sidepanel.js](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/src/sidepanel.js)

参考 [x-project/src/sidepanel.js](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/x-project/src/sidepanel.js) 模板（约 1466 行），**需要适配的点**：

1. **namespace 全部替换**：
   - `window.XEraseri18n` → `window.TikTokEraseri18n`
   - `getPatterns()` 返回 `['*://tiktok.com/*', '*://www.tiktok.com/*']`
   - `t('openXWebsite')` → `t('openTikTokWebsite')`
   - `t('pleaseOpenX')` → `t('pleaseOpenTikTok')`
   - `t('xWebsiteDetected')` → `t('tiktokWebsiteDetected')`
   - `t('xArchive')` 等 x 特有 i18n key → TikTok 对应（archive link 改为 tiktok data download）
   - Storage key：`dailyUsage` → `tiktokDailyUsage`，`preferredLang` → `tiktokPreferredLang`，`ratingPrompt` → `tiktokRatingPrompt`
   - `chrome.storage.local.get('ratingPrompt')` → `tiktokRatingPrompt`
   - 错误日志前缀 `[X Eraser]` → `[TikTok Eraser]`

2. **checkbox / 清理类型映射**（参考 [sidepanel.html 第 515-549 行](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/src/sidepanel.html#L515-L549)）：
   ```javascript
   var TYPE_ID_MAP = {
     'videos': 'videos',
     'reposts': 'reposts',
     'likes': 'likes',
     'favorites': 'favorites',
     'following': 'following'
   };
   ```
   5 个 type 全是顶级 checkbox，无子选项（与 x-project 的 tweets 拆 3 type 不同）。

3. **消息 type 字段**：与 x-project 一致（`cleanupProgress` / `cleanupLog` / `cleanupTypeStart` / `cleanupTypeComplete` / `cleanupComplete` / `cleanupError` / `cleanupPaused` / `cleanupResumed` / `cleanupStopped` / `statusUpdate` / `cleanupAborted` / `startCleanup` / `pauseCleanup` / `resumeCleanup` / `stopCleanup` / `getCleanupStatus` / `getPageInfo`）—— [content.js 已发这些 type](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/scripts/content.js#L176-L195)，sidepanel.js 必须消费。

4. **过滤器**：在 [sidepanel.html](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/src/sidepanel.html#L567-L576) 已加 2 个 input（`#filter-view-min` / `#filter-view-max`），sidepanel.js 必须：
   ```javascript
   var minViewCountEl = document.getElementById('filter-view-min');
   var maxViewCountEl = document.getElementById('filter-view-max');
   var minVC = (minViewCountEl && minViewCountEl.value !== '') ? Number(minViewCountEl.value) : null;
   var maxVC = (maxViewCountEl && maxViewCountEl.value !== '') ? Number(maxViewCountEl.value) : null;
   if (minVC !== null && (!Number.isFinite(minVC) || minVC < 0)) { /* 校验失败处理 */ }
   if (maxVC !== null && (!Number.isFinite(maxVC) || maxVC < 0)) { /* 校验失败处理 */ }
   // 传给 startCleanup
   var filters = (fromDate || toDate || keyword || minVC !== null || maxVC !== null)
     ? { fromDate: fromDate, toDate: toDate, keyword: keyword, minViewCount: minVC, maxViewCount: maxVC }
     : null;
   ```
   这两个新字段是 TikTok 特有（videos/reposts 过滤用），[tiktok-automation.js 第 647-659 行](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/scripts/tiktok-automation.js#L647-L659) 的 `matchesFilter` 已实现消费。

5. **`dailyLimitReachedHint` 必含关键词**（项目硬约束）：8 语言都必须含 `tip / support developer / come back tomorrow` 关键词。x-project 的 i18n.js 已有完整翻译可直接复用，但 TikTok 的 i18n.js 必须重新维护一份同样质量的翻译。

6. **i18n key 完整列表**（TikTok sidepanel.js 需消费的所有 key）：
   ```
   UI 标签: openTikTokWebsite, pleaseLogin, checking, checkingLogin,
            pleaseRefreshTikTokPage, tiktokWebsiteDetected, pleaseOpenTikTok,
            loggedIn, notLoggedIn, notLoggedInHint, selectOptions,
            videos, reposts, likes, favorites, following,
            videosBackupTip, repostsBackupTip, archiveLinkText,
            filterOptions, fromDate, toDate, keywordPlaceholder,
            minViewCount, maxViewCount, viewCountUnlimited,
            startCleanup, pause, resume, stop, processing, processed,
            waiting, completed, paused, stopped, activity,
            home, privacy, terms, help, trustTitle, trustText,
            considerSupporting, gotIt, supportProject, feedbackTooltip,
            summaryDone, summaryStats
   
   弹窗/警告: noItemsSelected, invalidDateRange,
               dailyLimitReached, dailyLimitReachedHint, upgradeToPremium,
               usedToday, cleanupSkipped,
   
   日志消息: refreshingConfig, configRefreshed, configRefreshFailed,
            startingCleanup, cleanupCompleted, stoppedByUser,
            pausedLog, resumedLog, copyDiagnosticLog, copiedToClipboard, copyFailed,
            startingVideosCleanup, repostWarning, repostDeleteWarning, unrepostImpossible,
            startingLikesCleanup, startingFavoritesCleanup, startingFollowingCleanup,
            clickedUnfollow, unfollowFailed, unfollowedNoConfirm,
            clickReturnedFalseConfirm, noUnfollowButtons, noMoreFollowing, endOfFollowing,
            clickedUnlike, unlikeFailed, clickReturnedFalse, noUnlikeButtons,
            clickedUnfavorite, unfavoriteFailed, clickReturnedFalseUnfavorite,
            noUnfavoriteButtons, noMoreFavorites, endOfFavorites,
            foundButtonsCount, processedNavigatingTo, cleanupStuck, dailyBudgetExhausted,
            noItemsMatched, dateFilterSkipped, cleanupAbortedPageNotFound,
            sessionWriteFailed,
   
   评分弹窗: ratePromptTitle, ratePromptBody, ratePromptLabel1..5,
             ratePromptSkip, ratePromptNever, ratePromptRatingThanks,
             ratePromptFeedbackTitle, ratePromptFeedbackPlaceholder,
             ratePromptFeedbackSend, ratePromptFeedbackSent, ratePromptFooterLink
   ```
   共约 90 个 key × 8 语言 = 720 个翻译条目。这部分**需要逐语言填写**，主要从 x-project i18n.js 复用，新 key（videos/reposts/favorites/repostKeywords/view count 翻译）需要新增翻译。

7. **BACKUP TIP 联动**：[sidepanel.html 第 520-533 行](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/src/sidepanel.html#L520-L533) 有 2 个 `.backup-tip`（videos + reposts），需在 `syncBackupTip()` 函数中绑定 `opt-videos` / `opt-reposts` 的 change 事件（参考 x-project 同名函数）。

8. **`startCleanup` 启动前状态校验**：增加 TikTok 特有检查 —— 用户当前 pageType 与选中 type 不匹配时**仅记录 warning 到日志，不阻断**（V1 行为：仅当前页执行；跨页 auto-resume 是 V2）：
   ```javascript
   // 检测当前 page type（从 content 推过来的 statusUpdate 拿）
   // 与 options 匹配：videos/reposts 仅在 pageType==='videos' 生效
   // likes 仅在 pageType==='likes'，以此类推
   // 不匹配 → addLog('typeRequiresNav', 'warn') 提示用户，但仍然继续
   ```

---

### Phase 2：远程配置层（P0，~2 文件）

**目标**：让 tiktok-automation.js 的 `setConfig` 有真实数据可读

**步骤 2.1**：创建 [src/config/default.json](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/src/config/default.json)

参考 [x-project/src/config/default.json](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/x-project/src/config/default.json)（370 行）的结构，**TikTok 特有**：

- `selectors.tiktokWebsite.patterns`: `["tiktok.com", "www.tiktok.com"]`（替换 x 的 `xWebsite`）
- `selectors.login.checkElements`: 8 语言登录页关键字（参考 [content.js 第 72-121 行](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/scripts/content.js#L72-L121) 的 `DEFAULT_CHECK_ELEMENTS_8LANG`，完整移入 default.json）
- `selectors.login.globalIndicators`: 5 个 GLOBAL_LOGIN_INDICATORS（[content.js 第 43-49 行](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/scripts/content.js#L43-L49)）
- `selectors.video`: `{ container: ["[data-e2e='user-post-item']", "article"], moreButtons: ["...", "..." 8 语言 aria-label] }`
- `selectors.repost`: `{ cardMarker: ["[data-e2e='repost']", "socialContext 含 repost 关键字"] }`
- `selectors.like`: `{ container: ["[data-e2e='user-liked-item']", "article"], unlikeButtons: ["[data-testid='unlike']", "..." 8 语言] }`
- `selectors.favorite`: `{ container: ["[data-e2e='user-favorite-item']", "article"], unfavoriteButtons: ["[data-testid='unfavorite']", "..." 8 语言] }`
- `selectors.following`: `{ container: ["[data-e2e='user-following-item']", "[data-testid='cellInnerDiv']"], unfollowButtons: ["[data-testid$='-unfollow']", "..."], confirmButton: ["..."] }`
- `selectors.common`: `{ articleContainers, confirmButton, socialContext, timeElement, videoText, userInfo: { userCell, userName, userDescription }, viewCount: ["[data-e2e='video-views']", "..." 8 语言] }`
- `selectors.i18n`: 5 个 8 语言关键字数组（与 i18n.js 的 DEFAULT_I18N 对齐）
- 顶层 `version: "1.0.0"`, `updated: "2026-06-28"`

**重要**：tiktok-automation.js 实际使用的 selector 路径已在 [tiktok-automation.js 第 55-95 行](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/scripts/tiktok-automation.js#L55-L95) 描述：
- `config.common.confirmButton` / `socialContext` / `timeElement` / `videoText` / `userInfo.*` / `viewCount`
- `config.video.moreButtons` / `container`
- `config.like.unlikeButtons` / `container`
- `config.favorite.unfavoriteButtons` / `container`
- `config.following.unfollowButtons` / `container` / `confirmButton`
- `config.repost.cardMarker`
- `config.login.checkElements` / `loggedInElements` / `globalIndicators`（由 content.js 消费）

**步骤 2.2**：创建 [src/config/tiktok-remote-example.json](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/src/config/tiktok-remote-example.json)

**字节级与 default.json 完全一致**（防回归 —— x-project 2026-06-19 tweets-bug-7 教训：只改 default 不改 remote，断网时能跑、联网时不能跑，行为不一致）。

**步骤 2.3**：CDN 上传（手动步骤，CDN 写权限属于用户）

将 `tiktok-remote-example.json` 上传至 `https://storage.googleapis.com/social-tool-bucket/tiktok-remote-example.json`（与 [background.js 第 19 行](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/chrome-source/background.js#L19) 的 `CONFIG_URL` 一致）。**这一步不在代码改动范围内，由用户手动执行**。

---

### Phase 3：图标资源（P0，~3 文件）

**步骤 3.1**：创建 [src/icons/icon16.png](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/src/icons/icon16.png)、[icon48.png](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/src/icons/icon48.png)、[icon128.png](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/src/icons/icon128.png)

参考 [x-project/src/icons/](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/x-project/src/icons/) 同尺寸 PNG。

**关键设计**（基于项目记忆 lessons-learned）：
- 16/48/128 三个尺寸
- 主色：TikTok Pink `#FE2C55` + Cyan `#25F4EE` 渐变背景
- 中心元素：音符 ♪ 或 TikTok logo 简化版
- **必须 RGB 模式，无 alpha 通道**（lesson: palette PNG alpha 通道在 dark theme 显黑边）
- 验证脚本 `verify-tiktok-i18n.js` 不检查 PNG 内容，但 `verify-actual-tiktok-selectors.js` 可加一条 PNG 文件存在 + 字节级检查（防 0 字节空文件）

**步骤 3.2**（可选）：在 `scripts/render-icons.swift` 中追加 TikTok 图标生成逻辑

参考 [x-project 用法](file:///Volumes/XPSSD/workspaces/SocialEraser/scripts/render-icons.swift)，SwiftUI 脚本生成 16/48/128 三档 PNG。**这一步非阻塞**，可以先用占位 PNG 跑通 build。

---

### Phase 4：验证脚本（P1，~3 新文件 + ~4 文件改动）

#### 4.1 创建 3 个 TikTok 专用 verify 脚本

**步骤 4.1.1**：创建 [scripts/verify-tiktok-i18n.js](file:///Volumes/XPSSD/workspaces/SocialEraser/scripts/verify-tiktok-i18n.js)

基于 [verify-i18n.js](file:///Volumes/XPSSD/workspaces/SocialEraser/scripts/verify-i18n.js) 模板，**TikTok 特有断言**：

1. 8 个 `_locales/<lang>/messages.json` 文件存在
2. 8 个文件各含 2 个 key（`ext_name` / `ext_description`）
3. `scripts/i18n.js` 8 语言块存在
4. `scripts/i18n.js` 8 语言 × 关键 key 完整（约 90 个 key）
5. `scripts/i18n.js` 8 语言 `dailyLimitReachedHint` 含 "tip/support developer/come back tomorrow" 关键词（项目硬约束）
6. `scripts/i18n.js` 用 `tiktokPreferredLang` 存储 key（不与 x-project 冲突）
7. `scripts/i18n.js` 监听 `chrome.storage.onChanged` 的 `tiktokPreferredLang` 字段
8. `scripts/i18n.js` 全局命名空间为 `window.TikTokEraseri18n`（非 `window.XEraseri18n`）
9. `sidepanel.html` 引用 `<script src="i18n.js"></script>` 和 `<script src="sidepanel.js"></script>`

**步骤 4.1.2**：创建 [scripts/verify-actual-tiktok-selectors.js](file:///Volumes/XPSSD/workspaces/SocialEraser/scripts/verify-actual-tiktok-selectors.js)

基于 [verify-actual-x-selectors.js](file:///Volumes/XPSSD/workspaces/SocialEraser/scripts/verify-actual-x-selectors.js) 模板，**TikTok 特有断言**：

1. `tiktok-automation.js` 不引用未实现的 type（`tweet` / `retweet` / `bookmark` / `reply` 都不应出现 —— 防止 x-project 旧代码残留）
2. `tiktok-automation.js` 含 5 个 process 方法：`processVideos` / `processReposts` / `processLikes` / `processFavorites` / `processFollowing`
3. `tiktok-automation.js` 含 `parseViewCount` 函数（K/M/B 后缀解析）
4. `tiktok-automation.js` 含 `REPOST_KEYWORDS_8LANG` 引用
5. `tiktok-automation.js` 暴露 `window.TikTokInjector`（非 `window.XEraserInjector`）
6. `content.js` 暴露 `window.__TikTokEraserContentInjected` 防重入 flag
7. `content.js` 监听 4 种 page type（videos / likes / favorites / following）
8. `manifest.json` 含 `*://tiktok.com/*` + `*://www.tiktok.com/*` + `https://storage.googleapis.com/*`
9. `manifest.json` 含 `sidePanel.default_path = "sidepanel.html"`
10. PNG 图标存在（16/48/128 三个文件，每个 > 0 字节）

**步骤 4.1.3**：创建 [scripts/verify-tiktok-config-sync.js](file:///Volumes/XPSSD/workspaces/SocialEraser/scripts/verify-tiktok-config-sync.js)

基于 [verify-config-sync.js](file:///Volumes/XPSSD/workspaces/SocialEraser/scripts/verify-config-sync.js) 模板，**TikTok 特有断言**：

1. `src/config/default.json` 与 `src/config/tiktok-remote-example.json` 字节级完全一致（防 x-project 2026-06-19 tweets-bug-7 教训）
2. 两个文件顶层 `version` 一致
3. 两个文件顶层 `updated` 一致
4. 两个文件 `selectors` 顶层 key 集合一致
5. `selectors.tiktokWebsite.patterns` 含 `tiktok.com` + `www.tiktok.com`
6. `selectors.i18n.cancelKeywords` / `confirmKeywords` / `unfollowKeywords` / `repostKeywords` 都有 8 语言条目
7. `selectors.video.moreButtons` / `selectors.like.unlikeButtons` / `selectors.following.unfollowButtons` 非空

#### 4.2 改造 4 个现有脚本支持多平台

**步骤 4.2.1**：改造 [scripts/check-schema.js](file:///Volumes/XPSSD/workspaces/SocialEraser/scripts/check-schema.js) → 迭代 `platforms/*-project/`

当前硬编码 `x-project/src/config/default.json` + `x-project/src/config/x-remote-example.json`。改造为：

```javascript
// 遍历 platforms/*-project/，每个有 src/config/{default,N-remote-example}.json 的目录都检查
const platforms = fs.readdirSync(PLATFORMS_DIR).filter(name => name.endsWith('-project'));
for (const platform of platforms) {
  // ... 读 default.json + <platform>-remote-example.json
  // 例外块：每个 platform 独立（x-project 排除 login/xWebsite/i18n；tiktok-project 排除 login/tiktokWebsite/i18n）
}
```

**步骤 4.2.2**：改造 [scripts/verify-sidepanel-bindings.js](file:///Volumes/XPSSD/workspaces/SocialEraser/scripts/verify-sidepanel-bindings.js) → 迭代 `platforms/*-project/src/`

当前硬编码 `x-project/src/sidepanel.js` + `x-project/src/sidepanel.html`。改造为：每个 platform 跑一遍，输出汇总。

**步骤 4.2.3**：[scripts/verify-syntax.js](file:///Volumes/XPSSD/workspaces/SocialEraser/scripts/verify-syntax.js) 已支持多平台（[第 25-27 行](file:///Volumes/XPSSD/workspaces/SocialEraser/scripts/verify-syntax.js#L25-L27) 扫描整个 `platforms/` 目录），**0 改动**。

**步骤 4.2.4**：改造 [scripts/run-verify.js](file:///Volumes/XPSSD/workspaces/SocialEraser/scripts/run-verify.js) → 注册 3 个新脚本

在 [ALL_SCRIPTS 数组](file:///Volumes/XPSSD/workspaces/SocialEraser/scripts/run-verify.js#L28-L44) 末尾追加 3 行：
```javascript
'verify-tiktok-i18n.js',
'verify-actual-tiktok-selectors.js',
'verify-tiktok-config-sync.js',
```

---

### Phase 5：营销页同步（~1 文件）

**步骤 5.1**：修改 [packages/marketing-website/platforms/tiktok/index.html](file:///Volumes/XPSSD/workspaces/SocialEraser/packages/marketing-website/platforms/tiktok/index.html)

**7-type → 5-type 改造**（需求 §12.2）：

1. 第 120 行：`Seven Kinds of TikTok Cleanup` → `Five Kinds of TikTok Cleanup`
2. 第 124-130 行：删除 2 个 card（Watch History + Comments），保留 5 个
3. 第 6 行 meta description / OG description：去掉 `, favorites, and unfollow` 中的多余项，**与实际 5 type 严格对齐**（项目记忆 lessons-learned：营销文案必须与代码对齐，否则审核与用户期待不符）
4. FAQ 区块（如有）：更新 7-type → 5-type 描述
5. "Why SocialEraser" 区块（如有）：去掉 Watch History / Comments 描述
6. 保留 `/support.html` 链接（项目硬约束：营销站 14 文件全含）
7. 保留所有 `rel="noopener noreferrer"`（项目硬约束）

**改动前后比对**（grep 验证）：
```bash
# 改前
grep -c "Watch History" packages/marketing-website/platforms/tiktok/index.html   # 期望 ≥ 1
grep -c "Comments" packages/marketing-website/platforms/tiktok/index.html        # 期望 ≥ 1
# 改后
grep -c "Watch History" packages/marketing-website/platforms/tiktok/index.html   # 期望 0
grep -c "Comments" packages/marketing-website/platforms/tiktok/index.html        # 期望 0（仅作为清理类型才出现）
```

**步骤 5.2**（仅当 marketing 还有 "reviews" section）：检查并隐藏

按项目硬约束：≥ 6 条真实评论前必须隐藏 reviews section。`grep -c "review" packages/marketing-website/platforms/tiktok/index.html` 检查。

---

### Phase 6：Build 验证与文档（~3 文件）

**步骤 6.1**：跑 [npm run sync](file:///Volumes/XPSSD/workspaces/SocialEraser/scripts/sync-shared.js) 生成 `extensions/chrome-tiktok/` + `extensions/edge-tiktok/` + `platforms/tiktok-project/www/`

```bash
node scripts/sync-shared.js --no-cap   # 跳过 cap copy（MVP 不需要 android/ios）
```

验证 3 个输出目录都生成。

**步骤 6.2**：跑 [npm test](file:///Volumes/XPSSD/workspaces/SocialEraser/scripts/run-verify.js) 全量验证

期望：15 个脚本全过（原 12 + 新 3 = 15）。任一失败立即修复。

**步骤 6.3**：更新 [README.md](file:///Volumes/XPSSD/workspaces/SocialEraser/README.md) — TikTok 状态

找到"TikTok / Not started / Coming Q4 2026" 段落，改为：

```markdown
## Platforms

- **X Eraser** — ✅ Shipped (Chrome Web Store + Edge Web Store, v1.0.1)
- **TikTok Eraser** — ✅ MVP ready, pending store submission
```

**步骤 6.4**：更新 [ROADMAP.md](file:///Volumes/XPSSD/workspaces/SocialEraser/ROADMAP.md) — TikTok 里程碑

找到 TikTok 相关段落，标记 Q3 2026 → 实际启动（"TikTok Eraser MVP — code complete, store submission pending"）。

**步骤 6.5**：更新 [platforms/tiktok-project/CHANGELOG.md](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/CHANGELOG.md) 记录本次改动

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
| 1 | [platforms/tiktok-project/scripts/i18n.js](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/scripts/i18n.js) | ~1500 | 无 |
| 2 | [platforms/tiktok-project/src/sidepanel.js](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/src/sidepanel.js) | ~1450 | sidepanel.html + i18n.js |
| 3 | [platforms/tiktok-project/src/_locales/en/messages.json](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/src/_locales/en/messages.json) | 5 | 无 |
| 4 | [platforms/tiktok-project/src/_locales/zh_CN/messages.json](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/src/_locales/zh_CN/messages.json) | 5 | 无 |
| 5 | [platforms/tiktok-project/src/_locales/ja/messages.json](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/src/_locales/ja/messages.json) | 5 | 无 |
| 6 | [platforms/tiktok-project/src/_locales/ko/messages.json](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/src/_locales/ko/messages.json) | 5 | 无 |
| 7 | [platforms/tiktok-project/src/_locales/pt/messages.json](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/src/_locales/pt/messages.json) | 5 | 无 |
| 8 | [platforms/tiktok-project/src/_locales/es/messages.json](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/src/_locales/es/messages.json) | 5 | 无 |
| 9 | [platforms/tiktok-project/src/_locales/de/messages.json](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/src/_locales/de/messages.json) | 5 | 无 |
| 10 | [platforms/tiktok-project/src/_locales/fr/messages.json](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/src/_locales/fr/messages.json) | 5 | 无 |
| 11 | [platforms/tiktok-project/src/config/default.json](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/src/config/default.json) | ~250 | 无 |
| 12 | [platforms/tiktok-project/src/config/tiktok-remote-example.json](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/src/config/tiktok-remote-example.json) | ~250 | default.json（必须字节级一致）|
| 13 | [platforms/tiktok-project/src/icons/icon{16,48,128}.png](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/src/icons/) | 二进制 | 无 |
| 14 | [scripts/verify-tiktok-i18n.js](file:///Volumes/XPSSD/workspaces/SocialEraser/scripts/verify-tiktok-i18n.js) | ~150 | i18n.js + 8 _locales |
| 15 | [scripts/verify-actual-tiktok-selectors.js](file:///Volumes/XPSSD/workspaces/SocialEraser/scripts/verify-actual-tiktok-selectors.js) | ~120 | tiktok-automation.js + content.js + manifest |
| 16 | [scripts/verify-tiktok-config-sync.js](file:///Volumes/XPSSD/workspaces/SocialEraser/scripts/verify-tiktok-config-sync.js) | ~120 | default.json + tiktok-remote-example.json |

### 3.2 修改文件（6 个）

| # | 路径 | 改动 |
|---|---|---|
| 1 | [scripts/check-schema.js](file:///Volumes/XPSSD/workspaces/SocialEraser/scripts/check-schema.js) | 迭代 `platforms/*-project/` |
| 2 | [scripts/verify-sidepanel-bindings.js](file:///Volumes/XPSSD/workspaces/SocialEraser/scripts/verify-sidepanel-bindings.js) | 迭代 `platforms/*-project/src/` |
| 3 | [scripts/run-verify.js](file:///Volumes/XPSSD/workspaces/SocialEraser/scripts/run-verify.js) | 注册 3 个新 verify 脚本 |
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
Phase 0 (i18n 引擎层)
  → Phase 1 (sidepanel.js)
  → Phase 2 (config 文件)
  → Phase 3 (图标)
  → Phase 4 (verify 脚本)
  → Phase 5 (营销页)
  → Phase 6 (build + 文档)
```

**关键依赖**：
- Phase 0 必须先做（其他都依赖 i18n.js 的 `t()` 函数）
- Phase 1 依赖 Phase 0（sidepanel.js 用 `i18n.t`）
- Phase 2 独立可与 Phase 1 并行
- Phase 3 完全独立，可与任何阶段并行
- Phase 4 依赖 Phase 0/1/2/3 完成（验证一切存在）
- Phase 5 完全独立
- Phase 6 必须在所有 Phase 完成后

**总工程量估算**：
- 新代码：~3700 行（i18n.js 1500 + sidepanel.js 1450 + 验证脚本 400 + 2 config 500 / 实际为引用同一份）
- 修改代码：~200 行（4 个 verify 改造 + 2 doc + 1 营销页）
- 文件总数：新建 16 + 修改 7 = 23 个文件

---

## 5. 假设与决策

### 5.1 假设（基于现有代码与项目规范）

1. **i18n.js 位置**：放在 `platforms/tiktok-project/scripts/i18n.js`（与 x-project 范式一致），**不**在 `src/i18n.js` 重复。`sidepanel.html` 已引用 `<script src="i18n.js">`，构建时 `scripts/i18n.js` 会覆盖 `src/i18n.js`（如后者不存在则不覆盖）。
2. **storage 命名空间**：用 `tiktokPreferredLang` / `tiktokDailyUsage` / `tiktokRemoteConfig` / `tiktokRatingPrompt` 前缀隔离（与项目记忆中的硬约束一致）。
3. **8 语言顺序**：`['en', 'zh-CN', 'ja', 'ko', 'pt', 'es', 'de', 'fr']`（与 x-project 完全一致，复用 LANG_META）。
4. **5 type 全部顶级 checkbox**：无子选项（与 x-project 2026-06-18 重构后范式一致，但 5 type 简单不需要 tweets 拆 3 type）。
5. **VIEW COUNT filter**：在 sidepanel.html 已有 `#filter-view-min` / `#filter-view-max` 输入框，sidepanel.js 需读取并传给 `startCleanup.options.filters.minViewCount/maxViewCount`。
6. **跨页面跳转**：V1 不实现（content.js 当前没有 type-vs-pageType 强制跳转逻辑），仅在 startCleanup 启动时记录 warning。
7. **营销页改造范围**：仅 `packages/marketing-website/platforms/tiktok/index.html` 一个文件，不动其他 13 个 marketing 文件。
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
| verify 脚本分 x-project 专用 vs 多平台通用 | 两者并存 | 需求 A.3 + A.4 明确 3 个 tiktok 专用脚本 + 4 个改造 |

---

## 6. 验证步骤

### 6.1 每个 Phase 完成的验证

- **Phase 0 完成**：`node -c platforms/tiktok-project/scripts/i18n.js` 通过；sidepanel.html 引用的 `i18n.js` 存在
- **Phase 1 完成**：`node -c platforms/tiktok-project/src/sidepanel.js` 通过；`scripts/verify-sidepanel-bindings.js` 通过
- **Phase 2 完成**：`scripts/verify-tiktok-config-sync.js` 通过；`scripts/check-schema.js` 通过
- **Phase 3 完成**：`scripts/verify-actual-tiktok-selectors.js` 中 PNG 检查通过
- **Phase 4 完成**：`npm test` 全部 15 个脚本通过
- **Phase 5 完成**：`grep -c "Watch History\|Comments" packages/marketing-website/platforms/tiktok/index.html` 期望 0
- **Phase 6 完成**：`node scripts/sync-shared.js --no-cap` 成功；3 个输出目录生成

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
