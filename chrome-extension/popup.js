/**
 * X-Eraser popup 脚本
 * v2.1: 弹出后立即启动 + 立即关闭 popup，进度由页面内浮窗显示
 */
(function() {
  'use strict';

  const I18N = {
    zh: {
      actions: '操作',
      unlike: '取消所有点赞',
      bookmark: '移除所有书签',
      unretweet: '撤销所有转发',
      unfollow: '取关所有用户',
      deleteTweets: '删除所有原创推文',
      deleteReplies: '删除所有回复',
      unblock: '解除所有屏蔽',
      unmute: '取消所有静音',
      deleteDM: '删除所有私信会话',
      deleteDraft: '删除所有草稿',
      unlikeBefore: '仅取消此日期之前的点赞 (留空=全部)',
      start: '开始执行',
      hint: '进度面板会自动显示在网页右上角，可最小化或拖动'
    },
    en: {
      actions: 'Actions',
      unlike: 'Unlike All Likes',
      bookmark: 'Remove All Bookmarks',
      unretweet: 'Undo All Retweets',
      unfollow: 'Unfollow All',
      deleteTweets: 'Delete All Original Tweets',
      deleteReplies: 'Delete All Replies',
      unblock: 'Unblock All',
      unmute: 'Unmute All',
      deleteDM: 'Delete All DM Conversations',
      deleteDraft: 'Delete All Drafts',
      unlikeBefore: 'Only unlike before this date (empty = all)',
      start: 'Start',
      hint: 'Progress panel appears in the top-right corner, can be minimized or dragged'
    }
  };

  function t(key) {
    const lang = (typeof localStorage !== 'undefined' && localStorage.getItem('xeraser-lang')) || 'zh';
    return (I18N[lang] && I18N[lang][key]) || (I18N.zh[key] || key);
  }

  function applyLang(lang) {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      el.textContent = t(el.dataset.i18n);
    });
    document.querySelectorAll('.lang-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.lang === lang);
    });
  }

  // 语言切换
  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const lang = btn.dataset.lang;
      try { localStorage.setItem('xeraser-lang', lang); } catch (e) {}
      applyLang(lang);
    });
  });

  // unlike 选项展开
  const unlike = document.getElementById('unlike');
  const unlikeOptions = document.getElementById('unlike-options');
  const unfollow = document.getElementById('unfollow');
  const unfollowOptions = document.getElementById('unfollow-options');
  unlike.addEventListener('change', () => { unlikeOptions.style.display = unlike.checked ? 'block' : 'none'; });
  unfollow.addEventListener('change', () => { unfollowOptions.style.display = unfollow.checked ? 'block' : 'none'; });

  // 初始化语言
  try {
    const savedLang = localStorage.getItem('xeraser-lang') || 'zh';
    applyLang(savedLang);
  } catch (e) {
    applyLang('zh');
  }

  // ========== 核心：启动并立即关闭 popup ==========
  document.getElementById('start-btn').addEventListener('click', async () => {
    const options = {
      unlike: unlike.checked,
      unlikeBefore: document.getElementById('unlike-before').value || null,
      bookmark: document.getElementById('bookmark').checked,
      unretweet: document.getElementById('unretweet').checked,
      unfollow: unfollow.checked,
      keepMutual: document.getElementById('keep-mutual').checked,
      deleteTweets: document.getElementById('deleteTweets').checked,
      deleteReplies: document.getElementById('deleteReplies').checked,
      unblock: document.getElementById('unblock').checked,
      unmute: document.getElementById('unmute').checked,
      deleteDM: document.getElementById('deleteDM').checked,
      deleteDraft: document.getElementById('deleteDraft').checked
    };

    // 检查是否至少选了一项
    const hasAny = Object.entries(options).some(([k, v]) => v && k !== 'keepMutual' && k !== 'unlikeBefore');
    if (!hasAny) {
      alert(t('hint') === '' ? '请至少选择一项操作' : (t('unlike') ? '请至少选择一项操作' : 'Please select at least one action'));
      return;
    }

    // 1) 通知当前活动标签的 content script 启动
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.id) {
        chrome.tabs.sendMessage(tab.id, { action: 'start', ...options });
      }
    } catch (e) {
      console.warn('[XEraser popup] tabs.sendMessage 失败：', e);
    }

    // 2) 立即关闭 popup，进度由页面内的浮动面板接管
    window.close();
  });
})();
