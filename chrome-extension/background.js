// X-Eraser Background Script
// 处理 Side Panel 和 Content Script 之间的通信

const CONFIG_URL = 'https://storage.googleapis.com/social-tool-bucket/remote-example.json';

let cachedConfig = null;

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

async function loadConfigInBackground(forceReload = false) {
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
    console.log('[X-Eraser] Background: Fetching config from:', CONFIG_URL, 'forceReload:', forceReload);
    const response = await fetch(CONFIG_URL, {
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache'
      }
    });
    console.log('[X-Eraser] Background: Fetch response status:', response.status);
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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target === 'background') {
    handleBackgroundMessage(message, sendResponse);
    return true;
  }
  
  if (message.target === 'getConfig') {
    sendResponse({ config: cachedConfig });
    return true;
  }
  
  if (message.target === 'refreshConfig') {
    loadConfigInBackground(true).then(config => {
      sendResponse({ config: config, refreshed: true });
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

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(err => {
  console.error('[X-Eraser] Failed to set panel behavior:', err);
});