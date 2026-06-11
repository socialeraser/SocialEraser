// X-Eraser Side Panel Script

(function() {
  'use strict';

  const DAILY_LIMIT = 50;
  
  const state = {
    isX: false,
    isLoggedIn: false,
    isRunning: false,
    isPaused: false,
    dailyUsed: 0,
    totalItems: 0,
    processedItems: 0,
    selectedOptions: {
      tweets: true,
      likes: true,
      bookmarks: true,
      following: false,
      messages: false
    }
  };

  let i18n = null;
  const elements = {};

  function initElements() {
    console.log('[X-Eraser] initElements called');
    elements.statusXDot = document.getElementById('status-x-dot');
    elements.statusXText = document.getElementById('status-x-text');
    elements.statusLoginDot = document.getElementById('status-login-dot');
    elements.statusLoginText = document.getElementById('status-login-text');
    elements.openXSection = document.getElementById('open-x-section');
    elements.optionsSection = document.getElementById('options-section');
    elements.btnOpenX = document.getElementById('btn-open-x');
    elements.btnStart = document.getElementById('btn-start');
    elements.btnPause = document.getElementById('btn-pause');
    elements.btnStop = document.getElementById('btn-stop');
    elements.btnCloseProgress = document.getElementById('btn-close-progress');
    elements.controlButtons = document.getElementById('control-buttons');
    elements.runningButtons = document.getElementById('running-buttons');
    elements.progressCard = document.getElementById('progress-card');
    elements.progressBar = document.getElementById('progress-bar');
    elements.progressCurrent = document.getElementById('progress-current');
    elements.progressTotal = document.getElementById('progress-total');
    elements.logArea = document.getElementById('log-area');
    elements.filterDateFrom = document.getElementById('filter-date-from');
    elements.filterDateTo = document.getElementById('filter-date-to');
    elements.filterKeyword = document.getElementById('filter-keyword');
    elements.optionCounts = document.querySelectorAll('.option-count');
    elements.refreshSection = document.getElementById('refresh-section');
    elements.btnRefresh = document.getElementById('btn-refresh');
    elements.refreshIcon = document.getElementById('refresh-icon');
    elements.refreshText = document.getElementById('refresh-text');
    console.log('[X-Eraser] Elements initialized:', !!elements.statusXText);
  }

  function getWebsiteMatchPatterns() {
    if (window.XEraserConfig?.getWebsiteMatchPatterns) {
      return window.XEraserConfig.getWebsiteMatchPatterns();
    }
    return ['*://x.com/*', '*://twitter.com/*'];
  }

  function t(key) {
    if (i18n && i18n.t) {
      return i18n.t(key);
    }
    const fallback = {
      checking: 'Checking...',
      xWebsiteDetected: 'X website detected',
      pleaseOpenX: 'Please open X website',
      loggedIn: 'Logged in',
      notLoggedIn: 'Not logged in',
      openXWebsite: 'Open X Website'
    };
    return fallback[key] || key;
  }

  function updateUI() {
    console.log('[X-Eraser] updateUI called, state:', JSON.stringify(state));
    
    try {
      console.log('[X-Eraser] updateUI: checking elements');
      if (!elements.statusXText) {
        console.error('[X-Eraser] Elements not initialized!');
        return;
      }
      console.log('[X-Eraser] updateUI: elements OK');
      console.log('[X-Eraser] updateUI: step 1');
      
      if (state.isX && state.isLoggedIn) {
        if (elements.openXSection) elements.openXSection.style.display = 'none';
        if (elements.optionsSection) elements.optionsSection.style.display = 'block';
      } else {
        if (elements.openXSection) elements.openXSection.style.display = 'block';
        if (elements.optionsSection) elements.optionsSection.style.display = 'none';
      }
      
      console.log('[X-Eraser] updateUI: step 2');
      
      if (state.isX) {
        elements.statusXDot.className = 'status-dot green';
        elements.statusXText.textContent = t('xWebsiteDetected');
        elements.statusXText.className = 'status-text success';
      } else {
        elements.statusXDot.className = 'status-dot red';
        elements.statusXText.textContent = t('pleaseOpenX');
        elements.statusXText.className = 'status-text error';
      }
      
      console.log('[X-Eraser] updateUI: step 3');
      
      if (state.isLoggedIn) {
        elements.statusLoginDot.className = 'status-dot green';
        elements.statusLoginText.textContent = t('loggedIn');
        elements.statusLoginText.className = 'status-text success';
      } else {
        elements.statusLoginDot.className = 'status-dot red';
        elements.statusLoginText.textContent = t('notLoggedIn');
        elements.statusLoginText.className = 'status-text error';
      }
      
      console.log('[X-Eraser] updateUI: step 4');
      
      updateControlButtons();
      
      console.log('[X-Eraser] updateUI: completed');
    } catch (e) {
      console.error('[X-Eraser] updateUI error:', e);
    }
  }

  function updateControlButtons() {
    if (state.isRunning) {
      elements.controlButtons.style.display = 'none';
      elements.runningButtons.style.display = 'flex';
      elements.btnPause.textContent = state.isPaused ? 'Resume' : 'Pause';
    } else {
      elements.controlButtons.style.display = 'flex';
      elements.runningButtons.style.display = 'none';
    }
  }

  function updateProgress() {
    const percent = state.totalItems > 0 
      ? Math.round((state.processedItems / state.totalItems) * 100) 
      : 0;
    elements.progressBar.style.width = `${percent}%`;
    elements.progressCurrent.textContent = state.processedItems;
    elements.progressTotal.textContent = state.totalItems;
  }

  function addLog(message, type = 'info') {
    const now = new Date();
    const time = now.toTimeString().split(' ')[0];
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    entry.innerHTML = `<span class="log-time">${time}</span>${message}`;
    elements.logArea.appendChild(entry);
    elements.logArea.scrollTop = elements.logArea.scrollHeight;
  }

  function clearLog() {
    elements.logArea.innerHTML = '';
  }

  function showProgress() {
    elements.progressCard.classList.add('active');
  }

  function hideProgress() {
    elements.progressCard.classList.remove('active');
  }

  function getSelectedOptions() {
    const options = [];
    if (document.getElementById('opt-tweets').checked) options.push('tweets');
    if (document.getElementById('opt-likes').checked) options.push('likes');
    if (document.getElementById('opt-bookmarks').checked) options.push('bookmarks');
    if (document.getElementById('opt-following').checked) options.push('following');
    if (document.getElementById('opt-messages').checked) options.push('messages');
    return options;
  }

  function getFilters() {
    return {
      dateFrom: elements.filterDateFrom.value || null,
      dateTo: elements.filterDateTo.value || null,
      keyword: elements.filterKeyword.value.trim() || null
    };
  }

  async function loadDailyUsage() {
    try {
      const result = await chrome.storage.local.get(['dailyUsage', 'lastUsageDate']);
      const today = new Date().toDateString();
      
      if (result.lastUsageDate === today) {
        state.dailyUsed = result.dailyUsage || 0;
      } else {
        state.dailyUsed = 0;
        await chrome.storage.local.set({ dailyUsage: 0, lastUsageDate: today });
      }
      console.log('[X-Eraser] Daily usage loaded:', state.dailyUsed);
    } catch (e) {
      console.error('[X-Eraser] Failed to load daily usage:', e);
      state.dailyUsed = 0;
    }
  }

  async function saveDailyUsage() {
    try {
      const today = new Date().toDateString();
      await chrome.storage.local.set({ 
        dailyUsage: state.dailyUsed, 
        lastUsageDate: today 
      });
    } catch (e) {
      console.error('[X-Eraser] Failed to save daily usage:', e);
    }
  }

  async function startCleanup() {
    const selectedOptions = getSelectedOptions();
    
    if (selectedOptions.length === 0) {
      alert('Please select at least one item');
      return;
    }
    
    if (state.dailyUsed >= DAILY_LIMIT) {
      alert('Daily limit exceeded!');
      return;
    }
    
    const filters = getFilters();
    state.isRunning = true;
    state.isPaused = false;
    state.processedItems = 0;
    state.totalItems = selectedOptions.length * 10;
    
    updateControlButtons();
    showProgress();
    clearLog();
    addLog('Starting cleanup...', 'info');
    
    await simulateCleanup(selectedOptions, filters);
  }

  async function simulateCleanup(options, filters) {
    for (const option of options) {
      if (!state.isRunning) break;
      
      while (state.isPaused && state.isRunning) {
        await new Promise(r => setTimeout(r, 500));
      }
      
      if (!state.isRunning) break;
      
      addLog(`Processing: ${option}...`, 'info');
      
      for (let i = 0; i < 10; i++) {
        if (!state.isRunning) break;
        
        while (state.isPaused && state.isRunning) {
          await new Promise(r => setTimeout(r, 500));
        }
        
        if (!state.isRunning) break;
        
        if (state.dailyUsed >= DAILY_LIMIT) {
          addLog('Daily limit reached!', 'error');
          await stopCleanup();
          return;
        }
        
        await new Promise(r => setTimeout(r, 300 + Math.random() * 200));
        
        state.processedItems++;
        state.dailyUsed++;
        updateProgress();
        
        if (i % 3 === 0) {
          addLog(`${option}: Deleted #${i + 1}`, 'success');
        }
      }
      
      await saveDailyUsage();
    }
    
    if (state.isRunning) {
      addLog('Cleanup completed!', 'success');
      state.isRunning = false;
      updateControlButtons();
    }
  }

  function pauseCleanup() {
    state.isPaused = !state.isPaused;
    updateControlButtons();
    addLog(state.isPaused ? 'Paused' : 'Resumed', 'info');
  }

  async function stopCleanup() {
    state.isRunning = false;
    state.isPaused = false;
    updateControlButtons();
    addLog('Stopped', 'error');
    await saveDailyUsage();
  }

  async function checkXTabStatus() {
    console.log('[X-Eraser] checkXTabStatus called');
    try {
      const patterns = getWebsiteMatchPatterns();
      console.log('[X-Eraser] Querying tabs with patterns:', patterns);
      
      const tabs = await chrome.tabs.query({
        url: patterns
      });
      
      console.log('[X-Eraser] Tabs found:', tabs?.length || 0);
      
      if (tabs && tabs.length > 0) {
        const xTab = tabs[0];
        const currentUrl = xTab.url || '';
        console.log('[X-Eraser] Current URL:', currentUrl);
        
        state.isX = true;
        
        try {
          const response = await chrome.tabs.sendMessage(xTab.id, {
            target: 'content',
            type: 'getStatus'
          });
          console.log('[X-Eraser] Content script response:', response);
          if (response) {
            state.isLoggedIn = response.isLoggedIn || false;
          }
        } catch (e) {
          console.log('[X-Eraser] Could not get status from content script:', e.message);
          state.isLoggedIn = false;
        }
      } else {
        console.log('[X-Eraser] No X tabs found');
        state.isX = false;
        state.isLoggedIn = false;
      }
      
      updateUI();
    } catch (err) {
      console.error('[X-Eraser] Failed to check status:', err);
      state.isX = false;
      state.isLoggedIn = false;
      updateUI();
    }
  }

  function initEventListeners() {
    console.log('[X-Eraser] initEventListeners called');
    elements.btnOpenX?.addEventListener('click', async () => {
      try {
        const tabs = await chrome.tabs.query({
          url: getWebsiteMatchPatterns()
        });
        if (tabs && tabs.length > 0) {
          await chrome.tabs.update(tabs[0].id, { active: true });
        } else {
          await chrome.tabs.create({ url: 'https://x.com' });
        }
      } catch (err) {
        console.error('[X-Eraser] Failed to open X:', err);
      }
    });

    elements.btnStart?.addEventListener('click', startCleanup);
    elements.btnPause?.addEventListener('click', pauseCleanup);
    elements.btnStop?.addEventListener('click', stopCleanup);
    elements.btnCloseProgress?.addEventListener('click', hideProgress);
    elements.btnRefresh?.addEventListener('click', async () => {
      console.log('[X-Eraser] Refresh config button clicked');
      if (elements.refreshIcon) {
        elements.refreshIcon.classList.add('spinning');
      }
      if (elements.btnRefresh) {
        elements.btnRefresh.disabled = true;
      }
      
      try {
        const response = await chrome.runtime.sendMessage({ target: 'refreshConfig' });
        console.log('[X-Eraser] Config refreshed:', response?.refreshed ? 'success' : 'failed');
        if (response?.refreshed && response.config) {
          window.XEraserConfig = {
            getWebsitePatterns() {
              return response.config.selectors?.xWebsite?.patterns || ['x.com', 'twitter.com'];
            },
            getLoginConfig() {
              return response.config.selectors?.login || {};
            },
            getWebsiteMatchPatterns() {
              const patterns = this.getWebsitePatterns();
              return patterns.map(domain => `*://${domain}/*`);
            }
          };
          await checkXTabStatus();
        }
      } catch (error) {
        console.error('[X-Eraser] Failed to refresh config:', error);
      }
      
      if (elements.refreshIcon) {
        elements.refreshIcon.classList.remove('spinning');
      }
      if (elements.btnRefresh) {
        elements.btnRefresh.disabled = false;
      }
    });
  }

  async function init() {
    console.log('[X-Eraser] init started');
    
    i18n = window.XEraseri18n || null;
    console.log('[X-Eraser] i18n loaded:', !!i18n);
    
    initElements();
    initEventListeners();
    
    await loadDailyUsage();
    updateUI();
    
    await checkXTabStatus();
    
    setInterval(checkXTabStatus, 3000);
    console.log('[X-Eraser] init completed');
  }

  console.log('[X-Eraser] Side panel script loaded');
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();