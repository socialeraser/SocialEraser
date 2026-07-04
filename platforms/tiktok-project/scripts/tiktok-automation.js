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
      this._isAutoResume = false;
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

    // "At most once" 取消按钮保证：依靠 selector [data-e2e='browse-favorite-icon'] /
    // [data-e2e='browse-like-icon'] 等只匹配 favorited/liked 状态的 button。
    // 按钮已经是 unfavorited/unliked 状态时，selector 不匹配，wait timeout 后 click next，
    // 整段逻辑天然不会重复点同一视频的 cancel 按钮 — 不需要 session storage 也不需要 in-memory Set。
    // 旧的 _loadDeleted*Urls / _saveDeleted*Urls / _resetDeletedUrlsIfNotResume 整套机制已移除。
    // project memory 铁律：所有 selector 走 config，不写死；URL 列表机制本身不健壮、且对几千个收藏效率差。

    // 读 config.common.waitForContentStableByType[type] 拿 processXxx 用的 stable selector 数组。
    // 不在 .js 里硬编码 data-e2e，所有 processXxx 都走这个 helper → 单一来源。
    _stableSelectorsFor(type) {
      const map = (this.config && this.config.common
        && this.config.common.waitForContentStableByType
        && typeof this.config.common.waitForContentStableByType === 'object')
        ? this.config.common.waitForContentStableByType : {};
      return (map[type] && Array.isArray(map[type])) ? map[type].slice() : [];
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
      const inst = this;

      function getContainerSelector() {
        // 'article' 优先：通用 HTML 元素，所有 SPA 渲染都会保留
        if (document.querySelectorAll('article').length > 0) return 'article';
        // 其余探针读 config，避免在 .js 里硬编码 data-e2e
        const probes = (inst.config && inst.config.common && Array.isArray(inst.config.common.contentContainerProbes))
          ? inst.config.common.contentContainerProbes : [];
        for (let i = 0; i < probes.length; i++) {
          if (document.querySelectorAll(probes[i]).length > 0) return probes[i];
        }
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
      const e2eMap = (this.config && this.config.common && this.config.common.profileTabs
        && typeof this.config.common.profileTabs === 'object')
        ? this.config.common.profileTabs : {};
      const e2eSelector = e2eMap[tabName];
      if (!e2eSelector) {
        this.debug('[TikTok Eraser] _activateProfileTab: unknown tabName "' + tabName + '", falling back to text match');
      }

      const MAX_WAIT_MS = 10000;
      const POLL_INTERVAL_MS = 100;
      const startTime = Date.now();

      while (Date.now() - startTime < MAX_WAIT_MS) {
        if (!this.isRunning) return false;

        if (e2eSelector) {
          try {
            const tab = document.querySelector(e2eSelector);
            if (tab) {
              if (tab.tagName === 'A') {
                await this.safeClick(tab, 500);
                return true;
              }
              const selected = tab.getAttribute('aria-selected');
              if (selected !== 'true') {
                await this.safeClick(tab, 500);
              }
              return true;
            }
          } catch (e) {}
        }

        try {
          const tabs = document.querySelectorAll('[role="tab"]');
          for (let i = 0; i < tabs.length; i++) {
            const text = (tabs[i].textContent || '').trim();
            if (text === tabName) {
              const selected = tabs[i].getAttribute('aria-selected');
              if (selected !== 'true') {
                await this.safeClick(tabs[i], 500);
              }
              return true;
            }
          }
        } catch (e) {}

        await new Promise(function(r) { setTimeout(r, POLL_INTERVAL_MS); });
      }

      this.debug('[TikTok Eraser] _activateProfileTab: timed out waiting for tab "' + tabName + '"');
      return false;
    }

    async _refreshPageAndWait() {
      return new Promise(function(resolve) {
        const MAX_WAIT_MS = 15000;
        const startTime = Date.now();

        function onPageReady() {
          window.removeEventListener('load', onPageReady);
          resolve();
        }

        if (document.readyState === 'complete') {
          window.addEventListener('load', onPageReady);
          window.location.reload();
        } else {
          window.location.reload();
          window.addEventListener('load', onPageReady);
        }

        setTimeout(function() {
          window.removeEventListener('load', onPageReady);
          resolve();
        }, MAX_WAIT_MS);
      });
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
      this._isAutoResume = options.isAutoResume === true;

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

      var cardSelectors = (this.config.repost && Array.isArray(this.config.repost.repostItem))
        ? this.config.repost.repostItem : [];

      var anchorSelectors = (this.config.common && Array.isArray(this.config.common.videoAnchor))
        ? this.config.common.videoAnchor : [];

      var shareRepostSelectors = (this.config.repost && Array.isArray(this.config.repost.videoShareRepost))
        ? this.config.repost.videoShareRepost : [];

      this.log(t('startingRepostsCleanup'));

      const activated = await this._activateProfileTab('Reposts');
      if (!activated) {
        this.log(t('noMoreReposts'));
        return;
      }

      await this.waitForContentStable(this._stableSelectorsFor('reposts'));

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

          await this.safeClick(anchor, 1500);

          const exitReason = await this._processRepostBatch(maxItems, lastProgressTime);

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

    async _processRepostBatch(maxItems, lastProgressTime) {
      const nextVideoSelectors = this._buildNextVideoSelectors();

      // 8 语言"已转发"状态 aria-label 实测值（2026-07-02 MCP 浏览器对 l702362 视频实测）
      // 之前我猜的多项错误：pt-BR/es-ES/de-DE/fr-FR 真实 aria-label 跟我猜的完全不一样
      // 8 种都是独特的措辞，**绝不能用 substring 模糊匹配**（'Remove' 在 7 种非英语里都不存在）
      const repostedAriaLabels = new Set([
        'Remove repost',          // en
        '移除转发',                // zh-Hans
        '再投稿を削除',             // ja-JP
        '리포스트 삭제',             // ko-KR
        'Remover republicação',   // pt-BR
        'Eliminar la publicación compartida', // es-ES
        'Erneute Veröffentlichung entfernen',  // de-DE
        'Supprimer la republication' // fr-FR
      ]);

      // 检测"已转发"状态：a#icon-element-repost 元素存在 + aria-label 匹配 8 语言任一变体
      // 关键修复：之前 `[data-e2e='video-share-repost']` selector 不带 aria-label 过滤，
      // 同一元素在「Repost」/「Remove repost」状态都会匹配，会重复点击导致 reposts 反向重新添加
      function isRepostedState() {
        const el = document.querySelector('a#icon-element-repost');
        if (!el) return false;
        return repostedAriaLabels.has(el.getAttribute('aria-label'));
      }

      function getRepostElement() {
        return document.querySelector('a#icon-element-repost');
      }

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

          // 2026-07-02 关键修复：必须先用 aria-label 等值匹配判断「已转发」状态
          // 不再用模糊 selector 匹配（同一元素在「Repost」/「Remove repost」状态都命中）
          if (!isRepostedState()) {
            // 元素不存在 或 aria-label 是「Repost」类（未转发状态）→ 跳过
            // 注意：未转发状态下 a#icon-element-repost 也存在（aria-label='Repost' 类变体），
            // 不能盲目点，否则会反向 re-repost。
            const el = getRepostElement();
            const aria = el ? el.getAttribute('aria-label') : null;
            this.log(t('repostSkipNotReposted', {exists: !!el, aria: JSON.stringify(aria)}));
            const nextBtn = await this.waitForElement(nextVideoSelectors, 2000);
            if (nextBtn && nextBtn.disabled !== true) {
              await this.safeClick(nextBtn, 1000);
            } else {
              break;
            }
            continue;
          }

          // 二次确认：在 isRepostedState() 返回 true 之后立刻再查一次，防止 race
          const cancelBtn = getRepostElement();
          if (!cancelBtn) {
            this.errorCount++;
            this.error(t('repostDeleteFailed', {error: 'a#icon-element-repost disappeared'}));
            const nextBtn = await this.waitForElement(nextVideoSelectors, 2000);
            if (nextBtn && nextBtn.disabled !== true) {
              await this.safeClick(nextBtn, 1000);
            } else {
              break;
            }
            continue;
          }

          const beforeAria = cancelBtn.getAttribute('aria-label');
          await this.safeClick(cancelBtn, 500);
          await this.sleep(500);

          // 验证：取消后 aria-label 应该变成「Repost」类（未转发状态）
          // 如果还是「Remove repost」类说明 click 没生效
          if (isRepostedState()) {
            // retry 一次
            const retryBtn = getRepostElement();
            if (retryBtn) {
              await this.safeClick(retryBtn, 500);
              await this.sleep(500);
            }
            if (isRepostedState()) {
              this.errorCount++;
              this.error(t('repostDeleteFailed', {error: 'aria-label not flipped after click (before=' + beforeAria + ' after=' + (getRepostElement() || {}).getAttribute('aria-label') + ')'}));
              const nextBtn = await this.waitForElement(nextVideoSelectors, 2000);
              if (nextBtn && nextBtn.disabled !== true) {
                await this.safeClick(nextBtn, 1000);
              } else {
                break;
              }
              continue;
            }
          }

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
      const selectors = (this.config && this.config.common && Array.isArray(this.config.common.nextVideoArrow))
        ? this.config.common.nextVideoArrow.slice() : [];
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

      var cardSelectors = (this.config.like && Array.isArray(this.config.like.likedItem))
        ? this.config.like.likedItem : [];

      var anchorSelectors = (this.config.common && Array.isArray(this.config.common.videoAnchor))
        ? this.config.common.videoAnchor : [];

      const browseLikeSelectors = (this.config.like && Array.isArray(this.config.like.videoBrowseLikeIcon))
            ? this.config.like.videoBrowseLikeIcon : [];

      this.log(t('startingLikesCleanup'));

      const activated = await this._activateProfileTab('Liked');
      if (!activated) {
        this.log(t('noMoreLikes'));
        return;
      }

      await this.waitForContentStable(this._stableSelectorsFor('likes'));

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

          await this.safeClick(anchor, 1500);

          const exitReason = await this._processLikesBatch(maxItems, lastProgressTime);

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

    async _processLikesBatch(maxItems, lastProgressTime) {
      const nextVideoSelectors = this._buildNextVideoSelectors();
      const browseLikeSelectors = (this.config.like && Array.isArray(this.config.like.videoBrowseLikeIcon))
        ? this.config.like.videoBrowseLikeIcon : [];

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

          // browse-like-icon 是 SPAN，React onClick 绑在 parent button 上。
          // 直接点 SPAN 在 React 17+ event delegation 下也能冒泡触发，但保险起见显式点 button。
          const likeClickTarget = (browseLikeBtn && browseLikeBtn.tagName === 'BUTTON')
            ? browseLikeBtn
            : (browseLikeBtn && browseLikeBtn.closest && browseLikeBtn.closest('button')) || browseLikeBtn;

          // 2026-07-03 修复 P1-4 重复点赞漏洞（实测修订 - 彻底删 retry）：
          //   关键教训：实测发现 TikTok unfavorite 后的 DOM 状态翻得很慢（500ms-2s），
          //   第一次 click 后 `browse-favorite-icon` 仍匹配，**如果 retry 再点一次就会把刚取消的重新 favorite 回去**
          //   （= 点两次 = 净 0 操作，遗留 1 条 = 用户报的 bug）。
          //   之前 P1-4 用 aria-pressed 守门是错的（TikTok button 不设 aria-pressed），
          //   改用 selector 重查 + retry 是更糟的方案（触发了"点两次还原"的 bug）。
          //   **正确做法：完全删除 retry / sanity-check click**。"at most once" 保证靠：
          //     1. 入口 selector `browse-like-icon` 只匹配"已点赞"状态（project memory 铁律）
          //     2. processLikes 顶层 `card.dataset.socialEraserProcessed = 'true'`
          //        防止同一 card 被重新选中
          //     3. video detail 页 next 按钮推进到下一视频，不会回退
          //   第一次 click 后立即推进 processedCount，不做任何 selector 重查或 retry。
          await this.safeClick(likeClickTarget, 500);
          await this.sleep(500);

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
      this.processedCount = 0;

      let emptyScrolls = 0;
      const maxEmptyScrolls = 3;

      var cardSelectors = (this.config.favorite && Array.isArray(this.config.favorite.favoriteItem))
        ? this.config.favorite.favoriteItem : [];

      var anchorSelectors = (this.config.common && Array.isArray(this.config.common.videoAnchor))
        ? this.config.common.videoAnchor : [];

      this.log(t('startingFavoritesCleanup'));

      const activated = await this._activateProfileTab('Favorites');
      if (!activated) {
        this.log(t('noMoreFavorites'));
        return;
      }

      await this.waitForContentStable(this._stableSelectorsFor('favorites'));

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
            this.log(t('noMoreFavorites'));
            console.log('[TikTok Eraser] Tried selectors:', cardSelectors);
          }
          emptyScrolls++;
          if (emptyScrolls > maxEmptyScrolls) {
            this.log(t('endOfFavorites'));
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
          this.log(t('foundButtonsCount', {count: cards.length}));
        }

        const card = pending[0];

        if (this.shouldFilter('favorites')) {
          var meta = this.extractMeta(card, 'favorites');
          if (!this.matchesFilter(meta, this.filters)) {
            card.dataset.socialEraserProcessed = 'skipped';
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
          var anchor = this.findElement(anchorSelectors, card);
          if (!anchor) {
            this.errorCount++;
            this.error(t('unfavoriteFailed', {error: 'Video anchor not found'}));
            await this.sleep(500);
            continue;
          }

          await this.safeClick(anchor, 1500);

          const exitReason = await this._processFavoritesBatch(maxItems, lastProgressTime);

          lastProgressTime = Date.now();

          if (exitReason === 'complete' || exitReason === 'end') {
            break;
          }

          card.dataset.socialEraserProcessed = 'true';
          await this.sleep(50);

        } catch (e) {
          this.error(t('unfavoriteFailed', {error: e.message}));
          this.errorCount++;
          lastProgressTime = Date.now();
          await this.sleep(500);
        }
      }

      if (this.processedCount === 0 && this.filters) {
        this.log(t('noItemsMatched'));
      }
    }

    async _processFavoritesBatch(maxItems, lastProgressTime) {
      const nextVideoSelectors = this._buildNextVideoSelectors();
      const browseFavoriteSelectors = (this.config.favorite && Array.isArray(this.config.favorite.videoBrowseFavoriteIcon))
        ? this.config.favorite.videoBrowseFavoriteIcon : [];

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

          const browseFavoriteBtn = await this.waitForElement(browseFavoriteSelectors, 3000);
          if (!browseFavoriteBtn) {
            this.errorCount++;
            this.error(t('unfavoriteFailed', {error: 'browse-favorite-icon not found on video page'}));
            const nextBtn = await this.waitForElement(nextVideoSelectors, 2000);
            if (nextBtn && nextBtn.disabled !== true) {
              await this.safeClick(nextBtn, 1000);
            } else {
              break;
            }
            continue;
          }

          // browse-favorite-icon 是 SPAN，React onClick 绑在 parent button 上。
          // 直接点 SPAN 在 React 17+ event delegation 下也能冒泡触发，但保险起见显式点 button。
          const favoriteClickTarget = (browseFavoriteBtn && browseFavoriteBtn.tagName === 'BUTTON')
            ? browseFavoriteBtn
            : (browseFavoriteBtn && browseFavoriteBtn.closest && browseFavoriteBtn.closest('button')) || browseFavoriteBtn;

          // 2026-07-03 修复 P1-5 重复收藏漏洞（镜像 P1-4 点赞修复，**彻底删 retry**）：
          //   实测日志时序：
          //     12:04:03 [Favorites] Retry: selector still matches after click, trying again
          //     12:04:04 Clicked unfavorite button #1
          //     12:04:06 [Favorites] Skip: selector still matches after retry (...)
          //   即：第一次 click → 等 500ms+500ms → 重查 selector 仍匹配（DOM 翻状态有延迟）
          //     → retry 又点一次（**重新 favorite 回去**）→ 用户报"遗留 1 条没删干净"
          //   **彻底删 retry 块**，不重查 selector，直接推进 processedCount。
          //   "at most once" 保证靠 processFavorites 顶层 card.dataset.socialEraserProcessed
          //   + video detail 不会回退到同一 video。
          await this.safeClick(favoriteClickTarget, 500);
          await this.sleep(500);

          this.processedCount++;
          lastProgressTime = Date.now();
          this.progress('Unfavorite');
          this.log(t('clickedUnfavorite', {count: this.processedCount}));

          if (this.processedCount >= maxItems) {
            this.log(t('favoritesDeleteComplete', {count: this.processedCount}));
            break;
          }

          const nextBtn = await this.waitForElement(nextVideoSelectors, 2000);
          if (nextBtn && nextBtn.disabled !== true) {
            await this.safeClick(nextBtn, 1000);
          } else {
            break;
          }

        } catch (e) {
          this.error(t('unfavoriteFailed', {error: e.message}));
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

    async processFollowing(maxItems) {
      if (maxItems === undefined) maxItems = 50;

      let emptyScrolls = 0;
      const maxEmptyScrolls = 3;

      await this._activateProfileTab('Following');
      await this.waitForContentStable(this._stableSelectorsFor('following'));

      var unfollowSelectors = (this.config.following && Array.isArray(this.config.following.unfollowButtons))
        ? this.config.following.unfollowButtons : [];

      const confirmSel = (this.config && this.config.following && this.config.following.confirmButton)
        || (this.config && this.config.common && this.config.common.confirmButton && this.config.common.confirmButton[0]);

      this.log(t('startingFollowingCleanup'));

      // 2026-07-04 空状态早退：未登录或用户 0 关注时，following item 容器不存在，
      // 默认 config 的 unfollowButtons 可能会误匹配侧边栏 nav 按钮 (aria-label='Following'/'已关注')
      // 或"建议关注"卡片的 Follow 按钮 (data-e2e='card-followbutton')，导致脚本假成功 processedCount++。
      // 守门：必须在 [data-e2e='user-following-item'] 容器内才算真正的 unfollow 按钮。
      const followingItemSelectors = (this.config.following && Array.isArray(this.config.following.followingItem)
        && this.config.following.followingItem.length > 0)
        ? this.config.following.followingItem : [];
      var followingItemCount = 0;
      for (let fi = 0; fi < followingItemSelectors.length; fi++) {
        followingItemCount += this.findElements(followingItemSelectors[fi]).length;
      }
      if (followingItemCount === 0) {
        this.log(t('noMoreFollowing'));
        console.log('[TikTok Eraser] Following: 0 following item (' + JSON.stringify(followingItemSelectors) + '), skip (empty state / suggested accounts)');
        if (this.onTypeComplete) this.onTypeComplete('following', this.processedCount);
        return;
      }

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
      const diag = (this.config && this.config.common && this.config.common.diagnostic
        && typeof this.config.common.diagnostic === 'object')
        ? this.config.common.diagnostic : {};
      const e2eSel = (Array.isArray(diag.dataE2eElements) && diag.dataE2eElements[0])
        ? diag.dataE2eElements[0] : '[data-e2e]';
      const ariaSel = (Array.isArray(diag.ariaLabelElements) && diag.ariaLabelElements[0])
        ? diag.ariaLabelElements[0] : '[aria-label]';
      var testidCount = document.querySelectorAll(e2eSel).length;
      var labeledButtons = document.querySelectorAll(ariaSel).length;
      this.debug('[diagnostic] data-e2e elements: ' + testidCount);
      this.debug('[diagnostic] aria-label elements: ' + labeledButtons);
    }
  }

  window.TikTokInjector = TikTokInjector;
})();