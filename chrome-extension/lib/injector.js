// X-Eraser Injector
// 健壮的 DOM 操作引擎，支持远程配置选择器

(function() {
  'use strict';

  const DEFAULT_SELECTORS = {
    tweet: {
      container: "[data-testid='tweet']",
      moreButton: "[data-testid='caret']",
      deleteButton: "[data-testid='Delete']",
      confirmButton: "[data-testid='confirmationSheetConfirm']"
    },
    like: {
      container: "[data-testid='tweet'], [data-testid='cellInnerDiv']",
      unlikeButton: "[data-testid='unlike'], [data-testid='unretweet']"
    },
    bookmark: {
      container: "[data-testid='tweet']",
      removeButton: "[data-testid='removeBookmark']"
    },
    following: {
      container: "[data-testid='UserAvatar']",
      unfollowButton: "[data-testid='unfollow']"
    }
  };

  class XEraserInjector {
    constructor() {
      this.config = null;
      this.isRunning = false;
      this.isPaused = false;
      this.processedCount = 0;
      this.errorCount = 0;
      this.maxErrors = 10;
      this.filters = null;
      this._dateMissingWarned = new Set();
      this.onProgress = null;
      this.onLog = null;
      this.onComplete = null;
      this.onError = null;
    }

    setConfig(config) {
      if (config && config.selectors) {
        this.config = config.selectors;
      } else {
        this.config = DEFAULT_SELECTORS;
      }
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
          } catch (e) {
            // ignore
          }
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
          } catch (e) {
            // ignore
          }
        }
      }
      return results;
    }

    async safeClick(element, delayAfter) {
      if (!element) return false;
      if (delayAfter === undefined) delayAfter = 500;

      try {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await this.sleep(300);

        const rect = element.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) {
          return false;
        }

        // 尝试多种点击方式以兼容 React 事件
        try { element.click(); } catch (e) {}
        try {
          const evt = new MouseEvent('click', { bubbles: true, cancelable: true, view: window, button: 0 });
          element.dispatchEvent(evt);
        } catch (e) {}
        try {
          const evt = new PointerEvent('pointerdown', { bubbles: true, cancelable: true });
          element.dispatchEvent(evt);
          const evt2 = new PointerEvent('pointerup', { bubbles: true, cancelable: true });
          element.dispatchEvent(evt2);
        } catch (e) {}

        if (delayAfter > 0) {
          await this.sleep(delayAfter);
        }
        return true;
      } catch (e) {
        this.error('Click failed: ' + e.message);
        return false;
      }
    }

    async scrollToBottom(scrollDelay) {
      if (scrollDelay === undefined) scrollDelay = 1000;
      
      const startHeight = document.documentElement.scrollHeight;
      window.scrollTo(0, document.documentElement.scrollHeight);
      await this.sleep(scrollDelay);
      
      const newHeight = document.documentElement.scrollHeight;
      return newHeight > startHeight;
    }

    async waitForElement(selector, timeout) {
      if (timeout === undefined) timeout = 5000;
      
      const startTime = Date.now();
      while (Date.now() - startTime < timeout) {
        const element = this.findElement(selector);
        if (element) return element;
        await this.sleep(200);
      }
      return null;
    }

    async deleteTweet(container) {
      if (!container) return false;
      
      const selectors = this.config.tweet || DEFAULT_SELECTORS.tweet;
      
      const moreButton = this.findElement(selectors.moreButton, container);
      if (!moreButton) return false;
      
      await this.safeClick(moreButton, 0);
      
      const deleteButton = await this.waitForElement(selectors.deleteButton, 3000);
      if (!deleteButton) return false;
      
      await this.safeClick(deleteButton, 0);
      
      const confirmButton = await this.waitForElement(selectors.confirmButton, 3000);
      if (!confirmButton) return false;
      
      await this.safeClick(confirmButton, 1000);
      return true;
    }

    // 真正的取消点赞实现
    async unlikeTweet(container) {
      if (!container) return false;
      
      const selectors = this.config.like || DEFAULT_SELECTORS.like;
      const unlikeButton = this.findElement(selectors.unlikeButton, container);
      
      if (!unlikeButton) {
        return false;
      }
      
      // 记录点击前的按钮状态
      const beforeHTML = unlikeButton.outerHTML;
      
      await this.safeClick(unlikeButton, 1000);
      
      // 验证是否真的取消点赞了
      // 点击后 unlike 按钮应该消失或变成 like 按钮
      await this.sleep(500);
      
      return true;
    }

    // 全局扫描并取消点赞（用于 /likes 页面）
    async unlikeAllOnPage() {
      const selectors = this.config.like || DEFAULT_SELECTORS.like;
      const unlikeButtons = this.findElements(selectors.unlikeButton);
      
      if (unlikeButtons.length === 0) {
        return 0;
      }
      
      let unliked = 0;
      for (let i = 0; i < unlikeButtons.length; i++) {
        if (!this.isRunning || this.errorCount >= this.maxErrors) break;
        
        while (this.isPaused && this.isRunning) {
          await this.sleep(500);
        }
        
        const btn = unlikeButtons[i];
        if (btn.dataset.xeraserProcessed) continue;
        btn.dataset.xeraserProcessed = 'true';
        
        const success = await this.unlikeTweet(btn.closest("[data-testid='tweet']") || btn.parentElement);
        if (success) {
          unliked++;
          this.processedCount++;
          this.progress('Unlike #' + unliked);
        } else {
          this.errorCount++;
        }
        
        await this.sleep(300);
      }
      
      return unliked;
    }

    async removeBookmark(container) {
      if (!container) return false;
      
      const selectors = this.config.bookmark || DEFAULT_SELECTORS.bookmark;
      const removeButton = this.findElement(selectors.removeButton, container);
      
      if (!removeButton) return false;
      
      await this.safeClick(removeButton, 500);
      return true;
    }

    async unfollowUser(container) {
      if (!container) return false;
      
      const selectors = this.config.following || DEFAULT_SELECTORS.following;
      const unfollowButton = this.findElement(selectors.unfollowButton, container);
      
      if (!unfollowButton) return false;
      
      await this.safeClick(unfollowButton, 0);
      
      const confirmButton = await this.waitForElement(
        this.config.tweet ? this.config.tweet.confirmButton : "[data-testid='confirmationSheetConfirm']",
        2000
      );
      
      if (confirmButton) {
        await this.safeClick(confirmButton, 500);
      }
      
      return true;
    }

    async processItems(itemType, maxItems) {
      if (maxItems === undefined) maxItems = 50;

      // 转换 'likes' -> 'like'（配置 key 是单数）
      var configKey = itemType;
      if (itemType === 'likes') configKey = 'like';

      if (!this.isRunning) return;

      const selectors = this.config[configKey] || DEFAULT_SELECTORS[configKey];
      if (!selectors) {
        this.error('No selectors for ' + itemType);
        return;
      }

      this.log('Processing ' + itemType + '...');

      // 特殊处理 Likes：全局扫描 unlike 按钮
      if (itemType === 'likes') {
        await this.processLikes(maxItems);
        return;
      }

      // 其他类型
      while (this.isRunning && this.processedCount < maxItems && this.errorCount < this.maxErrors) {
        if (this.isPaused) {
          await this.sleep(500);
          continue;
        }

        const items = this.findElements(selectors.container);

        if (items.length === 0) {
          const hasMore = await this.scrollToBottom();
          if (!hasMore) {
            this.log('No more ' + itemType);
            break;
          }
          continue;
        }

        const item = items[0];
        if (item.dataset.xeraserProcessed) {
          await this.sleep(300);
          window.scrollBy(0, 200);
          continue;
        }

        item.dataset.xeraserProcessed = 'true';

        let handler;
        if (itemType === 'tweets') handler = (el) => this.deleteTweet(el);
        else if (itemType === 'bookmarks') handler = (el) => this.removeBookmark(el);
        else if (itemType === 'following') handler = (el) => this.unfollowUser(el);
        else return;

        try {
          const success = await handler(item);
          if (success) {
            this.processedCount++;
            this.progress(itemType + ' #' + this.processedCount);
          } else {
            this.errorCount++;
          }
        } catch (e) {
          this.error('Error: ' + e.message);
          this.errorCount++;
        }

        await this.sleep(500);
      }

      if (this.errorCount >= this.maxErrors) {
        this.error('Too many errors, stopping');
      }
    }

    // 提取 tweet 容器的元数据（日期 + 文本），用于过滤
    // 暂只服务 likes；tweets/bookmarks/following/messages 暂未实现过滤
    extractMeta(container, itemType) {
      var meta = { dateISO: null, text: '' };
      if (!container) return meta;

      // 日期：<time datetime="2024-12-15T10:30:00.000Z">
      var timeEl = container.querySelector('time[datetime]');
      if (timeEl) {
        var dt = timeEl.getAttribute('datetime') || '';
        meta.dateISO = dt.slice(0, 10);
      }

      // 文本：只查目标子元素，避免在巨大容器上读 textContent
      var textEls = container.querySelectorAll('[data-testid="tweetText"]');
      var parts = [];
      for (var i = 0; i < textEls.length; i++) {
        parts.push(textEls[i].textContent || '');
      }
      meta.text = parts.join(' ').trim();

      return meta;
    }

    // 判断 meta 是否匹配 filters（AND 关系）
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

    // 专门处理 Likes
    async processLikes(maxItems) {
      if (maxItems === undefined) maxItems = 50;

      let emptyScrolls = 0;
      const maxEmptyScrolls = 3;

      // 扩展的选择器 - 多种备选以兼容 X 不同版本
      const unlikeSelectors = [
        "[data-testid='unlike']",
        "[data-testid='unlike-react']",
        "button[aria-label*='Liked']",
        "button[aria-label*='Unlike']"
      ];

      this.log('Starting likes cleanup on ' + window.location.href);

      // 预计算 keyword 小写，避免循环里重复 toLowerCase
      this._keywordLower = (this.filters && this.filters.keyword)
        ? this.filters.keyword.toLowerCase() : '';

      // 一次性诊断：输出页面上所有相关 data-testid
      if (emptyScrolls === 0) {
        this._diagnosePage();
      }

      while (this.isRunning && this.processedCount < maxItems && this.errorCount < this.maxErrors) {
        if (this.isPaused) {
          await this.sleep(500);
          continue;
        }

        // 尝试所有备选选择器
        let unlikeButtons = [];
        let matchedSelector = null;
        for (let s = 0; s < unlikeSelectors.length; s++) {
          unlikeButtons = this.findElements(unlikeSelectors[s]);
          if (unlikeButtons.length > 0) {
            matchedSelector = unlikeSelectors[s];
            break;
          }
        }

        // 过滤已处理（clicked='true' 或 filtered='skipped'）
        const pending = unlikeButtons.filter(function(btn) {
          var p = btn.dataset.xeraserProcessed;
          return !p || (p !== 'true' && p !== 'skipped');
        });

        if (pending.length === 0) {
          if (unlikeButtons.length === 0 && emptyScrolls === 0) {
            this.log('No unlike buttons found on page, selectors may be wrong');
            this.log('Tried: ' + unlikeSelectors.join(', '));
          }
          emptyScrolls++;
          if (emptyScrolls > maxEmptyScrolls) {
            this.log('No more likes');
            break;
          }
          const hasMore = await this.scrollToBottom(1500);
          if (!hasMore) {
            this.log('End of likes');
            break;
          }
          continue;
        }

        emptyScrolls = 0;

        if (matchedSelector && emptyScrolls === 0) {
          this.log('Found ' + unlikeButtons.length + ' buttons with: ' + matchedSelector);
        }

        const btn = pending[0];

        // 过滤判断：不通过则标记 'skipped'，下次扫描跳过（不重复提取 meta）
        if (this.filters) {
          var article = btn.closest("[data-testid='tweet']") || btn.parentElement;
          var meta = this.extractMeta(article, 'likes');
          if (!this.matchesFilter(meta, this.filters)) {
            btn.dataset.xeraserProcessed = 'skipped';
            // 日期缺失提示（每类型最多 1 次）
            if ((this.filters.fromDate || this.filters.toDate) && !meta.dateISO
                && !this._dateMissingWarned.has('likes')) {
              this._dateMissingWarned.add('likes');
              this.log('Date filter skipped for likes: no timestamp found on some items');
            }
            await this.sleep(50);
            continue;
          }
        }

        btn.dataset.xeraserProcessed = 'true';

        try {
          const ok = await this.safeClick(btn, 800);
          if (ok) {
            this.processedCount++;
            this.progress('Unlike #' + this.processedCount);
            this.log('Clicked unlike button #' + this.processedCount);
          } else {
            this.errorCount++;
            this.error('Click returned false for unlike button');
          }
        } catch (e) {
          this.error('Unlike failed: ' + e.message);
          this.errorCount++;
        }

        await this.sleep(500);
      }

      // 0 命中时给用户明确提示
      if (this.processedCount === 0 && this.filters) {
        this.log('No items matched the filter');
      }
    }

    // 诊断：输出页面上所有 data-testid 信息，帮助调试选择器
    _diagnosePage() {
      try {
        const allWithTestId = document.querySelectorAll('[data-testid]');
        const testIdCounts = {};
        for (let i = 0; i < allWithTestId.length; i++) {
          const id = allWithTestId[i].getAttribute('data-testid');
          testIdCounts[id] = (testIdCounts[id] || 0) + 1;
        }
        const sorted = Object.keys(testIdCounts).sort(function(a, b) {
          return testIdCounts[b] - testIdCounts[a];
        });
        this.log('=== Page Diagnostics ===');
        this.log('Total data-testid elements: ' + allWithTestId.length);
        this.log('Top data-testids: ' + sorted.slice(0, 20).map(function(k) {
          return k + '(' + testIdCounts[k] + ')';
        }).join(', '));

        // 查找所有带 aria-label 的 button
        const labeledButtons = document.querySelectorAll('button[aria-label]');
        this.log('Total labeled buttons: ' + labeledButtons.length);
        const uniqueLabels = {};
        for (let i = 0; i < Math.min(labeledButtons.length, 50); i++) {
          const lbl = labeledButtons[i].getAttribute('aria-label');
          uniqueLabels[lbl] = (uniqueLabels[lbl] || 0) + 1;
        }
        const topLabels = Object.keys(uniqueLabels).slice(0, 15);
        this.log('Top aria-labels: ' + topLabels.map(function(k) {
          return '"' + k + '"(' + uniqueLabels[k] + ')';
        }).join(', '));
        this.log('=== End Diagnostics ===');
      } catch (e) {
        this.error('Diagnostics failed: ' + e.message);
      }
    }

    async startCleanup(options) {
      options = options || {};
      const types = options.types || [];
      const maxPerType = options.maxPerType || 50;
      this.filters = options.filters || null;

      if (types.length === 0) {
        this.error('No types selected');
        return;
      }

      this.isRunning = true;
      this.isPaused = false;
      this.processedCount = 0;
      this.errorCount = 0;
      this._dateMissingWarned.clear();

      this.log('Cleanup started');
      this.log('Types: ' + types.join(', '));
      if (this.filters) {
        this.log('Filters: from=' + (this.filters.fromDate || '-') +
                 ' to=' + (this.filters.toDate || '-') +
                 ' kw=' + (this.filters.keyword || '-'));
      }

      for (let i = 0; i < types.length; i++) {
        const type = types[i];
        if (!this.isRunning) break;
        await this.processItems(type, maxPerType);
      }

      this.isRunning = false;

      if (this.onComplete) {
        this.onComplete({
          processed: this.processedCount,
          errors: this.errorCount
        });
      }

      this.log('Done. Processed: ' + this.processedCount);
    }

    pause() {
      this.isPaused = true;
      this.log('Paused');
    }

    resume() {
      this.isPaused = false;
      this.log('Resumed');
    }

    stop() {
      this.isRunning = false;
      this.isPaused = false;
      this.log('Stopped');
    }

    getStatus() {
      return {
        isRunning: this.isRunning,
        isPaused: this.isPaused,
        processed: this.processedCount,
        errors: this.errorCount
      };
    }

    sleep(ms) {
      return new Promise(function(resolve) {
        setTimeout(resolve, ms);
      });
    }

    log(message) {
      console.log('[XEraser] ' + message);
      if (this.onLog) this.onLog(message, 'info');
    }

    progress(message) {
      if (this.onProgress) this.onProgress(this.processedCount, message);
    }

    error(message) {
      console.error('[XEraser] ' + message);
      if (this.onError) this.onError(message);
    }
  }

  window.XEraserInjector = XEraserInjector;
})();
