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

  // TikTok 登录态正向 indicator（待实测抓取；MVP 先放语义锚点）
  // 顺序：稳定 sidebar 锚点 → 通用元素
  // 候选：
  //   - 顶栏 Upload 链接：任何登录用户都有
  //   - 顶栏 Inbox/Notifications 链接
  //   - 用户头像按钮（顶栏右侧）
  //   - 侧栏 Home / Following / Friends 链接（移动端可能折叠）
  // 这些 selector 都需要实测后调整；MVP 阶段先用语义锚点
  const GLOBAL_LOGIN_INDICATORS = [
    "a[href='/upload']",                   // 上传链接（任何登录用户都有）
    "a[href^='/messages']",                // 私信链接
    "a[href^='/notifications']",           // 通知链接
    "[data-e2e='profile-icon']",           // 用户头像按钮
    "[data-e2e='nav-profile']",            // 导航栏 profile
  ];

  // TikTok 保留路径（导航/系统页）
  const RESERVED_PATHS = ['upload', 'messages', 'notifications', 'discover', 'live', 'search', 'settings', 'login', 'signup', 'explore', 'following', 'foryou'];

  // 登录态 sticky 缓存：
  //   null = 尚未检测
  //   true = 已确认登录
  //   false = 已确认未登录
  let cachedIsLoggedIn = null;

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

  // 8 语言登录页文字检测（兜底用）—— TikTok 登录页文字 8 语言
  const DEFAULT_CHECK_ELEMENTS_8LANG = {
    'zh-CN': [
      { type: 'text', value: '登录' },
      { type: 'text', value: '使用手机' },
      { type: 'text', value: '使用邮箱' },
      { type: 'selector', value: "[data-e2e='login-button']" }
    ],
    'pt': [
      { type: 'text', value: 'Entrar' },
      { type: 'text', value: 'Continuar' },
      { type: 'text', value: 'Telemóvel' },
      { type: 'selector', value: "[data-e2e='login-button']" }
    ],
    'en': [
      { type: 'text', value: 'Log in' },
      { type: 'text', value: 'Sign in' },
      { type: 'text', value: 'Continue with phone' },
      { type: 'selector', value: "[data-e2e='login-button']" }
    ],
    'ja': [
      { type: 'text', value: 'ログイン' },
      { type: 'text', value: '電話番号で続ける' },
      { type: 'text', value: 'メールアドレス' },
      { type: 'selector', value: "[data-e2e='login-button']" }
    ],
    'ko': [
      { type: 'text', value: '로그인' },
      { type: 'text', value: '전화번호로 계속하기' },
      { type: 'text', value: '이메일' },
      { type: 'selector', value: "[data-e2e='login-button']" }
    ],
    'es': [
      { type: 'text', value: 'Iniciar sesión' },
      { type: 'text', value: 'Continuar' },
      { type: 'text', value: 'Teléfono' },
      { type: 'selector', value: "[data-e2e='login-button']" }
    ],
    'de': [
      { type: 'text', value: 'Anmelden' },
      { type: 'text', value: 'Weiter' },
      { type: 'text', value: 'Telefon' },
      { type: 'selector', value: "[data-e2e='login-button']" }
    ],
    'fr': [
      { type: 'text', value: 'Se connecter' },
      { type: 'text', value: 'Continuer' },
      { type: 'text', value: 'Téléphone' },
      { type: 'selector', value: "[data-e2e='login-button']" }
    ]
  };

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
        if (remoteConfig && remoteConfig.selectors && remoteConfig.selectors.login) {
          return remoteConfig.selectors.login;
        }
        return {
          checkElements: DEFAULT_CHECK_ELEMENTS_8LANG,
          loggedInElements: [
            { type: 'selector', value: "a[href='/upload']" },
            { type: 'selector', value: "a[href^='/messages']" },
            { type: 'selector', value: "a[href^='/notifications']" },
            { type: 'selector', value: "[data-e2e='profile-icon']" },
            { type: 'selector', value: "[data-e2e='nav-profile']" }
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
  function setupInjectorCallbacks(ij) {
    ij.onLog = function(message, level) {
      sendToBackground({ type: 'cleanupLog', message: message, level: level || 'info' });
    };
    ij.onProgress = function(count, message) {
      sendToBackground({ type: 'cleanupProgress', processed: count, message: message });
    };
    ij.onComplete = function(result) {
      sendToBackground({ type: 'cleanupComplete', processed: result.processed, errors: result.errors });
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

  // 检测登录页：URL 进入 /login 路径
  function checkIsLoginPage() {
    var pathname = location.pathname || '';
    return pathname.indexOf('/login') >= 0 || pathname.indexOf('/signup') >= 0;
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
      window.TikTokEraserConfig.getGlobalLoginIndicators() : GLOBAL_LOGIN_INDICATORS;
    for (var i = 0; i < indicators.length; i++) {
      try {
        if (document.querySelector(indicators[i])) return true;
      } catch (e) {}
    }
    return false;
  }

  // Sticky 登录态获取
  function getEffectiveLoginStatus() {
    if (cachedIsLoggedIn === true) {
      if (checkIsLoginPage()) { cachedIsLoggedIn = false; return false; }
      return true;
    }
    if (checkIsLoginPage()) { cachedIsLoggedIn = false; return false; }
    if (checkLoginStatus()) { cachedIsLoggedIn = true; return true; }
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
    if (/^\/@[A-Za-z0-9._-]+\/following$/.test(pathname)) return 'following';
    if (/^\/@[A-Za-z0-9._-]+$/.test(pathname)) {
      // profile 页：检查 Reposts tab 是否选中
      var repostTab = document.querySelector('[data-e2e="repost-tab"]');
      if (repostTab && repostTab.getAttribute('aria-selected') === 'true') return 'reposts';
      return 'profile';
    }
    return 'unknown';
  }

  // 获取当前用户名（从 URL 解析）
  function getCurrentUsername() {
    var pathname = location.pathname || '';
    var m = pathname.match(/^\/@([A-Za-z0-9._-]+)/);
    return m ? m[1] : null;
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
    var username = getCurrentUsername();
    if (username) ij.setCurrentUsername ? ij.setCurrentUsername(username) : null;
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
    var isLoginPage = isT ? checkIsLoginPage() : false;
    var pageType = isT ? detectPageType() : null;

    return {
      isTikTok: isT,
      isLoggedIn: isLoggedIn,
      isLoginPage: isLoginPage,
      pageType: pageType,
      url: window.location.href
    };
  }

  // 获取 type 对应的目标 URL
  // 跟 Reposts 流程一致：所有 type 都先读 repostsTargetUrl（持久化的 username URL），
  // 不需要每次实时提取 u —— 仿 Reposts 模式（见 startCleanup handler）。
  // likes/favorites 直接跳 Profile 主页（/{user}），由 processLikes/processFavorites
  // 内部用 _activateProfileTab 切到 Liked/Favorites tab。
  async function getPageURLForType(type) {
    if (type === 'videos') return 'https://www.tiktok.com/tiktokstudio/content?status=posted';
    // 优先读持久化的 repostsTargetUrl（startCleanup 在提取到 u 后会写）
    try {
      var resp = await chrome.runtime.sendMessage({ target: 'readRepostsTargetUrl' });
      if (resp && resp.url) return resp.url;
    } catch (e) {}
    // 兜底：从当前 URL 实时提取 u
    var u = getCurrentUsername();
    if (u) {
      if (type === 'reposts' || type === 'likes' || type === 'favorites') return 'https://www.tiktok.com/@' + u;
      if (type === 'following') return 'https://www.tiktok.com/@' + u + '/following';
    }
    return null;
  }

  // 处理 sidepanel 发来的命令
  function handleMessage(message, sender, sendResponse) {
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

        var u = getCurrentUsername();
        if (!u) {
          var navProfile = await waitForElement('[data-e2e="nav-profile"]', 10000);
          if (navProfile) {
            var href = navProfile.getAttribute('href') || '';
            var m = href.match(/^\/@([A-Za-z0-9._-]+)/);
            if (m) u = m[1];
          }
        }

        if (u) {
          try {
            chrome.runtime.sendMessage({
              target: 'writeRepostsTargetUrl',
              url: 'https://www.tiktok.com/@' + u
            });
          } catch (e) {}
        }

        var pageType = detectPageType();
        var matchedType = null;
        for (var i = 0; i < types.length; i++) {
          var t = types[i];
          if (t === 'videos' && pageType === 'videos') { matchedType = t; break; }
          if (t === 'reposts' && (pageType === 'reposts' || pageType === 'profile')) { matchedType = t; break; }
          if (t === 'likes' && pageType === 'likes') { matchedType = t; break; }
          if (t === 'favorites' && pageType === 'favorites') { matchedType = t; break; }
          if (t === 'following' && pageType === 'following') { matchedType = t; break; }
        }

        if (!matchedType && types.length > 0) {
          var firstType = types[0];
          var targetUrl = u ? await getPageURLForType(firstType) : null;
          if (targetUrl) {
            console.log('[TikTok Eraser] Starting cleanup from unknown page, navigating to:', targetUrl);
            window.__TikTokEraserForcePageLoad(targetUrl);
            sendResponse({ success: true, navigated: true, url: targetUrl });
          } else {
            // u 提取失败 + pageType 不匹配 → 主动跳 foryou 让 nav-profile 出现，
            // 由新 content script 启动后 resume 接管（sidepanel 已经写了 pendingCleanup 到 session）
            console.warn('[TikTok Eraser] Cannot determine target URL (u extraction failed), navigating to foryou for resume');
            window.__TikTokEraserForcePageLoad('https://www.tiktok.com/foryou');
            sendResponse({ success: true, navigated: true, url: 'https://www.tiktok.com/foryou' });
          }
          return;
        }
        
        if (document.readyState === 'complete') {
          try {
            await injector.startCleanup(options);
            sendResponse({ success: true });
          } catch (e) {
            sendResponse({ error: e.message });
          }
        } else {
          window.addEventListener('load', async function() {
            try {
              await injector.startCleanup(options);
              sendResponse({ success: true });
            } catch (e) {
              sendResponse({ error: e.message });
            }
          }, { once: true });
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

    // 强制跳页：通过 background chrome.tabs.update 改 tab URL
  // TikTok /tiktokstudio ↔ /@user 之间是完整页面加载，window.location.href 也能跳，
  // 但用 chrome.tabs.update 走 Chrome API 层更可靠（避免 TikTok SPA 拦截）
  // background 已经处理 forceNavigation target（chrome.tabs.update）
  // 暴露到 window 供 tiktok-automation.js 调用
  //
  // 2026-06-29 修复：去掉 _=... cache-busting 注入。
  // 原因：之前为了避免 bf cache 给所有 forcePageLoad URL 加 ?_=Date.now()，但 TikTok
  //   看到带 query 的 URL 不识别（不 redirect 到 /@user），导致 fallback 失败。
  //   chrome.tabs.update 本身就是新页面加载，不需要 cache-busting；
  //   跨 pageType navigate（profile → /video/ → /@user）page URL 完全不同，
  //   浏览器不会复用 bf cache。
  window.__TikTokEraserForcePageLoad = function(url) {
    try {
      chrome.runtime.sendMessage({
        target: 'forceNavigation',
        url: url
      });
    } catch (e) {
      // 兜底：background 不可用时退回 location.href
      console.warn('[TikTok Eraser] forceNavigation failed, fallback to location.href:', e);
      window.location.href = url;
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
      // - reposts: /@user + Reposts tab 已选中；或 /@user 任意 tab（自动点 repost-tab）
      // - likes/favorites/following: 对应 /@user/{tab} 子路径（自动点 tab，TODO）
      var matchedType = null;
      for (var i = 0; i < types.length; i++) {
        var t = types[i];
        if (t === 'videos' && pageType === 'videos') { matchedType = t; break; }
        if (t === 'reposts' && pageType === 'reposts') { matchedType = t; break; }
        if (t === 'likes' && pageType === 'likes') { matchedType = t; break; }
        if (t === 'favorites' && pageType === 'favorites') { matchedType = t; break; }
        if (t === 'following' && pageType === 'following') { matchedType = t; break; }
      }

      // /@user 主页：没匹配 type 时，尝试点对应的 tab
      if (!matchedType && pageType === 'profile') {
        var tabMap = {
          reposts: '[data-e2e="repost-tab"]',
          likes: '[data-e2e="liked-tab"]',
          favorites: '[class*="PFavorite"]',
          following: '[data-e2e="following-tab"], [class*="PFollowing"]'
        };
        for (var j = 0; j < types.length; j++) {
          var t = types[j];
          var selector = tabMap[t];
          if (!selector) continue;
          var tabEl = document.querySelector(selector);
          if (tabEl) {
            console.log('[TikTok Eraser] Clicking ' + t + ' tab on /@user profile');
            try {
              var u = getCurrentUsername();
              if (u) {
                chrome.runtime.sendMessage({
                  target: 'writeRepostsTargetUrl',
                  url: 'https://www.tiktok.com/@' + u
                });
              }
            } catch (e) {}
            tabEl.click();
            matchedType = t;
            break;
          }
        }
      }

      if (!matchedType) {
        // 当前页面不匹配 → 先从 nav-profile 提取 u（如果当前页有 nav-profile），
        // 写 readRepostsTargetUrl → 跳到第一个 type 的 URL（仿 Reposts 模式）
        var u = getCurrentUsername();
        if (!u) {
          var navProfile = await waitForElement('[data-e2e="nav-profile"]', 8000);
          if (navProfile) {
            var href = navProfile.getAttribute('href') || '';
            var m = href.match(/^\/@([A-Za-z0-9._-]+)/);
            if (m) {
              u = m[1];
              try {
                chrome.runtime.sendMessage({
                  target: 'writeRepostsTargetUrl',
                  url: 'https://www.tiktok.com/@' + u
                });
              } catch (e) {}
            }
          }
        }

        var firstType = types[0];
        var nextUrl = getPageURLForType(firstType);
        if (nextUrl) {
          console.log('[TikTok Eraser] No matched type on this page, navigating to:', firstType);
          window.__TikTokEraserForcePageLoad(nextUrl);
        } else {
          await chrome.runtime.sendMessage({ target: 'clearPendingCleanup' });
        }
        return;
      }

      // 跑 matchedType
      var remainingTypes = types.filter(function(t) { return t !== matchedType; });
      var optionsForCurrent = Object.assign({}, pending, { types: [matchedType] });

      if (injector) {
        console.log('[TikTok Eraser] Running cleanup for:', matchedType);
        await injector.startCleanup(optionsForCurrent);

        // 跑完后还有剩余 types → 先跳回 Profile 页面，让 auto-resume 接管
        if (remainingTypes.length > 0) {
          var newPending = Object.assign({}, pending, { types: remainingTypes });
          await chrome.runtime.sendMessage({ target: 'updatePendingCleanup', pending: newPending });
          
          var profileUrl = getPageURLForType('reposts');
          if (profileUrl) {
            console.log('[TikTok Eraser] Done with ' + matchedType + ', navigating back to Profile for next types:', remainingTypes);
            window.__TikTokEraserForcePageLoad(profileUrl);
          }
        } else {
          await chrome.runtime.sendMessage({ target: 'clearPendingCleanup' });
        }
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
