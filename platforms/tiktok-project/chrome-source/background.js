// TikTok Eraser Background Script (Service Worker)
// 处理 Side Panel ↔ Content Script 之间的消息转发 + 远程配置预加载
//
// 职责分层:
//   - Background（这一层）: Manifest V3 service worker，跑在浏览器层面（不在 TikTok 页面里）
//     能用 chrome.tabs / chrome.storage.session / chrome.scripting 等浏览器级 API
//   - Content Script（content.js）: 注入到 TikTok 页面，跑在 TikTok 页面的 DOM 上下文里
//   - Side Panel（sidepanel.js）: 用户点击工具栏图标打开的控制面板
//
// 数据流:
//   sidepanel → background → content (执行清理)
//   content → sidepanel（直接广播，不经 background 中转，避免收到 2 次）
//
// 与 x-project 的差异：
//   - 域名：TikTok (*://tiktok.com/*, *://www.tiktok.com/*)
//   - CONFIG_URL 走 tiktok- 前缀区分（同一 bucket）
//   - content script 加载顺序：i18n.js → tiktok-automation.js → content.js

const CONFIG_URL = 'https://storage.googleapis.com/social-tool-bucket/tiktok-remote-example.json';
// content script 注入顺序：i18n.js 必须最先（暴露 window.TikTokEraseri18n）→ tiktok-automation.js → content.js
const CONTENT_SCRIPT_FILES = ['i18n.js', 'tiktok-automation.js', 'content.js'];
const CONTENT_SCRIPT_MATCHES = ['*://tiktok.com/*', '*://www.tiktok.com/*'];

let activeTabId = null;

// 给所有已开启的匹配 tab 注入 content script
// 修复"安装前已开 tiktok.com → 插件检测未登录"的 bug
async function injectContentScriptToMatchingTabs() {
  try {
    const tabs = await chrome.tabs.query({ url: CONTENT_SCRIPT_MATCHES });
    if (!tabs || tabs.length === 0) {
      console.log('[TikTok Eraser] No matching tabs to inject into');
      return;
    }
    console.log('[TikTok Eraser] Injecting content script into', tabs.length, 'matching tab(s)');
    for (const tab of tabs) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: CONTENT_SCRIPT_FILES
        });
      } catch (e) {
        console.log('[TikTok Eraser] Skip inject tab', tab.id, ':', e.message);
      }
    }
  } catch (e) {
    console.warn('[TikTok Eraser] Failed to query matching tabs:', e);
  }
}

// 插件安装 / 更新触发：拉配置 + 注入已有 tab
chrome.runtime.onInstalled.addListener(() => {
  console.log('[TikTok Eraser] Extension installed');
  loadConfigInBackground();
  injectContentScriptToMatchingTabs();
});

// Chrome 启动触发：拉配置 + 注入已有 tab
chrome.runtime.onStartup.addListener(() => {
  console.log('[TikTok Eraser] Chrome started');
  loadConfigInBackground();
  injectContentScriptToMatchingTabs();
});

// 把远程配置存进 chrome.storage.local
async function saveConfigToStorage(config) {
  try {
    await chrome.storage.local.set({ tiktokRemoteConfig: config, tiktokConfigUpdatedAt: Date.now() });
    console.log('[TikTok Eraser] Config saved to storage');
  } catch (e) {
    console.warn('[TikTok Eraser] Failed to save config to storage:', e);
  }
}

// 从 chrome.storage.local 读上次缓存的远程配置
async function loadConfigFromStorage() {
  try {
    const result = await chrome.storage.local.get('tiktokRemoteConfig');
    if (result && result.tiktokRemoteConfig) {
      console.log('[TikTok Eraser] Config loaded from storage');
      return result.tiktokRemoteConfig;
    }
  } catch (e) {
    console.warn('[TikTok Eraser] Failed to load config from storage:', e);
  }
  return null;
}

// 后台加载远程配置：3 级回退（remote → storage → bundled default）
async function loadConfigInBackground(forceReload) {
  if (forceReload === undefined) forceReload = false;

  try {
    console.log('[TikTok Eraser] Background: Fetching config from:', CONFIG_URL);
    const response = await fetch(CONFIG_URL, {
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache'
      }
    });
    if (response.ok) {
      const config = await response.json();
      await saveConfigToStorage(config);
      console.log('[TikTok Eraser] Background: Config loaded successfully');
      return config;
    } else {
      console.warn('[TikTok Eraser] Background: Config fetch failed, HTTP', response.status);
    }
  } catch (error) {
    console.warn('[TikTok Eraser] Background: Config fetch failed:', error.message);
  }

  const stored = await loadConfigFromStorage();
  if (stored) {
    console.log('[TikTok Eraser] Background: Using stored config as fallback');
    return stored;
  }

  // storage 也空 → 读 bundled default.json
  try {
    const defaultUrl = chrome.runtime.getURL('config/default.json');
    console.log('[TikTok Eraser] Background: Loading bundled default config from:', defaultUrl);
    const defaultResponse = await fetch(defaultUrl);
    if (defaultResponse.ok) {
      const defaultConfig = await defaultResponse.json();
      await saveConfigToStorage(defaultConfig);
      console.log('[TikTok Eraser] Background: Bundled default config loaded as fallback');
      return defaultConfig;
    } else {
      console.warn('[TikTok Eraser] Background: Bundled default config fetch failed, HTTP', defaultResponse.status);
    }
  } catch (e) {
    console.warn('[TikTok Eraser] Background: Failed to load bundled default config:', e.message);
  }

  return null;
}

loadConfigInBackground();

// 查 TikTok 域名 tab（从远程配置读 patterns，远程失败用默认 ['tiktok.com', 'www.tiktok.com']）
async function getTikTokTab() {
  const stored = await chrome.storage.local.get('tiktokRemoteConfig');
  const cfg = stored && stored.tiktokRemoteConfig;
  const patterns = cfg && cfg.selectors && cfg.selectors.tiktokWebsite && cfg.selectors.tiktokWebsite.patterns || ['tiktok.com', 'www.tiktok.com'];
  const urls = patterns.map(function(domain) { return '*://' + domain + '/*'; });

  const tabs = await chrome.tabs.query({ url: urls });
  return tabs && tabs.length > 0 ? tabs[0] : null;
}

// 消息路由：sidepanel 发的命令 → 转发给 content；content 发的状态 → 转发给 sidepanel
chrome.runtime.onConnect.addListener(function(port) {
  if (port.name === 'tiktokeraser-logger') {
    port.onMessage.addListener(function(msg) {
      chrome.runtime.sendMessage(msg).catch(function() {});
    });
  }
});
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  // 1. sidepanel 发过来的控制命令 → 转发给 content script
  if (message.type === 'startCleanup' ||
      message.type === 'pauseCleanup' ||
      message.type === 'resumeCleanup' ||
      message.type === 'stopCleanup' ||
      message.type === 'getCleanupStatus') {

    // 2026-06-29 修复（用户反馈"Stop 不生效"）:
    //   原版只把 stopCleanup 转发给当前 content script，但 _removeRepostViaShareDialog
    //   会触发 window.location.href 整页跳转 → content script 被销毁 → 新 content script
    //   启动时 checkAndResumePendingCleanup 从 chrome.storage.session.pendingCleanup 读
    //   pending state（没被 stop 清掉）→ 又开新一轮 cleanup 跑同样的循环。
    //   修法：stopCleanup 一进来就同步：
    //     1) 清掉 session.pendingCleanup（新 content script 看不到 → 不 resume）
    //     2) 写 session.userStoppedAt=now（新 content script 启动时再保险读一次）
    //   这两步不依赖 content script 是否能收到消息，跨页跳转时也生效
    if (message.type === 'stopCleanup') {
      try {
        chrome.storage.session.set({ userStoppedAt: Date.now() });
      } catch (e) { /* 兜底：session 不可用不致命 */ }
      chrome.storage.session.remove('pendingCleanup').catch(function() {});
    }
    if (message.type === 'startCleanup') {
      // 启动新一轮时清掉旧的 stop signal（用户重新点了 Start 就要允许 resume）
      try {
        chrome.storage.session.remove('userStoppedAt');
      } catch (e) {}
    }

    getTikTokTab().then(function(tab) {
      if (tab) {
        activeTabId = tab.id;
        var forwardedMessage = Object.assign({}, message, { target: 'content' });
        chrome.tabs.sendMessage(tab.id, forwardedMessage).then(sendResponse).catch(function(e) {
          if (e && e.message && e.message.indexOf('message channel closed') >= 0) {
            console.log('[TikTok Eraser] Content page navigated, message channel closed (expected)');
          } else {
            console.error('[TikTok Eraser] Failed to send to content:', e);
          }
          sendResponse({ error: 'Content script not ready' });
        });
      } else {
        sendResponse({ error: 'No TikTok tab found' });
      }
    });
    return true;
  }

  // 2. content 发过来的清理状态更新
  if (sender.tab && (
      message.type === 'cleanupProgress' ||
      message.type === 'cleanupLog' ||
      message.type === 'cleanupComplete' ||
      message.type === 'cleanupError' ||
      message.type === 'cleanupPaused' ||
      message.type === 'cleanupResumed' ||
      message.type === 'cleanupStopped' ||
      message.type === 'statusUpdate')) {
    if (message.type === 'cleanupComplete') {
      chrome.storage.session.remove('pendingCleanup').catch(function() {});
      chrome.storage.session.remove('deletedRepostUrls').catch(function() {});
      chrome.storage.session.remove('deletedLikesUrls').catch(function() {});
    }
    sendResponse({ received: true });
    return false;
  }

  // 3. 通用 background 命令处理
  if (message.target === 'background') {
    handleBackgroundMessage(message, sendResponse);
    return true;
  }

  // 4. 强制刷新远程配置
  if (message.target === 'refreshConfig') {
    loadConfigInBackground(true).then(function(config) {
      sendResponse({ config: config, refreshed: true });
    });
    return true;
  }

  // 5. Content script 通过 background 访问 session storage
  if (message.target === 'readPendingCleanup') {
    chrome.storage.session.get('pendingCleanup').then(function(result) {
      sendResponse({ pending: (result && result.pendingCleanup) ? result.pendingCleanup : null });
    });
    return true;
  }

  // 2026-06-29 新增（userStoppedAt 防线）: content script auto-resume 启动前先查这个
  //   用户点 Stop 时 background 会写 userStoppedAt=now（同时清 pendingCleanup）
  //   新 content script 启动时如果看到这个信号就放弃 resume
  if (message.target === 'readUserStopped') {
    chrome.storage.session.get('userStoppedAt').then(function(result) {
      sendResponse({ userStoppedAt: (result && result.userStoppedAt) ? result.userStoppedAt : null });
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

  // 2026-06-29 新增：repost forcePageLoad fallback 用。
  //   processReposts 启动时（profile page + repost-tab 选中）写入 'https://www.tiktok.com/@username'，
  //   fallback / auto-resume 时 getPageURLForType 读出来用，避免卡在 For You feed。
  if (message.target === 'writeRepostsTargetUrl') {
    chrome.storage.session.set({ repostsTargetUrl: message.url }).then(function() {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.target === 'readRepostsTargetUrl') {
    chrome.storage.session.get(['repostsTargetUrl']).then(function(resp) {
      sendResponse({ url: (resp && resp.repostsTargetUrl) || null });
    });
    return true;
  }

  if (message.target === 'readDeletedRepostUrls') {
    chrome.storage.session.get(['deletedRepostUrls']).then(function(resp) {
      sendResponse({ urls: (resp && resp.deletedRepostUrls) || [] });
    });
    return true;
  }

  if (message.target === 'writeDeletedRepostUrls') {
    chrome.storage.session.set({ deletedRepostUrls: message.urls }).then(function() {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.target === 'readDeletedLikesUrls') {
    chrome.storage.session.get(['deletedLikesUrls']).then(function(resp) {
      sendResponse({ urls: (resp && resp.deletedLikesUrls) || [] });
    });
    return true;
  }

  if (message.target === 'writeDeletedLikesUrls') {
    chrome.storage.session.set({ deletedLikesUrls: message.urls }).then(function() {
      sendResponse({ success: true });
    });
    return true;
  }

  // 6. Content script 跳页
  if (message.target === 'forceNavigation') {
    getTikTokTab().then(function(tab) {
      if (tab) {
        chrome.tabs.update(tab.id, { url: message.url }).catch(function(e) {
          console.error('[TikTok Eraser] Failed to navigate tab:', e);
        });
      } else {
        console.warn('[TikTok Eraser] forceNavigation: no TikTok tab found');
      }
    });
    sendResponse({ success: true });
    return true;
  }
});

// 处理通用 background 命令
function handleBackgroundMessage(message, sendResponse) {
  switch (message.type) {
    case 'getStatus':
      sendResponse({ status: 'ok' });
      break;
    case 'log':
      console.log('[TikTok Eraser]', message.data);
      sendResponse({ success: true });
      break;
    default:
      sendResponse({ error: 'Unknown message type' });
  }
}

// 点击工具栏图标时自动打开 side panel
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(function(err) {
  console.error('[TikTok Eraser] Failed to set panel behavior:', err);
});
