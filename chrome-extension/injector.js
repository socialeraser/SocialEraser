/* AUTO-GENERATED from shared/injector.js — do not edit. Run: npm run sync */
/**
 * X-Eraser - X/Twitter 批量清理工具（核心脚本）
 *
 * SOURCE OF TRUTH — edit this file only.
 * Run `npm run sync` to copy to chrome-extension/ and www/.
 *
 * v2.1: 进度直接调用同页面的 XEraserPanel，不再走 runtime message
 */
(function() {
  if (window._XEraserLoaded) return;
  window._XEraserLoaded = true;

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // 任务名 i18n（与 panel.js 保持一致）
  const TASK_LABELS = {
    en: {
      unlike: 'Unlike All Likes',
      bookmark: 'Remove Bookmarks',
      unretweet: 'Undo Retweets',
      unfollow: 'Unfollow All',
      deleteTweets: 'Delete Tweets',
      deleteReplies: 'Delete Replies',
      unblock: 'Unblock Accounts',
      unmute: 'Unmute Accounts',
      deleteDM: 'Delete DMs',
      deleteDraft: 'Delete Drafts'
    },
    zh: {
      unlike: '取消所有点赞',
      bookmark: '移除书签',
      unretweet: '撤销转发',
      unfollow: '取关全部',
      deleteTweets: '删除推文',
      deleteReplies: '删除回复',
      unblock: '解除屏蔽',
      unmute: '取消静音',
      deleteDM: '删除私信',
      deleteDraft: '删除草稿'
    }
  };
  function getLang() { try { return localStorage.getItem('xeraser-lang') || 'en'; } catch (e) { return 'en'; } }
  function tTask(k) { const l = getLang(); return (TASK_LABELS[l] && TASK_LABELS[l][k]) || k; }

  // 工具：调 panel API（面板可能未注入，做安全判断）
  function panel() { return window.XEraserPanel; }
  function notifyProgress() {
    const p = panel();
    if (!p) return;
    p.setProgress({
      processed: XEraser.processed,
      success: XEraser.success,
      fail: Math.max(0, XEraser.processed - XEraser.success)
    });
  }
  function notifyComplete() {
    const p = panel();
    if (!p) return;
    p.setComplete({
      processed: XEraser.processed,
      success: XEraser.success,
      fail: Math.max(0, XEraser.processed - XEraser.success)
    });
  }
  function notifyRunning(task) {
    const p = panel();
    if (!p) return;
    p.setRunning(tTask(task));
  }
  function notifyError(msg) {
    const p = panel();
    if (p) p.setError(msg);
  }

  const XEraser = {
    running: false, stopped: false,
    processed: 0, success: 0,
    currentTask: '',

    async start(opt = {}) {
      const {
        unlike = false,
        unlikeBefore = null,
        bookmark = false,
        unretweet = false,
        unfollow = false,
        keepMutual = true,
        deleteTweets = false,
        deleteReplies = false,
        unblock = false,
        unmute = false,
        deleteDM = false,
        deleteDraft = false
      } = opt;

      const tasks = [];
      if (unlike) tasks.push('unlike');
      if (bookmark) tasks.push('bookmark');
      if (unretweet) tasks.push('unretweet');
      if (unfollow) tasks.push('unfollow');
      if (deleteTweets) tasks.push('deleteTweets');
      if (deleteReplies) tasks.push('deleteReplies');
      if (unblock) tasks.push('unblock');
      if (unmute) tasks.push('unmute');
      if (deleteDM) tasks.push('deleteDM');
      if (deleteDraft) tasks.push('deleteDraft');

      if (tasks.length === 0) {
        console.log('[XEraser] 请至少选择一个功能');
        notifyError('请至少选择一个功能');
        return;
      }

      this.running = true; this.stopped = false;
      this.processed = 0; this.success = 0;

      // 通知 panel 开始（先传第一个任务名）
      notifyRunning(tasks[0]);

      console.log('[XEraser] 开始执行:', tasks.join(', '));

      for (let i = 0; i < tasks.length; i++) {
        if (this.stopped) break;
        const task = tasks[i];
        this.currentTask = task;
        // 任务切换时更新 panel 显示
        const p = panel();
        if (p) p.setCurrentTaskLabel(tTask(task));
        try {
          await this[task](opt);
        } catch (e) {
          console.error('[XEraser] 任务出错:', task, e);
        }
      }

      this.running = false;
      console.log(`[XEraser] 完成! 处理${this.processed}条, 成功${this.success}条`);
      notifyComplete();
    },

    // ========== 1. 取消点赞 ==========
    async unlike(opt) {
      console.log('[XEraser] 开始取消点赞...');
      const username = this._getUsername();
      if (!username) { console.log('无法获取用户名'); return; }

      // 请求后台打开新标签页
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ action: 'openTab', url: `https://x.com/${username}/likes` });
      }

      let count = 0;
      while (this.running && !this.stopped && count < 500) {
        const tweets = [...document.querySelectorAll('article[data-testid="tweet"]')];
        if (!tweets.length) {
          window.scrollBy(0, 800);
          await sleep(1500);
          continue;
        }

        for (const t of tweets) {
          if (this.stopped) break;

          if (opt.unlikeBefore) {
            const time = t.querySelector('time');
            if (time) {
              const date = new Date(time.getAttribute('datetime'));
              if (date > new Date(opt.unlikeBefore)) continue;
            }
          }

          const unlike = t.querySelector('[data-testid="unlike"]');
          if (unlike) {
            unlike.click();
            this.success++;
            await sleep(300);
          }
          this.processed++;
          count++;
        }

        window.scrollBy(0, 800);
        await sleep(1000);
        notifyProgress();
      }
    },

    // ========== 2. 移除书签 ==========
    async bookmark() {
      console.log('[XEraser] 开始移除书签...');
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ action: 'openTab', url: 'https://x.com/i/bookmarks' });
      }

      let count = 0;
      while (this.running && !this.stopped && count < 500) {
        const tweets = [...document.querySelectorAll('article[data-testid="tweet"]')];
        if (!tweets.length) {
          window.scrollBy(0, 800);
          await sleep(1500);
          continue;
        }

        for (const t of tweets) {
          if (this.stopped) break;

          const bookmarkBtn = t.querySelector('[data-testid="bookmark"]');
          if (bookmarkBtn) {
            bookmarkBtn.click();
            this.success++;
            await sleep(300);
          }
          this.processed++;
          count++;
        }

        window.scrollBy(0, 800);
        await sleep(1000);
        notifyProgress();
      }
    },

    // ========== 3. 撤销转发 ==========
    async unretweet() {
      console.log('[XEraser] 开始撤销转发...');
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ action: 'openTab', url: `https://x.com/${this._getUsername()}/with_replies` });
      }

      let count = 0;
      while (this.running && !this.stopped && count < 500) {
        const tweets = [...document.querySelectorAll('article[data-testid="tweet"]')];
        if (!tweets.length) {
          window.scrollBy(0, 800);
          await sleep(1500);
          continue;
        }

        for (const t of tweets) {
          if (this.stopped) break;

          const retweetBtn = t.querySelector('[data-testid="retweet"]');
          if (retweetBtn) {
            retweetBtn.click();
            await sleep(500);
            const undoBtn = document.querySelector('[data-testid="undo"]');
            if (undoBtn) {
              undoBtn.click();
              this.success++;
              await sleep(500);
            }
          }
          this.processed++;
          count++;
        }

        window.scrollBy(0, 800);
        await sleep(1000);
        notifyProgress();
      }
    },

    // ========== 4. 取关 ==========
    async unfollow(opt) {
      console.log('[XEraser] 开始取关...');
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ action: 'openTab', url: `https://x.com/${this._getUsername()}/following` });
      }

      let count = 0;
      while (this.running && !this.stopped && count < 500) {
        const users = [...document.querySelectorAll('[data-testid="UserCell"]')];
        if (!users.length) {
          window.scrollBy(0, 800);
          await sleep(1500);
          continue;
        }

        for (const user of users) {
          if (this.stopped) break;

          if (opt.keepMutual) {
            const following = user.querySelector('[aria-label*="Following"]');
            const followers = user.querySelector('[aria-label*="Followers"]');
            if (following && followers) continue;
          }

          const btn = user.querySelector('[role="button"]');
          if (btn && btn.textContent.includes('Following')) {
            btn.click();
            await sleep(500);
            const unfollowBtn = [...document.querySelectorAll('[role="menuitem"]')]
              .find(el => el.textContent.includes('Unfollow'));
            if (unfollowBtn) {
              unfollowBtn.click();
              this.success++;
              await sleep(500);
            }
          }
          this.processed++;
          count++;
        }

        window.scrollBy(0, 800);
        await sleep(1000);
        notifyProgress();
      }
    },

    // ========== 5. 删除推文 ==========
    async deleteTweets() {
      console.log('[XEraser] 开始删除原创推文...');
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ action: 'openTab', url: `https://x.com/${this._getUsername()}` });
      }

      let count = 0;
      while (this.running && !this.stopped && count < 500) {
        const tweets = [...document.querySelectorAll('article[data-testid="tweet"]')];
        if (!tweets.length) {
          window.scrollBy(0, 800);
          await sleep(1500);
          continue;
        }

        for (const t of tweets) {
          if (this.stopped) break;

          const isReply = t.querySelector('[data-testid="socialContext"]')?.textContent?.includes('replied to');
          const replyCount = t.querySelector('[data-testid="reply"]')?.textContent;

          if (!isReply && replyCount === '') {
            const deleted = await this._deleteTweet(t);
            if (deleted) this.success++;
          }
          this.processed++;
          count++;
        }

        window.scrollBy(0, 800);
        await sleep(1000);
        notifyProgress();
      }
    },

    // ========== 6. 删除回复 ==========
    async deleteReplies() {
      console.log('[XEraser] 开始删除回复...');
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ action: 'openTab', url: `https://x.com/${this._getUsername()}/with_replies` });
      }

      let count = 0;
      while (this.running && !this.stopped && count < 500) {
        const tweets = [...document.querySelectorAll('article[data-testid="tweet"]')];
        if (!tweets.length) {
          window.scrollBy(0, 800);
          await sleep(1500);
          continue;
        }

        for (const t of tweets) {
          if (this.stopped) break;

          const isReply = t.querySelector('[data-testid="socialContext"]')?.textContent?.includes('replied to');
          if (isReply) {
            const deleted = await this._deleteTweet(t);
            if (deleted) this.success++;
          }
          this.processed++;
          count++;
        }

        window.scrollBy(0, 800);
        await sleep(1000);
        notifyProgress();
      }
    },

    // ========== 7. 解除屏蔽 ==========
    async unblock() {
      console.log('[XEraser] 开始解除屏蔽...');
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ action: 'openTab', url: 'https://x.com/settings/blocked' });
      }

      const blocks = [...document.querySelectorAll('[data-testid="UserCell"]')];
      for (const user of blocks) {
        if (this.stopped) break;

        const blockBtn = user.querySelector('[data-testid="block"]');
        if (blockBtn) {
          blockBtn.click();
          await sleep(500);
          const confirmBtn = document.querySelector('[data-testid="confirmationSheetConfirm"]');
          if (confirmBtn) {
            confirmBtn.click();
            this.success++;
            await sleep(500);
          }
        }
        this.processed++;
        notifyProgress();
      }
    },

    // ========== 8. 取消静音 ==========
    async unmute() {
      console.log('[XEraser] 开始取消静音...');
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ action: 'openTab', url: 'https://x.com/settings/muted' });
      }

      const mutes = [...document.querySelectorAll('[data-testid="UserCell"]')];
      for (const user of mutes) {
        if (this.stopped) break;

        const muteBtn = user.querySelector('[data-testid="mute"]');
        if (muteBtn) {
          muteBtn.click();
          await sleep(500);
          const confirmBtn = document.querySelector('[data-testid="confirmationSheetConfirm"]');
          if (confirmBtn) {
            confirmBtn.click();
            this.success++;
            await sleep(500);
          }
        }
        this.processed++;
        notifyProgress();
      }
    },

    // ========== 9. 删除私信 ==========
    async deleteDM() {
      console.log('[XEraser] 开始删除私信...');
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ action: 'openTab', url: 'https://x.com/i/dm' });
      }

      const conversations = [...document.querySelectorAll('[data-testid="DMConversationItem"]')];
      for (const conv of conversations) {
        if (this.stopped) break;

        conv.click();
        await sleep(1000);

        const infoBtn = document.querySelector('[data-testid="DMInfoCircle"]');
        if (infoBtn) {
          infoBtn.click();
          await sleep(500);
          const deleteBtn = [...document.querySelectorAll('[role="menuitem"]')]
            .find(el => el.textContent.includes('Delete') && el.textContent.includes('conversation'));
          if (deleteBtn) {
            deleteBtn.click();
            await sleep(500);
            const confirmBtn = document.querySelector('[data-testid="confirmationSheetConfirm"]');
            if (confirmBtn) {
              confirmBtn.click();
              this.success++;
              await sleep(500);
            }
          }
        }
        this.processed++;
        notifyProgress();
      }
    },

    // ========== 10. 删除草稿 ==========
    async deleteDraft() {
      console.log('[XEraser] 开始删除草稿...');
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ action: 'openTab', url: 'https://x.com/compose/draft' });
      }

      const drafts = document.querySelectorAll('[data-testid="draft"]');
      for (const draft of drafts) {
        if (this.stopped) break;

        draft.click();
        await sleep(500);
        const deleteBtn = draft.querySelector('[aria-label*="Delete"]');
        if (deleteBtn) {
          deleteBtn.click();
          this.success++;
        }
        this.processed++;
        notifyProgress();
      }
    },

    // ========== 辅助函数 ==========

    async _deleteTweet(article) {
      const more = article.querySelector('[data-testid="more"]');
      if (!more) return false;

      more.click();
      await sleep(500);

      let delBtn = document.querySelector('[data-testid="Delete"]');
      if (!delBtn) {
        document.querySelectorAll('[role="menuitem"]').forEach(i => {
          if (i.textContent.match(/delete/i)) delBtn = i;
        });
      }

      if (!delBtn) { document.body.click(); return false; }

      delBtn.click();
      await sleep(500);

      const confirm = document.querySelector('[data-testid="confirmationSheetConfirm"]');
      if (!confirm) return false;

      confirm.click();
      await sleep(1000);

      if (!document.body.contains(article)) {
        console.log('✓ 删除成功');
        return true;
      }
      return false;
    },

    _getUsername() {
      const link = document.querySelector('a[href*="/status/"]');
      if (link) {
        const match = link.href.match(/x\.com\/([^\/]+)/);
        if (match) return match[1];
      }
      return document.querySelector('[data-testid="UserAvatar"]')?.getAttribute('alt')?.replace('@', '');
    },

    stop() {
      this.stopped = true;
      this.running = false;
      console.log('[XEraser] 用户请求停止');
    }
  };

  window.XEraser = XEraser;

  // 监听消息
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.action === 'start') XEraser.start(msg);
      if (msg.action === 'stop') XEraser.stop();
    });
  }

  console.log('[XEraser] ✓ v2.1 已加载 | 浮动面板已就绪');
})();
