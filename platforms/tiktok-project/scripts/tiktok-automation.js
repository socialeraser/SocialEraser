(function() {
  'use strict';

  class TikTokInjector {
    constructor() {
      this.config = null;
      this.isRunning = false;
      this.isPaused = false;
      this.processedCount = 0;
      this.errorCount = 0;
      this.maxErrors = 10;
      this.filters = null;
      this._dateMissingWarned = new Set();
      this._currentUsername = null;
      this._deletedRepostUrls = [];
      this._deletedLikesUrls = [];
      this.onProgress = null;
      this.onLog = null;
      this.onComplete = null;
      this.onError = null;
      this.onTypeStart = null;
      this.onTypeComplete = null;
    }

    setConfig(config) {
      var merged = {};
      if (config && config.selectors && typeof config.selectors === 'object') {
        merged = Object.assign({}, config.selectors);
      }
      for (var k in merged) {
        if (!merged.hasOwnProperty(k)) continue;
        if (Array.isArray(merged[k])) {
          merged[k] = merged[k].slice();
        } else if (merged[k] && typeof merged[k] === 'object') {
          merged[k] = Object.assign({}, merged[k]);
          for (var f in merged[k]) {
            if (!merged[k].hasOwnProperty(f)) continue;
            if (Array.isArray(merged[k][f])) {
              merged[k][f] = merged[k][f].slice();
            } else if (merged[k][f] && typeof merged[k][f] === 'object') {
              merged[k][f] = Object.assign({}, merged[k][f]);
              for (var nf in merged[k][f]) {
                if (merged[k][f].hasOwnProperty(nf) && Array.isArray(merged[k][f][nf])) {
                  merged[k][f][nf] = merged[k][f][nf].slice();
                }
              }
            }
          }
        }
      }
      this.config = merged;

      var DEFAULT_I18N_REF = (window.TikTokEraseri18n && window.TikTokEraseri18n.DEFAULT_I18N) || {};
      var i18nRemote = (config && config.selectors && config.selectors.i18n) || {};
      this._i18n = {};
      for (var i18nKey in DEFAULT_I18N_REF) {
        if (DEFAULT_I18N_REF.hasOwnProperty(i18nKey)) {
          this._i18n[i18nKey] = (Array.isArray(i18nRemote[i18nKey]) && i18nRemote[i18nKey].length > 0)
            ? i18nRemote[i18nKey].slice()
            : DEFAULT_I18N_REF[i18nKey].slice();
        }
      }
    }

    setCurrentUsername(username) {
      this._currentUsername = (username && typeof username === 'string') ? username : null;
    }

    async _loadDeletedRepostUrls() {
      try {
        var resp = await chrome.runtime.sendMessage({ target: 'readDeletedRepostUrls' });
        if (resp && Array.isArray(resp.urls)) {
          this._deletedRepostUrls = resp.urls.slice();
          this.debug('[TikTok Eraser] Loaded ' + this._deletedRepostUrls.length + ' deleted repost URLs');
        }
      } catch (e) {}
    }

    async _saveDeletedRepostUrls() {
      try {
        await chrome.runtime.sendMessage({
          target: 'writeDeletedRepostUrls',
          urls: this._deletedRepostUrls
        });
      } catch (e) {}
    }

    async _loadDeletedLikesUrls() {
      try {
        var resp = await chrome.runtime.sendMessage({ target: 'readDeletedLikesUrls' });
        if (resp && Array.isArray(resp.urls)) {
          this._deletedLikesUrls = resp.urls.slice();
          this.debug('[TikTok Eraser] Loaded ' + this._deletedLikesUrls.length + ' deleted likes URLs');
        }
      } catch (e) {}
    }

    async _saveDeletedLikesUrls() {
      try {
        await chrome.runtime.sendMessage({
          target: 'writeDeletedLikesUrls',
          urls: this._deletedLikesUrls
        });
      } catch (e) {}
    }

    findElement(selectors, context) {
      if (!selectors) return null;
      if (!context) context = document;

      const selectorList = Array.isArray(selectors) ? selectors : [selectors];

      for (let i = 0; i < selectorList.length; i++) {
        const selector = selectorList[i];
        if (typeof selector === 'string') {
          try {
            const element = context.querySelector(selector);
            if (element) {
              return element;
            }
          } catch (e) {}
        }
      }
      return null;
    }

    findClosest(selectors, element) {
      if (!selectors || !element) return null;
      const selectorList = Array.isArray(selectors) ? selectors : [selectors];
      for (let i = 0; i < selectorList.length; i++) {
        const selector = selectorList[i];
        if (typeof selector === 'string') {
          try {
            const found = element.closest(selector);
            if (found) return found;
          } catch (e) {}
        }
      }
      return null;
    }

    findElements(selectors, context) {
      if (!selectors) return [];
      if (!context) context = document;

      const results = [];
      const selectorList = Array.isArray(selectors) ? selectors : [selectors];

      for (let i = 0; i < selectorList.length; i++) {
        const selector = selectorList[i];
        if (typeof selector === 'string') {
          try {
            const elements = context.querySelectorAll(selector);
            for (let j = 0; j < elements.length; j++) {
              results.push(elements[j]);
            }
          } catch (e) {}
        }
      }
      return results;
    }

    async safeClick(element, delayAfter) {
      if (!element) return false;
      if (delayAfter === undefined) delayAfter = 0;

      try {
        const SCROLL_MAX_FRAMES = 60;
        element.scrollIntoView({ behavior: 'auto', block: 'center' });
        await new Promise(function(resolve) {
          let frames = 0;
          function check() {
            const r = element.getBoundingClientRect();
            if (r.top >= 0 && r.bottom <= window.innerHeight) { resolve(); return; }
            if (frames >= SCROLL_MAX_FRAMES) { resolve(); return; }
            frames++;
            requestAnimationFrame(check);
          }
          requestAnimationFrame(check);
        });

        const rect = element.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) {
          return false;
        }

        try { element.click(); } catch (e) {}

        if (delayAfter > 0) {
          await this.sleep(delayAfter);
        }
        return true;
      } catch (e) {
        this.error('Click failed: ' + e.message);
        return false;
      }
    }

    async scrollToBottom() {
      const MAX_FRAMES = 300;
      const STABLE_FRAMES = 30;

      function getContainerSelector() {
        if (document.querySelectorAll('article').length > 0) return 'article';
        if (document.querySelectorAll("[data-e2e='user-post-item']").length > 0) return "[data-e2e='user-post-item']";
        if (document.querySelectorAll("[data-e2e='user-repost-item']").length > 0) return "[data-e2e='user-repost-item']";
        if (document.querySelectorAll("[data-e2e='user-liked-item']").length > 0) return "[data-e2e='user-liked-item']";
        if (document.querySelectorAll("[data-e2e='user-favorite-item']").length > 0) return "[data-e2e='user-favorite-item']";
        if (document.querySelectorAll("[data-e2e='user-following-item']").length > 0) return "[data-e2e='user-following-item']";
        return null;
      }

      const containerSel = getContainerSelector();
      if (!containerSel) {
        window.scrollTo(0, document.documentElement.scrollHeight);
        await this.sleep(100);
      } else {
        const containers = document.querySelectorAll(containerSel);
        const last = containers[containers.length - 1];
        if (last && last.scrollIntoView) {
          last.scrollIntoView({ behavior: 'auto', block: 'end' });
        } else {
          window.scrollTo(0, document.documentElement.scrollHeight);
        }
      }

      const self = this;
      return new Promise(function(resolve) {
        let totalFrames = 0;
        let stableFrames = 0;
        let lastContainerCount = containerSel
          ? document.querySelectorAll(containerSel).length
          : 0;
        let initialContainerCount = lastContainerCount;
        let rafId;
        let loadedNewContent = false;

        function rafTick() {
          totalFrames++;
          const currentCount = containerSel
            ? document.querySelectorAll(containerSel).length
            : 0;

          if (currentCount === lastContainerCount) {
            stableFrames++;
            if (stableFrames >= STABLE_FRAMES) {
              self.debug('scrollToBottom: stable ' + STABLE_FRAMES + ' frames, containers ' + initialContainerCount + '->' + currentCount);
              cancelAnimationFrame(rafId);
              if (loadedNewContent) {
                window.scrollTo(0, 0);
              }
              resolve(currentCount > initialContainerCount);
              return;
            }
          } else {
            lastContainerCount = currentCount;
            stableFrames = 0;
            loadedNewContent = true;
            if (containerSel) {
              const containers = document.querySelectorAll(containerSel);
              const lastEl = containers[containers.length - 1];
              if (lastEl && lastEl.scrollIntoView) {
                lastEl.scrollIntoView({ behavior: 'auto', block: 'end' });
              }
            }
          }

          if (totalFrames >= MAX_FRAMES) {
            self.debug('scrollToBottom: max frames reached, containers ' + initialContainerCount + '->' + currentCount);
            cancelAnimationFrame(rafId);
            if (loadedNewContent) {
              window.scrollTo(0, 0);
            }
            resolve(currentCount > initialContainerCount);
            return;
          }

          rafId = requestAnimationFrame(rafTick);
        }
        rafId = requestAnimationFrame(rafTick);
      });
    }

    async waitForElement(selector, maxFrames) {
      if (maxFrames === undefined) maxFrames = 600;
      const self = this;

      return new Promise((resolve) => {
        let frameCount = 0;
        const check = () => {
          const element = self.findElement(selector);
          if (element) { resolve(element); return; }
          if (maxFrames > 0 && frameCount >= maxFrames) { resolve(null); return; }
          frameCount++;
          requestAnimationFrame(check);
        };
        requestAnimationFrame(check);
      });
    }

    async waitForMenuItemByText(keywords, timeout) {
      if (!Array.isArray(keywords) || keywords.length === 0) return null;
      const startTime = Date.now();
      const startCount = this.findElements('[role="menuitem"]', document).length;
      while (Date.now() - startTime < timeout) {
        const items = this.findElements('[role="menuitem"]', document);
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          const text = (item.textContent || '').trim();
          const ariaLabel = (item.getAttribute('aria-label') || '').trim();
          for (let j = 0; j < keywords.length; j++) {
            const k = keywords[j];
            if (text.indexOf(k) !== -1 || ariaLabel.indexOf(k) !== -1) {
              return item;
            }
          }
        }
        await this.sleep(150);
      }
      const finalItems = this.findElements('[role="menuitem"]', document);
      const snap = Array.prototype.map.call(finalItems, function(m) {
        return {
          text: (m.textContent || '').trim().substring(0, 40),
          testid: m.getAttribute('data-testid'),
          ariaLabel: (m.getAttribute('aria-label') || '').substring(0, 40)
        };
      });
      this.debug('[waitForMenuItemByText] timeout ' + timeout + 'ms, keywords='
        + JSON.stringify(keywords) + ', menuitemCount=' + finalItems.length
        + ' (startCount=' + startCount + '), snapshot=' + JSON.stringify(snap));
      return null;
    }

    async findButtonByText(keywords, timeout) {
      if (!Array.isArray(keywords) || keywords.length === 0) return null;
      const startTime = Date.now();
      while (Date.now() - startTime < timeout) {
        const buttons = this.findElements('[role="button"]', document);
        for (let i = 0; i < buttons.length; i++) {
          const text = (buttons[i].textContent || '').trim();
          if (keywords.indexOf(text) !== -1) {
            return buttons[i];
          }
        }
        await this.sleep(150);
      }
      return null;
    }

    async sleep(ms) {
      return new Promise(function(resolve) {
        setTimeout(resolve, ms);
      });
    }

    parseViewCount(text) {
      if (!text) return null;
      var t = (text + '').trim();
      if (!t) return null;
      var match = t.match(/^([\d.,]+)\s*([KMB]?)$/i);
      if (!match) return null;
      var num = parseFloat(match[1].replace(/,/g, ''));
      var suffix = (match[2] || '').toUpperCase();
      if (suffix === 'K') return Math.round(num * 1000);
      if (suffix === 'M') return Math.round(num * 1000000);
      if (suffix === 'B') return Math.round(num * 1000000000);
      return Math.round(num);
    }

    async _activateProfileTab(tabName) {
      // 优先用 data-e2e 匹配（MCP 实证，永不翻译，8 语言通用）：
      //   'Liked' → [data-e2e='liked-tab']
      //   'Reposts' → [data-e2e='repost-tab']
      //   'Favorites' → [class*='PFavorite']（TikTok 组件 class，跨语言稳定）
      //   'Following' → [data-e2e='following-tab']
      const e2eMap = {
        'Likes': '[data-e2e="liked-tab"]',
        'Liked': '[data-e2e="liked-tab"]',
        'Reposts': '[data-e2e="repost-tab"]',
        'Repost': '[data-e2e="repost-tab"]',
        'Videos': '[data-e2e="video-tab"]',
        'Video': '[data-e2e="video-tab"]',
        'Favorites': '[class*="PFavorite"]',
        'Favorite': '[class*="PFavorite"]',
        'Following': '[data-e2e="following-tab"]'
      };
      const e2eSelector = e2eMap[tabName];
      if (e2eSelector) {
        try {
          const tab = document.querySelector(e2eSelector);
          if (tab) {
            const selected = tab.getAttribute('aria-selected');
            if (selected !== 'true') {
              await this.safeClick(tab, 500);
            }
            return true;
          }
        } catch (e) {}
      }
      // 兜底：text 匹配（注意：8 语言下 text 不同，严格相等会失败）
      try {
        const tabs = document.querySelectorAll('[role="tab"]');
        for (let i = 0; i < tabs.length; i++) {
          const text = (tabs[i].textContent || '').trim();
          if (text === tabName) {
            const selected = tabs[i].getAttribute('aria-selected');
            if (selected !== 'true') {
              await this.safeClick(tabs[i], 500);
              return true;
            }
            break;
          }
        }
      } catch (e) {}
      return false;
    }

    waitForContentStable(selectors) {
      const STABLE_FRAMES = 30;
      const MAX_IDLE_FRAMES = 600;
      const MAX_SCROLL_TRIGGERS = 3;
      const SCROLL_STABLE_FRAMES = 30;
      const self = this;
      const selectorList = Array.isArray(selectors) ? selectors : [selectors];

      return new Promise(function(resolve) {
        const start = Date.now();
        let lastCount = -1;
        let stableFrameCount = 0;
        let resolved = false;
        let scrollTriggers = 0;
        let totalFrameCount = 0;
        let pendingScrollCheck = 0;

        function getTotalCount() {
          let total = 0;
          for (let s = 0; s < selectorList.length; s++) {
            try {
              total += document.querySelectorAll(selectorList[s]).length;
            } catch (e) {}
          }
          return total;
        }

        function done(count, reason) {
          if (resolved) return;
          resolved = true;
          cancelAnimationFrame(rafId);
          const label = selectorList.length === 1 ? selectorList[0] : selectorList.join('+');
          self.debug('Content stable: ' + count + ' ' + label + ' (' + reason + ', ' + (Date.now() - start) + 'ms, scrolls=' + scrollTriggers + ')');
          resolve(count);
        }

        function triggerScrollLoad() {
          if (scrollTriggers >= MAX_SCROLL_TRIGGERS) return;
          scrollTriggers++;
          window.scrollTo(0, document.documentElement.scrollHeight);
          requestAnimationFrame(function() {
            window.scrollTo(0, 0);
          });
          pendingScrollCheck = SCROLL_STABLE_FRAMES;
          stableFrameCount = 0;
          lastCount = -1;
        }

        let rafId;
        function rafTick() {
          if (resolved) return;
          totalFrameCount++;
          if (pendingScrollCheck > 0) pendingScrollCheck--;

          const count = getTotalCount();

          if (count === lastCount) {
            stableFrameCount++;
            if (count > 0 && stableFrameCount >= STABLE_FRAMES) {
              done(count, 'stable ' + STABLE_FRAMES + ' frames, count=' + count);
              return;
            }
          } else {
            lastCount = count;
            stableFrameCount = 0;
          }

          if (count === 0 && pendingScrollCheck <= 0 && scrollTriggers < MAX_SCROLL_TRIGGERS) {
            triggerScrollLoad();
          }

          if (totalFrameCount >= MAX_IDLE_FRAMES) {
            done(getTotalCount(), 'max frames reached, count=' + getTotalCount());
            return;
          }

          rafId = requestAnimationFrame(rafTick);
        }

        rafId = requestAnimationFrame(rafTick);
        triggerScrollLoad();
      });
    }

    _dismissOverlays() {
      const dismissSelectors = (this.config.common && this.config.common.dismissOverlays) || [];
      for (let i = 0; i < dismissSelectors.length; i++) {
        try {
          const overlay = document.querySelector(dismissSelectors[i]);
          if (overlay) {
            overlay.remove();
          }
        } catch (e) {}
      }
    }

    // 等待 list 重新加载 + 稳定（专门用于 videos 类型删除后）
    // TikTok Studio 删除单条后会 fetch + re-render 整个 list，
    // 期间 button 全部消失，loading skeleton 出现
    // 用 action button 数量作为"list 真的加载完"的判定（比数 row container 更准）
    // 三阶段：
    //   ① appearing: count === 0 等出现
    //   ② stable: count > 0 等 30 帧 stable
    //   ③ confirming: 再 30 帧确认不消失（解决瞬态误判）
    // 空状态快速检测：count === 0 持续 10 秒 → 视为 list 已清空，立即返回 false
    //   （避免删完最后一个 video 后卡 30 秒超时；10 秒已覆盖慢网络场景）
    // maxMs 默认 30 秒终极兜底
    // 返回: true=list 真的稳定了, false=list 已清空或超时
    async _waitForListReloaded(selectors, maxMs) {
      if (!selectors) return true;
      const selectorList = Array.isArray(selectors) ? selectors : [selectors];
      const max = maxMs || 30000;
      const start = Date.now();
      const self = this;
      const EMPTY_FRAMES = 600;  // 10 秒 @ 60fps
      return new Promise(function(resolve) {
        let phase = 'appearing';
        let stableFrameCount = 0;
        let confirmFrameCount = 0;
        let lastCount = 0;
        let emptyFrameCount = 0;

        function check() {
          let total = 0;
          for (let i = 0; i < selectorList.length; i++) {
            try {
              total += document.querySelectorAll(selectorList[i]).length;
            } catch (e) {}
          }

          // 空状态快速检测：连续 N 帧 count === 0 → list 真的空了
          if (total === 0) {
            emptyFrameCount++;
            if (emptyFrameCount >= EMPTY_FRAMES && (Date.now() - start) > 2000) {
              // 至少等 2 秒再判断 empty（避免刚删完还没开始 fetch 时误判）
              self.debug('List reloaded to empty state, ending');
              resolve(false);
              return;
            }
          } else {
            emptyFrameCount = 0;
          }

          if (phase === 'appearing') {
            if (total > 0) {
              lastCount = total;
              stableFrameCount = 0;
              phase = 'stable';
            }
          } else if (phase === 'stable') {
            if (total !== lastCount || total === 0) {
              phase = 'appearing';
              lastCount = 0;
            } else {
              stableFrameCount++;
              if (stableFrameCount >= 30) {
                phase = 'confirming';
                confirmFrameCount = 0;
              }
            }
          } else if (phase === 'confirming') {
            if (total !== lastCount || total === 0) {
              phase = 'appearing';
              lastCount = 0;
              stableFrameCount = 0;
              confirmFrameCount = 0;
            } else {
              confirmFrameCount++;
              if (confirmFrameCount >= 30) {
                self.debug('List reloaded: ' + total + ' buttons stable (1s)');
                resolve(true);
                return;
              }
            }
          }

          if (Date.now() - start >= max) {
            self.debug('List reload timeout after ' + max + 'ms, last count=' + total);
            resolve(total > 0);
            return;
          }
          requestAnimationFrame(check);
        }
        check();
      });
    }

    // 等待 selector 从 DOM 消失（反向 waitForElement）
    // 用于删除后等 modal/toast 完全消失，避免残留状态污染下次 click
    // maxMs: 超时（ms），超时后 resolve 不阻塞后续流程
    _waitForElementGone(selectors, maxMs) {
      if (!selectors) return Promise.resolve(true);
      const selectorList = Array.isArray(selectors) ? selectors : [selectors];
      const start = Date.now();
      const self = this;
      return new Promise(function(resolve) {
        function check() {
          let stillVisible = false;
          for (let i = 0; i < selectorList.length; i++) {
            try {
              if (document.querySelector(selectorList[i])) { stillVisible = true; break; }
            } catch (e) {}
          }
          if (!stillVisible) { resolve(true); return; }
          if (Date.now() - start >= maxMs) { resolve(false); return; }
          requestAnimationFrame(check);
        }
        check();
      });
    }

    shouldFilter(itemType) {
      if (!this.filters) return false;
      return itemType === 'likes' || itemType === 'favorites' || itemType === 'following'
        || itemType === 'videos' || itemType === 'reposts';
    }

    extractMeta(container, itemType) {
      var meta = { dateISO: null, text: '' };
      if (!container) return meta;

      var timeEl = this.findElement(this.config.common && this.config.common.timeElement, container);
      if (timeEl) {
        var dt = timeEl.getAttribute('datetime') || '';
        meta.dateISO = dt.slice(0, 10);
      }

      var parts = [];
      if (itemType === 'following') {
        var userInfoCfg = (this.config.common && this.config.common.userInfo) || {};
        var userCell = this.findElement(userInfoCfg.userCell, container);
        var scope = userCell || container;
        var nameEls = this.findElements(userInfoCfg.userName, scope);
        var bioEl = this.findElement(userInfoCfg.userDescription, scope);
        for (var n = 0; n < nameEls.length; n++) {
          parts.push(nameEls[n].textContent || '');
        }
        if (bioEl) parts.push(bioEl.textContent || '');
      } else {
        var textEls = this.findElements(this.config.common && this.config.common.videoText, container);
        for (var t = 0; t < textEls.length; t++) {
          parts.push(textEls[t].textContent || '');
        }
      }
      meta.text = parts.join(' ').trim();

      return meta;
    }

    matchesFilter(meta, filters) {
      if (!filters) return true;
      if (filters.fromDate && (!meta.dateISO || meta.dateISO < filters.fromDate)) return false;
      if (filters.toDate && (!meta.dateISO || meta.dateISO > filters.toDate)) return false;
      if (filters.keyword) {
        var haystack = (meta.text || '').toLowerCase();
        if (haystack.indexOf(this._keywordLower) < 0) return false;
      }
      return true;
    }

    async startCleanup(options) {
      this.isRunning = true;
      this.isPaused = false;
      this.processedCount = 0;
      this.errorCount = 0;
      this.filters = options.filters || null;
      this._keywordLower = (this.filters && this.filters.keyword)
        ? this.filters.keyword.toLowerCase() : '';

      const types = options.types || [];
      const maxPerType = options.maxPerType || 50;

      for (let i = 0; i < types.length; i++) {
        if (!this.isRunning) break;
        const type = types[i];
        if (this.onTypeStart) this.onTypeStart(type);
        await this.processItems(type, maxPerType);
        if (this.onTypeComplete) this.onTypeComplete(type, this.processedCount);
      }

      if (this.onComplete) {
        this.onComplete({ processed: this.processedCount, errors: this.errorCount });
      }
    }

    pause() {
      this.isPaused = true;
    }

    resume() {
      this.isPaused = false;
    }

    stop() {
      this.isRunning = false;
      this.isPaused = false;
    }

    getStatus() {
      return {
        isRunning: this.isRunning,
        isPaused: this.isPaused,
        processedCount: this.processedCount,
        errorCount: this.errorCount
      };
    }

    async processItems(itemType, maxItems) {
      if (maxItems === undefined) maxItems = 50;

      var CONFIG_KEY_MAP = {
        videos: 'common',
        reposts: 'repost',
        likes: 'like',
        favorites: 'favorite',
        following: 'following'
      };
      var configKey = CONFIG_KEY_MAP[itemType] || itemType;

      if (!this.isRunning) return;

      const selectors = this.config[configKey];
      if (!selectors) {
        this.error('No selectors for ' + itemType);
        return;
      }

      if (itemType === 'videos') {
        await this.processVideos(maxItems);
        return;
      }
      if (itemType === 'reposts') {
        await this.processReposts(maxItems);
        return;
      }
      if (itemType === 'likes') {
        await this.processLikes(maxItems);
        return;
      }
      if (itemType === 'favorites') {
        await this.processFavorites(maxItems);
        return;
      }
      if (itemType === 'following') {
        await this.processFollowing(maxItems);
        return;
      }

      this.error('Unknown itemType: ' + itemType);
    }

    log(message) {
      if (this.onLog) this.onLog(message, 'info');
    }

    error(message) {
      if (this.onError) this.onError(message);
      if (this.onLog) this.onLog(message, 'error');
    }

    debug(message) {
      console.log('[TikTok Eraser]', message);
    }

    progress(message) {
      if (this.onProgress) this.onProgress(this.processedCount, message);
    }

    async processVideos(maxItems) {
      if (maxItems === undefined) maxItems = 50;

      let emptyScrolls = 0;
      const maxEmptyScrolls = 3;

      await this.waitForContentStable(["[data-tt='components_RowLayout_FlexRow']", "[data-tt='components_PostInfoCell_Container']"]);

      var actionBtnSelectors = (this.config.common && Array.isArray(this.config.common.videoActionButton))
        ? this.config.common.videoActionButton : [];

      this.log(t('startingVideosCleanup'));

      if (emptyScrolls === 0) {
        this._diagnosePage();
      }

      var lastProgressTime = Date.now();
      var STUCK_TIMEOUT_MS = 30000;

      while (this.isRunning && this.processedCount < maxItems && this.errorCount < this.maxErrors) {
        if (Date.now() - lastProgressTime > STUCK_TIMEOUT_MS) {
          this.log(t('cleanupStuck'));
          break;
        }
        if (this.isPaused) {
          await this.sleep(500);
          continue;
        }

        let actionButtons = [];
        let matchedSelector = null;
        for (let s = 0; s < actionBtnSelectors.length; s++) {
          actionButtons = this.findElements(actionBtnSelectors[s]);
          if (actionButtons.length > 0) {
            matchedSelector = actionBtnSelectors[s];
            break;
          }
        }

        const pending = actionButtons.filter(function(btn) {
          var p = btn.dataset.socialEraserProcessed;
          return !p || (p !== 'true' && p !== 'skipped');
        });

        if (pending.length === 0) {
          if (actionButtons.length === 0 && emptyScrolls === 1) {
            this.log(t('noMoreVideos'));
            console.log('[TikTok Eraser] Tried selectors:', actionBtnSelectors);
          }
          emptyScrolls++;
          if (emptyScrolls > maxEmptyScrolls) {
            this.log(t('endOfVideos'));
            break;
          }
          const hasMore = await this.scrollToBottom();
          if (!hasMore) {
            this.log(t('endOfVideos'));
            break;
          }
          continue;
        }

        emptyScrolls = 0;

        if (matchedSelector && emptyScrolls === 0) {
          this.log(t('foundButtonsCount', {count: actionButtons.length}));
        }

        const btn = pending[0];

        if (this.shouldFilter('videos')) {
          var row = this.findClosest(this.config.common && this.config.common.videoRowContainer, btn) || btn.parentElement;
          var meta = this.extractMeta(row, 'videos');
          if (!this.matchesFilter(meta, this.filters)) {
            btn.dataset.socialEraserProcessed = 'skipped';
            if ((this.filters.fromDate || this.filters.toDate) && !meta.dateISO
                && !this._dateMissingWarned.has('videos')) {
              this._dateMissingWarned.add('videos');
              this.log(t('dateFilterSkipped', {type: 'videos'}));
            }
            await this.sleep(50);
            continue;
          }
        }

        try {
          // 先清掉可能遮挡 button 的 toast/snackbar/modal（TikTok Studio 删除后
          // 弹的 "Deleted successfully" 通知会覆盖在 video row 上，click 实际点到 toast）
          this._dismissOverlays();

          const ok = await this.safeClick(btn, 500);
          if (!ok) {
            this.errorCount++;
            this.error(t('videoDeleteFailed', {error: 'Action button click failed'}));
            await this.sleep(500);
            continue;
          }

          // 1 秒内找 popover（缩短自 600 帧=10秒，避免单次失败卡 10 秒）
          // TikTok popover 通常 < 200ms 出现；超时说明 click 被遮挡或 selector 失效
          const popoverSelectors = (this.config.common && this.config.common.videoMenuPopover) || [];
          let popover = await this.waitForElement(popoverSelectors, 60);
          if (!popover) {
            // 第一次可能被 toast 遮挡 —— dismiss 后再点一次 button retry
            this.debug('Popover not found on first try, retrying after dismiss');
            this._dismissOverlays();
            await this.sleep(300);
            await this.safeClick(btn, 500);
            popover = await this.waitForElement(popoverSelectors, 60);
          }
          if (!popover) {
            this.errorCount++;
            this.error(t('videoDeleteFailed', {error: 'Popover not found'}));
            await this.sleep(500);
            continue;
          }

          const deleteIconSelectors = (this.config.common && this.config.common.videoMenuDeleteIcon) || [];
          const deleteIcon = this.findElement(deleteIconSelectors, popover);
          if (!deleteIcon) {
            this.errorCount++;
            this.error(t('videoDeleteFailed', {error: 'Delete icon not found'}));
            await this.sleep(500);
            continue;
          }

          const clickableItem = this.findClosest(this.config.common && this.config.common.videoMenuItemClickable, deleteIcon);
          const deleteItem = clickableItem || deleteIcon;

          await this.safeClick(deleteItem, 500);

          const confirmModalSelectors = (this.config.common && this.config.common.videoConfirmModal) || [];
          const confirmModal = await this.waitForElement(confirmModalSelectors, 60);
          if (!confirmModal) {
            this.processedCount++;
            lastProgressTime = Date.now();
            btn.dataset.socialEraserProcessed = 'true';
            this.progress('Video');
            this.log(t('videoDeleted', {count: this.processedCount}));
            await this.sleep(500);
            continue;
          }

          const confirmBtnSelectors = (this.config.common && this.config.common.videoConfirmButton) || [];
          const confirmBtn = await this.waitForElement(confirmBtnSelectors, 60);
          if (confirmBtn) {
            await this.safeClick(confirmBtn, 500);
          }

          btn.dataset.socialEraserProcessed = 'true';
          this.processedCount++;
          lastProgressTime = Date.now();
          this.progress('Video');
          this.log(t('videoDeleted', {count: this.processedCount}));

        } catch (e) {
          this.error(t('videoDeleteFailed', {error: e.message}));
          this.errorCount++;
        }

        // 删除后等 modal/toast 完全消失 + 等 list 重新 fetch + re-render 完成
        // 关键：用 action button 数量（不是 row container）判断 list 是否真的加载完
        // 旧的 waitForContentStable 数 row container，loading skeleton 也算，
        // 导致提前返回 → 回到 while → 找不到 button → end of list
        if (this.isRunning) {
          await this._waitForElementGone((this.config.common && this.config.common.videoConfirmModal) || [], 3000);
          await this._dismissOverlays();
          const listReady = await this._waitForListReloaded(actionBtnSelectors, 30000);
          if (!listReady) {
            // 超时且 list 真的空了 —— 视为 list 已被清空，结束循环
            this.debug('List empty after reload wait, ending videos cleanup');
            this.log(t('endOfVideos'));
            break;
          }
          emptyScrolls = 0;
        }
      }

      if (this.processedCount === 0 && this.filters) {
        this.log(t('noItemsMatched'));
      }
    }

    async processReposts(maxItems) {
      if (maxItems === undefined) maxItems = 50;
      this.processedCount = 0;

      let emptyScrolls = 0;
      const maxEmptyScrolls = 3;

      await this.waitForContentStable(["[data-e2e='user-repost-item']", "[data-e2e='repost']"]);

      var cardSelectors = (this.config.repost && Array.isArray(this.config.repost.repostItem))
        ? this.config.repost.repostItem : [];

      var anchorSelectors = (this.config.common && Array.isArray(this.config.common.videoAnchor))
        ? this.config.common.videoAnchor : [];

      var shareRepostSelectors = (this.config.repost && Array.isArray(this.config.repost.videoShareRepost))
        ? this.config.repost.videoShareRepost : [];

      this.log(t('startingRepostsCleanup'));

      await this._loadDeletedRepostUrls();

      await this._activateProfileTab('转发');

      await this.sleep(1000);

      if (emptyScrolls === 0) {
        this._diagnosePage();
      }

      var lastProgressTime = Date.now();
      var STUCK_TIMEOUT_MS = 30000;

      while (this.isRunning && this.processedCount < maxItems && this.errorCount < this.maxErrors) {
        if (Date.now() - lastProgressTime > STUCK_TIMEOUT_MS) {
          this.log(t('cleanupStuck'));
          break;
        }
        if (this.isPaused) {
          await this.sleep(500);
          continue;
        }

        let cards = [];
        let matchedSelector = null;
        for (let s = 0; s < cardSelectors.length; s++) {
          cards = this.findElements(cardSelectors[s]);
          if (cards.length > 0) {
            matchedSelector = cardSelectors[s];
            break;
          }
        }

        const pending = cards.filter(function(card) {
          var p = card.dataset.socialEraserProcessed;
          return !p || (p !== 'true' && p !== 'skipped');
        });

        if (pending.length === 0) {
          if (cards.length === 0 && emptyScrolls === 1) {
            this.log(t('noMoreReposts'));
            console.log('[TikTok Eraser] Tried selectors:', cardSelectors);
          }
          emptyScrolls++;
          if (emptyScrolls > maxEmptyScrolls) {
            this.log(t('endOfReposts'));
            break;
          }
          const hasMore = await this.scrollToBottom();
          if (!hasMore) {
            this.log(t('endOfReposts'));
            break;
          }
          continue;
        }

        emptyScrolls = 0;

        if (matchedSelector && emptyScrolls === 0) {
          this.log(t('foundButtonsCount', {count: cards.length}));
        }

        const card = pending[0];

        if (this.shouldFilter('reposts')) {
          var meta = this.extractMeta(card, 'reposts');
          if (!this.matchesFilter(meta, this.filters)) {
            card.dataset.socialEraserProcessed = 'skipped';
            if ((this.filters.fromDate || this.filters.toDate) && !meta.dateISO
                && !this._dateMissingWarned.has('reposts')) {
              this._dateMissingWarned.add('reposts');
              this.log(t('dateFilterSkipped', {type: 'reposts'}));
            }
            await this.sleep(50);
            continue;
          }
        }

        try {
          const anchor = this.findElement(anchorSelectors, card);
          if (!anchor) {
            this.errorCount++;
            this.error(t('repostDeleteFailed', {error: 'Video anchor not found'}));
            await this.sleep(500);
            continue;
          }

          const videoUrl = anchor.getAttribute('href');
          if (videoUrl && this._deletedRepostUrls.indexOf(videoUrl) >= 0) {
            card.dataset.socialEraserProcessed = 'true';
            await this.sleep(50);
            continue;
          }

          await this.safeClick(anchor, 1500);

          const exitReason = await this._processRepostBatch(videoUrl, shareRepostSelectors, maxItems, lastProgressTime);

          lastProgressTime = Date.now();

          if (exitReason === 'complete' || exitReason === 'end') {
            break;
          }

          card.dataset.socialEraserProcessed = 'true';
          await this.sleep(50);

        } catch (e) {
          this.error(t('repostDeleteFailed', {error: e.message}));
          this.errorCount++;
          lastProgressTime = Date.now();
          await this.sleep(500);
        }
      }

      if (this.processedCount === 0 && this.filters) {
        this.log(t('noItemsMatched'));
      }
    }

    async _processRepostBatch(startUrl, shareRepostSelectors, maxItems, lastProgressTime) {
      const nextVideoSelectors = this._buildNextVideoSelectors();

      while (this.isRunning && this.processedCount < maxItems && this.errorCount < this.maxErrors) {
        if (Date.now() - lastProgressTime > 30000) {
          this.log(t('cleanupStuck'));
          break;
        }
        if (this.isPaused) {
          await this.sleep(500);
          continue;
        }

        try {
          this._dismissOverlays();

          const currentUrl = window.location.href;
          if (this._deletedRepostUrls.indexOf(currentUrl) >= 0) {
            const nextBtn = await this.waitForElement(nextVideoSelectors, 2000);
            if (nextBtn && nextBtn.disabled !== true) {
              await this.safeClick(nextBtn, 1000);
            } else {
              break;
            }
            continue;
          }

          const shareRepostBtn = await this.waitForElement(shareRepostSelectors, 3000);
          if (!shareRepostBtn) {
            this.errorCount++;
            this.error(t('repostDeleteFailed', {error: 'video-share-repost not found on video page'}));
            const nextBtn = await this.waitForElement(nextVideoSelectors, 2000);
            if (nextBtn && nextBtn.disabled !== true) {
              await this.safeClick(nextBtn, 1000);
            } else {
              break;
            }
            continue;
          }

          await this.safeClick(shareRepostBtn, 500);
          await this.sleep(500);

          this._deletedRepostUrls.push(currentUrl);
          await this._saveDeletedRepostUrls();

          this.processedCount++;
          lastProgressTime = Date.now();
          this.progress('Repost');
          this.log(t('repostDeleted', {count: this.processedCount}));

          if (this.processedCount >= maxItems) {
            this.log(t('repostDeleteComplete', {count: this.processedCount}));
            break;
          }

          const nextBtn = await this.waitForElement(nextVideoSelectors, 2000);
          if (nextBtn && nextBtn.disabled !== true) {
            await this.safeClick(nextBtn, 1000);
          } else {
            break;
          }

        } catch (e) {
          this.error(t('repostDeleteFailed', {error: e.message}));
          this.errorCount++;
          const nextBtn = this.findElement(nextVideoSelectors);
          if (nextBtn && nextBtn.disabled !== true) {
            await this.safeClick(nextBtn, 1000);
          } else {
            break;
          }
        }
      }

      return (this.processedCount >= maxItems) ? 'complete' : 'end';
    }

    _buildNextVideoSelectors() {
      const selectors = ["[data-e2e='arrow-right']"];
      if (this._i18n && Array.isArray(this._i18n.nextVideoKeywords)) {
        this._i18n.nextVideoKeywords.forEach(keyword => {
          selectors.push("button[aria-label*='" + keyword + "']");
        });
      }
      return selectors;
    }

    async processLikes(maxItems) {
      if (maxItems === undefined) maxItems = 50;
      this.processedCount = 0;

      let emptyScrolls = 0;
      const maxEmptyScrolls = 3;

      await this.waitForContentStable(["[data-e2e='user-liked-item']", "[data-e2e='like-icon']"]);

      var cardSelectors = (this.config.like && Array.isArray(this.config.like.likedItem))
        ? this.config.like.likedItem : [];

      var anchorSelectors = (this.config.common && Array.isArray(this.config.common.videoAnchor))
        ? this.config.common.videoAnchor : [];

      var browseLikeSelectors = (this.config.like && Array.isArray(this.config.like.videoBrowseLikeIcon))
        ? this.config.like.videoBrowseLikeIcon : [];

      this.log(t('startingLikesCleanup'));

      await this._loadDeletedLikesUrls();

      await this._activateProfileTab('Likes');

      await this.sleep(1000);

      if (emptyScrolls === 0) {
        this._diagnosePage();
      }

      var lastProgressTime = Date.now();
      var STUCK_TIMEOUT_MS = 30000;

      while (this.isRunning && this.processedCount < maxItems && this.errorCount < this.maxErrors) {
        if (Date.now() - lastProgressTime > STUCK_TIMEOUT_MS) {
          this.log(t('cleanupStuck'));
          break;
        }
        if (this.isPaused) {
          await this.sleep(500);
          continue;
        }

        let cards = [];
        let matchedSelector = null;
        for (let s = 0; s < cardSelectors.length; s++) {
          cards = this.findElements(cardSelectors[s]);
          if (cards.length > 0) {
            matchedSelector = cardSelectors[s];
            break;
          }
        }

        const pending = cards.filter(function(card) {
          var p = card.dataset.socialEraserProcessed;
          return !p || (p !== 'true' && p !== 'skipped');
        });

        if (pending.length === 0) {
          if (cards.length === 0 && emptyScrolls === 1) {
            this.log(t('noMoreLikes'));
            console.log('[TikTok Eraser] Tried selectors:', cardSelectors);
          }
          emptyScrolls++;
          if (emptyScrolls > maxEmptyScrolls) {
            this.log(t('endOfLikes'));
            break;
          }
          const hasMore = await this.scrollToBottom();
          if (!hasMore) {
            this.log(t('endOfLikes'));
            break;
          }
          continue;
        }

        emptyScrolls = 0;

        if (matchedSelector && emptyScrolls === 0) {
          this.log(t('foundButtonsCount', {count: cards.length}));
        }

        const card = pending[0];

        if (this.shouldFilter('likes')) {
          var meta = this.extractMeta(card, 'likes');
          if (!this.matchesFilter(meta, this.filters)) {
            card.dataset.socialEraserProcessed = 'skipped';
            if ((this.filters.fromDate || this.filters.toDate) && !meta.dateISO
                && !this._dateMissingWarned.has('likes')) {
              this._dateMissingWarned.add('likes');
              this.log(t('dateFilterSkipped', {type: 'likes'}));
            }
            await this.sleep(50);
            continue;
          }
        }

        try {
          // likedItem (data-e2e=user-liked-item) 是 DivContainer wrapper div，
          // 内部嵌 a[href*=/video/] 指向 video page。MCP 实证。
          var anchor = this.findElement(anchorSelectors, card);
          if (!anchor) {
            this.errorCount++;
            this.error(t('unlikeFailed', {error: 'Video anchor not found'}));
            await this.sleep(500);
            continue;
          }

          const videoUrl = anchor.getAttribute('href');
          if (videoUrl && this._deletedLikesUrls.indexOf(videoUrl) >= 0) {
            card.dataset.socialEraserProcessed = 'true';
            await this.sleep(50);
            continue;
          }

          await this.safeClick(anchor, 1500);

          const exitReason = await this._processLikesBatch(videoUrl, browseLikeSelectors, maxItems, lastProgressTime);

          lastProgressTime = Date.now();

          if (exitReason === 'complete' || exitReason === 'end') {
            break;
          }

          card.dataset.socialEraserProcessed = 'true';
          await this.sleep(50);

        } catch (e) {
          this.error(t('unlikeFailed', {error: e.message}));
          this.errorCount++;
          lastProgressTime = Date.now();
          await this.sleep(500);
        }
      }

      if (this.processedCount === 0 && this.filters) {
        this.log(t('noItemsMatched'));
      }
    }

    async _processLikesBatch(startUrl, browseLikeSelectors, maxItems, lastProgressTime) {
      const nextVideoSelectors = this._buildNextVideoSelectors();

      while (this.isRunning && this.processedCount < maxItems && this.errorCount < this.maxErrors) {
        if (Date.now() - lastProgressTime > 30000) {
          this.log(t('cleanupStuck'));
          break;
        }
        if (this.isPaused) {
          await this.sleep(500);
          continue;
        }

        try {
          this._dismissOverlays();

          const currentUrl = window.location.href;
          if (this._deletedLikesUrls.indexOf(currentUrl) >= 0) {
            const nextBtn = await this.waitForElement(nextVideoSelectors, 2000);
            if (nextBtn && nextBtn.disabled !== true) {
              await this.safeClick(nextBtn, 1000);
            } else {
              break;
            }
            continue;
          }

          const browseLikeBtn = await this.waitForElement(browseLikeSelectors, 3000);
          if (!browseLikeBtn) {
            this.errorCount++;
            this.error(t('unlikeFailed', {error: 'browse-like-icon not found on video page'}));
            const nextBtn = await this.waitForElement(nextVideoSelectors, 2000);
            if (nextBtn && nextBtn.disabled !== true) {
              await this.safeClick(nextBtn, 1000);
            } else {
              break;
            }
            continue;
          }

          await this.safeClick(browseLikeBtn, 500);
          await this.sleep(500);

          this._deletedLikesUrls.push(currentUrl);
          await this._saveDeletedLikesUrls();

          this.processedCount++;
          lastProgressTime = Date.now();
          this.progress('Unlike');
          this.log(t('clickedUnlike', {count: this.processedCount}));

          if (this.processedCount >= maxItems) {
            this.log(t('likesDeleteComplete', {count: this.processedCount}));
            break;
          }

          const nextBtn = await this.waitForElement(nextVideoSelectors, 2000);
          if (nextBtn && nextBtn.disabled !== true) {
            await this.safeClick(nextBtn, 1000);
          } else {
            break;
          }

        } catch (e) {
          this.error(t('unlikeFailed', {error: e.message}));
          this.errorCount++;
          const nextBtn = this.findElement(nextVideoSelectors);
          if (nextBtn && nextBtn.disabled !== true) {
            await this.safeClick(nextBtn, 1000);
          } else {
            break;
          }
        }
      }

      return (this.processedCount >= maxItems) ? 'complete' : 'end';
    }

    async processFavorites(maxItems) {
      if (maxItems === undefined) maxItems = 50;

      let emptyScrolls = 0;
      const maxEmptyScrolls = 3;

      await this._activateProfileTab('Favorites');
      await this.waitForContentStable(["[data-e2e='favorite-icon']", "[data-e2e='user-favorite-item']"]);

      var unfavoriteSelectors = (this.config.favorite && Array.isArray(this.config.favorite.unfavoriteButtons))
        ? this.config.favorite.unfavoriteButtons : [];

      this.log(t('startingFavoritesCleanup'));

      if (emptyScrolls === 0) {
        this._diagnosePage();
      }

      var lastProgressTime = Date.now();
      var STUCK_TIMEOUT_MS = 30000;

      while (this.isRunning && this.processedCount < maxItems && this.errorCount < this.maxErrors) {
        if (Date.now() - lastProgressTime > STUCK_TIMEOUT_MS) {
          this.log(t('cleanupStuck'));
          break;
        }
        if (this.isPaused) {
          await this.sleep(500);
          continue;
        }

        let unfavoriteButtons = [];
        let matchedSelector = null;
        for (let s = 0; s < unfavoriteSelectors.length; s++) {
          unfavoriteButtons = this.findElements(unfavoriteSelectors[s]);
          if (unfavoriteButtons.length > 0) {
            matchedSelector = unfavoriteSelectors[s];
            break;
          }
        }

        const pending = unfavoriteButtons.filter(function(btn) {
          var p = btn.dataset.socialEraserProcessed;
          return !p || (p !== 'true' && p !== 'skipped');
        });

        if (pending.length === 0) {
          if (unfavoriteButtons.length === 0 && emptyScrolls === 1) {
            this.log(t('noUnfavoriteButtons'));
            console.log('[TikTok Eraser] Tried selectors:', unfavoriteSelectors);
          }
          emptyScrolls++;
          if (emptyScrolls > maxEmptyScrolls) {
            this.log(t('noMoreFavorites'));
            break;
          }
          const hasMore = await this.scrollToBottom();
          if (!hasMore) {
            this.log(t('endOfFavorites'));
            break;
          }
          continue;
        }

        emptyScrolls = 0;

        if (matchedSelector && emptyScrolls === 0) {
          this.log(t('foundButtonsCount', {count: unfavoriteButtons.length}));
        }

        const btn = pending[0];

        if (this.shouldFilter('favorites')) {
          var article = this.findClosest(this.config.common && this.config.common.articleContainers, btn) || btn.parentElement;
          var meta = this.extractMeta(article, 'favorites');
          if (!this.matchesFilter(meta, this.filters)) {
            btn.dataset.socialEraserProcessed = 'skipped';
            if ((this.filters.fromDate || this.filters.toDate) && !meta.dateISO
                && !this._dateMissingWarned.has('favorites')) {
              this._dateMissingWarned.add('favorites');
              this.log(t('dateFilterSkipped', {type: 'favorites'}));
            }
            await this.sleep(50);
            continue;
          }
        }

        try {
          const ok = await this.safeClick(btn, 800);
          if (ok) {
            btn.dataset.socialEraserProcessed = 'true';
            this.processedCount++;
            lastProgressTime = Date.now();
            this.progress('Unfavorite');
            this.log(t('clickedUnfavorite', {count: this.processedCount}));
          } else {
            this.errorCount++;
            this.error(t('clickReturnedFalseUnfavorite'));
          }
        } catch (e) {
          this.error(t('unfavoriteFailed', {error: e.message}));
          this.errorCount++;
        }

        await this.sleep(500);
      }

      if (this.processedCount === 0 && this.filters) {
        this.log(t('noItemsMatched'));
      }
    }

    async processFollowing(maxItems) {
      if (maxItems === undefined) maxItems = 50;

      let emptyScrolls = 0;
      const maxEmptyScrolls = 3;

      await this._activateProfileTab('Following');
      await this.waitForContentStable(["[data-e2e='follow-button']", "[data-e2e='user-following-item']"]);

      var unfollowSelectors = (this.config.following && Array.isArray(this.config.following.unfollowButtons))
        ? this.config.following.unfollowButtons : [];

      const confirmSel = (this.config && this.config.following && this.config.following.confirmButton)
        || (this.config && this.config.common && this.config.common.confirmButton && this.config.common.confirmButton[0]);

      this.log(t('startingFollowingCleanup'));

      if (emptyScrolls === 0) {
        this._diagnosePage();
      }

      var lastProgressTime = Date.now();
      var STUCK_TIMEOUT_MS = 30000;

      while (this.isRunning && this.processedCount < maxItems && this.errorCount < this.maxErrors) {
        if (Date.now() - lastProgressTime > STUCK_TIMEOUT_MS) {
          this.log(t('cleanupStuck'));
          break;
        }
        if (this.isPaused) {
          await this.sleep(500);
          continue;
        }

        let unfollowButtons = [];
        let matchedSelector = null;
        for (let s = 0; s < unfollowSelectors.length; s++) {
          unfollowButtons = this.findElements(unfollowSelectors[s]);
          if (unfollowButtons.length > 0) {
            matchedSelector = unfollowSelectors[s];
            break;
          }
        }

        const pending = unfollowButtons.filter(function(btn) {
          var p = btn.dataset.socialEraserProcessed;
          return !p || (p !== 'true' && p !== 'skipped');
        });

        if (pending.length === 0) {
          if (unfollowButtons.length === 0 && emptyScrolls === 1) {
            this.log(t('noUnfollowButtons'));
            console.log('[TikTok Eraser] Tried selectors:', unfollowSelectors);
          }
          emptyScrolls++;
          if (emptyScrolls > maxEmptyScrolls) {
            this.log(t('noMoreFollowing'));
            break;
          }
          const hasMore = await this.scrollToBottom();
          if (!hasMore) {
            this.log(t('endOfFollowing'));
            break;
          }
          continue;
        }

        emptyScrolls = 0;

        if (matchedSelector && emptyScrolls === 0) {
          this.log(t('foundButtonsCount', {count: unfollowButtons.length}));
        }

        const btn = pending[0];

        if (this.shouldFilter('following')) {
          var cell = this.findClosest(this.config.common && this.config.common.articleContainers, btn) || btn.parentElement;
          var meta = this.extractMeta(cell, 'following');
          if (!this.matchesFilter(meta, this.filters)) {
            btn.dataset.socialEraserProcessed = 'skipped';
            if ((this.filters.fromDate || this.filters.toDate) && !meta.dateISO
                && !this._dateMissingWarned.has('following')) {
              this._dateMissingWarned.add('following');
              this.log(t('dateFilterSkipped', {type: 'following'}));
            }
            await this.sleep(50);
            continue;
          }
        }

        try {
          const ok1 = await this.safeClick(btn, 500);
          if (!ok1) {
            this.errorCount++;
            this.error(t('clickReturnedFalse'));
            await this.sleep(500);
            continue;
          }

          btn.dataset.socialEraserProcessed = 'true';

          const [confirmByTestid, confirmByText] = await Promise.all([
            this.waitForElement(confirmSel, 100),
            this.findButtonByText(this._i18n.unfollowKeywords, 1500)
          ]);
          const confirmButton = confirmByTestid || confirmByText;

          if (confirmButton) {
            const ok2 = await this.safeClick(confirmButton, 500);
            if (ok2) {
              this.processedCount++;
              lastProgressTime = Date.now();
              this.progress('Unfollow');
              this.log(t('clickedUnfollow', {count: this.processedCount}));
            } else {
              this.errorCount++;
              this.error(t('clickReturnedFalseConfirm'));
            }
          } else {
            this.processedCount++;
            lastProgressTime = Date.now();
            this.progress('Unfollow');
            this.log(t('unfollowedNoConfirm', {count: this.processedCount}));
          }
        } catch (e) {
          this.error(t('unfollowFailed', {error: e.message}));
          this.errorCount++;
        }

        await this.sleep(500);
      }

      if (this.processedCount === 0 && this.filters) {
        this.log(t('noItemsMatched'));
      }
    }

    _diagnosePage() {
      var testidCount = document.querySelectorAll('[data-e2e]').length;
      var labeledButtons = document.querySelectorAll('[aria-label]').length;
      this.debug('[diagnostic] data-e2e elements: ' + testidCount);
      this.debug('[diagnostic] aria-label elements: ' + labeledButtons);
    }
  }

  window.TikTokInjector = TikTokInjector;
})();