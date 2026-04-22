// popup.js - no inline handlers (CSP requirement for MV3)
chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  const dot  = document.getElementById('dot');
  const msg  = document.getElementById('msg');
  const btn  = document.getElementById('openbtn');
  const note = document.getElementById('note');
  if (!tab) return;

  const isLocalhost = tab.url?.startsWith('http://localhost') || tab.url?.startsWith('http://127.0.0.1');

  if (!isLocalhost) {
    dot.className = 'dot er';
    msg.textContent = 'Not a localhost page. Navigate to your dev server first.';
    note.textContent = 'Supports: localhost:3000, localhost:5173, etc.';
    return;
  }

  dot.className = 'dot ok';
  msg.textContent = 'Detected: ' + new URL(tab.url).host;
  btn.style.display = 'flex';
  note.textContent = 'Panel opens in a new tab alongside your app.';

  btn.addEventListener('click', () => {
    const panelUrl = chrome.runtime.getURL('panel/panel.html')
      + '?tabId=' + tab.id
      + '&origin=' + encodeURIComponent(new URL(tab.url).origin);
    chrome.tabs.create({ url: panelUrl });
    window.close();
  });
});
