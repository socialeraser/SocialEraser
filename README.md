# X-Eraser

跨平台 X/Twitter 批量清理工具，支持 Chrome 扩展和 Android App。

## 功能列表

| 功能 | 说明 |
|------|------|
| ✅ 取消点赞 | 支持按日期筛选 |
| ✅ 移除书签 | 清除所有收藏 |
| ✅ 撤销转发 | 删除转发和引用转发 |
| ✅ 取关 | 支持保留互关白名单 |
| ✅ 删除推文 | 删除原创推文 |
| ✅ 删除回复 | 删除回复和评论 |
| ✅ 解除屏蔽 | 批量解除屏蔽账号 |
| ✅ 取消静音 | 批量取消静音账号 |
| ✅ 删除私信 | 删除私信会话 |
| ✅ 清空草稿 | 删除推文草稿 |

## 安装使用

### Chrome 扩展

1. 打开 `chrome://extensions/`
2. 开启「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择 `chrome-extension` 文件夹
5. 打开 x.com 并登录
6. 点击扩展图标，勾选要执行的操作，点击「开始清理」

### Android App

```bash
npm install
npm run build        # sync shared/ → www/ + cap copy
npx cap sync android
npx cap run android
```

## 开发工作流

核心脚本与配置集中在 `shared/`，修改后需同步到各端：

```bash
npm run sync
```

| 源文件 | 同步目标 |
|--------|----------|
| `shared/injector.js` | `chrome-extension/injector.js`、`www/injector.js` |
| `shared/selectorConfig.json` | `www/selectorConfig.json` |
| `shared/bridge.js` | `chrome-extension/bridge.js`、`www/bridge.js` |

**请勿直接编辑** `chrome-extension/injector.js`、`chrome-extension/bridge.js` 或 `www/injector.js`（文件头标注 AUTO-GENERATED），应改 `shared/` 后执行 `npm run sync`。

### 通信协议

| 方向 | source | 用途 |
|------|--------|------|
| App → Injector | `XEraser-App` | `start` / `stop` / `pause` / `resume` |
| Injector → App | `XEraser-Injector` | `progress` / `complete` / `error` / 日志事件 |

扩展端：`bridge.js` 同时驱动 `XEraserPanel` 与 `XEraser-Injector` 事件。移动端：`XEraserNative.postMessage` 经原生插件回传 App 壳。

## 技术架构

```
shared/（单一真相源）
├── injector.js          # DOM 自动化核心
├── selectorConfig.json  # 选择器配置
└── bridge.js            # 跨端通信（Phase 1 完善）
      │
      ├── Chrome 扩展 → content script + XEraserPanel 浮窗
      │
      └── Capacitor App → www/index.html + 原生 WebView 插件
```

## 文件结构

```
X-Eraser/
├── shared/                 # 核心源码（唯一编辑入口）
│   ├── injector.js
│   ├── selectorConfig.json
│   └── bridge.js
├── scripts/
│   └── sync-shared.js      # npm run sync
├── chrome-extension/       # Chrome 扩展
│   ├── manifest.json
│   ├── panel.js
│   ├── popup.html / popup.js
│   └── background.js
├── www/                    # Capacitor webDir（App UI + 同步产物）
├── capacitor-webview.js    # Capacitor ↔ 原生 WebView 桥接
├── capacitor.config.json
└── android/                # Android 原生项目
```

## 注意事项

- ⚠️ 删除后无法恢复，请谨慎操作
- 建议每次处理 100–200 条
- 建议在非高峰时段使用
- X 可能会临时限制频繁操作

## License

MIT
