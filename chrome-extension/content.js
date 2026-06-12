// X-Eraser Content Script
// 注入到 X 网站

(function() {
  'use strict';

  console.log('[X-Eraser] Content script loaded on', window.location.href);

  let remoteConfig = null;
  let injector = null;

  const GLOBAL_LOGIN_INDICATORS = [
    "[data-testid='AppBody-Assistor']",
    "[data-testid='SideNav_AccountSwitcher']",
    "[aria-label*='Account menu']",
    "[data-testid='UserAvatar']",
  ];

  function initXEraserConfig() {
    window.XEraserConfig = {
      getWebsitePatterns() {
        if (remoteConfig && remoteConfig.selectors && remoteConfig.selectors.xWebsite && remoteConfig.selectors.xWebsite.patterns) {
          return remoteConfig.selectors.xWebsite.patterns;
        }
        return ['x.com', 'twitter.com'];
      },
      getLoginConfig() {
        if (remoteConfig && remoteConfig.selectors && remoteConfig.selectors.login) {
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
      getGlobalLoginIndicators() {
        if (remoteConfig && remoteConfig.selectors && remoteConfig.selectors.login && remoteConfig.selectors.login.globalIndicators) {
          return remoteConfig.selectors.login.globalIndicators;
        }
        return GLOBAL_LOGIN_INDICATORS;
      },
      getSelectors() {
        return (remoteConfig && remoteConfig.selectors) || {};
      }
    };
  }

  function initInjector() {
    if (window.XEraserInjector) {
      injector = new window.XEraserInjector();
      injector.setConfig(remoteConfig);

      injector.onProgress = function(count, message) {
        chrome.runtime.sendMessage({
          type: 'cleanupProgress',
          data: { count: count, message: message }
        }).catch(function() {});
      };

      injector.onLog = function(message, type) {
        chrome.runtime.sendMessage({
          type: 'cleanupLog',
          data: { message: message, level: type }
        }).catch(function() {});
      };

      injector.onComplete = function(result) {
        chrome.runtime.sendMessage({
          type: 'cleanupComplete',
          data: result
        }).catch(function() {});
      };

      injector.onError = function(message) {
        chrome.runtime.sendMessage({
          type: 'cleanupError',
          data: { message: message }
        }).catch(function() {});
      };

      console.log('[X-Eraser] Injector initialized');
    }
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
    initInjector();

    console.log('[X-Eraser] Config initialized, checking status...');
    setTimeout(checkXStatus, 500);

    // 等待 DOM 完全加载后检查并自动恢复清理任务
    setTimeout(checkAndResumePendingCleanup, 1500);
  }

  async function checkAndResumePendingCleanup() {
    try {
      const response = await chrome.runtime.sendMessage({ target: 'consumePendingCleanup' });
      if (response && response.pending) {
        console.log('[X-Eraser] Resuming pending cleanup:', response.pending);
        const pageType = detectPageType();
        const types = response.pending.types || [];
        console.log('[X-Eraser] After navigation - types:', types, 'pageType:', pageType);

        // 通知 side panel
        chrome.runtime.sendMessage({
          type: 'cleanupLog',
          data: { message: 'Page loaded, resuming cleanup...', level: 'info' }
        }).catch(function() {});

        // 检查页面类型是否匹配
        const needsNav = (
          (types.indexOf('likes') >= 0 && pageType !== 'likes') ||
          (types.indexOf('bookmarks') >= 0 && pageType !== 'bookmarks') ||
          (types.indexOf('messages') >= 0 && pageType !== 'messages')
        );

        if (needsNav) {
          // 仍然不对，跳回正确页面（防止循环）
          console.warn('[X-Eraser] Page type still mismatch after navigation');
          chrome.runtime.sendMessage({
            type: 'cleanupLog',
            data: { message: 'Page type mismatch, aborting', level: 'error' }
          }).catch(function() {});
          return;
        }

        // 自动开始清理
        if (injector) {
          injector.setConfig(remoteConfig);
          injector.startCleanup(response.pending);
          chrome.runtime.sendMessage({
            type: 'cleanupLog',
            data: { message: 'Cleanup auto-resumed', level: 'success' }
          }).catch(function() {});
        }
      }
    } catch (error) {
      console.warn('[X-Eraser] Failed to check pending cleanup:', error.message);
    }
  }

  loadConfig();

  function isTargetWebsite() {
    const patterns = window.XEraserConfig.getWebsitePatterns();
    const currentHost = window.location.hostname.toLowerCase();
    return patterns.some(function(domain) {
      return currentHost.includes(domain.toLowerCase());
    });
  }

  function detectPageLanguage() {
    const htmlLang = document.documentElement.lang;
    if (htmlLang) {
      const lang = htmlLang.toLowerCase();
      if (lang.startsWith('zh')) return lang.includes('tw') || lang.includes('hant') ? 'zh-TW' : 'zh-CN';
      if (lang.startsWith('ja')) return 'ja';
      if (lang.startsWith('ko')) return 'ko';
      if (lang.startsWith('es')) return 'es';
      if (lang.startsWith('de')) return 'de';
      if (lang.startsWith('fr')) return 'fr';
      return 'en';
    }
    return 'en';
  }

  function checkGlobalLoginIndicators() {
    const indicators = window.XEraserConfig.getGlobalLoginIndicators();
    for (let i = 0; i < indicators.length; i++) {
      try {
        const element = document.querySelector(indicators[i]);
        if (element) {
          console.log('[X-Eraser] Global login indicator found:', indicators[i]);
          return true;
        }
      } catch (e) {
        // ignore
      }
    }
    return false;
  }

  function checkLoginStatusWithConfig() {
    const loginConfig = window.XEraserConfig.getLoginConfig();
    const loggedInElements = loginConfig.loggedInElements || [];
    for (let i = 0; i < loggedInElements.length; i++) {
      const element = loggedInElements[i];
      if (element.type === 'selector') {
        const found = document.querySelector(element.value);
        if (found) return true;
      }
    }
    return false;
  }

  function checkLoginStatus() {
    if (checkGlobalLoginIndicators()) return true;
    return checkLoginStatusWithConfig();
  }

  function checkIsLoginPage() {
    const loginConfig = window.XEraserConfig.getLoginConfig();
    const checkElementsByLang = loginConfig.checkElements || {};

    const pageLang = detectPageLanguage();
    const langKeys = [pageLang, pageLang.split('-')[0], 'en'];

    for (let i = 0; i < langKeys.length; i++) {
      const elements = checkElementsByLang[langKeys[i]];
      if (elements) {
        for (let j = 0; j < elements.length; j++) {
          const element = elements[j];
          if (element.type === 'selector') {
            if (document.querySelector(element.value)) return true;
          } else if (element.type === 'text') {
            if (document.body.innerText.includes(element.value)) return true;
          }
        }
      }
    }
    return false;
  }

  // 检测当前 URL 类型
  function detectPageType() {
    const url = window.location.href.toLowerCase();
    if (url.includes('/likes')) return 'likes';
    if (url.includes('/bookmarks')) return 'bookmarks';
    if (url.includes('/following') && !url.match(/\/following\//)) return 'following';
    if (url.includes('/messages')) return 'messages';
    if (url.match(/^\/[^/]+\/status\//) || url.includes('/status/')) return 'tweets';
    return 'other';
  }

  // 从页面上获取当前登录用户的用户名
  function getCurrentUsername() {
    // 尝试 1: 从导航栏 Profile 链接获取
    var profileLink = document.querySelector('a[data-testid="AppTabBar_Profile_Link"]');
    if (profileLink) {
      var href = profileLink.getAttribute('href');
      var match = href && href.match(/^\/([^\/\?]+)/);
      if (match && match[1]) {
        console.log('[X-Eraser] Got username from AppTabBar_Profile_Link:', match[1]);
        return match[1];
      }
    }

    // 尝试 2: 从 AccountSwitcher 获取
    var accountSwitcher = document.querySelector('a[data-testid="SideNav_AccountSwitcher_LogoutLink"]');
    if (accountSwitcher) {
      // 这个 link 包含 logout，需要从父级获取用户名
    }

    // 尝试 3: 从导航栏的用户头像链接获取
    var avatarLinks = document.querySelectorAll('a[href^="/"]');
    var reservedPaths = ['home', 'explore', 'notifications', 'messages', 'bookmarks', 'i', 'search', 'settings', 'compose', 'login'];
    for (var i = 0; i < avatarLinks.length; i++) {
      var href = avatarLinks[i].getAttribute('href');
      var m = href && href.match(/^\/([^\/\?]+)$/);
      if (m && m[1] && reservedPaths.indexOf(m[1]) === -1) {
        // 检查是否是 profile 链接（通常是头像或 profile 按钮）
        var ariaLabel = avatarLinks[i].getAttribute('aria-label') || '';
        if (ariaLabel.toLowerCase().indexOf('profile') >= 0) {
          console.log('[X-Eraser] Got username from avatar link:', m[1]);
          return m[1];
        }
      }
    }

    // 尝试 4: 从当前 URL（如果在 profile 页面）
    var urlMatch = window.location.pathname.match(/^\/([^\/]+)\/?$/);
    if (urlMatch && urlMatch[1] && reservedPaths.indexOf(urlMatch[1]) === -1) {
      console.log('[X-Eraser] Got username from URL path:', urlMatch[1]);
      return urlMatch[1];
    }

    return null;
  }

  function getLikesPageURL() {
    var username = getCurrentUsername();
    if (username) {
      return 'https://x.com/' + username + '/likes';
    }
    console.warn('[X-Eraser] Could not get username, using /i/likes fallback');
    return 'https://x.com/i/likes';
  }

  function getBookmarksPageURL() {
    return 'https://x.com/i/bookmarks';
  }

  function getMessagesPageURL() {
    return 'https://x.com/messages';
  }

  function checkXStatus() {
    const isX = isTargetWebsite();
    const isLoggedIn = isX ? checkLoginStatus() : false;
    const isLoginPage = isX ? checkIsLoginPage() : false;
    const pageType = isX ? detectPageType() : null;

    return {
      isX: isX,
      isLoggedIn: isLoggedIn,
      isLoginPage: isLoginPage,
      pageType: pageType,
      url: window.location.href
    };
  }

  chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
    if (message.target !== 'content') return;

    switch (message.type) {
      case 'getStatus':
        sendResponse(checkXStatus());
        break;
      case 'ping':
        sendResponse({ pong: true });
        break;
      case 'startCleanup':
        if (!injector) {
          sendResponse({ error: 'Injector not ready' });
          return;
        }
        // 检查页面类型与所选类型是否匹配
        const pageType = detectPageType();
        const types = (message.options && message.options.types) || [];
        console.log('[X-Eraser] Start cleanup - types:', types, 'pageType:', pageType);

        if (types.indexOf('likes') >= 0 && pageType !== 'likes') {
          const likesUrl = getLikesPageURL();
          console.log('[X-Eraser] Likes requires /likes page, current:', pageType);
          chrome.runtime.sendMessage({
            type: 'cleanupLog',
            data: { message: 'Likes requires /likes page, navigating...', level: 'info' }
          }).catch(function() {});
          chrome.runtime.sendMessage({
            type: 'cleanupLog',
            data: { message: 'Navigating to: ' + likesUrl, level: 'info' }
          }).catch(function() {});
          // 导航到 likes 页面
          window.location.href = likesUrl;
          sendResponse({ started: true, needsNavigation: true });
          return;
        }

        if (types.indexOf('bookmarks') >= 0 && pageType !== 'bookmarks') {
          const bookmarksUrl = getBookmarksPageURL();
          console.log('[X-Eraser] Bookmarks requires /bookmarks page, current:', pageType);
          chrome.runtime.sendMessage({
            type: 'cleanupLog',
            data: { message: 'Bookmarks requires /bookmarks page, navigating...', level: 'info' }
          }).catch(function() {});
          window.location.href = bookmarksUrl;
          sendResponse({ started: true, needsNavigation: true });
          return;
        }

        if (types.indexOf('messages') >= 0 && pageType !== 'messages') {
          const messagesUrl = getMessagesPageURL();
          console.log('[X-Eraser] Messages requires /messages page, current:', pageType);
          chrome.runtime.sendMessage({
            type: 'cleanupLog',
            data: { message: 'Messages requires /messages page, navigating...', level: 'info' }
          }).catch(function() {});
          window.location.href = messagesUrl;
          sendResponse({ started: true, needsNavigation: true });
          return;
        }

        injector.setConfig(remoteConfig);
        injector.startCleanup(message.options);
        sendResponse({ started: true });
        break;
      case 'pauseCleanup':
        if (injector) {
          injector.pause();
          sendResponse({ paused: true });
        }
        break;
      case 'resumeCleanup':
        if (injector) {
          injector.resume();
          sendResponse({ resumed: true });
        }
        break;
      case 'stopCleanup':
        if (injector) {
          injector.stop();
          sendResponse({ stopped: true });
        }
        break;
      case 'getCleanupStatus':
        if (injector) {
          sendResponse(injector.getStatus());
        } else {
          sendResponse({ isRunning: false });
        }
        break;
      default:
        sendResponse({ error: 'Unknown message type' });
    }
  });

  function notifyStatus() {
    const status = checkXStatus();
    chrome.runtime.sendMessage({
      type: 'statusUpdate',
      data: status
    }).catch(function() {});
  }

  if (document.readyState === 'complete') {
    setTimeout(notifyStatus, 1000);
  } else {
    window.addEventListener('load', function() { setTimeout(notifyStatus, 1000); });
  }
})();
