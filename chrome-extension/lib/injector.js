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
    //   2. 6 个入口方法: processLikes / processBookmarks / processFollowing / processOriginalTweets / processReplies / processRetweets
    //      （统一从 processItems 分派；originalTweets/replies/retweets 共享 maxPerType 预算）
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
      //   delayAfter  - 点击后等待的毫秒数（**不靠经验**，传 0 = 用 MO 监听）
      // 返回: true = 点击成功；false = 元素无效（null/不可见） 或 抛错
      if (!element) return false;
      if (delayAfter === undefined) delayAfter = 0;

      try {
        // 1. 先把元素滚到视口中央
        //   M++ 修复（2026-06-18 tweets-bug-6）：**用 behavior:'auto'（瞬时），不用 smooth**
        //     原因：X 2026 page 滚动是虚拟列表，smooth 动画 + React 重排 → scrollIntoView 可能死循环
        //           实测（user 日志）：scrollIntoView smooth 后 r.top/r.bottom 永远不满足 inView → 无限 RAF 死循环
        //     改法：瞬时滚 + 1 帧 RAF 让 layout 稳定 + maxFrames 兜底
        const SCROLL_MAX_FRAMES = 60;  // 1s @ 60fps 兜底
        element.scrollIntoView({ behavior: 'auto', block: 'center' });
        await new Promise(function(resolve) {
          let frames = 0;
          function check() {
            const r = element.getBoundingClientRect();
            if (r.top >= 0 && r.bottom <= window.innerHeight) { resolve(); return; }
            if (frames >= SCROLL_MAX_FRAMES) { resolve(); return; }  // 1s 兜底，不死循环
            frames++;
            requestAnimationFrame(check);
          }
          requestAnimationFrame(check);
        });

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
        //   不靠经验 500ms：传 0 时不 sleep（调用方已用 MO 监听后续 DOM 变化）
        //   传 >0 时保留（兼容老调用方可能依赖 sleep）
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
      // 滚动到页面底部，触发 X 的无限滚动加载新内容
      // **不靠经验猜时间**（2026-06-18 修复：原版 `scrollToBottom(1500)` 用 `sleep(1500)` 是经验时间）
      //
      // M++ 修复（2026-06-18 tweets-bug-6）：**不再用 `document.documentElement.scrollHeight` 作为"滚到哪里"**
      //   原因：X page 还没渲染完时 scrollHeight 是错的（user 日志显示 initial=676 实际是 viewport 高度，
      //         final=2865 才是真实 bookmarks 高度），滚到错误位置 → 反复 N 次才到正确位置 → 混乱
      //   修法：MO 监听 article/cellInnerDiv 数量 + RAF 滚到"最后一个元素进入 viewport"
      //     1. 找到当前容器列表（article / cellInnerDiv）
      //     2. 滚到最后一个元素的位置（让 IntersectionObserver 触发 X 加载新内容）
      //     3. RAF 轮询：连续 STABLE_FRAMES 帧容器数量不变 = 到底
      //     4. 兜底：MAX_FRAMES 帧（约 5s）还没稳定 → 强制 resolve
      //   **关键**：用"容器数量"作为稳定信号（**事件驱动**），不用 scrollHeight（**page 未加载时是错的**）
      //          帧数是浏览器物理节奏，**不靠经验猜时间**
      const MAX_FRAMES = 300;        // 300 帧 ≈ 5s @ 60fps 兜底
      const STABLE_FRAMES = 30;      // 30 帧 ≈ 0.5s 容器数量不变 = 到底
      const SCROLL_RETRY_FRAMES = 5; // 5 帧内必须有新容器出现，否则认为触底
      const self = this;

      // 找当前容器（X 2026 likes/bookmarks 用 article，following 用 cellInnerDiv）
      function getContainerSelector() {
        if (document.querySelectorAll('article').length > 0) return 'article';
        if (document.querySelectorAll("[data-testid='cellInnerDiv']").length > 0) return "[data-testid='cellInnerDiv']";
        return null;
      }

      const containerSel = getContainerSelector();
      if (!containerSel) {
        // 没找到任何容器 → X 还没渲染，process 函数应该已经 waitForContentStable 过了
        // 兜底：用 scrollHeight（page 未加载时可能错，但比什么都不做强）
        window.scrollTo(0, document.documentElement.scrollHeight);
        await this.sleep(100); // 极短 sleep 让 RAF 启动
      } else {
        // 滚到最后一个容器（让 X 加载更多）
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
        let lastContainerCount = containerSel
          ? document.querySelectorAll(containerSel).length
          : 0;
        let initialContainerCount = lastContainerCount;
        let rafId;
        let loadedNewContent = false;  // 是否真的加载了新内容（决定是否要滚回顶部）

        function rafTick() {
          totalFrames++;
          const currentCount = containerSel
            ? document.querySelectorAll(containerSel).length
            : 0;

          if (currentCount === lastContainerCount) {
            // 容器数量没变 → X 没加载新内容 → 稳定帧数 +1
            stableFrames++;
            if (stableFrames >= STABLE_FRAMES) {
              // 连续 STABLE_FRAMES 帧容器数量不变 = 到底
              self2.debug('scrollToBottom: stable ' + STABLE_FRAMES + ' frames, containers ' + initialContainerCount + '->' + currentCount + ' (' + (Date.now() - start) + 'ms)');
              cancelAnimationFrame(rafId);
              // M++ 修复（2026-06-18 tweets-bug-6 UX）：加载完新内容后自动滚回顶部
              //   不滚回 → 用户视觉上看到的是底部，process 又从顶部删 → "页面突然缩短顶部" 体验混乱
              //   滚回顶部 → 用户视觉上看到的是顶部 → 删顶部 article 自然流畅
              //   只在真的加载了新内容时滚回（避免空滚）
              if (loadedNewContent) {
                window.scrollTo(0, 0);
              }
              resolve(currentCount > initialContainerCount);
              return;
            }
          } else {
            // 容器数量变 → X 加载了新内容 → 滚到新最后一个元素
            lastContainerCount = currentCount;
            stableFrames = 0;
            loadedNewContent = true;  // 标记"加载了新内容"，resolve 时滚回顶部
            if (containerSel) {
              const containers = document.querySelectorAll(containerSel);
              const lastEl = containers[containers.length - 1];
              if (lastEl && lastEl.scrollIntoView) {
                lastEl.scrollIntoView({ behavior: 'auto', block: 'end' });
              }
            }
          }

          if (totalFrames >= MAX_FRAMES) {
            // 兜底：300 帧（5s）还没稳定
            self2.debug('scrollToBottom: max frames reached, containers ' + initialContainerCount + '->' + currentCount + ' (' + (Date.now() - start) + 'ms)');
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
      // 轮询查找元素 —— 不靠经验猜时间
      // 参数:
      //   selector  - 单个 selector 字符串 或 selector 数组（按顺序轮询，第一个命中的就返回）
      //   maxFrames - 兜底帧数（不传 = 默认 600 帧 ≈ 10s @ 60fps；传 0 = 无限）
      //                帧数是浏览器物理节奏，不是"经验时间"
      // 返回: 第一个命中的 DOM 元素；兜底耗尽返回 null
      // M++ 修复（2026-06-19 tweets-bug-8）：self = this 移到闭包顶部 + check 改箭头函数
      //   原 bug：Promise executor 的 `function(resolve){}` 内部 this 是 undefined（严格模式）
      //           const self = this 拿到 undefined，self.findElement 抛 TypeError
      //   修法：箭头函数 executor（this 继承外层 async 方法）+ self 提升到顶部
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

    // 删除一条原创推文（processOriginalTweets / processReplies 里调用）
    // 流程（3 步点击）:
    //   1. 点卡片上的 more/caret 按钮 → 弹出菜单
    //   2. 菜单里点 "Delete" 菜单项（按 8 语言文字匹配，不用 testid）
    //   3. 确认弹窗点 confirmButton（[data-testid='confirmationSheetConfirm']）
    // 返回: true = 3 步全成功；false = 任一步骤失败（按钮没找到 / 弹窗没出现 / 点击失败）
    async deleteTweet(container) {
      if (!container) return false;

      // N++ debug log（tweets-bug-3 后续诊断 2026-06-19）：
      //   现象：5 个 article 报 "Delete menu item not found (3s timeout)" 但推文实际被删
      //   目的：跑一遍后看 fail-3s log 的 isConnected —— true=真失败 / false=false negative
      //   不影响 happy path（happy path 不会触发这些 log 分支）
      var _delStartTime = Date.now();
      var _delArticleSig = (container.textContent || '').trim().substring(0, 50);
      this.debug('[deleteTweet start] article="' + _delArticleSig + '", '
        + 'isConnected=' + container.isConnected);

      // M 修复 tweets-bug-3 2026-06-17（M+ 修复 2026-06-18）：
      //   - X 旧版 click Delete menuitem 后**会**出 [role="dialog"] confirm 弹窗（data-testid="tweet-delete-confirm"）→ 再点
      //   - X 2026 click Delete menuitem 后**会**出 [data-testid="confirmationSheetConfirm"] 浮动确认条 → 再点
      //     - 实证（2026-06-18 MCP xiangping 自己推文 click Delete 抓 confirm）：dialog element = null（dialogCount=0）
      //       但出现 [data-testid="confirmationSheetConfirm"] 按钮（text="Delete"）
      //       不点 → 推文**不消失**（container.isConnected === true）→ 3s timeout
      //       点 → 推文**消失**（container.isConnected === false）→ return true
      //   - 极少数版本 click Delete 后推文**自动**消失（dialogCount=0, container.isConnected === false）→ 直接 return true
      //   - M+ 修复（2026-06-18）：原代码用未定义的 `selectors.confirmButton`（ReferenceError，类似早期 bug "article is not defined"）
      //     - deleteTweet 函数体内根本**没有**定义 `selectors` 变量（类比 M 修复前 deleteTweet 内 `article is not defined` 旧版问题）
      //     - 改用 `this.config.common.confirmButton[0]`（6-type 重构后 common 节点 6 type 共用）

      // 共享选择器：caret more 按钮 + 确认按钮（originalTweets / replies 共用）
      const moreBtnSelectors = (this.config.common && Array.isArray(this.config.common.tweetMoreButtons))
        ? this.config.common.tweetMoreButtons : [];
      if (moreBtnSelectors.length === 0) {
        this.error('No common.tweetMoreButtons for deleteTweet');
        return false;
      }

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
        this.debug('[deleteTweet 350ms-miss] article="' + _delArticleSig + '", '
          + 'menuitemCount=' + this.findElements('[role="menuitem"]', document).length);
        await this.safeClick(moreButton, 0);
        deleteItem = await this.waitForMenuItemByText(
          this._i18n.deleteKeywords,
          3000
        );
        if (!deleteItem) {
          this.error('deleteTweet: Delete menu item not found (3s timeout)');
          // N++ 关键诊断 log：fail 时推文是否实际已消失？
          //   isConnected=false → false negative（推文已删但 deleteTweet 误报失败）
          //   isConnected=true  → 真失败（推文没删，需要排查 caret / menu / confirm 链）
          this.debug('[deleteTweet fail-3s] article="' + _delArticleSig + '", '
            + 'isConnected=' + container.isConnected + ', '
            + 'elapsed=' + (Date.now() - _delStartTime) + 'ms');
          return false;
        }
      }

      await this.safeClick(deleteItem, 0);

      // 关键修复（M++ 修复 tweets-bug-3 2026-06-18 增量）：
      //   M+ 修复**错误**判断 "X 2026 改版后删推文**不需要 confirm 弹窗**"：
      //     - 实际 X 2026 click Delete menuitem 后**会**出 confirmationSheetConfirm 按钮
      //     - 必须再点 confirmationSheetConfirm → 推文才消失
      //     - 不点 → 推文不消失，container.isConnected 一直 true → while loop 3s timeout
      //   而且 M+ 修复用了未定义的变量 `selectors.confirmButton`（line 347）→ ReferenceError
      //     - deleteTweet 函数体内根本没定义 `selectors`
      //     - 触发条件：container.isConnected === true（X 旧版需要 confirm 弹窗时）
      //     - 进 while loop body → 第一行就 ReferenceError → catch 块捕获 → return false
      //
      // MCP 实证（2026-06-18 xiangping 自己推文 click Delete 抓 confirm）：
      //   - dialog element = null（X 2026 没用 [role="dialog"]，是 floating confirmation sheet）
      //   - 出现 [data-testid="confirmationSheetConfirm"] 按钮（text="Delete"）
      //   - 不点 confirmationSheetConfirm → 推文**不消失**（container.isConnected 一直 true）
      //   - 点 confirmationSheetConfirm → 推文**消失**（container.isConnected === false）
      //
      // 修法（兼容 X 旧版 + X 2026）：
      //   阶段 1：等 confirmationSheetConfirm（X 2026 必出）/ dialog confirmButton（旧版）
      //   阶段 2：click confirmButton → 推文消失 → return true
      //   兜底：极少数版本 click Delete 后推文**自动**消失 → return true
      //
      // M++ 修复（2026-06-18 tweets-bug-6 用户反馈）：
      //   原版用 M_TIMEOUT=3000 + while 时间循环 + sleep(500/150) 轮询 → 全部"靠经验猜时间"
      //   用户要求"不靠经验猜等几秒"——改为：
      //     1. MutationObserver 监听 container 父节点的 childList → container.isConnected === false 即成功
      //        （container 自己从 DOM 移除会触发父节点 childList mutation）
      //     2. click confirmButton 后用 `await containerDisappeared` Promise 等 MO 触发，**不靠时间**
      //     3. 兜底用 requestAnimationFrame 帧数：MAX_FRAMES 帧没任何 mutation = X 真挂了
      let mSucceeded = false;
      let mConfirmClicked = false;

      // 共享 confirmButton selector：直接用 common.confirmButton[0]（6 type 都从 common 取）
      const commonConfirmSel = (this.config.common && Array.isArray(this.config.common.confirmButton))
        ? this.config.common.confirmButton[0] : null;

      // 主路径：极少数版本 click Delete 后推文直接消失（X 不出 confirmationSheet）
      if (!container.isConnected) {
        return true;
      }

      // 设置 MutationObserver：监听 container 父节点的 childList + subtree
      //   container.isConnected 是只读属性，只有父节点 childList mutation 时才变化
      const self = this;
      const parentNode = container.parentNode || document.body;
      const obs = new MutationObserver(function() {
        if (!container.isConnected) {
          mSucceeded = true;
          obs.disconnect();
        }
      });
      obs.observe(parentNode, { childList: true, subtree: true });

      // 等确认按钮出现（不靠经验时间，MO 驱动）
      if (commonConfirmSel) {
        const confirmButton = await this.waitForElement(commonConfirmSel);
        if (confirmButton) {
          // safeClick 的 delayAfter 传 0：不靠经验等 React state 更新
          //   MO 监听 container 消失即可，不靠 sleep
          await this.safeClick(confirmButton, 0);
          mConfirmClicked = true;
        }
      }

      // 等 MO 触发（container 消失）/ 兜底 RAF 帧数（X 真挂了）
      //   不靠时间：MO 触发即 resolve；连续 MAX_FRAMES 帧没任何 mutation = 真挂了
      const MAX_FRAMES = 600;  // 600 帧 ≈ 10s @ 60fps（浏览器物理节奏，不靠经验数字）
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
        this.error('deleteTweet: container still exists after click Delete (max frames reached, confirmClicked=' + mConfirmClicked + ')');
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
      this.debug('[waitForMenuItemByText] timeout ' + timeout + 'ms, keywords='
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

      // M++ 修复（2026-06-18 tweets-bug-6）：maxFrames 用 600（10s）不用 2000（33s）
      const confirmButton = await this.waitForElement(confirmSel, 600);
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

      // 撤销 retweet 按钮：retweet 节点独有（unretweet testid 唯一）
      const btnSelectors = (this.config.retweet && Array.isArray(this.config.retweet.unreTweetButtons))
        ? this.config.retweet.unreTweetButtons : [];
      if (btnSelectors.length === 0) {
        this.error('No retweet.unreTweetButtons for unreTweet');
        return false;
      }

      // 1) 点 retweet 按钮（在 container 内部 —— 卡片自己的 retweet 图标）打开菜单
      const unreTweetButton = this.findElement(btnSelectors, container);
      if (!unreTweetButton) return false;

      await this.safeClick(unreTweetButton, 500);

      // 2) 等菜单项出现 —— selector 从 config.retweet.unretweetConfirmButtons[0] 读
      var unretweetConfirmSel = (this.config.retweet && Array.isArray(this.config.retweet.unretweetConfirmButtons))
        ? this.config.retweet.unretweetConfirmButtons[0] : null;
      // M++ 修复（2026-06-18 tweets-bug-6）：maxFrames 用 600（10s）不用 2000（33s）
      let unretweetMenuItem = unretweetConfirmSel ? await this.waitForElement(unretweetConfirmSel, 600) : null;

      // 3) testid miss → 8 语言文字兜底（X 改版后菜单项可能去掉 testid）
      if (!unretweetMenuItem) {
        unretweetMenuItem = await this.waitForMenuItemByText(
          this._i18n.unretweetKeywords,
          2000
        );
      }

      if (!unretweetMenuItem) {
        // 真找不到 —— 留下日志帮用户/AI 看到底是哪种 miss
        this.debug('[unretweet] 找不到 Undo repost 菜单项 —— testid 和文字匹配都 0 命中');
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
      if (!username) return false;
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
      // selector 从 config.common.socialContext 读
      var socialContext = this.findElement(this.config.common && this.config.common.socialContext, container);
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
    // 2026-06-19 调整（tweets-bug-QioHub）：X 2026 改版后 "Replying to" 关键字在 user 自己 profile
    //   视图上完全不渲染（旧 N 修复注释说得很清楚）。所以 socialContext + 全文关键字检测都失效。
    //   N++ 上一版用 URL（/with_replies = 全 reply）→ 假阳性：被回复的原始推文（如 @QioHub）也被当成 reply
    //   → 候选里混进他人 caret → 点 QioHub caret 弹的菜单没 Delete → 3s timeout → 失败
    //   新版：恢复"点 caret 弹菜单看内容"，加 "必须含 Delete" 兜底（QioHub caret 弹的菜单只有 Follow/Mute，无 Delete → 过滤）
    isReplyTweet(container) {
      // 关键修复（tweets-bug-QioHub 2026-06-19 第 3 轮 · 稳定版）：
      //   第 1 轮：URL 判断（/with_replies=全 reply）→ 用户报 0 删
      //   第 2 轮：点击 caret 弹菜单看 "has Delete" → 5 个连续 "Delete menu item not found (3s timeout)"
      //     副作用分析：
      //       collectCandidates 同步循环 isReplyTweet 时，N 次 click caret 让前面 N-1 个菜单被 toggle 关掉
      //       → deleteTweet 的 350ms wait 找不到 "Delete" → 3s safeClick fallback 也 toggle 关掉菜单
      //       → 全部 "Delete menu item not found (3s timeout)" → 0 deleted
      //       这就是 user 日志 5 个连续 timeout 的根因，**不是**URL 判断的问题
      //   第 3 轮（当前）：**不**点击 caret，纯 URL 判断
      //     关键认知：candidate loop 里 _isOwnArticle 已经过滤掉非用户 article（无 UserAvatar-Container-{username}）
      //     → URL 判断 "这是 reply 页吗" 足以区分 reply vs original
      //     → 不点击 caret → 无副作用 → 菜单由 deleteTweet 自己的 safeClick 负责
      //     → 不会因为 toggle 关闭菜单而 3s timeout
      //
      // 保留 socialContext 关键字兜底以防 X 未来又把 reply 混进根 profile 页（旧 N 修复有这个）
      if (!container) return false;
      var pathname = location.pathname || '';
      // 主路径 1：/with_replies 页 = 全 reply（user 实测有 6 个 candidate 都是 reply，0 个是 Miss Elena 这种原文）
      if (pathname.endsWith('/with_replies')) {
        return true;
      }
      // 主路径 2：根 profile 页（如 /xiangping5211）= 全 original
      if (/^\/[A-Za-z0-9_]+$/.test(pathname)) {
        return false;
      }
      // Fallback：socialContext + 全文 reply 关键字（旧 N 修复，X 2026 不命中但兼容旧版）
      var replyRe = new RegExp(
        this._i18n.replyKeywords.map(function(k) {
          return k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        }).join('|'),
        'i'
      );
      var socialContext = this.findElement(this.config.common && this.config.common.socialContext, container);
      if (socialContext && replyRe.test((socialContext.textContent || '').toLowerCase())) {
        return true;
      }
      if (replyRe.test((container.textContent || '').toLowerCase())) {
        return true;
      }
      return false;
    }

    // 哪些 itemType 启用日期+关键字过滤（6 type 全部支持）
    shouldFilter(itemType) {
      // 是否对该 itemType 启用日期 + 关键字过滤
      //   2026-06-19 统一（tweets-bug-QioHub 同日重构）：likes / bookmarks / following / originalTweets / replies / retweets
      //   6 type 全部 true，统一走 extractMeta + matchesFilter
      //   注：following 的 dateISO 通常为 null（X profile 页不显示"关注时间"）→ 日期过滤对 following 自动失效
      //       matchesFilter 在 dateISO=null 时跳过日期比较（只看 keyword），所以不会误杀全部 following
      //   返回: true = 走 extractMeta + matchesFilter；false = 全部删除
      if (!this.filters) return false;
      return itemType === 'likes' || itemType === 'bookmarks' || itemType === 'following'
        || itemType === 'originalTweets' || itemType === 'replies' || itemType === 'retweets';
    }

    async processItems(itemType, maxItems) {
      // 入口方法：根据 itemType 分派到具体的 processLikes / processBookmarks / processFollowing / processOriginalTweets / processReplies / processRetweets
      // 参数:
      //   itemType  - 'likes' | 'bookmarks' | 'following' | 'originalTweets' | 'replies' | 'retweets'
      //   maxItems  - 本次最多处理多少条，默认 50
      if (maxItems === undefined) maxItems = 50;

      // 复数 itemType 映射到配置 key
      //   6-type 重构（2026-06-17）：originalTweet/reply 节点删除，tweetMoreButtons 移到 common
      //   originalTweets/replies 共享 common（articleContainers + tweetMoreButtons + socialContext）
      //   retweets 走 retweet（unreTweetButtons + unretweetConfirmButtons + cardMarker）
      var CONFIG_KEY_MAP = {
        likes: 'like',
        bookmarks: 'bookmark',
        following: 'following',
        originalTweets: 'common',
        replies: 'common',
        retweets: 'retweet'
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

      // 3 个推文子类型：各自独立 process 函数（不做 helper 抽象，直读直改）
      if (itemType === 'originalTweets') {
        await this.processOriginalTweets(maxItems);
        return;
      }

      if (itemType === 'replies') {
        await this.processReplies(maxItems);
        return;
      }

      if (itemType === 'retweets') {
        await this.processRetweets(maxItems);
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

      // M++ 修复（2026-06-18 tweets-bug-7）：X 2026 改版后 /{username}/likes 是 profile 6 tabs 页
      //   实际 likes 列表在 "Likes" tab 里（不在 Posts tab 默认）→ 必须点 Likes tab 激活
      //   流程：找 ScrollSnap-SwipeableList 里的 "Likes" 文字 tab → click → 等 article 渲染
      // MCP 实证：/xiangping5211/likes 6 tabs (Posts/Replies/Highlights/Articles/Media/Likes)
      //   tabs 容器 testid='ScrollSnap-SwipeableList'，tab 是 role="tab" 的 <a>，文字 Posts/Replies/.../Likes
      var likesTabClicked = await this._activateProfileTab('Likes');
      // 命中/未命中都是内部状态，不打到侧边栏日志
      void likesTabClicked;

      // 等 X 渲染完 + 内容稳定
      // 优先 unlike button + cellInnerDiv 兜底（X 2026 改 cellInnerDiv 而非 article）
      await this.waitForContentStable(["[data-testid='unlike']", "[data-testid='cellInnerDiv']"]);

      // 全部 selector 从 config 来（2026-XX-XX 抽出：远程 → default.json → 空 shape）
      // config 由 background 预加载（remote fail → default.json fallback），
      // 这里直接读 this.config.like.unlikeButtons 即可，不再有 BUILTIN 兜底
      var remoteUnlike = (this.config && this.config.like && Array.isArray(this.config.like.unlikeButtons))
        ? this.config.like.unlikeButtons : [];
      const unlikeSelectors = remoteUnlike;

      this.log(t('startingLikesCleanup'));

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
          const hasMore = await this.scrollToBottom();
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
        // 2026-06-19 统一（tweets-bug-QioHub 同日重构）：改走 shouldFilter，与其他 5 type 保持一致
        if (this.shouldFilter('likes')) {
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

      // M++ 修复（2026-06-18 tweets-bug-6）：processBookmarks 入口必须等 X 渲染 article + caret
      //   原版**没**调 waitForContentStable → X 还在 hydrate 时立即读 removeButtons → 0 button
      // M++ 修复（2026-06-18 tweets-bug-7）：X 2026 改版后 bookmarks page 0 article + 0 caret
      //   改成：优先 removeBookmark/unbookmark + cellInnerDiv 兜底
      // M++ 修复（2026-06-18 tweets-bug-7）：bookmarks page 也可能用 ScrollSnap-SwipeableList tabs
      //   兜底点 "Bookmarks" tab 激活
      await this._activateProfileTab('Bookmarks');
      await this.waitForContentStable(["[data-testid='removeBookmark']", "[data-testid='unbookmark']", "[data-testid='cellInnerDiv']"]);

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
          const hasMore = await this.scrollToBottom();
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

      // M++ 修复（2026-06-18 tweets-bug-6）：processFollowing 入口必须等 X 渲染
      //   following page 用 cellInnerDiv 容器（不是 article），X 2026 改版后结构
      //   等 cellInnerDiv 稳定 + 至少 1 个 unfollow 按钮出现
      await this.waitForContentStable(["[data-testid='cellInnerDiv']", "[data-testid$='-unfollow']"]);

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
          // M++ 修复（2026-06-18 tweets-bug-6）：maxFrames 用 100（1.6s）不用 200（3.3s）
          //   MCP 实测 confirm button 16ms 出现 + 可点 + 在 viewport
          //   3.3s 兜底太长：user 等 5s 就报告"卡了"，实际还要等 4.8s
          // M++ 修复（2026-06-18 tweets-bug-7）：testid + 文字双轨并行查找
          //   waitForElement miss 时不能再用 waitForMenuItemByText（dialog button 是 role="button" 不是 menuitem）
          //   用 _findButtonByText 兜底（找 role="button" / <button> / <a role="button"> 文字匹配）
          //   MCP 实证 dialog confirm button = BUTTON + role="button" + testid="confirmationSheetConfirm" + text="Unfollow"
          // 并行跑：testid + 文字兜底，任一命中就用
          // 兜底 100 帧（1.6s）for testid + 1500ms（1.5s）for 文字兜底
          // MCP 实测 confirm button 16ms 出现，1.6s 足够 testid；1.5s 给文字兜底余量（X 改版可能换 testid）
          // 关键：总 < 1.6s 完成（MCP 实证 1.0s 完成），不要超过 user 体感"卡住"阈值 2s
          const [confirmByTestid, confirmByText] = await Promise.all([
            this.waitForElement(confirmSel, 100),
            this._findButtonByText(this._i18n.unfollowKeywords, 1500)
          ]);
          const confirmButton = confirmByTestid || confirmByText;
          // 命中方式（testid vs 文字 fallback）只是内部细节，不打到侧边栏
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

    // 删原创推文（在 /username 页跑，不调 isReplyTweet hack —— 原创页无 reply 噪音）
    //   跳过 retweet 卡片（有 unretweet testid）
    //   跳过 reply 推文（isReplyTweet 判定）
    //   跳过 pinned（isPinnedTweet）
    //   路径：deleteTweet
    async processOriginalTweets(maxItems) {
      if (maxItems === undefined) maxItems = 50;
      const self = this;
      this._keywordLower = (this.filters && this.filters.keyword)
        ? this.filters.keyword.toLowerCase() : '';

      this.log(t('startingTweetsCleanup'));

      // 等 articles 渲染 + 内容稳定（X SPA 分批异步加载，2026-06-18 用 MutationObserver 检测"内容稳定"）
      //   旧实现：3s 内 article 出现就 break → 分批加载时第一个 article 出现就开跑 → 0 命中
      //   新实现：连续 1.5s 没新 article 才算加载完；5s 兜底超时（慢网 / 页面卡死）
      // M++ 修复（2026-06-18）：等 article **和** caret 都稳定（X 2026 caret 是 React 异步 hydration）
      await this.waitForContentStable(['article', "[data-testid='caret']"]);
      this._diagnosePage();

      // 6-type 重构：tweet/originalTweet/reply 节点已删除，moreButtons 移到 common.tweetMoreButtons
      const moreButtons = (self.config.common && Array.isArray(self.config.common.tweetMoreButtons))
        ? self.config.common.tweetMoreButtons : [];
      const retweetMarker = (self.config.retweet && Array.isArray(self.config.retweet.cardMarker))
        ? self.config.retweet.cardMarker : [];
      const articleSel = (self.config.common && self.config.common.articleContainers) || ['article'];
      const topLevelRule = self.config.common && self.config.common.topLevelArticle;

      function isRetweetCard(article) {
        for (var r = 0; r < retweetMarker.length; r++) {
          if (article.querySelector(retweetMarker[r]) !== null) return true;
        }
        return false;
      }

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
            if (isRetweetCard(article)) continue;
            // top-level 防 nested 误中
            if (topLevelRule === 'parent' && article.parentElement && article.parentElement.closest('article')) continue;
            if (!self._isOwnArticle(article)) continue;
            candidates.push({ btn: btn, article: article });
          }
        }
        if (candidates.length === 0) {
          self._logPageState({ moreButtons: moreButtons, retweetMarker: retweetMarker }, '[originalTweets]');
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
          const p = c.btn.dataset.xeraserProcessed;
          return !p || (p !== 'true' && p !== 'skipped' && p !== 'pinned' && p !== 'failed');
        });

        if (pending.length === 0) {
          emptyScrolls++;
          if (emptyScrolls > 3) { this.log(t('noMoreTweets')); break; }
          var hasMore = await this.scrollToBottom();
          if (!hasMore) { this.log(t('endOfTweets')); break; }
          continue;
        }
        emptyScrolls = 0;

        const c = pending[0];
        const article = c.article;

        if (this.isPinnedTweet(article)) {
          c.btn.dataset.xeraserProcessed = 'pinned';
          this.log(t('pinnedTweetSkipped'));
          await this.sleep(50); continue;
        }
        if (this.isReplyTweet(article)) {
          c.btn.dataset.xeraserProcessed = 'skipped';
          await this.sleep(50); continue;
        }

        if (this.shouldFilter('originalTweets')) {
          var meta = this.extractMeta(article, 'originalTweets');
          if (!this.matchesFilter(meta, this.filters)) {
            c.btn.dataset.xeraserProcessed = 'skipped';
            await this.sleep(50); continue;
          }
        }

        try {
          var success = await this.deleteTweet(article);
          if (success) {
            c.btn.dataset.xeraserProcessed = 'true';
            this.processedCount++;
            lastProgressTime = Date.now();
            this.progress('Tweet #' + this.processedCount);
            this.log(t('tweetDeleted', {count: this.processedCount}));
          } else {
            c.btn.dataset.xeraserProcessed = 'failed';
            this.error(t('tweetDeleteFailed', {error: 'no more button or confirm'}));
            this.errorCount++;
          }
        } catch (e) {
          c.btn.dataset.xeraserProcessed = 'failed';
          this.error('deleteTweet threw: ' + e.message);
          this.errorCount++;
        }
        await this.sleep(500);
      }

      if (this.processedCount === 0 && this.filters) this.log(t('noItemsMatched'));
    }

    // 删回复推文（/with_replies 页跑；只保留 reply，过滤掉 retweet 卡片和原创）
    //   路径：deleteTweet
    async processReplies(maxItems) {
      if (maxItems === undefined) maxItems = 50;
      const self = this;
      this._keywordLower = (this.filters && this.filters.keyword)
        ? this.filters.keyword.toLowerCase() : '';

      this.log(t('startingTweetsCleanup'));

      // 等 articles 渲染 + 内容稳定（X SPA 分批异步加载，2026-06-18 用 MutationObserver 检测"内容稳定"）
      //   旧实现：3s 内 article 出现就 break → 分批加载时第一个 article 出现就开跑 → 0 命中
      //   新实现：连续 1.5s 没新 article 才算加载完；5s 兜底超时（慢网 / 页面卡死）
      // M++ 修复（2026-06-18）：等 article **和** caret 都稳定（X 2026 caret 是 React 异步 hydration）
      await this.waitForContentStable(['article', "[data-testid='caret']"]);
      this._diagnosePage();

      // 6-type 重构：reply 节点已删除，moreButtons 移到 common.tweetMoreButtons
      const moreButtons = (self.config.common && Array.isArray(self.config.common.tweetMoreButtons))
        ? self.config.common.tweetMoreButtons : [];
      const retweetMarker = (self.config.retweet && Array.isArray(self.config.retweet.cardMarker))
        ? self.config.retweet.cardMarker : [];
      const articleSel = (self.config.common && self.config.common.articleContainers) || ['article'];
      const topLevelRule = self.config.common && self.config.common.topLevelArticle;

      function isRetweetCard(article) {
        for (var r = 0; r < retweetMarker.length; r++) {
          if (article.querySelector(retweetMarker[r]) !== null) return true;
        }
        return false;
      }

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
            if (isRetweetCard(article)) continue;
            if (topLevelRule === 'parent' && article.parentElement && article.parentElement.closest('article')) continue;
            if (!self._isOwnArticle(article)) continue;
            if (!self.isReplyTweet(article)) continue;  // 只保留 reply
            candidates.push({ btn: btn, article: article });
          }
        }
        if (candidates.length === 0) {
          self._logPageState({ moreButtons: moreButtons, retweetMarker: retweetMarker }, '[replies]');
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
          const p = c.btn.dataset.xeraserProcessed;
          return !p || (p !== 'true' && p !== 'skipped' && p !== 'pinned' && p !== 'failed');
        });

        if (pending.length === 0) {
          emptyScrolls++;
          if (emptyScrolls > 3) { this.log(t('noMoreTweets')); break; }
          var hasMore = await this.scrollToBottom();
          if (!hasMore) { this.log(t('endOfTweets')); break; }
          continue;
        }
        emptyScrolls = 0;

        const c = pending[0];
        const article = c.article;

        if (this.isPinnedTweet(article)) {
          c.btn.dataset.xeraserProcessed = 'pinned';
          this.log(t('pinnedTweetSkipped'));
          await this.sleep(50); continue;
        }

        if (this.shouldFilter('replies')) {
          var meta = this.extractMeta(article, 'replies');
          if (!this.matchesFilter(meta, this.filters)) {
            c.btn.dataset.xeraserProcessed = 'skipped';
            await this.sleep(50); continue;
          }
        }

        try {
          var success = await this.deleteTweet(article);
          if (success) {
            c.btn.dataset.xeraserProcessed = 'true';
            this.processedCount++;
            lastProgressTime = Date.now();
            this.progress('Tweet #' + this.processedCount);
            this.log(t('tweetDeleted', {count: this.processedCount}));
          } else {
            c.btn.dataset.xeraserProcessed = 'failed';
            this.error(t('tweetDeleteFailed', {error: 'no more button or confirm'}));
            this.errorCount++;
          }
        } catch (e) {
          c.btn.dataset.xeraserProcessed = 'failed';
          this.error('deleteTweet threw: ' + e.message);
          this.errorCount++;
        }
        await this.sleep(500);
      }

      if (this.processedCount === 0 && this.filters) this.log(t('noItemsMatched'));
    }

    // 撤销转推（/with_replies 页跑；抓 unretweet testid 唯一）
    //   路径：unreTweet（不删原推文）
    async processRetweets(maxItems) {
      if (maxItems === undefined) maxItems = 50;
      const self = this;
      this._keywordLower = (this.filters && this.filters.keyword)
        ? this.filters.keyword.toLowerCase() : '';

      this.log(t('startingTweetsCleanup'));

      // 等 articles 渲染 + 内容稳定（X SPA 分批异步加载，2026-06-18 用 MutationObserver 检测"内容稳定"）
      //   旧实现：3s 内 article 出现就 break → 分批加载时第一个 article 出现就开跑 → 0 命中
      //   新实现：连续 1.5s 没新 article 才算加载完；5s 兜底超时（慢网 / 页面卡死）
      // M++ 修复（2026-06-18）：等 article **和** unretweet 按钮都稳定
      await this.waitForContentStable(['article', "[data-testid='unretweet']"]);
      this._diagnosePage();

      const cfg = self.config.retweet || {};
      const unretweetButtons = Array.isArray(cfg.unreTweetButtons) ? cfg.unreTweetButtons : [];
      const confirmButtons = Array.isArray(cfg.unretweetConfirmButtons) ? cfg.unretweetConfirmButtons : [];
      const articleSel = (self.config.common && self.config.common.articleContainers) || ['article'];
      const topLevelRule = self.config.common && self.config.common.topLevelArticle;

      // retweet 路径不用 _isOwnArticle（X 2026 retweet 卡片只显示原作者头像，永远 false）
      //   unretweet 按钮本身就是"自己转推过"的强证据（X 不会在他人转发的卡片上渲染）
      //   见 _isOwnArticle 注释 line 539-541
      function collectCandidates() {
        const candidates = [];
        const seen = new Set();
        for (let s = 0; s < unretweetButtons.length; s++) {
          const btns = self.findElements(unretweetButtons[s]);
          for (let i = 0; i < btns.length; i++) {
            const btn = btns[i];
            if (seen.has(btn)) continue;
            seen.add(btn);
            const article = btn.closest('article') || self.findClosest(articleSel, btn);
            if (!article) continue;
            if (topLevelRule === 'parent' && article.parentElement && article.parentElement.closest('article')) continue;
            candidates.push({ btn: btn, article: article });
          }
        }
        if (candidates.length === 0) {
          self._logPageState({ unretweet: unretweetButtons }, '[retweets]');
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
          const p = c.btn.dataset.xeraserProcessed;
          return !p || (p !== 'true' && p !== 'skipped' && p !== 'pinned' && p !== 'failed');
        });

        if (pending.length === 0) {
          emptyScrolls++;
          if (emptyScrolls > 3) { this.log(t('noMoreTweets')); break; }
          var hasMore = await this.scrollToBottom();
          if (!hasMore) { this.log(t('endOfTweets')); break; }
          continue;
        }
        emptyScrolls = 0;

        const c = pending[0];
        const article = c.article;

        if (this.shouldFilter('retweets')) {
          var meta = this.extractMeta(article, 'retweets');
          if (!this.matchesFilter(meta, this.filters)) {
            c.btn.dataset.xeraserProcessed = 'skipped';
            await this.sleep(50); continue;
          }
        }

        try {
          var success = await this.unreTweet(article);
          if (success) {
            c.btn.dataset.xeraserProcessed = 'true';
            this.processedCount++;
            lastProgressTime = Date.now();
            this.progress('Retweet #' + this.processedCount);
            this.log(t('unreTweetSuccess', {count: this.processedCount}));
          } else {
            c.btn.dataset.xeraserProcessed = 'failed';
            this.error(t('unretweetFailed', {error: 'unretweet failed'}));
            this.errorCount++;
          }
        } catch (e) {
          c.btn.dataset.xeraserProcessed = 'failed';
          this.error('unreTweet threw: ' + e.message);
          this.errorCount++;
        }
        await this.sleep(500);
      }

      if (this.processedCount === 0 && this.filters) this.log(t('noItemsMatched'));
    }

    // 诊断：输出页面上所有 data-testid 信息，帮助调试选择器
    // 输出到 console（开发者用），不进用户日志面板
    // M++ 修复（2026-06-18 tweets-bug-7）：X 2026 改版后 dialog confirm button 是 role="button"（不是 menuitem）
    //   waitForMenuItemByText 找 [role="menuitem"] 永远 0 命中
    //   → 必须用新方法找 [role="button"] / <button> 文字匹配
    //   关联：user 报告"following 弹框出现但 Unfollow 没被点击"
    async _findButtonByText(keywords, timeout) {
      if (!Array.isArray(keywords) || keywords.length === 0) return null;
      const startTime = Date.now();
      // 找所有可能的 button：role="button" + <button> + <a role="button">
      // 注意：必须是**可见**的（offsetParent 非空 + rect.width > 0）
      const allButtons = document.querySelectorAll('[role="button"], button, a[role="button"]');
      while (Date.now() - startTime < timeout) {
        for (let i = 0; i < allButtons.length; i++) {
          const b = allButtons[i];
          const r = b.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;  // 不可见
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
      // _findButtonByText timeout 只在 console 留痕（侧边栏用户不需要看 "keywords=[...]" 这种内部细节）
      console.log('[XEraser] _findButtonByText timeout ' + timeout + 'ms, keywords=' + JSON.stringify(keywords));
      return null;
    }

    // M++ 修复（2026-06-18 tweets-bug-7）：X 2026 改版后 profile 页用 ScrollSnap-SwipeableList 6 tabs
    //   likes 在 "Likes" tab 里（最后一栏），默认在 Posts tab → 必须点 Likes tab 激活
    //   tabs 容器 testid='ScrollSnap-SwipeableList'，tab 是 role="tab" 的 <a>，文字 = Posts/Replies/.../Likes
    // 返回 true = 找到了并 click；false = 找不到（fallback 旧 structure 假设）
    async _activateProfileTab(tabText) {
      try {
        // 1) 找 ScrollSnap-SwipeableList 容器
        const swipeable = document.querySelector("[data-testid='ScrollSnap-SwipeableList']");
        if (!swipeable) return false;  // 旧 page 结构，没 6 tabs

        // 2) 找 role="tab" 且 textContent 匹配 tabText 的 <a>
        const tabs = swipeable.querySelectorAll('[role="tab"]');
        for (let i = 0; i < tabs.length; i++) {
          const tab = tabs[i];
          const txt = (tab.textContent || '').trim();
          if (txt === tabText || txt.toLowerCase() === tabText.toLowerCase()) {
            // 3) 检查是否已激活（aria-selected="true"）→ 已激活就不点
            if (tab.getAttribute('aria-selected') === 'true') {
              return true;  // 已激活，OK
            }
            // 4) click 激活
            const ok = await this.safeClick(tab, 300);
            return !!ok;
          }
        }
        return false;  // 找不到匹配的 tab 文字
      } catch (e) {
        console.warn('[X-Eraser] _activateProfileTab failed:', e.message);
        return false;
      }
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

      // Cleanup started / Types / Filters 都是英文内部日志，对用户没意义
      //   侧边栏已经在 user 点 "开始清理" 时打了 "开始清理..." + "今日已使用: X / Y"，
      //   具体类型和过滤器会在 processItems 内部的中文 i18n 消息里体现（"开始在 ... 清理点赞"）

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

      // 英文 "Done. Processed: N" 与侧边栏的 "清理完成，共处理: N" 重复，移除
    }

    pause() {
      this.isPaused = true;
      // "Paused" 英文与侧边栏 onPaused() 里的中文 "清理已暂停" 重复，移除
    }

    resume() {
      this.isPaused = false;
      // "Resumed" 英文与侧边栏 onResumed() 里的中文 "清理已恢复" 重复，移除
    }

    stop() {
      this.isRunning = false;
      this.isPaused = false;
      // 用户中断时如果 confirm 弹窗开着，点 Cancel 关闭（用 8 语言文字兜底，避免 aria-label 被翻译后 0 命中）
      // 不 await：stop() 是同步 API，cleanup 异步进行；关闭弹窗的失败不影响 stop 整体行为
      this._closeAnyOpenConfirmDialog();
      // "Stopped" 英文与侧边栏 onStopped() 里的中文 "用户已停止清理" 重复，移除
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

    // 2026-06-18 优化：等 X 页面"内容稳定"再开始处理
    //   旧实现：3s 内 article 出现就 break → X 异步分批加载时第一个 article 出现就开跑 → 0 命中
    //   新实现：MutationObserver 监听 article 变化，连续 N 次**空 mutation** 才算"加载完"
    //
    // M++ 修复（2026-06-18 tweets-bug-4 实证）：
    //   原版只等 article 数稳定 → X 2026 caret 是 React 异步 hydration，article 数稳定后 caret 还在渲染
    //   → collectCandidates 跑时 caret 还没出现 → moreButtons: 0
    //   修法：selectors 支持**数组**（如 ['article', "[data-testid='caret']"]），
    //         **所有** selector 的**总和**稳定才算加载完
    //
    // M++ 修复（2026-06-18 tweets-bug-6 用户反馈）：
    //   原版用 `stableMs=1500`（"1.5s 没变化 = 稳定"）和 `maxMs=5000`（"5s 兜底"）→ 都是靠经验猜时间
    //   用户要求："不靠经验猜等几秒"——改为：
    //     1. MutationObserver callback 触发 → 检查 article/caret 总数变化
    //     2. 连续 STABLE_BATCHES 次 callback 总数都相同 = 稳定（不是时间，是"观察次数"）
    //     3. 兜底用 requestAnimationFrame 帧数：MAX_IDLE_FRAMES 帧（约 10s）没任何 callback = X 真挂了
    //        帧数是浏览器节奏，不是经验数字（浏览器自然会 60fps 跑，10s 一定 600 帧）
    //
    // M++ 修复（2026-06-18 tweets-bug-6 用户再次反馈"页面都没加载完你就说干完了"）：
    //   根因：X 2026 用 IntersectionObserver 懒加载，**不 scroll 不渲染** article
    //   → waitForContentStable 一直 count=0 → 等到 600 帧兜底 resolve(0)
    //   → runCleanupOnce 报 "0 candidates" → "干完了"
    //   修法（**核心修复**）：
    //     1. **主动 scroll 触发 X 渲染**：不靠经验时间，**滚一屏 + 滚回**，让 IntersectionObserver 触发
    //     2. count = 0 时**不 resolve** + **主动再 scroll**触发 X 渲染（最多 MAX_SCROLL_TRIGGERS 次）
    //     3. count > 0 + 连续 STABLE_FRAMES 帧 count 相同 = 真正稳定
    //     4. 兜底：连续 MAX_IDLE_FRAMES 帧没新 article 出现 + 已经 scroll 完 N 次 = 真没东西
    //   **关键**：scroll 是"触发 X 渲染"，不是"等 X 加载"——是物理必要的，不算"靠经验猜时间"
    //
    // M++ 修复（2026-06-18 tweets-bug-6 MCP 实证）：
    //   MCP 实测 likes page 加载 10s 过程：X 已渲染 article+caret（count=2）但**X 加载完静止后
    //   不再触发 mutation** → 靠 MO 触发 callback 累计 stableCount 永远不到 5 → 600 帧兜底 resolve
    //   修法：去掉 MO 依赖，**改用 RAF 轮询 count 变化**（每帧检查，连续 30 帧 count 相同 = 稳定）
    //   - 帧数是浏览器物理节奏（60fps 下 30 帧 ≈ 0.5s）→ **不靠经验猜时间**
    //   - **不靠 MO 事件** → X 静止时 count 稳定也能判定"加载完"
    //   - count = 0 时主动 scroll 触发 X 渲染
    //   - 600 帧兜底（X 真挂了）
    waitForContentStable(selectors) {
      const STABLE_FRAMES = 30;          // 连续 30 帧 count 相同 + count > 0 = 稳定（约 0.5s @ 60fps）
      const MAX_IDLE_FRAMES = 600;      // 600 帧（约 10s @ 60fps）兜底
      const MAX_SCROLL_TRIGGERS = 3;    // 主动 scroll 最多 3 次（每次滚到底）触发 X 渲染
      const SCROLL_STABLE_FRAMES = 30;  // scroll 后等 30 帧看是否有新 article（约 0.5s）
      const self = this;
      const selectorList = Array.isArray(selectors) ? selectors : [selectors];
      return new Promise(function(resolve) {
        const start = Date.now();
        let lastCount = -1;
        let stableFrameCount = 0;     // 连续 count 相同的帧数
        let resolved = false;
        let scrollTriggers = 0;       // 已 scroll 次数
        let totalFrameCount = 0;      // 总帧数（兜底用）
        let pendingScrollCheck = 0;   // scroll 后等 SCROLL_STABLE_FRAMES 帧看结果

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

        // 主动 scroll 触发 X IntersectionObserver 渲染
        //   不靠经验时间：滚到底（scrollHeight 是浏览器物理值，不靠猜），然后 RAF 轮询 count 变化
        //   X 2026 lazy load：滚到底 → X 把所有推文都 fetch + 渲染 → 滚回 top 让用户停留原位
        function triggerScrollLoad() {
          if (scrollTriggers >= MAX_SCROLL_TRIGGERS) return;
          scrollTriggers++;
          // 滚到底（X 会把 viewport 外的 article 全部 fetch + 渲染）
          window.scrollTo(0, document.documentElement.scrollHeight);
          // 下一帧滚回 top（让用户停留在原位，不影响操作）
          requestAnimationFrame(function() {
            window.scrollTo(0, 0);
          });
          pendingScrollCheck = SCROLL_STABLE_FRAMES;
          // scroll 触发 X 重新加载 → count 可能变化 → 重置稳定帧数
          stableFrameCount = 0;
          lastCount = -1;
        }

        // RAF 轮询：每帧检查 count，连续 STABLE_FRAMES 帧 count 相同 = 稳定
        //   **不靠 MO 触发**（X 静止时没 mutation，但 count 稳定，应该判定为"加载完"）
        //   **不靠经验时间**：STABLE_FRAMES 是浏览器物理帧数（≈ 0.5s @ 60fps）
        let rafId;
        function rafTick() {
          if (resolved) return;
          totalFrameCount++;
          if (pendingScrollCheck > 0) pendingScrollCheck--;

          const count = getTotalCount();

          if (count === lastCount) {
            // 这帧 count 与上帧相同 → 稳定帧数 +1
            stableFrameCount++;
            if (count > 0 && stableFrameCount >= STABLE_FRAMES) {
              // 连续 STABLE_FRAMES 帧 count 相同 + count > 0 = 真正稳定
              done(count, 'stable ' + STABLE_FRAMES + ' frames, count=' + count);
              return;
            }
          } else {
            // count 变化 → 重置稳定帧数
            lastCount = count;
            stableFrameCount = 0;
          }

          // count = 0：X 还没渲染（lazy load 未触发）→ 主动 scroll
          if (count === 0 && pendingScrollCheck <= 0 && scrollTriggers < MAX_SCROLL_TRIGGERS) {
            triggerScrollLoad();
          }

          // 兜底：连续 MAX_IDLE_FRAMES 帧没新 article 出现
          if (totalFrameCount >= MAX_IDLE_FRAMES) {
            // 已 scroll 完 + count = 0 → X 真没东西
            // count > 0 但 stableFrameCount 没到 STABLE_FRAMES → 兜底（X hydration 持续 mutation）
            done(getTotalCount(), 'max frames reached, count=' + getTotalCount());
            return;
          }

          rafId = requestAnimationFrame(rafTick);
        }
        rafId = requestAnimationFrame(rafTick);

        // 立即触发一次 scroll 加载（用户报告"页面没加载完就干完"——极可能是 X 初始就没渲染）
        triggerScrollLoad();
      });
    }

    // 调试：输出 page 状态（articles + 各 selector 命中数），帮助排查 0 命中
    //   只在 candidates === 0 时输出（避免日志噪音）
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
      // 0 candidates + page state snapshot 是 verbose debug：selector 命中的细节
      //   不打到侧边栏（"0 candidates" 已经会从 processItems 那边的 t('noUnlikeButtons') 推到侧边栏）
      console.log('[XEraser] ' + label + ' 0 candidates, page state: ' + JSON.stringify(diag));
    }

    log(message) {
      // 走 console + 推送到侧边栏日志面板（用户看的中文 i18n 消息）
      console.log('[XEraser] ' + message);
      if (this.onLog) this.onLog(message, 'info');
    }

    // verbose debug 专用：只走 console，不推侧边栏
    //   用途：selector 命中细节、frame 计数、JSON 状态、超时诊断
    //   想看这些请打开 DevTools console（侧边栏"复制诊断日志"只拿 .log-area 面板）
    debug(message) {
      console.log('[XEraser] ' + message);
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
