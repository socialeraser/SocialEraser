// X-Eraser Injector
// 健壮的 DOM 操作引擎，支持远程配置选择器

(function() {
  'use strict';

  // 8 语言 i18n 关键字（默认在代码里，远程配置可覆盖）
  // 背景：X 2026 当前版本会把「按钮的 aria-label」+ 「菜单文字」都按用户的 X 显示语言翻译
  //   "Cancel" → "取消" / "キャンセル" / "취소" 等
  //   "Undo repost" → "撤销转推" / "リポストを取り消す" / "리트윗 취소" 等
  // 之前我们只用英文 selector / 英文文字（0 命中非 en 用户），现在统一在 DEFAULT_I18N 里维护 8 语言默认值
  // 远程配置（remote-example.json 的 selectors.i18n）可覆盖这些数组 —— X 改了翻译时改配置即可，不用发新版
  // 8 语言 selector 关键字默认值已挪到 lib/i18n.js 的 DEFAULT_I18N（window.XEraseri18n.DEFAULT_I18N）
  //   - i18n.js = 所有 8 语言数据的家（TRANSLATIONS 给 UI 文案用，DEFAULT_I18N 给 selector 关键字用）
  //   - 运行时合并：setConfig 用 window.XEraseri18n.DEFAULT_I18N 作默认 + remote-example.json 的 selectors.i18n 覆盖
  //   - X 改版改了翻译：改 i18n.js 或远程配置即可，不用动 injector.js
  // Backwards-compat 别名（让旧 verify 断言不破）：CANCEL_KEYWORDS_8LANG / CONFIRM_KEYWORDS_8LANG 来自 i18n.js DEFAULT_I18N
  const CANCEL_KEYWORDS_8LANG = (window.XEraseri18n && window.XEraseri18n.DEFAULT_I18N) ? window.XEraseri18n.DEFAULT_I18N.cancelKeywords : ['Cancel'];
  const CONFIRM_KEYWORDS_8LANG = (window.XEraseri18n && window.XEraseri18n.DEFAULT_I18N) ? window.XEraseri18n.DEFAULT_I18N.confirmKeywords : ['Delete'];

  class XEraserInjector {
    // X-Eraser 主引擎 —— 在 X 页面上下文里跑（被 content.js 注入）
    //
    // 职责:
    //   1. 接收 content.js 传过来的远程配置（setConfig），合并 i18n 关键字
    //   2. 4 个入口方法: processLikes / processBookmarks / processFollowing / processTweets
    //      （统一从 processItems 分派）
    //   3. 提供 DOM 操作 helper: findElement / findElements / safeClick / scrollToBottom / waitForElement
    //   4. 提供 8 语言关键字查找 helper: waitForMenuItemByText / findButtonByText
    //   5. 提供过滤器: shouldFilter / extractMeta / matchesFilter
    //
    // 设计原则:
    //   - 字段级合并 selector（远程只覆盖显式提供的字段，缺键时保留 DEFAULT）
    //   - i18n 关键字从 window.XEraseri18n.DEFAULT_I18N（i18n.js）读，远程可整体覆盖
    //   - selector / 关键字都先查远程、再查内置兜底；X 改版时改配置即可
    //   - 每个 click 都有 3 种事件兜底（click / MouseEvent / PointerEvent），兼容 React 事件代理
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

    // 配置入口：直接从 config 读（2026-XX-XX 简化）
    // 设计：background.js 已保证 config 永远不为 null（3 级回退：remote → cache → bundled default.json）
    // 这里只需把 config.selectors 拿过来即可，不需要 DEFAULT_SELECTORS 兜底
    // 字段级合并不再需要（config 永远完整，每个 type 的 selector 数组齐全）
    // 浅拷贝（3 层）：防止 processXxx 写入 merged 污染 source config
    //   - level 1: merged = Object.assign({}, config.selectors)   // 顶层 type 块隔离
    //   - level 2: merged[k] = Object.assign({}, merged[k])       // type 块内字段隔离
    //   - level 3: merged[k][f] = merged[k][f].slice()             // 数组字段深一层
    //   - level 4: 嵌套对象（如 common.userInfo）还要 .assign 一层 + 内部数组 .slice()
    // 注意：level 1 必须做！否则 merged 和 config.selectors 共享引用，改 merged.like 会反向污染 config.selectors.like
    setConfig(config) {
      var merged = {};
      if (config && config.selectors && typeof config.selectors === 'object') {
        merged = Object.assign({}, config.selectors);  // level 1: 顶层隔离
      }
      for (var k in merged) {
        if (!merged.hasOwnProperty(k)) continue;
        if (Array.isArray(merged[k])) {
          merged[k] = merged[k].slice();
        } else if (merged[k] && typeof merged[k] === 'object') {
          merged[k] = Object.assign({}, merged[k]);  // level 2: type 块隔离
          // 浅拷贝 type 块内的字段
          for (var f in merged[k]) {
            if (!merged[k].hasOwnProperty(f)) continue;
            if (Array.isArray(merged[k][f])) {
              merged[k][f] = merged[k][f].slice();  // level 3: 数组字段
            } else if (merged[k][f] && typeof merged[k][f] === 'object') {
              // 嵌套对象（如 common.userInfo）—— 浅拷贝一层 + 内部数组 .slice()
              merged[k][f] = Object.assign({}, merged[k][f]);  // level 4a: 嵌套对象隔离
              for (var nf in merged[k][f]) {
                if (merged[k][f].hasOwnProperty(nf) && Array.isArray(merged[k][f][nf])) {
                  merged[k][f][nf] = merged[k][f][nf].slice();  // level 4b: 嵌套对象内数组
                }
              }
            }
          }
        }
      }
      this.config = merged;
      // 关键修复（debug-tweet-delete-regression）：保存 config 自带的 currentUsername
      //   content.js 在 initInjector / setConfig 后会调 setCurrentUsername 覆盖
      //   兜底逻辑：config.userInfo.username（远程配置带的用户标识）
      this._currentUsername = (merged.common && merged.common.userInfo && merged.common.userInfo.username) || null;

      // 合并 i18n 8 语言关键字数组
      // 设计：默认在 i18n.js 的 DEFAULT_I18N，远程配置**整体覆盖**默认
      //   远程字段是数组时整体替换；远程字段不是数组 / 缺失 → 用默认
      // this._i18n 是运行时读的源（被 deleteTweet / unreTweet / isPinnedTweet / isReplyTweet / _closeAnyOpenConfirmDialog 用）
      // 不再写到 this.config.i18n（避免污染 this.config，让 config 保持纯 selector）
      // 从 window.XEraseri18n.DEFAULT_I18N 读（i18n.js 暴露的全局 8 语言 selector 关键字默认集合）
      // 兜底：万一 i18n.js 没加载完（极少数情况），用空对象避免脚本崩溃
      var DEFAULT_I18N_REF = (window.XEraseri18n && window.XEraseri18n.DEFAULT_I18N) || {};
      var i18nRemote = (config && config.selectors && config.selectors.i18n) || {};
      this._i18n = {};
      for (var i18nKey in DEFAULT_I18N_REF) {
        if (DEFAULT_I18N_REF.hasOwnProperty(i18nKey)) {
          this._i18n[i18nKey] = (Array.isArray(i18nRemote[i18nKey]) && i18nRemote[i18nKey].length > 0)
            ? i18nRemote[i18nKey].slice()  // 浅拷贝，运行时改 this._i18n 不污染 DEFAULT
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

    // 从 element 向上找最近的容器（遍历 selector 数组）
    // 与 findElement 的区别：closest() 是从 element 自身开始向上找，findElement 是从 context 向下找
    // 用于：btn.closest("[data-testid='tweet']") 这种「向上找 article 容器」的场景
    // 返回: 最近的匹配元素；找不到返回 null
    findClosest(selectors, element) {
      if (!selectors || !element) return null;
      const selectorList = Array.isArray(selectors) ? selectors : [selectors];
      for (let i = 0; i < selectorList.length; i++) {
        const selector = selectorList[i];
        if (typeof selector === 'string') {
          try {
            const found = element.closest(selector);
            if (found) return found;
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
      // 安全点击：自动滚动到元素 → 校验可见 → 3 种点击方式兜底 → 等待
      // 参数:
      //   element     - 要点击的 DOM 元素
      //   delayAfter  - 点击后等待的毫秒数（给 React state 更新留时间），默认 500
      // 返回: true = 点击成功；false = 元素无效（null/不可见） 或 抛错
      if (!element) return false;
      if (delayAfter === undefined) delayAfter = 500;

      try {
        // 1. 先把元素滚到视口中央（X 是无限滚动页面，必须滚动到位才能点击）
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await this.sleep(300);

        // 2. 校验元素可见（getBoundingClientRect 宽高都是 0 → 隐藏 / 离屏 / display:none）
        const rect = element.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) {
          // 元素不可见，X 还没渲染完或被遮挡 → 跳过本次点击，外层循环会重试
          return false;
        }

        // 3. 三种点击方式兜底（X 用 React 事件代理，单纯 .click() 可能不触发 state 更新）
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

        // 4. 等待 React state 更新 + 弹窗动画
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
      // 滚动到页面底部，触发 X 的无限滚动加载新内容
      // 参数: scrollDelay - 滚动后等待加载的毫秒数（默认 1000）
      // 返回: true = 页面变长了（新内容加载出来了）；false = 已到底部
      if (scrollDelay === undefined) scrollDelay = 1000;

      const startHeight = document.documentElement.scrollHeight;
      window.scrollTo(0, document.documentElement.scrollHeight);
      await this.sleep(scrollDelay);

      const newHeight = document.documentElement.scrollHeight;
      return newHeight > startHeight;
    }

    async waitForElement(selector, timeout) {
      // 轮询查找元素 —— 给 X 异步渲染一点时间
      // 参数:
      //   selector - 单个 selector 字符串 或 selector 数组（按顺序轮询，第一个命中的就返回）
      //   timeout  - 超时毫秒数（默认 5000）
      // 返回: 第一个命中的 DOM 元素；超时返回 null
      if (timeout === undefined) timeout = 5000;

      const startTime = Date.now();
      while (Date.now() - startTime < timeout) {
        const element = this.findElement(selector);
        if (element) return element;
        await this.sleep(200);  // 每 200ms 重试一次，避免打爆 CPU
      }
      return null;
    }

    // 删除一条原创推文（processTweets 里调用）
    // 流程（3 步点击）:
    //   1. 点卡片上的 more/caret 按钮 → 弹出菜单
    //   2. 菜单里点 "Delete" 菜单项（按 8 语言文字匹配，不用 testid）
    //   3. 确认弹窗点 confirmButton（[data-testid='confirmationSheetConfirm']）
    // 返回: true = 3 步全成功；false = 任一步骤失败（按钮没找到 / 弹窗没出现 / 点击失败）
    async deleteTweet(container) {
      if (!container) return false;

      const selectors = this.config.tweet;
      if (!selectors) {
        this.error('No selectors for tweet (deleteTweet)');
        return false;
      }

      // 兼容：moreButtons（数组，新 schema）|| moreButton（字符串，旧 schema）
      // 与 unfollowUser 的兼容模式一致
      const moreBtnSelectors = Array.isArray(selectors.moreButtons)
        ? selectors.moreButtons
        : (selectors.moreButton ? [selectors.moreButton] : []);
      if (moreBtnSelectors.length === 0) return false;

      const moreButton = this.findElement(moreBtnSelectors, container);
      if (!moreButton) {
        // 错误信息具体到 3 步：more / menu / confirm。
        //   帮定位问题：之前笼统"no more button or confirm"无法区分是 caret 死了 / menu 没出 / confirm 死了
        //   关联：tweets-bug-3 (2026-06-17) + 早期 debug-tweet-delete-regression
        this.error('deleteTweet: more button not found in container');
        return false;
      }

      // 关键修复（M++ 修复 tweets-bug-3 2026-06-17 增量）：
      //   旧版直接 safeClick(moreButton, 0) → click caret → 但 N++ 修复 isReplyTweet 已 click caret 弹菜单
      //   → 再次 click caret → toggle 关掉 → 0 menuitem → waitForMenuItemByText 3s timeout → 失败
      //   修法：先 wait 350ms 看 menuitem 是不是已在（reply 推文 N++ 修复弹菜单）—— 命中直接 click deleteItem
      //         miss（原创推文 N++ 修复没弹菜单）→ 才 click caret 弹菜单 + wait 3000ms
      //   MCP 实证（2026-06-17 第三次 cleanup 测试 menuitemCount=0 startCount=0 + 第 1 次 wait 50ms snapshot=[Delete, Pin, ...]）：
      //     - startCount=0, 50ms 内出现 8 menuitem → 50ms timeout 退出**未**进 while loop body
      //       → 50ms 太短！N++ 修复 click caret 弹菜单需要 150-200ms 渲染时间
      //     - 改 50ms → 350ms → wait 350ms 命中"Delete" → click deleteItem
      //   注意：原创推文 N++ 修复**也**调 isReplyTweet（line 1497 diag log）→ 弹菜单
      //         wait 350ms **也**命中 → click deleteItem —— OK
      //         不会触发 fallback click caret（除非 N++ 修复失败未弹菜单）
      let deleteItem = await this.waitForMenuItemByText(
        this._i18n.deleteKeywords,
        350
      );
      if (!deleteItem) {
        // N++ 修复未弹菜单（原创推文特殊情况）→ fallback click caret 弹菜单
        await this.safeClick(moreButton, 0);
        deleteItem = await this.waitForMenuItemByText(
          this._i18n.deleteKeywords,
          3000
        );
        if (!deleteItem) {
          this.error('deleteTweet: Delete menu item not found (3s timeout)');
          return false;
        }
      }

      await this.safeClick(deleteItem, 0);

      // 关键修复（M 修复 tweets-bug-3 2026-06-17）：
      //   X 2026 改版后删推文**不需要 confirm 弹窗**——click Delete menuitem → 推文**直接消失**。
      //   旧代码假设需要 confirm 弹窗 → waitForElement(selectors.confirmButton, 3000) 等 3s 找不到
      //   → deleteTweet 返回 false → processedCount 不加 → 推文**实际已删**但代码不知
      //   → user 看到"卡 3s + processed=1"。
      //
      // 关键修复（M+ 修复 tweets-bug-3 2026-06-17 增量）：
      //   M 修复用了 `article.isConnected`，但**函数参数叫 `container`**——`article` 未定义
      //   → 抛 "article is not defined" ReferenceError → catch 块捕获 → btn 标 'failed'
      //   → processed=0。**必须**用 `container.isConnected`（processTweets 传的就是 article）
      //
      // MCP 实证（2026-06-17 xiangping 自己推文 click Delete 抓 dialog）：
      //   dialogCount=0（没 confirm 弹窗）
      //   hasUndoBanner=false（也没 Undo 横幅）
      //   "Money Money Home" 推文**真的**从 DOM 消失（article count 3 → 2）
      //
      // 修法（兼容 X 旧版 + X 2026）：
      //   主路径：等 container.isConnected === false（X 2026 立即删）
      //   备路径：find confirm 弹窗（X 旧版需要 click confirm 弹窗，X 2026 无此弹窗）
      //   任何一条路径成功 → return true；3s 后都失败 → return false
      const M_START = Date.now();
      const M_TIMEOUT = 3000;
      let mSucceeded = false;
      let mConfirmClicked = false;
      while (Date.now() - M_START < M_TIMEOUT) {
        // 主路径：X 2026 推文直接消失
        if (!container.isConnected) {
          mSucceeded = true;
          break;
        }
        // 备路径：X 旧版 找 confirm 弹窗（短暂轮询避免长期等）
        const confirmButton = await this.waitForElement(selectors.confirmButton, 200);
        if (confirmButton) {
          await this.safeClick(confirmButton, 1000);
          mConfirmClicked = true;
          // click confirm 后再等推文消失
          await this.sleep(500);
          if (!container.isConnected) {
            mSucceeded = true;
          }
          break;
        }
        await this.sleep(150);
      }
      if (!mSucceeded) {
        this.error('deleteTweet: container still exists after click Delete (3s timeout, confirmClicked=' + mConfirmClicked + ')');
        return false;
      }
      return true;
    }

    // 通用 helper：等待并返回文本内容匹配任一关键字的 menuitem
    // 用于 X 改版后菜单项无固定 testid、必须按 i18n 文字匹配的场景
    async waitForMenuItemByText(keywords, timeout) {
      // 关键修复（tweets-bug-3 2026-06-17）：
      //   旧版用 keywords.indexOf(text) 严格相等匹配 → X 2026 改版后菜单项文字
      //   不再是裸 "Delete" / "Undo repost"，而是带后缀变体（"Delete post" / "Delete this post" 等）
      //   严格相等匹配 0 命中 → waitForMenuItemByText 超时 → deleteTweet / unreTweet 返回 false
      //   → 同 candidate 无限 retry（不标 processed），user 看到 "点 More 弹菜单不点 Delete 卡住"
      //
      // 修法：改 substring 匹配 —— text/aria-label **包含** 任一 keyword 即命中。
      //   误中风险低：X 2026 8 菜单项实测均不含 "Delete" 子串。
      //   同一函数对 unreTweet / deleteTweet 都生效，撤回菜单的 "Undo repost" 严格相等仍命中。
      //
      // 失败时 log 所有 menuitem 详情（text + aria-label + testid）—— 方便后续 X 改版时
      //   从日志直接看到菜单真实结构，不用再开 MCP 复现。
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
      // 超时：log 详细 menuitem 列表（debug 关键）
      const finalItems = this.findElements('[role="menuitem"]', document);
      const snap = Array.prototype.map.call(finalItems, function(m) {
        return {
          text: (m.textContent || '').trim().substring(0, 40),
          testid: m.getAttribute('data-testid'),
          ariaLabel: (m.getAttribute('aria-label') || '').substring(0, 40)
        };
      });
      this.log('[waitForMenuItemByText] timeout ' + timeout + 'ms, keywords='
        + JSON.stringify(keywords) + ', menuitemCount=' + finalItems.length
        + ' (startCount=' + startCount + '), snapshot=' + JSON.stringify(snap));
      return null;
    }

    // 通用 helper：等待并返回文本内容匹配任一关键字的 button（role=button）
    // 与 waitForMenuItemByText 区别：waitForMenuItemByText 找 role=menuitem（下拉菜单项）
    // findButtonByText 找 role=button（弹窗里的 Cancel/Confirm 按钮）
    // 用于 X 改版后确认弹窗按钮的 aria-label 也被翻译的场景
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

    // 取消关注一个人（processFollowing 里调用）
    // 流程（2 步点击）:
    //   1. 点 cell 上的 unfollow 按钮
    //   2. confirm 弹窗点 confirmButton（[data-testid='confirmationSheetConfirm']）
    // 返回: true = 2 步全成功；false = 任一步骤失败
    // 注意: 与 deleteTweet 不同 —— deleteTweet 是 3 步（more → Delete → Confirm）
    //      unfollow 直接显示 confirm dialog，不需要中间的菜单步骤
    async unfollowUser(container) {
      if (!container) return false;

      const selectors = this.config.following;

      // 兼容新旧配置：unfollowButtons（数组，新 schema）|| unfollowButton（字符串，旧 schema）
      const btnSelectors = Array.isArray(selectors.unfollowButtons)
        ? selectors.unfollowButtons
        : (selectors.unfollowButton ? [selectors.unfollowButton] : []);

      if (btnSelectors.length === 0) return false;

      const unfollowButton = this.findElement(btnSelectors, container);
      if (!unfollowButton) return false;

      await this.safeClick(unfollowButton, 0);

      // confirm 优先级：selectors.confirmButton（旧 schema 字符串）> common.confirmButton[0]（新 schema 数组）
      const confirmSel = (selectors && selectors.confirmButton)
        || (this.config.common && this.config.common.confirmButton && this.config.common.confirmButton[0]);

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

      const selectors = this.config.tweet;
      if (!selectors) {
        this.error('No selectors for tweet (unreTweet)');
        return false;
      }

      // 兼容：unreTweetButtons（数组，新）|| unreTweetButton（字符串，旧）
      const btnSelectors = Array.isArray(selectors.unreTweetButtons)
        ? selectors.unreTweetButtons
        : (selectors.unreTweetButton ? [selectors.unreTweetButton] : []);
      if (btnSelectors.length === 0) return false;

      // 1) 点 retweet 按钮（在 container 内部 —— 卡片自己的 retweet 图标）打开菜单
      const unreTweetButton = this.findElement(btnSelectors, container);
      if (!unreTweetButton) return false;

      await this.safeClick(unreTweetButton, 500);

      // 2) 等菜单项出现 —— selector 从 config.tweet.unretweetConfirmButtons[0] 读（2026-XX-XX 抽出硬编码）
      var unretweetConfirmSel = (this.config.tweet && this.config.tweet.unretweetConfirmButtons && this.config.tweet.unretweetConfirmButtons[0]);
      let unretweetMenuItem = await this.waitForElement(unretweetConfirmSel, 2000);

      // 3) testid miss → 8 语言文字兜底（X 改版后菜单项可能去掉 testid）
      if (!unretweetMenuItem) {
        unretweetMenuItem = await this.waitForMenuItemByText(
          this._i18n.unretweetKeywords,
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
    // 设置当前登录用户名（content.js 检测到后调一次）
    // 用于 collectCandidates 过滤：article 内必须包含 currentUsername 的 User-Name
    // 否则跳过（是他人 quoted 推文，不是自己推文）
    setCurrentUsername(username) {
      this._currentUsername = (username && typeof username === 'string') ? username : null;
    }

    // 私有 helper：检查 article 是否是 currentUsername 自己的推文
    //   严格判断：必须同时满足 2 个条件
    //     1. article 内有 UserAvatar-Container-{username}（OP 独占标记）
    //        —— 引用推文没有这个 testid，只有 OP 推文有
    //     2. article 内有 User-Name 元素 href=/username（双重保险）
    //   之前只用 User-Name href 判断 → X 2026 把引用推文和 reply 推文渲染到同一 article 时
    //   reply 推文含自己的 User-Name，引用推文的 caret 也在同一 article 内
    //   → caret 点的可能是引用推文（非 OP），菜单里没 Delete
    //   增加 UserAvatar-Container-{username} 检查 → 引用推文没有这个 → 跳过
    //
    // ⚠️ 重要使用前提（tweets-bug-3 2026-06-17 教训）：
    //   **只用于 deleteTweet（caret 路径）**，**不用于 unreTweet 路径**。
    //   原因：X 2026 retweet 卡片（"You reposted"）只显示原作者头像，不显示 retweeter 自己的头像。
    //   retweet 卡片用 _isOwnArticle 判断永远 false → 撤销 retweet 永远 0 命中。
    //   撤销 retweet 路径的"自己"判断改靠 [data-testid='unretweet'] 按钮本身（X 不会
    //   在他人转发的卡片上渲染这个按钮），比 _isOwnArticle 更准。
    _isOwnArticle(article) {
      if (!article) return true;
      var username = this._currentUsername;
      if (!username) return true;  // 没设用户名就不过滤
      // 条件 1：必须有自己的 UserAvatar-Container
      var avatarContainer = article.querySelector("[data-testid='UserAvatar-Container-" + username + "']");
      if (!avatarContainer) return false;
      // 条件 2：必须有 User-Name href=/username（双重保险）
      var userLinks = article.querySelectorAll("[data-testid='User-Name']");
      for (var i = 0; i < userLinks.length; i++) {
        var hrefs = userLinks[i].querySelectorAll('a[href]');
        for (var j = 0; j < hrefs.length; j++) {
          var href = hrefs[j].getAttribute('href') || '';
          if (href === '/' + username || href.indexOf('/' + username) === 0) {
            return true;
          }
        }
      }
      return false;
    }

    isPinnedTweet(container) {
      if (!container) return false;
      // selector 从 config.tweet.socialContext 读（2026-XX-XX 抽出硬编码）
      var socialContext = this.findElement(this.config.tweet && this.config.tweet.socialContext, container);
      if (!socialContext) return false;
      var text = (socialContext.textContent || '').toLowerCase();
      // 8 语言 pinned 关键字从 this._i18n.pinnedKeywords 读（默认 8 语言，远程配置可覆盖）
      // 动态构建 regex：先 escape 特殊字符，再 | 连接
      // 例：默认 → /pinned|已置顶|已釘選|ピン留め|고정|fijado|angeheftet|épinglé/i
      var pinnedRe = new RegExp(
        this._i18n.pinnedKeywords.map(function(k) {
          return k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        }).join('|'),
        'i'
      );
      return pinnedRe.test(text);
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
      // 关键修复（N 修复 tweets-bug-3 2026-06-17）：
      //   X 2026 改版后 reply 推文**完全**去除 "Replying to" 文字：
      //     1) socialContext 元素 → null（X 不再渲染 "Replying to" socialContext）
      //     2) 全文搜 replyKeywords → 都 miss（"Replying to" / "in reply to" / "回复" 等都不存在）
      //   旧 isReplyTweet 永远 false（假阴性）→ includeReplies=false 时 reply 推文被误删
      //
      // MCP 实证（2026-06-17 xiangping 2m reply 推文抓 DOM）：
      //   - socialContext 元素: null
      //   - 全文搜 "Replying to" / "in reply to" / "Replying": 全部 miss
      //   - 全文搜 "回复" / "回覆" / "返信" / "답장": 全部 miss
      //   - textContent 只 27 字符（"xiangping@xiangping5211·2m1"），纯 emoji 推文
      //   - 唯一可靠标识：caret 菜单项数（11 = 原创 / 8 = reply）
      //     11 项含 Edit / Add or remove content disclosure / Change who can reply
      //     8 项少那 3 项
      //
      // 修法：保留 X 旧版检测（socialContext + 全文）兼容，加 8 vs 11 菜单项检测作 X 2026 主路径
      //   步骤：
      //     a) click caret 弹菜单（不点 Delete）
      //     b) 同步等 200ms 让菜单渲染
      //     c) 数 [role="menuitem"] 数量
      //     d) ESC 关掉菜单（dispatch 到 document + window，X 多层 listener 都能收到）
      //     e) count == 8 → reply / count == 11 → 原创 / 0 → 失败（按 "非 reply" 处理）
      //
      // 风险评估：
      //   - click caret 弹菜单不必然误删（之前 MCP 测 8 项菜单没误删）
      //   - ESC 关掉后菜单消失
      //   - X-Eraser cleanup 跑时没人手动 keypress → 不会误点 Delete
      if (!container) return false;
      // 8 语言 reply 关键字从 this._i18n.replyKeywords 读（默认 8 语言，远程配置可覆盖）
      // 动态构建 regex：先 escape 特殊字符，再 | 连接
      var replyRe = new RegExp(
        this._i18n.replyKeywords.map(function(k) {
          return k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        }).join('|'),
        'i'
      );
      // 1) 优先查 socialContext（X 旧版行为）
      // selector 从 config.tweet.socialContext 读（2026-XX-XX 抽出硬编码）
      var socialContext = this.findElement(this.config.tweet && this.config.tweet.socialContext, container);
      if (socialContext) {
        var scText = (socialContext.textContent || '').toLowerCase();
        if (replyRe.test(scText)) {
          return true;
        }
      }
      // 2) 兜底：扫描整个 article 的 textContent，搜 "Replying to" / "in reply to" 关键字
      //   适用于：X 在用户自己 profile 视图隐藏 socialContext，但 reply 链接 text 仍然带这些词
      //   注：原版有 @ 严格匹配（如 "回复 @xxx"），现在用 replyKeywords 统一处理
      //   假阳性风险："回复" 这种普通词可能误匹配（X 实际场景较少见，因为 reply 总是带 @username）
      //   远程配置如要严格匹配，可加 "@" 到 replyKeywords（如 "回复 @"）
      var fullText = (container.textContent || '').toLowerCase();
      if (replyRe.test(fullText)) {
        return true;
      }
      // 3) X 2026 主路径：caret 菜单项数检测（8 = reply / 11 = 原创）
      //   click caret 弹菜单 + 数 menuitem + **不**关菜单（留 page 上给 X-Eraser 用）
      //
      // 关键修复（N++ 修复 tweets-bug-3 2026-06-17 增量）：
      //   旧版 N+ click body 用 mousedown/pointerdown/click 强制关菜单——**仍污染 X 内部 popup state**：
      //     X 内部 click outside listener 触发记录"刚刚点过 body"
      //     后续 X-Eraser line 297 click caret → toggle 关掉 → 0 menuitem
      //     → waitForMenuItemByText 3s timeout → deleteTweet 失败 → processed=0
      //   MCP 实证（2026-06-17 第三次 cleanup 测试）：
      //     - menuitemCount=0 (startCount=0) snapshot=[] —— X-Eraser click caret **不**弹菜单
      //     - N+ 修复 click body 是根因
      //   修法：N++ 修复**不**关菜单（留菜单在 page 上）—— X-Eraser 后续**不** click caret
      //     直接 wait menuitem 50ms（菜单已在 page 上）→ 命中"Delete" → click deleteItem
      //     原创推文（无 N++ 修复弹菜单）→ wait 50ms miss → X-Eraser 走 fallback click caret + wait 3000ms
      try {
        var caret = container.querySelector('[data-testid="caret"]');
        if (!caret) return false;
        caret.click();
        // 同步等 250ms 让菜单渲染（busy wait 避免 async 化影响调用方）
        var nStart = Date.now();
        while (Date.now() - nStart < 250) { /* busy wait */ }
        var menuitems = this.findElements('[role="menuitem"]', document);
        var nCount = menuitems.length;
        // **N++ 关键**：**不**关菜单（留 page 上给 X-Eraser deleteTweet 用）—— 避免污染 X 内部 popup state
        if (nCount === 8) {
          return true;  // reply 推文
        }
        if (nCount === 11) {
          return false;  // 原创推文
        }
        // 异常（0 项 / 9 项 / 其他）→ 保守按 "非 reply"（false）处理
        return false;
      } catch (e) {
        // click caret 失败 / 异常 → 保守按 "非 reply" 处理
        return false;
      }
    }

    // 哪些 itemType 启用日期+关键字过滤（bookmarks + following + tweets）
    shouldFilter(itemType) {
      // 是否对该 itemType 启用日期 + 关键字过滤
      //   likes 不支持过滤（没日期筛选 UI）→ false
      //   bookmarks / following / tweets 支持日期 + 关键字过滤 → true
      // 返回: true = 走 extractMeta + matchesFilter；false = 全部删除
      if (!this.filters) return false;
      return itemType === 'bookmarks' || itemType === 'following' || itemType === 'tweets';
    }

    async processItems(itemType, maxItems) {
      // 入口方法：根据 itemType 分派到具体的 processLikes / processBookmarks / processFollowing / processTweets
      // 参数:
      //   itemType  - 'likes' | 'bookmarks' | 'following' | 'tweets'
      //   maxItems  - 本次最多处理多少条，默认 50
      if (maxItems === undefined) maxItems = 50;

      // 复数 itemType 映射到单数配置 key（remoteConfig 用单数：like/bookmark/tweet）
      var CONFIG_KEY_MAP = {
        likes: 'like',
        bookmarks: 'bookmark',
        tweets: 'tweet'
      };
      var configKey = CONFIG_KEY_MAP[itemType] || itemType;

      // 预计算 keyword 小写（matchesFilter 里会反复用，提前算一次省 CPU）
      this._keywordLower = (this.filters && this.filters.keyword)
        ? this.filters.keyword.toLowerCase() : '';

      // 用户可能在此期间点了 Stop —— 启动前再检查一次
      if (!this.isRunning) return;

      const selectors = this.config[configKey];
      if (!selectors) {
        this.error('No selectors for ' + itemType);
        return;
      }

      this.log('Processing ' + itemType + '...');

      // 按 itemType 分派到对应处理函数（每个函数都自己管「滚动 + 找按钮 + 点击 + 错误处理」）
      if (itemType === 'likes') {
        await this.processLikes(maxItems);
        return;
      }

      if (itemType === 'bookmarks') {
        await this.processBookmarks(maxItems);
        return;
      }

      if (itemType === 'following') {
        await this.processFollowing(maxItems);
        return;
      }

      // 推文最复杂：要处理原创（删）+ retweet（撤销 repost）+ pinned（跳过）+ reply（按 includeReplies 决定）
      if (itemType === 'tweets') {
        await this.processTweets(maxItems);
        return;
      }

      // 未知 type：兜底拒绝（防御性编程，避免拼错 itemType 时静默失败）
      this.error('Unknown itemType: ' + itemType);
    }

    // 提取容器的元数据（日期 + 文本），给 matchesFilter 用来过滤
    //   likes / bookmarks / tweets：dateISO 从 <time datetime="..."> 取，text 从 [data-testid="tweetText"] 取
    //   following：dateISO 通常为空（X profile 页面没有"关注时间"），text 从用户名 / bio 取
    // 返回: { dateISO: 'YYYY-MM-DD' | null, text: '...' }
    extractMeta(container, itemType) {
      var meta = { dateISO: null, text: '' };
      if (!container) return meta;

      // 日期：HTML5 <time datetime="2024-12-15T10:30:00.000Z"> 属性
      //   slice(0, 10) 截取前 10 字符 → 'YYYY-MM-DD'（matchesFilter 用 fromDate 直接字符串比较）
      var timeEl = this.findElement(this.config.common && this.config.common.timeElement, container);
      if (timeEl) {
        var dt = timeEl.getAttribute('datetime') || '';
        meta.dateISO = dt.slice(0, 10);
      }

      // 文本：按类型选不同选择器，避免在巨大容器上读 textContent（性能差 + 误匹配）
      var parts = [];
      if (itemType === 'following') {
        // following 页是 UserCell：取用户名 / @handle / bio 作为关键字匹配源
        // selector 从 config.common.userInfo 读（2026-XX-XX 抽出硬编码）
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
        // tweets / likes / bookmarks：取推文正文（X 在 <div data-testid="tweetText"> 里）
        // selector 从 config.common.tweetText 读（2026-XX-XX 抽出硬编码）
        var textEls = this.findElements(this.config.common && this.config.common.tweetText, container);
        for (var i = 0; i < textEls.length; i++) {
          parts.push(textEls[i].textContent || '');
        }
      }
      meta.text = parts.join(' ').trim();

      return meta;
    }

    // 判断 meta 是否匹配 filters（所有条件 AND 关系，全满足才算匹配）
    //   filters.fromDate: 推文日期必须 ≥ 此值（YYYY-MM-DD 字符串比较）
    //   filters.toDate:   推文日期必须 ≤ 此值
    //   filters.keyword:  推文文本（用户名/bio/正文）必须包含此关键字（大小写不敏感）
    // 返回: true = 通过过滤（要处理）；false = 不通过（要跳过）
    matchesFilter(meta, filters) {
      if (!filters) return true;
      // 日期过滤：meta.dateISO 为空（following 页没日期）时直接不通过
      //   'YYYY-MM-DD' 格式可以直接用 < / > 比较字符串大小（字典序 == 时间序）
      if (filters.fromDate && (!meta.dateISO || meta.dateISO < filters.fromDate)) return false;
      if (filters.toDate && (!meta.dateISO || meta.dateISO > filters.toDate)) return false;
      // 关键字过滤：大小写不敏感的子串匹配（pre-built this._keywordLower 避免每次 toLowerCase）
      if (filters.keyword) {
        var haystack = (meta.text || '').toLowerCase();
        if (haystack.indexOf(this._keywordLower) < 0) return false;
      }
      return true;
    }

    // 专门处理 Likes（unlike 按钮）
    // 流程:
    //   1. 收集页面上所有 unlike 按钮（用 selector 轮询）
    //   2. 一个一个点击（每点一个 X 会自动刷新 DOM）
    //   3. 滚到底部触发 X 无限滚动加载更多 likes
    //   4. 连续 maxEmptyScrolls 次没新内容 → 退出（到底了）
    // 注意: likes 不支持日期/关键字过滤（shouldFilter → false），所有 visible likes 都会被 unlike
    async processLikes(maxItems) {
      if (maxItems === undefined) maxItems = 50;

      // emptyScrolls: 连续"滚到底但页面没变长"的次数；超过 maxEmptyScrolls 就认为到底了
      let emptyScrolls = 0;
      const maxEmptyScrolls = 3;

      // 全部 selector 从 config 来（2026-XX-XX 抽出：远程 → default.json → 空 shape）
      // config 由 background 预加载（remote fail → default.json fallback），
      // 这里直接读 this.config.like.unlikeButtons 即可，不再有 BUILTIN 兜底
      var remoteUnlike = (this.config && this.config.like && Array.isArray(this.config.like.unlikeButtons))
        ? this.config.like.unlikeButtons : [];
      const unlikeSelectors = remoteUnlike;

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
          var article = this.findClosest(this.config.common && this.config.common.articleContainers, btn) || btn.parentElement;
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

        // 标记放后面：safeClick 失败时不要永久标记（让下一轮能重试）
        try {
          const ok = await this.safeClick(btn, 800);
          if (ok) {
            btn.dataset.xeraserProcessed = 'true';
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

    // 专门处理 Bookmarks（移除非书签按钮）
    // 流程（与 processLikes 类似，但增加过滤器支持）:
    //   1. 收集页面上所有 removeBookmark / unbookmark 按钮
    //   2. 每个按钮对应的 article 容器 → 提取 meta → matchesFilter 决定要不要处理
    //   3. 满足过滤条件才点（日期/关键字由用户侧栏设置）
    //   4. 滚到底部触发无限滚动；连续 3 次没新内容 → 退出
    // 注意: bookmarks 支持日期+关键字过滤（shouldFilter → true）
    async processBookmarks(maxItems) {
      if (maxItems === undefined) maxItems = 50;

      // emptyScrolls: 连续"滚到底但页面没变长"的次数；超过 maxEmptyScrolls 就认为到底了
      let emptyScrolls = 0;
      const maxEmptyScrolls = 3;

      // 全部 selector 从 config 来（2026-XX-XX 抽出：远程 → default.json → 空 shape）
      var remoteRemove = (this.config && this.config.bookmark && Array.isArray(this.config.bookmark.removeButtons))
        ? this.config.bookmark.removeButtons : [];
      const removeSelectors = remoteRemove;

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
          // 与 processLikes / processFollowing 保持一致：找最近容器用 articleContainers
          //   旧代码用 btn.closest('article') 在 X 把书签移到 cellInnerDiv 时会失效
          var article = this.findClosest(this.config.common && this.config.common.articleContainers, btn) || btn.parentElement;
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

        // 标记放后面：safeClick 失败时不要永久标记（让下一轮能重试）
        try {
          const ok = await this.safeClick(btn, 800);
          if (ok) {
            btn.dataset.xeraserProcessed = 'true';
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
    // 专门处理 Following（取消关注）
    // 与 processBookmarks / processLikes 的区别:
    //   1. 需要两步点击（unfollow 按钮 → confirm dialog）
    //   2. 过滤容器用 [data-testid="cellInnerDiv"] 而非 article
    //   3. 关键字过滤源是用户名 / @handle / bio（extractMeta 里特殊处理）
    // 注意: following 支持日期+关键字过滤，但 dateISO 通常为空（X profile 页没"关注时间"）
    //      所以实际上 following 主要靠关键字过滤
    async processFollowing(maxItems) {
      if (maxItems === undefined) maxItems = 50;

      // emptyScrolls: 连续"滚到底但页面没变长"的次数；超过 maxEmptyScrolls 就认为到底了
      let emptyScrolls = 0;
      const maxEmptyScrolls = 3;

      // 全部 selector 从 config 来（2026-XX-XX 抽出：远程 → default.json → 空 shape）
      var remoteUnfollow = (this.config && this.config.following && Array.isArray(this.config.following.unfollowButtons))
        ? this.config.following.unfollowButtons : [];
      const unfollowSelectors = remoteUnfollow;

      // confirm 选择器优先级：following.confirmButton（字符串旧 schema）> common.confirmButton[0]（数组新 schema）
      const confirmSel = (this.config && this.config.following && this.config.following.confirmButton)
        || (this.config && this.config.common && this.config.common.confirmButton && this.config.common.confirmButton[0]);

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
          var cell = this.findClosest(this.config.common && this.config.common.articleContainers, btn) || btn.parentElement;
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

        // 标记放后面：safeClick 失败时不要永久标记（让下一轮能重试）
        try {
          // step 1: 点 unfollow 按钮（X 弹出确认 dialog）
          const ok1 = await this.safeClick(btn, 500);
          if (!ok1) {
            this.errorCount++;
            this.error(t('clickReturnedFalse'));
            await this.sleep(500);
            continue;
          }
          // step 1 成功 → step 2 即便失败，下一轮也别再点同一个 btn
          // 语义：unfollow 主按钮已点过，X 通常此时已解除关注（confirm 只是二次确认）；
          //       即便 confirm 没出现/没点到，重复点 unfollow 按钮会把已 unfollow 的人重新关注
          btn.dataset.xeraserProcessed = 'true';

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

    // 专门处理 Tweets（最复杂的一个 —— 处理原创 + retweet + reply + pinned 4 种推文）
    // 流程（仿 processBookmarks 模式）:
    //   1. 全局扫 more 按钮（每条推文卡片上都有）
    //   2. 对每个按钮找最近的 article 容器 → 提取 meta → matchesFilter
    //   3. 判断推文类型（socialContext: pinned / replying / reposted by）
    //      - pinned: 跳过（用户主动置顶的，不应该删）
    //      - reply + includeReplies=false: 跳过
    //      - retweet 卡片: 调 unreTweet（撤销 repost，不删原推文）
    //      - 原创: 调 deleteTweet（3 步：more → Delete → Confirm）
    //   4. 滚到底部加载更多；连续 3 次没新内容 → 退出
    // 注意: tweets 支持日期+关键字过滤（shouldFilter → true）+ includeReplies 子选项
    async processTweets(maxItems) {
      if (maxItems === undefined) maxItems = 50;

      const self = this;

      // 内置兜底选择器（远程配置可覆盖，远程的放前面优先）
      //   X 各改版下"more 按钮"形态差异很大（testid / role / svg / i18n），必须宽泛覆盖
      //   排他规则：必须是按钮（button / role=button），避免误中 article / svg icon
      // 全部 selector 从 config 来（2026-XX-XX 抽出：远程 → default.json → 空 shape）
      var remoteMore = (this.config && this.config.tweet && Array.isArray(this.config.tweet.moreButtons))
        ? this.config.tweet.moreButtons : [];
      var remoteUnretweet = (this.config && this.config.tweet && Array.isArray(this.config.tweet.unreTweetButtons))
        ? this.config.tweet.unreTweetButtons : [];

      const moreButtons = remoteMore;
      const unretweetButtons = remoteUnretweet;

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

      // 收集每个推文卡片对应的 more 按钮（processTweets 主循环里调）
      function collectCandidates() {
        const candidates = [];
        const seen = new WeakSet();
        function addAll(buttons, isRetweet) {
          for (let i = 0; i < buttons.length; i++) {
            const btn = buttons[i];
            if (seen.has(btn)) continue;
            seen.add(btn);
            // 关键修复：X 2026 把"More" 按钮的 selector 误中范围扩大
            //   - 侧边栏 "More menu items" 按钮（AppTabBar_More_Menu）
            //   - 趋势区 / "Who to follow" 等 sidebar 区块的 caret 按钮
            //   这些都不是推文，deleteTweet 调过去 findElement 找不到 more button，
            //   8 次失败 → 0 命中 → 30s STUCK_TIMEOUT 退出
            // 修法：btn 必须有 article / cellInnerDiv 容器祖先（unretweet 按钮本身在 retweet card 内，天然满足）
            if (!btn.closest('article')
                && !self.findClosest(self.config.common && self.config.common.articleContainers, btn)) {
              continue;
            }
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
            || self.findClosest(self.config.common && self.config.common.articleContainers, button);
          if (!article) return false;
          // 4 种 retweet 指示器（覆盖 X 改版）—— selector 从 config.tweet.retweetButtonInCard 读
          var retweetSel = self.config.tweet && self.config.tweet.retweetButtonInCard;
          if (retweetSel) {
            for (var r = 0; r < retweetSel.length; r++) {
              if (article.querySelector(retweetSel[r]) !== null) return true;
            }
          }
          return false;
        }

        // 累积所有匹配（不去重 break）——不同 X 改版下同一个页面的不同推文卡片可能用不同 testid，
        //   比如"自己推文"用 caret，"他人推文"用 more，break 会漏匹配。
        //   addAll 内部用 WeakSet 去重，所以多个 selector 命中同一元素不会重复。
        for (let s = 0; s < moreButtons.length; s++) {
          const btns = self.findElements(moreButtons[s]);
          // retweet 卡片的 caret 跳过：菜单里没 Delete，必须走 unretweet 路径
          const nonRetweetBtns = btns.filter(function(b) { return !isRetweetCard(b); });
          // 只保留 top-level article 的 caret（祖先链没有其他 article）
          //   防 quoted 推文里嵌套他人推文时，他人推文里也有 caret 按钮被误中
          const topLevelBtns = nonRetweetBtns.filter(function(b) {
            var a = b.closest('article');
            if (!a) return false;
            return !a.parentElement || !a.parentElement.closest('article');
          });
          // 必须是自己的推文（不是 quoted 推文里嵌套的他人推文）
          //   _isOwnArticle 要求 article 内有 UserAvatar-Container-{username}（OP 独占标记）
          const ownBtns = topLevelBtns.filter(function(b) {
            var a = b.closest('article');
            return self._isOwnArticle(a);
          });
          if (ownBtns.length > 0) addAll(ownBtns, false);
        }
        // retweet 按钮（若用户关闭则跳过）
        if (includeRetweets) {
          for (let s = 0; s < unretweetButtons.length; s++) {
            const btns = self.findElements(unretweetButtons[s]);
            // 关键修复（tweets-bug-3，2026-06-17 端到端验证后根因定位）：
            //   X 2026 retweet 卡片（"You reposted" 标签）的 article 内只显示 **原作者**
            //   的 User-Name / UserAvatar，不显示 retweeter（自己）的头像。
            //   旧代码 unretweet 路径也走 _isOwnArticle 过滤 → 该函数要求
            //   article 内有 UserAvatar-Container-{username} → 所有 retweet 卡片都被判定
            //   为"他人推文"过滤掉 → 撤销 retweet 永远 0 命中。
            //
            //   修法：unretweet 路径 **不应用 _isOwnArticle 过滤**。
            //   理由：unretweetButtons selector（[data-testid='unretweet'] / 已转帖 / 리ポストしました
            //   等 8 语言 aria-label 兜底）是 X 唯一给 "自己已转发" 卡片渲染的按钮 —— X 不会
            //   在他人转发的卡片上渲染 unretweet 按钮。retweet 按钮本身就是"自己已转发"的
            //   最强语义证据，比 _isOwnArticle 严格（要求头像）更准。
            //   只保留 top-level article 过滤（防 nested-article 误中：quoted 推文里
            //   嵌套了他人推文时，他人推文里可能含他人 unretweet 按钮）。
            const topLevelBtns = btns.filter(function(b) {
              var a = b.closest('article');
              if (!a) return false;
              return !a.parentElement || !a.parentElement.closest('article');
            });
            if (topLevelBtns.length > 0) addAll(topLevelBtns, true);
          }
        }
        return candidates;
      }

      // 诊断日志（tweets-bug-3 2026-06-17 保留，简化注释）：
      //   输出 processTweets 启动时的关键状态（article 数 / candidate 数 / includeReplies / includeRetweets）
      //   user 在自己的 Chrome 跑 cleanup 时打开 DevTools console 即可看到
      // region debug-point tweets-start
      try {
        var allArticles = document.querySelectorAll('article').length;
        var allCells = document.querySelectorAll("[data-testid='cellInnerDiv']").length;
        var allTweets = document.querySelectorAll("[data-testid='tweet']").length;
        var userNameEl = document.querySelector("[data-testid='User-Name']");
        var userName = userNameEl ? userNameEl.textContent.substring(0, 50) : null;
        var pathname = window.location.pathname;
        var tweetOpts = this.tweetOptions || {};
        var maxItemsLimit = maxItems;
        var maxErrorsLimit = this.maxErrors;
        var includeRepliesVal = tweetOpts.includeReplies;
        var includeRetweetsVal = tweetOpts.includeRetweets;
        var selfRef = this;
        var moreBtnCfg = (selfRef.config && selfRef.config.tweet && selfRef.config.tweet.moreButtons) || [];
        var unretweetBtnCfg = (selfRef.config && selfRef.config.tweet && selfRef.config.tweet.unretweetButtons) || [];
        var findClosestCfg = (selfRef.config && selfRef.config.common && selfRef.config.common.articleContainers) || [];
        console.log('[X-Eraser][diag][tweets] START', JSON.stringify({
          url: pathname,
          userName: userName,
          allArticles: allArticles,
          allCells: allCells,
          allTweets: allTweets,
          includeReplies: includeRepliesVal,
          includeRetweets: includeRetweetsVal,
          maxItems: maxItemsLimit,
          maxErrors: maxErrorsLimit,
          moreButtonsCfgCount: moreBtnCfg.length,
          unretweetButtonsCfgCount: unretweetBtnCfg.length,
          articleContainersCfgCount: findClosestCfg.length
        }));
        // 试 collect 一次看 candidate 数（不真处理）
        var diagCandidates = collectCandidates();
        console.log('[X-Eraser][diag][tweets] first-collect-candidates:', diagCandidates.length);
        for (var d = 0; d < diagCandidates.length; d++) {
          var dc = diagCandidates[d];
          var dArticle = dc.btn.closest('article') || dc.btn.parentElement;
          var dUserName = dArticle ? dArticle.querySelector("[data-testid='User-Name']") : null;
          var dText = dArticle ? dArticle.textContent.substring(0, 50) : '';
          var dIsRetweet = dc.isRetweet;
          var dIsPinned = selfRef.isPinnedTweet(dArticle);
          var dIsReply = selfRef.isReplyTweet(dArticle);
          console.log('[X-Eraser][diag][tweets]   candidate[' + d + ']:', JSON.stringify({
            isRetweet: dIsRetweet,
            isPinned: dIsPinned,
            isReply: dIsReply,
            userName: dUserName ? dUserName.textContent.substring(0, 30) : null,
            text: dText.replace(/\n+/g, ' ').trim()
          }));
        }
      } catch (diagErr) {
        console.warn('[X-Eraser][diag][tweets] diag failed:', diagErr.message);
      }
      // endregion debug-point tweets-start

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

        // 过滤已处理（true / skipped / pinned / failed 四态）
        //   failed 是 tweets-bug-3 2026-06-17 关键修复：旧版失败不标记 → 同 candidate 无限 retry
        //   → 30s STUCK_TIMEOUT 才退出。user 看到"点 More 弹菜单不点 Delete 卡住"现象
        //   修法：失败标 'failed'，filter 直接跳过该 candidate，让 processTweets 继续推进
        //   STUCK_TIMEOUT 仍保留作 processTweets 整体兜底（防整个循环死锁）
        const pending = candidates.filter(function(c) {
          var p = c.btn.dataset.xeraserProcessed;
          return !p || (p !== 'true' && p !== 'skipped' && p !== 'pinned' && p !== 'failed');
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

        // 诊断日志（tweets-bug-3 2026-06-17 保留）：每个 candidate 处理前 dump 关键字段
        // region debug-point tweets-candidate
        try {
          var candArticle = btn.closest('article') || btn.parentElement;
          var candUserEl = candArticle ? candArticle.querySelector("[data-testid='User-Name']") : null;
          var candUser = candUserEl ? candUserEl.textContent.substring(0, 30) : null;
          var candIsPinned = this.isPinnedTweet(candArticle);
          var candIsReply = this.isReplyTweet(candArticle);
          var candIncludeReplies = (this.tweetOptions || {}).includeReplies;
          var candShouldFilter = this.shouldFilter('tweets');
          var candMeta = candShouldFilter ? this.extractMeta(candArticle, 'tweets') : null;
          var candFilterMatch = candShouldFilter ? this.matchesFilter(candMeta, this.filters) : true;
          console.log('[X-Eraser][diag][tweets] processing candidate:', JSON.stringify({
            isRetweet: isRetweet,
            isPinned: candIsPinned,
            isReply: candIsReply,
            userName: candUser,
            includeReplies: candIncludeReplies,
            shouldFilter: candShouldFilter,
            filterMatch: candFilterMatch,
            dataTestid: btn.getAttribute('data-testid'),
            ariaLabel: (btn.getAttribute('aria-label') || '').substring(0, 30)
          }));
        } catch (candDiagErr) {
          console.warn('[X-Eraser][diag][tweets] candidate diag failed:', candDiagErr.message);
        }
        // endregion debug-point tweets-candidate

        // 找容器：article 优先（X 标准标签），fallback 到 config.common.articleContainers，再 fallback parentElement
        var article = btn.closest('article')
          || this.findClosest(this.config.common && this.config.common.articleContainers, btn)
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

        // 标记放后面：unreTweet / deleteTweet 失败时标 'failed'（tweets-bug-3 2026-06-17）
        //   旧版失败不标记 → 同 candidate 无限 retry（30s STUCK_TIMEOUT 才退出）—— user 看到 "卡在那了"
        //   修法：失败标 'failed' → filter 跳过该 candidate → processTweets 继续推进
        //   STUCK_TIMEOUT 仍保留作 processTweets 整体兜底（防整个循环死锁）
        //   设计取舍：失败放弃该 candidate 立即推进，比 30s 内 retry 4 次更稳：
        //   - 多数失败是 X 改版（菜单文字 / 按钮 testid 变化），retry 也无用
        //   - 真 transient error（DOM 没加载完）filter 后 collect 不到，问题候选就过去了
        //   - STUCK_TIMEOUT 30s 兜底整个 processTweets，防极端情况死循环
        try {
          let success = false;
          if (isRetweet) {
            success = await this.unreTweet(article);
            if (success) {
              btn.dataset.xeraserProcessed = 'true';
              this.processedCount++;
              lastProgressTime = Date.now();  // 重置无进展计时器
              this.progress('Undo repost #' + this.processedCount);
              this.log(t('unreTweetSuccess', {count: this.processedCount}));
            } else {
              btn.dataset.xeraserProcessed = 'failed';
              this.error(t('unretweetFailed', {error: 'no unretweet button'}));
            }
          } else {
            success = await this.deleteTweet(article);
            if (success) {
              btn.dataset.xeraserProcessed = 'true';
              this.processedCount++;
              lastProgressTime = Date.now();  // 重置无进展计时器
              this.progress('Tweet #' + this.processedCount);
              this.log(t('tweetDeleted', {count: this.processedCount}));
            } else {
              btn.dataset.xeraserProcessed = 'failed';
              this.error(t('tweetDeleteFailed', {error: 'no more button or confirm'}));
            }
          }
          if (!success) {
            this.errorCount++;
          }
        } catch (e) {
          // 抛异常也算失败 —— 标 'failed' 防无限 retry
          btn.dataset.xeraserProcessed = 'failed';
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
      // 用户中断时如果 confirm 弹窗开着，点 Cancel 关闭（用 8 语言文字兜底，避免 aria-label 被翻译后 0 命中）
      // 不 await：stop() 是同步 API，cleanup 异步进行；关闭弹窗的失败不影响 stop 整体行为
      this._closeAnyOpenConfirmDialog();
      this.log('Stopped');
    }

    // 关闭当前可能开着的 confirm 弹窗（找 Cancel 按钮，8 语言文字兜底）
    // 用于：用户点 Stop 中断清理时，避免 confirm 弹窗残留
    // 失败安全：找不到 Cancel 按钮就不报错（弹窗可能没开，或 X 改版了）
    // 关键字从 this._i18n.cancelKeywords 读（默认 8 语言，远程配置可覆盖）
    _closeAnyOpenConfirmDialog() {
      var self = this;
      this.findButtonByText(this._i18n.cancelKeywords, 300).then(function(btn) {
        if (btn) {
          return self.safeClick(btn, 200);
        }
        return false;
      }).catch(function() {
        // ignore - 关闭弹窗失败不影响 stop 整体
      });
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
