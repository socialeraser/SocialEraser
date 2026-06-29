# TikTok Eraser 实施计划（v2 — 收尾阶段）

> **作者**：Senior Frontend Architect
> **范围**：Chrome MV3 + Edge MV3（首发）
> **基础**：需求分析 `.trae/documents/tiktok-extension-requirements-and-plan.md` + 已完成的 v1 计划 `.trae/documents/tiktok-extension-v1-development-plan.md`
> **目标**：把项目从"代码完成"推到"可上架 CWS + Edge Web Store"

---

## 1. 需求可行性分析

### 1.1 结论：**完全可行，剩余工作量明确可控**

5 个清理类型（Videos / Reposts / Likes / Favorites / Following）的核心引擎、UI 模板、i18n 引擎、远程配置、8 语言 manifest 翻译 **已 100% 完成**。剩余 20% 集中在 4 块：

1. **图标资源**（3 个 PNG，16/48/128）
2. **验证脚本**（3 个新 + 3 个改造为多平台）
3. **营销页同步**（7-type → 5-type）
4. **构建 + 文档收尾**（npm run sync、README/ROADMAP/CHANGELOG 同步）

**不涉及新算法或新架构决策**。所有模式已在 x-project 验证并稳定运行。

### 1.2 当前代码基线（已完成）

| 文件 | 行数 | 状态 | 说明 |
|---|---|---|---|
| [platforms/tiktok-project/scripts/tiktok-automation.js](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/scripts/tiktok-automation.js) | 1323 | ✅ | 5 process 方法 + 7 helper + view count K/M/B 解析 |
| [platforms/tiktok-project/scripts/content.js](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/scripts/content.js) | 338 | ✅ | 4 种 page type 检测 + 8 语言登录态 + 消息路由 |
| [platforms/tiktok-project/scripts/i18n.js](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/scripts/i18n.js) | 1402 | ✅ | 8 语言 × ~90 key + DEFAULT_I18N 5 key + storage 隔离 |
| [platforms/tiktok-project/src/sidepanel.html](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/src/sidepanel.html) | 649 | ✅ | 5 checkbox + 4 维过滤器（含 view count）+ progress + summary + 4 列 footer |
| [platforms/tiktok-project/src/sidepanel.js](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/src/sidepanel.js) | 1252 | ✅ | 5 type checkbox 映射 + view count 过滤 + 2 个 backup tip 联动 |
| [platforms/tiktok-project/src/config/default.json](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/src/config/default.json) | 244 | ✅ | selectors + i18n 5 key × 8 语言 |
| [platforms/tiktok-project/src/config/tiktok-remote-example.json](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/src/config/tiktok-remote-example.json) | 244 | ✅ | 与 default.json 字节级一致 |
| [platforms/tiktok-project/src/_locales/<8 lang>/messages.json](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/src/_locales/) | 5×8 | ✅ | ext_name + ext_description × 8 语言 |
| [platforms/tiktok-project/chrome-source/{manifest,background}.json](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/chrome-source/manifest.json) | 37+~270 | ✅ | host_permissions + sidePanel + 3 级 config fallback |
| [platforms/tiktok-project/edge-source/*](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/edge-source/) | ~307 | ✅ | Edge update_url + 共享 background |
| [platforms/tiktok-project/{README,CHANGELOG,package.json,capacitor.config.json}](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/README.md) | — | ✅ | 项目元信息完整 |

**合计：~5452 行已完成代码**。

### 1.3 剩余工作量（5 类，12 个动作）

| # | 动作 | 优先级 | 工作量 |
|---|---|---|---|
| 1 | 创建 3 个 PNG 图标（16/48/128, RGB 无 alpha） | P0 | 3 文件 |
| 2 | 创建 `scripts/verify-tiktok-i18n.js` | P1 | ~150 行 |
| 3 | 创建 `scripts/verify-actual-tiktok-selectors.js` | P1 | ~120 行 |
| 4 | 创建 `scripts/verify-tiktok-config-sync.js` | P1 | ~120 行 |
| 5 | 改造 `scripts/check-schema.js` 支持多平台 | P1 | ~30 行改动 |
| 6 | 改造 `scripts/verify-sidepanel-bindings.js` 支持多平台 | P1 | ~30 行改动 |
| 7 | 改造 `scripts/run-verify.js` 注册 3 个新脚本 | P1 | 3 行 |
| 8 | 营销页 7-type → 5-type 改造 | P1 | 1 文件 |
| 9 | 跑 `npm run sync` 生成 3 个输出目录 | P0 | 1 命令 |
| 10 | 跑 `npm test` 全量验证（期望 15 个脚本全过）| P0 | 1 命令 |
| 11 | 更新根目录 README.md / ROADMAP.md / CHANGELOG.md | P1 | 3 文件 |
| 12 | 更新 platforms/tiktok-project/CHANGELOG.md | P1 | 1 文件 |

### 1.4 风险评估

| 风险 | 等级 | 缓解 |
|---|---|---|
| TikTok 反自动化（验证码 / 429）| 中-高 | 800-1200ms 间隔 + `maxErrors=10` 自动停止 + 远程可调 |
| Repost 副作用（删除 repost = 删原视频）| 中 | Side Panel 显著 backup tip + 日志首行 `repostWarning` |
| TikTok DOM 改版 | 中 | 远程配置 24h 热修 + 多 selector 兜底 + verify 脚本锁定 |
| 8 语言翻译成本 | 低 | i18n.js 1402 行已落地，~90 key × 8 语言完整 |
| CWS 审核延迟 | 中 | 不使用 remote code、host_permissions 文档化 |
| 图标 alpha 通道在 dark theme 显黑边 | 低 | lesson learned：必须 RGB 模式无 alpha（已记入项目 memory）|

### 1.5 V1 范围明确

**V1 范围内**（来自需求 §1.1 + §11.1）：
- ✅ 5 个清理类型：Videos / Reposts / Likes / Favorites / Following
- ✅ 2 端：Chrome MV3 + Edge MV3
- ✅ 3 端共用：同一份 `src/` 通过 `npm run sync` 输出

**V1 范围外**：
- ❌ Comments / Watch History / Drafts / Photos / Albums 清理（V2+）
- ❌ Android / iOS Capacitor 落地
- ❌ 跨页面 auto-resume
- ❌ 定时任务 / 多账号管理 / 数据备份导出
- ❌ 修改 x-project 任何文件

---

## 2. 实施步骤（按依赖顺序，4 个 Phase）

```
Phase 1 (图标) ──→ Phase 2 (验证脚本) ──→ Phase 3 (营销页) ──→ Phase 4 (Build + 文档)
```

---

### Phase 1：图标资源（P0，3 个 PNG 文件）

**目标**：满足 CWS / Edge Web Store 审核要求（manifest.icons 必填）。

#### 步骤 1.1：创建 3 个 PNG 图标

| 路径 | 尺寸 |
|---|---|
| [platforms/tiktok-project/src/icons/icon16.png](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/src/icons/icon16.png) | 16×16 |
| [platforms/tiktok-project/src/icons/icon48.png](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/src/icons/icon48.png) | 48×48 |
| [platforms/tiktok-project/src/icons/icon128.png](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/src/icons/icon128.png) | 128×128 |

**设计规格**（基于项目 memory lessons-learned）：
- 主色：TikTok Pink `#FE2C55` + Cyan `#25F4EE` 渐变背景
- 中心元素：音符 ♪ 或简化 TikTok logo
- **必须 RGB 模式，无 alpha 通道**（项目硬约束 lesson：palette PNG alpha 在 dark theme 显黑边）

**PNG 验证脚本**（PIL 抽样 4 角 + 4 边中点）：
```python
from PIL import Image
img = Image.open('icon128.png')
samples = [
    (0, 0), (img.width-1, 0),
    (0, img.height-1), (img.width-1, img.height-1),
    (img.width//2, 0), (img.width//2, img.height-1),
    (0, img.height//2), (img.width-1, img.height//2)
]
assert img.mode == 'RGB', f"Image mode is {img.mode}, must be RGB"
for pos in samples:
    pixel = img.getpixel(pos)
    assert pixel[3] != 0 if len(pixel) == 4 else True, f"Transparent pixel at {pos}"
```

**生成方式选项**：
- 选项 A：复用 [scripts/render-icons.swift](file:///Volumes/XPSSD/workspaces/SocialEraser/scripts/render-icons.swift) — 追加 TikTok 生成逻辑
- 选项 B：手动用 ImageMagick 生成：
  ```bash
  for size in 16 48 128; do
    convert -size ${size}x${size} \
      gradient:'#FE2C55'-'#25F4EE' \
      -font 'Helvetica-Bold' -pointsize $((size*6/10)) \
      -fill white -gravity center -annotate +0+0 '♪' \
      platform/tiktok-project/src/icons/icon${size}.png
  done
  ```

**验证**：
```bash
ls -la platforms/tiktok-project/src/icons/
# 期望 3 个文件，每个 > 0 字节
file platforms/tiktok-project/src/icons/icon128.png
# 期望 "PNG image data, 128 x 128, 8-bit/color RGB, non-interlaced"
```

---

### Phase 2：验证脚本（P1，3 个新 + 3 个改造）

**目标**：让 `npm test` 自动校验 TikTok 特有约束（i18n 完整性、selector 决策、config 同步、跨平台 schema 对齐）。

#### 步骤 2.1：创建 3 个 TikTok 专用 verify 脚本

##### 2.1.1 [scripts/verify-tiktok-i18n.js](file:///Volumes/XPSSD/workspaces/SocialEraser/scripts/verify-tiktok-i18n.js)（~150 行）

基于 [scripts/verify-i18n.js](file:///Volumes/XPSSD/workspaces/SocialEraser/scripts/verify-i18n.js) 模板，**TikTok 特有断言**：

1. ✅ 8 个 `_locales/<lang>/messages.json` 存在
2. ✅ 每个文件含 `ext_name` + `ext_description`
3. ✅ `scripts/i18n.js` 8 语言 × ~90 key 完整（`window.TikTokEraseri18n.TRANSLATIONS` 块校验）
4. ✅ 8 语言 `dailyLimitReachedHint` 含 "tip / support developer / come back tomorrow" 关键词
5. ✅ i18n.js 用 `tiktokPreferredLang` 隔离（**不**用 x-project 的 `preferredLang`）
6. ✅ 暴露 `window.TikTokEraseri18n` 命名空间
7. ✅ `chrome.storage.onChanged` 监听 `changes.tiktokPreferredLang`
8. ✅ i18n.js 含 `DEFAULT_I18N` 5 key × 8 语言（cancelKeywords/confirmKeywords/deleteKeywords/unfollowKeywords/repostKeywords）

##### 2.1.2 [scripts/verify-actual-tiktok-selectors.js](file:///Volumes/XPSSD/workspaces/SocialEraser/scripts/verify-actual-tiktok-selectors.js)（~120 行）

基于 [scripts/verify-actual-x-selectors.js](file:///Volumes/XPSSD/workspaces/SocialEraser/scripts/verify-actual-x-selectors.js) 模板，**TikTok 特有断言**：

1. ✅ tiktok-automation.js **不**引用 x-project 旧 type（`tweet` / `retweet` / `bookmark` / `reply`）
2. ✅ 含 5 个 process 方法（`processVideos` / `processReposts` / `processLikes` / `processFavorites` / `processFollowing`）
3. ✅ 含 `parseViewCount`（K/M/B 后缀）
4. ✅ 暴露 `window.TikTokInjector` 命名空间
5. ✅ content.js 暴露 `__TikTokEraserContentInjected` 防重入 flag
6. ✅ content.js 监听 4 种 page type（videos/likes/favorites/following）
7. ✅ manifest.json 含 `*://tiktok.com/*` + `*://www.tiktok.com/*` + `https://storage.googleapis.com/*`
8. ✅ PNG 图标 16/48/128 存在 + > 0 字节
9. ✅ sidepanel.js 含 `TYPE_ID_MAP` 5 项

##### 2.1.3 [scripts/verify-tiktok-config-sync.js](file:///Volumes/XPSSD/workspaces/SocialEraser/scripts/verify-tiktok-config-sync.js)（~120 行）

基于 [scripts/verify-config-sync.js](file:///Volumes/XPSSD/workspaces/SocialEraser/scripts/verify-config-sync.js) 模板，**TikTok 特有断言**：

1. ✅ `default.json` ↔ `tiktok-remote-example.json` 字节级一致
2. ✅ 顶层 `version` / `updated` 一致
3. ✅ `selectors` 顶层 key 集合一致
4. ✅ `tiktokWebsite.patterns` 含 `tiktok.com` + `www.tiktok.com`
5. ✅ i18n 5 key 都有 8 语言条目
6. ✅ `video` / `like` / `favorite` / `following` selector 块非空
7. ✅ `common.viewCount` 数组非空（TikTok 特有）
8. ✅ `login.checkElements` 8 语言都有条目
9. ✅ `repost.cardMarker` 非空

#### 步骤 2.2：改造 3 个现有脚本支持多平台

##### 2.2.1 [scripts/check-schema.js](file:///Volumes/XPSSD/workspaces/SocialEraser/scripts/check-schema.js)

**当前**：硬编码 `platforms/x-project/src/config/default.json` + `x-remote-example.json`

**改造**：扫描 `platforms/*-project/`，对每个含 `src/config/` 的 platform 跑 schema 对齐。每 platform 独立例外块：
- x: `login` / `xWebsite` / `i18n`
- tiktok: `login` / `tiktokWebsite` / `i18n`

**伪代码**：
```javascript
const platforms = glob('platforms/*-project/src/config/*.json')
                  .filter(p => p.endsWith('default.json') || p.endsWith('-remote-example.json'));
for (const platform of groupByPlatform(platforms)) {
  // 跑 schema check，excludes 来自 platform 自己的 set
}
```

##### 2.2.2 [scripts/verify-sidepanel-bindings.js](file:///Volumes/XPSSD/workspaces/SocialEraser/scripts/verify-sidepanel-bindings.js)

**当前**：硬编码 `platforms/x-project/src/sidepanel.js` + `.html`

**改造**：扫描 `platforms/*-project/src/`，对每个含 `sidepanel.js` + `sidepanel.html` 的 platform 跑一遍绑定检查，输出汇总。

##### 2.2.3 [scripts/run-verify.js](file:///Volumes/XPSSD/workspaces/SocialEraser/scripts/run-verify.js)

**当前**：[`ALL_SCRIPTS`](file:///Volumes/XPSSD/workspaces/SocialEraser/scripts/run-verify.js#L28-L44) 数组 14 项

**改造**：在 `ALL_SCRIPTS` 数组末尾追加 3 行：
```javascript
const ALL_SCRIPTS = [
  // ... 现有 14 项
  'verify-tiktok-i18n.js',
  'verify-actual-tiktok-selectors.js',
  'verify-tiktok-config-sync.js',
];
```

[scripts/verify-syntax.js](file:///Volumes/XPSSD/workspaces/SocialEraser/scripts/verify-syntax.js) **0 改动**（已支持多平台扫描整个 `platforms/` 目录）。

#### 步骤 2.3：验证

```bash
node scripts/verify-tiktok-i18n.js          # 期望 0 退出
node scripts/verify-actual-tiktok-selectors.js   # 期望 0 退出
node scripts/verify-tiktok-config-sync.js   # 期望 0 退出
node scripts/check-schema.js                # 期望 x + tiktok 都过
node scripts/verify-sidepanel-bindings.js   # 期望 x + tiktok 都过
npm test                                     # 期望 15 个脚本全过
```

---

### Phase 3：营销页同步（P1，~1 文件）

**目标**：7-type → 5-type 改造，对齐实际能力，避免 CWS 审核与用户期待不一致。

#### 步骤 3.1：修改 [packages/marketing-website/platforms/tiktok/index.html](file:///Volumes/XPSSD/workspaces/SocialEraser/packages/marketing-website/platforms/tiktok/index.html)

**当前状态**（grep 验证）：
- 含 "Seven Kinds of TikTok Cleanup"（标题）
- 含 "Watch History" 卡片
- 含 "Comments" 卡片

**改动**：

| 改动 | 位置 | 改动前 | 改动后 |
|---|---|---|---|
| H2 标题 | `<h2>` | `Seven Kinds of TikTok Cleanup, One Extension` | `Five Kinds of TikTok Cleanup, One Extension` |
| 删除 Watch History 卡片 | cards grid | `<h3>Watch History</h3>` | 删除整 `<div class="card">` |
| 删除 Comments 卡片 | cards grid | `<h3>Comments</h3>` | 删除整 `<div class="card">` |

**保留项目硬约束**：
- ✅ `/support.html` 链接保留（全 14 文件全含）
- ✅ 全部外部链接含 `rel="noopener noreferrer"`
- ✅ Reviews section 已隐藏（项目硬约束：< 6 条真实评论前必须隐藏）

**验证**：
```bash
grep -c "Watch History" packages/marketing-website/platforms/tiktok/index.html
# 期望 0
grep -c "Comments" packages/marketing-website/platforms/tiktok/index.html
# 期望 0
grep -c "Five Kinds" packages/marketing-website/platforms/tiktok/index.html
# 期望 ≥ 1
```

---

### Phase 4：Build 验证 + 文档（收尾，~5 文件）

#### 步骤 4.1：跑 `npm run sync` 生成 3 个输出目录

```bash
node scripts/sync-shared.js --no-cap   # 跳过 cap copy（V1 不上 Android/iOS）
```

**期望输出**：
- `platforms/tiktok-project/www/` 生成（Capacitor webDir）
- `extensions/chrome-tiktok/` 生成（Chrome MV3）
- `extensions/edge-tiktok/` 生成（Edge MV3）

#### 步骤 4.2：跑 `npm test` 全量验证

```bash
npm test
```

**期望**：15 个脚本全过（现有 12 + 新 3 = 15）。任一失败立即修复。

#### 步骤 4.3：更新 [README.md](file:///Volumes/XPSSD/workspaces/SocialEraser/README.md) — TikTok 状态

找到 "TikTok / Not started / Coming Q4 2026" 段落，改为：
```markdown
- **TikTok Eraser** — ✅ MVP ready, pending store submission (Chrome MV3 + Edge MV3)
```

#### 步骤 4.4：更新 [ROADMAP.md](file:///Volumes/XPSSD/workspaces/SocialEraser/ROADMAP.md) — TikTok 里程碑

找到 TikTok 相关段落，标记 Q4 2026 → 实际启动（"TikTok Eraser MVP — code complete, store submission pending"）。

#### 步骤 4.5：更新 [platforms/tiktok-project/CHANGELOG.md](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/CHANGELOG.md)

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

#### 步骤 4.6：端到端冒烟（手动，必做）

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
10. ✅ 扩展图标在 toolbar 正常显示（PNG 16/48/128 三档）

---

## 3. 文件改动清单

### 3.1 新建文件（6 个）

| # | 路径 | 类型 | 行数预估 | 依赖 |
|---|---|---|---|---|
| 1 | [platforms/tiktok-project/src/icons/icon16.png](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/src/icons/icon16.png) | 二进制 | — | 无 |
| 2 | [platforms/tiktok-project/src/icons/icon48.png](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/src/icons/icon48.png) | 二进制 | — | 无 |
| 3 | [platforms/tiktok-project/src/icons/icon128.png](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/src/icons/icon128.png) | 二进制 | — | 无 |
| 4 | [scripts/verify-tiktok-i18n.js](file:///Volumes/XPSSD/workspaces/SocialEraser/scripts/verify-tiktok-i18n.js) | 源码 | ~150 | i18n.js + 8 _locales |
| 5 | [scripts/verify-actual-tiktok-selectors.js](file:///Volumes/XPSSD/workspaces/SocialEraser/scripts/verify-actual-tiktok-selectors.js) | 源码 | ~120 | tiktok-automation.js + content.js + manifest |
| 6 | [scripts/verify-tiktok-config-sync.js](file:///Volumes/XPSSD/workspaces/SocialEraser/scripts/verify-tiktok-config-sync.js) | 源码 | ~120 | default.json + tiktok-remote-example.json |

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
- 在 Chrome Web Store 提交扩展 zip（`extensions/chrome-tiktok/` 打包后）
- 在 Edge Web Store 提交扩展 zip（`extensions/edge-tiktok/` 打包后）

---

## 4. 执行顺序

```
Phase 1 (图标)  ──→  Phase 2 (验证脚本)  ──→  Phase 3 (营销页)  ──→  Phase 4 (Build + 文档)
   │                       │                                                  ↑
   └───────────────────────┴────────────────→ 收尾 Build 验证 ────────────────┘
```

**关键依赖**：
- Phase 1（图标）独立，可与 Phase 2/3 并行
- Phase 2（验证脚本）依赖 Phase 1（验证脚本会检查 PNG 存在）
- Phase 3（营销页）完全独立
- Phase 4 必须在所有 Phase 完成后

---

## 5. 假设与决策

### 5.1 假设

1. **i18n.js 位置**：[platforms/tiktok-project/scripts/i18n.js](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/scripts/i18n.js) 已就绪（1402 行）
2. **storage 命名空间**：`tiktokPreferredLang` / `tiktokDailyUsage` / `tiktokRemoteConfig` / `tiktokRatingPrompt`（已统一）
3. **8 语言顺序**：`['en', 'zh-CN', 'ja', 'ko', 'pt', 'es', 'de', 'fr']`（与 x-project 一致）
4. **5 type 全部顶级 checkbox**（无子选项）
5. **VIEW COUNT filter**：sidepanel.html 已有 `#filter-view-min` / `#filter-view-max` 输入框，sidepanel.js 已实现消费
6. **跨页面跳转**：V1 不实现（仅 warning）
7. **营销页改造范围**：仅 `packages/marketing-website/platforms/tiktok/index.html` 一个文件
8. **图标资源**：通过 ImageMagick / SwiftUI 脚本生成（不依赖外部素材）

### 5.2 决策点（已选定，无需询问）

| 决策点 | 选择 | 依据 |
|---|---|---|
| 是否实现跨页面 auto-resume | ❌ 否（V1）| 需求 §11.3 明确推迟到 V2 |
| 评分弹窗 | ✅ 复用 x-project 模板 | 需求 §10.2 要求 i18n 8 语言完整，模板已就绪 |
| Tip model | ✅ 复用（无订阅逻辑）| 项目硬约束 |
| Daily limit | 5000/天 | 与 x-project 一致 |
| Build 工具 | 复用 `npm run sync` | 0 改动（sync-shared.js 已支持自动发现）|
| Capacitor | ❌ 跳过（V1 不上线 Android/iOS）| 需求 §11.2 推迟到 Q1 2027，使用 `--no-cap` 跳过 cap copy |
| 验证脚本语言 | JavaScript（与 x-project 一致）| 项目统一规范 |

---

## 6. 验证步骤

### 6.1 每个 Phase 完成的验证

| Phase | 验证命令 |
|---|---|
| Phase 1 | `file platforms/tiktok-project/src/icons/icon{16,48,128}.png` 期望 RGB |
| Phase 2 | `npm test` 期望 15 个脚本全过 |
| Phase 3 | `grep -c "Watch History\|Comments" packages/marketing-website/platforms/tiktok/index.html` 期望 0 |
| Phase 4 | `node scripts/sync-shared.js --no-cap` 成功 + 3 个输出目录生成 + 端到端冒烟 |

### 6.2 端到端冒烟（手动，必做）

加载 `extensions/chrome-tiktok/` 到 Chrome，打开 `https://www.tiktok.com/@xxx`：

1. ✅ 扩展图标在 toolbar 正常显示
2. ✅ Side Panel 弹出
3. ✅ Status Card 显示 "TikTok website detected" + "Logged in"
4. ✅ 5 个 checkbox 渲染正确（videos/reposts 默认不勾选；likes/favorites/following 默认勾选）
5. ✅ 4 维过滤器渲染正确
6. ✅ 勾选 likes → 点击 Start → 进度条 + 日志实时更新
7. ✅ 暂停 / 继续 / 停止 按钮可用
8. ✅ 完成后 summary 卡片弹出，CTA 链接到 support.html
9. ✅ 切换语言 → 立即生效
10. ✅ daily limit 弹窗测试通过

---

## 7. 不在本次范围

明确**不做**的事（避免越界）：
- ❌ 不实现 Comments / Watch History / Drafts 清理（V2+）
- ❌ 不实现 Android / iOS Capacitor 落地
- ❌ 不实现跨页面 auto-resume
- ❌ 不实现 AI 智能推荐删除
- ❌ 不修改 x-project 任何文件（仅做参考复用）
- ❌ 不重命名已有的 `window.TikTokEraseri18n` / `tiktokRemoteConfig` / `tiktokeraser-logger` 等命名
- ❌ 不改 `tiktok-automation.js` / `content.js` / `sidepanel.html` / `i18n.js` / `sidepanel.js` / `default.json` / `tiktok-remote-example.json` / 8 `_locales/*/messages.json`（已完成的代码保持稳定）
- ❌ 不创建新的 marketing 文件（仅修改 1 个 tiktok index.html）

---

## 8. 完整剩余工作清单（执行 Checklist）

```markdown
[ ] Phase 1：3 个 PNG 图标
    [ ] icon16.png  (RGB 模式，无 alpha)
    [ ] icon48.png  (RGB 模式，无 alpha)
    [ ] icon128.png (RGB 模式，无 alpha)
    [ ] PIL 抽样验证：4 角 + 4 边中点都非透明

[ ] Phase 2：3 个 verify 脚本 + 3 个改造
    [ ] scripts/verify-tiktok-i18n.js          (创建)
    [ ] scripts/verify-actual-tiktok-selectors.js  (创建)
    [ ] scripts/verify-tiktok-config-sync.js  (创建)
    [ ] scripts/check-schema.js               (改造：迭代 platforms/*-project/)
    [ ] scripts/verify-sidepanel-bindings.js  (改造：迭代 platforms/*-project/src/)
    [ ] scripts/run-verify.js                 (改造：注册 3 个新脚本)
    [ ] npm test 期望 15 个脚本全过

[ ] Phase 3：营销页 7-type → 5-type
    [ ] packages/marketing-website/platforms/tiktok/index.html
        [ ] "Seven Kinds" → "Five Kinds"
        [ ] 删除 Watch History 卡片
        [ ] 删除 Comments 卡片
        [ ] 保留 /support.html 链接
        [ ] 保留 rel="noopener noreferrer"
        [ ] 保留 Reviews 隐藏状态

[ ] Phase 4：Build 验证 + 文档
    [ ] node scripts/sync-shared.js --no-cap   (生成 www/ + extensions/chrome-tiktok/ + extensions/edge-tiktok/)
    [ ] npm test                                (15 个脚本全过)
    [ ] README.md                               (TikTok 状态更新)
    [ ] ROADMAP.md                              (TikTok 里程碑更新)
    [ ] platforms/tiktok-project/CHANGELOG.md   (记录本次改动)
    [ ] 端到端冒烟（手动 10 步）
```

---

## 9. 关键设计要点回顾（来自需求 §1.3 / 项目 memory）

1. **8 语言必含 `dailyLimitReachedHint` 关键词**：`tip` / `support developer` / `come back tomorrow`
2. **Tip model 禁止订阅**：不含 `isPremium` / `showUpgradeModal` / `subscription.active`
3. **品牌色**：#FE2C55 (粉) + #25F4EE (青) + #0F0F0F (黑)
4. **host_permissions**：`*://tiktok.com/*` + `*://www.tiktok.com/*` + `https://storage.googleapis.com/*`
5. **远程 CDN**：`https://storage.googleapis.com/social-tool-bucket/tiktok-remote-example.json`
6. **跨平台命名隔离**：`tiktok*` / `TikTok*` 前缀（`window.TikTokEraseri18n` / `tiktokRemoteConfig` / `tiktokeraser-logger`）
7. **图标 RGB 模式**（无 alpha 通道）— 防止 dark theme 显黑边
8. **Git push flow**：先 `git checkout dev` 再 commit，最后 merge master + push

---

**预计剩余工作量**：~600 行新代码 + 6 文件改动 + 1 次 build 同步 + 1 次端到端冒烟。可在单次会话内完成。
