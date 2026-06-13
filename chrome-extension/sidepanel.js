// X-Eraser Side Panel Script - i18n enabled
(function() {
  'use strict';

  var state = {
    isX: false,
    isLoggedIn: false,
    isRunning: false,
    isPaused: false,
    processedItems: 0,
    totalItems: 0
  };

  // 每日额度配置
  var FREE_LIMIT_PER_DAY = 50;

  // 读取今日已使用额度
  function getDailyUsage(callback) {
    chrome.storage.local.get(['dailyUsage'], function(result) {
      var data = result.dailyUsage;
      var today = new Date().toDateString();
      if (!data || data.date !== today) {
        // 新的一天，重置
        data = { date: today, used: 0 };
        chrome.storage.local.set({ dailyUsage: data });
      }
      callback(data.used || 0);
    });
  }

  // 增加今日使用额度
  function incrementDailyUsage(count, callback) {
    chrome.storage.local.get(['dailyUsage'], function(result) {
      var today = new Date().toDateString();
      var data = result.dailyUsage;
      if (!data || data.date !== today) {
        data = { date: today, used: 0 };
      }
      data.used = (data.used || 0) + count;
      chrome.storage.local.set({ dailyUsage: data }, function() {
        if (callback) callback(data.used);
      });
    });
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
      // 重试
      setTimeout(init, 50);
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

    updateLangFlag();   // 先设置国旗
    applyI18n();        // 再应用所有翻译（不会闪）
    bindEvents();
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

    // 备用轮询：10 秒一次（silent 模式，不显示"检测中"）
    setInterval(function() { checkXTabStatus(true); }, 10000);
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
      labels[i].textContent = t(key);
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
      } else if (msg.type === 'cleanupLog') {
        addLog(msg.data.message, msg.data.level);
      } else if (msg.type === 'cleanupComplete') {
        onCleanupComplete();
      } else if (msg.type === 'cleanupPaused') {
        onPaused();
      } else if (msg.type === 'cleanupResumed') {
        onResumed();
      } else if (msg.type === 'cleanupStopped') {
        onStopped();
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

    chrome.runtime.sendMessage({target: 'refreshConfig'}, function(resp) {
      checkXTabStatus().then(function() {
        if (resp && resp.config) {
          addLog(t('configRefreshed', {
            xStatus: state.isX ? t('statusYes') : t('statusNo'),
            loginStatus: state.isLoggedIn ? t('statusYes') : t('statusNo')
          }), 'success');
        } else {
          addLog(t('configRefreshFailed'), 'error');
        }

        if (els.refreshIcon) {
          els.refreshIcon.className = 'refresh-icon';
        }
      });
    });
  }

  // 登录状态检测相关
  var LOGIN_CHECK_DURATION = 10000;  // 持续检测 10 秒
  var LOGIN_CHECK_INTERVAL = 1000;   // 每次检测间隔 1 秒
  var currentLoginCheck = null;      // 当前正在进行的检测任务

  function checkXTabStatus(silent) {
    return new Promise(function(resolve) {
      var patterns = getPatterns();
      chrome.tabs.query({url: patterns}, function(tabs) {
        if (tabs && tabs.length > 0) {
          var wasX = state.isX;
          state.isX = true;
          if (!wasX) {
            // X.com 状态从 false 变 true：必须显示"检测中"动画
            updateUI();
            setTimeout(function() {
              if (!silent) {
                state.checkingLogin = true;
                updateUI();
              }
              startLoginCheck(tabs[0].id, resolve, silent);
            }, 1000);
          } else {
            // X.com 一直打开：静默检测（不显示"检测中"）
            if (!currentLoginCheck) {
              startLoginCheck(tabs[0].id, resolve, true);
            } else {
              if (resolve) resolve();
            }
          }
        } else {
          cancelLoginCheck();
          state.isX = false;
          state.isLoggedIn = false;
          state.checkingLogin = false;
          updateUI();
          resolve();
        }
      });
    });
  }

  // 取消正在进行的登录检测
  function cancelLoginCheck() {
    if (currentLoginCheck) {
      if (currentLoginCheck.timeoutId) clearTimeout(currentLoginCheck.timeoutId);
      currentLoginCheck.cancelled = true;
      currentLoginCheck = null;
    }
  }

  // 持续 N 秒的登录检测：
  // - 检测到已登录 → 立即停止
  // - 检测到未登录 → 持续到 10 秒（避免单次误判）
  // - 10 秒兜底 → 显示未登录
  // - silent 静默模式：不显示"检测中"动画
  function startLoginCheck(tabId, finalResolve, silent) {
    cancelLoginCheck();  // 取消之前的检测

    var check = {
      tabId: tabId,
      startTime: Date.now(),
      cancelled: false,
      loginConfirmed: false,  // 是否已确认"已登录"
      silent: !!silent        // 静默模式
    };
    currentLoginCheck = check;

    function finish(loggedIn) {
      if (check.cancelled) return;
      check.cancelled = true;
      state.isLoggedIn = loggedIn;
      // 只有在非静默模式下才重置 checkingLogin 和更新 UI
      if (!check.silent) {
        state.checkingLogin = false;
        updateUI();
      }
      currentLoginCheck = null;
      if (finalResolve) finalResolve();
    }

    function tryOnce() {
      if (check.cancelled) return;

      chrome.tabs.sendMessage(tabId, {target: 'content', type: 'getStatus'}, function(resp) {
        if (check.cancelled) return;

        if (!chrome.runtime.lastError && resp && resp.isLoggedIn) {
          // ✅ 检测到"已登录"：立即停止
          finish(true);
          return;
        }

        // sendMessage 失败 或 返回 isLoggedIn=false：继续重试
        var elapsed = Date.now() - check.startTime;
        if (elapsed < LOGIN_CHECK_DURATION) {
          check.timeoutId = setTimeout(tryOnce, LOGIN_CHECK_INTERVAL);
        } else {
          // 10 秒到了，兜底按未登录处理
          finish(false);
        }
      });
    }

    tryOnce();
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
  }

  function updateProgress() {
    if (els.progressBar) {
      var pct = state.totalItems > 0 ? Math.round((state.processedItems / state.totalItems) * 100) : 0;
      els.progressBar.style.width = pct + '%';
    }
    if (els.progressCurrent) els.progressCurrent.textContent = state.processedItems;
    if (els.progressTotal) els.progressTotal.textContent = state.totalItems;
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

  function startCleanup() {
    var options = [];
    var checkboxIds = ['opt-tweets', 'opt-likes', 'opt-bookmarks', 'opt-following', 'opt-messages'];
    var optionNames = ['tweets', 'likes', 'bookmarks', 'following', 'messages'];
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
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
