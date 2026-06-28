// TikTok Eraser Injector
// 健壮的 DOM 操作引擎，支持远程配置选择器
//
// 与 x-automation.js 的关系：
//   - 继承所有通用 helper（findElement/findClosest/safeClick/scrollToBottom/waitForElement/waitForContentStable/waitForMenuItemByText/findButtonByText/extractMeta/matchesFilter）
//   - 重写 type-specific 入口：5 个 process 方法（Videos/Reposts/Likes/Favorites/Following）
//   - X 的 6 type 中删 4：tweets/replies/retweets/bookmarks（TikTok 无对应；reposts 走特殊处理）
//   - TikTok 新增 1 type：Favorites
//
// 设计原则（与 x-project 一致）：
//   - 字段级合并 selector（远程只覆盖显式提供的字段）
//   - i18n 关键字从 window.TikTokEraseri18n.DEFAULT_I18N 读
//   - 帧数驱动（不靠经验时间）
//   - 3 种点击事件兜底（click / MouseEvent / PointerEvent）

(function() {
  'use strict';

  // 8 语言 i18n 关键字（默认在 i18n.js，远程配置可覆盖）
  // TikTok 把按钮 aria-label + 菜单文字都按用户显示语言翻译
  // 例: "Cancel" → "取消" / "キャンセル" / "취소" / "Cancelar" / "Abbrechen" / "Annuler" / "Annulla"
  // 远程配置 (default.json 的 selectors.i18n) 可整体覆盖这些数组 —— TikTok 改了翻译时改配置即可
  const CANCEL_KEYWORDS_8LANG = (window.TikTokEraseri18n && window.TikTokEraseri18n.DEFAULT_I18N) ? window.TikTokEraseri18n.DEFAULT_I18N.cancelKeywords : ['Cancel'];
  const CONFIRM_KEYWORDS_8LANG = (window.TikTokEraseri18n && window.TikTokEraseri18n.DEFAULT_I18N) ? window.TikTokEraseri18n.DEFAULT_I18N.confirmKeywords : ['Delete'];
  const REPOST_KEYWORDS_8LANG = (window.TikTokEraseri18n && window.TikTokEraseri18n.DEFAULT_I18N) ? window.TikTokEraseri18n.DEFAULT_I18N.repostKeywords : ['Repost'];

  class TikTokInjector {
    // TikTok Eraser 主引擎 —— 在 TikTok 页面上下文里跑（被 content.js 注入）
    //
    // 职责:
    //   1. 接收 content.js 传过来的远程配置（setConfig），合并 i18n 关键字
    //   2. 5 个入口方法: processVideos / processReposts / processLikes / processFavorites / processFollowing
    //   3. 提供 DOM 操作 helper
    //   4. 提供 8 语言关键字查找 helper
    //   5. 提供过滤器: shouldFilter / extractMeta / matchesFilter
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

    // 配置入口：字段级合并 selector（远程只覆盖显式提供的字段）
    // 浅拷贝（3 层）：防止 processXxx 写入 merged 污染 source config
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
      this._currentUsername = (merged.common && merged.common.userInfo && merged.common.userInfo.username) || null;

      // 合并 i18n 8 语言关键字数组
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

    findElement(selectors, context) {
      if (!selectors) return null;
      if (!context) context = document;
      const selectorList = Array.isArray(selectors) ? selectors : [selectors];
      for (let i = 0; i < selectorList.length; i++) {
        const selector = selectorList[i];
        if (typeof selector === 'string') {
          try {
            const element = context.querySelector(selector);
            if (element) return element;
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
        if (rect.width === 0 || rect.height === 0) return false;

        // TikTok 反自动化检测比 X 严：3 种事件兜底（与 x 一致）
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

    async scrollToBottom() {
      // TikTok 2026 同样用 IntersectionObserver 懒加载
      // 沿用 x-project 的 MO + RAF 事件驱动设计
      const MAX_FRAMES = 300;
      const STABLE_FRAMES = 30;
      const SCROLL_RETRY_FRAMES = 5;
      const self = this;

      function getContainerSelector() {
        // TikTok video card 容器候选（实测后可能需调整）
        if (document.querySelectorAll('[data-e2e="user-post-item"]').length > 0) return '[data-e2e="user-post-item"]';
        if (document.querySelectorAll('[data-e2e="user-liked-item"]').length > 0) return '[data-e2e="user-liked-item"]';
        if (document.querySelectorAll('[data-e2e="user-favorite-item"]').length > 0) return '[data-e2e="user-favorite-item"]';
        if (document.querySelectorAll('[data-e2e="user-following-item"]').length > 0) return '[data-e2e="user-following-item"]';
        if (document.querySelectorAll('article').length > 0) return 'article';
        if (document.querySelectorAll("[data-testid='cellInnerDiv']").length > 0) return "[data-testid='cellInnerDiv']";
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

      const self2 = self;
      return new Promise(function(resolve) {
        const start = Date.now();
        let totalFrames = 0;
        let stableFrames = 0;
        let lastContainerCount = containerSel ? document.querySelectorAll(containerSel).length : 0;
        let initialContainerCount = lastContainerCount;
        let rafId;
        let loadedNewContent = false;

        function rafTick() {
          totalFrames++;
          const currentCount = containerSel ? document.querySelectorAll(containerSel).length : 0;

          if (currentCount === lastContainerCount) {
            stableFrames++;
            if (stableFrames >= STABLE_FRAMES) {
              cancelAnimationFrame(rafId);
              if (loadedNewContent) window.scrollTo(0, 0);
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
            cancelAnimationFrame(rafId);
            if (loadedNewContent) window.scrollTo(0, 0);
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

    async waitForContentStable(selectors) {
      // 沿用 x-project 设计：帧数驱动 + 主动 scroll 触发 IntersectionObserver
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
            total += document.querySelectorAll(selectorList[s]).length;
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

    // 删除一条 TikTok 视频（processVideos / processReposts 里调用）
    // 流程（3 步点击）:
    //   1. 点视频上的 more/··· 按钮 → 弹出菜单
    //   2. 菜单里点 "Delete" 菜单项（按 8 语言文字匹配）
    //   3. 确认弹窗点 confirmButton
    // 返回: true = 3 步全成功；false = 任一步骤失败
    async deleteVideo(container) {
      if (!container) return false;

      var _delStartTime = Date.now();
      var _delArticleSig = (container.textContent || '').trim().substring(0, 50);
      this.debug('[deleteVideo start] video="' + _delArticleSig + '", isConnected=' + container.isConnected);

      const moreBtnSelectors = (this.config.common && Array.isArray(this.config.common.videoMoreButtons))
        ? this.config.common.videoMoreButtons : [];
      if (moreBtnSelectors.length === 0) {
        this.error('No common.videoMoreButtons for deleteVideo');
        return false;
      }

      const moreButton = this.findElement(moreBtnSelectors, container);
      if (!moreButton) {
        this.error('deleteVideo: more button not found in container');
        return false;
      }

      // 主路径：等菜单已弹出（TikTok 通常立即弹）→ 直接命中
      let deleteItem = await this.waitForMenuItemByText(this._i18n.deleteKeywords, 1000);
      if (!deleteItem) {
        // 兜底：click more 弹菜单
        await this.safeClick(moreButton, 0);
        deleteItem = await this.waitForMenuItemByText(this._i18n.deleteKeywords, 3000);
        if (!deleteItem) {
          this.error('deleteVideo: Delete menu item not found (3s timeout)');
          this.debug('[deleteVideo fail-3s] video="' + _delArticleSig + '", isConnected=' + container.isConnected + ', elapsed=' + (Date.now() - _delStartTime) + 'ms');
          return false;
        }
      }

      await this.safeClick(deleteItem, 0);

      // MO 监听 + confirm 按钮
      let mSucceeded = false;
      let mConfirmClicked = false;

      if (!container.isConnected) {
        return true;
      }

      const self = this;
      const parentNode = container.parentNode || document.body;
      const obs = new MutationObserver(function() {
        if (!container.isConnected) {
          mSucceeded = true;
          obs.disconnect();
        }
      });
      obs.observe(parentNode, { childList: true, subtree: true });

      const commonConfirmSel = (this.config.common && Array.isArray(this.config.common.confirmButton))
        ? this.config.common.confirmButton[0] : null;

      if (commonConfirmSel) {
        const confirmButton = await this.waitForElement(commonConfirmSel);
        if (confirmButton) {
          await this.safeClick(confirmButton, 0);
          mConfirmClicked = true;
        }
      }

      const MAX_FRAMES = 600;
      await new Promise(function(resolve) {
        if (mSucceeded) { resolve(); return; }
        let frameCount = 0;
        function rafTick() {
          if (mSucceeded) { resolve(); return; }
          frameCount++;
          if (frameCount >= MAX_FRAMES) { resolve(); return; }
          requestAnimationFrame(rafTick);
        }
        requestAnimationFrame(rafTick);
      });

      obs.disconnect();
      if (!mSucceeded) {
        this.error('deleteVideo: container still exists after click Delete (max frames reached, confirmClicked=' + mConfirmClicked + ')');
        return false;
      }
      return true;
    }

    // 通用 helper：等文本匹配任一关键字的 menuitem
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

    // 通用 helper：等文本匹配任一关键字的 button
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

    // 取关（processFollowing 里调用）
    // 流程（2 步点击）:
    //   1. 点 cell 上的 unfollow 按钮（"Following" 绿色按钮）
    //   2. confirm 弹窗点 confirmButton
    async unfollowUser(container) {
      if (!container) return false;

      const selectors = this.config.following || {};
      const btnSelectors = Array.isArray(selectors.unfollowButtons)
        ? selectors.unfollowButtons
        : (selectors.unfollowButton ? [selectors.unfollowButton] : []);

      if (btnSelectors.length === 0) return false;

      const unfollowButton = this.findElement(btnSelectors, container);
      if (!unfollowButton) return false;

      await this.safeClick(unfollowButton, 0);

      const confirmSel = (selectors && selectors.confirmButton)
        || (this.config.common && this.config.common.confirmButton && this.config.common.confirmButton[0]);

      const confirmButton = await this.waitForElement(confirmSel, 600);
      if (confirmButton) {
        await this.safeClick(confirmButton, 500);
      }

      return true;
    }

    // 5 个 type 启用日期+关键字过滤；viewCount 是 TikTok 特有
    shouldFilter(itemType) {
      if (!this.filters) return false;
      return itemType === 'videos' || itemType === 'reposts'
        || itemType === 'likes' || itemType === 'favorites'
        || itemType === 'following';
    }

    async processItems(itemType, maxItems) {
      if (maxItems === undefined) maxItems = 50;

      var CONFIG_KEY_MAP = {
        videos: 'common',
        reposts: 'common',
        likes: 'like',
        favorites: 'favorite',
        following: 'following'
      };
      var configKey = CONFIG_KEY_MAP[itemType] || itemType;

      this._keywordLower = (this.filters && this.filters.keyword)
        ? this.filters.keyword.toLowerCase() : '';

      if (!this.isRunning) return;

      const selectors = this.config[configKey];
      if (!selectors) {
        this.error('No selectors for ' + itemType);
        return;
      }

      if (itemType === 'videos') { await this.processVideos(maxItems); return; }
      if (itemType === 'reposts') { await this.processReposts(maxItems); return; }
      if (itemType === 'likes') { await this.processLikes(maxItems); return; }
      if (itemType === 'favorites') { await this.processFavorites(maxItems); return; }
      if (itemType === 'following') { await this.processFollowing(maxItems); return; }

      this.error('Unknown itemType: ' + itemType);
    }

    // 提取容器的元数据（日期 + 文本 + view count），给 matchesFilter 用来过滤
    // 返回: { dateISO: 'YYYY-MM-DD' | null, text: '...', viewCount: number | null }
    extractMeta(container, itemType) {
      var meta = { dateISO: null, text: '', viewCount: null };
      if (!container) return meta;

      // 日期：HTML5 <time datetime="..."> 属性
      var timeEl = this.findElement(this.config.common && this.config.common.timeElement, container);
      if (timeEl) {
        var dt = timeEl.getAttribute('datetime') || '';
        meta.dateISO = dt.slice(0, 10);
      }

      // 文本
      var parts = [];
      if (itemType === 'following') {
        // following 页是 UserCell：取用户名 / @handle / bio 作为关键字匹配源
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
        for (var i = 0; i < textEls.length; i++) {
          parts.push(textEls[i].textContent || '');
        }
      }
      meta.text = parts.join(' ').trim();

      // view count（TikTok 特有，营销页宣传的"view count floor"过滤）
      if (itemType === 'videos' || itemType === 'reposts') {
        var viewCountCfg = this.config.common && this.config.common.viewCount;
        if (viewCountCfg) {
          var viewEl = this.findElement(viewCountCfg, container);
          if (viewEl) {
            // TikTok view count 文字格式：'1.2K' / '3.4M' / '123'
            var viewText = (viewEl.textContent || '').trim();
            meta.viewCount = this.parseViewCount(viewText);
          }
        }
      }

      return meta;
    }

    // 解析 TikTok view count 文字
    // 支持 '1.2K' / '3.4M' / '5B' / '123' 等格式
    parseViewCount(text) {
      if (!text) return null;
      var m = text.match(/^([\d.]+)\s*([KMB]?)$/i);
      if (!m) return null;
      var num = parseFloat(m[1]);
      var suffix = (m[2] || '').toUpperCase();
      if (suffix === 'K') num *= 1000;
      else if (suffix === 'M') num *= 1000000;
      else if (suffix === 'B') num *= 1000000000;
      return num;
    }

    // 判断 meta 是否匹配 filters（所有条件 AND 关系）
    matchesFilter(meta, filters) {
      if (!filters) return true;
      if (filters.fromDate && (!meta.dateISO || meta.dateISO < filters.fromDate)) return false;
      if (filters.toDate && (!meta.dateISO || meta.dateISO > filters.toDate)) return false;
      if (filters.keyword) {
        var haystack = (meta.text || '').toLowerCase();
        if (haystack.indexOf(this._keywordLower) < 0) return false;
      }
      // view count floor（TikTok 特有）
      if (filters.minViewCount != null && meta.viewCount != null && meta.viewCount < filters.minViewCount) return false;
      if (filters.maxViewCount != null && meta.viewCount != null && meta.viewCount > filters.maxViewCount) return false;
      return true;
    }

    // 检测 repost 卡片：通过 socialContext 文字标记
    // TikTok 标记 repost 用 "Repost" / "Reposted" / 8 语言关键字
    isRepostCard(article) {
      if (!article) return false;
      var socialContext = this.findElement(this.config.common && this.config.common.socialContext, article);
      var text = '';
      if (socialContext) {
        text = (socialContext.textContent || '').toLowerCase();
      } else {
        // 兜底：全文匹配
        text = (article.textContent || '').toLowerCase();
      }
      var repostRe = new RegExp(
        this._i18n.repostKeywords.map(function(k) {
          return k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        }).join('|'),
        'i'
      );
      return repostRe.test(text);
    }

    // 删 TikTok 视频（profile 主页跑，过滤掉 repost 卡片）
    // 路径: deleteVideo
    async processVideos(maxItems) {
      if (maxItems === undefined) maxItems = 50;
      const self = this;
      this._keywordLower = (this.filters && this.filters.keyword)
        ? this.filters.keyword.toLowerCase() : '';

      this.log(t('startingVideosCleanup'));

      // 等 videos 渲染 + 内容稳定
      await this.waitForContentStable(['[data-e2e="user-post-item"]', 'article', "[data-testid='cellInnerDiv']"]);
      this._diagnosePage();

      const moreButtons = (self.config.common && Array.isArray(self.config.common.videoMoreButtons))
        ? self.config.common.videoMoreButtons : [];
      const articleSel = (self.config.common && self.config.common.articleContainers) || ['[data-e2e="user-post-item"]', 'article'];
      const topLevelRule = self.config.common && self.config.common.topLevelArticle;

      function collectCandidates() {
        const candidates = [];
        const seen = new Set();
        for (let s = 0; s < moreButtons.length; s++) {
          const btns = self.findElements(moreButtons[s]);
          for (let i = 0; i < btns.length; i++) {
            const btn = btns[i];
            if (seen.has(btn)) continue;
            seen.add(btn);
            const article = btn.closest('article') || self.findClosest(articleSel, btn);
            if (!article) continue;
            // 跳过 repost 卡片（processReposts 负责）
            if (self.isRepostCard(article)) continue;
            if (topLevelRule === 'parent' && article.parentElement && article.parentElement.closest('article')) continue;
            candidates.push({ btn: btn, article: article });
          }
        }
        if (candidates.length === 0) {
          self._logPageState({ moreButtons: moreButtons }, '[videos]');
        }
        return candidates;
      }

      let emptyScrolls = 0;
      var lastProgressTime = Date.now();
      var STUCK_TIMEOUT_MS = 30000;
      while (this.isRunning && this.processedCount < maxItems && this.errorCount < this.maxErrors) {
        if (Date.now() - lastProgressTime > STUCK_TIMEOUT_MS) { this.log(t('cleanupStuck')); break; }
        if (this.isPaused) { await this.sleep(500); continue; }

        const candidates = collectCandidates();
        const pending = candidates.filter(c => {
          const p = c.btn.dataset.socialEraserProcessed;
          return !p || (p !== 'true' && p !== 'skipped' && p !== 'failed');
        });

        if (pending.length === 0) {
          emptyScrolls++;
          if (emptyScrolls > 3) { this.log(t('noMoreVideos')); break; }
          var hasMore = await this.scrollToBottom();
          if (!hasMore) { this.log(t('endOfVideos')); break; }
          continue;
        }
        emptyScrolls = 0;

        const c = pending[0];
        const article = c.article;

        if (this.shouldFilter('videos')) {
          var meta = this.extractMeta(article, 'videos');
          if (!this.matchesFilter(meta, this.filters)) {
            c.btn.dataset.socialEraserProcessed = 'skipped';
            await this.sleep(50); continue;
          }
        }

        try {
          var success = await this.deleteVideo(article);
          if (success) {
            c.btn.dataset.socialEraserProcessed = 'true';
            this.processedCount++;
            lastProgressTime = Date.now();
            this.progress('Video #' + this.processedCount);
            this.log(t('videoDeleted', {count: this.processedCount}));
          } else {
            c.btn.dataset.socialEraserProcessed = 'failed';
            this.error(t('videoDeleteFailed'));
            this.errorCount++;
          }
        } catch (e) {
          c.btn.dataset.socialEraserProcessed = 'failed';
          this.error('deleteVideo threw: ' + e.message);
          this.errorCount++;
        }
        await this.sleep(800);  // TikTok 反自动化：比 X 慢（500 → 800ms）
      }

      if (this.processedCount === 0 && this.filters) this.log(t('noItemsMatched'));
    }

    // 删 Reposts（profile 主页跑，识别 repost 标记 → 走 processVideos 删除）
    // 重要提示：TikTok Web 不支持"撤销 repost"独立操作，删除 repost = 删除该视频
    async processReposts(maxItems) {
      if (maxItems === undefined) maxItems = 50;
      const self = this;
      this._keywordLower = (this.filters && this.filters.keyword)
        ? this.filters.keyword.toLowerCase() : '';

      // 首次提示用户
      this.log(t('repostWarning'));
      this.log(t('startingRepostsCleanup'));

      await this.waitForContentStable(['[data-e2e="user-post-item"]', 'article', "[data-testid='cellInnerDiv']"]);
      this._diagnosePage();

      const moreButtons = (self.config.common && Array.isArray(self.config.common.videoMoreButtons))
        ? self.config.common.videoMoreButtons : [];
      const articleSel = (self.config.common && self.config.common.articleContainers) || ['[data-e2e="user-post-item"]', 'article'];
      const topLevelRule = self.config.common && self.config.common.topLevelArticle;

      function collectCandidates() {
        const candidates = [];
        const seen = new Set();
        for (let s = 0; s < moreButtons.length; s++) {
          const btns = self.findElements(moreButtons[s]);
          for (let i = 0; i < btns.length; i++) {
            const btn = btns[i];
            if (seen.has(btn)) continue;
            seen.add(btn);
            const article = btn.closest('article') || self.findClosest(articleSel, btn);
            if (!article) continue;
            // 只保留 repost 卡片
            if (!self.isRepostCard(article)) continue;
            if (topLevelRule === 'parent' && article.parentElement && article.parentElement.closest('article')) continue;
            candidates.push({ btn: btn, article: article });
          }
        }
        if (candidates.length === 0) {
          self._logPageState({ moreButtons: moreButtons, repostKeywords: self._i18n.repostKeywords }, '[reposts]');
        }
        return candidates;
      }

      let emptyScrolls = 0;
      var lastProgressTime = Date.now();
      var STUCK_TIMEOUT_MS = 30000;
      while (this.isRunning && this.processedCount < maxItems && this.errorCount < this.maxErrors) {
        if (Date.now() - lastProgressTime > STUCK_TIMEOUT_MS) { this.log(t('cleanupStuck')); break; }
        if (this.isPaused) { await this.sleep(500); continue; }

        const candidates = collectCandidates();
        const pending = candidates.filter(c => {
          const p = c.btn.dataset.socialEraserProcessed;
          return !p || (p !== 'true' && p !== 'skipped' && p !== 'failed');
        });

        if (pending.length === 0) {
          emptyScrolls++;
          if (emptyScrolls > 3) { this.log(t('noMoreReposts')); break; }
          var hasMore = await this.scrollToBottom();
          if (!hasMore) { this.log(t('endOfReposts')); break; }
          continue;
        }
        emptyScrolls = 0;

        const c = pending[0];
        const article = c.article;

        if (this.shouldFilter('reposts')) {
          var meta = this.extractMeta(article, 'reposts');
          if (!this.matchesFilter(meta, this.filters)) {
            c.btn.dataset.socialEraserProcessed = 'skipped';
            await this.sleep(50); continue;
          }
        }

        try {
          var success = await this.deleteVideo(article);
          if (success) {
            c.btn.dataset.socialEraserProcessed = 'true';
            this.processedCount++;
            lastProgressTime = Date.now();
            this.progress('Repost #' + this.processedCount);
            this.log(t('repostDeleted', {count: this.processedCount}));
          } else {
            c.btn.dataset.socialEraserProcessed = 'failed';
            this.error(t('repostDeleteFailed'));
            this.errorCount++;
          }
        } catch (e) {
          c.btn.dataset.socialEraserProcessed = 'failed';
          this.error('repost delete threw: ' + e.message);
          this.errorCount++;
        }
        await this.sleep(800);
      }

      if (this.processedCount === 0 && this.filters) this.log(t('noItemsMatched'));
    }

    // 取消点赞（likes 标签页）
    async processLikes(maxItems) {
      if (maxItems === undefined) maxItems = 50;

      let emptyScrolls = 0;
      const maxEmptyScrolls = 3;

      await this.waitForContentStable(['[data-e2e="user-liked-item"]', 'article', "[data-testid='cellInnerDiv']"]);

      var remoteUnlike = (this.config && this.config.like && Array.isArray(this.config.like.unlikeButtons))
        ? this.config.like.unlikeButtons : [];
      const unlikeSelectors = remoteUnlike;

      this.log(t('startingLikesCleanup'));

      if (emptyScrolls === 0) this._diagnosePage();

      var lastProgressTime = Date.now();
      var STUCK_TIMEOUT_MS = 30000;

      while (this.isRunning && this.processedCount < maxItems && this.errorCount < this.maxErrors) {
        if (Date.now() - lastProgressTime > STUCK_TIMEOUT_MS) { this.log(t('cleanupStuck')); break; }
        if (this.isPaused) { await this.sleep(500); continue; }

        let unlikeButtons = [];
        for (let s = 0; s < unlikeSelectors.length; s++) {
          unlikeButtons = this.findElements(unlikeSelectors[s]);
          if (unlikeButtons.length > 0) break;
        }

        const pending = unlikeButtons.filter(function(btn) {
          var p = btn.dataset.socialEraserProcessed;
          return !p || (p !== 'true' && p !== 'skipped');
        });

        if (pending.length === 0) {
          emptyScrolls++;
          if (emptyScrolls > maxEmptyScrolls) { this.log(t('noMoreLikes')); break; }
          var hasMore = await this.scrollToBottom();
          if (!hasMore) { this.log(t('endOfLikes')); break; }
          continue;
        }
        emptyScrolls = 0;

        const btn = pending[0];

        if (this.shouldFilter('likes')) {
          var article = this.findClosest(this.config.common && this.config.common.articleContainers, btn) || btn.parentElement;
          var meta = this.extractMeta(article, 'likes');
          if (!this.matchesFilter(meta, this.filters)) {
            btn.dataset.socialEraserProcessed = 'skipped';
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

      if (this.processedCount === 0 && this.filters) this.log(t('noItemsMatched'));
    }

    // 取消收藏（favorites 标签页）
    async processFavorites(maxItems) {
      if (maxItems === undefined) maxItems = 50;

      let emptyScrolls = 0;
      const maxEmptyScrolls = 3;

      await this.waitForContentStable(['[data-e2e="user-favorite-item"]', 'article', "[data-testid='cellInnerDiv']"]);

      var remoteUnfavorite = (this.config && this.config.favorite && Array.isArray(this.config.favorite.unfavoriteButtons))
        ? this.config.favorite.unfavoriteButtons : [];
      const unfavoriteSelectors = remoteUnfavorite;

      this.log(t('startingFavoritesCleanup'));

      if (emptyScrolls === 0) this._diagnosePage();

      var lastProgressTime = Date.now();
      var STUCK_TIMEOUT_MS = 30000;

      while (this.isRunning && this.processedCount < maxItems && this.errorCount < this.maxErrors) {
        if (Date.now() - lastProgressTime > STUCK_TIMEOUT_MS) { this.log(t('cleanupStuck')); break; }
        if (this.isPaused) { await this.sleep(500); continue; }

        let unfavoriteButtons = [];
        for (let s = 0; s < unfavoriteSelectors.length; s++) {
          unfavoriteButtons = this.findElements(unfavoriteSelectors[s]);
          if (unfavoriteButtons.length > 0) break;
        }

        const pending = unfavoriteButtons.filter(function(btn) {
          var p = btn.dataset.socialEraserProcessed;
          return !p || (p !== 'true' && p !== 'skipped');
        });

        if (pending.length === 0) {
          emptyScrolls++;
          if (emptyScrolls > maxEmptyScrolls) { this.log(t('noMoreFavorites')); break; }
          var hasMore = await this.scrollToBottom();
          if (!hasMore) { this.log(t('endOfFavorites')); break; }
          continue;
        }
        emptyScrolls = 0;

        const btn = pending[0];

        if (this.shouldFilter('favorites')) {
          var article = this.findClosest(this.config.common && this.config.common.articleContainers, btn) || btn.parentElement;
          var meta = this.extractMeta(article, 'favorites');
          if (!this.matchesFilter(meta, this.filters)) {
            btn.dataset.socialEraserProcessed = 'skipped';
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
            this.progress('Unfavorite #' + this.processedCount);
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

      if (this.processedCount === 0 && this.filters) this.log(t('noItemsMatched'));
    }

    // 取关（following 列表页）
    async processFollowing(maxItems) {
      if (maxItems === undefined) maxItems = 50;

      let emptyScrolls = 0;
      const maxEmptyScrolls = 3;

      await this.waitForContentStable(['[data-e2e="user-following-item"]', "[data-testid='cellInnerDiv']"]);

      var remoteUnfollow = (this.config && this.config.following && Array.isArray(this.config.following.unfollowButtons))
        ? this.config.following.unfollowButtons : [];
      const unfollowSelectors = remoteUnfollow;

      const confirmSel = (this.config && this.config.following && this.config.following.confirmButton)
        || (this.config && this.config.common && this.config.common.confirmButton && this.config.common.confirmButton[0]);

      this.log(t('startingFollowingCleanup'));

      if (emptyScrolls === 0) this._diagnosePage();

      var lastProgressTime = Date.now();
      var STUCK_TIMEOUT_MS = 30000;

      while (this.isRunning && this.processedCount < maxItems && this.errorCount < this.maxErrors) {
        if (Date.now() - lastProgressTime > STUCK_TIMEOUT_MS) { this.log(t('cleanupStuck')); break; }
        if (this.isPaused) { await this.sleep(500); continue; }

        let unfollowButtons = [];
        for (let s = 0; s < unfollowSelectors.length; s++) {
          unfollowButtons = this.findElements(unfollowSelectors[s]);
          if (unfollowButtons.length > 0) break;
        }

        const pending = unfollowButtons.filter(function(btn) {
          var p = btn.dataset.socialEraserProcessed;
          return !p || (p !== 'true' && p !== 'skipped');
        });

        if (pending.length === 0) {
          emptyScrolls++;
          if (emptyScrolls > maxEmptyScrolls) { this.log(t('noMoreFollowing')); break; }
          var hasMore = await this.scrollToBottom();
          if (!hasMore) { this.log(t('endOfFollowing')); break; }
          continue;
        }
        emptyScrolls = 0;

        const btn = pending[0];

        if (this.filters) {
          var cell = this.findClosest(this.config.common && this.config.common.articleContainers, btn) || btn.parentElement;
          var meta = this.extractMeta(cell, 'following');
          if (!this.matchesFilter(meta, this.filters)) {
            btn.dataset.socialEraserProcessed = 'skipped';
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
            this._findButtonByText(this._i18n.unfollowKeywords, 1500)
          ]);
          const confirmButton = confirmByTestid || confirmByText;
          if (confirmButton) {
            const ok2 = await this.safeClick(confirmButton, 500);
            if (ok2) {
              this.processedCount++;
              lastProgressTime = Date.now();
              this.progress('Unfollow #' + this.processedCount);
              this.log(t('clickedUnfollow', {count: this.processedCount}));
            } else {
              this.errorCount++;
              this.error(t('clickReturnedFalseConfirm'));
            }
          } else {
            this.processedCount++;
            lastProgressTime = Date.now();
            this.progress('Unfollow #' + this.processedCount);
            this.log(t('unfollowedNoConfirm', {count: this.processedCount}));
          }
        } catch (e) {
          this.error(t('unfollowFailed', {error: e.message}));
          this.errorCount++;
        }

        await this.sleep(500);
      }

      if (this.processedCount === 0 && this.filters) this.log(t('noItemsMatched'));
    }

    // 找 role="button" / <button> / <a role="button"> 文字匹配
    async _findButtonByText(keywords, timeout) {
      if (!Array.isArray(keywords) || keywords.length === 0) return null;
      const startTime = Date.now();
      const allButtons = document.querySelectorAll('[role="button"], button, a[role="button"]');
      while (Date.now() - startTime < timeout) {
        for (let i = 0; i < allButtons.length; i++) {
          const b = allButtons[i];
          const r = b.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          const text = (b.textContent || '').trim();
          const aria = (b.getAttribute('aria-label') || '').trim();
          for (let j = 0; j < keywords.length; j++) {
            const k = keywords[j];
            if (text.indexOf(k) !== -1 || aria.indexOf(k) !== -1) {
              return b;
            }
          }
        }
        await this.sleep(150);
      }
      console.log('[TikTok Eraser] _findButtonByText timeout ' + timeout + 'ms, keywords=' + JSON.stringify(keywords));
      return null;
    }

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
        console.log('[TikTok Eraser Diagnostics] === Page Diagnostics ===');
        console.log('Total data-testid elements:', allWithTestId.length);
        console.log('Top data-testids:', sorted.slice(0, 20).map(function(k) {
          return k + '(' + testIdCounts[k] + ')';
        }).join(', '));

        const allWithE2E = document.querySelectorAll('[data-e2e]');
        const e2eCounts = {};
        for (let i = 0; i < allWithE2E.length; i++) {
          const id = allWithE2E[i].getAttribute('data-e2e');
          e2eCounts[id] = (e2eCounts[id] || 0) + 1;
        }
        const sortedE2E = Object.keys(e2eCounts).sort(function(a, b) {
          return e2eCounts[b] - e2eCounts[a];
        });
        console.log('Total data-e2e elements:', allWithE2E.length);
        console.log('Top data-e2e:', sortedE2E.slice(0, 20).map(function(k) {
          return k + '(' + e2eCounts[k] + ')';
        }).join(', '));

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
        console.log('[TikTok Eraser Diagnostics] === End Diagnostics ===');
      } catch (e) {
        console.warn('[TikTok Eraser Diagnostics] failed:', e.message);
      }
    }

    _logPageState(selectorGroups, label) {
      const diag = {};
      diag.articles = document.querySelectorAll('article').length;
      for (const name in selectorGroups) {
        let total = 0;
        for (let i = 0; i < selectorGroups[name].length; i++) {
          total += this.findElements(selectorGroups[name][i]).length;
        }
        diag[name] = total;
      }
      diag.username = this._currentUsername || '(unset)';
      console.log('[TikTok Eraser] ' + label + ' 0 candidates, page state: ' + JSON.stringify(diag));
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

      // maxPerType 是总预算（侧边栏传的是 remaining = FREE_LIMIT_PER_DAY - used）
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
    }

    pause() { this.isPaused = true; }
    resume() { this.isPaused = false; }
    stop() {
      this.isRunning = false;
      this.isPaused = false;
      this._closeAnyOpenConfirmDialog();
    }

    _closeAnyOpenConfirmDialog() {
      var self = this;
      this.findButtonByText(this._i18n.cancelKeywords, 300).then(function(btn) {
        if (btn) return self.safeClick(btn, 200);
        return false;
      }).catch(function() {});
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
      console.log('[TikTok Eraser] ' + message);
      if (this.onLog) this.onLog(message, 'info');
    }

    debug(message) {
      console.log('[TikTok Eraser] ' + message);
    }

    progress(message) {
      if (this.onProgress) this.onProgress(this.processedCount, message);
    }

    error(message) {
      console.error('[TikTok Eraser] ' + message);
      if (this.onError) this.onError(message);
    }
  }

  window.TikTokInjector = TikTokInjector;
})();
