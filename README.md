# X-Eraser

跨平台 X/Twitter 批量清理工具。

## 当前阶段：Chrome Extension (开发中)

### 已完成功能

| 功能 | 状态 | 说明 |
|------|------|------|
| 常驻侧边栏 | ✅ | Chrome Side Panel，不消失 |
| 检测X网站 | ✅ | 自动识别 x.com / twitter.com |
| 检测登录状态 | ✅ | 多语言支持 |
| 批量删除选项 | ✅ | 推文/点赞/书签/关注/私信 |
| 日期/关键字筛选 | ✅ | UI 已就绪 |
| 实时进度显示 | ✅ | 进度条 + 日志动画 |
| 暂停/停止/继续 | ✅ | 状态机控制 |
| 8种语言支持 | ✅ | en/zh-CN/zh-TW/ja/ko/es/de/fr |
| 远程配置 | ✅ | 支持远程更新选择器 |
| 刷新配置按钮 | ✅ | 右上角手动刷新 |
| 底部信任文案 | ✅ | 突出显示隐私承诺 |
| DOM 操作引擎 | ✅ | 健壮的删除实现 |
| 无后端设计 | ✅ | 纯前端，无需服务器 |

### 开发中功能

| 功能 | 状态 | 说明 |
|------|------|------|
| 实际删除操作 | 🔄 | 核心引擎已就绪，待测试 |
| 日期过滤逻辑 | 🔄 | UI 就绪，逻辑未实现 |
| 免费额度 50/天 | 🔄 | 计数器存在，弹窗未实现 |

### 待开发功能

| 功能 | 优先级 | 说明 |
|------|--------|------|
| 订阅系统 Creem | P1 | 付费会员解锁 |
| Android App | P2 | Capacitor 实现 |
| iOS App | P2 | Capacitor 实现 |

## 安装使用

### Chrome 扩展

1. 打开 `chrome://extensions/`
2. 开启「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择 `chrome-extension` 文件夹
5. 打开 x.com 并登录
6. 点击扩展图标，打开侧边栏
7. 勾选要执行的操作，点击「开始清理」

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
    "like": { "unlikeButton": "..." },
    "bookmark": { "removeButton": "..." },
    "following": { "container": "...", "unfollowButton": "..." },
    "message": { "container": "...", "deleteButton": "...", "confirmButton": "..." }
  }
}
```

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
- [x] 状态检测
- [x] 多语言
- [x] DOM 操作引擎
- [ ] 实际删除测试
- [ ] 免费额度弹窗

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
