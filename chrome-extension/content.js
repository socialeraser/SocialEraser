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

  // 登录态正向 indicator：X 各页面侧栏的稳定元素 + 通用 fallback
  // 顺序：最稳定的 sidebar 锚点（任何登录页都有）→ 通用元素
  // - a[href="/compose/post"] / [data-testid^="AppTabBar_"]：侧栏常驻元素，不依赖具体 testid
  // - 其余：之前用过的 testid，作为兜底
  // 不再用 [data-testid='tweetTextarea_0']（仅 /home 存在）和 [data-testid='AppBody-Assistor']（X 已移除）
  const GLOBAL_LOGIN_INDICATORS = [
    "a[href='/compose/post']",
    "a[href='/i/bookmarks']",
    "[data-testid^='AppTabBar_']",
    "a[href^='/messages']",
    "a[href^='/notifications']",
    "[data-testid='SideNav_AccountSwitcher']",
    "[data-testid='UserAvatar']",
    "[aria-label*='Account menu']",
  ];

  // X 的保留路径（导航/系统页），不能被当成 user profile/tweets 源
  // 用于 detectPageType 排除 + getCurrentUsername 兜底判定
  const RESERVED_PATHS = ['home', 'explore', 'notifications', 'bookmarks', 'i', 'search', 'settings', 'compose', 'login', 'messages'];

  // 登录态 sticky 缓存：
  // - null = 尚未检测（初始 / 跨页面 reload）
  // - true = 已确认登录（一旦置 true，只在用户登出时才会翻转为 false）
  // - false = 已确认未登录
  // 设计动机：X 改版 + SPA 跳转 / 侧栏 lazy load 都会让 querySelector 偶发抓空，
  //   之前每 3s 重检一次导致侧栏在 /home→/likes 闪一下 "Not logged in"。
  // 现在只做一次正向检测，缓存结果，唯一翻转信号 = checkIsLoginPage()（URL 进登录页）。
  let cachedIsLoggedIn = null;

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
            { type: 'selector', value: "a[href='/compose/post']" },
            { type: 'selector', value: "a[href='/i/bookmarks']" },
            { type: 'selector', value: "[data-testid^='AppTabBar_']" },
            { type: 'selector', value: "a[href^='/messages']" },
            { type: 'selector', value: "a[href^='/notifications']" },
            { type: 'selector', value: "[data-testid='SideNav_AccountSwitcher']" },
            { type: 'selector', value: "[data-testid='UserAvatar']" },
            { type: 'selector', value: "[aria-label*='Account menu']" }
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
        const nextUrl = getPageURLForType(firstType, pending && pending.tweetOptions);
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
        // 旧实现：runCleanupWithRetry 调用 maxAttempts=2 会在 0 命中时无条件重试一次。
        // 这与前面 waitForArticles(3000) 的职责重复，导致每页跑 2 次（4s 浪费 + 用户困惑）。
        // waitForArticles 已经用 MutationObserver 等 article 出现，最长 3s 兜底，
        // 真正的"页面没加载"场景由它 cover，cleanup 本体只跑 1 次。
        await runCleanupOnce(optionsForCurrent, 1, isLast);

        // 跑完后处理 remainingTypes
        if (remainingTypes.length > 0) {
          // 更新 session，移除已处理的 type
          const newPending = Object.assign({}, pending, { types: remainingTypes });
          await chrome.runtime.sendMessage({ target: 'updatePendingCleanup', pending: newPending });
          // 跳到下一个 type 的页面
          const nextType = remainingTypes[0];
          const nextUrl = getPageURLForType(nextType, pending && pending.tweetOptions);
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
  // tweetOptions 仅 tweets 类型使用：{ includeReplies: bool, includeRetweets: bool }
  function getPageURLForType(type, tweetOptions) {
    if (type === 'likes') return getLikesPageURL();
    if (type === 'bookmarks') return getBookmarksPageURL();
    if (type === 'following') return getFollowingPageURL();
    if (type === 'tweets') return getTweetsPageURL(tweetOptions);
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
      // 旧实现不 .catch → runCleanupOnce Promise 永久挂起 → clearPendingCleanup 永远不被调用
      // → 下次 page load 又 auto-resume → 死循环
      // 新实现：任何 throw 都 resolve(0)，让上层走完流程并清 session
      injector.startCleanup(options).catch(function(e) {
        if (resolved) return;
        resolved = true;
        console.warn('[X-Eraser] startCleanup threw in attempt ' + attempt + ': ' + e.message);
        resolve({ processed: 0, errors: 0 });
      });
    });
  }

  // 已删除：runCleanupWithRetry 旧函数（2024 重构）
  // 原职责："0 命中时等 4 秒再启动一次给 X 渲染时间"——与 waitForArticles(3000) 职责重复，
  //       导致每页 cleanup 跑 2 次（4s 浪费 + 用户困惑）。
  // waitForArticles 已用 MutationObserver + 3s 兜底 cover "页面没加载" 场景。
  // cleanup 本体只跑 1 次，符合 KISS。

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
    const path = window.location.pathname;

    if (url.includes('/likes')) return 'likes';
    if (url.includes('/bookmarks')) return 'bookmarks';
    if (url.includes('/following') && !url.match(/\/following\//)) return 'following';

    // Tweets timeline: /{username} 或 /{username}/with_replies
    // 显式不匹配 /{username}/status/{id}（单条推文详情页，不是列表）
    // 显式不匹配保留路径（home/explore/...）
    var tweetsMatch = path.match(/^\/([^\/?#]+)(?:\/(with_replies))?\/?$/);
    if (tweetsMatch && RESERVED_PATHS.indexOf(tweetsMatch[1].toLowerCase()) === -1) {
      return 'tweets';
    }

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
    for (var i = 0; i < avatarLinks.length; i++) {
      var href = avatarLinks[i].getAttribute('href');
      var m = href && href.match(/^\/([^\/\?]+)$/);
      if (m && m[1] && RESERVED_PATHS.indexOf(m[1]) === -1) {
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
    if (urlMatch && urlMatch[1] && RESERVED_PATHS.indexOf(urlMatch[1]) === -1) {
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

  // Tweets 页面 URL：/{username}/with_replies（含回复+retweet）或 /{username}（仅原创）
  // opts.includeReplies 默认 true；opts.includeRetweets 默认 true
  // 关键修复：只要 retweets 或 replies 任何一个要处理，都走 /with_replies
  //   原因：默认 profile /{username} 不显示 retweets 也不显示 replies
  //   即使 includeReplies=false，只要 includeRetweets=true 也要走 /with_replies（retweet 不在默认 profile 显示）
  //   现象：用户实测反馈"还没开始就结束了" —— 导航到默认 profile，0 文章可见
  function getTweetsPageURL(opts) {
    opts = opts || {};
    var includeReplies = opts.includeReplies !== false;
    var includeRetweets = opts.includeRetweets !== false;  // 关键新增
    var username = getCurrentUsername();
    if (username) {
      // 关键：retweet 或 reply 任一要处理 → 必须 /with_replies（默认 profile 不显示它们）
      var needsFullTimeline = includeReplies || includeRetweets;
      return 'https://x.com/' + username + (needsFullTimeline ? '/with_replies' : '');
    }
    // 无 username 时退回 /home（兜底，至少能进入 X 域；retry 机制会处理）
    console.warn('[X-Eraser] Could not get username for tweets, using /home fallback');
    return 'https://x.com/home';
  }

  // sticky 状态机：
  // - cachedIsLoggedIn === true 时：只 checkIsLoginPage() 能翻转为 false
  // - cachedIsLoggedIn === null/false 时：正向检测一次，命中就锁 true
  // - 返回值可能是 null（仍在检测），让侧栏显示 "checking" 而非误报 "not logged in"
  function getEffectiveLoginStatus() {
    if (!isTargetWebsite()) return false;

    // 唯一能翻转 true → false 的信号：用户进了登录页
    if (cachedIsLoggedIn === true) {
      if (checkIsLoginPage()) {
        cachedIsLoggedIn = false;
        console.log('[X-Eraser] Login page detected, flipping cached state to false');
        return false;
      }
      return true;
    }

    // 检测到登录页：直接 false
    if (checkIsLoginPage()) {
      if (cachedIsLoggedIn !== false) {
        cachedIsLoggedIn = false;
      }
      return false;
    }

    // 首次 / 重置后：跑一次正向 selector 检测
    if (checkLoginStatus()) {
      cachedIsLoggedIn = true;
      console.log('[X-Eraser] Login confirmed (sticky cached)');
      return true;
    }

    // 还没确认：返回 null 让侧栏显示"检测中"，而非误报"未登录"
    return null;
  }

  function checkXStatus() {
    const isX = isTargetWebsite();
    const isLoggedIn = isX ? getEffectiveLoginStatus() : false;
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

    if (types.indexOf('tweets') >= 0 && pageType !== 'tweets') {
      const tweetsUrl = getTweetsPageURL(message.options.tweetOptions);
      console.log('[X-Eraser] Tweets requires profile page, current:', pageType);
      chrome.runtime.sendMessage({
        type: 'cleanupLog',
        data: { message: t('tweetsRequiresNav'), level: 'info' }
      }).catch(function() {});
      sendResponse({ started: true, needsNavigation: true });
      setTimeout(function() { forcePageLoad(tweetsUrl); }, 100);
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
    // 只在登录状态变化时广播，避免无意义消息
    // （每次 getStatus sidepanel 都查得对，但状态没变就广播会触发不必要的 updateUI）
    if (lastBroadcastStatus
        && lastBroadcastStatus.isLoggedIn === status.isLoggedIn
        && lastBroadcastStatus.isX === status.isX) {
      return;
    }
    lastBroadcastStatus = {
      isLoggedIn: status.isLoggedIn,
      isX: status.isX
    };
    chrome.runtime.sendMessage({
      type: 'statusUpdate',
      data: status
    }).catch(function() {});
  }

  // 修复 bug：从未登录 → 登录后 sidepanel 一直显示 Not logged in
  // 原因：之前只在 page load 时 notifyStatus 一次，X 是 SPA 登录后 URL 变
  //       但不触发 load，content 永远不主动通知 sidepanel。
  // 修复：每 3 秒轮询一次，状态变化时发 statusUpdate 给 sidepanel。
  // 选 3s 是因为登录/登出场景对实时性要求低，3s 是合理平衡
  // （再短 CPU 持续高，再长 user-perceived delay 明显）。
  var LOGIN_STATUS_POLL_INTERVAL_MS = 3000;
  var lastBroadcastStatus = null;
  setInterval(notifyStatus, LOGIN_STATUS_POLL_INTERVAL_MS);

  if (document.readyState === 'complete') {
    setTimeout(notifyStatus, 1000);
  } else {
    window.addEventListener('load', function() { setTimeout(notifyStatus, 1000); });
  }
})();
