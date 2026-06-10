/**
 * X-Eraser Injector Script
 * 
 * 此脚本将被注入到 x.com 网页中，用于自动化删除操作。
 * 它会在页面中查找删除按钮并执行循环点击。
 * 
 * 主要功能：
 * 1. 查找页面上的删除/unlike 按钮
 * 2. 实现随机延迟循环点击
 * 3. 避免被检测为机器人行为
 */

// ===== 配置参数 =====
const CONFIG = {
  // 随机延迟范围（毫秒）
  // 最小延迟时间（避免太快被检测）
  minDelay: 2000,
  // 最大延迟时间（模拟人类行为）
  maxDelay: 5000,
  
  // 每批次处理数量后的大暂停（避免连续操作）
  batchPause: {
    min: 10000,  // 10秒
    max: 20000   // 20秒
  },
  
  // 每批次处理数量
  batchSize: 10,
  
  // 是否继续运行（用于控制停止）
  shouldContinue: true,
  
  // 日志级别：'info', 'warn', 'error'
  logLevel: 'info'
};

// ===== 日志工具 =====
function log(level, ...args) {
  const levels = { info: 0, warn: 1, error: 2 };
  if (levels[level] >= levels[CONFIG.logLevel]) {
    console.log(`[X-Eraser] [${level.toUpperCase()}]`, ...args);
  }
}

// ===== 随机延迟工具 =====

/**
 * 生成指定范围内的随机延迟时间
 * 这是实现"随机延迟循环点击"的关键函数
 * 
 * 实现原理：
 * 1. Math.random() 生成 0-1 之间的随机数
 * 2. 乘以范围差值，得到随机偏移量
 * 3. 加上最小值，得到最终延迟时间
 * 
 * @param {number} min - 最小延迟（毫秒）
 * @param {number} max - 最大延迟（毫秒）
 * @returns {number} 随机延迟时间（毫秒）
 */
function getRandomDelay(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * 带随机延迟的等待函数
 * 
 * 使用 Promise + setTimeout 实现异步等待，
 * 可以使用 await 关键字进行调用
 * 
 * @param {number} min - 最小延迟（毫秒）
 * @param {number} max - 最大延迟（毫秒）
 * @returns {Promise} 延迟完成后 resolve
 */
function randomDelay(min, max) {
  const delay = getRandomDelay(min, max);
  log('info', `Waiting for ${delay}ms...`);
  return new Promise(resolve => setTimeout(resolve, delay));
}

// ===== 按钮查找工具 =====

/**
 * 查找删除按钮的策略：
 * X.com 网页的删除按钮可能有多种选择器
 * 这里列出常见的选择器，实际使用时可能需要调整
 */
const DELETE_BUTTON_SELECTORS = [
  // 更多操作菜单中的删除选项
  '[data-testid="more"][role="button"]',
  // 删除/取消点赞按钮
  '[data-testid="unlike"]',
  '[data-testid="remove"]',
  '[data-testid="delete"]',
  // 确认删除对话框的确认按钮
  '[data-testid="confirmationSheetConfirm"]',
  // 下拉菜单中的删除选项
  '[role="menuitem"]'
];

// 缓存已点击过的按钮（避免重复点击）
const clickedButtons = new Set();

/**
 * 查找页面上可点击的删除相关按钮
 * 
 * @returns {HTMLElement|null} 找到的按钮元素或 null
 */
function findDeleteButton() {
  // 策略1：查找"更多"按钮（三个点），然后在菜单中找删除选项
  const moreButtons = document.querySelectorAll('[data-testid="more"]');
  
  for (const btn of moreButtons) {
    // 获取最近的 article 元素
    const article = btn.closest('article');
    if (!article) continue;
    
    // 生成唯一标识
    const articleId = article.getAttribute('data-testid') || article.textContent;
    if (clickedButtons.has(articleId + '_more')) continue;
    
    return { button: btn, type: 'more', articleId: articleId + '_more' };
  }
  
  // 策略2：直接查找已展开的菜单中的删除选项
  const menuItems = document.querySelectorAll('[role="menuitem"]');
  for (const item of menuItems) {
    const text = item.textContent.toLowerCase();
    if (text.includes('delete') || text.includes('remove')) {
      if (!clickedButtons.has(text)) {
        clickedButtons.add(text);
        return { button: item, type: 'menu', articleId: text };
      }
    }
  }
  
  return null;
}

/**
 * 点击元素并等待
 * 
 * @param {HTMLElement} element - 要点击的元素
 * @param {boolean} needConfirm - 是否需要处理确认对话框
 */
async function clickWithDelay(element, needConfirm = true) {
  try {
    // 模拟人类点击：先移动到元素上，稍作停留后再点击
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await randomDelay(500, 1000); // 等待滚动完成
    
    // 执行点击
    element.click();
    log('info', 'Clicked button');
    
    // 如果需要处理确认对话框
    if (needConfirm) {
      await randomDelay(CONFIG.minDelay, CONFIG.maxDelay);
      
      // 查找并点击确认按钮
      const confirmBtn = document.querySelector('[data-testid="confirmationSheetConfirm"]');
      if (confirmBtn) {
        confirmBtn.click();
        log('info', 'Confirmed action');
      }
    }
    
    return true;
  } catch (error) {
    log('error', 'Click failed:', error);
    return false;
  }
}

// ===== 主循环逻辑 =====

/**
 * 执行一轮清理操作
 * 
 * 随机延迟循环点击的核心逻辑：
 * 1. 查找可点击的删除按钮
 * 2. 点击后随机等待一段时间
 * 3. 检查是否应该继续
 * 4. 重复直到没有更多按钮或被停止
 */
async function runCleanupCycle() {
  let cycleCount = 0;
  const startTime = Date.now();
  
  log('info', 'Starting cleanup cycle...');
  
  while (CONFIG.shouldContinue) {
    const result = findDeleteButton();
    
    if (!result) {
      log('info', 'No more delete buttons found, scrolling down...');
      
      // 滚动页面加载更多内容
      window.scrollBy(0, 500);
      await randomDelay(1000, 2000);
      
      // 再次尝试查找
      if (!findDeleteButton()) {
        log('info', 'Still no buttons after scroll, ending cycle');
        break;
      }
    } else {
      // 点击找到的按钮
      await clickWithDelay(result.button, true);
      cycleCount++;
      
      // 每处理一定数量后执行大暂停（模拟休息）
      if (cycleCount % CONFIG.batchSize === 0) {
        const pauseTime = getRandomDelay(CONFIG.batchPause.min, CONFIG.batchPause.max);
        log('info', `Completed ${cycleCount} items. Taking a break for ${pauseTime}ms...`);
        await new Promise(resolve => setTimeout(resolve, pauseTime));
      } else {
        // 正常操作间的随机延迟
        await randomDelay(CONFIG.minDelay, CONFIG.maxDelay);
      }
    }
  }
  
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  log('info', `Cleanup cycle completed. Processed ${cycleCount} items in ${elapsed}s`);
  return cycleCount;
}

// ===== 控制接口 =====

/**
 * 开始清理
 */
function startCleanup() {
  CONFIG.shouldContinue = true;
  log('info', 'Cleanup started');
  runCleanupCycle();
}

/**
 * 停止清理
 */
function stopCleanup() {
  CONFIG.shouldContinue = false;
  log('info', 'Cleanup stopped');
}

/**
 * 更新配置
 * 
 * @param {Object} newConfig - 新配置（会与默认配置合并）
 */
function updateConfig(newConfig) {
  Object.assign(CONFIG, newConfig);
  log('info', 'Config updated:', CONFIG);
}

// ===== 导出接口（供外部调用）=====
window.XEraser = {
  start: startCleanup,
  stop: stopCleanup,
  config: updateConfig,
  getState: () => ({ shouldContinue: CONFIG.shouldContinue })
};

log('info', 'X-Eraser injector loaded. Use window.XEraser.start() to begin.');