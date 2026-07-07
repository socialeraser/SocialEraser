// TikTok Eraser Side Panel Script - i18n enabled
// 与 x-project 的差异：
//   - 全局命名空间：window.TikTokEraseri18n
//   - getPatterns: tiktok.com / www.tiktok.com
//   - Storage key 前缀: tiktokDailyUsage / tiktokPreferredLang / tiktokRatingPrompt
//   - TYPE_ID_MAP: videos / reposts / likes / favorites / following
//   - 过滤器新增: minViewCount / maxViewCount
//   - 备份提示: 2 个 .backup-tip（videos + reposts）
//   - 日志前缀: [Eraser for TikTok]
(function() {
  'use strict';

  var state = {
    isTikTok: false,
    isTikTokTab: false,
    isLoggedIn: null,
    isRunning: false,
    isPaused: false,
    processedItems: 0,
    // 跨 type + 跨页累计基线（必须初始化为 0）
    typeStartCumulative: 0,
    // multi-type 已完成 type 计数（必须初始化为 0）
    // cleanupComplete handler 累加：< totalTypes 时 return（不调 onCleanupComplete），
    // >= totalTypes 时才走 onCleanupComplete。防多 type 中间步骤误判为"全部完成"。
    completedTypesCount: 0,
    currentType: null,
    statusHideTimer: null,
    totalItems: 0,
    cleanupStartTime: 0,
    summaryDismissed: false,
    refreshHintTimer: null,
    cleanupOptions: null,
    dailyRemaining: 0,
    limitReached: false,
    checkingLogin: false
  };

  // 每日额度配置
  var FREE_LIMIT_PER_DAY = 5000;

  // CWS extension id — used by the rating prompt to deep-link to the review page.
  // For Edge the review URL differs (Edge opens a tab on microsoftedge.microsoft.com).
  var CWS_EXTENSION_ID = 'hbeccanmeoflhdgefmjifbolkhpmonni';
  var CWS_REVIEW_URL = 'https://chromewebstore.google.com/detail/' + CWS_EXTENSION_ID + '/reviews';

  // Rating prompt cooldown: 30 days between prompts. After 3 skips the prompt
  // is permanently muted. Once the user rates 4 or 5 stars it's permanently
  // dismissed (we never pester a satisfied user again).
  var RATING_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;
  var RATING_MAX_SKIPS = 3;

  // 单飞串行链：所有 dailyUsage 读写都排队走这条 Promise 链
  // 修复并发的 read-modify-write 竞态
  var _dailyUsageChain = Promise.resolve();

  function getDailyUsage(callback) {
    _dailyUsageChain = _dailyUsageChain.then(function() {
      return new Promise(function(resolve) {
        chrome.storage.local.get(['tiktokDailyUsage'], function(result) {
          var data = result.tiktokDailyUsage;
          var today = new Date().toDateString();
          if (!data || data.date !== today) {
            data = { date: today, used: 0 };
            chrome.storage.local.set({ tiktokDailyUsage: data }, function() { resolve(data.used || 0); });
          } else {
            resolve(data.used || 0);
          }
        });
      });
    }).then(function(used) {
      if (callback) callback(used);
      return used;
    }).catch(function(err) {
      console.warn('[TikTok Eraser] getDailyUsage chain step failed:', err && err.message);
      if (callback) callback(0);
      return 0;
    });
    return _dailyUsageChain;
  }

  function incrementDailyUsage(count, callback) {
    _dailyUsageChain = _dailyUsageChain.then(function() {
      return new Promise(function(resolve) {
        chrome.storage.local.get(['tiktokDailyUsage'], function(result) {
          var today = new Date().toDateString();
          var data = result.tiktokDailyUsage;
          if (!data || data.date !== today) {
            data = { date: today, used: 0 };
          }
          data.used = (data.used || 0) + count;
          chrome.storage.local.set({ tiktokDailyUsage: data }, function() {
            if (callback) callback(data.used);
            resolve(data.used);
          });
        });
      });
    }).catch(function(err) {
      console.warn('[TikTok Eraser] incrementDailyUsage chain step failed:', err && err.message);
      if (callback) callback(null);
    });
    return _dailyUsageChain;
  }

  var els = {};
  var i18n = null;

  function t(key, vars) {
    if (i18n && i18n.t) return i18n.t(key, vars);
    return key;
  }

  function init() {
    if (window.TikTokEraseri18n) {
      i18n = window.TikTokEraseri18n;
    } else {
      setTimeout(init, 0);
      return;
    }

    chrome.storage.local.get(['tiktokPreferredLang'], function(result) {
      if (result.tiktokPreferredLang && i18n.setLanguage) {
        i18n.setLanguage(result.tiktokPreferredLang);
        console.log('[TikTok Eraser] Loaded preferred language:', result.tiktokPreferredLang);
      } else {
        console.log('[TikTok Eraser] Using detected language:', i18n.getLanguage());
      }
      afterLangLoaded();
    });
  }

  function afterLangLoaded() {
    els.statusDot = document.getElementById('status-tiktok-dot');
    els.statusText = document.getElementById('status-tiktok-text');
    els.loginDot = document.getElementById('status-login-dot');
    els.loginText = document.getElementById('status-login-text');
    els.loginHint = document.getElementById('status-login-hint');
    els.openSection = document.getElementById('open-tiktok-section');
    els.loginSection = document.getElementById('login-section');
    els.optionsSection = document.getElementById('options-section');
    els.btnOpenTikTok = document.getElementById('btn-open-tiktok');
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
    els.btnCloseProgress = document.getElementById('btn-close-progress');
    els.logArea = document.getElementById('log-area');
    els.btnRefresh = document.getElementById('btn-refresh');
    els.refreshIcon = document.getElementById('refresh-icon');
    els.btnCopyDiag = document.getElementById('btn-copy-diag');
    els.btnLang = document.getElementById('btn-lang');
    els.langFlag = document.getElementById('lang-flag');
    els.langDropdown = document.getElementById('lang-dropdown');
    els.btnFeedback = document.getElementById('btn-feedback');
    els.summaryCard = document.getElementById('summary-card');
    els.summaryTitle = document.getElementById('summary-title');
    els.summaryStats = document.getElementById('summary-stats');
    els.btnCloseSummary = document.getElementById('btn-close-summary');
    els.btnRateFooter = document.getElementById('rate-footer-link');

    // 5 个顶级 checkbox DOM 引用
    els.optVideos = document.getElementById('opt-videos');
    els.optReposts = document.getElementById('opt-reposts');
    els.optLikes = document.getElementById('opt-likes');
    els.optFavorites = document.getElementById('opt-favorites');
    els.optFollowing = document.getElementById('opt-following');

    updateLangFlag();
    applyI18n();
    bindEvents();
    // Videos 默认未 checked → backup tip 默认收起
    syncBackupTip();
    checkTikTokTabStatus();

    if (chrome.tabs && chrome.tabs.onActivated) {
      chrome.tabs.onActivated.addListener(function() {
        checkTikTokTabStatus();
      });
    }

    if (chrome.windows && chrome.windows.onFocusChanged) {
      chrome.windows.onFocusChanged.addListener(function(windowId) {
        if (windowId !== chrome.windows.WINDOW_ID_NONE) {
          checkTikTokTabStatus();
        }
      });
    }

    if (typeof document !== 'undefined' && document.addEventListener) {
      document.addEventListener('visibilitychange', function() {
        if (!document.hidden) {
          checkTikTokTabStatus();
        }
      });
    }
  }

  // 同步 Videos 备份提示的展开状态
  // 勾上 → 显示黄色警告条；取消 → 收起
  function syncBackupTip() {
    ['opt-videos'].forEach(function(id) {
      var cb = document.getElementById(id);
      if (!cb) return;
      var item = cb.closest('.option-item');
      if (!item) return;
      if (cb.checked) {
        item.classList.add('show-backup-tip');
      } else {
        item.classList.remove('show-backup-tip');
      }
    });
  }

  function applyI18n() {
    if (els.btnOpenTikTok) els.btnOpenTikTok.textContent = t('openTikTokWebsite');
    if (els.btnLogin) els.btnLogin.textContent = t('pleaseLogin');
    if (els.btnStart) els.btnStart.textContent = t('startCleanup');
    if (els.btnPause) els.btnPause.textContent = t('pause');
    if (els.btnStop) els.btnStop.textContent = t('stop');
    if (els.statusText) els.statusText.textContent = t('checking');
    if (els.loginText) els.loginText.textContent = t('checking');
    if (els.progressText) els.progressText.textContent = t('processing');

    var labels = document.querySelectorAll('[data-i18n]');
    for (var i = 0; i < labels.length; i++) {
      var key = labels[i].getAttribute('data-i18n');
      if (labels[i].closest('[data-i18n-html]')) continue;
      labels[i].textContent = t(key);
    }

    // data-i18n-html: 含 <a> 的富文本（videosBackupTip）
    var htmlLabels = document.querySelectorAll('[data-i18n-html]');
    for (var m = 0; m < htmlLabels.length; m++) {
      var hkey = htmlLabels[m].getAttribute('data-i18n-html');
      var linkHTML =
        '<a href="https://www.tiktok.com/setting/download-your-data" ' +
        'target="_blank" rel="noopener noreferrer">' + t('archiveLinkText') + '</a>';
      htmlLabels[m].innerHTML = t(hkey, { link: linkHTML });
    }

    var placeholders = document.querySelectorAll('[data-i18n-placeholder]');
    for (var j = 0; j < placeholders.length; j++) {
      var pkey = placeholders[j].getAttribute('data-i18n-placeholder');
      placeholders[j].setAttribute('placeholder', t(pkey));
    }

    var titled = document.querySelectorAll('[data-i18n-title]');
    for (var tt = 0; tt < titled.length; tt++) {
      var tkey = titled[tt].getAttribute('data-i18n-title');
      titled[tt].setAttribute('title', t(tkey));
    }

    var trustTitle = document.querySelector('.trust-badge-title');
    if (trustTitle) trustTitle.textContent = t('trustTitle');
    var trustText = document.querySelector('.trust-badge-text');
    if (trustText) trustText.textContent = t('trustText');
  }

  function getPatterns() {
    return ['*://tiktok.com/*', '*://www.tiktok.com/*'];
  }

  function bindEvents() {
    if (els.btnOpenTikTok) els.btnOpenTikTok.onclick = openTikTokTab;
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
    if (els.btnCloseProgress) els.btnCloseProgress.onclick = stopCleanup;
    if (els.btnCloseSummary) els.btnCloseSummary.onclick = hideSummaryCard;
    if (els.btnRateFooter) {
      els.btnRateFooter.onclick = function(e) {
        e.preventDefault();
        getRatingState(function(s) {
          if (s.hasRated) {
            chrome.tabs.create({ url: CWS_REVIEW_URL });
            return;
          }
          showRatingPrompt(s);
        });
      };
    }

    // Videos 备份提示联动
    var videosCb = document.getElementById('opt-videos');
    if (videosCb) videosCb.addEventListener('change', syncBackupTip);

    // 点击其他地方关闭语言下拉
    document.addEventListener('click', function(e) {
      if (els.langDropdown && !els.langDropdown.contains(e.target) && e.target !== els.btnLang && !els.btnLang.contains(e.target)) {
        closeLangDropdown();
      }
    });

    chrome.runtime.onMessage.addListener(function(msg) {
      if (msg.type === 'cleanupProgress') {
        var newCount = parseInt(msg.processed, 10) || 0;
        var baseTotal = state.typeStartCumulative || 0;
        var prevTotal = state.processedItems || 0;
        state.processedItems = baseTotal + newCount;
        if (state.processedItems > prevTotal) {
          var delta = state.processedItems - prevTotal;
          incrementDailyUsage(delta, function(totalUsed) {
            if (totalUsed !== null && totalUsed >= FREE_LIMIT_PER_DAY) {
              state.limitReached = true;
            }
          });
        }
        updateProgress();
        if (state.currentType) {
          setOptionCount(state.currentType, newCount);
        }
      } else if (msg.type === 'cleanupLog') {
        addLog(msg.message, msg.level);
      } else if (msg.type === 'cleanupComplete') {
        // multi-type 状态机：累加已完成 type 数。
        // 如果还有剩余 type：addLog("已完成 X/Y 种类型") + return（不调 onCleanupComplete，
        //   避免多 type 拆分中间步骤 sidepanel 误判为"全部完成"）。
        // 最后一个 type 完成时才走 onCleanupComplete（设 isRunning=false + summary）。
        state.completedTypesCount = (state.completedTypesCount || 0) + 1;
        var totalTypes = (state.cleanupOptions && Array.isArray(state.cleanupOptions.types))
          ? state.cleanupOptions.types.length : 1;
        if (state.completedTypesCount < totalTypes) {
          addLog(t('typeProgressUpdate', {done: state.completedTypesCount, total: totalTypes}), 'info');
          return;
        }
        onCleanupComplete();
      } else if (msg.type === 'cleanupError') {
        addLog(msg.message, 'error');
      } else if (msg.type === 'cleanupPaused') {
        onPaused();
      } else if (msg.type === 'cleanupResumed') {
        onResumed();
      } else if (msg.type === 'cleanupStopped') {
        onStopped();
      } else if (msg.type === 'cleanupAborted') {
        onStopped();
      } else if (msg.type === 'cleanupTypeStart') {
        state.currentType = msg.itemType;
        state.typeStartCumulative = state.processedItems;
        setOptionState(msg.itemType, 'processing');
      } else if (msg.type === 'cleanupTypeComplete') {
        state.currentType = null;
        setOptionState(msg.itemType, 'done', msg.processed);
      } else if (msg.type === 'statusUpdate') {
        if (typeof msg.isTikTok === 'boolean' && msg.isTikTok !== state.isTikTok) {
          state.isTikTok = msg.isTikTok;
        }
        if (typeof msg.isLoggedIn === 'boolean' && msg.isLoggedIn !== state.isLoggedIn) {
          state.isLoggedIn = msg.isLoggedIn;
          state.checkingLogin = false;
          updateUI();
        }
      }
    });
  }

  function updateLangFlag() {
    if (!els.langFlag || !i18n) return;
    var current = i18n.getLanguage();
    var meta = i18n.getLangMeta(current);
    if (meta && meta.flag) {
      els.langFlag.textContent = meta.flag;
    }
  }

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

  function switchLanguage(lang) {
    if (!i18n || !i18n.setLanguage) return;
    i18n.setLanguage(lang);
    chrome.storage.local.set({tiktokPreferredLang: lang});
    updateLangFlag();
    applyI18n();
    updateUI();
    closeLangDropdown();
  }

  function openTikTokTab() {
    var patterns = getPatterns();
    chrome.tabs.query({url: patterns}, function(tabs) {
      if (tabs && tabs.length > 0) {
        chrome.tabs.update(tabs[0].id, {active: true});
      } else {
        chrome.tabs.create({url: 'https://www.tiktok.com/'});
      }
    });
  }

  // 刷新按钮逻辑（参考 E Eraser 流程 2026-XX-XX）：
  //   1. 检查 tiktok.com tab 是否打开
  //   2. 检查是否已登录
  //   3. 调 background 拉远程配置并保存到 chrome.storage.local
  //   4. 成功后整页刷新（让 content script 重新注入并使用新 config）
  // 设计：与原 fire-and-forget 并行不同，本流程**串行**——前一步失败就停，不刷新页面
  //   避免在 tiktok.com 未打开时 reload 一个非 tiktok tab、或未登录时 reload 登录页
  function refreshConfig() {
    if (els.refreshIcon) {
      els.refreshIcon.className = 'refresh-icon spinning';
    }
    addLog(t('refreshingConfig'), 'info');

    var patterns = getPatterns();
    // 步骤 1：检查 tiktok.com tab 是否打开
    chrome.tabs.query({url: patterns}, function(tabs) {
      if (!tabs || tabs.length === 0) {
        addLog(t('refreshRequiresTikTokTab'), 'error');
        if (els.refreshIcon) els.refreshIcon.className = 'refresh-icon';
        return;
      }
      var tab = tabs[0];

      // 步骤 2：通过 content script 查询登录状态
      chrome.tabs.sendMessage(tab.id, {target: 'content', type: 'getStatus'}, function(statusResp) {
        if (chrome.runtime.lastError || !statusResp) {
          // content script 未就绪（页面还在加载 / 不是 tiktok 页面）→ 等同于 tiktok.com 未开
          addLog(t('refreshRequiresTikTokTab'), 'error');
          if (els.refreshIcon) els.refreshIcon.className = 'refresh-icon';
          return;
        }
        if (!statusResp.isLoggedIn) {
          addLog(t('refreshRequiresLogin'), 'error');
          if (els.refreshIcon) els.refreshIcon.className = 'refresh-icon';
          return;
        }

        // 步骤 3：拉远程配置 + 写 storage
        chrome.runtime.sendMessage({target: 'refreshConfig'}, function(resp) {
          if (chrome.runtime.lastError || !resp || !resp.config) {
            addLog(t('configRefreshFailed'), 'error');
            if (els.refreshIcon) els.refreshIcon.className = 'refresh-icon';
            return;
          }
          addLog(t('configRefreshed'), 'success');
          addLog(t('refreshReloadingPage'), 'info');

          // 步骤 4：刷新整个 tiktok 页面
          //   content script 重新加载后会自动从 storage 读新 config
          //   reload 是 fire-and-forget（chrome.tabs.reload 不报错即视为成功）
          chrome.tabs.reload(tab.id, {}, function() {
            if (chrome.runtime.lastError) {
              console.warn('[TikTok Eraser] Reload failed:', chrome.runtime.lastError.message);
            }
            if (els.refreshIcon) els.refreshIcon.className = 'refresh-icon';
          });
        });
      });
    });
  }

  function checkTikTokTabStatus(silent) {
    return new Promise(function(resolve) {
      var patterns = getPatterns();
      chrome.tabs.query({url: patterns}, function(tabs) {
        if (tabs && tabs.length > 0) {
          var tab = tabs[0];
          if (!state.isTikTok) {
            state.isTikTok = true;
            if (!silent) {
              state.checkingLogin = true;
              updateUI();
            }
          }
          chrome.tabs.sendMessage(tab.id, {target: 'content', type: 'getStatus'}, function(resp) {
            if (chrome.runtime.lastError || !resp) {
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
          var changed = state.isTikTok !== false || state.isLoggedIn !== false || state.checkingLogin;
          state.isTikTok = false;
          state.isLoggedIn = false;
          state.checkingLogin = false;
          if (changed && !silent) updateUI();
          resolve();
        }
      });
    });
  }

  function applyStatusFromContent(resp, silent) {
    if (typeof resp.isTikTok === 'boolean' && resp.isTikTok !== state.isTikTok) {
      state.isTikTok = resp.isTikTok;
    }
    var loggedIn = resp.isLoggedIn;
    var wasChecking = state.checkingLogin;
    if (typeof loggedIn === 'boolean') {
      if (loggedIn !== state.isLoggedIn) state.isLoggedIn = loggedIn;
      state.checkingLogin = false;
    } else if (loggedIn === null) {
      if (state.isLoggedIn !== null) state.isLoggedIn = null;
      state.checkingLogin = true;
    }
    if (!silent && (state.checkingLogin !== wasChecking
        || (typeof loggedIn === 'boolean' && loggedIn !== wasChecking))) {
      updateUI();
    }
  }

  function activateTikTokTab(callback) {
    var patterns = getPatterns();
    chrome.tabs.query({url: patterns}, function(tabs) {
      if (tabs && tabs.length > 0) {
        var tTab = tabs[0];
        chrome.tabs.update(tTab.id, {active: true});
        if (tTab.windowId) {
          chrome.windows.update(tTab.windowId, {focused: true});
        }
        if (callback) callback(tTab);
      } else {
        if (callback) callback(null);
      }
    });
  }

  function updateUI() {
    var newXClass = 'status-dot ' + (state.isTikTok ? 'green' : 'red');
    var newXText = state.isTikTok ? t('tiktokWebsiteDetected') : t('pleaseOpenTikTok');
    var newXTextClass = 'status-text ' + (state.isTikTok ? 'success' : 'error');
    if (els.statusDot && els.statusDot.className !== newXClass) {
      els.statusDot.className = newXClass;
    }
    if (els.statusText) {
      if (els.statusText.textContent !== newXText) els.statusText.textContent = newXText;
      if (els.statusText.className !== newXTextClass) els.statusText.className = newXTextClass;
    }

    var newLClass, newLText, newLTextClass;
    if (state.checkingLogin || state.isLoggedIn === null) {
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

    var shouldHint = state.isTikTok && state.checkingLogin;
    if (shouldHint && !state.refreshHintTimer) {
      state.refreshHintTimer = setTimeout(function() {
        state.refreshHintTimer = null;
        if (state.isTikTok && state.checkingLogin && els.loginHint) {
          els.loginHint.textContent = t('pleaseRefreshTikTokPage');
          els.loginHint.style.display = 'block';
        }
      }, 8000);
    } else if (!shouldHint && state.refreshHintTimer) {
      clearTimeout(state.refreshHintTimer);
      state.refreshHintTimer = null;
    }
    if (!state.checkingLogin && els.loginHint) {
      els.loginHint.style.display = 'none';
    }

    var showOpen = !state.isTikTok;
    var showLogin = state.isTikTok && !state.isLoggedIn;
    var showOptions = state.isTikTok && state.isLoggedIn;

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

    var statusCard = document.getElementById('status-card');
    if (statusCard) {
      var allOk = state.isTikTok && state.isLoggedIn === true && !state.checkingLogin;
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

  // 5 type 顶级 checkbox，type 直接对应 HTML id 后缀
  var TYPE_ID_MAP = {
    'videos': 'videos',
    'reposts': 'reposts',
    'likes': 'likes',
    'favorites': 'favorites',
    'following': 'following'
  };
  function resolveOptionId(type) {
    var id = TYPE_ID_MAP[type] || type;
    return 'opt-' + id;
  }
  function setOptionState(type, stateName, count) {
    var checkbox = document.getElementById(resolveOptionId(type));
    if (!checkbox) return;
    var item = checkbox.closest('.option-item');
    if (!item) return;
    var countEl = item.querySelector('.option-count');
    if (!countEl) return;
    item.classList.remove('pending', 'processing', 'done');
    if (stateName === 'pending' || stateName === 'processing') {
      item.classList.add(stateName);
      countEl.innerHTML = '<span class="spinner"></span>';
    } else if (stateName === 'done') {
      item.classList.add('done');
      var n = (typeof count === 'number') ? count : 0;
      countEl.textContent = n > 0 ? n.toLocaleString() : '0';
    } else {
      countEl.textContent = '0';
    }
  }
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
  function resetAllOptionStates() {
    ['videos', 'reposts', 'likes', 'favorites', 'following'].forEach(function(type) {
      setOptionState(type, 'idle');
    });
  }
  // 2026-XX-XX 新增：暂停时把 pending/processing 的 option 加 .paused 类
  //   配合 CSS .option-item.paused .option-count .spinner { animation: none }
  //   让 loading 图标停止旋转；resume 时再移除 .paused 恢复旋转
  function pauseAllOptionStates() {
    ['videos', 'reposts', 'likes', 'favorites', 'following'].forEach(function(type) {
      var checkbox = document.getElementById(resolveOptionId(type));
      if (!checkbox) return;
      var item = checkbox.closest('.option-item');
      if (!item) return;
      if (item.classList.contains('pending') || item.classList.contains('processing')) {
        item.classList.add('paused');
      }
    });
  }
  function resumeAllOptionStates() {
    ['videos', 'reposts', 'likes', 'favorites', 'following'].forEach(function(type) {
      var checkbox = document.getElementById(resolveOptionId(type));
      if (!checkbox) return;
      var item = checkbox.closest('.option-item');
      if (!item) return;
      item.classList.remove('paused');
    });
  }

  function addLog(message, level) {
    if (!els.logArea) return;
    if (!level) level = 'info';
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

  function copyDiagnosticLog() {
    try {
      var logEntries = els.logArea ? Array.from(els.logArea.querySelectorAll('.log-entry')) : [];
      var logText = logEntries.map(function(entry) {
        var time = entry.querySelector('.log-time');
        var text = entry.textContent || '';
        return (time ? time.textContent : '') + ' ' + text;
      }).join('\n');
      var diagText = '=== Eraser for TikTok Diagnostic Log ===\n' +
        'Timestamp: ' + new Date().toISOString() + '\n' +
        'TikTok website: ' + (state.isTikTok ? 'yes' : 'no') + '\n' +
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
    if (els.summaryCard) els.summaryCard.classList.remove('active');
    var options = [];
    // 5 type 顶级 checkbox
    var checkboxIds = ['opt-videos', 'opt-reposts', 'opt-likes', 'opt-favorites', 'opt-following'];
    var optionNames = ['videos', 'reposts', 'likes', 'favorites', 'following'];
    for (var i = 0; i < checkboxIds.length; i++) {
      var el = document.getElementById(checkboxIds[i]);
      if (el && el.checked) {
        options.push(optionNames[i]);
      }
    }
    if (options.length === 0) {
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

    // 收集过滤条件
    var fromDateEl = document.getElementById('filter-date-from');
    var toDateEl = document.getElementById('filter-date-to');
    var keywordEl = document.getElementById('filter-keyword');
    var minViewCountEl = document.getElementById('filter-view-min');
    var maxViewCountEl = document.getElementById('filter-view-max');

    var fromDate = (fromDateEl && fromDateEl.value) ? fromDateEl.value : null;
    var toDate = (toDateEl && toDateEl.value) ? toDateEl.value : null;
    var keyword = (keywordEl && keywordEl.value) ? keywordEl.value.trim() : null;
    var minVC = (minViewCountEl && minViewCountEl.value !== '') ? Number(minViewCountEl.value) : null;
    var maxVC = (maxViewCountEl && maxViewCountEl.value !== '') ? Number(maxViewCountEl.value) : null;

    if (fromDate && toDate && fromDate > toDate) {
      if (els.progressCard) els.progressCard.className = 'progress-card active';
      addLog(t('invalidDateRange'), 'error');
      setTimeout(function() {
        if (els.progressCard) els.progressCard.scrollIntoView({behavior: 'smooth', block: 'center'});
      }, 50);
      return;
    }
    if (minVC !== null && (!Number.isFinite(minVC) || minVC < 0)) {
      addLog(t('invalidViewCount', {field: t('minViewCount')}), 'error');
      return;
    }
    if (maxVC !== null && (!Number.isFinite(maxVC) || maxVC < 0)) {
      addLog(t('invalidViewCount', {field: t('maxViewCount')}), 'error');
      return;
    }
    if (minVC !== null && maxVC !== null && minVC > maxVC) {
      addLog(t('invalidViewCountRange'), 'error');
      return;
    }

    var filters = (fromDate || toDate || keyword || minVC !== null || maxVC !== null)
      ? { fromDate: fromDate, toDate: toDate, keyword: keyword, minViewCount: minVC, maxViewCount: maxVC }
      : null;

    getDailyUsage(function(used) {
      var remaining = FREE_LIMIT_PER_DAY - used;
      if (remaining <= 0) {
        // 2026-07-03 daily limit "0/0" 修复（memory line 17）：
        // 1) 显式 state.totalItems=0 + progress card 设为默认 'progress-card'（重置 active 态，
        //    避免下次进入时显示 stale "X/5000"）
        // 2) addLog 之前 state.isRunning=true（addLog 内部 !isRunning 检查 → 抑制重新激活 progress card）
        // 3) addLog 之后 state.isRunning=false 恢复
        state.totalItems = 0;
        if (els.progressCard) els.progressCard.className = 'progress-card';
        state.isRunning = true;
        addLog(t('dailyLimitReached', {used: used, limit: FREE_LIMIT_PER_DAY}), 'warn');
        state.isRunning = false;
        showTipModal(used);
        return;
      }
      var maxPerType = remaining;

      state.isRunning = true;
      state.isPaused = false;
      state.processedItems = 0;
      state.typeStartCumulative = 0;
      state.dailyRemaining = remaining;
      state.totalItems = remaining;
      state.cleanupOptions = { types: options, maxPerType: maxPerType, filters: filters };
      state.cleanupStartTime = Date.now();
      state.summaryDismissed = false;
      state.limitReached = false;
      // multi-type counter 重置（startCleanup 入口）
      state.completedTypesCount = 0;

      resetAllOptionStates();
      options.forEach(function(type) {
        setOptionState(type, 'pending');
      });

      if (els.progressCard) els.progressCard.className = 'progress-card active';
      if (els.logArea) els.logArea.innerHTML = '';
      setTimeout(function() {
        if (els.progressCard) {
          els.progressCard.scrollIntoView({behavior: 'smooth', block: 'center'});
        }
      }, 50);
      if (els.progressText) els.progressText.textContent = t('processing');
      if (els.progressSpinner) els.progressSpinner.className = 'progress-spinner';
      if (els.controlButtons) els.controlButtons.style.display = 'none';
      if (els.runningButtons) els.runningButtons.style.display = 'flex';

      addLog(t('usedToday', {used: used, limit: FREE_LIMIT_PER_DAY}), 'info');
      addLog(t('startingCleanup'), 'info');

      console.log('[TikTok Eraser sidepanel] state.cleanupOptions:', state.cleanupOptions);

      function writeSessionAndStart() {
        chrome.storage.session.set({ pendingCleanup: state.cleanupOptions }).then(function() {
          return chrome.storage.session.get('pendingCleanup');
        }).then(function(readback) {
          console.log('[TikTok Eraser sidepanel] session readback:', readback);
          if (!readback || !readback.pendingCleanup) {
            return chrome.storage.session.set({ pendingCleanup: state.cleanupOptions }).then(function() {
              return chrome.storage.session.get('pendingCleanup');
            });
          }
          return readback;
        }).then(function(finalReadback) {
          if (!finalReadback || !finalReadback.pendingCleanup) {
            console.error('[TikTok Eraser sidepanel] session write FAILED after retry, pending cleanup will not work');
            addLog(t('sessionWriteFailed'), 'error');
          }
          activateTikTokTab(function() {
            chrome.runtime.sendMessage({type: 'startCleanup', options: state.cleanupOptions});
          });
        }).catch(function(err) {
          console.error('[TikTok Eraser sidepanel] session write error:', err);
          activateTikTokTab(function() {
            chrome.runtime.sendMessage({type: 'startCleanup', options: state.cleanupOptions});
          });
        });
      }

      writeSessionAndStart();
    });
  }

  function showTipModal(used) {
    var existing = document.getElementById('tip-modal');
    if (existing) existing.remove();

    var modal = document.createElement('div');
    modal.id = 'tip-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:9999;cursor:pointer;';
    modal.addEventListener('click', function(e) {
      if (e.target === modal) modal.remove();
    });

    var box = document.createElement('div');
    box.style.cssText = 'background:#18181b;border:1px solid #27272a;border-radius:12px;padding:24px;max-width:320px;width:90%;text-align:center;cursor:default;';
    box.addEventListener('click', function(e) { e.stopPropagation(); });

    var icon = document.createElement('div');
    icon.style.cssText = 'font-size:48px;margin-bottom:12px;';
    icon.textContent = '☕';

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
    btnLater.textContent = t('gotIt');
    btnLater.onclick = function() { modal.remove(); };

    var btnTip = document.createElement('button');
    btnTip.style.cssText = 'flex:1;padding:10px;border:none;background:linear-gradient(135deg,#f59e0b,#d97706);color:#0f0f0f;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;';
    btnTip.textContent = t('upgradeToPremium');
    btnTip.onclick = function() {
      chrome.tabs.create({url: 'https://socialeraser.app/support.html'});
      modal.remove();
    };

    btnRow.appendChild(btnLater);
    btnRow.appendChild(btnTip);

    box.appendChild(icon);
    box.appendChild(title);
    box.appendChild(hint);
    box.appendChild(btnRow);
    modal.appendChild(box);
    document.body.appendChild(modal);
  }

  // Rating prompt
  function getRatingState(cb) {
    chrome.storage.local.get(['tiktokRatingPrompt'], function(result) {
      var def = {
        lastShown: 0,
        skipCount: 0,
        hasRated: false,
        neverAsk: false,
        lastFeedback: ''
      };
      var s = result && result.tiktokRatingPrompt ? result.tiktokRatingPrompt : def;
      s.lastShown = s.lastShown || 0;
      s.skipCount = s.skipCount || 0;
      s.hasRated = !!s.hasRated;
      s.neverAsk = !!s.neverAsk;
      s.lastFeedback = s.lastFeedback || '';
      cb(s);
    });
  }
  function setRatingState(s, cb) {
    chrome.storage.local.set({ tiktokRatingPrompt: s }, function() {
      if (cb) cb();
    });
  }
  function maybeShowRatingPrompt() {
    getRatingState(function(s) {
      // 2026-07-02 修改：去掉冷却 + neverAsk 限制（每次 cleanup 都弹）
      // hasRated 检查保留：评过分的用户不再骚扰
      if (s.hasRated) return;
      showRatingPrompt(s);
    });
  }
  function closeRatingPrompt(s, modal) {
    setRatingState(s);
    if (modal && modal.parentNode) modal.remove();
  }
  function showRatingPrompt(stateIn) {
    if (document.getElementById('rating-prompt')) return;
    var modal = document.createElement('div');
    modal.id = 'rating-prompt';
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:9999;cursor:pointer;';
    modal.addEventListener('click', function(e) {
      if (e.target === modal) {
        var ns = Object.assign({}, stateIn, {
          lastShown: Date.now(),
          skipCount: stateIn.skipCount + 1
        });
        closeRatingPrompt(ns, modal);
      }
    });
    var box = document.createElement('div');
    box.style.cssText = 'background:#18181b;border:1px solid #27272a;border-radius:12px;padding:24px;max-width:340px;width:92%;text-align:center;cursor:default;';
    box.addEventListener('click', function(e) { e.stopPropagation(); });
    var icon = document.createElement('div');
    icon.style.cssText = 'font-size:36px;margin-bottom:8px;';
    icon.textContent = '⭐';
    var title = document.createElement('h2');
    title.style.cssText = 'font-size:16px;font-weight:600;color:#fff;margin-bottom:6px;';
    title.textContent = t('ratePromptTitle');
    var body = document.createElement('p');
    body.style.cssText = 'font-size:12px;color:#a1a1aa;margin-bottom:16px;line-height:1.5;';
    body.textContent = t('ratePromptBody');
    var stars = document.createElement('div');
    stars.style.cssText = 'display:flex;justify-content:center;gap:6px;margin-bottom:16px;';
    var starBtns = [];
    var starLabels = [
      t('ratePromptLabel1'), t('ratePromptLabel2'), t('ratePromptLabel3'),
      t('ratePromptLabel4'), t('ratePromptLabel5')
    ];
    for (var i = 1; i <= 5; i++) {
      (function(rating) {
        var b = document.createElement('button');
        b.type = 'button';
        b.setAttribute('aria-label', rating + ' star' + (rating > 1 ? 's' : '') + ': ' + starLabels[rating - 1]);
        b.title = starLabels[rating - 1];
        b.dataset.rating = String(rating);
        b.style.cssText = 'background:transparent;border:none;cursor:pointer;padding:4px;font-size:28px;line-height:1;color:#3f3f46;transition:color 0.1s ease,transform 0.1s ease;';
        b.textContent = '★';
        b.addEventListener('mouseenter', function() {
          for (var k = 0; k < starBtns.length; k++) {
            starBtns[k].style.color = (k < rating) ? '#f59e0b' : '#3f3f46';
          }
        });
        b.addEventListener('mouseleave', function() {
          for (var k = 0; k < starBtns.length; k++) {
            starBtns[k].style.color = '#3f3f46';
          }
        });
        b.addEventListener('click', function() {
          handleRatingChoice(rating, stateIn, modal);
        });
        starBtns.push(b);
        stars.appendChild(b);
      })(i);
    }
    var btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:8px;';
    var btnSkip = document.createElement('button');
    btnSkip.type = 'button';
    btnSkip.style.cssText = 'flex:1;padding:8px;border:1px solid #3f3f46;background:transparent;color:#a1a1aa;border-radius:6px;font-size:12px;cursor:pointer;';
    btnSkip.textContent = t('ratePromptSkip');
    btnSkip.onclick = function() {
      var ns = Object.assign({}, stateIn, {
        lastShown: Date.now(),
        skipCount: stateIn.skipCount + 1
      });
      closeRatingPrompt(ns, modal);
    };
    var btnNever = document.createElement('button');
    btnNever.type = 'button';
    btnNever.style.cssText = 'flex:1;padding:8px;border:none;background:transparent;color:#71717a;border-radius:6px;font-size:12px;cursor:pointer;text-decoration:underline;';
    btnNever.textContent = t('ratePromptNever');
    btnNever.onclick = function() {
      var ns = Object.assign({}, stateIn, { neverAsk: true });
      closeRatingPrompt(ns, modal);
    };
    btnRow.appendChild(btnSkip);
    btnRow.appendChild(btnNever);
    box.appendChild(icon);
    box.appendChild(title);
    box.appendChild(body);
    box.appendChild(stars);
    box.appendChild(btnRow);
    modal.appendChild(box);
    document.body.appendChild(modal);
  }
  function handleRatingChoice(rating, stateIn, modal) {
    if (rating >= 4) {
      var ns = Object.assign({}, stateIn, { hasRated: true });
      setRatingState(ns);
      showRatingThanksToast(modal, function() {
        chrome.tabs.create({ url: CWS_REVIEW_URL });
        modal.remove();
      });
    } else {
      showRatingFeedbackForm(stateIn, modal, rating);
    }
  }
  function showRatingThanksToast(modal, cb) {
    var box = modal.querySelector('div');
    if (!box) { if (cb) cb(); return; }
    box.innerHTML = '';
    var msg = document.createElement('p');
    msg.style.cssText = 'font-size:14px;color:#22c55e;font-weight:600;';
    msg.textContent = t('ratePromptRatingThanks');
    box.appendChild(msg);
    setTimeout(function() { if (cb) cb(); }, 900);
  }
  function showRatingFeedbackForm(stateIn, modal, rating) {
    var box = modal.querySelector('div');
    if (!box) return;
    box.innerHTML = '';
    var title = document.createElement('h2');
    title.style.cssText = 'font-size:15px;font-weight:600;color:#fff;margin-bottom:4px;';
    title.textContent = t('ratePromptFeedbackTitle');
    var stars = document.createElement('div');
    stars.style.cssText = 'font-size:18px;color:#f59e0b;margin-bottom:12px;letter-spacing:2px;';
    stars.textContent = '★★★★★'.slice(0, rating) + '☆☆☆☆☆'.slice(0, 5 - rating);
    var textarea = document.createElement('textarea');
    textarea.style.cssText = 'width:100%;min-height:80px;background:#0f0f0f;border:1px solid #27272a;border-radius:6px;padding:8px;color:#fff;font-size:12px;font-family:inherit;resize:vertical;box-sizing:border-box;margin-bottom:12px;';
    textarea.placeholder = t('ratePromptFeedbackPlaceholder');
    textarea.value = stateIn.lastFeedback || '';
    var btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:8px;';
    var btnCancel = document.createElement('button');
    btnCancel.type = 'button';
    btnCancel.style.cssText = 'flex:1;padding:8px;border:1px solid #3f3f46;background:transparent;color:#a1a1aa;border-radius:6px;font-size:12px;cursor:pointer;';
    btnCancel.textContent = t('ratePromptSkip');
    btnCancel.onclick = function() {
      var ns = Object.assign({}, stateIn, {
        lastShown: Date.now(),
        skipCount: stateIn.skipCount + 1
      });
      closeRatingPrompt(ns, modal);
    };
    var btnSend = document.createElement('button');
    btnSend.type = 'button';
    btnSend.style.cssText = 'flex:1;padding:8px;border:none;background:linear-gradient(135deg,#f59e0b,#d97706);color:#0f0f0f;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;';
    btnSend.textContent = t('ratePromptFeedbackSend');
    btnSend.onclick = function() {
      var feedback = (textarea.value || '').trim();
      var ns = Object.assign({}, stateIn, {
        lastShown: Date.now(),
        skipCount: stateIn.skipCount + 1,
        lastFeedback: feedback
      });
      setRatingState(ns);
      box.innerHTML = '';
      var msg = document.createElement('p');
      msg.style.cssText = 'font-size:14px;color:#22c55e;font-weight:600;margin:8px 0;';
      msg.textContent = t('ratePromptFeedbackSent');
      box.appendChild(msg);
      setTimeout(function() { modal.remove(); }, 1200);
    };
    btnRow.appendChild(btnCancel);
    btnRow.appendChild(btnSend);
    box.appendChild(title);
    box.appendChild(stars);
    box.appendChild(textarea);
    box.appendChild(btnRow);
    textarea.focus();
  }

  function pauseCleanup() {
    state.isPaused = true;
    if (els.progressText) els.progressText.textContent = t('paused');
    if (els.progressSpinner) els.progressSpinner.className = 'progress-spinner paused';
    // 2026-XX-XX：让 Types 右边的 loading 图标停止旋转
    pauseAllOptionStates();
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
    // 2026-XX-XX：恢复 Types 右边的 loading 图标旋转
    resumeAllOptionStates();
    if (els.btnPause) {
      els.btnPause.textContent = t('pause');
      els.btnPause.onclick = pauseCleanup;
    }
    addLog(t('resumedLog'), 'info');
    chrome.runtime.sendMessage({type: 'resumeCleanup'});
  }
  function stopCleanup() {
    state.isRunning = false;
    state.isPaused = false;
    if (els.progressText) els.progressText.textContent = t('stopped');
    if (els.progressSpinner) els.progressSpinner.className = 'progress-spinner paused';
    // 2026-XX-XX：Stop 时立即清掉所有 option 状态（不等 background 的 cleanupStopped 回调）
    //   避免 Types 区域 spinner 继续转
    resetAllOptionStates();
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
    // 2026-XX-XX：兜底——如果某个 type 还在 pending（还没收到 cleanupTypeStart 就完成），
    //   把残留 spinner 状态清掉
    pauseAllOptionStates();
    addLog(t('cleanupCompleted', {count: state.processedItems}), 'success');
    if (els.controlButtons) els.controlButtons.style.display = 'flex';
    if (els.runningButtons) els.runningButtons.style.display = 'none';
    if (els.btnPause) {
      els.btnPause.textContent = t('pause');
      els.btnPause.onclick = pauseCleanup;
    }
    addLog(t('considerSupporting'), 'info');
    if (state.processedItems > 0 && !state.summaryDismissed) {
      showSummaryCard();
    }
    // 评分提示：>0 项就弹（>0 项 + hasRated=false，由 maybeShowRatingPrompt 检查）
    //   2026-07-02 修改：阈值 >0，去掉 30 天冷却 + neverAsk 限制，与 x-project 对齐。
    if (state.processedItems > 0) {
      setTimeout(maybeShowRatingPrompt, 2500);
    }
    if (state.limitReached) {
      getDailyUsage(function(used) {
        addLog(t('dailyLimitReached', {used: used, limit: FREE_LIMIT_PER_DAY}), 'warn');
        showTipModal(used);
      });
    }
  }
  function formatDuration(ms) {
    if (!ms || ms < 0) return '0s';
    var s = Math.floor(ms / 1000);
    if (s < 60) return s + 's';
    var m = Math.floor(s / 60);
    var rs = s % 60;
    return m + 'm ' + rs + 's';
  }
  function showSummaryCard() {
    if (!els.summaryCard) return;
    var count = state.processedItems || 0;
    var types = (state.cleanupOptions && state.cleanupOptions.types) || [];
    var duration = state.cleanupStartTime ? formatDuration(Date.now() - state.cleanupStartTime) : '0s';
    if (els.summaryTitle) els.summaryTitle.textContent = t('summaryDone', { count: count });
    if (els.summaryStats) els.summaryStats.textContent = t('summaryStats', { types: types.length, duration: duration });
    els.summaryCard.classList.add('active');
    setTimeout(function() {
      if (els.summaryCard) els.summaryCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 50);
  }
  function hideSummaryCard() {
    if (els.summaryCard) els.summaryCard.classList.remove('active');
    state.summaryDismissed = true;
  }
  function onPaused() {
    if (els.progressText) els.progressText.textContent = t('paused');
    if (els.progressSpinner) els.progressSpinner.className = 'progress-spinner paused';
    // 2026-XX-XX：background 确认 pause 后也确保 option spinner 停转
    //   （防止 pauseCleanup 已被用户点了但 background 回调还没到，spinner 继续转）
    pauseAllOptionStates();
  }
  function onResumed() {
    if (els.progressText) els.progressText.textContent = t('processing');
    if (els.progressSpinner) els.progressSpinner.className = 'progress-spinner';
    // 2026-XX-XX：background 确认 resume 后恢复 option spinner 旋转
    resumeAllOptionStates();
  }
  function onStopped() {
    state.isRunning = false;
    state.isPaused = false;
    if (els.progressText) els.progressText.textContent = t('stopped');
    if (els.progressSpinner) els.progressSpinner.className = 'progress-spinner paused';
    resetAllOptionStates();
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
