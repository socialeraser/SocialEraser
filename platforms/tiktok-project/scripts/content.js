// TikTok Eraser Content Script
// 注入到 TikTok 网站，跑在 TikTok 页面 DOM 上下文里
//
// 职责:
//   1. 启动时加载远程配置（从 chrome.storage.local 读，background 已预拉好）
//   2. 初始化 TikTokInjector 实例（核心清理引擎，跑在 tiktok-automation.js）
//   3. 包装 injector 的回调（onLog / onProgress / onComplete）→ 通过 chrome.runtime.sendMessage 发给 sidepanel
//   4. 检测登录状态、页面类型（videos/likes/favorites/following）
//   5. 处理「跨页面清理」的 auto-resume
//   6. 接收 sidepanel 的 startCleanup / pauseCleanup 等命令 → 转发给 injector
//
// 与其他层的关系:
//   - sidepanel（用户控制面板）→ background → content
//   - content（这一层）→ sidepanel（直接 broadcast，不经 background，避免收到 2 次）
//   - background 预拉远程配置 → content 从 chrome.storage.local 读
//
// 注入时机:
//   - manifest content_scripts: 每次 TikTok 页面加载时自动注入
//   - chrome.scripting.executeScript: 已开的 tab 由 background 手动注入
//   防重复注入: 用 window.__TikTokEraserContentInjected flag 守护

// 防止 manifest content_scripts + chrome.scripting.executeScript 重复注入同一个 content.js
(function() {
  'use strict';
  if (window.__TikTokEraserContentInjected) {
    console.log('[TikTok Eraser] Content script already injected, skipping re-init');
    return;
  }
  window.__TikTokEraserContentInjected = true;

  console.log('[TikTok Eraser] Content script loaded on', window.location.href);

  let injector = null;

  // 通用 fallback：data-e2e 等 selector 不在 .js 里硬编码（铁律），
  // 全部从 config.common / config.login 走 window.TikTokEraserConfig getter。
  // 这里只放与 selector 无关的常量（路径白名单等）。

  // 登录态 sticky 缓存：
  // - true = 已确认登录
  // - false = 已确认未登录
  //
  // 设计原则（2026-07-02 与 x-project 对齐）：
  //   1. 首次 hydrate 完成后，正向检测（checkLoginStatus）只跑一次，结果锁死
  //   2. 之后唯一能翻转状态的信号：用户在登录页 / 主动登出（isLoggedOut 严格判断）
  //   3. 不再在每次轮询时跑正向检测 —— DOM 偶发抓空会让状态错误翻转
  let cachedIsLoggedIn = null;

  // 把登录态持久化到 session storage（fire-and-forget）。
  // 只在 sticky 状态真正翻转时调用，避免每 3s 轮询都打 IPC。
  // status: true = logged_in / false = logged_out
  function persistLoginStatus(status) {
    var value = status === true ? 'logged_in' : 'logged_out';
    chrome.runtime.sendMessage({
      target: 'writeLoginStatus',
      status: value
    }).catch(function() { /* background 不可用：忽略 */ });
  }

  // 启动时从 session storage 恢复 sticky 状态（fire-and-forget）。
  // hydrate 完成前 cachedIsLoggedIn 仍是 null，hydrate 后用真值。
  function hydrateLoginStatus() {
    chrome.runtime.sendMessage({ target: 'readLoginStatus' }).then(function(resp) {
      if (!resp || !resp.status) return;
      if (resp.status === 'logged_in' || resp.status === 'logged_out') {
        cachedIsLoggedIn = (resp.status === 'logged_in');
        console.log('[TikTok Eraser] Hydrated login status from session storage:', resp.status);
      }
    }).catch(function() { /* background 不可用时跳过 */ });
  }
  hydrateLoginStatus();

  // 直接从 storage 读远程配置
  async function getRemoteConfig() {
    try {
      const stored = await chrome.storage.local.get('tiktokRemoteConfig');
      if (stored && stored.tiktokRemoteConfig) return stored.tiktokRemoteConfig;
    } catch (e) {
      console.warn('[TikTok Eraser] Failed to read remote config from storage:', e.message);
    }
    return null;
  }

  // 8 语言登录页文字检测（兜底用）—— 从 config 走，不再 .js 里硬编码。
  // config 缺失时 return 空 object（不会 crash，只是检测能力变弱）。

  // 把远程配置封装成 window.TikTokEraserConfig 给 page 上下文用
  function initTikTokEraserConfig(remoteConfig) {
    window.TikTokEraserConfig = {
      getWebsitePatterns() {
        if (remoteConfig && remoteConfig.selectors && remoteConfig.selectors.tiktokWebsite && remoteConfig.selectors.tiktokWebsite.patterns) {
          return remoteConfig.selectors.tiktokWebsite.patterns;
        }
        return ['tiktok.com', 'www.tiktok.com'];
      },
      getLoginConfig() {
        // config 缺失时 return 空 object（铁律：不硬编码 fallback selector）
        if (remoteConfig && remoteConfig.selectors && remoteConfig.selectors.login) {
          return remoteConfig.selectors.login;
        }
        return {};
      },
      getGlobalLoginIndicators() {
        // config 缺失时 return []（铁律：不硬编码 fallback selector）
        if (remoteConfig && remoteConfig.selectors && remoteConfig.selectors.login && remoteConfig.selectors.login.globalIndicators) {
          return remoteConfig.selectors.login.globalIndicators;
        }
        return [];
      },
      getSelectors() {
        return (remoteConfig && remoteConfig.selectors) || {};
      },
      // 通用 selector getter：所有 data-e2e / class* / aria-label 都走这里
      // 铁律：.js 不允许硬编码 selector；config 缺失时 return []
      getCommonSelectors() {
        if (remoteConfig && remoteConfig.selectors && remoteConfig.selectors.common) {
          return remoteConfig.selectors.common;
        }
        return {};
      },
      getNavProfileSelector() {
        const c = (remoteConfig && remoteConfig.selectors && remoteConfig.selectors.common) || {};
        return (Array.isArray(c.navProfile) && c.navProfile[0]) ? c.navProfile[0] : '[data-e2e="nav-profile"]';
      },
      getProfileTabs() {
        const c = (remoteConfig && remoteConfig.selectors && remoteConfig.selectors.common) || {};
        return (c.profileTabs && typeof c.profileTabs === 'object') ? c.profileTabs : {};
      },
      getLoginInputs() {
        const c = (remoteConfig && remoteConfig.selectors && remoteConfig.selectors.common) || {};
        return Array.isArray(c.loginInputs) ? c.loginInputs : [];
      }
    };
  }

  // fire-and-forget helper：发消息给 background（connect 优先，sendMessage 兜底）
  let _bgPort = null;
  let _bgInvalidated = false;  // 2026-06-29：扩展 context invalid 后设 true，后续 sendToBackground 直接 return
  function sendToBackground(data) {
    if (_bgInvalidated) return;  // context 已失效 → 静默忽略，避免 unhandled error
    if (_bgPort) {
      try { _bgPort.postMessage(data); return; } catch (e) { _bgPort = null; }
    }
    try {
      _bgPort = chrome.runtime.connect({ name: 'tiktokeraser-logger' });
      _bgPort.onDisconnect.addListener(function() { _bgPort = null; });
      _bgPort.postMessage(data);
    } catch (e) {
      _bgPort = null;
      try {
        chrome.runtime.sendMessage(data).catch(function() {});
      } catch (e2) {
        // chrome.runtime 同步抛错（context invalidated）→ 标记失效，后续静默
        _bgInvalidated = true;
      }
    }
  }

  // 包装 injector 的回调
  // 2026-07-03 修复 multi-type 卡死 bug：
  //   onComplete 总是同步发 cleanupComplete，sidepanel 用 multi-type counter 守护：
  //   只有当 completedTypesCount === options.types.length 时才走 onCleanupComplete。
  //   旧逻辑：startCleanup/auto-resume 路径手动屏蔽 onComplete（injector.onComplete = function() {}），
  //     但这导致 sidepanel 永远收不到 cleanupComplete，UI 卡在 isRunning=true + progress 0/N。
  //   新逻辑：onComplete 总是触发，单一职责，sidepanel 收到每个 cleanupComplete 后用 counter
  //   决定是否进入"完成"状态。
  function setupInjectorCallbacks(ij) {
    ij.onLog = function(message, level) {
      sendToBackground({ type: 'cleanupLog', message: message, level: level || 'info' });
    };
    ij.onProgress = function(count, message) {
      sendToBackground({ type: 'cleanupProgress', processed: count, message: message });
    };
    ij.onComplete = function(result) {
      // 总是同步发 cleanupComplete：sidepanel 用 multi-type counter 守护是否真完成
      // （单 type: counter 1/1 → onCleanupComplete；多 type: counter 1/3, 2/3, 3/3 → 3/3 才完成）
      // 不读 session async：避免 forcePageLoad 销毁 page 后 cb 跑不完
      sendToBackground({
        type: 'cleanupComplete',
        processed: result.processed,
        errors: result.errors
      });
    };
    ij.onError = function(message) {
      sendToBackground({ type: 'cleanupError', message: message });
    };
    ij.onTypeStart = function(type) {
      sendToBackground({ type: 'cleanupTypeStart', itemType: type });
    };
    ij.onTypeComplete = function(type, processed) {
      sendToBackground({ type: 'cleanupTypeComplete', itemType: type, processed: processed });
    };
  }

  // 严格判断「用户在登录页 / 已登出」
  // 2026-07-02 替换原 checkIsLoginPage()（与 x-project 对齐）：
  //   唯一翻转 true→false 的信号，不跑模糊 innerText 匹配。
  //   只查两类硬信号：
  //     1. URL 路径明确是登录/登出页
  //     2. 登录表单 input 是页面主区域可见元素
  function isLoggedOut() {
    var path = window.location.pathname.toLowerCase();
    // 1. URL 是 TikTok 的登录/登出相关路径
    if (path === '/login'
        || path === '/signup'
        || path === '/passport/web/login'
        || path === '/passport/web/signup') {
      return true;
    }

    // 2. 登录表单 input 是页面主区域可见元素
    // loginInputs 从 config.common.loginInputs 读，不在 .js 里硬编码
    // 防御：config 缺失/为空时不能 querySelectorAll('') → 用 fallback 走原硬编码集合
    var loginInputSelectors = (window.TikTokEraserConfig && window.TikTokEraserConfig.getLoginInputs)
      ? window.TikTokEraserConfig.getLoginInputs() : [];
    if (loginInputSelectors.length === 0) {
      // fallback：8 语言通用 input 集合（这是语义上不可能从 config 抹掉的最小集合，
      // 走这里只在 config 加载失败时）
      loginInputSelectors = [
        'input[autocomplete="username"]',
        'input[name="username"]',
        'input[name="password"]'
      ];
    }
    var loginInputs = document.querySelectorAll(loginInputSelectors.join(','));
    for (var i = 0; i < loginInputs.length; i++) {
      var el = loginInputs[i];
      if (!el.offsetParent) continue;
      if (el.closest('main, [role="main"]')) {
        return true;
      }
    }
    return false;
  }

  // 等待指定元素出现（仿 X 平台的 waitForArticles，使用 MutationObserver + idle count）
  // 设计原则：不靠经验猜等几秒
  //   1. MutationObserver 立即检测元素出现 → resolve
  //   2. 兜底：连续 N 次空 mutation 算"元素不存在"
  //   3. 极端兜底：连续 maxIdleFrames 没任何 mutation 也算超时
  function waitForElement(selector, timeoutMs) {
    var MAX_IDLE_MUTATIONS = 20;
    var startTime = Date.now();
    return new Promise(function(resolve) {
      function startObserving() {
        if (!document.body) {
          if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', startObserving, { once: true });
          } else {
            requestAnimationFrame(startObserving);
          }
          return;
        }

        var initial = document.querySelector(selector);
        if (initial) { resolve(initial); return; }

        var resolved = false;
        var idleCount = 0;
        function done(element) {
          if (resolved) return;
          resolved = true;
          observer.disconnect();
          cancelAnimationFrame(rafId);
          resolve(element);
        }
        var observer = new MutationObserver(function() {
          if (resolved) return;
          if (Date.now() - startTime >= timeoutMs) {
            done(null);
            return;
          }
          var el = document.querySelector(selector);
          if (el) { done(el); return; }
          idleCount++;
          if (idleCount >= MAX_IDLE_MUTATIONS) {
            done(null);
          }
        });
        observer.observe(document.body, { childList: true, subtree: true });

        var rafId = requestAnimationFrame(function watchIdle() {
          if (resolved) return;
          if (Date.now() - startTime >= timeoutMs) {
            done(null);
            return;
          }
          var el = document.querySelector(selector);
          if (el) { done(el); return; }
          rafId = requestAnimationFrame(watchIdle);
        });
      }

      startObserving();
    });
  }

  // 检查登录态：通过 GLOBAL_LOGIN_INDICATORS
  // 路径级短路：/tiktokstudio/* 必须登录才能进，未登录会被 TikTok 重定向到 /login
  // 那些页面没有顶栏 nav-profile/profile-icon 等元素，走通用 indicator 会误判为未登录
  function checkLoginStatus() {
    if (/^\/tiktokstudio\//.test(location.pathname)) return true;

    var indicators = (window.TikTokEraserConfig && window.TikTokEraserConfig.getGlobalLoginIndicators) ?
      window.TikTokEraserConfig.getGlobalLoginIndicators() : [];
    for (var i = 0; i < indicators.length; i++) {
      try {
        if (document.querySelector(indicators[i])) return true;
      } catch (e) {}
    }
    return false;
  }

  // Sticky 状态机（2026-07-02 与 x-project 对齐）：
  //   1. cachedIsLoggedIn === null（首次启动 / hydrate 还没回来）：
  //      跑一次 checkLoginStatus() 正向检测，命中锁 true / persist
  //   2. cachedIsLoggedIn 已有值（true 或 false）：
  //      唯一能翻转的信号是 isLoggedOut() 命中
  //      检测到登出 → flip 到 false / persist
  //   3. 不再每次轮询跑正向检测
  function getEffectiveLoginStatus() {
    if (!isTargetWebsite()) return false;

    // 唯一翻转信号：用户在登录页 / 已登出
    if (isLoggedOut()) {
      if (cachedIsLoggedIn !== false) {
        cachedIsLoggedIn = false;
        persistLoginStatus(false);
        console.log('[TikTok Eraser] Logout detected, flipping to false');
      }
      return false;
    }

    // 已确认过状态：直接返回缓存值（不重检）
    if (cachedIsLoggedIn !== null) {
      return cachedIsLoggedIn;
    }

    // 首次检测：跑一次正向 selector 检测
    if (checkLoginStatus()) {
      cachedIsLoggedIn = true;
      persistLoginStatus(true);
      console.log('[TikTok Eraser] Login confirmed (sticky cached)');
      return true;
    }

    // 还没确认：返回 null 让侧栏显示"检测中"
    return null;
  }

  // 检测当前页面类型（用于自动判断用户在哪个 tab 决定是否需要跳转）
  // TikTok Studio (/tiktokstudio/content) 也算 'videos'，因为 TikTok 只能在 Studio 删除视频
  // /@user + Reposts tab 选中 → 'reposts'（实测 2026-06-29）
  function detectPageType() {
    var pathname = location.pathname || '';
    if (/^\/tiktokstudio\/content/.test(pathname)) return 'videos';
    if (/^\/@[A-Za-z0-9._-]+\/likes$/.test(pathname)) return 'likes';
    if (/^\/@[A-Za-z0-9._-]+\/favorites$/.test(pathname)) return 'favorites';
    if (/^\/following\/?$/.test(pathname)) return 'following';
    if (/^\/@[A-Za-z0-9._-]+$/.test(pathname)) {
      const tabsCfg = (window.TikTokEraserConfig && window.TikTokEraserConfig.getProfileTabs)
        ? window.TikTokEraserConfig.getProfileTabs() : {};
      var repostTab = document.querySelector(tabsCfg.Reposts || '[data-e2e="repost-tab"]');
      if (repostTab && repostTab.getAttribute('aria-selected') === 'true') return 'reposts';
      return 'profile';
    }
    return 'unknown';
  }

  // 获取当前用户名（从 URL 解析）—— 只用于 statusUpdate 广播给 sidepanel 显示，
  // **不再**用于拼跳转 URL（跳 Profile 直接点 nav-profile 元素即可，不需要知道 username）。
  function getCurrentUsername() {
    var pathname = location.pathname || '';
    var m = pathname.match(/^\/@([A-Za-z0-9._-]+)/);
    return m ? m[1] : null;
  }

  // 等待 location.pathname 命中 regex（URL 切换检测）
  // 用于 navigateToProfileViaSidebar click nav-profile 后等 SPA 跳到 /@user
  function waitForURLMatch(regex, timeoutMs) {
    return new Promise(function(resolve) {
      if (regex.test(location.pathname)) { resolve(true); return; }
      var start = Date.now();
      var interval = setInterval(function() {
        if (regex.test(location.pathname)) { clearInterval(interval); resolve(true); return; }
        if (Date.now() - start > timeoutMs) { clearInterval(interval); resolve(false); }
      }, 100);
    });
  }

  // 通过 sidebar 的 nav-profile 元素跳转到 /@user profile 页
  // 逻辑：找 nav-profile → click → 等 URL 变成 /@user
  // 超时机制：10秒等待 → 刷新页面 → 再等10秒 → 失败返回 false
  // 失败后由 caller 决定结束当前 type 或执行下一个 type
  async function navigateToProfileViaSidebar() {
    var navProfileSel = (window.TikTokEraserConfig && window.TikTokEraserConfig.getNavProfileSelector)
      ? window.TikTokEraserConfig.getNavProfileSelector() : '[data-e2e="nav-profile"]';
    var MAX_RETRY_COUNT = 1;
    var WAIT_MS = 10000;

    for (var retry = 0; retry <= MAX_RETRY_COUNT; retry++) {
      var navProfile = await waitForElement(navProfileSel, WAIT_MS);
      if (!navProfile) {
        console.log('[TikTok Eraser] nav-profile not found, jumping to foryou (sidebar guaranteed)');
        window.__TikTokEraserForcePageLoad('https://www.tiktok.com/');
        await new Promise(function(r) { setTimeout(r, 3000); });
        continue;
      }
      try {
        navProfile.click();
      } catch (e) {
        console.warn('[TikTok Eraser] nav-profile.click failed, jumping to foryou:', e);
        window.__TikTokEraserForcePageLoad('https://www.tiktok.com/');
        await new Promise(function(r) { setTimeout(r, 3000); });
        continue;
      }
      var success = await waitForURLMatch(/^\/@[A-Za-z0-9._-]+/, WAIT_MS);
      if (success) {
        return true;
      }
      if (retry < MAX_RETRY_COUNT) {
        console.log('[TikTok Eraser] navigateToProfileViaSidebar: timeout, refreshing page (retry ' + (retry + 1) + '/' + MAX_RETRY_COUNT + ')');
        window.location.reload();
        await new Promise(function(r) { setTimeout(r, 3000); });
      }
    }
    console.log('[TikTok Eraser] navigateToProfileViaSidebar: failed after ' + (MAX_RETRY_COUNT + 1) + ' attempts');
    return false;
  }

  // 在 /@user profile 页上点击指定 type 的 tab
  //   用途：navigateToType 跳到 /@user 之后的 tab 切换
  //   等 tab 渲染最多 20s（SPA race：tab 可能要 1-2s 才出现）
  //   selector 从 window.TikTokEraserConfig.getProfileTabs() 读，不硬编码
  async function clickProfileTab(type) {
    const profileTabs = (window.TikTokEraserConfig && window.TikTokEraserConfig.getProfileTabs)
      ? window.TikTokEraserConfig.getProfileTabs() : {};
    const tabMap = {
      reposts: profileTabs.Reposts,
      likes: profileTabs.Likes,
      favorites: profileTabs.Favorites
    };
    const selector = tabMap[type];
    if (!selector) {
      console.warn('[TikTok Eraser] clickProfileTab: no selector for type=' + type);
      return false;
    }
    const tabEl = await waitForElement(selector, 20000);
    if (!tabEl) {
      console.warn('[TikTok Eraser] clickProfileTab: ' + type + ' tab not found after 20s');
      return false;
    }
    console.log('[TikTok Eraser] Clicking ' + type + ' tab on /@user profile (navigateToType)');
    tabEl.click();
    return true;
  }

  // 跳转到指定 type 的目标页面（统一入口）
  //   videos:        直跳 TikTok Studio（/tiktokstudio/content?status=posted，TikTok Web 只能在 Studio 删视频）
  //   following:     直跳顶层路由 /following（MCP 实证 2026-07-02：/@user/following 路径被 redirect 到 foryou）
  //   reposts/likes/favorites: 跳到 /@user profile 主页 → click 对应 tab（2026-07-04 修复：以前只跳到 profile 不点 tab）
  //   **不读 username**——videos/following 走硬编码 URL，profile 类走 nav-profile.click + clickProfileTab
  async function navigateToType(type) {
    if (type === 'videos') {
      window.__TikTokEraserForcePageLoad('https://www.tiktok.com/tiktokstudio/content?status=posted');
      return true;
    }
    if (type === 'following') {
      window.__TikTokEraserForcePageLoad('https://www.tiktok.com/following');
      return true;
    }
    if (type === 'reposts' || type === 'likes' || type === 'favorites') {
      const profileOk = await navigateToProfileViaSidebar();
      if (!profileOk) {
        console.warn('[TikTok Eraser] navigateToType: navigateToProfileViaSidebar failed for type=' + type);
        return false;
      }
      return await clickProfileTab(type);
    }
    return false;
  }

  // 检测当前是否在 TikTok 站点（域名命中 patterns）
  // 用于 getStatus 返回 isTikTok 字段（sidepanel 据此决定显示登录区还是选区）
  function isTargetWebsite() {
    var patterns = (window.TikTokEraserConfig && window.TikTokEraserConfig.getWebsitePatterns) ?
      window.TikTokEraserConfig.getWebsitePatterns() : ['tiktok.com', 'www.tiktok.com'];
    var host = location.hostname || '';
    return patterns.some(function(p) {
      return host === p || host.endsWith('.' + p);
    });
  }

  // 初始化 injector
  async function initInjector(remoteConfig) {
    initTikTokEraserConfig(remoteConfig);
    if (typeof TikTokInjector === 'undefined') {
      console.warn('[TikTok Eraser] TikTokInjector not loaded');
      return null;
    }
    var ij = new TikTokInjector();
    if (remoteConfig) ij.setConfig(remoteConfig);
    setupInjectorCallbacks(ij);
    return ij;
  }

  // 综合状态查询 —— 一次返回所有 sidepanel 需要的状态
  // 返回: { isTikTok, isLoggedIn, isLoginPage, pageType, url }
  //   sidepanel 启动时 + 轮询都调这个
  //   关键：必须在 handleMessage 里实现，否则 sidepanel 拿到 undefined → checkingLogin 卡死
  //   （修复前 bug：sidepanel.js:474 发送 {type:'getStatus'}，content.js 没有这个 case，
  //    sendResponse 永远不被调用 → 死循环在 "Checking login status..."）
  function checkTikTokStatus() {
    var isT = isTargetWebsite();
    var isLoggedIn = isT ? getEffectiveLoginStatus() : false;
    var isLoginPage = isT ? isLoggedOut() : false;
    var pageType = isT ? detectPageType() : null;

    return {
      isTikTok: isT,
      isLoggedIn: isLoggedIn,
      isLoginPage: isLoginPage,
      pageType: pageType,
      url: window.location.href
    };
  }

  // 处理 sidepanel 发来的命令
  function handleMessage(message, _sender, sendResponse) {
    // 过滤：只处理 target=content 的消息（与 x-project 一致，避免误处理 background 自己的消息）
    if (message.target && message.target !== 'content') return false;

    if (message.type === 'getStatus') {
      // 综合状态查询（sidepanel 启动时 + 轮询用）
      sendResponse(checkTikTokStatus());
      return false;
    }
    if (message.type === 'ping') {
      sendResponse({ pong: true });
      return false;
    }
    if (message.type === 'startCleanup') {
      (async function() {
        if (!injector) {
          sendResponse({ error: 'Injector not ready' });
          return;
        }
        var options = message.options || {};
        var types = options.types || [];

        var pageType = detectPageType();
        var matchedType = null;
        for (var i = 0; i < types.length; i++) {
          var t = types[i];
          if (t === 'videos' && pageType === 'videos') { matchedType = t; break; }
          if (t === 'reposts' && pageType === 'reposts') { matchedType = t; break; }
          if (t === 'likes' && pageType === 'likes') { matchedType = t; break; }
          if (t === 'favorites' && pageType === 'favorites') { matchedType = t; break; }
          if (t === 'following' && pageType === 'following') { matchedType = t; break; }
        }

        // 当前页面不匹配任何 type → 调 navigateToType 跳到第一个 type 的目标页
        // 2026-07-04 修复：从 / 主页入口时，navigateToType 内部会点 nav-profile + 等 20s + click 目标 tab。
        //   navigateToType 返回 true 时，若 firstType 是 profile 类（reposts/likes/favorites），tab 已被点过，
        //   可以直接当 matchedType 用 → 走下方 if (matchedType) 分支 run cleanup（统一入口，避免 / 与 /@user 行为不一致）
        //   若 firstType 是 videos/following，走 force page load，新 content script 由 checkAndResumePendingCleanup 接管
        if (!matchedType && types.length > 0) {
          var firstType = types[0];
          var navOk = await navigateToType(firstType);
          if (!navOk) {
            sendResponse({ error: 'navigateToType failed for type=' + firstType });
            return;
          }
          if (firstType === 'reposts' || firstType === 'likes' || firstType === 'favorites') {
            // tab 已被 navigateToType 点过，直接当 matchedType 用
            matchedType = firstType;
          } else {
            // videos/following 走 force page load，新 content script 接管
            sendResponse({ success: true, navigated: true });
            return;
          }
        }
        
        if (matchedType) {
          // 跑完当前 type 后还有 remaining types → 写 pending(remainingTypes) →
          //   force page load 到 tiktok.com 首页 → 新 content script 启动后由
          //   checkAndResumePendingCleanup 接管，跳到下个 type 的目标页。
          // 2026-07-04 修复：旧逻辑调 navigateToType(remainingTypes[0])，对 profile 类只是 SPA nav，
          //   不销毁 page → 新 content script 不会启动 → 下个 type 永远不跑。
          //   用户 spec："处理完这个Type后，如果还有Type没处理，则跳转到tiktok.com首页，继续下一轮这个操作"
          if (types.length > 1) {
            var remainingTypes = types.filter(function(t) { return t !== matchedType; });
            try {
              await chrome.runtime.sendMessage({
                target: 'updatePendingCleanup',
                pending: { types: remainingTypes, maxPerType: options.maxPerType, filters: options.filters }
              });
            } catch (e) {}
          }
          if (document.readyState === 'complete') {
            try {
              await injector.startCleanup({ types: [matchedType], maxPerType: options.maxPerType, filters: options.filters, isAutoResume: false });
              // 跑完后还有 remaining types → force page load 到 tiktok.com 首页
              //   旧：await navigateToType(remainingTypes[0]) → profile 类 SPA nav 卡住
              //   新：force page load → 新 content script 在首页启动 → checkAndResumePendingCleanup 接管
              if (types.length > 1) {
                window.__TikTokEraserForcePageLoad('https://www.tiktok.com/');
              }
              sendResponse({ success: true });
            } catch (e) {
              await chrome.runtime.sendMessage({ target: 'clearPendingCleanup' }).catch(function() {});
              sendResponse({ error: e.message });
            }
          } else {
            window.addEventListener('load', async function() {
              try {
                await injector.startCleanup({ types: [matchedType], maxPerType: options.maxPerType, filters: options.filters, isAutoResume: false });
                // 镜像 line 同步逻辑
                if (types.length > 1) {
                  window.__TikTokEraserForcePageLoad('https://www.tiktok.com/');
                }
                sendResponse({ success: true });
              } catch (e) {
                await chrome.runtime.sendMessage({ target: 'clearPendingCleanup' }).catch(function() {});
                sendResponse({ error: e.message });
              }
            }, { once: true });
          }
          return;
        }
      })();
      return true;
    }
    if (message.type === 'pauseCleanup') {
      if (injector) injector.pause();
      sendResponse({ success: true });
      return false;
    }
    if (message.type === 'resumeCleanup') {
      if (injector) injector.resume();
      sendResponse({ success: true });
      return false;
    }
    if (message.type === 'stopCleanup') {
      if (injector) injector.stop();
      sendResponse({ success: true });
      return false;
    }
    if (message.type === 'getCleanupStatus') {
      sendResponse({ status: injector ? injector.getStatus() : { isRunning: false } });
      return false;
    }
    if (message.type === 'getPageInfo') {
      sendResponse({
        pageType: detectPageType(),
        username: getCurrentUsername(),
        isLoggedIn: getEffectiveLoginStatus()
      });
      return false;
    }
    return false;
  }

  // 启动
  (async function start() {
    var remoteConfig = await getRemoteConfig();
    injector = await initInjector(remoteConfig);

    // 启动 resume 检查（必须在 injector 初始化之后立即触发，
    // 避免被后续 setInterval/sendToBackground 等 setup 步骤延后）
    // startResumeCheck 内部会等 document.readyState === 'complete'
    startResumeCheck();

    // 监听 background 转发的消息
    chrome.runtime.onMessage.addListener(handleMessage);

    // 定期广播页面状态（X-project 模式：仅在变化时广播）
    var lastPageType = null;
    var lastLoginStatus = null;
    setInterval(function() {
      var currentPageType = detectPageType();
      var currentLoginStatus = getEffectiveLoginStatus();
      if (currentPageType !== lastPageType || currentLoginStatus !== lastLoginStatus) {
        lastPageType = currentPageType;
        lastLoginStatus = currentLoginStatus;
        sendToBackground({
          type: 'statusUpdate',
          pageType: currentPageType,
          username: getCurrentUsername(),
          isLoggedIn: currentLoginStatus
        });
      }
    }, 1000);

    // 初始广播
    sendToBackground({
      type: 'statusUpdate',
      pageType: detectPageType(),
      username: getCurrentUsername(),
      isLoggedIn: getEffectiveLoginStatus()
    });

    // 强制跳页：content script 上下文里最可靠的方式是 window.location.href = url
  // 2026-07-04 修复 multi-type 流程卡死 bug：
  //   旧实现用 chrome.runtime.sendMessage({target:'forceNavigation'}) 让 background
  //   调 chrome.tabs.update 改 tab URL，**fire-and-forget 不等 ack**。
  //   问题：MV3 service worker 必须被事件唤醒才能处理消息，IPC + 唤醒延迟几秒；
  //   在此期间 content script 继续跑，sidepanel 已经 addLog "Type 1 of 3 done"，
  //   但 tab 实际上没跳走 → 用户看到"停在了最后一个视频播放那"。
  //   改：优先 window.location.href = url（同步、可靠、不依赖 IPC、不依赖 service worker
  //   是否在线）。TikTok SPA 路由只拦截 pushState/replaceState，不拦截
  //   window.location.href = 触发的整页加载（MCP 实证 2026-07-04：tiktok.com
  //   主页设 window.location.href = 'https://www.tiktok.com/' 后 page 真的销毁，
  //   location.pathname 真的变成 /）。
  //   chrome.tabs.update 路径保留为兜底（如果 window.location.href 抛错，e.g. 权限异常）。
  //
  // 2026-06-29 历史：去掉 _=... cache-busting 注入。原因：TikTok 看到带 query 的
  //   URL 不识别（不 redirect 到 /@user），导致 fallback 失败。window.location.href
  //   本身就是新页面加载，不需要 cache-busting。
  window.__TikTokEraserForcePageLoad = function(url) {
    try {
      window.location.href = url;
    } catch (e) {
      console.warn('[TikTok Eraser] window.location.href failed, fallback to background chrome.tabs.update:', e);
      try {
        chrome.runtime.sendMessage({ target: 'forceNavigation', url: url });
      } catch (e2) {
        console.error('[TikTok Eraser] forcePageLoad failed completely:', e, e2);
      }
    }
  };

  // 跨页面 cleanup auto-resume
  // 流程（仿 X-project）：
  //   1. 读 chrome.storage.session.pendingCleanup
  //   2. 没 pending → 静默 return（不影响正常浏览）
  //   3. 当前 pageType 匹配某个 pending type → 跑该 type
  //   4. 不匹配 → forcePageLoad 跳到第一个 type 的 URL（避开 SPA 拦截）
  //   5. 跑完后还有 remaining types → 顺序处理（递归）
  //
  // 2026-06-29 修复（用户反馈"Stop 不生效"）:
  //   跨页跳转时（window.location.href → 新 content script 启动），如果用户在上一站
  //   按了 Stop，stopCleanup 消息可能没传到这个新 content script（页面在 navigate）。
  //   background.js 收到 stopCleanup 时除了清 pendingCleanup 还会写 userStoppedAt=now。
  //   新 content script 启动时如果看到 userStoppedAt，就放弃 resume（即使 pending 还有残留）。
  //   这条防线是"非阻塞"清理的兜底：startCleanup 启动新一轮时也会清掉 userStoppedAt。
  async function checkAndResumePendingCleanup() {
    try {
      // 等待 injector 就绪（页面刷新后新 content script 启动时，injector
      // 初始化是 async 的，startResumeCheck 可能比 injector 先触发 resume 循环）
      // 最多等 5 秒（50 × 100ms）
      for (var _i = 0; _i < 50 && !injector; _i++) {
        await new Promise(function(r) { setTimeout(r, 100); });
      }
      if (!injector) {
        console.warn('[TikTok Eraser] injector not ready after 5s, abandoning resume');
        return;
      }

      // 先查 userStoppedAt：用户点过 Stop 就别 resume
      var stopResp = await chrome.runtime.sendMessage({ target: 'readUserStopped' });
      if (stopResp && stopResp.userStoppedAt) {
        console.log('[TikTok Eraser] userStoppedAt=' + stopResp.userStoppedAt + ' set, aborting auto-resume');
        // 顺手清掉残留的 pending（避免下次还触发）
        await chrome.runtime.sendMessage({ target: 'clearPendingCleanup' });
        return;
      }

      var readResp = await chrome.runtime.sendMessage({ target: 'readPendingCleanup' });
      if (!readResp || !readResp.pending) return;

      var pending = readResp.pending;
      var types = pending.types || [];
      var pageType = detectPageType();
      console.log('[TikTok Eraser] Resuming pending cleanup - types:', types, 'pageType:', pageType);

      // 找匹配的 type
      // - videos: TikTok Studio 页面
      // - reposts/likes/favorites/following: 对应 /@user tab 或子路径
      // 2026-07-04 修复：tabMap 块已删除，移到 clickProfileTab 统一处理
      //   旧逻辑：document.querySelector 同步查 tab，SPA race 会漏点
      //   新逻辑：未匹配时统一走 navigateToType → 内部 clickProfileTab 用 waitForElement 异步等
      var matchedType = null;
      for (var i = 0; i < types.length; i++) {
        var t = types[i];
        if (t === 'videos' && pageType === 'videos') { matchedType = t; break; }
        if (t === 'reposts' && pageType === 'reposts') { matchedType = t; break; }
        if (t === 'likes' && pageType === 'likes') { matchedType = t; break; }
        if (t === 'favorites' && pageType === 'favorites') { matchedType = t; break; }
        if (t === 'following' && pageType === 'following') { matchedType = t; break; }
      }

      if (!matchedType) {
        // 当前页面不匹配 → 走 navigateToType 跳到目标页（不读 username）：
        //   - profile 类 type：navigateToProfileViaSidebar 找 nav-profile.click → 等 URL 变 /@user → clickProfileTab 点对应 tab
        //   - 找不到 sidebar：自动跳首页（foryou）→ 重试
        //   - videos/following：直跳硬编码 URL（force page load，新 content script 接管）
        // 2026-07-04 修复：profile 类 navigateToType 内部已点 tab → matchedType=types[0] 落下来跑 cleanup；
        //   旧逻辑只跳不点 tab → SPA 跳完后没代码继续，永远卡住
        console.log('[TikTok Eraser] Resume: navigating to ' + types[0] + ' via navigateToType');
        var success = await navigateToType(types[0]);
        if (!success && types.length > 1) {
          // 导航失败，跳过当前 type，尝试下一个
          console.log('[TikTok Eraser] Resume: navigation failed for ' + types[0] + ', trying next type');
          var remainingTypes = types.slice(1);
          await chrome.runtime.sendMessage({ target: 'updatePendingCleanup', pending: { types: remainingTypes, maxPerType: pending.maxPerType, filters: pending.filters } });
          // 尝试导航到下一个 type
          var nextSuccess = await navigateToType(remainingTypes[0]);
          if (nextSuccess && (remainingTypes[0] === 'reposts' || remainingTypes[0] === 'likes' || remainingTypes[0] === 'favorites')) {
            matchedType = remainingTypes[0];
          } else {
            return;
          }
        } else if (!success) {
          return;
        } else if (types[0] === 'reposts' || types[0] === 'likes' || types[0] === 'favorites') {
          // navigateToType 已点 tab → 落下来跑 cleanup
          matchedType = types[0];
        } else {
          // videos/following 走 force page load，新 content script 接管
          return;
        }
      }

      // 跑 matchedType
      var remainingTypes = types.filter(function(t) { return t !== matchedType; });
      var optionsForCurrent = Object.assign({}, pending, { types: [matchedType], isAutoResume: true });

      if (injector) {
        console.log('[TikTok Eraser] Running cleanup for:', matchedType);

        // 2026-07-03 修复：先更新 pendingCleanup 去掉 matchedType，确保 onComplete 触发时
        //   session 里只剩 remainingTypes，setupInjectorCallbacks 的 onComplete 能正确判断
        //   "是否还有 remaining types" 来决定发 cleanupProgress 还是 cleanupComplete。
        //   旧逻辑：在 await startCleanup 之后才 updatePendingCleanup → onComplete 触发时
        //   session 仍包含 matchedType，导致 onComplete 误判"还有 remaining"，不触发 cleanupComplete，
        //   最后一个 type 跑完后 sidepanel 收不到完成消息，UI 卡在 isRunning=true。
        if (remainingTypes.length > 0) {
          var newPending = Object.assign({}, pending, { types: remainingTypes });
          await chrome.runtime.sendMessage({ target: 'updatePendingCleanup', pending: newPending });
        } else {
          // 最后一个 type: 先清 pendingCleanup → onComplete 检查时 pending 为空 → 触发 cleanupComplete
          await chrome.runtime.sendMessage({ target: 'clearPendingCleanup' });
        }

        // 2026-07-03 修复：不再手动屏蔽 onComplete（injector.onComplete = function() {}）。
        //   setupInjectorCallbacks 的 onComplete 已改造为检查 session pendingCleanup 决定
        //   发 cleanupProgress 还是 cleanupComplete。

        await injector.startCleanup(optionsForCurrent);

        // 跑完后还有剩余 types → force page load 到 tiktok.com 首页，让新 content script 接管
        // 2026-07-04 修复：旧逻辑 navigateToType(remainingTypes[0]) 对 profile 类只是 SPA nav，
        //   不销毁 page → 新 content script 不会启动 → 下个 type 永远不跑。
        //   用户 spec："处理完这个Type后，如果还有Type没处理，则跳转到tiktok.com首页，继续下一轮这个操作"
        if (remainingTypes.length > 0) {
          console.log('[TikTok Eraser] Done with ' + matchedType + ', force page load to tiktok.com home for next types:', remainingTypes);
          window.__TikTokEraserForcePageLoad('https://www.tiktok.com/');
        }
        // 最后一个 type 的情况：pendingCleanup 已 clear，onComplete 触发时 onComplete 内部
        // 检查 session 为空 → 真正发 cleanupComplete，sidepanel 走 onCleanupComplete 流程。
      }
    } catch (e) {
      console.error('[TikTok Eraser] checkAndResumePendingCleanup error:', e);
    }
  }

  // Content script 启动后检查 pending cleanup
  // 必须等 document.readyState === 'complete'（TikTok SPA hydration 在 load 后才开始）
  function startResumeCheck() {
    if (document.readyState === 'complete') {
      checkAndResumePendingCleanup();
    } else {
      window.addEventListener('load', checkAndResumePendingCleanup, { once: true });
    }
  }

  console.log('[TikTok Eraser] Content script initialized, pageType=' + detectPageType() + ', loggedIn=' + getEffectiveLoginStatus());
  })();
})();
