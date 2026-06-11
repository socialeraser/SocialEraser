---

description: "X-Eraser (X/Twitter 跨平台批量清理工具) 核心开发与编码约束"

globs: ["**/*.js", "**/*.json", "src/**/*", "public/**/*"]

alwaysApply: true

---

# 项目介绍

X-Eraser 是 X/Twitter 跨平台批量清理工具，支持 Chrome 扩展和 Android App。基于原生前端技术 + Capacitor 开发，无后端，纯前端 DOM 自动化实现批量清理账号内容、管理互动状态。

# 技术栈与架构

- **核心：** 原生 JavaScript、HTML、CSS (纯前端 DOM 自动化)

- **跨端：** Capacitor (Android 移动端)

- **扩展：** Chrome Extension 原生开发 (Manifest V3)

- **构建：** npm 前端打包

- **通信架构：** `injector.js` 为两平台共用核心脚本，分别通过 `chrome.runtime` API（扩展端）和 `XEraserNative.postMessage` API（移动端）与 UI 进行跨域/跨上下文交互。

# 🚨 核心编码约束 (AI 必须严格执行)

1. **最小改动原则：**

   - 必须遵循“就事论事”，只修复或扩展目标问题，**绝对禁止全局重构代码**。

   - 保留原有的文件结构、原生 API、交互逻辑，严禁擅自修改整体架构。

2. **三端兼容与精简：**

   - 代码必须保持精简、无冗余，严格适配 Chrome 扩展沙箱与移动端 WebView 的三端兼容性。

   - 在处理 UI 滚动或列表拖拽时，优先使用背景图（background div）实现以防原生手势干扰。

3. **完全无后端去中心化：**

   - **绝对禁止**添加任何后端服务（如 Node.js 路由、Python 脚本等）。

   - **绝对禁止**引入任何付费第三方服务、地下/非官方通道、或无关的 npm 依赖。一切逻辑纯前端闭环。

4. **输出质量：**

   - 必须输出可直接运行的完整代码，**严禁使用 `// 剩余代码保持不变` 等占位符**，必须补齐所有缺失逻辑。

   - 使用标准代码块标注语言，注释只保留精简的必要业务逻辑。