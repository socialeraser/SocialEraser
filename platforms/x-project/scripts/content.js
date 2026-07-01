// X Eraser Content Script
// 注入到 X 网站，跑在 X 页面 DOM 上下文里
//
// 职责:
//   1. 启动时加载远程配置（从 chrome.storage.local 读，background 已预拉好）
//   2. 初始化 XEraserInjector 实例（核心清理引擎，跑在 lib/injector.js）
//   3. 包装 injector 的回调（onLog / onProgress / onComplete）→ 通过 chrome.runtime.sendMessage 发给 sidepanel
//   4. 检测登录状态、页面类型（likes/bookmarks/tweets/following）
//   5. 处理「跨页面清理」的 auto-resume（用户点了 Start，跳页后再回来自动继续）
//   6. 接收 sidepanel 的 startCleanup / pauseCleanup 等命令 → 转发给 injector
//
// 与其他层的关系:
//   - sidepanel（用户控制面板）→ background → content
//   - content（这一层）→ sidepanel（直接 broadcast，不经 background，避免收到 2 次）
//   - background 预拉远程配置 → content 从 chrome.storage.local 读
//
// 注入时机:
//   - manifest content_scripts: 每次 X 页面加载时自动注入
//   - chrome.scripting.executeScript: 已开的 tab 由 background 手动注入
//   防重复注入: 用 window.__XEraserContentInjected flag 守护

// 防止 manifest content_scripts + chrome.scripting.executeScript 重复注入同一个 content.js
// 重复注入会导致 2 个 injector 实例、2 个 onLog 包装、日志面板重复输出
(function() {
  'use strict';
  if (window.__XEraserContentInjected) {
    console.log('[X Eraser] Content script already injected, skipping re-init');
    return;
  }
  window.__XEraserContentInjected = true;

  console.log('[X Eraser] Content script loaded on', window.location.href);

  let injector = null;

  // 登录态正向 indicator：X 各页面侧栏的稳定元素 + 通用 fallback
  // 顺序：最稳定的 sidebar 锚点（任何登录页都有）→ 通用元素
  // - a[href="/compose/post"] / [data-testid^="AppTabBar_"]：侧栏常驻元素，不依赖具体 testid
  // - 其余：之前用过的 testid，作为兜底
  // 不再用 [data-testid='tweetTextarea_0']（仅 /home 存在）和 [data-testid='AppBody-Assistor']（X 已移除）
  // 2026-XX-XX 精简：X 改版后 a[href='/i/bookmarks'] / a[href^='/messages'] /
  //   精确 [data-testid='SideNav_AccountSwitcher'] / 精确 [data-testid='UserAvatar'] 都已失效
  //   （实测在 x.com/i/bookmarks 的 X 2026 DOM 全部 MISS，详见 debug-login-stuck-checking.md）
  // 删除 [aria-label*='Account menu']：X 把 aria-label 当 visible text 翻译，
  //   案例 10 已记录此现象，非英文 locale 100% 失效
  // 7 个 selector 在 X 2026 实测全部 HIT，做减法：原 8 个 → 现 7 个
  const GLOBAL_LOGIN_INDICATORS = [
    "a[href='/compose/post']",                  // ✅ 仍能用
    "a[href='/home']",                          // ← 新增
    "a[href^='/i/chat']",                       // ← 新增（X 2026 Direct Messages 真实路径）
    "a[href^='/notifications']",                // ✅ 仍能用
    "[data-testid^='AppTabBar_']",              // ✅ 仍能用（前缀匹配，7 个）
    "[data-testid^='SideNav_AccountSwitcher']", // ← 改为前缀匹配（X 加了 _Button 后缀）
    "[data-testid^='UserAvatar-Container']",    // ← 改为前缀匹配（X 加了 -<username> 后缀）
  ];

  // X 的保留路径（导航/系统页），不能被当成 user profile/tweets 源
  // 用于 detectPageType 排除 + getCurrentUsername 兜底判定
  const RESERVED_PATHS = ['home', 'explore', 'notifications', 'bookmarks', 'i', 'search', 'settings', 'compose', 'login', 'messages'];

  // 登录态 sticky 缓存：
  // - null = 尚未检测（hydrate 还没回来 / 首次启动）
  // - true = 已确认登录
  // - false = 已确认未登录
  //
  // 设计原则（2026-07-01 修正）：
  //   1. 首次 hydrate 完成后，正向检测（checkLoginStatus）只跑一次，结果锁死
  //   2. 之后唯一能翻转状态的信号：用户在登录页 / 主动登出（isLoggedOut 严格判断）
  //   3. 不再在每次轮询时跑正向检测 —— 任何模糊匹配（"Sign in" 出现在 button/menu 里）
  //      都可能让 cachedIsLoggedIn 翻转到错误状态
  //   4. 不再用 document.body.innerText.includes() 判登录页 —— "Sign in" /
  //      "Log in" 文字在 X 任何页面都可能短暂出现（account switcher、share dialog、tooltip）
  let cachedIsLoggedIn = null;

  // 把登录态持久化到 session storage（fire-and-forget）。
  // 只在 sticky 状态真正翻转时调用，避免每 3s 轮询都打 IPC。
  // status: true = logged_in / false = logged_out
  function persistLoginStatus(status) {
    const value = status === true ? 'logged_in' : 'logged_out';
    chrome.runtime.sendMessage({
      target: 'writeLoginStatus',
      status: value
    }).catch(function() { /* background 不可用：忽略，不影响主流程 */ });
  }

  // 启动时从 session storage 恢复 sticky 状态（fire-and-forget）。
  // hydrate 完成前 cachedIsLoggedIn 仍是 null，hydrate 后用真值。
  // 期间 getEffectiveLoginStatus 走首次检测路径。
  function hydrateLoginStatus() {
    chrome.runtime.sendMessage({ target: 'readLoginStatus' }).then(function(resp) {
      if (!resp || !resp.status) return;
      if (resp.status === 'logged_in' || resp.status === 'logged_out') {
        cachedIsLoggedIn = (resp.status === 'logged_in');
        console.log('[X Eraser] Hydrated login status from session storage:', resp.status);
      }
    }).catch(function() { /* background 不可用时跳过 */ });
  }
  hydrateLoginStatus();

  // 直接从 storage 读远程配置（中间不再经过 background）
  // 设计：background service worker 启动时已预拉远程配置 → 存 chrome.storage.local
  //       content 启动时直接读 storage 拿就行（不再绕一圈 background，省 1 次 IPC）
  // 返回: 远程配置对象 或 null（storage 也没 → 用 injector 内置 DEFAULT_SELECTORS 兜底）
  async function getRemoteConfig() {
    try {
      const stored = await chrome.storage.local.get('remoteConfig');
      if (stored && stored.remoteConfig) return stored.remoteConfig;
    } catch (e) {
      console.warn('[X Eraser] Failed to read remote config from storage:', e.message);
    }
    return null;
  }

  // 8 语言登录页文字检测（兜底用）—— 远程配置缺失时按用户 X 显示语言检测登录页
  // 来源：原 lib/config.js 的 DEFAULT_CONFIG.selectors.login.checkElements（lib/config.js 已删）
  // 每个语言: 2 个文字 + 1 个稳定 selector
  // 关键 selector: data-testid='loginButton' 是 X 登录页稳定的标记（多语言一致）
  const DEFAULT_CHECK_ELEMENTS_8LANG = {
    'zh-CN': [
      { type: 'text', value: '继续' },
      { type: 'text', value: '创建您的账户' },
      { type: 'selector', value: "[data-testid='loginButton']" }
    ],
    'pt': [
      { type: 'text', value: 'Entrar' },
      { type: 'text', value: 'Criar sua conta' },
      { type: 'selector', value: "[data-testid='loginButton']" }
    ],
    'en': [
      { type: 'text', value: 'Sign in' },
      { type: 'text', value: 'Create your account' },
      { type: 'selector', value: "[data-testid='loginButton']" }
    ],
    'ja': [
      { type: 'text', value: 'サインイン' },
      { type: 'text', value: 'アカウントを作成' },
      { type: 'selector', value: "[data-testid='loginButton']" }
    ],
    'ko': [
      { type: 'text', value: '로그인' },
      { type: 'text', value: '계정 만들기' },
      { type: 'selector', value: "[data-testid='loginButton']" }
    ],
    'es': [
      { type: 'text', value: 'Iniciar sesión' },
      { type: 'text', value: 'Crea tu cuenta' },
      { type: 'selector', value: "[data-testid='loginButton']" }
    ],
    'de': [
      { type: 'text', value: 'Anmelden' },
      { type: 'text', value: 'Konto erstellen' },
      { type: 'selector', value: "[data-testid='loginButton']" }
    ],
    'fr': [
      { type: 'text', value: 'Se connecter' },
      { type: 'text', value: 'Créer votre compte' },
      { type: 'selector', value: "[data-testid='loginButton']" }
    ]
  };

  // 把远程配置封装成 window.XEraserConfig 给 page 上下文用
  //   远程配置优先 → 没有就用本地默认（兜底）
  // 设计：getter 形式（每次读都重新判断 remoteConfig），方便运行时 remote 变化后能立刻生效
  function initXEraserConfig(remoteConfig) {
    window.XEraserConfig = {
      // 匹配的网站域名模式（用于 chrome.tabs.query 查 X tab）
      getWebsitePatterns() {
        if (remoteConfig && remoteConfig.selectors && remoteConfig.selectors.xWebsite && remoteConfig.selectors.xWebsite.patterns) {
          return remoteConfig.selectors.xWebsite.patterns;
        }
        return ['x.com', 'twitter.com'];
      },
      // 登录检测配置（checkElements 是按语言登录页文字，loggedInElements 是已登录元素）
      // 8 语言 checkElements 兜底：远程配置失败 → 默认按用户 X 显示语言检测登录页文字
      //   来源：原 lib/config.js 的 DEFAULT_CONFIG，2026-XX-XX 移到此处（lib/config.js 已删）
      getLoginConfig() {
        if (remoteConfig && remoteConfig.selectors && remoteConfig.selectors.login) {
          return remoteConfig.selectors.login;
        }
        return {
          checkElements: DEFAULT_CHECK_ELEMENTS_8LANG,
          // 与 GLOBAL_LOGIN_INDICATORS 同步精简（2026-XX-XX）：
          //   删 4 个失效（/i/bookmarks / /messages / 精确 SideNav_AccountSwitcher / 精确 UserAvatar）
          //   删 1 个 aria-label 翻译死（[aria-label*='Account menu']）
          //   加 2 个新工作（/home / /i/chat），2 个改前缀匹配（SideNav_AccountSwitcher / UserAvatar-Container）
          loggedInElements: [
            { type: 'selector', value: "a[href='/compose/post']" },
            { type: 'selector', value: "a[href='/home']" },
            { type: 'selector', value: "a[href^='/i/chat']" },
            { type: 'selector', value: "a[href^='/notifications']" },
            { type: 'selector', value: "[data-testid^='AppTabBar_']" },
            { type: 'selector', value: "[data-testid^='SideNav_AccountSwitcher']" },
            { type: 'selector', value: "[data-testid^='UserAvatar-Container']" }
          ]
        };
      },
      // 全局登录 indicator（任何登录页都有的稳定元素）
      getGlobalLoginIndicators() {
        if (remoteConfig && remoteConfig.selectors && remoteConfig.selectors.login && remoteConfig.selectors.login.globalIndicators) {
          return remoteConfig.selectors.login.globalIndicators;
        }
        return GLOBAL_LOGIN_INDICATORS;
      },
      // 暴露完整 selectors 给 injector
      getSelectors() {
        return (remoteConfig && remoteConfig.selectors) || {};
      }
    };
  }

  // 初始化 XEraserInjector（lib/injector.js 的主引擎类）并包装回调
  // 包装内容：injector.onLog / onProgress / onComplete / onError / onTypeStart / onTypeComplete
  //   全部桥接到 chrome.runtime.sendMessage 发给 sidepanel（用户控制面板）
  // 失败保护：如果 window.XEraserInjector 不存在（injector.js 没加载完），静默 return
  // M++ 修复（2026-06-19 tweets-bug-8）：sendToBackground 提到顶层（initInjector 外）
  //   这样 content script 里所有 fire-and-forget 消息（cleanupLog / cleanupAborted / cleanupComplete / cleanupError 等）
  //   都能用同一个 helper，不用每个都内嵌一份
  let _bgPort = null;
  function sendToBackground(data) {
    if (_bgPort) {
      try { _bgPort.postMessage(data); return; } catch (e) { _bgPort = null; }
    }
    try {
      _bgPort = chrome.runtime.connect({ name: 'socialeraser-logger' });
      _bgPort.onDisconnect.addListener(function() { _bgPort = null; });
      _bgPort.postMessage(data);
    } catch (e) {
      _bgPort = null;
      chrome.runtime.sendMessage(data).catch(function() {});
    }
  }

  function initInjector(remoteConfig) {
    if (window.XEraserInjector) {
      injector = new window.XEraserInjector();
      injector.setConfig(remoteConfig);
      // 关键修复（debug-tweet-delete-regression）：把当前登录用户名传给 injector
      //   用于 collectCandidates 过滤掉他人 quoted 推文（X 2026 把 quoted 推文渲染成顶层 article）
      injector.setCurrentUsername(getCurrentUsername());

      // 进度更新（每处理一条推文 → 发一次）
      injector.onProgress = function(count, message) {
        sendToBackground({ type: 'cleanupProgress', data: { count: count, message: message } });
      };

      // 日志输出（每步操作都发一条，侧边栏实时显示）
      injector.onLog = function(message, type) {
        sendToBackground({ type: 'cleanupLog', data: { message: message, level: type } });
      };

      // 整个 cleanup 跑完
      injector.onComplete = function(result) {
        sendToBackground({ type: 'cleanupComplete', data: result });
      };

      // 错误
      injector.onError = function(message) {
        sendToBackground({ type: 'cleanupError', data: { message: message } });
      };

      // 每个 type（likes/bookmarks/following/originalTweets/replies/retweets）开始
      // M++ 修复（2026-06-19 tweets-bug-8）：用 sendToBackground 替代 sendMessage
      //   之前 sendMessage race condition 失败时 sidepanel 收不到 → option-count 数字不更新
      injector.onTypeStart = function(type) {
        sendToBackground({ type: 'cleanupTypeStart', data: { type: type } });
      };

      // 每个 type 跑完（带处理条数）
      injector.onTypeComplete = function(type, processed) {
        sendToBackground({ type: 'cleanupTypeComplete', data: { type: type, processed: processed } });
      };

      console.log('[X Eraser] Injector initialized');
    }
  }

  // 启动入口：加载远程配置 → 初始化 XEraserConfig 和 Injector → 500ms 后检查登录状态
  // 同时启动 MutationObserver 监听 article 元素出现，触发 auto-resume 检查
  async function loadConfig() {
    const remoteConfig = await getRemoteConfig();
    if (remoteConfig) {
      console.log('[X Eraser] Config loaded from storage');
    } else {
      console.log('[X Eraser] No config in storage, using defaults');
    }

    initXEraserConfig(remoteConfig);
    initInjector(remoteConfig);

    console.log('[X Eraser] Config initialized, checking status...');
    // 不用 setTimeout 猜延迟（500ms 是靠经验），等 window 'load' 事件 = page + 资源完全加载
    if (document.readyState === 'complete') {
      checkXStatus();
    } else {
      window.addEventListener('load', checkXStatus, { once: true });
    }

    // 用 MutationObserver 监听 article 元素出现，触发后立即启动 auto-resume
    // 2026-06-18 修复：timeout 8s（X 慢网/弱网时 page load 完要 4-6s，3s 太短）
    //   + 0 article 时不调 auto-resume（让用户在 sidepanel 手动 retry，避免 0 命中）
    //   injector 内部 waitForContentStable 仍有 1.5s 稳定 + 5s 兜底，足够 cover 0 article 场景
    //
    // M++ 修复（2026-06-18 tweets-bug-6 用户反馈）：
    //   原版**无条件**等 article + 打印 "proceeding to auto-resume" + "No articles detected" warn
    //   → 用户**没点开始**时也看到这 2 条日志，误以为扩展在偷偷删东西
    //   修法：把 pending 检查**前移**到 `checkAndResumePendingCleanup` 内部，
    //         **没 pending 就直接 return 静默**，根本**不**走 `waitForArticles` 路径
    //   效果：用户没点开始 / 上次没残留 cleanup → content.js 启动完全静默
    //
    // M++ 修复（2026-06-18 tweets-bug-6 用户再次反馈"页面没加载完就干完了"）：
    //   根因：checkAndResumePendingCleanup 在 IIFE 启动时**立即调**，**不等 window.load**
    //   → page 资源还没下载完就开始 cleanup → waitForContentStable 0 article 兜底 → 0 candidates
    //   修法：必须等 document.readyState === 'complete'（window.load 触发）才调
    //         X 内部 React hydration 在 load 后才开始，waitForContentStable 才有意义
    if (document.readyState === 'complete') {
      checkAndResumePendingCleanup();
    } else {
      window.addEventListener('load', checkAndResumePendingCleanup, { once: true });
    }
  }

  // 监听 storage.onChanged：用户点「重载配置」按钮后，background 把新 config 写到 storage.local
  //   修法：content 自己监听 storage.onChanged，remoteConfig 变了就 setConfig 到现有 injector
  //   关键：复用同一 instance（不新建）→ sidepanel 后续 getStatus / pause / stop 仍打到同一对象
  //         本次 cleanup 不会被打断（processXxx 循环照旧跑完），但下一轮 iteration 立刻用新 config
  //         （X 改版中途切选择器的风险：旧 config 的 selector 找不到按钮 → 跳过 → 新 config 顶上）
  //         选 setConfig 而非 initInjector：initInjector 会替换模块级 injector 变量，导致
  //         sidepanel 后续消息打到一个 isRunning=false 的新 instance，UI 错位显示已停止
  chrome.storage.onChanged.addListener(function(changes, area) {
    if (area !== 'local' || !changes.remoteConfig) return;
    getRemoteConfig().then(function(newConfig) {
      if (!newConfig) return;
      console.log('[X Eraser] remoteConfig changed, applying via setConfig');
      initXEraserConfig(newConfig);
      if (injector && typeof injector.setConfig === 'function') {
        injector.setConfig(newConfig);
        if (typeof injector.setCurrentUsername === 'function') {
          injector.setCurrentUsername(getCurrentUsername());
        }
      }
    }).catch(function(e) {
      console.warn('[X Eraser] re-init on storage change failed:', e.message);
    });
  });

  // 监听 X 推文卡片（<article> 标签）出现，立即 resolve
  //
  // 设计原则（2026-06-18 tweets-bug-6 用户反馈）：
  //   **不靠经验猜等几秒**。M++ 撤销 M+ 的 8s timeout 改用：
  //   1. MutationObserver 立即检测 article 出现 → resolve
  //   2. 兜底：X 真挂了或选择器失效 → 连续 N 次空 mutation 才算"加载完（其实是失败）"
  //      N 是"观察次数"，不是"时间"（观察一次 = DOM 一次变化或一次 RAF）
  //      X 真的在 lazy load 时 mutation 频繁，N=20 也就 1-2s
  //      X 真挂了时 N=20 也很快（mutation 不会有，直接 20 帧空）
  //   3. 极端兜底：连续 maxIdleFrames 没任何 mutation 也算加载完
  //      帧数是浏览器节奏，不靠经验数字
  //
  // 注：实际本函数在 tweets-bug-6 后**不再被自动调用**——`checkAndResumePendingCleanup`
  //     内部直接用 `runCleanupOnce`（内部 `waitForContentStable` 处理"加载完"判断）。
  //     本函数保留以备其他场景用 + 防御性。
  function waitForArticles() {
    var MAX_IDLE_MUTATIONS = 20;  // 连续 20 次空 mutation 算"无新 article"（不靠时间）
    return new Promise(function(resolve) {
      // document_start 注入时 <body> 还没创建，MutationObserver.observe(null) 会抛
      // 等 DOMContentLoaded 后再启动 observer
      function startObserving() {
        if (!document.body) {
          if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', startObserving, { once: true });
          } else {
            requestAnimationFrame(startObserving);
          }
          return;
        }

        // 1. 立即检查：已有则直接 resolve
        var initial = document.querySelectorAll('article').length;
        if (initial > 0) { resolve(initial); return; }

        // 2. MutationObserver 监听 DOM 变化
        //    连续 N 次 mutation 后 article 数仍 = 0 → resolve(0)（X 没渲染，不是没加载完）
        //    一旦 article > 0 → resolve(n)
        var resolved = false;
        var idleCount = 0;
        function done(n) {
          if (resolved) return;
          resolved = true;
          observer.disconnect();
          cancelAnimationFrame(rafId);
          resolve(n);
        }
        var observer = new MutationObserver(function() {
          if (resolved) return;
          var n = document.querySelectorAll('article').length;
          if (n > 0) { done(n); return; }
          // 有 mutation 但 article 仍 = 0 → 计数 +1
          idleCount++;
          if (idleCount >= MAX_IDLE_MUTATIONS) {
            done(0);  // X 真的没渲染，resolve(0) 让 caller 决定下一步
          }
        });
        observer.observe(document.body, { childList: true, subtree: true });

        // 3. 极端兜底：连 RAF 都没触发（X 真挂了）→ 下一帧检查
        var rafId = requestAnimationFrame(function watchIdle() {
          if (resolved) return;
          var n = document.querySelectorAll('article').length;
          if (n > 0) { done(n); return; }
          rafId = requestAnimationFrame(watchIdle);
        });
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
      console.warn('[X Eraser] forceNavigation failed, fallback to location.replace:', e);
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
      console.log('[X Eraser] Resuming pending cleanup - types:', types, 'pageType:', pageType);

      // 通知 side panel
      chrome.runtime.sendMessage({
        type: 'cleanupLog',
        data: { message: t('pageLoadedResuming'), level: 'info' }
      });

      // 找到 pageType 匹配的那个 type（仅一个）
      //   5 个 type 关系：originalTweets → 'originalTweets'，replies/retweets → 'tweetTimeline'（共用 /with_replies）
      const matchedType = types.find(function(t) {
        if (t === 'likes') return pageType === 'likes';
        if (t === 'bookmarks') return pageType === 'bookmarks';
        if (t === 'following') return pageType === 'following';
        if (t === 'originalTweets') return pageType === 'originalTweets';
        if (t === 'replies') return pageType === 'tweetTimeline';
        if (t === 'retweets') return pageType === 'tweetTimeline';
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
            console.warn('[X Eraser] Retry limit reached (' + retryCount + '), aborting cleanup. Current page:', pageType);
            await chrome.runtime.sendMessage({ target: 'clearPendingCleanup' });
            // 通知 sidepanel：cleanup 已中止 + 错误原因（chrome.runtime.sendMessage 是广播，sidepanel 直接收到）
            sendToBackground({
              type: 'cleanupLog',
              data: { message: t('cleanupAbortedPageNotFound'), level: 'error' }
            });
            sendToBackground({
              type: 'cleanupAborted',
              data: { reason: 'page_not_found', retries: retryCount }
            });
            return;
          }
          // 更新 retry 计数并跳页
          await chrome.runtime.sendMessage({
            target: 'updatePendingCleanup',
            pending: Object.assign({}, pending, { retryCount: retryCount })
          });
          console.log('[X Eraser] No matched type on this page, navigating to:', firstType, '(retry ' + retryCount + '/3)');
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
        injector.setCurrentUsername(getCurrentUsername());
        const isLast = remainingTypes.length === 0;
        // 旧实现：runCleanupWithRetry 调用 maxAttempts=2 会在 0 命中时无条件重试一次。
        // 这与前面 waitForArticles(3000) 的职责重复，导致每页跑 2 次（4s 浪费 + 用户困惑）。
        // waitForArticles 已经用 MutationObserver 等 article 出现，最长 3s 兜底，
        // 真正的"页面没加载"场景由它 cover，cleanup 本体只跑 1 次。
        await runCleanupOnce(optionsForCurrent, 1, isLast);

        // 跑完后处理 remainingTypes
        // 2026-06-18 优化：用 while 循环替代递归 + 同 URL 跳过 forcePageLoad
        //   场景：replies + retweets 共享 /username/with_replies，
        //         旧实现强制刷新浪费 2-3s + 经常 0 命中
        //   解决：比较 nextUrl pathname 与 window.location.pathname，相同就直接处理
        let pendingToProcess = remainingTypes;
        while (pendingToProcess.length > 0) {
          const nextType = pendingToProcess[0];
          const nextUrl = getPageURLForType(nextType);
          if (!nextUrl) {
            // 未知 type：跳过这个，处理剩下的（防御性，正常不会到这里）
            pendingToProcess = pendingToProcess.slice(1);
            continue;
          }
          const nextPath = nextUrl.split('?')[0];
          if (nextPath === window.location.pathname) {
            // 同 URL：直接处理（replies/retweets 共享 /with_replies 场景）
            console.log('[X Eraser] Same URL for ' + nextType + ', skip forcePageLoad and process directly');
            sendToBackground({
              type: 'cleanupLog',
              data: { message: t('processedNavigatingTo', {next: t(nextType)}), level: 'info' }
            });
            const subRemaining = pendingToProcess.slice(1);
            const isLast = subRemaining.length === 0;
            const subOptions = Object.assign({}, pending, { types: [nextType] });
            await runCleanupOnce(subOptions, 1, isLast);
            if (isLast) {
              await chrome.runtime.sendMessage({ target: 'clearPendingCleanup' });
              return;
            }
            pendingToProcess = subRemaining;
            continue;
          }
          // 不同 URL：更新 session + forcePageLoad 跳出当前 resume，等下次 page load 自动 resume
          const newPending = Object.assign({}, pending, { types: pendingToProcess });
          await chrome.runtime.sendMessage({ target: 'updatePendingCleanup', pending: newPending });
          console.log('[X Eraser] Processed ' + matchedType + ', navigating to:', nextType);
          sendToBackground({
            type: 'cleanupLog',
            data: { message: t('processedNavigatingTo', {next: t(nextType)}), level: 'info' }
          });
          forcePageLoad(nextUrl);
          return;
        }
        // 全部 remainingTypes 同 URL 走完
        await chrome.runtime.sendMessage({ target: 'clearPendingCleanup' });
      }
    } catch (error) {
      console.warn('[X Eraser] Failed to check pending cleanup:', error.message);
    }
  }

  // 根据 type 返回对应页面 URL
  // 6 type 完全独立，每个 type 自己专属 URL（不再共享 tweetOptions）
  function getPageURLForType(type) {
    if (type === 'likes') return getLikesPageURL();
    if (type === 'bookmarks') return getBookmarksPageURL();
    if (type === 'following') return getFollowingPageURL();
    if (type === 'originalTweets') return getOriginalTweetsPageURL();
    if (type === 'replies') return getRepliesPageURL();
    if (type === 'retweets') return getRetweetsPageURL();
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
            console.error('[X Eraser] origOnComplete threw:', e);
          }
        }
        if (!resolved) {
          resolved = true;
          // 恢复原始 onComplete，避免下一轮 runCleanupOnce 拿到被覆盖的版本
          // 否则最后一轮完成后 cleanupComplete 事件链断裂，sidepanel 永远卡 Processing...
          injector.onComplete = origOnComplete;
          console.log('[X Eraser] Auto-resume attempt ' + attempt + ': processed=' + result.processed + (isLast ? ' (final)' : ' (continuing)'));
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
        console.warn('[X Eraser] startCleanup threw in attempt ' + attempt + ': ' + e.message);
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
      if (lang.startsWith('zh')) return 'zh-CN';
      if (lang.startsWith('ja')) return 'ja';
      if (lang.startsWith('ko')) return 'ko';
      if (lang.startsWith('pt')) return 'pt';
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
          console.log('[X Eraser] Global login indicator found:', indicators[i]);
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

  // 严格判断「用户在登录页 / 已登出」
  // 2026-07-01 替换原 checkIsLoginPage()：
  //   原版用 document.body.innerText.includes('Sign in') 等模糊匹配，
  //   会在 account switcher / share dialog / tooltip 含 "Sign in" 文字的页面误判，
  //   导致 cachedIsLoggedIn 错误翻转到 false。
  // 新版只查两类硬信号：
  //   1. URL 路径明确是登录页（X SPA 登出后会重定向到这几个路径）
  //   2. 登录表单 input 是页面**主区域**可见元素（不查孤立 button）
  // 返回: true = 用户在登录页 / 已登出，false = 在任何其他页面（可能已登录）
  function isLoggedOut() {
    const path = window.location.pathname.toLowerCase();
    // 1. URL 是 X 的登录/登出/账号恢复相关路径
    if (path === '/login'
        || path === '/i/flow/login'
        || path === '/i/flow/logout'
        || path === '/account/suspended'
        || path === '/account/locked') {
      return true;
    }

    // 2. 登录表单 input 是页面主区域可见元素
    //    X 登录页有 [autocomplete="username"] 输入框（在 main 区域）
    //    account switcher 下拉菜单里也可能有 input，但 offsetParent 检查会过滤掉 display:none
    //    再用 closest('main') / closest('[role="main"]') 限定必须在主区域
    const loginInputs = document.querySelectorAll(
      'input[autocomplete="username"], input[name="text"][autocomplete="username"], input[name="password"]'
    );
    for (let i = 0; i < loginInputs.length; i++) {
      const el = loginInputs[i];
      if (!el.offsetParent) continue;  // 不可见
      // 必须在 main 区域（role="main" 或 <main> 标签），避免下拉菜单误判
      if (el.closest('main, [role="main"]')) {
        return true;
      }
    }
    return false;
  }

  // 检测当前 URL 类型 —— 决定调用哪个 processXxx
  // 返回: 'likes' | 'bookmarks' | 'following' | 'originalTweets' | 'tweetTimeline' | 'other'
  //   'tweetTimeline' = /with_replies 页（同时是 replies 和 retweets 的合法页）
  //   'other' 包括 home / explore / notifications / 单条推文详情页（status/...）
  // 关键: 用于 auto-resume 跳页后判断当前页面是不是目标 type（不是就 forcePageLoad 跳到对应 URL）
  function detectPageType() {
    const url = window.location.href.toLowerCase();
    const path = window.location.pathname;

    if (url.includes('/likes')) return 'likes';
    if (url.includes('/bookmarks')) return 'bookmarks';
    if (url.includes('/following') && !url.match(/\/following\//)) return 'following';

    // 6 个 type 的 URL 关系：
    //   originalTweets = /username（默认 Posts，不含 reply/retweet）
    //   replies + retweets = /username/with_replies（reply/retweet 不在默认 profile 显示）
    // 显式不匹配 /{username}/status/{id}（单条推文详情页，不是列表）
    // 显式不匹配保留路径（home/explore/...）
    var tweetsMatch = path.match(/^\/([^\/?#]+)(?:\/(with_replies))?\/?$/);
    if (tweetsMatch && RESERVED_PATHS.indexOf(tweetsMatch[1].toLowerCase()) === -1) {
      return tweetsMatch[2] === 'with_replies' ? 'tweetTimeline' : 'originalTweets';
    }

    return 'other';
  }

  // 从 X 页面上提取当前登录用户的用户名（用于拼 /{username}/likes 等 URL）
  // 4 个 fallback 源（按可靠性顺序）:
  //   1. 侧栏 AppTabBar_Profile_Link 的 href —— 最直接最稳定
  //   2. AccountSwitcher 的 LogoutLink —— 父节点有用户信息（X 改版可能失效）
  //   3. 头像 / profile 链接 —— 看 aria-label 包含 'profile' 才算
  //   4. 当前 URL path —— 如果当前在 profile 页面（兜底）
  // 返回: username 字符串 或 null
  function getCurrentUsername() {
    // 尝试 1: 从导航栏 Profile 链接获取
    var profileLink = document.querySelector('a[data-testid="AppTabBar_Profile_Link"]');
    if (profileLink) {
      var href = profileLink.getAttribute('href');
      var match = href && href.match(/^\/([^\/\?]+)/);
      if (match && match[1]) {
        console.log('[X Eraser] Got username from AppTabBar_Profile_Link:', match[1]);
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
          console.log('[X Eraser] Got username from avatar link:', m[1]);
          return m[1];
        }
      }
    }

    // 尝试 4: 从当前 URL（如果在 profile 页面）
    //   M++ 修复（2026-06-19 bug-replies-QioHub）：原正则 `^\/([^\/]+)\/?$` 只匹配 1 段 path，
    //   在 /{user}/with_replies、/{user}/likes、/{user}/following 等 profile 子页面下无法提取 username
    //   → getCurrentUsername() 返回 null → _isOwnArticle 兜底 return true → 误删他人推文
    //   新正则支持 "username + 可选子页面" 两段结构
    var urlMatch = window.location.pathname.match(
      /^\/([^\/]+)(?:\/(with_replies|likes|following|highlights|articles|media))?\/?$/
    );
    if (urlMatch && urlMatch[1] && RESERVED_PATHS.indexOf(urlMatch[1]) === -1) {
      console.log('[X Eraser] Got username from URL path:', urlMatch[1]);
      return urlMatch[1];
    }

    return null;
  }

  // 获取用户 likes 页面 URL（用于 forcePageLoad 跳页）
  // M++ 修复（2026-06-18 tweets-bug-7）：X 2026 改版后 user 的 likes **只**在 profile 的 Likes tab 里
  //   MCP session 是空 user 测不出真东西 → 之前误以为 /i/likes 是真 likes 列表
  //   user 实测 /i/likes 0 数据（emptyState），/test_user/likes 是 profile 6 tabs 页（Posts/Replies/Highlights/Articles/Media/Likes）
  //   → likes 列表**必须**在 /test_user/likes 页 + 点 Likes tab 激活
  // 流程：navigate 到 profile likes 页 → processLikes 入口找 Likes tab 点击 → 等 article 渲染
  function getLikesPageURL() {
    var username = getCurrentUsername();
    if (username) {
      return 'https://x.com/' + username + '/likes';
    }
    console.warn('[X Eraser] Could not get username for likes page');
    return null;  // 拿不到 username 就放弃
  }

  // Bookmarks 是全局的（不像 likes 是用户维度的）→ 固定 URL
  function getBookmarksPageURL() {
    return 'https://x.com/i/bookmarks';
  }

  // Following 是用户维度的 → 需要用户名
  function getFollowingPageURL() {
    var username = getCurrentUsername();
    if (username) {
      return 'https://x.com/' + username + '/following';
    }
    console.warn('[X Eraser] Could not get username, using /i/following fallback');
    return 'https://x.com/i/following';
  }

  // 3 个推文子类型 URL：6 type 完全独立
  //   originalTweets: /{username}（默认 Posts，不含 reply/retweet）
  //   replies:        /{username}/with_replies（reply 不在默认 profile 显示）
  //   retweets:       /{username}/with_replies（retweet 不在默认 profile 显示；与 replies 共享 URL）
  function getOriginalTweetsPageURL() {
    var username = getCurrentUsername();
    if (username) return 'https://x.com/' + username;
    console.warn('[X Eraser] Could not get username for originalTweets, using /home fallback');
    return 'https://x.com/home';
  }
  function getRepliesPageURL() {
    var username = getCurrentUsername();
    if (username) return 'https://x.com/' + username + '/with_replies';
    console.warn('[X Eraser] Could not get username for replies, using /home fallback');
    return 'https://x.com/home';
  }
  function getRetweetsPageURL() {
    var username = getCurrentUsername();
    if (username) return 'https://x.com/' + username + '/with_replies';
    console.warn('[X Eraser] Could not get username for retweets, using /home fallback');
    return 'https://x.com/home';
  }

  // sticky 状态机（2026-07-01 重写）：
  //   1. cachedIsLoggedIn === null（首次启动 / hydrate 还没回来）：
  //      跑一次 checkLoginStatus() 正向检测，命中锁 true / persist
  //   2. cachedIsLoggedIn 已有值（true 或 false）：
  //      唯一能翻转的信号是 isLoggedOut() 命中（用户在登录页 / 主动登出）
  //      检测到登出 → flip 到 false / persist
  //   3. 不再每次轮询跑正向检测 —— DOM 偶发抓空 / 模糊匹配都让状态稳定
  //
  // 返回: true / false / null（仍在首次检测，hydrate 还没回来）
  function getEffectiveLoginStatus() {
    if (!isTargetWebsite()) return false;

    // 唯一翻转信号：用户在登录页 / 已登出
    if (isLoggedOut()) {
      if (cachedIsLoggedIn !== false) {
        cachedIsLoggedIn = false;
        persistLoginStatus(false);
        console.log('[X Eraser] Logout detected, flipping to false');
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
      console.log('[X Eraser] Login confirmed (sticky cached)');
      return true;
    }

    // 还没确认：返回 null 让侧栏显示"检测中"
    return null;
  }

  // 综合状态查询 —— 一次返回所有 sidepanel 需要的状态
  // 返回: { isX, isLoggedIn, isLoginPage, pageType, url }
  //   sidepanel 启动时 + 3s 轮询都调这个
  function checkXStatus() {
    const isX = isTargetWebsite();
    const isLoggedIn = isX ? getEffectiveLoginStatus() : false;
    const isLoginPage = isX ? isLoggedOut() : false;
    const pageType = isX ? detectPageType() : null;

    return {
      isX: isX,
      isLoggedIn: isLoggedIn,
      isLoginPage: isLoginPage,
      pageType: pageType,
      url: window.location.href
    };
  }

  // 处理 sidepanel 的 startCleanup 消息 —— cleanup 入口
  // 关键: 不同 type 对应的 X 页面 URL 不同（likes/following 需要用户名，tweets 需要 profile 页）
  //       如果当前页面不对，必须先 forcePageLoad 跳到目标页 → 等文章加载完 → 才能开始清理
  // 流程:
  //   1. 检查 injector 是否就绪
  //   2. 检查当前 pageType 和所选 types 是否匹配
  //      - 不匹配 → 发 cleanupLog + sendResponse({ needsNavigation: true }) + 100ms 后 forcePageLoad
  //      - 匹配 → 调 injector.startCleanup(options)
  // 返回: 通过 sendResponse 异步返回 { started: true } 或 { started: true, needsNavigation: true }
  async function handleStartCleanup(message, sendResponse) {
    if (!injector) {
      sendResponse({ error: 'Injector not ready' });
      return;
    }
    // 检查页面类型与所选类型是否匹配
    const pageType = detectPageType();
    const types = (message.options && message.options.types) || [];
    console.log('[X Eraser] Start cleanup - types:', types, 'pageType:', pageType);

    if (types.indexOf('likes') >= 0 && pageType !== 'likes') {
      const likesUrl = getLikesPageURL();
      console.log('[X Eraser] Likes requires /likes page, current:', pageType);
      sendToBackground({
        type: 'cleanupLog',
        data: { message: t('likesRequiresNav'), level: 'info' }
      });
      // 先 sendResponse（避免跳页后 message channel 关闭），再 forcePageLoad
      sendResponse({ started: true, needsNavigation: true });
      // 延迟 100ms 让 sendResponse 完整投递到 background + sidepanel，
      // 然后再 forcePageLoad 触发 chrome.tabs.update 卸载 content
      Promise.resolve().then(function() { forcePageLoad(likesUrl); });
      return;
    }

    if (types.indexOf('bookmarks') >= 0 && pageType !== 'bookmarks') {
      const bookmarksUrl = getBookmarksPageURL();
      console.log('[X Eraser] Bookmarks requires /bookmarks page, current:', pageType);
      sendToBackground({
        type: 'cleanupLog',
        data: { message: t('bookmarksRequiresNav'), level: 'info' }
      });
      sendResponse({ started: true, needsNavigation: true });
      Promise.resolve().then(function() { forcePageLoad(bookmarksUrl); });
      return;
    }

    if (types.indexOf('following') >= 0 && pageType !== 'following') {
      const followingUrl = getFollowingPageURL();
      console.log('[X Eraser] Following requires /following page, current:', pageType);
      chrome.runtime.sendMessage({
        type: 'cleanupLog',
        data: { message: t('followingRequiresNav'), level: 'info' }
      }).catch(function() {});
      sendResponse({ started: true, needsNavigation: true });
      Promise.resolve().then(function() { forcePageLoad(followingUrl); });
      return;
    }

    if (types.indexOf('originalTweets') >= 0 && pageType !== 'originalTweets') {
      const url = getOriginalTweetsPageURL();
      console.log('[X Eraser] originalTweets requires profile page, current:', pageType);
      chrome.runtime.sendMessage({
        type: 'cleanupLog',
        data: { message: t('originalTweetsRequiresNav'), level: 'info' }
      }).catch(function() {});
      sendResponse({ started: true, needsNavigation: true });
      Promise.resolve().then(function() { forcePageLoad(url); });
      return;
    }

    if (types.indexOf('replies') >= 0 && pageType !== 'tweetTimeline') {
      const url = getRepliesPageURL();
      console.log('[X Eraser] replies requires /with_replies page, current:', pageType);
      chrome.runtime.sendMessage({
        type: 'cleanupLog',
        data: { message: t('repliesRequiresNav'), level: 'info' }
      }).catch(function() {});
      sendResponse({ started: true, needsNavigation: true });
      Promise.resolve().then(function() { forcePageLoad(url); });
      return;
    }

    if (types.indexOf('retweets') >= 0 && pageType !== 'tweetTimeline') {
      const url = getRetweetsPageURL();
      console.log('[X Eraser] retweets requires /with_replies page, current:', pageType);
      chrome.runtime.sendMessage({
        type: 'cleanupLog',
        data: { message: t('retweetsRequiresNav'), level: 'info' }
      }).catch(function() {});
      sendResponse({ started: true, needsNavigation: true });
      Promise.resolve().then(function() { forcePageLoad(url); });
      return;
    }

    // 从 storage 读最新配置（不再依赖模块级 remoteConfig）
    const remoteConfig = await getRemoteConfig();
    injector.setConfig(remoteConfig);
    injector.setCurrentUsername(getCurrentUsername());
    // M++ 修复（2026-06-18 tweets-bug-6 用户再次反馈"页面没加载完就干完了"）：
    //   原版 forcePageLoad 跳页后，content script 重新注入，立即调 startCleanup
    //   → page 资源还没下载完 + X React hydration 没开始 → waitForContentStable 0 article
    //   修法：必须等 document.readyState === 'complete'（window.load 触发）才调 startCleanup
    //         waitForContentStable 内部会主动 scroll 触发 X 渲染 + 等 article 稳定
    if (document.readyState === 'complete') {
      injector.startCleanup(message.options);
    } else {
      window.addEventListener('load', function() {
        injector.startCleanup(message.options);
      }, { once: true });
    }
    sendResponse({ started: true });
  }

  // 消息路由总入口（content 这边的 onMessage）
  //   收到的消息分两类:
  //     A. sidepanel / background 转发过来的命令（message.target === 'content'）
  //        - getStatus: 综合状态查询（sidepanel 启动时 + 3s 轮询用）
  //        - ping: 心跳检测（看 content 是否还活着）
  //        - startCleanup / pauseCleanup / resumeCleanup / stopCleanup: 控制 injector
  //        - getCleanupStatus: 查 cleanup 当前进度
  //        - setFilters: 设置日期/关键字过滤器
  //     B. background 转发过来但非 target=content 的消息（如 background / refreshConfig）
  //        → 忽略，让 background 自己处理
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

  // 主动推送状态变化给 sidepanel（被 3s setInterval 调用）
  // 与 sidepanel 主动调 getStatus 的区别: 这个是「状态变化才发」，减少无意义消息
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
    notifyStatus();
  } else {
    window.addEventListener('load', notifyStatus, { once: true });
  }
})();
