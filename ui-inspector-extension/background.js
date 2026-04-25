// background.js — UI Inspector v7
// Capture: captureVisibleTab (tab luôn active vì sidebar là DOM overlay 320px phải)
// Không cần debugger API, không cần scroll-stitch

const pendingTabs = new Map();

function isInjectableUrl(url) {
  if (!url) return false;
  if (url.startsWith('chrome://'))           return false;
  if (url.startsWith('chrome-extension://')) return false;
  if (url.startsWith('about:'))              return false;
  if (url.startsWith('data:'))               return false;
  return true;
}

// ── Click icon → toggle sidebar ────────────────────────────────────────────
chrome.action.onClicked.addListener((tab) => {
  if (!tab?.id || !isInjectableUrl(tab.url)) return;

  chrome.tabs.sendMessage(tab.id, { type: 'PING' }, (res) => {
    if (chrome.runtime.lastError || !res || res.type !== 'PONG') {
      injectSidebar(tab);
    } else if (res.mode === 'open') {
      chrome.tabs.sendMessage(tab.id, { type: 'CLOSE' });
    } else {
      chrome.tabs.sendMessage(tab.id, { type: 'OPEN_SIDEBAR' });
    }
  });
});

function injectSidebar(tab) {
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['inject.js']
  }).then(() => {
    const timer = setTimeout(() => {
      if (pendingTabs.has(tab.id)) {
        pendingTabs.delete(tab.id);
        chrome.tabs.sendMessage(tab.id, { type: 'OPEN_SIDEBAR' });
      }
    }, 500);
    pendingTabs.set(tab.id, { tab, timer });
  }).catch(err => console.error('[UI Inspector] inject failed:', err));
}

// ── Messages from inject.js ────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender) => {
  const tabId = sender.tab?.id;

  if (msg.type === 'CONTENT_READY') {
    if (tabId && pendingTabs.has(tabId)) {
      const { timer } = pendingTabs.get(tabId);
      clearTimeout(timer);
      pendingTabs.delete(tabId);
      chrome.tabs.sendMessage(tabId, { type: 'OPEN_SIDEBAR' });
    }
    return;
  }

  // Capture: sidebar đã tự ẩn (host.style.display='none') trước khi gửi message
  // Tab vẫn active → captureVisibleTab hoạt động ngay, không cần tab-switch
  if (msg.type === 'CAPTURE_REQUEST') {
    if (!tabId) return;
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError || !tab) {
        chrome.tabs.sendMessage(tabId, { type: 'CAPTURE_ERROR' });
        return;
      }
      chrome.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 85 }, (dataUrl) => {
        if (chrome.runtime.lastError || !dataUrl) {
          chrome.tabs.sendMessage(tabId, { type: 'CAPTURE_ERROR' });
          return;
        }
        chrome.tabs.sendMessage(tabId, { type: 'INIT_CAPTURE', image: dataUrl });
      });
    });
  }
});