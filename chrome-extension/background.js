// X-Eraser Background Script
// 处理 Side Panel 和 Content Script 之间的通信

const CONFIG_URL = 'https://storage.googleapis.com/social-tool-bucket/remote-example.json';
const CONTENT_SCRIPT_FILES = ['lib/i18n.js', 'lib/config.js', 'lib/injector.js', 'content.js'];
const CONTENT_SCRIPT_MATCHES = ['*://x.com/*', '*://twitter.com/*'];

let activeTabId = null;

// 给所有已开启的匹配 tab 注入 content script
// 修复"安装前已开 x.com → 插件检测未登录"的 bug
// （Manifest V3 content_scripts 只在匹配 URL 新加载时注入）
async function injectContentScriptToMatchingTabs() {
  try {
    const tabs = await chrome.tabs.query({ url: CONTENT_SCRIPT_MATCHES });
    if (!tabs || tabs.length === 0) {
      console.log('[X-Eraser] No matching tabs to inject into');
      return;
    }
    console.log('[X-Eraser] Injecting content script into', tabs.length, 'matching tab(s)');
    for (const tab of tabs) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: CONTENT_SCRIPT_FILES
        });
      } catch (e) {
        console.log('[X-Eraser] Skip inject tab', tab.id, ':', e.message);
      }
    }
  } catch (e) {
    console.warn('[X-Eraser] Failed to query matching tabs:', e);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  console.log('[X-Eraser] Extension installed');
  loadConfigInBackground();
  injectContentScriptToMatchingTabs();
});

chrome.runtime.onStartup.addListener(() => {
  console.log('[X-Eraser] Chrome started');
  loadConfigInBackground();
  injectContentScriptToMatchingTabs();
});

async function saveConfigToStorage(config) {
  try {
    await chrome.storage.local.set({ remoteConfig: config, configUpdatedAt: Date.now() });
    console.log('[X-Eraser] Config saved to storage');
  } catch (e) {
    console.warn('[X-Eraser] Failed to save config to storage:', e);
  }
}

async function loadConfigFromStorage() {
  try {
    const result = await chrome.storage.local.get('remoteConfig');
    if (result && result.remoteConfig) {
      console.log('[X-Eraser] Config loaded from storage');
      return result.remoteConfig;
    }
  } catch (e) {
    console.warn('[X-Eraser] Failed to load config from storage:', e);
  }
  return null;
}

async function loadConfigInBackground(forceReload) {
  if (forceReload === undefined) forceReload = false;

  // 每次 service worker 启动都重新拉取最新配置
  try {
    console.log('[X-Eraser] Background: Fetching config from:', CONFIG_URL);
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
      console.log('[X-Eraser] Background: Config loaded successfully');
      return config;
    } else {
      console.warn('[X-Eraser] Background: Config fetch failed, HTTP', response.status);
    }
  } catch (error) {
    console.warn('[X-Eraser] Background: Config fetch failed:', error.message);
  }

  // 远程 fetch 失败 → 从 storage 拿上次缓存的（兜底）
  const stored = await loadConfigFromStorage();
  if (stored) {
    console.log('[X-Eraser] Background: Using stored config as fallback');
  }
  return stored;
}

loadConfigInBackground();

async function getXTab() {
  const stored = await chrome.storage.local.get('remoteConfig');
  const cfg = stored && stored.remoteConfig;
  const patterns = cfg && cfg.selectors && cfg.selectors.xWebsite && cfg.selectors.xWebsite.patterns || ['x.com', 'twitter.com'];
  const urls = patterns.map(function(domain) { return '*://' + domain + '/*'; });

  const tabs = await chrome.tabs.query({ url: urls });
  return tabs && tabs.length > 0 ? tabs[0] : null;
}

function broadcastToSidePanel(message) {
  chrome.runtime.sendMessage(message).catch(function() {
    // side panel 可能没打开，忽略错误
  });
}

chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  if (message.type === 'startCleanup' ||
      message.type === 'pauseCleanup' ||
      message.type === 'resumeCleanup' ||
      message.type === 'stopCleanup' ||
      message.type === 'getCleanupStatus') {

    getXTab().then(function(tab) {
      if (tab) {
        activeTabId = tab.id;
        // 转发到 content script 时添加 target 字段
        var forwardedMessage = Object.assign({}, message, { target: 'content' });
        chrome.tabs.sendMessage(tab.id, forwardedMessage).then(sendResponse).catch(function(e) {
          // "message channel closed" 是跳页时的预期行为（content 在 sendResponse 前被 unload），不报警
          if (e && e.message && e.message.indexOf('message channel closed') >= 0) {
            console.log('[X-Eraser] Content page navigated, message channel closed (expected)');
          } else {
            console.error('[X-Eraser] Failed to send to content:', e);
          }
          sendResponse({ error: 'Content script not ready' });
        });
      } else {
        sendResponse({ error: 'No X tab found' });
      }
    });
    return true;
  }

  // 接收 content script 发送的清理状态更新
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

  if (message.target === 'background') {
    handleBackgroundMessage(message, sendResponse);
    return true;
  }

  if (message.target === 'refreshConfig') {
    loadConfigInBackground(true).then(function(config) {
      sendResponse({ config: config, refreshed: true });
    });
    return true;
  }

  // Content script 通过 background 访问 session storage（manifest V3 限制：content 不可直读 session）
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

  // Content script 跳页（绕过 X SPA 拦截）：用 chrome.tabs.update 在 Chrome 层改 URL
  if (message.target === 'forceNavigation') {
    getXTab().then(function(tab) {
      if (tab) {
        chrome.tabs.update(tab.id, { url: message.url }).catch(function(e) {
          console.error('[X-Eraser] Failed to navigate tab:', e);
        });
      } else {
        console.warn('[X-Eraser] forceNavigation: no X tab found');
      }
    });
    sendResponse({ success: true });
    return true;
  }
});

function handleBackgroundMessage(message, sendResponse) {
  switch (message.type) {
    case 'getStatus':
      sendResponse({ status: 'ok' });
      break;
    case 'log':
      console.log('[X-Eraser]', message.data);
      sendResponse({ success: true });
      break;
    default:
      sendResponse({ error: 'Unknown message type' });
  }
}

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(function(err) {
  console.error('[X-Eraser] Failed to set panel behavior:', err);
});
