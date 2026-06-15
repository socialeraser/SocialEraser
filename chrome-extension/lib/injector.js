// X-Eraser Injector
// 健壮的 DOM 操作引擎，支持远程配置选择器

(function() {
  'use strict';

  const DEFAULT_SELECTORS = {
    tweet: {
      container: "[data-testid='tweet']",
      // 原创推文：more 按钮（数组多备选抗改版；旧 schema moreButton 字符串仍可走字段级合并兼容）
      moreButtons: [
        "[data-testid='more']",
        "[data-testid='caret']",
        "button[aria-label='More']",
        "button[aria-label*='More']"
      ],
      // X 改版后 Delete 菜单项已无 data-testid（X 把菜单项从 <a data-testid="Delete"> 改成 <div role="menuitem">无 testid>）
      // 修复前用 "[data-testid='Delete']" 0 命中；现改用 waitForMenuItemByText() 按 8 语言文字匹配
      // 保留 deleteButton 字段仅用于字段级合并兼容（远程配置里若有就 merge 进去，运行时不会被引用）
      deleteButton: null,
      confirmButton: "[data-testid='confirmationSheetConfirm']",
      // Retweet 卡片：撤销 repost 按钮
      // 修复前漏了 [data-testid='unretweetConfirm']（X 改版后 Undo repost 菜单项的实际 testid，见 tests/在转发的帖子下面点击Undo）
      // 0 命中导致 retweet 卡片的 unretweet 完全没工作；现在加上
      unreTweetButtons: [
        "[data-testid='unretweetConfirm']",
        "[data-testid='unretweet']",
        "[data-testid='Unretweet']",
        "button[aria-label*='Undo repost']",
        "button[aria-label*='Undo Repost']",
        "[data-testid='undoRepost']"
      ]
    },
    like: {
      container: "[data-testid='tweet'], [data-testid='cellInnerDiv']",
      unlikeButtons: [
        "[data-testid='unlike']",
        "[data-testid='unlike-react']",
        "button[aria-label*='Liked']",
        "button[aria-label*='Unlike']"
      ]
    },
    bookmark: {
      container: "[data-testid='tweet']",
      removeButtons: [
        "button[aria-label='Bookmarked']",
        "button[aria-label*='Bookmarked']",
        "[data-testid='bookmark']",
        "[data-testid='removeBookmark']",
        "[data-testid='unbookmark']",
        "button[aria-label*='Remove']"
      ]
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
      // 字段级合并：先以 DEFAULT_SELECTORS 为底，远程配置只覆盖它显式提供的字段
      // 修复前是「config.selectors 直接替换 default 对象」，导致远程缺键时 merged[k]
      // 整个块被远程对象替换（即使远程只覆盖了 container），其余字段全丢。
      // 修复后：远程缺键时仍保留 DEFAULT 字段；远程有键时仅覆盖那个键。
      // 拷贝策略：每个字段如果是数组/对象，再浅拷贝一层；
      //           这样 processXxx 写入 merged 不会污染 DEFAULT_SELECTORS。
      var merged = {};
      function shallowCopyField(val) {
        if (Array.isArray(val)) return val.slice();
        if (val && typeof val === 'object') return Object.assign({}, val);
        return val;
      }
      for (var k in DEFAULT_SELECTORS) {
        if (DEFAULT_SELECTORS.hasOwnProperty(k)) {
          merged[k] = Object.assign({}, DEFAULT_SELECTORS[k]);
          // 数组/对象字段额外浅拷贝
          for (var f in merged[k]) {
            if (merged[k].hasOwnProperty(f)) {
              merged[k][f] = shallowCopyField(merged[k][f]);
            }
          }
        }
      }
      if (config && config.selectors) {
        for (var k2 in config.selectors) {
          if (!config.selectors.hasOwnProperty(k2)) continue;
          if (!merged[k2]) merged[k2] = {};
          for (var field in config.selectors[k2]) {
            if (config.selectors[k2].hasOwnProperty(field)) {
              merged[k2][field] = config.selectors[k2][field];
            }
          }
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

      // 兼容：moreButtons（数组，新 schema）|| moreButton（字符串，旧 schema）
      // 与 unfollowUser 的兼容模式一致
      const moreBtnSelectors = Array.isArray(selectors.moreButtons)
        ? selectors.moreButtons
        : (selectors.moreButton ? [selectors.moreButton] : []);
      if (moreBtnSelectors.length === 0) return false;

      const moreButton = this.findElement(moreBtnSelectors, container);
      if (!moreButton) return false;

      await this.safeClick(moreButton, 0);

      // X 改版后 Delete 菜单项无 data-testid —— 改用 8 语言文字内容匹配
      // 关键修复：之前用 selectors.deleteButton（"[data-testid='Delete']"）0 命中，
      //   整个 deleteTweet 走不到 confirmButton，0 删除
      // 详见 tests/respost弹出框源码.txt 与 docs/lessons-learned.md 案例 2
      const deleteItem = await this.waitForMenuItemByText(
        ['Delete', '删除', '刪除', '削除', '삭제', 'Eliminar', 'Löschen', 'Supprimer'],
        3000
      );
      if (!deleteItem) return false;

      await this.safeClick(deleteItem, 0);

      const confirmButton = await this.waitForElement(selectors.confirmButton, 3000);
      if (!confirmButton) return false;

      await this.safeClick(confirmButton, 1000);
      return true;
    }

    // 通用 helper：等待并返回文本内容匹配任一关键字的 menuitem
    // 用于 X 改版后菜单项无固定 testid、必须按 i18n 文字匹配的场景
    async waitForMenuItemByText(keywords, timeout) {
      if (!Array.isArray(keywords) || keywords.length === 0) return null;
      const startTime = Date.now();
      while (Date.now() - startTime < timeout) {
        const items = this.findElements('[role="menuitem"]', document);
        for (let i = 0; i < items.length; i++) {
          const text = (items[i].textContent || '').trim();
          if (keywords.indexOf(text) !== -1) {
            return items[i];
          }
        }
        await this.sleep(150);
      }
      return null;
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

    // 撤销 Retweet：分两步 —— 先点 retweet 按钮弹出菜单，再点 "Undo repost" 菜单项
    // X 改版后是 2 步操作（点 retweet 图标 → 菜单 → 点 Undo repost）
    //
    // 修复前：只用 [data-testid="unretweetConfirm"] 找菜单项，0 命中
    //   用户实测反馈：菜单弹出后 "Undo repost" 文字菜单项是有的，但 testid 不是 unretweetConfirm（X 改版后可能改 testid 或去掉 testid，类似 Delete 那种情况）
    // 修复后：textid 优先 → 8 语言文字兜底（与 waitForMenuItemByText 复用）
    async unreTweet(container) {
      if (!container) return false;

      const selectors = this.config.tweet || DEFAULT_SELECTORS.tweet;

      // 兼容：unreTweetButtons（数组，新）|| unreTweetButton（字符串，旧）
      const btnSelectors = Array.isArray(selectors.unreTweetButtons)
        ? selectors.unreTweetButtons
        : (selectors.unreTweetButton ? [selectors.unreTweetButton] : []);
      if (btnSelectors.length === 0) return false;

      // 1) 点 retweet 按钮（在 container 内部 —— 卡片自己的 retweet 图标）打开菜单
      const unreTweetButton = this.findElement(btnSelectors, container);
      if (!unreTweetButton) return false;

      await this.safeClick(unreTweetButton, 500);

      // 2) 等菜单项出现 —— testid 优先（保留之前 verify 通过的 selector）
      let unretweetMenuItem = await this.waitForElement(
        '[data-testid="unretweetConfirm"]', 2000
      );

      // 3) testid miss → 8 语言文字兜底（X 改版后菜单项可能去掉 testid）
      if (!unretweetMenuItem) {
        unretweetMenuItem = await this.waitForMenuItemByText(
          [
            'Undo repost', 'Undo Repost',          // en
            '撤销转推',                              // zh-CN
            '取消轉推',                              // zh-TW
            'リポストを取り消す',                    // ja
            '리트윗 취소',                            // ko
            'Cancelar repost',                       // es
            'Repost rückgängig machen',             // de
            'Annuler le repost'                      // fr
          ],
          2000
        );
      }

      if (!unretweetMenuItem) {
        // 真找不到 —— 留下日志帮用户/AI 看到底是哪种 miss
        this.log('[unretweet] 找不到 Undo repost 菜单项 —— testid 和文字匹配都 0 命中');
        return false;
      }

      await this.safeClick(unretweetMenuItem, 500);
      return true;
    }

    // 检测置顶推文：通过 socialContext 文案关键字判断（8 语言）
    // pinned 关键字与 retweet 关键字不重叠，所以无需二次过滤
    isPinnedTweet(container) {
      if (!container) return false;
      var socialContext = container.querySelector("[data-testid='socialContext']");
      if (!socialContext) return false;
      var text = (socialContext.textContent || '').toLowerCase();
      // 8 语言：pinned / 已置顶 / 已釘選 / ピン留め / 고정 / fijado / angeheftet / épinglé / angepinnt
      return /pinned|已置顶|已釘選|ピン留め|고정|fijado|angeheftet|épinglé|angeheftet|angepinnt/i.test(text);
    }

    // 检测 reply 卡片：用户在某条推文下回复的推文（不是自己的原创，也不是转发）
    // 关键修复：用户 includeReplies=false 时，reply 卡片应该被跳过
    //   现象：用户实测反馈"我没有勾选 Include replies 但 reply 也被删了" —— processTweets 没加 includeReplies 过滤
    //   原因：导航修复后跑 /with_replies 看到 6 条推文（1 原创 + 1 reply + 3 retweet + 1 早期），reply 卡片被当成原创处理
    //   修法：socialContext 文案匹配 8 语言 "Replying to" 关键字，仅在 deleteTweet 路径（非 retweet）上过滤
    // 关键：retweet 卡片也可能带 "Replying to" 文字（用户回复了别人 + 自己也 retweet），所以 retweet 候选不应用此过滤
    //
    // 实战发现（2026-06-15 真机验证）：用 chrome-devtools-mcp 端到端测试用户创建的「I like SpaceX」回复卡片：
    //   - 该 reply 卡片在 /with_replies 页面上 **没有** socialContext 元素（X 不在用户自己 profile 视图里显示 "Replying to"）
    //   - 旧版 isReplyTweet 查不到 → reply 被当成原创 → 被误删
    //   - 唯一可靠的「非破坏性」检测是 **在文章全文里搜 "Replying to" / "in reply to" 关键字**
    //   - 另一个 100% 可靠的检测是 **打开 caret 菜单后数菜单项数**：原创=11 项，reply=8 项（少了 Edit / Add/remove content disclosure / Change who can reply）
    //     但这个需要在 click 之后才能用，作为二次校验更合适
    isReplyTweet(container) {
      if (!container) return false;
      // 1) 优先查 socialContext（X 旧版行为）
      var socialContext = container.querySelector("[data-testid='socialContext']");
      if (socialContext) {
        var scText = (socialContext.textContent || '').toLowerCase();
        if (/replying to|回复|回覆|返信|답장|respondiendo a|antworten|répondre|rispondendo a/i.test(scText)) {
          return true;
        }
      }
      // 2) 兜底：扫描整个 article 的 textContent，搜 "Replying to" / "in reply to" 关键字
      //   适用于：X 在用户自己 profile 视图隐藏 socialContext，但 reply 链接 text 仍然带这些词
      var fullText = (container.textContent || '').toLowerCase();
      return /replying to|in reply to|回复\s*@|回覆\s*@|返信先|답장\s*@/i.test(fullText);
    }

    // 哪些 itemType 启用日期+关键字过滤（bookmarks + following + tweets）
    shouldFilter(itemType) {
      if (!this.filters) return false;
      return itemType === 'bookmarks' || itemType === 'following' || itemType === 'tweets';
    }

    async processItems(itemType, maxItems) {
      if (maxItems === undefined) maxItems = 50;

      // 复数 itemType 映射到单数配置 key（DEFAULT_SELECTORS / remoteConfig 都用单数）
      var CONFIG_KEY_MAP = {
        likes: 'like',
        bookmarks: 'bookmark',
        tweets: 'tweet'
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

      // 特殊处理 Tweets：原创删推文 + retweet 撤销 repost（仿 processBookmarks 模式）
      if (itemType === 'tweets') {
        await this.processTweets(maxItems);
        return;
      }

      // 未知 type：兜底拒绝
      this.error('Unknown itemType: ' + itemType);
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

    // 专门处理 Tweets：原创删推文 + retweet 撤销 repost
    // 仿 processBookmarks 模式：每个 iteration 全局扫按钮 + 过滤 + dispatch
    // 不同点：dispatch 时按 isRetweet 标记调 deleteTweet 或 unreTweet
    async processTweets(maxItems) {
      if (maxItems === undefined) maxItems = 50;

      const self = this;

      // 内置兜底选择器（远程配置可覆盖，远程的放前面优先）
      //   X 各改版下"more 按钮"形态差异很大（testid / role / svg / i18n），必须宽泛覆盖
      //   排他规则：必须是按钮（button / role=button），避免误中 article / svg icon
      const BUILTIN_MORE_BUTTONS = [
        // 通用 testid 形态
        "[data-testid='more']",
        "[data-testid='caret']",
        "[data-testid='tweet-action']:last-of-type",  // 旧版中"more"是 action 组最后一个
        // 显式 button / role=button 形态（避免误中容器）
        "button[aria-label='More']",
        "button[aria-label*='More']",
        "[role='button'][aria-label*='More']",
        // i18n 兜底（中文 / 日文 / 韩文 / 西语 / 德语 / 法语）
        "button[aria-label*='更多']",
        "button[aria-label*='その他']",
        "button[aria-label*='더 보기']",
        "button[aria-label*='Más']",
        "button[aria-label*='Mehr']",
        "button[aria-label*='Plus']"
      ];
      const BUILTIN_UNRETWEET_BUTTONS = [
        "[data-testid='unretweet']",
        "[data-testid='Unretweet']",
        "[data-testid='undoRepost']",
        "button[aria-label*='Undo repost']",
        "button[aria-label*='Undo Repost']",
        "button[aria-label*='取消转帖']",
        "button[aria-label*='撤销转发']"
      ];

      // 远程配置覆盖
      var remoteMore = (this.config && this.config.tweet && Array.isArray(this.config.tweet.moreButtons))
        ? this.config.tweet.moreButtons : [];
      var remoteUnretweet = (this.config && this.config.tweet && Array.isArray(this.config.tweet.unreTweetButtons))
        ? this.config.tweet.unreTweetButtons : [];

      const moreButtons = remoteMore.concat(BUILTIN_MORE_BUTTONS);
      const unretweetButtons = remoteUnretweet.concat(BUILTIN_UNRETWEET_BUTTONS);

      // 是否跳过 retweet（用户在 sidepanel 关闭 includeRetweets）
      var includeRetweets = !(self.tweetOptions && self.tweetOptions.includeRetweets === false);

      this.log(t('startingTweetsCleanup', {url: window.location.href}));

      // 关键修复：等 articles 渲染（X 改版后 SPA 渲染延迟有时 1-2s）
      //   现象：用户实测反馈"还没开始就结束了" —— 诊断 0 命中 + 立即 End of tweets list
      //   修法：_diagnosePage 前等最多 3s 让至少 1 个 article 出现
      //   关联：getTweetsPageURL 已修复会走 /with_replies，这里再加渲染等待做防御
      var __articleWaitStart = Date.now();
      while (Date.now() - __articleWaitStart < 3000) {
        if (document.querySelectorAll('article').length > 0) break;
        await this.sleep(200);
      }

      // 预计算 keyword 小写
      this._keywordLower = (this.filters && this.filters.keyword)
        ? this.filters.keyword.toLowerCase() : '';

      this._diagnosePage();

      // 诊断：每个选择器组实际匹配多少按钮（一次性 log，让用户/开发者看到 DOM 里到底是什么）
      // 之前只 log 到 console（要看 devtools），现在 log 到 sidepanel 日志，零成本发现 selector miss
      function logSelectorMatches(label, selectors) {
        const results = [];
        let total = 0;
        for (let s = 0; s < selectors.length; s++) {
          const btns = self.findElements(selectors[s]);
          if (btns.length > 0) {
            results.push(selectors[s] + ' → ' + btns.length);
            total += btns.length;
          }
        }
        if (results.length > 0) {
          self.log('[diagnose] ' + label + ' matches: ' + total + ' (' + results.join('; ') + ')');
        } else {
          self.log('[diagnose] ' + label + ' matches: 0 — 全部 selector 都没匹配到！可能 X 改版或页面还没加载');
        }
      }
      var diagnosticLogged = false;
      function collectCandidates() {
        if (!diagnosticLogged) {
          diagnosticLogged = true;
          logSelectorMatches('more', moreButtons);
          if (includeRetweets) logSelectorMatches('unretweet', unretweetButtons);
        }
        const candidates = [];
        const seen = new WeakSet();
        function addAll(buttons, isRetweet) {
          for (let i = 0; i < buttons.length; i++) {
            const btn = buttons[i];
            if (seen.has(btn)) continue;
            seen.add(btn);
            candidates.push({ btn: btn, isRetweet: isRetweet });
          }
        }

        // 关键修复：retweet 卡片的 caret 菜单里没有 Delete / Undo repost
        //   现象：用户实测反馈"转发的右上角 More 按钮弹窗里没有删除"
        //   原因：转发卡片没有用 caret → Delete 路径，只能用帖子下面的 retweet 图标 → Undo repost 路径
        //   修法：collectCandidates 时跳过转发卡片的 caret，避免 caret 残留菜单阻塞后续 unretweet 点击
        function isRetweetCard(button) {
          if (!button) return false;
          var article = button.closest('article')
            || button.closest("[data-testid='tweet']");
          if (!article) return false;
          // 4 种 retweet 指示器（覆盖 X 改版）
          return article.querySelector('[data-testid="unretweet"]') !== null
              || article.querySelector('[data-testid="Unretweet"]') !== null
              || article.querySelector('[data-testid="undoRepost"]') !== null
              // 兜底：aria-label 含 "Reposted" 表明这是转发卡片的 retweet 按钮（用户已转）
              || article.querySelector('button[aria-label*="Reposted"]') !== null;
        }

        // 累积所有匹配（不去重 break）——不同 X 改版下同一个页面的不同推文卡片可能用不同 testid，
        //   比如"自己推文"用 caret，"他人推文"用 more，break 会漏匹配。
        //   addAll 内部用 WeakSet 去重，所以多个 selector 命中同一元素不会重复。
        for (let s = 0; s < moreButtons.length; s++) {
          const btns = self.findElements(moreButtons[s]);
          // 关键：retweet 卡片的 caret 跳过（菜单里没 Delete）
          const nonRetweetBtns = btns.filter(function(b) { return !isRetweetCard(b); });
          if (nonRetweetBtns.length > 0) addAll(nonRetweetBtns, false);
        }
        // retweet 按钮（若用户关闭则跳过）
        if (includeRetweets) {
          for (let s = 0; s < unretweetButtons.length; s++) {
            const btns = self.findElements(unretweetButtons[s]);
            if (btns.length > 0) addAll(btns, true);
          }
        }
        return candidates;
      }

      let emptyScrolls = 0;
      const maxEmptyScrolls = 3;

      // 无进展兜底（30s 没新增就 break，防止 X 改版 / 选择器失效死循环）
      //   重要：这个 var 必须在 processTweets 函数体内声明——上次 refactor 误把它加到了 processLikes 里
      //   导致 processTweets 的 while 循环 ReferenceError，整个 cleanup 0 命中
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

        const candidates = collectCandidates();

        // 过滤已处理（true / skipped / pinned 三态）
        const pending = candidates.filter(function(c) {
          var p = c.btn.dataset.xeraserProcessed;
          return !p || (p !== 'true' && p !== 'skipped' && p !== 'pinned');
        });

        if (pending.length === 0) {
          emptyScrolls++;
          if (emptyScrolls > maxEmptyScrolls) {
            this.log(t('noMoreTweets'));
            break;
          }
          const hasMore = await this.scrollToBottom(1500);
          if (!hasMore) {
            this.log(t('endOfTweets'));
            break;
          }
          continue;
        }

        emptyScrolls = 0;
        const candidate = pending[0];
        const btn = candidate.btn;
        const isRetweet = candidate.isRetweet;

        // 找容器：article 优先（X 标准标签），fallback 到 data-testid='tweet'，再 fallback parentElement
        var article = btn.closest('article')
          || btn.closest("[data-testid='tweet']")
          || btn.parentElement;

        // Pinned 检测：8 语言关键字匹配
        if (this.isPinnedTweet(article)) {
          btn.dataset.xeraserProcessed = 'pinned';
          this.log(t('pinnedTweetSkipped'));
          await this.sleep(50);
          continue;
        }

        // includeReplies 过滤：用户关闭时跳过 reply 卡片（仅 deleteTweet 路径）
        // 关键修复：includeReplies=false 时，reply 不能被当成原创删
        //   现象：用户实测反馈"我没有勾选 Include replies 但 reply 也被删了"
        //   原因：导航修复后 /with_replies 显示 reply 卡片，但 processTweets 没加 includeReplies 过滤
        //   关键：retweet 候选（isRetweet=true）不应用此过滤 —— 用户可能 retweet 了 reply（卡是 retweet 形态不是 reply）
        //         只在 deleteTweet 路径（非 retweet）上过滤
        if (!isRetweet
            && this.tweetOptions
            && this.tweetOptions.includeReplies === false
            && this.isReplyTweet(article)) {
          btn.dataset.xeraserProcessed = 'skipped';
          this.log('[tweets] reply skipped (includeReplies=false)');
          await this.sleep(50);
          continue;
        }

        // 日期 + 关键字过滤
        if (this.shouldFilter('tweets')) {
          var meta = this.extractMeta(article, 'tweets');
          if (!this.matchesFilter(meta, this.filters)) {
            btn.dataset.xeraserProcessed = 'skipped';
            if ((this.filters.fromDate || this.filters.toDate) && !meta.dateISO
                && !this._dateMissingWarned.has('tweets')) {
              this._dateMissingWarned.add('tweets');
              this.log(t('dateFilterSkipped', {type: 'tweets'}));
            }
            await this.sleep(50);
            continue;
          }
        }

        btn.dataset.xeraserProcessed = 'true';

        try {
          let success = false;
          if (isRetweet) {
            success = await this.unreTweet(article);
            if (success) {
              this.processedCount++;
              lastProgressTime = Date.now();  // 重置无进展计时器
              this.progress('Undo repost #' + this.processedCount);
              this.log(t('unreTweetSuccess', {count: this.processedCount}));
            } else {
              this.error(t('unretweetFailed', {error: 'no unretweet button'}));
            }
          } else {
            success = await this.deleteTweet(article);
            if (success) {
              this.processedCount++;
              lastProgressTime = Date.now();  // 重置无进展计时器
              this.progress('Tweet #' + this.processedCount);
              this.log(t('tweetDeleted', {count: this.processedCount}));
            } else {
              this.error(t('tweetDeleteFailed', {error: 'no more button or confirm'}));
            }
          }
          if (!success) {
            this.errorCount++;
          }
        } catch (e) {
          this.error((isRetweet ? 'unretweet' : 'deleteTweet') + ' threw: ' + e.message);
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
      this.tweetOptions = options.tweetOptions || null;

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
