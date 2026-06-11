/**
 * X-Eraser 浮动控制面板
 * - 注入到 x.com / twitter.com 页面
 * - Shadow DOM 隔离样式
 * - 可拖动 / 可最小化 / 可关闭
 * - 通过 window.XEraserPanel API 被 injector.js 调用
 */
(function() {
  'use strict';

  if (window._XEraserPanelLoaded) return;
  window._XEraserPanelLoaded = true;

  // ========== 任务名称 i18n ==========
  const TASK_NAMES = {
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

  function getLang() {
    try { return localStorage.getItem('xeraser-lang') || 'en'; } catch (e) { return 'en'; }
  }

  function tTask(key) {
    const lang = getLang();
    return (TASK_NAMES[lang] && TASK_NAMES[lang][key]) || key;
  }

  // ========== 工具函数 ==========
  function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'class') node.className = v;
      else if (k === 'style') Object.assign(node.style, v);
      else if (k.startsWith('on') && typeof v === 'function') {
        node.addEventListener(k.slice(2).toLowerCase(), v);
      } else if (k === 'html') {
        node.innerHTML = v;
      } else {
        node.setAttribute(k, v);
      }
    }
    for (const c of children) {
      if (c == null) continue;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return node;
  }

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  // ========== 创建 Shadow DOM 容器 ==========
  const host = document.createElement('div');
  host.id = 'xeraser-panel-host';
  // 注入位置：尽量在 body 末尾；body 不存在时退到 documentElement
  (document.body || document.documentElement).appendChild(host);
  const shadow = host.attachShadow({ mode: 'closed' });

  // 加载 CSS
  try {
    const cssURL = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL)
      ? chrome.runtime.getURL('panel.css')
      : 'panel.css';
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = cssURL;
    shadow.appendChild(link);
  } catch (e) {
    // fallback: 内联样式
    console.warn('[XEraser] Failed to load external CSS, falling back to inline', e);
  }

  // ========== 浮窗 HTML 结构 ==========
  const stateDot   = el('span', { class: 'state-dot' });
  const stateText  = el('span', { class: 'state-text ready', id: 'state-text' }, 'Ready');
  const stateRow   = el('div', { class: 'state' }, stateDot, stateText);

  const currentTask = el('div', { class: 'current-task', id: 'current-task' }, '');

  const progressFill = el('div', { class: 'progress-fill indeterminate', id: 'progress-fill' });
  const progressBar  = el('div', { class: 'progress-bar' }, progressFill);

  const statProcessed = el('div', { class: 'stat-value', id: 'stat-processed' }, '0');
  const statSuccess   = el('div', { class: 'stat-value success', id: 'stat-success' }, '0');
  const statFail      = el('div', { class: 'stat-value fail', id: 'stat-fail' }, '0');

  const stats = el('div', { class: 'stats' },
    el('div', { class: 'stat' }, el('div', { class: 'stat-label' }, 'Processed'), statProcessed),
    el('div', { class: 'stat' }, el('div', { class: 'stat-label' }, 'Success'), statSuccess),
    el('div', { class: 'stat' }, el('div', { class: 'stat-label' }, 'Failed'), statFail)
  );

  const errorMsg = el('div', { class: 'error-msg', id: 'error-msg' });

  const body = el('div', { class: 'body' },
    stateRow, currentTask, progressBar, stats, errorMsg
  );

  // 操作按钮
  const stopBtn = el('button', { class: 'btn btn-stop', id: 'btn-stop' }, '⏹', el('span', {}, 'Stop'));
  const ackBtn  = el('button', { class: 'btn btn-ack',  id: 'btn-ack',  style: { display: 'none' } }, '✓', el('span', {}, 'OK'));
  const actions = el('div', { class: 'actions' }, stopBtn, ackBtn);

  // 标题栏
  const minimizeBtn = el('button', { class: 'icon-btn', id: 'btn-minimize', title: 'Minimize' }, '─');
  const closeBtn    = el('button', { class: 'icon-btn close', id: 'btn-close', title: 'Close' }, '✕');

  const badgeCount  = el('span', { class: 'badge-count', id: 'badge-count' }, '0');
  const badge       = el('div', { class: 'badge' }, '🗑️', badgeCount);

  const titleText   = el('span', { class: 'title-text' }, 'X-Eraser');
  const title       = el('div', { class: 'title' },
    el('span', { class: 'title-icon' }, '🗑️'),
    titleText
  );

  const header = el('div', { class: 'header' },
    badge, title, el('div', { class: 'header-actions' }, minimizeBtn, closeBtn)
  );

  const panel = el('div', { class: 'panel hidden' }, header, body, actions);
  shadow.appendChild(panel);

  // ========== 状态变量 ==========
  const state = {
    visible: false,
    minimized: false,
    running: false,
    processed: 0,
    success: 0,
    fail: 0,
    currentTask: '',
    startTime: 0
  };

  // ========== 渲染函数 ==========
  function setStateText(text, type) {
    stateText.textContent = text;
    stateText.className = 'state-text ' + (type || 'ready');
    stateDot.className = 'state-dot ' + (type || '');
  }

  function setBadge(n) {
    if (n > 0) {
      badgeCount.textContent = n > 99 ? '99+' : String(n);
      badgeCount.classList.add('visible');
    } else {
      badgeCount.classList.remove('visible');
    }
  }

  function updateProgress() {
    statProcessed.textContent = state.processed;
    statSuccess.textContent = state.success;
    statFail.textContent = state.fail;

    if (state.processed > 0) {
      progressFill.classList.remove('indeterminate');
      // 这里没有总数，所以展示一个"无明确进度"的过渡效果
      // 当 processed==0 时 indeterminate 动画；>0 时仍无具体百分比
      // 为简单：保持 indeterminate 直至 complete
    }
  }

  function applyPos(left, top) {
    panel.style.left = left + 'px';
    panel.style.top  = top + 'px';
    panel.style.right = 'auto';
  }

  // ========== API 实现 ==========
  function show() {
    if (state.visible) return;
    state.visible = true;
    state.minimized = false;
    panel.classList.remove('hidden', 'minimized');
  }

  function hide() {
    state.visible = false;
    panel.classList.add('hidden');
  }

  function minimize() {
    if (!state.visible) {
      show();
    }
    state.minimized = true;
    panel.classList.add('minimized');
    // 移到右下角
    panel.style.left = 'auto';
    panel.style.right = '20px';
    panel.style.top = 'auto';
    panel.style.bottom = '20px';
    setBadge(state.processed);
  }

  function restore() {
    state.minimized = false;
    panel.classList.remove('minimized');
    panel.style.right = '20px';
    panel.style.bottom = 'auto';
    // 恢复上次记忆的位置
    try {
      const pos = JSON.parse(localStorage.getItem('xeraser-panel-pos') || 'null');
      if (pos) applyPos(pos.left, pos.top);
      else { panel.style.left = 'auto'; panel.style.top = '20px'; }
    } catch (e) {
      panel.style.left = 'auto';
      panel.style.top = '20px';
    }
    setBadge(0);
  }

  function setReady() {
    state.running = false;
    state.processed = 0;
    state.success = 0;
    state.fail = 0;
    state.currentTask = '';
    setStateText('Ready', 'ready');
    currentTask.textContent = '';
    statProcessed.textContent = '0';
    statSuccess.textContent = '0';
    statFail.textContent = '0';
    progressFill.classList.add('indeterminate');
    progressFill.style.width = '0%';
    stopBtn.style.display = 'flex';
    stopBtn.disabled = true;
    ackBtn.style.display = 'none';
  }

  function setRunning(task) {
    state.running = true;
    state.processed = 0;
    state.success = 0;
    state.fail = 0;
    state.currentTask = task || '';
    state.startTime = Date.now();
    setStateText('Running', 'running');
    currentTask.textContent = task ? ('当前: ' + task) : '';
    statProcessed.textContent = '0';
    statSuccess.textContent = '0';
    statFail.textContent = '0';
    progressFill.classList.add('indeterminate');
    stopBtn.style.display = 'flex';
    stopBtn.disabled = false;
    ackBtn.style.display = 'none';
    // 启动时确保浮窗显示
    if (state.minimized) restore();
    else show();
  }

  function setProgress(data) {
    if (!data) return;
    state.processed = data.processed || 0;
    state.success   = data.success   || 0;
    state.fail      = (data.fail != null) ? data.fail : Math.max(0, state.processed - state.success);
    statProcessed.textContent = state.processed;
    statSuccess.textContent   = state.success;
    statFail.textContent      = state.fail;
    if (state.minimized) setBadge(state.processed);
  }

  function setComplete(data) {
    state.running = false;
    if (data) {
      state.processed = data.processed || state.processed;
      state.success   = data.success   || state.success;
      state.fail      = (data.fail != null) ? data.fail : Math.max(0, state.processed - state.success);
    }
    const elapsed = state.startTime ? Math.floor((Date.now() - state.startTime) / 1000) : 0;
    const m = Math.floor(elapsed / 60), s = elapsed % 60;
    const elapsedStr = m > 0 ? `${m}分${s}秒` : `${s}秒`;

    setStateText('完成', 'complete');
    currentTask.textContent = `耗时 ${elapsedStr} · 处理 ${state.processed} · 成功 ${state.success}`;
    statProcessed.textContent = state.processed;
    statSuccess.textContent   = state.success;
    statFail.textContent      = state.fail;
    progressFill.classList.remove('indeterminate');
    progressFill.style.width = '100%';
    stopBtn.style.display = 'none';
    ackBtn.style.display = 'flex';
    if (state.minimized) setBadge(state.processed);
  }

  function setError(msg) {
    state.running = false;
    setStateText('出错', 'error');
    errorMsg.textContent = msg || 'Unknown error';
    errorMsg.classList.add('visible');
    stopBtn.style.display = 'none';
    ackBtn.style.display = 'flex';
  }

  function setCurrentTaskLabel(task) {
    // 更新"当前任务"的显示（任务切换时）
    if (task) {
      state.currentTask = task;
      currentTask.textContent = '当前: ' + task;
    }
  }

  // ========== 事件绑定 ==========
  stopBtn.addEventListener('click', () => {
    if (!state.running) return;
    if (typeof window.XEraser !== 'undefined' && window.XEraser.stop) {
      window.XEraser.stop();
    }
    stopBtn.disabled = true;
    setStateText('Stopping...', 'ready');
  });

  ackBtn.addEventListener('click', () => {
    hide();
    setReady();
  });

  closeBtn.addEventListener('click', () => {
    hide();
  });

  minimizeBtn.addEventListener('click', () => {
    if (state.minimized) restore();
    else minimize();
  });

  // 最小化态的圆点点击恢复
  header.addEventListener('click', (e) => {
    if (state.minimized && (e.target === header || e.target === badge || e.target.classList.contains('title-icon'))) {
      restore();
    }
  });

  // ========== 拖动支持 ==========
  let drag = null;
  header.addEventListener('mousedown', (e) => {
    if (state.minimized) return;
    if (e.target.closest('.icon-btn')) return; // 点按钮不拖
    const rect = panel.getBoundingClientRect();
    drag = {
      startX: e.clientX,
      startY: e.clientY,
      origLeft: rect.left,
      origTop: rect.top
    };
    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('mouseup', onDragEnd);
    e.preventDefault();
  });

  function onDragMove(e) {
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    const newLeft = clamp(drag.origLeft + dx, 0, window.innerWidth - panel.offsetWidth);
    const newTop  = clamp(drag.origTop  + dy, 0, window.innerHeight - 40);
    applyPos(newLeft, newTop);
  }

  function onDragEnd() {
    if (!drag) return;
    document.removeEventListener('mousemove', onDragMove);
    document.removeEventListener('mouseup', onDragEnd);
    const rect = panel.getBoundingClientRect();
    try {
      localStorage.setItem('xeraser-panel-pos', JSON.stringify({ left: rect.left, top: rect.top }));
    } catch (e) {}
    drag = null;
  }

  // ========== 初始化位置 ==========
  try {
    const pos = JSON.parse(localStorage.getItem('xeraser-panel-pos') || 'null');
    if (pos && pos.left != null) {
      // 确保位置在视口内
      const maxLeft = window.innerWidth - 100;
      const maxTop  = window.innerHeight - 60;
      if (pos.left > maxLeft || pos.top > maxTop || pos.left < 0 || pos.top < 0) {
        panel.style.left = 'auto';
        panel.style.top  = '20px';
      } else {
        applyPos(pos.left, pos.top);
      }
    }
  } catch (e) {}

  // ========== 自愈：被 X 的脚本移除时重建 ==========
  const observer = new MutationObserver(() => {
    if (!document.body.contains(host)) {
      (document.body || document.documentElement).appendChild(host);
    }
  });
  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: false });
  }

  // ========== 暴露 API ==========
  window.XEraserPanel = {
    show,
    hide,
    minimize,
    restore,
    setReady,
    setRunning,
    setProgress,
    setComplete,
    setError,
    setCurrentTaskLabel,
    translateTask: tTask
  };

  // 默认 ready 态、不显示（等待 injector 真正启动时再 show）
  setReady();
  panel.classList.add('hidden'); // 初始隐藏

  console.log('[XEraser] ✓ Panel loaded (Shadow DOM)');
})();
