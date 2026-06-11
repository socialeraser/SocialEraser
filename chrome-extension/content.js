// X-Eraser Content Script
// 注入到 X 网站

(function() {
  'use strict';

  console.log('[X-Eraser] Content script loaded on', window.location.href);

  let remoteConfig = null;

  function initXEraserConfig() {
    window.XEraserConfig = {
      getWebsitePatterns() {
        if (remoteConfig?.selectors?.xWebsite?.patterns) {
          return remoteConfig.selectors.xWebsite.patterns;
        }
        return ['x.com', 'twitter.com'];
      },
      getLoginConfig() {
        if (remoteConfig?.selectors?.login) {
          return remoteConfig.selectors.login;
        }
        return {
          checkElements: {},
          loggedInElements: [
            { type: 'selector', value: "[data-testid='UserAvatar']" },
            { type: 'selector', value: "[data-testid='tweetTextarea_0']" }
          ]
        };
      },
      getWebsiteMatchPatterns() {
        const patterns = this.getWebsitePatterns();
        return patterns.map(domain => `*://${domain}/*`);
      }
    };
  }

  async function loadConfig() {
    try {
      const response = await chrome.runtime.sendMessage({ target: 'getConfig' });
      if (response && response.config) {
        remoteConfig = response.config;
        console.log('[X-Eraser] Config received from background');
      } else {
        console.log('[X-Eraser] No config from background, using defaults');
      }
    } catch (error) {
      console.warn('[X-Eraser] Could not get config from background:', error.message);
    }
    initXEraserConfig();
    console.log('[X-Eraser] Config initialized, checking status...');
    setTimeout(checkXStatus, 500);
  }

  loadConfig();

  // 检查是否是目标网站
  function isTargetWebsite() {
    const patterns = window.XEraserConfig.getWebsitePatterns();
    const currentHost = window.location.hostname.toLowerCase();
    return patterns.some(domain => currentHost.includes(domain.toLowerCase()));
  }

  // 检测页面语言
  function detectPageLanguage() {
    const htmlLang = document.documentElement.lang;
    if (htmlLang) {
      const lang = htmlLang.toLowerCase();
      if (lang.startsWith('zh')) return 'zh';
      if (lang.startsWith('ja')) return 'ja';
      if (lang.startsWith('ko')) return 'ko';
      if (lang.startsWith('es')) return 'es';
      if (lang.startsWith('de')) return 'de';
      if (lang.startsWith('fr')) return 'fr';
      return 'en';
    }
    return 'en';
  }

  // 使用配置检测登录状态
  function checkLoginStatus() {
    const loginConfig = window.XEraserConfig.getLoginConfig();
    const loggedInElements = loginConfig?.loggedInElements || [];
    
    for (const element of loggedInElements) {
      if (element.type === 'selector') {
        const found = document.querySelector(element.value);
        if (found) {
          return true;
        }
      }
    }
    return false;
  }

  // 检测是否在登录页
  function checkIsLoginPage() {
    const loginConfig = window.XEraserConfig.getLoginConfig();
    const checkElementsByLang = loginConfig?.checkElements || {};
    
    const pageLang = detectPageLanguage();
    const langKeys = [
      pageLang,
      pageLang.split('-')[0],
      'en'
    ];
    
    for (const langKey of langKeys) {
      const elements = checkElementsByLang[langKey] || checkElementsByLang[langKey.toUpperCase()] || checkElementsByLang[langKey.toLowerCase()];
      if (elements) {
        for (const element of elements) {
          if (element.type === 'selector') {
            if (document.querySelector(element.value)) {
              return true;
            }
          } else if (element.type === 'text') {
            if (document.body.innerText.includes(element.value)) {
              return true;
            }
          }
        }
      }
    }
    return false;
  }

  // 综合检测状态
  function checkXStatus() {
    const isX = isTargetWebsite();
    const isLoggedIn = isX ? checkLoginStatus() : false;
    
    return {
      isX: isX,
      isLoggedIn: isLoggedIn,
      url: window.location.href
    };
  }

  // 监听来自 sidepanel 的消息
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.target !== 'content') return;

    switch (message.type) {
      case 'getStatus':
        sendResponse(checkXStatus());
        break;
      case 'ping':
        sendResponse({ pong: true });
        break;
      default:
        sendResponse({ error: 'Unknown message type' });
    }
  });

  // 通知状态
  function notifyStatus() {
    const status = checkXStatus();
    chrome.runtime.sendMessage({
      type: 'statusUpdate',
      data: status
    }).catch(() => {});
  }

  // 页面加载完成后通知
  if (document.readyState === 'complete') {
    setTimeout(notifyStatus, 1000);
  } else {
    window.addEventListener('load', () => setTimeout(notifyStatus, 1000));
  }
})();