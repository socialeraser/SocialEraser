# TikTok Eraser 开发计划（v3 — 收尾执行版）

> **作者**：Senior Frontend Architect
> **基础**：[`.trae/documents/tiktok-extension-requirements-and-plan.md`](file:///Volumes/XPSSD/workspaces/SocialEraser/.trae/documents/tiktok-extension-requirements-and-plan.md)（v1.0 需求分析，已完成）
> **关联**：[`tiktok-extension-v1-development-plan.md`](file:///Volumes/XPSSD/workspaces/SocialEraser/.trae/documents/tiktok-extension-v1-development-plan.md)（v1 全量实施计划，已被 v2 取代）｜[`tiktok-extension-v2-development-plan.md`](file:///Volumes/XPSSD/workspaces/SocialEraser/.trae/documents/tiktok-extension-v2-development-plan.md)（v2 收尾计划，主体已落地）
> **目标**：本计划是**最终执行版**，整合 v1/v2 结论 + 当前代码基线，给出剩余 5 个动作的可执行清单

---

## 1. 需求可行性分析（架构师视角）

### 1.1 结论：**完全可行，5 个动作收尾**

5 个清理类型（Videos / Reposts / Likes / Favorites / Following）所有核心代码已落地并通过 verify 校验。**剩余工作量集中在 3 类纯组装 + 1 个文档同步**：

| 类别 | 数量 | 性质 |
|---|---|---|
| 验证脚本注册 | 1 文件 | 3 行改动 |
| 全量验证 | 1 命令 | 期望 18/18 通过 |
| 营销页同步 | 1 文件 | 2 行文本 + 2 卡片删除 |
| 构建产物生成 | 1 命令 | 期望 3 目录输出 |
| 文档同步 | 3 文件 | 各几行更新 |

**不涉及新算法、新架构决策、跨平台兼容性问题**。所有模式（i18n engine / safeClick / daily limit 弹窗 / 评分弹窗 / 远程热修 / tip model）已在 x-project 验证并稳定运行，TikTok 直接复用。

### 1.2 代码基线（已 100% 完成的核心模块）

| 文件 | 行数 | 状态 | 关键能力 |
|---|---|---|---|
| [`platforms/tiktok-project/scripts/tiktok-automation.js`](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/scripts/tiktok-automation.js) | 1323 | ✅ | `TikTokInjector` 类，5 个 `process*` 方法 + 7 helper + `parseViewCount`（K/M/B 后缀）|
| [`platforms/tiktok-project/scripts/content.js`](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/scripts/content.js) | 338 | ✅ | 4 种 page type + sticky 登录态 + 6 类消息路由 + `__TikTokEraserContentInjected` 防重入 |
| [`platforms/tiktok-project/scripts/i18n.js`](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/scripts/i18n.js) | 1402 | ✅ | `window.TikTokEraseri18n` 命名空间 + 8 语言 × ~90 key + `tiktokPreferredLang` 隔离 + 5 key × 8 语言 `DEFAULT_I18N` |
| [`platforms/tiktok-project/src/sidepanel.html`](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/src/sidepanel.html) | 649 | ✅ | 5 checkbox + 4 维过滤器（min/max view count）+ progress + summary + 4 列 footer |
| [`platforms/tiktok-project/src/sidepanel.js`](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/src/sidepanel.js) | 1252 | ✅ | 5 type 映射 + view count 过滤 + 2 backup tip 联动 + daily limit + 评分弹窗 |
| [`platforms/tiktok-project/src/config/default.json`](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/src/config/default.json) | 244 | ✅ | selectors + i18n 5 key × 8 语言 |
| [`platforms/tiktok-project/src/config/tiktok-remote-example.json`](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/src/config/tiktok-remote-example.json) | 244 | ✅ | 与 default.json **字节级一致** |
| [`platforms/tiktok-project/src/_locales/<8 lang>/messages.json`](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/src/_locales/) | 5×8 | ✅ | ext_name + ext_description × 8 语言 |
| [`platforms/tiktok-project/src/icons/icon{16,48,128}.png`](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/src/icons/) | 3 文件 | ✅ | RGB 模式无 alpha（防 dark theme 黑边）|
| [`platforms/tiktok-project/chrome-source/{manifest,background}.json`](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/chrome-source/manifest.json) | 37+270 | ✅ | host_permissions（tiktok.com + storage.googleapis.com）+ sidePanel + 3 级 config fallback |
| [`platforms/tiktok-project/edge-source/*`](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/edge-source/) | ~307 | ✅ | Edge update_url + 共享 background |

**合计**：~5,500 行已完成代码 + 3 个 PNG。

### 1.3 已落地的验证基础设施

| 脚本 | 状态 | 说明 |
|---|---|---|
| [`scripts/check-schema.js`](file:///Volumes/XPSSD/workspaces/SocialEraser/scripts/check-schema.js) | ✅ 多平台就绪 | 扫描 `platforms/*-project/`，每 platform 独立 EXCLUDE 块（x: `login`/`xWebsite`/`i18n`；tiktok: `login`/`tiktokWebsite`/`i18n`）|
| [`scripts/verify-sidepanel-bindings.js`](file:///Volumes/XPSSD/workspaces/SocialEraser/scripts/verify-sidepanel-bindings.js) | ✅ 多平台就绪 | `findPlatforms()` 扫描 `*-project/src/` 跑 `els.*` 绑定检查 |
| [`scripts/verify-syntax.js`](file:///Volumes/XPSSD/workspaces/SocialEraser/scripts/verify-syntax.js) | ✅ 多平台就绪 | 扫描 `platforms/<p>/{src,scripts,chrome-source,edge-source}` 全部 `.js` 跑 `node -c` |
| [`scripts/verify-tiktok-i18n.js`](file:///Volumes/XPSSD/workspaces/SocialEraser/scripts/verify-tiktok-i18n.js) | ✅ 已创建 | 8 语言 × ~90 key 完整 + `window.TikTokEraseri18n` 命名空间 + `tiktokPreferredLang` 隔离 + `dailyLimitReachedHint` 关键词检查 |
| [`scripts/verify-actual-tiktok-selectors.js`](file:///Volumes/XPSSD/workspaces/SocialEraser/scripts/verify-actual-tiktok-selectors.js) | ✅ 已创建 | 5 process 方法 + `parseViewCount` + `__TikTokEraserContentInjected` + host_permissions 校验 + PNG 字节存在性 |
| [`scripts/verify-tiktok-config-sync.js`](file:///Volumes/XPSSD/workspaces/SocialEraser/scripts/verify-tiktok-config-sync.js) | ✅ 已创建 | 字节级一致 + schema 对齐 + 8 语言关键字 + `common.viewCount` 块 |

### 1.4 剩余 5 个动作（核心：本次实施范围）

| # | 动作 | 优先级 | 预期工作量 |
|---|---|---|---|
| 1 | 改造 [`scripts/run-verify.js`](file:///Volumes/XPSSD/workspaces/SocialEraser/scripts/run-verify.js) 注册 3 个新 TikTok 脚本 | P0 | 3 行 |
| 2 | 跑 `npm test` 验证 18 个脚本全过（原 15 + 新 3）| P0 | 1 命令 |
| 3 | 营销页 [`packages/marketing-website/platforms/tiktok/index.html`](file:///Volumes/XPSSD/workspaces/SocialEraser/packages/marketing-website/platforms/tiktok/index.html) 7-type → 5-type | P0 | 4 处改动 |
| 4 | 跑 `npm run sync` 生成 3 个输出目录 | P0 | 1 命令 |
| 5 | 更新 3 个文档（`README.md` / `ROADMAP.md` / `platforms/tiktok-project/CHANGELOG.md`）| P1 | 各几行 |

### 1.5 风险评估

| 风险 | 等级 | 缓解 | 状态 |
|---|---|---|---|
| TikTok 反自动化（验证码 / 429）| 中-高 | videos/reposts 800-1200ms 间隔、likes/favorites/following 500-800ms、`maxErrors=10` 自动停止 + 远程可调 | 已编码 |
| Repost 副作用（删除 repost = 删原视频）| 中 | Side Panel 显著 backup tip + 日志首行 `repostWarning` | 已编码 |
| TikTok DOM 改版 | 中 | 远程配置 24h 热修 + 多 selector 兜底 + 3 个 TikTok 专用 verify 脚本锁定 | 已编码 |
| 8 语言翻译成本 | 低 | i18n.js 1402 行已落地，~90 key × 8 语言完整 | 已完成 |
| CWS 审核延迟 | 中 | 不使用任何 remote code、host_permissions 文档化、8 语言 manifest 翻译 | 已就绪 |
| 图标 alpha 通道在 dark theme 显黑边 | 低 | 已 RGB 模式无 alpha（lesson-learned 锁定）| 已规避 |

**架构师结论**：所有硬约束（tip model / 8 语言 / host_permissions / daily limit / Reviews 隐藏 / 外部链接 `rel="noopener noreferrer"`）已通过现有 verify 脚本（`verify-tip-model.js` / `verify-tiktok-i18n.js` / `verify-actual-tiktok-selectors.js`）锁住。剩余 5 个动作只是把这些已编码的资产"接进 build 管道 + 同步给用户"。

### 1.6 V1 范围（来自需求 §1.1 + §11）

**V1 范围内**：
- ✅ 5 个清理类型：Videos / Reposts / Likes / Favorites / Following
- ✅ 2 端：Chrome MV3 + Edge MV3
- ✅ 3 端共用：同一份 `src/` 通过 `npm run sync` 输出到 `www/` + `extensions/chrome-tiktok/` + `extensions/edge-tiktok/`

**V1 范围外**（明确不做）：
- ❌ Comments / Watch History / Drafts / Photos / Albums 清理（V2+）
- ❌ Android / iOS Capacitor 落地
- ❌ 跨页面 auto-resume
- ❌ 定时任务 / 多账号管理 / 数据备份导出
- ❌ 修改 x-project 任何文件

---

## 2. 实施步骤（5 个动作，按依赖顺序）

```
动作 1 (run-verify 注册) ──→ 动作 2 (npm test) ──→ 动作 3 (营销页) ──→ 动作 4 (sync) ──→ 动作 5 (文档)
                                              ↑                                                              ↑
                                              └──────────────── 并行 ─────────────────────────────────────────┘
```

**依赖关系**：
- 动作 1（注册脚本）独立可立即开始
- 动作 2（npm test）必须等动作 1 完成
- 动作 3（营销页）独立可与动作 1/2 并行
- 动作 4（npm run sync）必须等动作 2 + 动作 3 完成（验证 + 营销页一致）
- 动作 5（文档）独立可与任何动作并行

---

### 动作 1：注册 3 个新 TikTok verify 脚本（P0，3 行改动）

**目标**：让 `npm test` 跑全 TikTok 验证套件。

**修改文件**：[`scripts/run-verify.js`](file:///Volumes/XPSSD/workspaces/SocialEraser/scripts/run-verify.js)

**改动**（[第 28-44 行](file:///Volumes/XPSSD/workspaces/SocialEraser/scripts/run-verify.js#L28-L44) 的 `ALL_SCRIPTS` 数组末尾追加 3 行）：

```javascript
const ALL_SCRIPTS = [
  'check-schema.js',
  'verify-actual-x-selectors.js',
  'verify-config-sync.js',
  'verify-daily-usage-chain.js',
  'verify-following.js',
  'verify-i18n.js',
  'verify-login-detection.js',
  'verify-no-retry.js',
  'verify-processed-count-cumulative.js',
  'verify-scroll-to-bottom.js',
  'verify-setconfig.js',
  'verify-sidepanel-bindings.js',
  'verify-syntax.js',
  'verify-tweets-bug-3.js',
  'verify-tip-model.js',
  // ↓↓↓ 新增 3 项 ↓↓↓
  'verify-tiktok-i18n.js',
  'verify-actual-tiktok-selectors.js',
  'verify-tiktok-config-sync.js',
];
```

**为什么这样排列**：
- 保持 `check-schema.js` 首位（schema 是后续 verify 的基础）
- 3 个新 TikTok 脚本放在末尾（依赖 schema + syntax + sidepanel-bindings 已先跑过）
- 顺序敏感性：`verify-tiktok-config-sync.js` 依赖 `check-schema.js` 的结果

**验证**：
```bash
node scripts/run-verify.js --list
# 期望输出 18 项，最后 3 项是 TikTok 专用
```

---

### 动作 2：跑 `npm test` 验证 18 个脚本全过（P0，1 命令）

**目标**：所有 verify 脚本 + check-schema 端到端通过。

```bash
npm test
```

**期望输出**：
- `Running 18 script(s):` 标题
- 18 个脚本依次跑，exit code 全部为 0
- Summary 行：`18 passed, 0 failed (of 18)`

**失败处理**（任一脚本 fail）：

| 失败脚本 | 排查方向 |
|---|---|
| `check-schema.js` | 检查 `tiktok-remote-example.json` 是否与 `default.json` 字段一致（不允许增删 key，只能改 value）|
| `verify-tiktok-i18n.js` | 检查 `i18n.js` 是否含全部 8 语言 + `tiktokPreferredLang` 隔离 + `dailyLimitReachedHint` 关键词 |
| `verify-actual-tiktok-selectors.js` | 检查 `tiktok-automation.js` 含 5 个 process 方法 + `__TikTokEraserContentInjected` + PNG 存在 |
| `verify-tiktok-config-sync.js` | 检查 `default.json` 与 `tiktok-remote-example.json` 字节级一致 |
| `verify-syntax.js` | 检查新加的 JS 文件能否 `node -c` 解析 |
| `verify-sidepanel-bindings.js` | 检查 `sidepanel.js` 每个 `els.*` 引用都有 `getElementById` 绑定 |

**架构师注意**：`verify-tweets-bug-3.js` 是 x-project 历史的回归测试，TikTok 必然不相关；不需要为 TikTok 写对应的 tweets-bug 测试。

---

### 动作 3：营销页 7-type → 5-type（P0，4 处改动）

**目标**：营销页与实际能力对齐，避免 CWS 审核与用户期待不一致。

**修改文件**：[`packages/marketing-website/platforms/tiktok/index.html`](file:///Volumes/XPSSD/workspaces/SocialEraser/packages/marketing-website/platforms/tiktok/index.html)

**4 处改动**：

| # | 行号 | 改动前 | 改动后 |
|---|---|---|---|
| 1 | [120](file:///Volumes/XPSSD/workspaces/SocialEraser/packages/marketing-website/platforms/tiktok/index.html#L120) | `<h2 class="section-head__h2">Seven Kinds of TikTok Cleanup, One Extension</h2>` | `<h2 class="section-head__h2">Five Kinds of TikTok Cleanup, One Extension</h2>` |
| 2 | [129](file:///Volumes/XPSSD/workspaces/SocialEraser/packages/marketing-website/platforms/tiktok/index.html#L129) | `...<h3 class="card__title">Watch History</h3>...` 整 `<div class="card card--hover">` 块 | 删除整行（含开闭 `<div>`）|
| 3 | [130](file:///Volumes/XPSSD/workspaces/SocialEraser/packages/marketing-website/platforms/tiktok/index.html#L130) | `...<h3 class="card__title">Comments</h3>...` 整 `<div class="card card--hover">` 块 | 删除整行（含开闭 `<div>`）|
| 4 | 卡片数 | "Seven Kinds" 文案已改 → 5 张卡片自然呈现 | （无需额外改动）|

**保留项目硬约束**（来自 `project_memory.md`）：
- ✅ `/support.html` 链接保留（全 14 文件全含）
- ✅ 全部外部链接含 `rel="noopener noreferrer"`
- ✅ Reviews section 检查：项目硬约束"< 6 条真实评论前必须隐藏"——已隐藏，**不**改

**验证**：
```bash
grep -c "Watch History" packages/marketing-website/platforms/tiktok/index.html
# 期望 0
grep -c "Comments" packages/marketing-website/platforms/tiktok/index.html
# 期望 0
grep -c "Five Kinds" packages/marketing-website/platforms/tiktok/index.html
# 期望 ≥ 1
```

**其他 13 个营销页文件 0 改动**（x-project / youtube / facebook / instagram / 中文 / 日文 / about / help / privacy / terms / support / success / index — 都不含 "Seven Kinds" 文字）

---

### 动作 4：跑 `npm run sync` 生成 3 个输出目录（P0，1 命令）

**目标**：把 `src/` 唯一来源同步到 3 端可加载的 build 产物。

```bash
npm run sync
# 等价于：node scripts/sync-shared.js --no-cap
```

**`--no-cap` 标志的必要性**：TikTok MVP 不上线 Android/iOS（需求 §11.2 推迟到 Q1 2027），跳过 cap copy 避免空目录错误。

**期望输出**：
| 目录 | 用途 | 期望内容 |
|---|---|---|
| `platforms/tiktok-project/www/` | Capacitor webDir（未来 Android/iOS 用）| `sidepanel.html` + `sidepanel.js` + `i18n.js` + `_locales/` + `config/` + `icons/` |
| `extensions/chrome-tiktok/` | Chrome MV3 直接加载 | `manifest.json` + `background.js` + `sidepanel.html` + `scripts/` + `src/` |
| `extensions/edge-tiktok/` | Edge MV3 直接加载 | 同 chrome-tiktok，但 manifest 含 `update_url` |

**失败处理**：

| 现象 | 排查 |
|---|---|
| `Cannot find module` | 检查 `platforms/tiktok-project/src/sidepanel.js` 是否被误删（sync-shared.js 依赖其存在）|
| `www/` 未生成 | 确认 `package.json` 的 `"sync": "node scripts/sync-shared.js --no-cap"` 完整 |
| 目录生成但内容缺失 | 单独跑 `node scripts/sync-shared.js` 看 verbose 输出 |

**验证**：
```bash
ls platforms/tiktok-project/www/ | head -20
# 期望 _locales/ config/ icons/ sidepanel.html sidepanel.js
ls extensions/chrome-tiktok/ | head -20
# 期望 manifest.json background.js sidepanel.html scripts/ src/
ls extensions/edge-tiktok/ | head -20
# 同上
```

---

### 动作 5：文档同步（P1，3 个文件）

**目标**：让用户/开发者从顶层 README 一眼看出 TikTok 状态从"planned"变为"MVP ready"。

#### 动作 5.1：更新 [`README.md`](file:///Volumes/XPSSD/workspaces/SocialEraser/README.md)

**改动**（[第 202 行](file:///Volumes/XPSSD/workspaces/SocialEraser/README.md#L202)）：

```diff
- │   └── tiktok-project/                        # TikTok Eraser (planned)
+ │   └── tiktok-project/                        # TikTok Eraser (MVP ready, pending CWS submission)
```

**架构师注意**：[`README.md` 第 13-18 行](file:///Volumes/XPSSD/workspaces/SocialEraser/ROADMAP.md#L13-L18) "Next (Q4 2026 – Q1 2027) — Mobile & TikTok" 段落是 ROADMAP 内容，**不动**（ROADMAP 是未来规划，README 是当前状态）。

#### 动作 5.2：更新 [`ROADMAP.md`](file:///Volumes/XPSSD/workspaces/SocialEraser/ROADMAP.md)

**改动**（[第 16 行](file:///Volumes/XPSSD/workspaces/SocialEraser/ROADMAP.md#L16)）：

```diff
- - TikTok project: copy x-project scaffold, write TikTok automation engine
+ - TikTok project: MVP code complete (5-type + 8-language + verify suite), pending CWS/Edge Web Store submission
```

#### 动作 5.3：更新 [`platforms/tiktok-project/CHANGELOG.md`](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/CHANGELOG.md)

**改动**：在 [第 10 行 `## [Unreleased]`](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/CHANGELOG.md#L10) 下追加 "Added" 段（在原 "Planned for v0.1.0" 之前）：

```diff
  ## [Unreleased]

+ ### Added
+ - i18n engine (`scripts/i18n.js`, 1402 lines) — 8 languages, `window.TikTokEraseri18n` namespace, `tiktokPreferredLang` storage isolation
+ - side panel logic (`src/sidepanel.js`, 1252 lines) — 5-type checkboxes, view count filter, backup tip联动, daily limit, 评分弹窗
+ - 8 locale manifest files (`src/_locales/<lang>/messages.json`) — ext_name + ext_description per language
+ - bundled + remote config (`src/config/{default.json, tiktok-remote-example.json}`) — 244 lines, byte-level identical
+ - 3 PNG icons (`src/icons/icon{16,48,128}.png`) — RGB mode, no alpha channel (dark-theme safe)
+ - 3 TikTok-specific verify scripts (`scripts/verify-tiktok-{i18n,actual-tiktok-selectors,config-sync}.js`)
+
+ ### Changed
+ - `scripts/run-verify.js` — registers 3 new TikTok verify scripts (15 → 18 total)
+ - `scripts/check-schema.js` — already multi-platform (no change)
+ - `scripts/verify-sidepanel-bindings.js` — already multi-platform (no change)
+ - `scripts/verify-syntax.js` — already multi-platform (no change)
+ - marketing website (`packages/marketing-website/platforms/tiktok/index.html`) — 7-type → 5-type alignment
+
  ### Planned for v0.1.0 (MVP)
  - Bulk cleanup for TikTok (Web extension, MV3):
    - Your Videos (with `data-e2e` selector fallback)
    - Reposts (warning: TikTok Web does not expose independent repost undo; this deletes the original reposted video)
    - Likes
    - Favorites
    - Following
  ...
```

**验证**：
```bash
grep -c "i18n engine" platforms/tiktok-project/CHANGELOG.md
# 期望 ≥ 1
```

---

## 3. 文件改动清单

### 3.1 修改文件（5 个）

| # | 路径 | 改动 |
|---|---|---|
| 1 | [`scripts/run-verify.js`](file:///Volumes/XPSSD/workspaces/SocialEraser/scripts/run-verify.js) | `ALL_SCRIPTS` 末尾追加 3 行 |
| 2 | [`packages/marketing-website/platforms/tiktok/index.html`](file:///Volumes/XPSSD/workspaces/SocialEraser/packages/marketing-website/platforms/tiktok/index.html) | 7-type → 5-type（4 处改动）|
| 3 | [`README.md`](file:///Volumes/XPSSD/workspaces/SocialEraser/README.md) | TikTok 状态 1 行更新 |
| 4 | [`ROADMAP.md`](file:///Volumes/XPSSD/workspaces/SocialEraser/ROADMAP.md) | TikTok 里程碑 1 行更新 |
| 5 | [`platforms/tiktok-project/CHANGELOG.md`](file:///Volumes/XPSSD/workspaces/SocialEraser/platforms/tiktok-project/CHANGELOG.md) | 新增 "Added" + "Changed" 段 |

### 3.2 外部命令（不在代码改动范围）

- 跑 `npm test` 验证 18 脚本
- 跑 `npm run sync` 生成 3 目录

### 3.3 外部操作（用户手动，不在代码范围）

- 上传 `tiktok-remote-example.json` 到 `https://storage.googleapis.com/social-tool-bucket/tiktok-remote-example.json`
- 在 Chrome Web Store 提交 `extensions/chrome-tiktok/` 打包 zip
- 在 Edge Web Store 提交 `extensions/edge-tiktok/` 打包 zip

---

## 4. 执行顺序（含并行优化）

```
顺序 1（串行启动）:
  动作 1 (run-verify 注册) ──→ 动作 2 (npm test 验证)

并行可选项:
  动作 3 (营销页)        ──┐
  动作 5 (文档)          ──┤── 任意时刻插入，无依赖
                            │
顺序 2（收尾）:            ↓
  动作 4 (npm run sync) ──→ 端到端冒烟（手动）
```

**最快执行路径**（3 步）：

1. 动作 1（注册脚本）→ 动作 2（npm test 验证 18/18 过）→ 动作 4（sync 生成 3 目录）
2. 并行动作 3（营销页） + 动作 5（文档）随时插
3. 端到端冒烟

**预计总耗时**：5 分钟代码改动 + 1 分钟 npm test + 1 分钟 sync + 10 分钟手动冒烟 = **~20 分钟**

---

## 5. 假设与决策

### 5.1 假设

1. **3 个新 verify 脚本已就绪且通过**（基于 v2 计划 + 上次会话已创建）
2. **i18n.js / sidepanel.js / _locales / config / icons 全部就绪**（基于 v1 计划 + 上次会话已完成）
3. **`sync-shared.js` 已支持自动 pick up `platforms/*-project/`**（来自 v1 决策，0 改动）
4. **所有 verify 脚本的 multi-platform 改造已就绪**（基于 [`check-schema.js`](file:///Volumes/XPSSD/workspaces/SocialEraser/scripts/check-schema.js) 第 27-30 行 `PLATFORM_EXCLUDES` 双平台块存在）
5. **x-project 不需要任何改动**（v1 决策）

### 5.2 决策点（已选定，无需询问）

| 决策点 | 选择 | 依据 |
|---|---|---|
| run-verify 注册顺序 | 末尾追加 3 行（15→18）| 保持 `check-schema.js` 首位是其他 verify 的前置 |
| sync 命令 | `npm run sync`（= `sync-shared.js --no-cap`）| 复用 x-project 已验证的 `package.json` 脚本 |
| 营销页改造范围 | 仅 1 个文件（tiktok/index.html）| 其他 13 文件不含 TikTok 专属文案 |
| 文档更新范围 | 3 文件（README / ROADMAP / tiktok CHANGELOG）| 顶层 README 标状态 / ROADMAP 标里程碑 / 平台 CHANGELOG 标细节 |
| Capacitor | ❌ 跳过 | 需求 §11.2 推迟到 Q1 2027 |
| Android/iOS | ❌ 跳过 | 需求 §11.2 推迟到 Q1 2027 |
| 跨页面 auto-resume | ❌ 跳过 | 需求 §11.3 推迟到 V2 |
| 评分弹窗 | ✅ 复用 x-project 模板 | sidepanel.js 1252 行已实现 |

### 5.3 暂未决策（如需可后续问）

- **TikTok 远程 config 的 CDN 上传时机**：用户在 v2 计划中说明 GCS 写权限属于用户本人。代码改动 100% 完成后，用户手动上传一次即可。
- **CWS / Edge Web Store 提交时机**：MVP 代码就绪后由用户提交。代码改动本身不涉及 store 流程。
- **TikTok 扩展 v0.1.0 版本号何时 bump**：建议在 CWS 审核通过后 bump 到 0.1.0 同步发布；当前保持 `Unreleased`。

---

## 6. 验证步骤

### 6.1 每个动作的验证

| 动作 | 验证命令 | 期望结果 |
|---|---|---|
| 动作 1 | `node scripts/run-verify.js --list \| grep tiktok` | 列出 3 个 tiktok 脚本 |
| 动作 2 | `npm test` | `18 passed, 0 failed (of 18)` |
| 动作 3 | `grep -c "Watch History\\|Comments" packages/marketing-website/platforms/tiktok/index.html` | 0 |
| 动作 4 | `ls extensions/chrome-tiktok/ extensions/edge-tiktok/ platforms/tiktok-project/www/` | 3 目录都有 sidepanel.html |
| 动作 5 | `grep -c "MVP ready" README.md` | ≥ 1 |

### 6.2 端到端冒烟（手动，必做）

加载 `extensions/chrome-tiktok/` 到 Chrome `chrome://extensions`（开发者模式 → 加载已解压的扩展程序），打开 `https://www.tiktok.com/@xxx`：

1. ✅ 扩展图标在 toolbar 正常显示（PNG 16/48/128 三档）
2. ✅ Side Panel 弹出
3. ✅ Status Card 显示 "TikTok website detected" + "Logged in"
4. ✅ 5 个 checkbox 渲染正确（videos/reposts 默认不勾选；likes/favorites/following 默认勾选）
5. ✅ 4 维过滤器渲染正确（from date / to date / keyword / min views / max views）
6. ✅ 勾选 likes → 点击 Start → 进度条 + 日志实时更新
7. ✅ 暂停 / 继续 / 停止 按钮可用
8. ✅ 完成后 summary 卡片弹出，CTA 链接到 support.html
9. ✅ 切换语言 → 立即生效（🌐 按钮）
10. ✅ daily limit 弹窗测试：临时把 `FREE_LIMIT_PER_DAY` 改成 1 → 第二次启动应弹 tip 弹窗

---

## 7. 不在本次范围（明确不做）

避免越界：
- ❌ 不实现 Comments / Watch History / Drafts 清理（V2+）
- ❌ 不实现 Android / iOS Capacitor 落地
- ❌ 不实现跨页面 auto-resume
- ❌ 不实现 AI 智能推荐删除
- ❌ 不修改 x-project 任何文件（仅做参考复用）
- ❌ 不重命名已有的 `window.TikTokEraseri18n` / `tiktokRemoteConfig` / `tiktokeraser-logger` 等命名
- ❌ 不改 `tiktok-automation.js` / `content.js` / `i18n.js` / `sidepanel.html` / `sidepanel.js` / `default.json` / `tiktok-remote-example.json` / 8 `_locales/*/messages.json` / 3 个 PNG（已稳定的代码保持不变）
- ❌ 不创建新的 marketing 文件（仅修改 1 个 tiktok index.html）
- ❌ 不修改 `check-schema.js` / `verify-sidepanel-bindings.js` / `verify-syntax.js`（已多平台化）
- ❌ 不修改 `verify-tiktok-*.js` 3 个新脚本（已就绪）

---

## 8. 完整执行 Checklist

```markdown
[ ] 动作 1: scripts/run-verify.js
    [ ] ALL_SCRIPTS 末尾追加 3 行（verify-tiktok-i18n / verify-actual-tiktok-selectors / verify-tiktok-config-sync）
    [ ] node scripts/run-verify.js --list 验证 18 项

[ ] 动作 2: npm test
    [ ] 期望 18 passed, 0 failed
    [ ] 如有失败 → 按 §2 动作 2 失败处理表排查

[ ] 动作 3: packages/marketing-website/platforms/tiktok/index.html
    [ ] "Seven Kinds" → "Five Kinds" (行 120)
    [ ] 删除 Watch History 卡片 (行 129)
    [ ] 删除 Comments 卡片 (行 130)
    [ ] 保留 /support.html 链接
    [ ] 保留 rel="noopener noreferrer"
    [ ] 保留 Reviews 隐藏状态
    [ ] grep 验证 0 命中 "Watch History" / "Comments"

[ ] 动作 4: npm run sync
    [ ] 期望生成 www/ + extensions/chrome-tiktok/ + extensions/edge-tiktok/
    [ ] ls 验证 3 目录都有 sidepanel.html

[ ] 动作 5: 文档同步
    [ ] README.md 行 202: tiktok-project 状态 → "MVP ready, pending CWS submission"
    [ ] ROADMAP.md 行 16: TikTok 里程碑 → "MVP code complete, pending CWS/Edge Web Store submission"
    [ ] platforms/tiktok-project/CHANGELOG.md: 新增 Added + Changed 段

[ ] 端到端冒烟（手动 10 步）
    [ ] 加载 extensions/chrome-tiktok/
    [ ] 打开 https://www.tiktok.com/@xxx
    [ ] 10 步检查全过
```

---

## 9. 关键设计要点回顾（来自需求 §1.3 / 项目 memory）

1. **8 语言必含 `dailyLimitReachedHint` 关键词**：`tip` / `support developer` / `come back tomorrow`（`verify-tip-model.js` 锁）
2. **Tip model 禁止订阅**：不含 `isPremium` / `showUpgradeModal` / `subscription.active`（`verify-tip-model.js` 锁）
3. **品牌色**：#FE2C55 (粉) + #25F4EE (青) + #0F0F0F (黑)
4. **host_permissions**：`*://tiktok.com/*` + `*://www.tiktok.com/*` + `https://storage.googleapis.com/*`（`verify-actual-tiktok-selectors.js` 锁）
5. **远程 CDN**：`https://storage.googleapis.com/social-tool-bucket/tiktok-remote-example.json`
6. **跨平台命名隔离**：`tiktok*` / `TikTok*` 前缀（`window.TikTokEraseri18n` / `tiktokRemoteConfig` / `tiktokeraser-logger`）
7. **图标 RGB 模式**（无 alpha 通道）— 防止 dark theme 显黑边
8. **Git push flow**（提交时）：先 `git checkout dev` 再 commit，最后 merge master + push（项目 memory lesson-learned 2026-06-25）

---

## 10. 架构师建议（可选优化，不在本次范围）

完成上述 5 个动作后，TikTok MVP 进入"可提交 CWS"状态。**如未来扩展可考虑**：

1. **把 `shared-core/` 抽到独立 npm 包**：把 `safeClick` / `scrollToBottom` / `waitForContentStable` 等 helper 从 `x-automation.js` + `tiktok-automation.js` 抽到 `packages/shared-core/`，未来 YouTube / Instagram 直接复用
2. **TikTok V2.0 路线图**：Comments 清理（独立 DOM selector）+ Watch History 集成（官方按钮触发）+ Photos/Albums
3. **Android/iOS Capacitor 落地**：Q1 2027，按 x-project Android 工程模板复用
4. **AI 智能识别**：基于 view count / engagement 自动建议删除（与 X Eraser 一致，KISS 优先）

**本次仅做"可发布"最低改动**。所有优化延后到下个 sprint。

---

**预计总工作量**：5 个文件改动（5-10 行 × 5）+ 2 个命令（npm test + sync）+ 1 次手动冒烟。**可在单次会话内完成**。
