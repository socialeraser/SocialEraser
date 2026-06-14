// X-Eraser Content Script
// 注入到 X 网站

// 防止 manifest content_scripts + chrome.scripting.executeScript 重复注入同一个 content.js
// 重复注入会导致 2 个 injector 实例、2 个 onLog 包装、日志面板重复输出
(function() {
  'use strict';
  if (window.__XEraserContentInjected) {
    console.log('[X-Eraser] Content script already injected, skipping re-init');
    return;
  }
  window.__XEraserContentInjected = true;

  console.log('[X-Eraser] Content script loaded on', window.location.href);

  let injector = null;

  const GLOBAL_LOGIN_INDICATORS = [
    "[data-testid='AppBody-Assistor']",
    "[data-testid='SideNav_AccountSwitcher']",
    "[aria-label*='Account menu']",
    "[data-testid='UserAvatar']",
  ];

  // 直接从 storage 读远程配置（中间不再经过 background）
  async function getRemoteConfig() {
    try {
      const stored = await chrome.storage.local.get('remoteConfig');
      if (stored && stored.remoteConfig) return stored.remoteConfig;
    } catch (e) {
      console.warn('[X-Eraser] Failed to read remote config from storage:', e.message);
    }
    return null;
  }

  function initXEraserConfig(remoteConfig) {
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

  function initInjector(remoteConfig) {
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
        });
      };

      injector.onError = function(message) {
        chrome.runtime.sendMessage({
          type: 'cleanupError',
          data: { message: message }
        }).catch(function() {});
      };

      injector.onTypeStart = function(type) {
        chrome.runtime.sendMessage({
          type: 'cleanupTypeStart',
          data: { type: type }
        }).catch(function() {});
      };

      injector.onTypeComplete = function(type, processed) {
        chrome.runtime.sendMessage({
          type: 'cleanupTypeComplete',
          data: { type: type, processed: processed }
        }).catch(function() {});
      };

      console.log('[X-Eraser] Injector initialized');
    }
  }

  async function loadConfig() {
    const remoteConfig = await getRemoteConfig();
    if (remoteConfig) {
      console.log('[X-Eraser] Config loaded from storage');
    } else {
      console.log('[X-Eraser] No config in storage, using defaults');
    }

    initXEraserConfig(remoteConfig);
    initInjector(remoteConfig);

    console.log('[X-Eraser] Config initialized, checking status...');
    setTimeout(checkXStatus, 500);

    // 用 MutationObserver 监听 article 元素出现，触发后立即启动 auto-resume
    // 比固定 setTimeout 更稳：早触发立即启动，晚触发不等满 timeout，3s 兜底防 observer 漏
    waitForArticles(3000).then(function(count) {
      console.log('[X-Eraser] Articles detected:', count, '— proceeding to auto-resume');
      checkAndResumePendingCleanup();
    }).catch(function(e) {
      console.error('[X-Eraser] waitForArticles failed:', e);
    });
  }

  // 监听 X 推文卡片（<article> 标签）出现，立即 resolve；超时兜底
  function waitForArticles(timeout) {
    if (timeout === undefined) timeout = 3000;
    return new Promise(function(resolve) {
      // document_start 注入时 <body> 还没创建，MutationObserver.observe(null) 会抛
      // 等 DOMContentLoaded 后再启动 observer
      function startObserving() {
        if (!document.body) {
          if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', startObserving, { once: true });
          } else {
            // 极端情况：readyState 不是 loading 但 body 仍 null（极少见）
            setTimeout(startObserving, 10);
          }
          return;
        }

        // 1. 立即检查：已有则直接 resolve
        var initial = document.querySelectorAll('article').length;
        if (initial > 0) { resolve(initial); return; }

        // 2. MutationObserver 监听 DOM 变化
        var resolved = false;
        var observer = new MutationObserver(function() {
          if (resolved) return;
          var n = document.querySelectorAll('article').length;
          if (n > 0) {
            resolved = true;
            observer.disconnect();
            resolve(n);
          }
        });
        observer.observe(document.body, { childList: true, subtree: true });

        // 3. 兜底超时（X 真的挂了或 article 选择器失效也不会永远等）
        setTimeout(function() {
          if (resolved) return;
          resolved = true;
          observer.disconnect();
          resolve(0);
        }, timeout);
      }

      startObserving();
    });
  }

  // 强制跳页：通过 background chrome.tabs.update 改 tab URL
  // X 的 React Router 会拦截 location.replace/href 走软路由，必须绕过
  // chrome.tabs.update 是 Chrome API 层，X 拦不了
  function forcePageLoad(url) {
    const sep = url.indexOf('?') >= 0 ? '&' : '?';
    const finalUrl = url + sep + '_=' + Date.now();
    try {
      chrome.runtime.sendMessage({
        target: 'forceNavigation',
        url: finalUrl
      });
    } catch (e) {
      // 兜底：background 不可用时退回 location.replace
      console.warn('[X-Eraser] forceNavigation failed, fallback to location.replace:', e);
      window.location.replace(finalUrl);
    }
  }

  async function checkAndResumePendingCleanup() {
    try {
      // Content script 不能直读 session storage（manifest V3 限制），走 background 消息
      const readResp = await chrome.runtime.sendMessage({ target: 'readPendingCleanup' });
      if (!readResp || !readResp.pending) {
        return;
      }

      const pending = readResp.pending;
      const pageType = detectPageType();
      const types = pending.types || [];
      console.log('[X-Eraser] Resuming pending cleanup - types:', types, 'pageType:', pageType);

      // 通知 side panel
      chrome.runtime.sendMessage({
        type: 'cleanupLog',
        data: { message: t('pageLoadedResuming'), level: 'info' }
      }).catch(function() {});

      // 找到 pageType 匹配的那个 type（仅一个）
      const matchedType = types.find(function(t) {
        if (t === 'likes') return pageType === 'likes';
        if (t === 'bookmarks') return pageType === 'bookmarks';
        if (t === 'tweets') return pageType === 'tweets';
        if (t === 'following') return pageType === 'following';
        return false;
      });

      if (!matchedType) {
        // 当前页面不匹配任何 type，兜底跳到第一个
        const firstType = types[0];
        const nextUrl = getPageURLForType(firstType);
        if (nextUrl) {
          // 关键修复：retry 计数防止无限 forcePageLoad
          // 场景：X 把 /messages 重定向到 Create Passcode / Settings 等页面，
          //       detectPageType 返回 'other'，matchedType 永远是 null，
          //       forcePageLoad 反复触发 → 死循环
          // 解决：retry 超过 3 次主动清 session + 提示用户
          const retryCount = (pending.retryCount || 0) + 1;
          if (retryCount > 3) {
            console.warn('[X-Eraser] Retry limit reached (' + retryCount + '), aborting cleanup. Current page:', pageType);
            await chrome.runtime.sendMessage({ target: 'clearPendingCleanup' });
            // 通知 sidepanel：cleanup 已中止 + 错误原因（chrome.runtime.sendMessage 是广播，sidepanel 直接收到）
            chrome.runtime.sendMessage({
              type: 'cleanupLog',
              data: { message: t('cleanupAbortedPageNotFound'), level: 'error' }
            }).catch(function() {});
            chrome.runtime.sendMessage({
              type: 'cleanupAborted',
              data: { reason: 'page_not_found', retries: retryCount }
            }).catch(function() {});
            return;
          }
          // 更新 retry 计数并跳页
          await chrome.runtime.sendMessage({
            target: 'updatePendingCleanup',
            pending: Object.assign({}, pending, { retryCount: retryCount })
          });
          console.log('[X-Eraser] No matched type on this page, navigating to:', firstType, '(retry ' + retryCount + '/3)');
          forcePageLoad(nextUrl);
        } else {
          // 未知 type，清空 session 避免死循环
          await chrome.runtime.sendMessage({ target: 'clearPendingCleanup' });
        }
        return;
      }

      // 跑 matchedType，remainingTypes 留给下次
      const remainingTypes = types.filter(function(t) { return t !== matchedType; });
      const optionsForCurrent = Object.assign({}, pending, { types: [matchedType] });

      if (injector) {
        const remoteConfig = await getRemoteConfig();
        injector.setConfig(remoteConfig);
        const isLast = remainingTypes.length === 0;
        await runCleanupWithRetry(optionsForCurrent, 2, isLast);

        // 跑完后处理 remainingTypes
        if (remainingTypes.length > 0) {
          // 更新 session，移除已处理的 type
          const newPending = Object.assign({}, pending, { types: remainingTypes });
          await chrome.runtime.sendMessage({ target: 'updatePendingCleanup', pending: newPending });
          // 跳到下一个 type 的页面
          const nextType = remainingTypes[0];
          const nextUrl = getPageURLForType(nextType);
          if (nextUrl) {
            console.log('[X-Eraser] Processed ' + matchedType + ', navigating to:', nextType);
            chrome.runtime.sendMessage({
              type: 'cleanupLog',
              data: { message: t('processedNavigatingTo', {next: t(nextType)}), level: 'info' }
            }).catch(function() {});
            forcePageLoad(nextUrl);
          }
        } else {
          // 全部完成，清空 session
          await chrome.runtime.sendMessage({ target: 'clearPendingCleanup' });
        }
      }
    } catch (error) {
      console.warn('[X-Eraser] Failed to check pending cleanup:', error.message);
    }
  }

  // 根据 type 返回对应页面 URL
  function getPageURLForType(type) {
    if (type === 'likes') return getLikesPageURL();
    if (type === 'bookmarks') return getBookmarksPageURL();
    if (type === 'following') return getFollowingPageURL();
    return null;
  }

  // 包装 injector.onComplete 返回 Promise，用于 await cleanup 完成
  // isLast = false 时不调原始 onComplete（避免中间 type 跑完侧边栏误以为完成）
  function runCleanupOnce(options, attempt, isLast) {
    return new Promise(function(resolve) {
      let resolved = false;
      const origOnComplete = injector.onComplete;
      injector.onComplete = function(result) {
        // 只有最后一个 type 跑完才转发到 sidepanel
        if (isLast && origOnComplete) {
          try {
            origOnComplete(result);
          } catch (e) {
            console.error('[X-Eraser] origOnComplete threw:', e);
          }
        }
        if (!resolved) {
          resolved = true;
          console.log('[X-Eraser] Auto-resume attempt ' + attempt + ': processed=' + result.processed + (isLast ? ' (final)' : ' (continuing)'));
          resolve(result);
        }
      };
      // 关键修复：startCleanup 是 async，内部 await 链任何 throw 都会变成 reject
      // 旧实现不 .catch → runCleanupOnce Promise 永久挂起 → runCleanupWithRetry 卡死 →
      // clearPendingCleanup 永远不被调用 → 下次 page load 又 auto-resume → 死循环
      // 新实现：任何 throw 都 resolve(0)，让上层走完流程并清 session
      injector.startCleanup(options).catch(function(e) {
        if (resolved) return;
        resolved = true;
        console.warn('[X-Eraser] startCleanup threw in attempt ' + attempt + ': ' + e.message);
        resolve({ processed: 0, errors: 0 });
      });
    });
  }

  // 兜底重试：0 命中时等 4 秒再启动一次（给 X 页面进一步渲染时间）
  async function runCleanupWithRetry(options, maxAttempts, isLast) {
    for (let i = 1; i <= maxAttempts; i++) {
      const result = await runCleanupOnce(options, i, isLast);
      if (result.processed > 0) return result;
      if (i < maxAttempts) {
        console.log('[X-Eraser] Auto-resume: 0 items processed, retrying in 4s...');
        chrome.runtime.sendMessage({
          type: 'cleanupLog',
          data: { message: t('retryingIn', {seconds: 4}), level: 'info' }
        }).catch(function() {});
        await new Promise(function(r) { setTimeout(r, 4000); });
      }
    }
    return { processed: 0, errors: 0 };
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
    var reservedPaths = ['home', 'explore', 'notifications', 'bookmarks', 'i', 'search', 'settings', 'compose', 'login'];
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

  function getFollowingPageURL() {
    var username = getCurrentUsername();
    if (username) {
      return 'https://x.com/' + username + '/following';
    }
    console.warn('[X-Eraser] Could not get username, using /i/following fallback');
    return 'https://x.com/i/following';
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

  async function handleStartCleanup(message, sendResponse) {
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
        data: { message: t('likesRequiresNav'), level: 'info' }
      }).catch(function() {});
      // 先 sendResponse（避免跳页后 message channel 关闭），再 forcePageLoad
      sendResponse({ started: true, needsNavigation: true });
      // 延迟 100ms 让 sendResponse 完整投递到 background + sidepanel，
      // 然后再 forcePageLoad 触发 chrome.tabs.update 卸载 content
      setTimeout(function() { forcePageLoad(likesUrl); }, 100);
      return;
    }

    if (types.indexOf('bookmarks') >= 0 && pageType !== 'bookmarks') {
      const bookmarksUrl = getBookmarksPageURL();
      console.log('[X-Eraser] Bookmarks requires /bookmarks page, current:', pageType);
      chrome.runtime.sendMessage({
        type: 'cleanupLog',
        data: { message: t('bookmarksRequiresNav'), level: 'info' }
      }).catch(function() {});
      sendResponse({ started: true, needsNavigation: true });
      setTimeout(function() { forcePageLoad(bookmarksUrl); }, 100);
      return;
    }

    if (types.indexOf('following') >= 0 && pageType !== 'following') {
      const followingUrl = getFollowingPageURL();
      console.log('[X-Eraser] Following requires /following page, current:', pageType);
      chrome.runtime.sendMessage({
        type: 'cleanupLog',
        data: { message: t('followingRequiresNav'), level: 'info' }
      }).catch(function() {});
      sendResponse({ started: true, needsNavigation: true });
      setTimeout(function() { forcePageLoad(followingUrl); }, 100);
      return;
    }

    // 从 storage 读最新配置（不再依赖模块级 remoteConfig）
    const remoteConfig = await getRemoteConfig();
    injector.setConfig(remoteConfig);
    injector.startCleanup(message.options);
    sendResponse({ started: true });
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
        handleStartCleanup(message, sendResponse);
        return true;
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
        }
        // 关键修复：Stop 同时清 pendingCleanup session
        // 否则下次 page load 会从 session 读到 pending → 又 auto-resume → 死循环
        // 用户主动 Stop 应等价于"放弃整个清理任务"
        chrome.runtime.sendMessage({ target: 'clearPendingCleanup' }).catch(function() {});
        sendResponse({ stopped: true });
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
