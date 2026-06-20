// SocialEraser Background Script (Service Worker)
// 处理 Side Panel ↔ Content Script 之间的消息转发 + 远程配置预加载
//
// 职责分层:
//   - Background（这一层）: Manifest V3 service worker，跑在浏览器层面（不在 X 页面里）
//     能用 chrome.tabs / chrome.storage.session / chrome.scripting 等浏览器级 API
//   - Content Script（content.js）: 注入到 X 页面，跑在 X 页面的 DOM 上下文里
//     能用 chrome.runtime.sendMessage 但不能直接读 chrome.storage.session
//   - Side Panel（sidepanel.js）: 用户点击工具栏图标打开的控制面板
//     发 startCleanup / stopCleanup 等命令给 background
//
// 数据流:
//   sidepanel → background → content (执行清理)
//   content → sidepanel（直接广播，不经 background 中转，避免收到 2 次）

const CONFIG_URL = 'https://storage.googleapis.com/social-tool-bucket/remote-example.json';
// content script 注入顺序：i18n.js 必须最先（暴露 window.XEraseri18n）→ injector.js → content.js
const CONTENT_SCRIPT_FILES = ['lib/i18n.js', 'lib/injector.js', 'content.js'];
const CONTENT_SCRIPT_MATCHES = ['*://x.com/*', '*://twitter.com/*'];

let activeTabId = null;

// 给所有已开启的匹配 tab 注入 content script
// 修复"安装前已开 x.com → 插件检测未登录"的 bug
// （Manifest V3 content_scripts 只在匹配 URL 新加载时注入，
//   已开的 tab 不会自动注入，所以必须手动 inject）
async function injectContentScriptToMatchingTabs() {
  try {
    // 查所有匹配 URL 的 tab（x.com / twitter.com）
    const tabs = await chrome.tabs.query({ url: CONTENT_SCRIPT_MATCHES });
    if (!tabs || tabs.length === 0) {
      console.log('[SocialEraser] No matching tabs to inject into');
      return;
    }
    console.log('[SocialEraser] Injecting content script into', tabs.length, 'matching tab(s)');
    // 逐个 tab 注入（任何一个失败不影响其他）
    for (const tab of tabs) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: CONTENT_SCRIPT_FILES
        });
      } catch (e) {
        // 注入失败（如 chrome:// 页面、PDF viewer 等特殊 tab）—— 跳过
        console.log('[SocialEraser] Skip inject tab', tab.id, ':', e.message);
      }
    }
  } catch (e) {
    console.warn('[SocialEraser] Failed to query matching tabs:', e);
  }
}

// 插件安装 / 更新触发：拉配置 + 注入已有 tab
chrome.runtime.onInstalled.addListener(() => {
  console.log('[SocialEraser] Extension installed');
  loadConfigInBackground();
  injectContentScriptToMatchingTabs();
});

// Chrome 启动触发：拉配置 + 注入已有 tab
// 关键：打开插件就去 fetch 远程配置，不等用户点 Start 才 fetch
chrome.runtime.onStartup.addListener(() => {
  console.log('[SocialEraser] Chrome started');
  loadConfigInBackground();
  injectContentScriptToMatchingTabs();
});

// 把远程配置存进 chrome.storage.local（同时存一个时间戳，方便排查缓存时效问题）
async function saveConfigToStorage(config) {
  try {
    await chrome.storage.local.set({ remoteConfig: config, configUpdatedAt: Date.now() });
    console.log('[SocialEraser] Config saved to storage');
  } catch (e) {
    console.warn('[SocialEraser] Failed to save config to storage:', e);
  }
}

// 从 chrome.storage.local 读上次缓存的远程配置
async function loadConfigFromStorage() {
  try {
    const result = await chrome.storage.local.get('remoteConfig');
    if (result && result.remoteConfig) {
      console.log('[SocialEraser] Config loaded from storage');
      return result.remoteConfig;
    }
  } catch (e) {
    console.warn('[SocialEraser] Failed to load config from storage:', e);
  }
  return null;
}

// 后台加载远程配置：远程优先 → storage 兜底 → bundled default.json 兜底
// 关键设计：每次 service worker 启动都重新拉一次最新配置（不等用户点 Start）
// 优先级（2026-XX-XX 改成 3 级）：
//   1. fetch 远程 CONFIG_URL（cache: no-store 强制不走 HTTP 缓存）
//   2. fetch 失败 → 从 storage 拿上次缓存的（兜底）
//   3. storage 空 → 读 bundled chrome.runtime.getURL('config/default.json')
//      （这是扩展自带的默认配置，作为绝对兜底，永不为空）
async function loadConfigInBackground(forceReload) {
    if (forceReload === undefined) forceReload = false;

    // 每次 service worker 启动都重新拉取最新配置
    try {
      console.log('[SocialEraser] Background: Fetching config from:', CONFIG_URL);
      const response = await fetch(CONFIG_URL, {
        cache: 'no-store',  // 强制不走 HTTP 缓存，每次都拉新的
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        }
      });
      if (response.ok) {
        const config = await response.json();
        await saveConfigToStorage(config);  // 顺便缓存到 storage（下次 fetch 失败时用）
        console.log('[SocialEraser] Background: Config loaded successfully');
        return config;
      } else {
        console.warn('[SocialEraser] Background: Config fetch failed, HTTP', response.status);
      }
    } catch (error) {
      // 网络异常 / CORS / 超时等都到这里
      console.warn('[SocialEraser] Background: Config fetch failed:', error.message);
    }

    // 远程 fetch 失败 → 从 storage 拿上次缓存的（兜底）
    const stored = await loadConfigFromStorage();
    if (stored) {
      console.log('[SocialEraser] Background: Using stored config as fallback');
      return stored;
    }

    // storage 也是空 → 读 bundled default.json（绝对兜底，2026-XX-XX 新增）
    try {
      const defaultUrl = chrome.runtime.getURL('config/default.json');
      console.log('[SocialEraser] Background: Loading bundled default config from:', defaultUrl);
      const defaultResponse = await fetch(defaultUrl);
      if (defaultResponse.ok) {
        const defaultConfig = await defaultResponse.json();
        await saveConfigToStorage(defaultConfig);  // 顺便缓存，下次直接读 storage
        console.log('[SocialEraser] Background: Bundled default config loaded as fallback');
        return defaultConfig;
      } else {
        console.warn('[SocialEraser] Background: Bundled default config fetch failed, HTTP', defaultResponse.status);
      }
    } catch (e) {
      console.warn('[SocialEraser] Background: Failed to load bundled default config:', e.message);
    }

    return null;
  }

// service worker 启动立即加载配置（不等用户点 Start）
loadConfigInBackground();

// 查 X 域名 tab（从远程配置读 patterns，远程失败用默认 ['x.com', 'twitter.com']）
// 返回: 第一个匹配的 tab；如果没匹配返回 null
async function getXTab() {
  const stored = await chrome.storage.local.get('remoteConfig');
  const cfg = stored && stored.remoteConfig;
  const patterns = cfg && cfg.selectors && cfg.selectors.xWebsite && cfg.selectors.xWebsite.patterns || ['x.com', 'twitter.com'];
  const urls = patterns.map(function(domain) { return '*://' + domain + '/*'; });

  const tabs = await chrome.tabs.query({ url: urls });
  return tabs && tabs.length > 0 ? tabs[0] : null;
}

// 广播消息给 sidepanel（实际现在没用，因为 content 直接广播给 sidepanel）
function broadcastToSidePanel(message) {
  chrome.runtime.sendMessage(message).catch(function() {
    // side panel 可能没打开，忽略错误
  });
}

// 消息路由：sidepanel 发的命令 → 转发给 content；content 发的状态 → 转发给 sidepanel
// 所有消息类型:
//   - sidepanel → background: startCleanup / pauseCleanup / resumeCleanup / stopCleanup / getCleanupStatus
//   - content → background: cleanupProgress / cleanupLog / cleanupComplete / cleanupError / cleanupPaused / cleanupResumed / cleanupStopped / statusUpdate
//   - content → background (target=...): background / refreshConfig / readPendingCleanup / updatePendingCleanup / clearPendingCleanup / forceNavigation
chrome.runtime.onConnect.addListener(function(port) {
  // M++ 修复（2026-06-19 tweets-bug-8）：content script 用 connect 替代 sendMessage
  //   接收 xeraser-logger port 上的 log 消息，转发给 sidepanel
  //   为什么用 connect：sendMessage 失败时 service worker 不重启（静默失败）
  //   connect 强制激活 service worker + port.postMessage 比 sendMessage 更可靠
  if (port.name === 'xeraser-logger') {
    port.onMessage.addListener(function(msg) {
      // 转发给 sidepanel（sidepanel 通过 chrome.runtime.onMessage 接收 cleanupLog）
      chrome.runtime.sendMessage(msg).catch(function() {});
    });
  }
});
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  // 1. sidepanel 发过来的控制命令（start/stop/pause/resume/status）→ 转发给 content script
  if (message.type === 'startCleanup' ||
      message.type === 'pauseCleanup' ||
      message.type === 'resumeCleanup' ||
      message.type === 'stopCleanup' ||
      message.type === 'getCleanupStatus') {

    getXTab().then(function(tab) {
      if (tab) {
        activeTabId = tab.id;
        // 转发到 content script 时添加 target 字段，让 content 知道这是给它的
        var forwardedMessage = Object.assign({}, message, { target: 'content' });
        chrome.tabs.sendMessage(tab.id, forwardedMessage).then(sendResponse).catch(function(e) {
          // "message channel closed" 是跳页时的预期行为（content 在 sendResponse 前被 unload），不报警
          if (e && e.message && e.message.indexOf('message channel closed') >= 0) {
            console.log('[SocialEraser] Content page navigated, message channel closed (expected)');
          } else {
            console.error('[SocialEraser] Failed to send to content:', e);
          }
          sendResponse({ error: 'Content script not ready' });
        });
      } else {
        sendResponse({ error: 'No X tab found' });
      }
    });
    return true;  // 异步 sendResponse，必须返回 true
  }

  // 2. content 发过来的清理状态更新（cleanupLog / cleanupProgress / ...）
  // 注意：chrome.runtime.sendMessage 是广播——content 发 cleanupLog 时
  // sidepanel 的 onMessage listener 也会直接收到。
  // 如果 background 再 broadcastToSidePanel，sidepanel 会收到 2 次。
  // 所以这里不再中转，content 直接广播给 sidepanel。
  // 仍保留 sendResponse 以避免 message channel closed 错误。
  if (sender.tab && (
      message.type === 'cleanupProgress' ||
      message.type === 'cleanupLog' ||
      message.type === 'cleanupComplete' ||
      message.type === 'cleanupError' ||
      message.type === 'cleanupPaused' ||
      message.type === 'cleanupResumed' ||
      message.type === 'cleanupStopped' ||
      message.type === 'statusUpdate')) {
    sendResponse({ received: true });
    return false;
  }

  // 3. 通用 background 命令处理（来自 content 的 status 查询 / 日志）
  if (message.target === 'background') {
    handleBackgroundMessage(message, sendResponse);
    return true;
  }

  // 4. 强制刷新远程配置（用户点「重载配置」按钮触发）
  if (message.target === 'refreshConfig') {
    loadConfigInBackground(true).then(function(config) {
      sendResponse({ config: config, refreshed: true });
    });
    return true;
  }

  // 5. Content script 通过 background 访问 session storage
  //    （manifest V3 限制：content 不可直读 chrome.storage.session，必须经 background 中转）
  if (message.target === 'readPendingCleanup') {
    chrome.storage.session.get('pendingCleanup').then(function(result) {
      sendResponse({ pending: (result && result.pendingCleanup) ? result.pendingCleanup : null });
    });
    return true;
  }

  if (message.target === 'updatePendingCleanup') {
    chrome.storage.session.set({ pendingCleanup: message.pending }).then(function() {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.target === 'clearPendingCleanup') {
    chrome.storage.session.remove('pendingCleanup').then(function() {
      sendResponse({ success: true });
    });
    return true;
  }

  // 6. Content script 跳页（绕过 X SPA 拦截）：用 chrome.tabs.update 在 Chrome 层改 URL
  //    X SPA 的 history.pushState 拦截会导致 location.href 改不了；用 tabs.update 强制改
  if (message.target === 'forceNavigation') {
    getXTab().then(function(tab) {
      if (tab) {
        chrome.tabs.update(tab.id, { url: message.url }).catch(function(e) {
          console.error('[SocialEraser] Failed to navigate tab:', e);
        });
      } else {
        console.warn('[SocialEraser] forceNavigation: no X tab found');
      }
    });
    sendResponse({ success: true });
    return true;
  }
});

// 处理通用 background 命令（getStatus / log）
function handleBackgroundMessage(message, sendResponse) {
  switch (message.type) {
    case 'getStatus':
      sendResponse({ status: 'ok' });
      break;
    case 'log':
      console.log('[SocialEraser]', message.data);
      sendResponse({ success: true });
      break;
    default:
      sendResponse({ error: 'Unknown message type' });
  }
}

// 点击工具栏图标时自动打开 side panel（Chrome 114+ 行为）
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(function(err) {
  console.error('[SocialEraser] Failed to set panel behavior:', err);
});
