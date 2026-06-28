// TikTok Eraser Background Script (Service Worker) — Edge
// 与 chrome-source/background.js 共享逻辑（Edge 基于 Chromium，行为一致）
// 这里保留独立文件以便未来 Edge 特定逻辑扩展

const CONFIG_URL = 'https://storage.googleapis.com/social-tool-bucket/tiktok-remote-example.json';
const CONTENT_SCRIPT_FILES = ['i18n.js', 'tiktok-automation.js', 'content.js'];
const CONTENT_SCRIPT_MATCHES = ['*://tiktok.com/*', '*://www.tiktok.com/*'];

let activeTabId = null;

async function injectContentScriptToMatchingTabs() {
  try {
    const tabs = await chrome.tabs.query({ url: CONTENT_SCRIPT_MATCHES });
    if (!tabs || tabs.length === 0) {
      console.log('[TikTok Eraser Edge] No matching tabs to inject into');
      return;
    }
    console.log('[TikTok Eraser Edge] Injecting content script into', tabs.length, 'matching tab(s)');
    for (const tab of tabs) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: CONTENT_SCRIPT_FILES
        });
      } catch (e) {
        console.log('[TikTok Eraser Edge] Skip inject tab', tab.id, ':', e.message);
      }
    }
  } catch (e) {
    console.warn('[TikTok Eraser Edge] Failed to query matching tabs:', e);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  console.log('[TikTok Eraser Edge] Extension installed');
  loadConfigInBackground();
  injectContentScriptToMatchingTabs();
});

chrome.runtime.onStartup.addListener(() => {
  console.log('[TikTok Eraser Edge] Edge started');
  loadConfigInBackground();
  injectContentScriptToMatchingTabs();
});

async function saveConfigToStorage(config) {
  try {
    await chrome.storage.local.set({ tiktokRemoteConfig: config, tiktokConfigUpdatedAt: Date.now() });
  } catch (e) {
    console.warn('[TikTok Eraser Edge] Failed to save config to storage:', e);
  }
}

async function loadConfigFromStorage() {
  try {
    const result = await chrome.storage.local.get('tiktokRemoteConfig');
    if (result && result.tiktokRemoteConfig) return result.tiktokRemoteConfig;
  } catch (e) {
    console.warn('[TikTok Eraser Edge] Failed to load config from storage:', e);
  }
  return null;
}

async function loadConfigInBackground(forceReload) {
  if (forceReload === undefined) forceReload = false;

  try {
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
      return config;
    }
  } catch (error) {
    console.warn('[TikTok Eraser Edge] Config fetch failed:', error.message);
  }

  const stored = await loadConfigFromStorage();
  if (stored) return stored;

  try {
    const defaultUrl = chrome.runtime.getURL('config/default.json');
    const defaultResponse = await fetch(defaultUrl);
    if (defaultResponse.ok) {
      const defaultConfig = await defaultResponse.json();
      await saveConfigToStorage(defaultConfig);
      return defaultConfig;
    }
  } catch (e) {
    console.warn('[TikTok Eraser Edge] Failed to load bundled default config:', e.message);
  }

  return null;
}

loadConfigInBackground();

async function getTikTokTab() {
  const stored = await chrome.storage.local.get('tiktokRemoteConfig');
  const cfg = stored && stored.tiktokRemoteConfig;
  const patterns = cfg && cfg.selectors && cfg.selectors.tiktokWebsite && cfg.selectors.tiktokWebsite.patterns || ['tiktok.com', 'www.tiktok.com'];
  const urls = patterns.map(function(domain) { return '*://' + domain + '/*'; });
  const tabs = await chrome.tabs.query({ url: urls });
  return tabs && tabs.length > 0 ? tabs[0] : null;
}

chrome.runtime.onConnect.addListener(function(port) {
  if (port.name === 'tiktokeraser-logger') {
    port.onMessage.addListener(function(msg) {
      chrome.runtime.sendMessage(msg).catch(function() {});
    });
  }
});
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  if (message.type === 'startCleanup' ||
      message.type === 'pauseCleanup' ||
      message.type === 'resumeCleanup' ||
      message.type === 'stopCleanup' ||
      message.type === 'getCleanupStatus') {
    getTikTokTab().then(function(tab) {
      if (tab) {
        activeTabId = tab.id;
        var forwardedMessage = Object.assign({}, message, { target: 'content' });
        chrome.tabs.sendMessage(tab.id, forwardedMessage).then(sendResponse).catch(function(e) {
          if (e && e.message && e.message.indexOf('message channel closed') >= 0) {
            // ignore
          } else {
            console.error('[TikTok Eraser Edge] Failed to send to content:', e);
          }
          sendResponse({ error: 'Content script not ready' });
        });
      } else {
        sendResponse({ error: 'No TikTok tab found' });
      }
    });
    return true;
  }

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

  if (message.target === 'forceNavigation') {
    getTikTokTab().then(function(tab) {
      if (tab) {
        chrome.tabs.update(tab.id, { url: message.url }).catch(function(e) {
          console.error('[TikTok Eraser Edge] Failed to navigate tab:', e);
        });
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
      console.log('[TikTok Eraser Edge]', message.data);
      sendResponse({ success: true });
      break;
    default:
      sendResponse({ error: 'Unknown message type' });
  }
}

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(function(err) {
  console.error('[TikTok Eraser Edge] Failed to set panel behavior:', err);
});
