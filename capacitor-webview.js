/**
 * Capacitor WebView Plugin
 * 
 * 这个文件提供了与原生 Android WebView 的通信接口
 * 用于加载 x.com 并注入 injector.js
 */

// 检查是否在 Capacitor 环境中
const isCapacitor = typeof window.Capacitor !== 'undefined';

// 模拟模式（浏览器环境）
const isSimulated = !isCapacitor;

// ===== WebView 控制接口 =====

/**
 * WebView 控制对象
 */
const XEraserWebView = {
  // 是否已加载
  isLoaded: false,
  
  // 回调函数
  onLoadStart: null,
  onLoadEnd: null,
  onError: null,
  onProgress: null,
  
  /**
   * 在原生 WebView 中加载 x.com
   * @param {Function} callback - 回调函数
   */
  async loadX() {
    if (isCapacitor) {
      try {
        // 调用原生插件
        const result = await window.Capacitor.Plugins.XEraserWebView.loadX();
        return result;
      } catch (error) {
        console.error('Failed to load X in WebView:', error);
        throw error;
      }
    } else {
      // 模拟模式：在浏览器中打开
      console.log('[XEraser] Opening X in browser (simulated mode)');
      window.open('https://x.com', '_blank');
      return { success: true, mode: 'browser' };
    }
  },
  
  /**
   * 注入脚本到 WebView
   * @param {string} script - 要注入的脚本内容
   */
  async injectScript(script) {
    if (isCapacitor) {
      try {
        const result = await window.Capacitor.Plugins.XEraserWebView.injectScript(script);
        return result;
      } catch (error) {
        console.error('Failed to inject script:', error);
        throw error;
      }
    } else {
      console.log('[XEraser] Injecting script (simulated mode)');
      console.log(script);
      return { success: true };
    }
  },
  
  /**
   * 执行清理操作
   */
  async startCleanup(options) {
    if (isCapacitor) {
      try {
        const result = await window.Capacitor.Plugins.XEraserWebView.startCleanup(options);
        return result;
      } catch (error) {
        console.error('Failed to start cleanup:', error);
        throw error;
      }
    } else {
      // 模拟模式
      console.log('[XEraser] Starting cleanup (simulated mode):', options);
      return { success: true, mode: 'browser' };
    }
  },
  
  /**
   * 停止清理
   */
  async stopCleanup() {
    if (isCapacitor) {
      try {
        const result = await window.Capacitor.Plugins.XEraserWebView.stopCleanup();
        return result;
      } catch (error) {
        console.error('Failed to stop cleanup:', error);
        throw error;
      }
    } else {
      console.log('[XEraser] Stopping cleanup (simulated mode)');
      return { success: true };
    }
  },
  
  /**
   * 检查连接状态
   */
  async checkConnection() {
    if (isCapacitor) {
      try {
        const result = await window.Capacitor.Plugins.XEraserWebView.checkConnection();
        return result;
      } catch (error) {
        console.error('Failed to check connection:', error);
        throw error;
      }
    } else {
      return { connected: false, mode: 'browser' };
    }
  }
};

// ===== 注册为全局对象 =====
window.XEraserWebView = XEraserWebView;

console.log('[XEraser] WebView plugin loaded. Mode:', isSimulated ? 'Browser (simulated)' : 'Capacitor (native)');