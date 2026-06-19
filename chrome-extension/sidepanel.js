// X-Eraser Side Panel Script - i18n enabled
(function() {
  'use strict';

  var state = {
    isX: false,
    // null = 尚未从 content 拿到确认值（让 UI 显示"检测中"，不预先报"未登录"）
    isLoggedIn: null,
    isRunning: false,
    isPaused: false,
    processedItems: 0,
    statusHideTimer: null,
    totalItems: 0,
    // 登录态持续 8s 卡在"检测中"时弹出"请刷新 X 页面"提示
    // 触发条件：state.isX && state.checkingLogin 进入 8s 后仍未变
    // 清除条件：state.checkingLogin 翻转为 false
    refreshHintTimer: null
  };

  // 每日额度配置
  var FREE_LIMIT_PER_DAY = 50;

  // 单飞串行链：所有 dailyUsage 读写都排队走这条 Promise 链
  // 修复并发的 read-modify-write 竞态——cleanupProgress 回调高频触发时旧实现会丢计数
  var _dailyUsageChain = Promise.resolve();

  // 读取今日已使用额度
  function getDailyUsage(callback) {
    _dailyUsageChain = _dailyUsageChain.then(function() {
      return new Promise(function(resolve) {
        chrome.storage.local.get(['dailyUsage'], function(result) {
          var data = result.dailyUsage;
          var today = new Date().toDateString();
          if (!data || data.date !== today) {
            // 新的一天，重置
            data = { date: today, used: 0 };
            chrome.storage.local.set({ dailyUsage: data }, function() { resolve(data.used || 0); });
          } else {
            resolve(data.used || 0);
          }
        });
      });
    }).then(function(used) {
      if (callback) callback(used);
      return used;
    }).catch(function(err) {
      // 单步失败不能毒化整条链，否则后续 increment 会永远排队
      console.warn('[X-Eraser] getDailyUsage chain step failed:', err && err.message);
      if (callback) callback(0);
      return 0;
    });
    return _dailyUsageChain;
  }

  // 增加今日使用额度
  function incrementDailyUsage(count, callback) {
    _dailyUsageChain = _dailyUsageChain.then(function() {
      return new Promise(function(resolve) {
        chrome.storage.local.get(['dailyUsage'], function(result) {
          var today = new Date().toDateString();
          var data = result.dailyUsage;
          if (!data || data.date !== today) {
            data = { date: today, used: 0 };
          }
          data.used = (data.used || 0) + count;
          chrome.storage.local.set({ dailyUsage: data }, function() {
            // callback 在 resolve 之前触发，保证调用方拿到的是写后值
            if (callback) callback(data.used);
            resolve(data.used);
          });
        });
      });
    }).catch(function(err) {
      console.warn('[X-Eraser] incrementDailyUsage chain step failed:', err && err.message);
      if (callback) callback(null);
    });
    return _dailyUsageChain;
  }

  var els = {};
  var i18n = null;

  // 短引用
  function t(key, vars) {
    if (i18n && i18n.t) return i18n.t(key, vars);
    return key;
  }

  function init() {
    // 等待 i18n 加载完成
    if (window.XEraseri18n) {
      i18n = window.XEraseri18n;
    } else {
      // 不靠经验猜 50ms：用微任务延后到下一个 task 头（script 执行完）
      //   i18n.js 是 <script src=> 同步加载，正常情况下 window.XEraseri18n 一定已就绪
      //   这里只是防御性 retry，setTimeout(0) 而非经验 50ms
      setTimeout(init, 0);
      return;
    }

    // 第一步：先加载用户保存的语言偏好，再继续初始化
    // 优先级：本地存储 > 浏览器语言 > 英文兜底
    chrome.storage.local.get(['preferredLang'], function(result) {
      if (result.preferredLang && i18n.setLanguage) {
        i18n.setLanguage(result.preferredLang);
        console.log('[X-Eraser] Loaded preferred language:', result.preferredLang);
      } else {
        console.log('[X-Eraser] Using detected language:', i18n.getLanguage());
      }
      // 语言确定后，才继续初始化 UI
      afterLangLoaded();
    });
  }

  function afterLangLoaded() {
    els.statusDot = document.getElementById('status-x-dot');
    els.statusText = document.getElementById('status-x-text');
    els.loginDot = document.getElementById('status-login-dot');
    els.loginText = document.getElementById('status-login-text');
    els.loginHint = document.getElementById('status-login-hint');
    els.openSection = document.getElementById('open-x-section');
    els.loginSection = document.getElementById('login-section');
    els.optionsSection = document.getElementById('options-section');
    els.btnOpenX = document.getElementById('btn-open-x');
    els.btnLogin = document.getElementById('btn-login');
    els.btnStart = document.getElementById('btn-start');
    els.btnPause = document.getElementById('btn-pause');
    els.btnStop = document.getElementById('btn-stop');
    els.controlButtons = document.getElementById('control-buttons');
    els.runningButtons = document.getElementById('running-buttons');
    els.progressCard = document.getElementById('progress-card');
    els.progressBar = document.getElementById('progress-bar');
    els.progressCurrent = document.getElementById('progress-current');
    els.progressTotal = document.getElementById('progress-total');
    els.progressText = document.getElementById('progress-text');
    els.progressSpinner = document.getElementById('progress-spinner');
    els.logArea = document.getElementById('log-area');
    els.btnRefresh = document.getElementById('btn-refresh');
    els.refreshIcon = document.getElementById('refresh-icon');
    els.btnCopyDiag = document.getElementById('btn-copy-diag');
    els.btnLang = document.getElementById('btn-lang');
    els.langFlag = document.getElementById('lang-flag');
    els.langDropdown = document.getElementById('lang-dropdown');

    // 6 个顶级 checkbox DOM 引用（3 个推文子类型：original-tweets / replies / retweets）
    els.optOriginalTweets = document.getElementById('opt-original-tweets');
    els.optReplies = document.getElementById('opt-replies');
    els.optRetweets = document.getElementById('opt-retweets');

    updateLangFlag();   // 先设置国旗
    applyI18n();        // 再应用所有翻译（不会闪）
    bindEvents();
    // Original Tweets 默认 checked → 初始化时同步展开备份提示
    //   必须在 bindEvents 之后调，确保 els.optOriginalTweets 已就绪
    syncBackupTip();
    checkXTabStatus();

    // 监听 tab 切换事件，切换时重新检查
    if (chrome.tabs && chrome.tabs.onActivated) {
      chrome.tabs.onActivated.addListener(function() {
        checkXTabStatus();
      });
    }

    // 监听 window focus 变化
    if (chrome.windows && chrome.windows.onFocusChanged) {
      chrome.windows.onFocusChanged.addListener(function(windowId) {
        if (windowId !== chrome.windows.WINDOW_ID_NONE) {
          checkXTabStatus();
        }
      });
    }

    // 页面可见性变化时（用户切换到侧边栏）重新检查
    if (typeof document !== 'undefined' && document.addEventListener) {
      document.addEventListener('visibilitychange', function() {
        if (!document.hidden) {
          checkXTabStatus();
        }
      });
    }

    // 不再有备用轮询：登录态完全由 content.js 的 sticky 缓存 + statusUpdate 广播驱动
    // （旧的 10s silent 轮询每 10s 重检一次，会把"检测中→已确认"的瞬态错位带回来，反而误报）
  }

  // 同步 Original Tweets 备份提示的展开状态
  //   勾上 → 显示黄色警告条；取消 → 收起
  //   设计：完全跟随 checkbox 当前状态，不引入额外持久化（用户取消后刷新，HTML 默认 checked
  //   决定 tip 初始可见性，与用户期待一致）
  function syncBackupTip() {
    if (!els.optOriginalTweets) return;
    var item = els.optOriginalTweets.closest('.option-item');
    if (!item) return;
    if (els.optOriginalTweets.checked) {
      item.classList.add('show-backup-tip');
    } else {
      item.classList.remove('show-backup-tip');
    }
  }

  // 应用翻译到所有 UI 元素
  function applyI18n() {
    // 静态文本
    if (els.btnOpenX) els.btnOpenX.textContent = t('openXWebsite');
    if (els.btnLogin) els.btnLogin.textContent = t('pleaseLogin');
    if (els.btnStart) els.btnStart.textContent = t('startCleanup');
    if (els.btnPause) els.btnPause.textContent = t('pause');
    if (els.btnStop) els.btnStop.textContent = t('stop');
    if (els.statusText) els.statusText.textContent = t('checking');
    if (els.loginText) els.loginText.textContent = t('checking');
    if (els.progressText) els.progressText.textContent = t('processing');

    // 标签
    var labels = document.querySelectorAll('[data-i18n]');
    for (var i = 0; i < labels.length; i++) {
      var key = labels[i].getAttribute('data-i18n');
      // backup-tip 里的 <a data-i18n="archiveLinkText"> 由下面 data-i18n-html 块处理
      // （整段会一起 innerHTML 覆盖），这里跳过避免 textContent 把 <a> 标签冲掉
      if (labels[i].closest('[data-i18n-html]')) continue;
      labels[i].textContent = t(key);
    }

    // data-i18n-html: 整段需要 innerHTML 注入（用于含 <a> 的富文本，目前只有 backup-tip）
    //   {link} 占位符会被替换为带 i18n 链接文字的 <a> 标签
    var htmlLabels = document.querySelectorAll('[data-i18n-html]');
    for (var m = 0; m < htmlLabels.length; m++) {
      var hkey = htmlLabels[m].getAttribute('data-i18n-html');
      var linkHTML =
        '<a href="https://help.x.com/en/managing-your-account/how-to-download-your-x-archive" ' +
        'target="_blank" rel="noopener">' + t('archiveLinkText') + '</a>';
      htmlLabels[m].innerHTML = t(hkey, { link: linkHTML });
    }

    // placeholder
    var placeholders = document.querySelectorAll('[data-i18n-placeholder]');
    for (var j = 0; j < placeholders.length; j++) {
      var pkey = placeholders[j].getAttribute('data-i18n-placeholder');
      placeholders[j].setAttribute('placeholder', t(pkey));
    }

    // trust badge
    var trustTitle = document.querySelector('.trust-badge-title');
    if (trustTitle) trustTitle.textContent = t('trustTitle');
    var trustText = document.querySelector('.trust-badge-text');
    if (trustText) trustText.textContent = t('trustText');
  }

  function getPatterns() {
    return ['*://x.com/*', '*://twitter.com/*'];
  }

  function bindEvents() {
    if (els.btnOpenX) els.btnOpenX.onclick = openXTab;
    if (els.btnLogin) {
      els.btnLogin.onclick = function() {
        var patterns = getPatterns();
        chrome.tabs.query({url: patterns}, function(tabs) {
          if (tabs && tabs.length > 0) {
            chrome.tabs.update(tabs[0].id, {active: true});
          }
        });
      };
    }
    if (els.btnStart) els.btnStart.onclick = startCleanup;
    if (els.btnPause) els.btnPause.onclick = pauseCleanup;
    if (els.btnStop) els.btnStop.onclick = stopCleanup;
    if (els.btnRefresh) els.btnRefresh.onclick = refreshConfig;
    if (els.btnLang) els.btnLang.onclick = toggleLangDropdown;
    if (els.btnCopyDiag) els.btnCopyDiag.onclick = copyDiagnosticLog;

    // Original Tweets 备份提示联动：
    //   勾上 → .option-item 加 .show-backup-tip → CSS 把内嵌 .backup-tip 从 display:none 切到 display:flex
    //   取消 → 移除 class → 收起
    if (els.optOriginalTweets) {
      els.optOriginalTweets.addEventListener('change', syncBackupTip);
    }

    // Tweets 勾选状态联动：已删除（2026-06-18 重构后 3 个 type 都是顶级 checkbox，无子选项联动）

    // 点击其他地方关闭下拉菜单
    document.addEventListener('click', function(e) {
      if (els.langDropdown && !els.langDropdown.contains(e.target) && e.target !== els.btnLang && !els.btnLang.contains(e.target)) {
        closeLangDropdown();
      }
    });

    chrome.runtime.onMessage.addListener(function(msg) {
      if (msg.type === 'cleanupProgress') {
        var newCount = msg.data.count;
        var prevCount = state.processedItems;
        state.processedItems = newCount;
        // 实时累加每日额度
        if (newCount > prevCount) {
          var delta = newCount - prevCount;
          incrementDailyUsage(delta, function(totalUsed) {
            // 标记已达上限，等清理完成时弹窗
            if (totalUsed >= FREE_LIMIT_PER_DAY) {
              state.limitReached = true;
            }
          });
        }
        updateProgress();
        // M++ 修复（2026-06-19 tweets-bug-8）：实时更新当前 type 的 option-count 数字
        //   之前只在 cleanupTypeComplete 时更新（type 跑完才看到数字，体验差）
        //   现在每收到一次 progress 都立即更新当前 type 的数字
        if (state.currentType) {
          setOptionCount(state.currentType, newCount);
        }
      } else if (msg.type === 'cleanupLog') {
        addLog(msg.data.message, msg.data.level);
      } else if (msg.type === 'cleanupComplete') {
        onCleanupComplete();
      } else if (msg.type === 'cleanupError') {
        // 2026-06-18 修复：之前没监听 → 关键错误（如 "No selectors for originalTweets"）用户看不到
        addLog(msg.data.message, 'error');
      } else if (msg.type === 'cleanupPaused') {
        onPaused();
      } else if (msg.type === 'cleanupResumed') {
        onResumed();
      } else if (msg.type === 'cleanupStopped') {
        onStopped();
      } else if (msg.type === 'cleanupAborted') {
        // retry limit 触发 / cleanup 主动放弃（content.js 发的消息）
        // 行为等同 onStopped，但语义独立（区别于用户主动 Stop）
        onStopped();
      } else if (msg.type === 'cleanupTypeStart') {
        // M++ 修复（2026-06-19 tweets-bug-8）：记下当前处理的 type
        //   之前没存 → cleanupProgress 收时不知道更新哪个 option-count
        //   UI 数字只在 cleanupTypeComplete 时才更新（实时性差）
        //   现在存 state.currentType，cleanupProgress 收时实时更新该 type 的数字
        state.currentType = msg.data.type;
        setOptionState(msg.data.type, 'processing');
      } else if (msg.type === 'cleanupTypeComplete') {
        state.currentType = null;
        setOptionState(msg.data.type, 'done', msg.data.processed);
      } else if (msg.type === 'statusUpdate') {
        // content.js 主动推送状态变化（如从未登录 → 登录后）
        // 修复前 content 只在 page load 时 notifyStatus 一次，
        //  X SPA 登录 URL 变但不触发 load → sidepanel 永远显示 Not logged in
        // 修复后 content 每 3s 轮询，状态变化时广播
        if (msg.data) {
          if (typeof msg.data.isX === 'boolean' && msg.data.isX !== state.isX) {
            state.isX = msg.data.isX;
          }
          if (typeof msg.data.isLoggedIn === 'boolean' && msg.data.isLoggedIn !== state.isLoggedIn) {
            state.isLoggedIn = msg.data.isLoggedIn;
            // 状态已知时直接退出"检测中"（yellow pulsing）状态
            state.checkingLogin = false;
            updateUI();
          }
        }
      }
    });
  }

  // 更新语言按钮的国旗
  function updateLangFlag() {
    if (!els.langFlag || !i18n) return;
    var current = i18n.getLanguage();
    var meta = i18n.getLangMeta(current);
    if (meta && meta.flag) {
      els.langFlag.textContent = meta.flag;
    }
  }

  // 切换语言下拉菜单
  function toggleLangDropdown() {
    if (!els.langDropdown) return;
    if (els.langDropdown.classList.contains('open')) {
      closeLangDropdown();
    } else {
      openLangDropdown();
    }
  }

  function openLangDropdown() {
    if (!els.langDropdown || !i18n) return;
    var langs = i18n.getSupportedLanguages();
    var current = i18n.getLanguage();
    var html = '';
    for (var i = 0; i < langs.length; i++) {
      var lang = langs[i];
      var meta = i18n.getLangMeta(lang);
      var isActive = lang === current;
      html += '<div class="lang-option' + (isActive ? ' active' : '') + '" data-lang="' + lang + '">';
      html += '<span class="flag">' + meta.flag + '</span>';
      html += '<span class="name">' + meta.name + '</span>';
      html += '<span class="check">✓</span>';
      html += '</div>';
    }
    els.langDropdown.innerHTML = html;
    els.langDropdown.classList.add('open');

    // 绑定每个选项的点击
    var options = els.langDropdown.querySelectorAll('.lang-option');
    for (var j = 0; j < options.length; j++) {
      options[j].onclick = function() {
        var lang = this.getAttribute('data-lang');
        switchLanguage(lang);
      };
    }
  }

  function closeLangDropdown() {
    if (els.langDropdown) els.langDropdown.classList.remove('open');
  }

  // 切换语言
  function switchLanguage(lang) {
    if (!i18n || !i18n.setLanguage) return;
    i18n.setLanguage(lang);
    // 保存偏好
    chrome.storage.local.set({preferredLang: lang});
    // 更新 UI
    updateLangFlag();
    applyI18n();
    updateUI();
    closeLangDropdown();
  }

  function openXTab() {
    var patterns = getPatterns();
    chrome.tabs.query({url: patterns}, function(tabs) {
      if (tabs && tabs.length > 0) {
        chrome.tabs.update(tabs[0].id, {active: true});
      } else {
        chrome.tabs.create({url: 'https://x.com'});
      }
    });
  }

  function refreshConfig() {
    if (els.refreshIcon) {
      els.refreshIcon.className = 'refresh-icon spinning';
    }

    addLog(t('refreshingConfig'), 'info');

    // 顺带刷新所有 X tab，让 content script 有机会重新注入
    //   场景：先打开 x.com 再装/重载扩展 → content script 不会自动注入 → 必须整页刷新
    //   reload 是 fire-and-forget；content.js 重新加载后会主动推 statusUpdate，UI 自动恢复
    //   与 config refresh 并行，不互相阻塞
    var patterns = getPatterns();
    chrome.tabs.query({url: patterns}, function(tabs) {
      if (tabs && tabs.length > 0) {
        tabs.forEach(function(tab) { chrome.tabs.reload(tab.id); });
      }
    });

    chrome.runtime.sendMessage({target: 'refreshConfig'}, function(resp) {
      checkXTabStatus().then(function() {
        if (resp && resp.config) {
          // 不带任何状态字段：
          //   X 状态虽然在 reload 期间相对稳定，但和 login 一样都是侧栏实时态信息，
          //   日志记录"刚才发生了什么"就够，让 UI badge 作为状态的唯一实时源
          addLog(t('configRefreshed'), 'success');
        } else {
          addLog(t('configRefreshFailed'), 'error');
        }

        if (els.refreshIcon) {
          els.refreshIcon.className = 'refresh-icon';
        }
      });
    });
  }

  // 登录态检测（简化版）：
  // - 完全由 content.js 维护 sticky 缓存（cachedIsLoggedIn）
  // - 侧栏只做一次"问 content"的动作 + 处理 null（仍检测中）
  // - 删除旧的 10s retry 循环和 silent 轮询：完全多余，反而会因偶发抓空而误判
  // - content 的 statusUpdate 广播才是登录态变化的唯一推送通道
  function checkXTabStatus(silent) {
    return new Promise(function(resolve) {
      var patterns = getPatterns();
      chrome.tabs.query({url: patterns}, function(tabs) {
        if (tabs && tabs.length > 0) {
          var tab = tabs[0];
          if (!state.isX) {
            state.isX = true;
            if (!silent) {
              state.checkingLogin = true;
              updateUI();
            }
          }
          chrome.tabs.sendMessage(tab.id, {target: 'content', type: 'getStatus'}, function(resp) {
            if (chrome.runtime.lastError || !resp) {
              // content 还没就绪：保持 null（"检测中"），不预设任何值
              if (!silent && !state.checkingLogin) {
                state.checkingLogin = true;
                updateUI();
              }
              resolve();
              return;
            }
            applyStatusFromContent(resp, silent);
            resolve();
          });
        } else {
          // 没有 X tab：明确未登录
          var changed = state.isX !== false || state.isLoggedIn !== false || state.checkingLogin;
          state.isX = false;
          state.isLoggedIn = false;
          state.checkingLogin = false;
          if (changed && !silent) updateUI();
          resolve();
        }
      });
    });
  }

  // 把 content 返回的 status 应用到 state（统一处理，避免重复逻辑）
  // silent=true 时只在值真正变化时更新 state（不刷新 UI）
  function applyStatusFromContent(resp, silent) {
    if (typeof resp.isX === 'boolean' && resp.isX !== state.isX) {
      state.isX = resp.isX;
    }

    var loggedIn = resp.isLoggedIn;  // 可能是 true / false / null
    var wasChecking = state.checkingLogin;

    if (typeof loggedIn === 'boolean') {
      if (loggedIn !== state.isLoggedIn) state.isLoggedIn = loggedIn;
      state.checkingLogin = false;
    } else if (loggedIn === null) {
      // content 仍在初次检测：保持侧栏"检测中"
      if (state.isLoggedIn !== null) state.isLoggedIn = null;
      state.checkingLogin = true;
    }

    if (!silent && (state.checkingLogin !== wasChecking
        || (typeof loggedIn === 'boolean' && loggedIn !== wasChecking))) {
      updateUI();
    }
  }

  function activateXTab(callback) {
    var patterns = getPatterns();
    chrome.tabs.query({url: patterns}, function(tabs) {
      if (tabs && tabs.length > 0) {
        var xTab = tabs[0];
        chrome.tabs.update(xTab.id, {active: true});
        if (xTab.windowId) {
          chrome.windows.update(xTab.windowId, {focused: true});
        }
        if (callback) callback(xTab);
      } else {
        if (callback) callback(null);
      }
    });
  }

  function updateUI() {
    // 只在状态变化时更新 DOM，避免不必要的重排
    var newXClass = 'status-dot ' + (state.isX ? 'green' : 'red');
    var newXText = state.isX ? t('xWebsiteDetected') : t('pleaseOpenX');
    var newXTextClass = 'status-text ' + (state.isX ? 'success' : 'error');

    if (els.statusDot && els.statusDot.className !== newXClass) {
      els.statusDot.className = newXClass;
    }
    if (els.statusText) {
      if (els.statusText.textContent !== newXText) els.statusText.textContent = newXText;
      if (els.statusText.className !== newXTextClass) els.statusText.className = newXTextClass;
    }

    var newLClass, newLText, newLTextClass;
    if (state.checkingLogin || state.isLoggedIn === null) {
      // 检测中：黄色脉动
      newLClass = 'status-dot yellow pulsing';
      newLText = t('checkingLogin');
      newLTextClass = 'status-text checking';
    } else {
      newLClass = 'status-dot ' + (state.isLoggedIn ? 'green' : 'red');
      newLText = state.isLoggedIn ? t('loggedIn') : t('notLoggedIn');
      newLTextClass = 'status-text ' + (state.isLoggedIn ? 'success' : 'error');
    }

    if (els.loginDot && els.loginDot.className !== newLClass) {
      els.loginDot.className = newLClass;
    }
    if (els.loginText) {
      if (els.loginText.textContent !== newLText) els.loginText.textContent = newLText;
      if (els.loginText.className !== newLTextClass) els.loginText.className = newLTextClass;
    }

    // 登录态卡"检测中"8s 后弹刷新提示（content script 未注入的兜底引导）
    // 一次性 setTimeout：进入检测中起 8s 触发一次；状态翻转就清掉
    var shouldHint = state.isX && state.checkingLogin;
    if (shouldHint && !state.refreshHintTimer) {
      state.refreshHintTimer = setTimeout(function() {
        state.refreshHintTimer = null;
        // 8s 后还在"检测中"才真显示；中途已翻就不显示
        if (state.isX && state.checkingLogin && els.loginHint) {
          els.loginHint.textContent = t('pleaseRefreshXPage');
          els.loginHint.style.display = 'block';
        }
      }, 8000);
    } else if (!shouldHint && state.refreshHintTimer) {
      clearTimeout(state.refreshHintTimer);
      state.refreshHintTimer = null;
    }
    // 状态从检测中翻转过来：隐藏提示（清除显示由 status-card 收回负责，hint 跟着清）
    if (!state.checkingLogin && els.loginHint) {
      els.loginHint.style.display = 'none';
    }

    var showOpen = !state.isX;
    var showLogin = state.isX && !state.isLoggedIn;
    var showOptions = state.isX && state.isLoggedIn;

    // 只在 display 真的需要变化时才更新
    if (els.openSection) {
      var openDisplay = showOpen ? 'block' : 'none';
      if (els.openSection.style.display !== openDisplay) els.openSection.style.display = openDisplay;
    }
    if (els.loginSection) {
      var loginDisplay = showLogin ? 'block' : 'none';
      if (els.loginSection.style.display !== loginDisplay) els.loginSection.style.display = loginDisplay;
    }
    if (els.optionsSection) {
      var optionsDisplay = showOptions ? 'block' : 'none';
      if (els.optionsSection.style.display !== optionsDisplay) els.optionsSection.style.display = optionsDisplay;
    }

    // 状态一切正常时，延迟 1s 自动收起 status-card（节省可视空间）
    // 异常状态（无 X tab / 未登录 / 检测中）立即重新展开
    var statusCard = document.getElementById('status-card');
    if (statusCard) {
      var allOk = state.isX && state.isLoggedIn === true && !state.checkingLogin;
      if (allOk) {
        if (!state.statusHideTimer) {
          state.statusHideTimer = setTimeout(function() {
            statusCard.classList.add('hidden');
            state.statusHideTimer = null;
          }, 1000);
        }
      } else {
        if (state.statusHideTimer) {
          clearTimeout(state.statusHideTimer);
          state.statusHideTimer = null;
        }
        statusCard.classList.remove('hidden');
      }
    }
  }

  function updateProgress() {
    if (els.progressBar) {
      var pct = state.totalItems > 0 ? Math.round((state.processedItems / state.totalItems) * 100) : 0;
      els.progressBar.style.width = pct + '%';
    }
    if (els.progressCurrent) els.progressCurrent.textContent = state.processedItems;
    if (els.progressTotal) els.progressTotal.textContent = state.totalItems;
  }

  // 设置单个 option-count 的状态（idle / pending / processing / done）
  // 状态语义：
  //   idle      → "0"（默认）
  //   pending   → 灰 spinner（Start Cleanup 后等待处理）
  //   processing → 蓝 spinner + 高亮（正在处理该项）
  //   done      → 显示数字（该项处理完毕的本次条数）
  //
  // M++ 修复（2026-06-19 tweets-bug-8）：type → DOM id 映射
  //   根因：injector 发的 type 是 camelCase（'originalTweets'），HTML id 是 kebab-case（'opt-original-tweets'）
  //         getElementById('opt-' + 'originalTweets') 找不到 'opt-originalTweets' → return null → 不更新
  //   为什么 likes/bookmarks/following 之前能显示：因为 type 跟 HTML id 后缀一致（'likes' → 'opt-likes'）
  //   现在用 TYPE_ID_MAP 统一映射，所有 type 都能正确显示
  var TYPE_ID_MAP = {
    'originalTweets': 'original-tweets',
    'replies': 'replies',
    'retweets': 'retweets',
    'likes': 'likes',
    'bookmarks': 'bookmarks',
    'following': 'following',
    'messages': 'messages'
  };
  function resolveOptionId(type) {
    var id = TYPE_ID_MAP[type] || type;
    return 'opt-' + id;
  }
  function setOptionState(type, state, count) {
    var checkbox = document.getElementById(resolveOptionId(type));
    if (!checkbox) return;
    var item = checkbox.closest('.option-item');
    if (!item) return;
    var countEl = item.querySelector('.option-count');
    if (!countEl) return;

    item.classList.remove('pending', 'processing', 'done');

    if (state === 'pending' || state === 'processing') {
      item.classList.add(state);
      countEl.innerHTML = '<span class="spinner"></span>';
    } else if (state === 'done') {
      item.classList.add('done');
      var n = (typeof count === 'number') ? count : 0;
      countEl.textContent = n > 0 ? n.toLocaleString() : '0';
    } else {
      // idle
      countEl.textContent = '0';
    }
  }

  // M++ 修复（2026-06-19 tweets-bug-8）：实时更新 option-count 数字（不重置 spinner 状态）
  //   区别于 setOptionState(type, 'processing')：那个会重置成 spinner
  //   这个保持 processing class，只更新数字 → 用户能看到实时处理的条数
  function setOptionCount(type, count) {
    var checkbox = document.getElementById(resolveOptionId(type));
    if (!checkbox) return;
    var item = checkbox.closest('.option-item');
    if (!item) return;
    var countEl = item.querySelector('.option-count');
    if (!countEl) return;
    var n = (typeof count === 'number') ? count : 0;
    countEl.textContent = n > 0 ? n.toLocaleString() : '0';
  }

  // 重置所有 option-count 到 idle 状态
  function resetAllOptionStates() {
    // M++ 修复（2026-06-19 tweets-bug-8）：用正确的 injector type key
    //   之前用 'tweets'，但 injector 实际发 'originalTweets' + 'replies' + 'retweets' 三个独立 type
    //   'tweets' 不在 TYPE_ID_MAP 里 → resolveOptionId('tweets') → 'opt-tweets' → 找不到 → reset 失败
    ['originalTweets', 'replies', 'retweets', 'likes', 'bookmarks', 'following', 'messages'].forEach(function(type) {
      setOptionState(type, 'idle');
    });
  }

  function addLog(message, level) {
    if (!els.logArea) return;
    if (!level) level = 'info';

    // 如果 progressCard 隐藏且当前没在清理中，临时显示
    if (els.progressCard && !state.isRunning && !state.isPaused) {
      els.progressCard.className = 'progress-card active';
      if (els.progressText) els.progressText.textContent = t('activity');
      if (els.progressSpinner) els.progressSpinner.className = 'progress-spinner paused';
    }

    var entry = document.createElement('div');
    entry.className = 'log-entry ' + level;

    var time = document.createElement('span');
    time.className = 'log-time';
    var now = new Date();
    time.textContent = (now.getHours() < 10 ? '0' : '') + now.getHours() + ':' +
      (now.getMinutes() < 10 ? '0' : '') + now.getMinutes() + ':' +
      (now.getSeconds() < 10 ? '0' : '') + now.getSeconds();

    entry.appendChild(time);
    entry.appendChild(document.createTextNode(message));
    els.logArea.appendChild(entry);
    els.logArea.scrollTop = els.logArea.scrollHeight;
  }

  // 一键复制诊断日志（开发者排查用）：包含日志面板 + 当前 URL + 扩展版本
  function copyDiagnosticLog() {
    try {
      var logEntries = els.logArea ? Array.from(els.logArea.querySelectorAll('.log-entry')) : [];
      var logText = logEntries.map(function(entry) {
        var time = entry.querySelector('.log-time');
        var text = entry.textContent || '';
        return (time ? time.textContent : '') + ' ' + text;
      }).join('\n');

      var diagText = '=== X-Eraser Diagnostic Log ===\n' +
        'Timestamp: ' + new Date().toISOString() + '\n' +
        'X website: ' + (state.isX ? 'yes' : 'no') + '\n' +
        'Logged in: ' + (state.isLoggedIn ? 'yes' : 'no') + '\n' +
        'Extension: ' + (chrome.runtime.getManifest().version) + '\n' +
        'User Agent: ' + navigator.userAgent + '\n' +
        '\n=== Activity Log ===\n' +
        (logText || '(empty)');

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(diagText).then(function() {
          addLog(t('copiedToClipboard'), 'success');
        }).catch(function(err) {
          fallbackCopy(diagText, err.message);
        });
      } else {
        fallbackCopy(diagText, 'Clipboard API unavailable');
      }
    } catch (e) {
      addLog(t('copyFailed', {error: e.message}), 'error');
    }
  }

  function fallbackCopy(text, reason) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      addLog(t('copiedToClipboard'), 'success');
    } catch (e) {
      addLog(t('copyFailed', {error: reason || e.message}), 'error');
    }
  }

  // Tweets 勾选状态联动：勾选时显示子选项区块，并联动调整周边分割线
  // 视觉分组：Tweets + 子项 是一个组，其他 3 项是另一个组，分割线在组与组之间
  // Tweets 子选项联动函数已删除（2026-06-18 重构：3 个 type 全部为顶级 checkbox）

  // 收集 Tweets 子选项函数已删除（2026-06-18 重构：tweets 拆为 3 个独立顶级 type，不再有子选项）

  function startCleanup() {
    var options = [];
    // 6 type 完全独立：原 tweets 拆为 originalTweets / replies / retweets
    var checkboxIds = ['opt-original-tweets', 'opt-replies', 'opt-retweets', 'opt-likes', 'opt-bookmarks', 'opt-following'];
    var optionNames = ['originalTweets', 'replies', 'retweets', 'likes', 'bookmarks', 'following'];
    for (var i = 0; i < checkboxIds.length; i++) {
      var el = document.getElementById(checkboxIds[i]);
      if (el && el.checked) {
        options.push(optionNames[i]);
      }
    }
    if (options.length === 0) {
      // 用进度卡片显示警告，不打断用户
      if (els.progressCard) els.progressCard.className = 'progress-card active';
      if (els.progressText) els.progressText.textContent = t('activity');
      if (els.progressSpinner) els.progressSpinner.className = 'progress-spinner paused';
      addLog(t('noItemsSelected'), 'error');
      setTimeout(function() {
        if (els.progressCard) {
          els.progressCard.scrollIntoView({behavior: 'smooth', block: 'center'});
        }
      }, 50);
      return;
    }

    // 收集过滤条件（likes 生效；其他类型暂未实现，传入但 injector 忽略）
    var fromDateEl = document.getElementById('filter-date-from');
    var toDateEl = document.getElementById('filter-date-to');
    var keywordEl = document.getElementById('filter-keyword');
    var fromDate = (fromDateEl && fromDateEl.value) ? fromDateEl.value : null;
    var toDate = (toDateEl && toDateEl.value) ? toDateEl.value : null;
    var keyword = (keywordEl && keywordEl.value) ? keywordEl.value.trim() : null;
    if (fromDate && toDate && fromDate > toDate) {
      if (els.progressCard) els.progressCard.className = 'progress-card active';
      addLog(t('invalidDateRange'), 'error');
      setTimeout(function() {
        if (els.progressCard) els.progressCard.scrollIntoView({behavior: 'smooth', block: 'center'});
      }, 50);
      return;
    }
    var filters = (fromDate || toDate || keyword) ? { fromDate: fromDate, toDate: toDate, keyword: keyword } : null;

    // 检查会员状态 + 每日额度
    chrome.storage.local.get(['subscription'], function(subResult) {
      var subscription = subResult.subscription;
      var isPremium = !!(subscription && subscription.active === true);

      getDailyUsage(function(used) {
        var remaining, maxPerType;
        if (isPremium) {
          // 会员：无限额（占位，Creem 接入后此分支自动生效）
          remaining = -1;
          maxPerType = 99999;
        } else {
          remaining = FREE_LIMIT_PER_DAY - used;
          if (remaining <= 0) {
            addLog(t('dailyLimitReached', {used: used, limit: FREE_LIMIT_PER_DAY}), 'error');
            showUpgradeModal(used);
            return;
          }
          maxPerType = remaining;
        }

        state.isRunning = true;
        state.isPaused = false;
        state.processedItems = 0;
        state.dailyRemaining = remaining;
        state.totalItems = isPremium ? '∞' : remaining;
        state.cleanupOptions = { types: options, maxPerType: maxPerType, filters: filters };

        // 重置所有 option-count 到 idle（避免上次 done 数字残留），再把选中项设 pending
        resetAllOptionStates();
        options.forEach(function(type) {
          setOptionState(type, 'pending');
        });

        if (els.progressCard) els.progressCard.className = 'progress-card active';
        if (els.logArea) els.logArea.innerHTML = '';
        // 自动滚动到日志框，让用户看到清理进度
        setTimeout(function() {
          if (els.progressCard) {
            els.progressCard.scrollIntoView({behavior: 'smooth', block: 'center'});
          }
        }, 50);
        if (els.progressText) els.progressText.textContent = t('processing');
        if (els.progressSpinner) els.progressSpinner.className = 'progress-spinner';
        if (els.controlButtons) els.controlButtons.style.display = 'none';
        if (els.runningButtons) els.runningButtons.style.display = 'flex';

        addLog(t('usedToday', {used: used, limit: isPremium ? '∞' : FREE_LIMIT_PER_DAY}), 'info');
        addLog(t('startingCleanup'), 'info');

        console.log('[X-Eraser sidepanel] state.cleanupOptions:', state.cleanupOptions);

        // 写 session 后必须 readback 确认（MV3 service worker cold start / 写失败时 session 可能丢）
        function writeSessionAndStart() {
          chrome.storage.session.set({ pendingCleanup: state.cleanupOptions }).then(function() {
            // 写后立即 readback 确认
            return chrome.storage.session.get('pendingCleanup');
          }).then(function(readback) {
            console.log('[X-Eraser sidepanel] session readback:', readback);
            if (!readback || !readback.pendingCleanup) {
              console.warn('[X-Eraser sidepanel] session write/readback failed, retrying...');
              // 重试一次
              return chrome.storage.session.set({ pendingCleanup: state.cleanupOptions }).then(function() {
                return chrome.storage.session.get('pendingCleanup');
              });
            }
            return readback;
          }).then(function(finalReadback) {
            if (!finalReadback || !finalReadback.pendingCleanup) {
              console.error('[X-Eraser sidepanel] session write FAILED after retry, pending cleanup will not work');
              addLog(t('sessionWriteFailed'), 'error');
              // 即便失败也发 startCleanup（让单页流程仍能 work）
            }
            activateXTab(function() {
              chrome.runtime.sendMessage({type: 'startCleanup', options: state.cleanupOptions});
            });
          }).catch(function(err) {
            console.error('[X-Eraser sidepanel] session write error:', err);
            activateXTab(function() {
              chrome.runtime.sendMessage({type: 'startCleanup', options: state.cleanupOptions});
            });
          });
        }

        writeSessionAndStart();
      });
    });
  }

  // 显示升级弹窗
  function showUpgradeModal(used) {
    // 移除已有的
    var existing = document.getElementById('upgrade-modal');
    if (existing) existing.remove();

    var modal = document.createElement('div');
    modal.id = 'upgrade-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:9999;';

    var box = document.createElement('div');
    box.style.cssText = 'background:#18181b;border:1px solid #27272a;border-radius:12px;padding:24px;max-width:320px;width:90%;text-align:center;';

    var icon = document.createElement('div');
    icon.style.cssText = 'font-size:48px;margin-bottom:12px;';
    icon.textContent = '🚀';

    var title = document.createElement('h2');
    title.style.cssText = 'font-size:18px;font-weight:600;color:#f59e0b;margin-bottom:8px;';
    title.textContent = t('dailyLimitReached', {used: used, limit: FREE_LIMIT_PER_DAY});

    var hint = document.createElement('p');
    hint.style.cssText = 'font-size:13px;color:#a1a1aa;margin-bottom:20px;line-height:1.5;white-space:pre-line;';
    hint.textContent = t('dailyLimitReachedHint', {limit: FREE_LIMIT_PER_DAY});

    var btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:8px;';

    var btnLater = document.createElement('button');
    btnLater.style.cssText = 'flex:1;padding:10px;border:1px solid #3f3f46;background:transparent;color:#a1a1aa;border-radius:8px;font-size:13px;cursor:pointer;';
    btnLater.textContent = t('maybeLater');
    btnLater.onclick = function() { modal.remove(); };

    var btnUpgrade = document.createElement('button');
    btnUpgrade.style.cssText = 'flex:1;padding:10px;border:none;background:linear-gradient(135deg,#f59e0b,#d97706);color:#0f0f0f;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;';
    btnUpgrade.textContent = t('upgradeToPremium');
    btnUpgrade.onclick = function() {
      // TODO: 跳转到 Creem 订阅链接
      chrome.tabs.create({url: 'https://creem.io'});
      modal.remove();
    };

    btnRow.appendChild(btnLater);
    btnRow.appendChild(btnUpgrade);

    box.appendChild(icon);
    box.appendChild(title);
    box.appendChild(hint);
    box.appendChild(btnRow);
    modal.appendChild(box);
    document.body.appendChild(modal);
  }

  function pauseCleanup() {
    state.isPaused = true;
    if (els.progressText) els.progressText.textContent = t('paused');
    if (els.progressSpinner) els.progressSpinner.className = 'progress-spinner paused';
    if (els.btnPause) {
      els.btnPause.textContent = t('resume');
      els.btnPause.onclick = resumeCleanup;
    }
    addLog(t('pausedLog'), 'info');
    chrome.runtime.sendMessage({type: 'pauseCleanup'});
  }

  function resumeCleanup() {
    state.isPaused = false;
    if (els.progressText) els.progressText.textContent = t('processing');
    if (els.progressSpinner) els.progressSpinner.className = 'progress-spinner';
    if (els.btnPause) {
      els.btnPause.textContent = t('pause');
      els.btnPause.onclick = pauseCleanup;
    }
    addLog(t('resumedLog'), 'info');
    chrome.runtime.sendMessage({type: 'resumeCleanup'});
  }

  function stopCleanup() {
    // 直接停止（不再用 confirm 打断）
    state.isRunning = false;
    state.isPaused = false;
    if (els.progressText) els.progressText.textContent = t('stopped');
    if (els.progressSpinner) els.progressSpinner.className = 'progress-spinner paused';
    chrome.runtime.sendMessage({type: 'stopCleanup'});
    addLog(t('stoppedByUser', {count: state.processedItems}), 'error');

    if (els.controlButtons) els.controlButtons.style.display = 'flex';
    if (els.runningButtons) els.runningButtons.style.display = 'none';
    if (els.btnPause) {
      els.btnPause.textContent = t('pause');
      els.btnPause.onclick = pauseCleanup;
    }
  }

  function onCleanupComplete() {
    state.isRunning = false;
    state.isPaused = false;
    if (els.progressText) els.progressText.textContent = t('completed');
    if (els.progressSpinner) els.progressSpinner.className = 'progress-spinner paused';
    addLog(t('cleanupCompleted', {count: state.processedItems}), 'success');

    if (els.controlButtons) els.controlButtons.style.display = 'flex';
    if (els.runningButtons) els.runningButtons.style.display = 'none';
    if (els.btnPause) {
      els.btnPause.textContent = t('pause');
      els.btnPause.onclick = pauseCleanup;
    }

    // 达到每日额度后弹升级窗
    if (state.limitReached) {
      getDailyUsage(function(used) {
        addLog(t('dailyLimitReached', {used: used, limit: FREE_LIMIT_PER_DAY}), 'error');
        showUpgradeModal(used);
      });
    }
  }

  function onPaused() {
    if (els.progressText) els.progressText.textContent = t('paused');
    if (els.progressSpinner) els.progressSpinner.className = 'progress-spinner paused';
  }

  function onResumed() {
    if (els.progressText) els.progressText.textContent = t('processing');
    if (els.progressSpinner) els.progressSpinner.className = 'progress-spinner';
  }

  function onStopped() {
    state.isRunning = false;
    state.isPaused = false;
    if (els.progressText) els.progressText.textContent = t('stopped');
    if (els.progressSpinner) els.progressSpinner.className = 'progress-spinner paused';
    // 收到 injector 的 stopped 消息：所有 option-count 回到 idle
    resetAllOptionStates();
    // 修复历史 bug：onStopped 之前没复位按钮显示，导致 cleanupStopped 消息路径下 UI 卡死
    // 现在 stopCleanup 用户主动路径（手动复位）和 onStopped 消息回调路径（这里复位）一致
    if (els.controlButtons) els.controlButtons.style.display = 'flex';
    if (els.runningButtons) els.runningButtons.style.display = 'none';
    if (els.btnPause) {
      els.btnPause.textContent = t('pause');
      els.btnPause.onclick = pauseCleanup;
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
