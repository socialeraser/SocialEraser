// X-Eraser Background Script
// 处理 Side Panel 和 Content Script 之间的通信

const CONFIG_URL = 'https://storage.googleapis.com/social-tool-bucket/remote-example.json';

let cachedConfig = null;
let activeTabId = null;

chrome.runtime.onInstalled.addListener(() => {
  console.log('[X-Eraser] Extension installed');
  loadConfigInBackground();
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
    const result = await chrome.storage.local.get(['remoteConfig', 'configUpdatedAt']);
    if (result.remoteConfig) {
      cachedConfig = result.remoteConfig;
      console.log('[X-Eraser] Config loaded from storage');
      return true;
    }
  } catch (e) {
    console.warn('[X-Eraser] Failed to load config from storage:', e);
  }
  return false;
}

async function loadConfigInBackground(forceReload) {
  if (forceReload === undefined) forceReload = false;
  if (!forceReload && cachedConfig) {
    console.log('[X-Eraser] Using cached config');
    return cachedConfig;
  }

  if (!forceReload) {
    const loadedFromStorage = await loadConfigFromStorage();
    if (loadedFromStorage) {
      console.log('[X-Eraser] Using stored config');
      return cachedConfig;
    }
  }

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
      cachedConfig = await response.json();
      await saveConfigToStorage(cachedConfig);
      console.log('[X-Eraser] Background: Config loaded successfully');
    } else {
      console.warn('[X-Eraser] Background: Config fetch failed, HTTP', response.status);
    }
  } catch (error) {
    console.warn('[X-Eraser] Background: Config fetch failed:', error.message);
  }

  return cachedConfig;
}

loadConfigInBackground();

async function getXTab() {
  const patterns = cachedConfig && cachedConfig.selectors && cachedConfig.selectors.xWebsite && cachedConfig.selectors.xWebsite.patterns || ['x.com', 'twitter.com'];
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
          console.error('[X-Eraser] Failed to send to content:', e);
          sendResponse({ error: 'Content script not ready' });
        });
      } else {
        sendResponse({ error: 'No X tab found' });
      }
    });
    return true;
  }

  // 接收 content script 发送的清理状态更新
  if (sender.tab && (
      message.type === 'cleanupProgress' ||
      message.type === 'cleanupLog' ||
      message.type === 'cleanupComplete' ||
      message.type === 'cleanupError' ||
      message.type === 'cleanupPaused' ||
      message.type === 'cleanupResumed' ||
      message.type === 'cleanupStopped')) {
    console.log('[X-Eraser] Cleanup update:', message.type, message.data);
    broadcastToSidePanel(message);
    sendResponse({ success: true });
    return true;
  }

  if (message.target === 'background') {
    handleBackgroundMessage(message, sendResponse);
    return true;
  }

  if (message.target === 'getConfig') {
    sendResponse({ config: cachedConfig });
    return true;
  }

  if (message.target === 'refreshConfig') {
    loadConfigInBackground(true).then(function(config) {
      sendResponse({ config: config, refreshed: true });
    });
    return true;
  }

  // Content script 检查并清除待恢复的清理任务
  if (message.target === 'consumePendingCleanup') {
    chrome.storage.session.get('pendingCleanup').then(function(result) {
      if (result && result.pendingCleanup) {
        chrome.storage.session.remove('pendingCleanup').then(function() {
          sendResponse({ pending: result.pendingCleanup });
        });
      } else {
        sendResponse({ pending: null });
      }
    });
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
