// X-Eraser Background Script

// 处理来自content script的消息
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'openTab' && msg.url) {
    chrome.tabs.create({ url: msg.url, active: false });
  }
  
  if (msg.action === 'stop') {
    // 向所有content script发送stop命令
    chrome.tabs.query({ url: ['*://x.com/*', '*://twitter.com/*'] }, (tabs) => {
      tabs.forEach((tab) => {
        chrome.tabs.sendMessage(tab.id, { action: 'stop' }).catch(() => {});
      });
    });
  }
  
  return true;
});