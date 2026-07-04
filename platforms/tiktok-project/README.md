# platforms/tiktok-project

TikTok 批量删除 / 取关 / 取消点赞 / 取消收藏 平台 — 复用 x-project 统一框架，落地 Chrome MV3 + Edge MV3 浏览器扩展；Android/iOS 通过 Capacitor 复用 `src/` 代码（推迟到 Q1 2027）。

## 当前状态

- **当前阶段**：MVP 首版开发中
- **覆盖清理类型**（5 种）：
  | Type | 路径 | 操作 |
  |---|---|---|
  | Videos | `tiktok.com/@username` | 3 步：点 "···" → Delete → Confirm |
  | Reposts | `tiktok.com/@username` | 8 语言 aria-label 等值匹配 `a#icon-element-repost`（防 re-click） |
  | Likes | `tiktok.com/@username/likes` | 2 步：点 Liked tab 卡片 → 进 video 详情页 → 点 ❤ 取消 |
  | Favorites | `tiktok.com/@username/favorites` | 2 步：点 Favorites tab 卡片 → 进 video 详情页 → 点 🔖 取消 |
  | Following | `tiktok.com/@username/following` | 2 步：点 Following 按钮 → Confirm |
- **不支持**（V2 路线图）：Watch History（TikTok settings 内置）、Comments（与 Reposts 高重叠）
- **首发平台**：Chrome MV3 + Edge MV3
- **3 端代码共享**：`src/` 唯一来源 → `npm run sync` 输出 `www/`（Capacitor）+ `extensions/chrome-tiktok/` + `extensions/edge-tiktok/`
- **8 语言**：en / zh-CN / ja / ko / pt / es / de / fr
- **远程配置**：`https://storage.googleapis.com/social-tool-bucket/tiktok-remote-example.json`

## 复用 x-project 的设计原则

- **3 端同源**：`src/` 是 Web UI 唯一来源
- **Selector 不可信**：每个 type 至少 1 个语义锚点（href/role/aria），不能全靠 data-testid
- **状态走 sticky，不走 poll**：登录态检测一次就缓存
- **删代码是改进**：删除冗余 retry / 兼容 shim
- **KISS > 过度设计**

## 构建

```bash
# 1. 安装依赖
npm install

# 2. 生成 build 输出
npm run sync
# → 生成 platforms/tiktok-project/www/ + extensions/chrome-tiktok/ + extensions/edge-tiktok/

# 3. Chrome / Edge 加载 extensions/chrome-tiktok/ 或 extensions/edge-tiktok/
```

## 验证

```bash
npm test                              # 跑全部 verify + check-schema
node scripts/verify-tiktok-i18n.js    # TikTok 8 语言完整性
node scripts/check-schema.js          # TikTok config schema 对齐
```

## 已知限制

- **Repost 不可独立删除**：TikTok Web 没有"撤销 repost"按钮。删除 repost = 删除该视频（已在 sidepanel 备份提示告知用户）。
- **TikTok 反自动化检测**：使用 800-1200ms 点击间隔，模拟人类速度。

## License

MIT
