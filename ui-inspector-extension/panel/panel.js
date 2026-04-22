// panel.js

const logs = [];
let tool = null;
let selInfo = null;
let tabId = null, panelTabId = null, bgPort = null;

const fr   = document.getElementById('fr');
const ibox = document.getElementById('ibox');

const params = new URLSearchParams(location.search);
tabId = parseInt(params.get('tabId'));
const origin = params.get('origin') || 'http://localhost:3000';
document.getElementById('utext').textContent = new URL(origin).host;

chrome.tabs.getCurrent((tab) => { panelTabId = tab?.id; });

fr.src = origin;
fr.addEventListener('load', () => addLog('page loaded', 'success'));

// ── Port ──────────────────────────────────────────────────────────────────────
function connectPort() {
  try {
    bgPort = chrome.runtime.connect({ name: 'panel-' + tabId });
    bgPort.onMessage.addListener((msg) => {
      if (msg.type === 'HOVER')         updateHover(msg.data);
      if (msg.type === 'SELECT')        selectEl(msg.data);
      if (msg.type === 'CONTENT_READY') addLog('inspector ready ✓', 'success');
    });
    bgPort.onDisconnect.addListener(() => {
      bgPort = null;
      setTimeout(connectPort, 500);
    });
  } catch(e) {
    bgPort = null;
    setTimeout(connectPort, 1000);
  }
}
connectPort();

window.addEventListener('message', (e) => {
  if (!e.data) return;
  if (e.data.type === 'HOVER')  updateHover(e.data.data);
  if (e.data.type === 'SELECT') selectEl(e.data.data);
});

function toTab(msg) {
  if (!bgPort) return;
  try { bgPort.postMessage(msg); } catch(e) { bgPort = null; setTimeout(connectPort, 500); }
}

// ── Tool ──────────────────────────────────────────────────────────────────────
function setTool(t) {
  tool = (tool === t) ? null : t;
  applyTool();
}

function setToolForce(t) {
  tool = t;
  applyTool();
}

function applyTool() {
  document.getElementById('bi').classList.toggle('on', tool === 'inspect');
  document.getElementById('smode').textContent = tool === 'inspect' ? 'Inspect — click element' : 'Ready';
  toTab({ type: 'SET_TOOL', tool });
  if (fr && fr.contentWindow) fr.contentWindow.postMessage({ type: 'SET_TOOL', tool }, '*');
}

// ── Display ───────────────────────────────────────────────────────────────────
function updateHover(d) {
  if (!d) return;
  document.getElementById('ssel').textContent = '<' + d.component + '> ' + (d.selector || '');
}

function selectEl(d) {
  selInfo = d;
  document.getElementById('rc').textContent  = d.component;
  document.getElementById('rt').innerHTML    = '<span class="tchip">' + d.tag + '</span>';
  document.getElementById('rsz').textContent = d.size;
  document.getElementById('rco').textContent = d.color || '—';
  document.getElementById('rtext').textContent = d.textContent || '—';
  document.getElementById('rcls').textContent  = d.fullClasses || '—';
  document.getElementById('rbg').textContent   = d.bgColor || '—';

  const hasSource = d.file && d.file !== 'unknown' && d.file !== 'null';
  document.getElementById('sec-source').style.display   = hasSource ? '' : 'none';
  document.getElementById('sec-selector').style.display = hasSource ? 'none' : '';
  if (hasSource) {
    document.getElementById('rf').textContent = d.file;
    document.getElementById('rl').textContent = d.line || '—';
    document.getElementById('rs').textContent = d.selector;
  } else {
    document.getElementById('rs2').textContent = d.selector;
  }

  const fontRow = document.getElementById('row-font');
  if (d.fontFamily && parseInt(d.fontSize) > 0) {
    fontRow.style.display = '';
    document.getElementById('rfo').textContent = d.fontFamily + ' ' + d.fontSize;
  } else {
    fontRow.style.display = 'none';
  }

  let ctx = `Component: <${d.component}>\nTag: ${d.tag} (Parent: ${d.parentTag})\nClasses: ${d.fullClasses}\nText: "${d.textContent}"\nSize: ${d.size} | Color: ${d.color} | Bg: ${d.bgColor}`;
  if (hasSource) ctx = `File: ${d.file} (Line: ${d.line})\n` + ctx;

  document.getElementById('ctxpre').textContent = ctx;
  document.getElementById('iempty').style.display = 'none';
  document.getElementById('ires').style.display   = 'flex';
  document.getElementById('ssel').textContent = '<' + d.component + '>' + (hasSource ? ' · ' + d.file.split('/').pop() + ':' + d.line : '');
  document.getElementById('reinspect-btn').style.display = 'flex';
  stab('ins');
}

// ── MCP Sync ──────────────────────────────────────────────────────────────────
async function findPort() {
  const ports = Array.from({ length: 11 }, (_, i) => 49210 + i);
  try {
    return await Promise.any(ports.map(p => new Promise((res, rej) => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => { ctrl.abort(); rej(); }, 300);
      fetch(`http://127.0.0.1:${p}/health`, { signal: ctrl.signal })
        .then(r => { clearTimeout(timer); r.ok ? res(p) : rej(); })
        .catch(rej);
    })));
  } catch(e) { return null; }
}

function sendAI() {
  if (!selInfo) return;
  const req = document.getElementById('aireq').value.trim();
  const btn = document.getElementById('sndbtn');
  btn.textContent = 'Đang gửi tới AI...';

  findPort().then(port => {
    if (!port) {
      btn.textContent = '❌ Không tìm thấy IDE Server';
      btn.style.background = 'var(--red)';
      setTimeout(() => { btn.innerHTML = svgArrow() + ' Đồng bộ IDE'; btn.style.background = ''; }, 2000);
      return;
    }
    fetch(`http://127.0.0.1:${port}/api/vibe-context`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...selInfo, requirement: req })
    })
    .then(r => r.json())
    .then(() => {
      btn.textContent = '✓ Đã đồng bộ IDE!';
      btn.style.background = 'var(--green)';
      setTimeout(() => { btn.innerHTML = svgArrow() + ' Đồng bộ IDE'; btn.style.background = ''; }, 2000);
    })
    .catch(() => {
      btn.textContent = '❌ Lỗi kết nối Server';
      btn.style.background = 'var(--red)';
      setTimeout(() => { btn.textContent = 'Đồng bộ lại'; btn.style.background = ''; }, 2000);
    });
  });
}

function svgArrow() {
  return '<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" style="width:13px;height:13px"><path d="M2 7H12M8 3L12 7L8 11" stroke-linecap="round" stroke-linejoin="round"/></svg>';
}

// ── UI helpers ────────────────────────────────────────────────────────────────
function setVP(v) {
  document.getElementById('vd').classList.toggle('on', v === 'd');
  document.getElementById('vm').classList.toggle('on', v === 'm');
  fr.style.maxWidth = v === 'm' ? '390px' : '';
  fr.style.margin   = v === 'm' ? '0 auto' : '';
}

function stab(n) {
  ['ins', 'log'].forEach(t => {
    document.getElementById('tab-btn-' + t).classList.toggle('on', t === n);
    document.getElementById('tab-' + t).classList.toggle('on', t === n);
  });
}

function addLog(msg, type = 'dim') {
  const n = new Date();
  const t = [n.getHours(), n.getMinutes(), n.getSeconds()].map(x => x.toString().padStart(2, '0')).join(':');
  logs.push({ t, m: msg, type });
  const el = document.getElementById('blog');
  if (el) {
    el.innerHTML = logs.map(l => `<div class="ll ${l.type}"><span class="lt">${l.t}</span><span class="lm">${l.m}</span></div>`).join('');
    el.scrollTop = el.scrollHeight;
  }
}

// ── Button bindings ───────────────────────────────────────────────────────────
document.getElementById('bi').addEventListener('click', () => setTool('inspect'));

document.getElementById('reinspect-btn').addEventListener('click', () => {
  // Clear data
  selInfo = null;
  document.getElementById('aireq').value = '';
  document.getElementById('reinspect-btn').style.display = 'none';
  // Reset UI về trạng thái trống
  document.getElementById('iempty').style.display = '';
  document.getElementById('ires').style.display   = 'none';
  document.getElementById('ssel').textContent = 'No element selected';
  document.getElementById('smode').textContent = 'Inspect — click element';
  // Force bật inspect không toggle
  setToolForce('inspect');
});

document.getElementById('sndbtn').addEventListener('click', sendAI);
document.getElementById('vd').addEventListener('click', () => setVP('d'));
document.getElementById('vm').addEventListener('click', () => setVP('m'));
document.getElementById('tab-btn-ins').addEventListener('click', () => stab('ins'));
document.getElementById('tab-btn-log').addEventListener('click', () => stab('log'));

document.addEventListener('keydown', e => {
  if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
  if (e.key === 'i' || e.key === 'I') setTool('inspect');
  else if (e.key === 'Escape') setTool(null);
});

// ── Init ──────────────────────────────────────────────────────────────────────
addLog('UI Inspector ready', 'success');
addLog('Press I → click element to inspect', 'info');