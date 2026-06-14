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
      container: "[data-testid='tweet'], [data-testid='cellInnerDiv']"
    },
    bookmark: {
      container: "[data-testid='tweet']"
    },
    following: {
      container: "[data-testid='cellInnerDiv']",
      unfollowButtons: [
        "[data-testid='unfollow']",
        "[data-testid='UserUnfollow']",
        "button[aria-label*='Following']",
        "button[aria-label*='Unfollow']"
      ],
      confirmButton: "[data-testid='confirmationSheetConfirm']"
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
      this.onTypeStart = null;
      this.onTypeComplete = null;
    }

    setConfig(config) {
      // 合并：先以 DEFAULT_SELECTORS 为底，远程配置覆盖缺失的键
      // 之前实现是「config.selectors 直接替换 default」，导致远程缺键时 this.config[key] 是 undefined
      var merged = {};
      for (var k in DEFAULT_SELECTORS) {
        if (DEFAULT_SELECTORS.hasOwnProperty(k)) merged[k] = DEFAULT_SELECTORS[k];
      }
      if (config && config.selectors) {
        for (var k2 in config.selectors) {
          if (config.selectors.hasOwnProperty(k2)) merged[k2] = config.selectors[k2];
        }
      }
      this.config = merged;
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

    async unfollowUser(container) {
      if (!container) return false;

      const selectors = this.config.following || DEFAULT_SELECTORS.following;

      // 兼容新旧配置：unfollowButtons（数组，新）|| unfollowButton（字符串，旧）
      const btnSelectors = Array.isArray(selectors.unfollowButtons)
        ? selectors.unfollowButtons
        : (selectors.unfollowButton ? [selectors.unfollowButton] : []);

      if (btnSelectors.length === 0) return false;

      const unfollowButton = this.findElement(btnSelectors, container);
      if (!unfollowButton) return false;

      await this.safeClick(unfollowButton, 0);

      // confirm 优先级：following.confirmButton > tweet.confirmButton > 硬编码兜底
      const confirmSel = (selectors && selectors.confirmButton)
        || (this.config.tweet && this.config.tweet.confirmButton)
        || "[data-testid='confirmationSheetConfirm']";

      const confirmButton = await this.waitForElement(confirmSel, 2000);
      if (confirmButton) {
        await this.safeClick(confirmButton, 500);
      }

      return true;
    }

    // 哪些 itemType 启用日期+关键字过滤（bookmarks + following）
    shouldFilter(itemType) {
      if (!this.filters) return false;
      return itemType === 'bookmarks' || itemType === 'following';
    }

    async processItems(itemType, maxItems) {
      if (maxItems === undefined) maxItems = 50;

      // 复数 itemType 映射到单数配置 key（DEFAULT_SELECTORS / remoteConfig 都用单数）
      var CONFIG_KEY_MAP = {
        likes: 'like',
        bookmarks: 'bookmark',
        tweets: 'tweet',
        messages: 'message'
      };
      var configKey = CONFIG_KEY_MAP[itemType] || itemType;

      // 预计算 keyword 小写（与 processLikes 保持一致）
      this._keywordLower = (this.filters && this.filters.keyword)
        ? this.filters.keyword.toLowerCase() : '';

      if (!this.isRunning) return;

      const selectors = this.config[configKey] || DEFAULT_SELECTORS[configKey];
      if (!selectors) {
        this.error('No selectors for ' + itemType);
        return;
      }

      this.log('Processing ' + itemType + '...');

      // 记录进入时的处理数，结束时用于判断该 type 是否 0 命中
      var processedBefore = this.processedCount;

      // 特殊处理 Likes：全局扫描 unlike 按钮
      if (itemType === 'likes') {
        await this.processLikes(maxItems);
        return;
      }

      // 特殊处理 Bookmarks：全局扫描 remove-bookmark 按钮
      if (itemType === 'bookmarks') {
        await this.processBookmarks(maxItems);
        return;
      }

      // 特殊处理 Following：全局扫描 unfollow 按钮
      if (itemType === 'following') {
        await this.processFollowing(maxItems);
        return;
      }

      // 其他类型（tweets 用通用循环）
      // 无进展兜底：与 likes/bookmarks/following 一致
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

        // 过滤判断：仅对 shouldFilter 命中的类型生效
        if (this.shouldFilter(itemType)) {
          var meta = this.extractMeta(item, itemType);
          if (!this.matchesFilter(meta, this.filters)) {
            // 日期缺失提示（每类型最多 1 次）
            if ((this.filters.fromDate || this.filters.toDate) && !meta.dateISO
                && !this._dateMissingWarned.has(itemType)) {
              this._dateMissingWarned.add(itemType);
              this.log(t('dateFilterSkipped', {type: itemType}));
            }
            continue;
          }
        }

        let handler;
        if (itemType === 'tweets') handler = (el) => this.deleteTweet(el);
        else if (itemType === 'following') handler = (el) => this.unfollowUser(el);
        else return;

        try {
          const success = await handler(item);
          if (success) {
            this.processedCount++;
            lastProgressTime = Date.now();  // 重置无进展计时器
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

      // 该 type 0 命中且启用了过滤，给用户明确提示
      if (this.processedCount === processedBefore && this.shouldFilter(itemType)) {
        this.log(t('noItemsMatched'));
      }
    }

    // 提取容器的元数据（日期 + 文本），用于过滤
    // likes/bookmarks/tweets：dateISO 从 <time datetime> 取，text 从 [data-testid="tweetText"] 取
    // following：dateISO 通常为空（页面无加入时间），text 从用户名 / bio 取
    extractMeta(container, itemType) {
      var meta = { dateISO: null, text: '' };
      if (!container) return meta;

      // 日期：<time datetime="2024-12-15T10:30:00.000Z">
      var timeEl = container.querySelector('time[datetime]');
      if (timeEl) {
        var dt = timeEl.getAttribute('datetime') || '';
        meta.dateISO = dt.slice(0, 10);
      }

      // 文本：按类型选不同选择器，避免在巨大容器上读 textContent
      var parts = [];
      if (itemType === 'following') {
        // UserCell 内：用户名 / @handle / bio
        var userCell = container.querySelector('[data-testid="UserCell"]')
          || container.querySelector('[data-testid="userCell"]');
        var scope = userCell || container;
        var nameEls = scope.querySelectorAll('[data-testid="User-Name"], [data-testid="UserName"]');
        var bioEl = scope.querySelector('[data-testid="UserDescription"]');
        for (var n = 0; n < nameEls.length; n++) {
          parts.push(nameEls[n].textContent || '');
        }
        if (bioEl) parts.push(bioEl.textContent || '');
      } else {
        var textEls = container.querySelectorAll('[data-testid="tweetText"]');
        for (var i = 0; i < textEls.length; i++) {
          parts.push(textEls[i].textContent || '');
        }
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

      // 内置兜底选择器（远程配置可覆盖，远程的放前面优先）
      const BUILTIN_UNLIKE_SELECTORS = [
        "[data-testid='unlike']",
        "[data-testid='unlike-react']",
        "button[aria-label*='Liked']",
        "button[aria-label*='Unlike']"
      ];
      var remoteUnlike = (this.config && this.config.like && Array.isArray(this.config.like.unlikeButtons))
        ? this.config.like.unlikeButtons : [];
      const unlikeSelectors = remoteUnlike.concat(BUILTIN_UNLIKE_SELECTORS);

      this.log(t('startingLikesCleanup', {url: window.location.href}));

      // 预计算 keyword 小写，避免循环里重复 toLowerCase
      this._keywordLower = (this.filters && this.filters.keyword)
        ? this.filters.keyword.toLowerCase() : '';

      // 一次性诊断：输出到 console（开发者用），不进用户日志面板
      if (emptyScrolls === 0) {
        this._diagnosePage();
      }

      // 无进展兜底：连续 STUCK_TIMEOUT_MS 没新增任何 processedCount 就退出
      // 注意：这不是"批量时长上限"。订阅用户跑几千条几小时都 OK，
      // 这个超时只用来抓 X 改版 / 选择器失效 / 网络卡死导致的死循环。
      // 真正的批量上限在 sidepanel.js 的 dailyUsage（免费 50/天，订阅无限）。
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
          if (unlikeButtons.length === 0 && emptyScrolls === 1) {
            // 第二次 0 命中才打（避免第一次就误判 X 改版——首次 0 也可能是真没书签）
            this.log(t('noUnlikeButtons'));
            // 调试细节：把候选选择器输出到 console（不进用户面板）
            console.log('[X-Eraser] Tried selectors:', unlikeSelectors);
          }
          emptyScrolls++;
          if (emptyScrolls > maxEmptyScrolls) {
            this.log(t('noMoreLikes'));
            break;
          }
          const hasMore = await this.scrollToBottom(1500);
          if (!hasMore) {
            this.log(t('endOfLikes'));
            break;
          }
          continue;
        }

        emptyScrolls = 0;

        if (matchedSelector && emptyScrolls === 0) {
          this.log(t('foundButtonsCount', {count: unlikeButtons.length}));
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
              this.log(t('dateFilterSkipped', {type: 'likes'}));
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
            lastProgressTime = Date.now();  // 重置无进展计时器
            this.progress('Unlike #' + this.processedCount);
            this.log(t('clickedUnlike', {count: this.processedCount}));
          } else {
            this.errorCount++;
            this.error(t('clickReturnedFalse'));
          }
        } catch (e) {
          this.error(t('unlikeFailed', {error: e.message}));
          this.errorCount++;
        }

        await this.sleep(500);
      }

      // 0 命中时给用户明确提示
      if (this.processedCount === 0 && this.filters) {
        this.log(t('noItemsMatched'));
      }
    }

    // 专门处理 Bookmarks：仿 processLikes 的全局扫按钮模式
    async processBookmarks(maxItems) {
      if (maxItems === undefined) maxItems = 50;

      let emptyScrolls = 0;
      const maxEmptyScrolls = 3;

      // 备选选择器（按优先级）
      // 内置兜底（远程配置可覆盖，远程的放前面优先）
      const BUILTIN_REMOVE_SELECTORS = [
        "button[aria-label='Bookmarked']",
        "button[aria-label*='Bookmarked']",
        "[data-testid='bookmark']",
        "[data-testid='removeBookmark']",
        "[data-testid='unbookmark']",
        "button[aria-label*='Remove']"
      ];
      var remoteRemove = (this.config && this.config.bookmark && Array.isArray(this.config.bookmark.removeButtons))
        ? this.config.bookmark.removeButtons : [];
      const removeSelectors = remoteRemove.concat(BUILTIN_REMOVE_SELECTORS);

      this.log(t('startingBookmarksCleanup'));

      if (emptyScrolls === 0) {
        this._diagnosePage();
      }

      // 无进展兜底：连续 STUCK_TIMEOUT_MS 没新增任何 processedCount 就退出
      // 注意：这不是"批量时长上限"。订阅用户跑几千条几小时都 OK，
      // 这个超时只用来抓 X 改版 / 选择器失效 / 网络卡死导致的死循环。
      // 真正的批量上限在 sidepanel.js 的 dailyUsage（免费 50/天，订阅无限）。
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

        // 尝试所有备选选择器
        let removeButtons = [];
        let matchedSelector = null;
        for (let s = 0; s < removeSelectors.length; s++) {
          removeButtons = this.findElements(removeSelectors[s]);
          if (removeButtons.length > 0) {
            matchedSelector = removeSelectors[s];
            break;
          }
        }

        // 过滤已处理（clicked='true' 或 filtered='skipped'）
        const pending = removeButtons.filter(function(btn) {
          var p = btn.dataset.xeraserProcessed;
          return !p || (p !== 'true' && p !== 'skipped');
        });

        if (pending.length === 0) {
          if (removeButtons.length === 0 && emptyScrolls === 1) {
            // 第二次 0 命中才打（避免第一次就误判 X 改版——首次 0 也可能是真没书签）
            this.log(t('noRemoveBookmarkButtons'));
            // 调试细节：把候选选择器输出到 console（不进用户面板）
            console.log('[X-Eraser] Tried selectors:', removeSelectors);
          }
          emptyScrolls++;
          if (emptyScrolls > maxEmptyScrolls) {
            this.log(t('noMoreBookmarks'));
            break;
          }
          const hasMore = await this.scrollToBottom(1500);
          if (!hasMore) {
            this.log(t('endOfBookmarks'));
            break;
          }
          continue;
        }

        emptyScrolls = 0;

        if (matchedSelector && emptyScrolls === 0) {
          this.log(t('foundButtonsCount', {count: removeButtons.length}));
        }

        const btn = pending[0];

        // 过滤判断
        if (this.filters) {
          // article 用 HTML 标准标签，不依赖 testid（X 改版也不影响）
          var article = btn.closest('article') || btn.parentElement;
          var meta = this.extractMeta(article, 'bookmarks');
          if (!this.matchesFilter(meta, this.filters)) {
            btn.dataset.xeraserProcessed = 'skipped';
            if ((this.filters.fromDate || this.filters.toDate) && !meta.dateISO
                && !this._dateMissingWarned.has('bookmarks')) {
              this._dateMissingWarned.add('bookmarks');
              this.log(t('dateFilterSkipped', {type: 'bookmarks'}));
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
            lastProgressTime = Date.now();  // 重置无进展计时器
            this.progress('Bookmark #' + this.processedCount);
            this.log(t('clickedRemoveBookmark', {count: this.processedCount}));
          } else {
            this.errorCount++;
            this.error(t('clickReturnedFalseRemoveBookmark'));
          }
        } catch (e) {
          this.error(t('removeBookmarkFailed', {error: e.message}));
          this.errorCount++;
        }

        await this.sleep(500);
      }

      // 0 命中时给用户明确提示
      if (this.processedCount === 0 && this.filters) {
        this.log(t('noItemsMatched'));
      }
    }

    // 专门处理 Following：仿 processBookmarks 的全局扫按钮模式
    // 区别：1) 需要两步点击（unfollow + confirm dialog）
    //      2) 过滤容器用 cellInnerDiv 而非 article
    async processFollowing(maxItems) {
      if (maxItems === undefined) maxItems = 50;

      let emptyScrolls = 0;
      const maxEmptyScrolls = 3;

      // 内置兜底选择器（远程配置可覆盖，远程的放前面优先）
      const BUILTIN_UNFOLLOW_SELECTORS = [
        "[data-testid='unfollow']",
        "[data-testid='UserUnfollow']",
        "button[aria-label*='Following']",
        "button[aria-label*='Unfollow']"
      ];
      var remoteUnfollow = (this.config && this.config.following && Array.isArray(this.config.following.unfollowButtons))
        ? this.config.following.unfollowButtons : [];
      const unfollowSelectors = remoteUnfollow.concat(BUILTIN_UNFOLLOW_SELECTORS);

      // confirm 选择器优先级：following.confirmButton > tweet.confirmButton > 硬编码兜底
      const confirmSel = (this.config && this.config.following && this.config.following.confirmButton)
        || (this.config && this.config.tweet && this.config.tweet.confirmButton)
        || "[data-testid='confirmationSheetConfirm']";

      this.log(t('startingFollowingCleanup'));

      if (emptyScrolls === 0) {
        this._diagnosePage();
      }

      // 无进展兜底：连续 STUCK_TIMEOUT_MS 没新增任何 processedCount 就退出
      // 注意：这不是"批量时长上限"。订阅用户跑几千条几小时都 OK，
      // 这个超时只用来抓 X 改版 / 选择器失效 / 网络卡死导致的死循环。
      // 真正的批量上限在 sidepanel.js 的 dailyUsage（免费 50/天，订阅无限）。
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

        // 尝试所有备选选择器
        let unfollowButtons = [];
        let matchedSelector = null;
        for (let s = 0; s < unfollowSelectors.length; s++) {
          unfollowButtons = this.findElements(unfollowSelectors[s]);
          if (unfollowButtons.length > 0) {
            matchedSelector = unfollowSelectors[s];
            break;
          }
        }

        // 过滤已处理（clicked='true' 或 filtered='skipped'）
        const pending = unfollowButtons.filter(function(btn) {
          var p = btn.dataset.xeraserProcessed;
          return !p || (p !== 'true' && p !== 'skipped');
        });

        if (pending.length === 0) {
          if (unfollowButtons.length === 0 && emptyScrolls === 1) {
            // 第二次 0 命中才打（避免首次误判 X 改版）
            this.log(t('noUnfollowButtons'));
            console.log('[X-Eraser] Tried selectors:', unfollowSelectors);
          }
          emptyScrolls++;
          if (emptyScrolls > maxEmptyScrolls) {
            this.log(t('noMoreFollowing'));
            break;
          }
          const hasMore = await this.scrollToBottom(1500);
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

        // 过滤判断：容器用 cellInnerDiv（following 页面用户行的标准 testid）
        if (this.filters) {
          var cell = btn.closest("[data-testid='cellInnerDiv']") || btn.parentElement;
          var meta = this.extractMeta(cell, 'following');
          if (!this.matchesFilter(meta, this.filters)) {
            btn.dataset.xeraserProcessed = 'skipped';
            // following 页通常没有 <time datetime>，日期过滤会全部跳过 → 提示一次
            if ((this.filters.fromDate || this.filters.toDate) && !meta.dateISO
                && !this._dateMissingWarned.has('following')) {
              this._dateMissingWarned.add('following');
              this.log(t('dateFilterSkipped', {type: 'following'}));
            }
            await this.sleep(50);
            continue;
          }
        }

        btn.dataset.xeraserProcessed = 'true';

        try {
          // step 1: 点 unfollow 按钮（X 弹出确认 dialog）
          const ok1 = await this.safeClick(btn, 500);
          if (!ok1) {
            this.errorCount++;
            this.error(t('clickReturnedFalse'));
            await this.sleep(500);
            continue;
          }

          // step 2: 等 confirm 弹窗并点击
          const confirmButton = await this.waitForElement(confirmSel, 2000);
          if (confirmButton) {
            const ok2 = await this.safeClick(confirmButton, 500);
            if (ok2) {
              this.processedCount++;
              lastProgressTime = Date.now();  // 重置无进展计时器
              this.progress('Unfollow #' + this.processedCount);
              this.log(t('clickedUnfollow', {count: this.processedCount}));
            } else {
              this.errorCount++;
              this.error(t('clickReturnedFalseConfirm'));
            }
          } else {
            // 没出现 confirm dialog——可能 X 改版直接取关了，仍记为成功
            this.processedCount++;
            lastProgressTime = Date.now();  // 重置无进展计时器
            this.progress('Unfollow #' + this.processedCount);
            this.log(t('unfollowedNoConfirm', {count: this.processedCount}));
          }
        } catch (e) {
          this.error(t('unfollowFailed', {error: e.message}));
          this.errorCount++;
        }

        await this.sleep(500);
      }

      // 0 命中时给用户明确提示
      if (this.processedCount === 0 && this.filters) {
        this.log(t('noItemsMatched'));
      }
    }

    // 诊断：输出页面上所有 data-testid 信息，帮助调试选择器
    // 输出到 console（开发者用），不进用户日志面板
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
        console.log('[X-Eraser Diagnostics] === Page Diagnostics ===');
        console.log('Total data-testid elements:', allWithTestId.length);
        console.log('Top data-testids:', sorted.slice(0, 20).map(function(k) {
          return k + '(' + testIdCounts[k] + ')';
        }).join(', '));

        // 查找所有带 aria-label 的 button
        const labeledButtons = document.querySelectorAll('button[aria-label]');
        console.log('Total labeled buttons:', labeledButtons.length);
        const uniqueLabels = {};
        for (let i = 0; i < Math.min(labeledButtons.length, 50); i++) {
          const lbl = labeledButtons[i].getAttribute('aria-label');
          uniqueLabels[lbl] = (uniqueLabels[lbl] || 0) + 1;
        }
        const topLabels = Object.keys(uniqueLabels).slice(0, 15);
        console.log('Top aria-labels:', topLabels.map(function(k) {
          return '"' + k + '"(' + uniqueLabels[k] + ')';
        }).join(', '));
        console.log('[X-Eraser Diagnostics] === End Diagnostics ===');
      } catch (e) {
        console.warn('[X-Eraser Diagnostics] failed:', e.message);
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

      // 关键修复：maxPerType 是总预算（侧边栏传的是 remaining = FREE_LIMIT_PER_DAY - used），
      // 旧代码每个 type 都拿 maxPerType，导致 N 个 type 可以清 N×limit 条，超出每日免费额度。
      // 例如 remaining=8、types=3，旧代码能清到 24；正确行为应总共最多清 8。
      const totalBudget = maxPerType;
      for (let i = 0; i < types.length; i++) {
        const type = types[i];
        if (!this.isRunning) break;
        const remainingForType = Math.max(0, totalBudget - this.processedCount);
        if (remainingForType <= 0) {
          this.log(t('dailyBudgetExhausted', {type: t(type), remaining: 0}));
          break;
        }
        if (this.onTypeStart) this.onTypeStart(type);
        const beforeTypeCount = this.processedCount;
        await this.processItems(type, remainingForType);
        const typeProcessed = this.processedCount - beforeTypeCount;
        if (this.onTypeComplete) this.onTypeComplete(type, typeProcessed);
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
