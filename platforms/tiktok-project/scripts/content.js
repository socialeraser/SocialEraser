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
  function sendToBackground(data) {
    if (_bgPort) {
      try { _bgPort.postMessage(data); return; } catch (e) { _bgPort = null; }
    }
    try {
      _bgPort = chrome.runtime.connect({ name: 'tiktokeraser-logger' });
      _bgPort.onDisconnect.addListener(function() { _bgPort = null; });
      _bgPort.postMessage(data);
    } catch (e) {
      _bgPort = null;
      chrome.runtime.sendMessage(data).catch(function() {});
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

  // 检查登录态：通过 GLOBAL_LOGIN_INDICATORS
  function checkLoginStatus() {
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
  function detectPageType() {
    var pathname = location.pathname || '';
    if (/^\/@[A-Za-z0-9._-]+$/.test(pathname)) return 'videos';
    if (/^\/@[A-Za-z0-9._-]+\/likes$/.test(pathname)) return 'likes';
    if (/^\/@[A-Za-z0-9._-]+\/favorites$/.test(pathname)) return 'favorites';
    if (/^\/@[A-Za-z0-9._-]+\/following$/.test(pathname)) return 'following';
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
      if (!injector) {
        sendResponse({ error: 'Injector not ready' });
        return false;
      }
      injector.startCleanup(message.options || {}).then(function() {
        sendResponse({ success: true });
      }).catch(function(e) {
        sendResponse({ error: e.message });
      });
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

    console.log('[TikTok Eraser] Content script initialized, pageType=' + detectPageType() + ', loggedIn=' + getEffectiveLoginStatus());
  })();
})();
