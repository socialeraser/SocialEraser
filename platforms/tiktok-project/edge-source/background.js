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

    // 2026-06-29 修复（用户反馈"Stop 不生效"）:
    //   跨页跳转时 content script 被销毁，新 content script 启动时 checkAndResumePendingCleanup
    //   仍能从 session.pendingCleanup 读到 pending 状态开新一轮。stopCleanup 进来时同步：
    //     1) 清掉 session.pendingCleanup（新 content script 看不到 → 不 resume）
    //     2) 写 session.userStoppedAt=now（auto-resume 启动时再保险读一次）
    if (message.type === 'stopCleanup') {
      try {
        chrome.storage.session.set({ userStoppedAt: Date.now() });
      } catch (e) { /* 兜底 */ }
      chrome.storage.session.remove('pendingCleanup').catch(function() {});
    }
    if (message.type === 'startCleanup') {
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
    // 2026-07-02 修复：cleanupComplete 不再自动清 pendingCleanup。
    // 原因：手动 startCleanup 走 multi-type state machine，automation.js
    //   startCleanup({types: [matchedType]}) 跑完一个 type 就触发 onComplete →
    //   cleanupComplete。如果这里 remove pendingCleanup，会清掉 content.js
    //   在 startCleanup 之前为剩余 types 写的 pending，导致 force page load
    //   后新 content script 读不到 pending → multi-type 真的停止。
    // 由 content.js 的多 type state machine 显式管理 pendingCleanup 生命周期
    // （在所有 type 跑完后调 clearPendingCleanup）。
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

  // 2026-06-29 新增（userStoppedAt 防线）
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

  // 2026-06-29 新增：repost forcePageLoad fallback 用
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

  // 6. 登录态 sticky 持久化（与 chrome-source + x-project 对齐）
  if (message.target === 'readLoginStatus') {
    chrome.storage.session.get('loginStatus').then(function(result) {
      sendResponse({ status: (result && result.loginStatus) ? result.loginStatus : null });
    });
    return true;
  }

  if (message.target === 'writeLoginStatus') {
    chrome.storage.session.set({ loginStatus: message.status }).then(function() {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.target === 'clearLoginStatus') {
    chrome.storage.session.remove('loginStatus').then(function() {
      sendResponse({ success: true });
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
