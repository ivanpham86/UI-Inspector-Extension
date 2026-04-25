// inject.js — UI Inspector v7.2
// Mode 1: Inspect  — sidebar 320px, click elements → text context → sync IDE
// Mode 2: Capture  — fullscreen annotator, 1 ảnh + Box/Arrow (max 3) → sync IDE
// Single-capture model: 1 ảnh tại 1 thời điểm, chụp lại = reset hoàn toàn

(function () {
  const KEY = Symbol.for('VI_V7');
  if (globalThis[KEY]) return;
  globalThis[KEY] = true;

  const MAX        = 3;
  const SEL_COLORS = ['#f59e0b', '#60a5fa', '#4ade80'];

  // ── State ─────────────────────────────────────────────────────────────────
  let mode      = 'closed';   // 'closed' | 'sidebar' | 'annotator'
  let inspectOn = false;
  let selections  = [];       // [{info, req}]  max 3
  let screenshot  = null;     // dataUrl ảnh hiện tại
  let annotations = [];       // [{id,type,x1,y1,x2,y2,note}]  max 3
  let drawing     = null;
  let annotTool   = null;

  // DOM refs
  let sidebarHost = null, sidebarSR = null;
  let annotHost   = null, annotSR   = null, svgEl = null;
  let hoverHl = null, selHls = [], selHlElRefs = [];
  let winMM = null, winMU = null, keyH = null, resH = null;
  let scrollRAF = null, cachedPort = null, toastEl = null;
  let _lastScanFailed = 0; // timestamp lần scan cuối thất bại
  let _cursorStyle = null, _capturing = false;

  // ── Bootstrap ─────────────────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg, _s, sendResponse) => {
    if (msg.type === 'PING')          { sendResponse({ type:'PONG', mode }); return true; }
    if (msg.type === 'OPEN_SIDEBAR')  { openSidebar(); return; }
    if (msg.type === 'CLOSE')         { closeAll(); return; }
    if (msg.type === 'INIT_CAPTURE')  { openAnnotator(msg.image); return; }
    if (msg.type === 'CAPTURE_ERROR') { onCaptureError(); return; }
  });
  try { chrome.runtime.sendMessage({ type:'CONTENT_READY' }); } catch(e) {}

  // ══════════════════════════════════════════════════════════════════════════
  // SIDEBAR
  // ══════════════════════════════════════════════════════════════════════════
  function openSidebar() {
    if (mode === 'sidebar') return;
    mode = 'sidebar';

    sidebarHost = document.createElement('div');
    sidebarHost.id = '__vi7_sb__';
    Object.assign(sidebarHost.style, {
      position:'fixed', top:'0', right:'0',
      width:'320px', height:'100vh',
      zIndex:'2147483647', pointerEvents:'none',
    });
    document.documentElement.appendChild(sidebarHost);

    sidebarSR = sidebarHost.attachShadow({ mode:'open' });
    const wrap = document.createElement('div');
    wrap.style.cssText = 'width:100%;height:100%;pointer-events:auto;';
    sidebarSR.appendChild(wrap);
    wrap.innerHTML = buildSidebarHTML();
    injectSidebarStyles(sidebarSR);
    bindSidebarEvents(wrap);

    keyH = e => {
      if (mode !== 'sidebar') return;
      const act = sidebarSR.activeElement;
      if (act?.tagName === 'TEXTAREA' || act?.tagName === 'INPUT') return;
      if (e.key === 'i' || e.key === 'I') { e.preventDefault(); toggleInspect(wrap); }
      if (e.key === 'Escape') {
        if (inspectOn) setInspect(false, wrap);
        else closeAll();
      }
    };
    document.addEventListener('keydown', keyH);
    // Restore capture state nếu đã có ảnh
    if (screenshot) updateCaptureDoneState(screenshot, wrap);
  }

  function closeSidebar() {
    if (keyH) { document.removeEventListener('keydown', keyH); keyH = null; }
    document.removeEventListener('mousemove', onDocMove);
    document.removeEventListener('click', onDocClick, true);
    window.removeEventListener('scroll', onPageScroll);
    if (scrollRAF) { cancelAnimationFrame(scrollRAF); scrollRAF = null; }
    setCrosshairCursor(false);
    removeHoverHl(); removeSelHls();
    if (sidebarHost) { sidebarHost.remove(); sidebarHost = sidebarSR = null; }
  }

  // ── Sidebar HTML ──────────────────────────────────────────────────────────
  function buildSidebarHTML() { return `
<div id="vi-root">
  <div id="vi-hdr">
    <div id="vi-logo">
      <svg viewBox="0 0 12 12" fill="none" width="14" height="14">
        <rect x="1" y="1" width="4" height="4" rx="1.2" fill="rgba(255,255,255,.9)"/>
        <rect x="7" y="1" width="4" height="4" rx="1.2" fill="rgba(255,255,255,.5)"/>
        <rect x="1" y="7" width="4" height="4" rx="1.2" fill="rgba(255,255,255,.5)"/>
        <rect x="7" y="7" width="4" height="4" rx="1.2" fill="rgba(255,255,255,.9)"/>
      </svg>
      UI Inspector
    </div>
    <div style="display:flex;align-items:center;gap:7px">
      <span id="vi-dot" title="IDE: chưa kiểm tra" style="width:7px;height:7px;border-radius:50%;background:rgba(255,255,255,.2);display:block;cursor:default;transition:background .3s;flex-shrink:0"></span>
      <button id="vi-x">✕</button>
    </div>
  </div>

  <div id="vi-tabs">
    <button class="vi-tab vi-tab-a-on" id="vi-t-ins">
      <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" width="13" height="13">
        <path d="M1.5 1.5L5.5 11L7 7L11 5.5L1.5 1.5Z" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      Inspect
    </button>
    <button class="vi-tab" id="vi-t-cap">
      <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" width="13" height="13">
        <rect x="1" y="4" width="12" height="8" rx="1.5"/>
        <circle cx="7" cy="8" r="2.2"/>
        <path d="M4.5 4L5.3 2H8.7L9.5 4" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      Capture
    </button>
  </div>

  <!-- INSPECT PANE -->
  <div id="vi-pane-ins">
    <div id="vi-ins-tb">
      <button class="vi-btn" id="vi-btn-i">
        <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" width="13" height="13">
          <path d="M1.5 1.5L5.5 11L7 7L11 5.5L1.5 1.5Z" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        Inspect <kbd>I</kbd>
      </button>
    </div>
    <div id="vi-ins-hint" class="vi-hint vi-hint-a" style="display:none">Hover để highlight · click để chọn (tối đa 3)</div>
    <div id="vi-ins-main">
      <div id="vi-ins-scroll">
        <div id="vi-ins-empty" class="vi-empty">
          <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" width="28" height="28" opacity=".25">
            <path d="M1.5 1.5L5.5 11L7 7L11 5.5L1.5 1.5Z" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <p>Nhấn <strong>Inspect</strong> rồi<br>click element bất kỳ trên trang</p>
        </div>
        <div id="vi-sel-list"></div>
        <div id="vi-ins-ai" class="vi-ai-area" style="display:none">
          <div class="vi-ai-lbl">Context for AI</div>
          <pre class="vi-pre" id="vi-ins-ctx"></pre>
          <button class="vi-send vi-send-a" id="vi-send-ins">
            <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" width="13" height="13">
              <path d="M2 7H12M8 3L12 7L8 11" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Đồng bộ IDE
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- CAPTURE PANE -->
  <div id="vi-pane-cap" style="display:none">
    <div id="vi-cap-empty" class="vi-empty" style="flex:1;padding:32px 16px">
      <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" width="32" height="32" opacity=".25">
        <rect x="1" y="4" width="12" height="8" rx="1.5"/>
        <circle cx="7" cy="8" r="2.2"/>
        <path d="M4.5 4L5.3 2H8.7L9.5 4" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <p>Chụp màn hình rồi<br>đánh dấu tất cả điểm cần sửa</p>
      <button id="vi-cap-btn" class="vi-capbtn">
        <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" width="13" height="13">
          <rect x="1" y="4" width="12" height="8" rx="1.5"/>
          <circle cx="7" cy="8" r="2.2"/>
          <path d="M4.5 4L5.3 2H8.7L9.5 4" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        Capture
      </button>
    </div>
    <div id="vi-cap-done" style="display:none;flex-direction:column;flex:1;overflow:hidden">
      <div style="padding:7px 10px;border-bottom:1px solid rgba(255,255,255,.06);display:flex;align-items:center;gap:6px;flex-shrink:0">
        <span style="font-size:10.5px;color:rgba(255,255,255,.4);flex:1">Đã chụp</span>
        <button id="vi-cap-new" class="vi-btn" style="font-size:10.5px">
          <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" width="11" height="11">
            <path d="M1.5 7A5.5 5.5 0 1 0 4 2.5" stroke-linecap="round"/>
            <path d="M1.5 1v3h3" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Chụp lại
        </button>
      </div>
      <div id="vi-cap-thumb" style="padding:10px;cursor:pointer;flex:1;display:flex;flex-direction:column;gap:6px" title="Click để mở annotator">
        <img id="vi-thumb-img" style="width:100%;height:auto;border-radius:4px;border:1px solid rgba(255,255,255,.08);display:block" alt=""/>
        <p style="font-size:10px;color:rgba(96,165,250,.6);text-align:center">Click để mở / tiếp tục annotate</p>
      </div>
    </div>
  </div>
</div>`; }

  // ── Sidebar styles ────────────────────────────────────────────────────────
  function injectSidebarStyles(root) {
    const s = document.createElement('style');
    s.textContent = `
* { box-sizing:border-box; margin:0; padding:0; }
#vi-root { width:320px; height:100vh; background:#111; border-left:1px solid rgba(255,255,255,.1); display:flex; flex-direction:column; font-family:-apple-system,'Inter',sans-serif; font-size:12px; box-shadow:-4px 0 20px rgba(0,0,0,.5); overflow:hidden; }
#vi-hdr { display:flex; align-items:center; justify-content:space-between; padding:10px 12px; border-bottom:1px solid rgba(255,255,255,.08); flex-shrink:0; }
#vi-logo { display:flex; align-items:center; gap:7px; font-size:12px; font-weight:600; color:rgba(255,255,255,.85); }
#vi-x { background:none; border:none; color:rgba(255,255,255,.4); cursor:pointer; font-size:14px; padding:2px 6px; border-radius:4px; line-height:1; }
#vi-x:hover { background:rgba(255,255,255,.08); color:rgba(255,255,255,.8); }
#vi-tabs { display:flex; border-bottom:1px solid rgba(255,255,255,.08); flex-shrink:0; }
.vi-tab { flex:1; display:flex; align-items:center; justify-content:center; gap:5px; padding:8px 10px; background:none; border:none; border-bottom:2px solid transparent; color:rgba(255,255,255,.35); font-size:11px; font-weight:500; cursor:pointer; font-family:inherit; transition:all .15s; }
.vi-tab:hover { color:rgba(255,255,255,.6); background:rgba(255,255,255,.04); }
.vi-tab-a-on { color:#f59e0b; border-bottom-color:rgba(245,158,11,.8); background:rgba(245,158,11,.06); }
.vi-tab-b-on { color:#60a5fa; border-bottom-color:rgba(96,165,250,.8); background:rgba(96,165,250,.06); }
#vi-pane-ins, #vi-pane-cap { flex:1; display:flex; flex-direction:column; overflow:hidden; min-height:0; }
#vi-ins-tb { display:flex; align-items:center; gap:6px; padding:7px 10px; border-bottom:1px solid rgba(255,255,255,.06); flex-shrink:0; }
#vi-ins-main { flex:1; display:flex; flex-direction:column; overflow:hidden; min-height:0; }
.vi-btn { display:flex; align-items:center; gap:4px; background:rgba(255,255,255,.07); border:1px solid rgba(255,255,255,.12); color:rgba(255,255,255,.7); border-radius:6px; padding:4px 9px; cursor:pointer; font-size:11px; font-weight:500; font-family:inherit; white-space:nowrap; transition:background .15s; }
.vi-btn:hover { background:rgba(255,255,255,.12); }
.vi-btn.on-a { background:rgba(245,158,11,.18); border-color:rgba(245,158,11,.4); color:#f59e0b; }
.vi-btn kbd { background:rgba(255,255,255,.08); border:1px solid rgba(255,255,255,.15); border-radius:3px; padding:0 4px; font-size:9.5px; font-family:inherit; color:rgba(255,255,255,.4); margin-left:1px; }
.vi-hint { padding:5px 11px; font-size:10.5px; line-height:1.4; flex-shrink:0; }
.vi-hint-a { background:rgba(245,158,11,.07); color:rgba(245,158,11,.8); border-bottom:1px solid rgba(245,158,11,.1); }
#vi-ins-scroll { flex:1; overflow-y:auto; padding:10px; display:flex; flex-direction:column; gap:8px; min-height:0; }
#vi-ins-scroll::-webkit-scrollbar { width:3px; }
#vi-ins-scroll::-webkit-scrollbar-thumb { background:rgba(255,255,255,.15); border-radius:2px; }
.vi-empty { display:flex; flex-direction:column; align-items:center; gap:8px; padding:28px 16px; text-align:center; color:rgba(255,255,255,.25); }
.vi-empty p { font-size:11px; line-height:1.6; }
.vi-empty strong { color:rgba(255,255,255,.5); }
.vi-capbtn { display:flex; align-items:center; gap:5px; padding:8px 18px; border-radius:6px; border:none; background:rgba(96,165,250,.85); color:#000; font-size:12px; font-weight:600; cursor:pointer; font-family:inherit; margin-top:6px; }
.vi-capbtn:hover { background:#60a5fa; }
.vi-card { background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.08); border-radius:7px; padding:8px 9px; position:relative; }
.vi-cnum { position:absolute; top:7px; right:7px; width:16px; height:16px; border-radius:50%; font-size:9px; font-weight:700; display:flex; align-items:center; justify-content:center; }
.vi-cdel { position:absolute; top:5px; right:25px; background:none; border:none; color:rgba(255,255,255,.2); cursor:pointer; font-size:11px; padding:2px 4px; border-radius:2px; }
.vi-cdel:hover { color:#f87171; }
.vi-chead { font-size:11px; font-weight:600; color:rgba(255,255,255,.85); padding-right:44px; margin-bottom:2px; }
.vi-csrc  { font-size:9px; color:#4ade80; margin-bottom:4px; }
.vi-row { display:flex; gap:5px; padding:2px 0; border-bottom:1px solid rgba(255,255,255,.04); }
.vi-lbl { color:rgba(255,255,255,.3); min-width:42px; flex-shrink:0; font-size:10px; padding-top:1px; }
.vi-val { color:rgba(255,255,255,.75); font-size:10px; line-height:1.4; word-break:break-all; }
.vi-amber { color:#f59e0b; }
.vi-ta { width:100%; margin-top:5px; background:rgba(255,255,255,.05); border:1px solid rgba(255,255,255,.08); border-radius:4px; padding:4px 6px; color:rgba(255,255,255,.75); font-size:10.5px; font-family:inherit; resize:none; height:36px; outline:none; line-height:1.4; }
.vi-ta:focus { border-color:rgba(245,158,11,.35); }
.vi-ai-area { background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.07); border-radius:7px; padding:8px; margin-top:4px; }
.vi-ai-lbl { font-size:9.5px; text-transform:uppercase; letter-spacing:.6px; color:rgba(255,255,255,.28); font-weight:600; margin-bottom:4px; }
.vi-pre { background:rgba(0,0,0,.3); border:1px solid rgba(255,255,255,.05); border-radius:3px; padding:5px 7px; font-size:9.5px; font-family:'SF Mono','Menlo',monospace; color:rgba(255,255,255,.45); white-space:pre-wrap; word-break:break-all; max-height:80px; overflow-y:auto; line-height:1.4; margin-bottom:5px; }
.vi-send { display:flex; align-items:center; justify-content:center; gap:4px; width:100%; height:28px; border-radius:5px; border:none; font-size:11px; font-weight:600; font-family:inherit; cursor:pointer; }
.vi-send-a { background:rgba(245,158,11,.85); color:#000; }
.vi-send-a:hover { background:#f59e0b; }
.vi-send:disabled { opacity:.5; cursor:default; }`;
    root.appendChild(s);
  }

  // ── Sidebar events ─────────────────────────────────────────────────────────
  function bindSidebarEvents(wrap) {
    const $ = id => wrap.querySelector('#'+id);
    $('vi-x').addEventListener('click', closeAll);
    $('vi-t-ins').addEventListener('click', () => switchSidebarTab('inspect', wrap));
    $('vi-t-cap').addEventListener('click', () => switchSidebarTab('capture', wrap));
    $('vi-btn-i').addEventListener('click', () => toggleInspect(wrap));
    $('vi-cap-btn').addEventListener('click', () => triggerCapture());
    $('vi-cap-new').addEventListener('click', () => triggerCapture(true));  // true = reset
    $('vi-cap-thumb').addEventListener('click', () => { if (screenshot) reopenAnnotator(); });
    $('vi-send-ins').addEventListener('click', () => sendToIDE('inspect'));
    document.addEventListener('mousemove', onDocMove);
    document.addEventListener('click', onDocClick, true);
    window.addEventListener('scroll', onPageScroll, { passive:true });
  }

  function switchSidebarTab(to, wrap) {
    const tIns = wrap.querySelector('#vi-t-ins'), tCap = wrap.querySelector('#vi-t-cap');
    const pIns = wrap.querySelector('#vi-pane-ins'), pCap = wrap.querySelector('#vi-pane-cap');
    if (to === 'inspect') {
      tIns.className = 'vi-tab vi-tab-a-on'; tCap.className = 'vi-tab';
      pIns.style.display = ''; pCap.style.display = 'none';
    } else {
      tIns.className = 'vi-tab'; tCap.className = 'vi-tab vi-tab-b-on';
      pIns.style.display = 'none'; pCap.style.display = '';
      if (inspectOn) setInspect(false, wrap);
    }
  }

  // ── Inspect ────────────────────────────────────────────────────────────────
  function setCrosshairCursor(on) {
    if (on) {
      if (!_cursorStyle) {
        _cursorStyle = document.createElement('style');
        _cursorStyle.id = '__vi7_cursor__';
        _cursorStyle.textContent = '* { cursor: crosshair !important; }';
        document.documentElement.appendChild(_cursorStyle);
      }
    } else {
      if (_cursorStyle) { _cursorStyle.remove(); _cursorStyle = null; }
    }
  }

  function toggleInspect(wrap) { setInspect(!inspectOn, wrap); }
  function setInspect(on, wrap) {
    inspectOn = on;
    wrap.querySelector('#vi-btn-i').classList.toggle('on-a', on);
    wrap.querySelector('#vi-ins-hint').style.display = on ? '' : 'none';
    setCrosshairCursor(on);
    if (!on) removeHoverHl();
  }

  function onDocMove(e) {
    if (mode !== 'sidebar' || !inspectOn) return;
    if (isInSidebar(e)) { removeHoverHl(); return; }
    showHoverHl(e.target);
  }

  function onDocClick(e) {
    if (mode !== 'sidebar' || !inspectOn) return;
    if (isInSidebar(e)) return;
    e.preventDefault(); e.stopPropagation();
    const el = (e.composedPath && e.composedPath()[0]) || e.target;
    if (!el || el === document || el === document.documentElement) return;
    const info = getInfo(el);
    const idx  = selections.findIndex(s => s.info.selector === info.selector);
    if (idx !== -1) selections.splice(idx, 1);
    else { if (selections.length >= MAX) selections.shift(); selections.push({ info, req:'' }); }
    updateSelHls(); renderInsPanel();
  }

  function isInSidebar(e) {
    if (!sidebarHost) return false;
    if (!e.composedPath) return e.target === sidebarHost || sidebarHost.contains(e.target);
    return e.composedPath().includes(sidebarHost);
  }

  function showHoverHl(el) {
    if (!el || el === document.documentElement || el === document.body) { removeHoverHl(); return; }
    if (!hoverHl) {
      hoverHl = document.createElement('div');
      Object.assign(hoverHl.style, { position:'fixed', pointerEvents:'none', zIndex:'2147483646', outline:'2px solid rgba(245,158,11,.85)', outlineOffset:'1px', background:'rgba(245,158,11,.06)', transition:'left .05s,top .05s,width .05s,height .05s', borderRadius:'1px' });
      document.documentElement.appendChild(hoverHl);
    }
    const r = el.getBoundingClientRect();
    Object.assign(hoverHl.style, { display:'block', left:r.left+'px', top:r.top+'px', width:r.width+'px', height:r.height+'px' });
  }
  function removeHoverHl() { if (hoverHl) hoverHl.style.display = 'none'; }

  function updateSelHls() {
    selHls.forEach(el => el.remove()); selHls = []; selHlElRefs = [];
    selections.forEach((sel, i) => {
      let el = null;
      if (sel.info.selector) { try { el = document.querySelector(sel.info.selector); } catch(e) {} }
      const r = el ? el.getBoundingClientRect() : sel.info.rect;
      const hl = document.createElement('div');
      Object.assign(hl.style, { position:'fixed', pointerEvents:'none', zIndex:'2147483645', outline:`2px solid ${SEL_COLORS[i]}`, outlineOffset:'2px', background:'transparent', left:r.left+'px', top:r.top+'px', width:r.width+'px', height:r.height+'px', borderRadius:'1px' });
      document.documentElement.appendChild(hl); selHls.push(hl);
      const badge = document.createElement('div');
      Object.assign(badge.style, { position:'fixed', pointerEvents:'none', zIndex:'2147483645', left:r.left+'px', top:Math.max(0,r.top-18)+'px', background:SEL_COLORS[i], color:'#000', fontSize:'10px', fontWeight:'700', padding:'1px 5px', borderRadius:'3px', fontFamily:'-apple-system,"Inter",sans-serif', lineHeight:'14px' });
      badge.textContent = i+1;
      document.documentElement.appendChild(badge); selHls.push(badge);
      if (el) selHlElRefs.push({ el, hlEl:hl, badgeEl:badge });
    });
  }
  function removeSelHls() { selHls.forEach(el => el.remove()); selHls = []; selHlElRefs = []; }

  function onPageScroll() {
    if (mode !== 'sidebar' || !selHlElRefs.length) return;
    if (scrollRAF) cancelAnimationFrame(scrollRAF);
    scrollRAF = requestAnimationFrame(() => {
      selHlElRefs.forEach(({ el, hlEl, badgeEl }) => {
        const r = el.getBoundingClientRect();
        Object.assign(hlEl.style,    { left:r.left+'px', top:r.top+'px', width:r.width+'px', height:r.height+'px' });
        Object.assign(badgeEl.style, { left:r.left+'px', top:Math.max(0,r.top-18)+'px' });
      });
    });
  }

  function renderInsPanel() {
    if (!sidebarSR) return;
    const empty = sidebarSR.querySelector('#vi-ins-empty');
    const list  = sidebarSR.querySelector('#vi-sel-list');
    const ai    = sidebarSR.querySelector('#vi-ins-ai');
    const has   = selections.length > 0;
    empty.style.display = has ? 'none' : ''; ai.style.display = has ? '' : 'none';
    list.innerHTML = selections.map((sel, i) => {
      const d = sel.info, hasSrc = d.file && d.file !== 'unknown' && d.file !== 'null';
      return `<div class="vi-card">
        <div class="vi-cnum" style="background:${SEL_COLORS[i]};color:#000">${i+1}</div>
        <button class="vi-cdel" data-idx="${i}">✕</button>
        <div class="vi-chead">&lt;${esc(d.component)}&gt;</div>
        ${hasSrc ? `<div class="vi-csrc">${esc(d.file)}:${d.line}</div>` : ''}
        <div class="vi-row"><span class="vi-lbl">Tag</span><span class="vi-val">${d.tag}${d.parentTag?' ‹ '+d.parentTag:''}</span></div>
        ${d.textContent ? `<div class="vi-row"><span class="vi-lbl">Text</span><span class="vi-val">${esc(d.textContent)}</span></div>` : ''}
        <div class="vi-row"><span class="vi-lbl">Classes</span><span class="vi-val vi-amber">${esc(d.fullClasses||'—')}</span></div>
        <div class="vi-row"><span class="vi-lbl">Size</span><span class="vi-val">${d.size}</span></div>
        <textarea class="vi-ta" data-idx="${i}" placeholder="Yêu cầu chỉnh sửa…">${esc(sel.req)}</textarea>
      </div>`;
    }).join('');
    list.querySelectorAll('.vi-cdel').forEach(btn => btn.addEventListener('click', () => { selections.splice(+btn.dataset.idx, 1); updateSelHls(); renderInsPanel(); }));
    list.querySelectorAll('.vi-ta').forEach(ta => ta.addEventListener('input', () => { if (selections[+ta.dataset.idx]) selections[+ta.dataset.idx].req = ta.value; updateInsCtx(); }));
    updateInsCtx();
  }
  function updateInsCtx() { const p = sidebarSR?.querySelector('#vi-ins-ctx'); if (p) p.textContent = buildInsCtx(); }
  function buildInsCtx() {
    return selections.map((sel, i) => {
      const d = sel.info, hasSrc = d.file && d.file !== 'unknown';
      let b = selections.length > 1 ? `#${i+1} ` : '';
      b += `<${d.component}>`; if (hasSrc) b += ` ${d.file}:${d.line}`; b += '\n';
      if (d.fullClasses) b += `Classes: ${d.fullClasses}\n`;
      if (d.textContent) b += `Text: "${d.textContent}"\n`;
      b += `Size: ${d.size}`; if (d.color) b += ` | Color: ${d.color}`;
      if (d.bgColor && !['#000000','#ffffff',''].includes(d.bgColor)) b += ` | Bg: ${d.bgColor}`;
      if (sel.req) b += `\nReq: ${sel.req}`;
      return b;
    }).join('\n\n');
  }

  // ── Capture trigger ────────────────────────────────────────────────────────
  function triggerCapture(resetFirst = false) {
    if (_capturing) return;
    _capturing = true;
    if (resetFirst) { screenshot = null; annotations = []; }
    showToast('📸 Đang chụp màn hình…');
    if (sidebarHost) sidebarHost.style.display = 'none';
    removeHoverHl(); removeSelHls();
    requestAnimationFrame(() => requestAnimationFrame(() => {
      try { chrome.runtime.sendMessage({ type:'CAPTURE_REQUEST' }); } catch(e) {}
    }));
    setTimeout(() => { _capturing = false; }, 5000);
  }

  function onCaptureError() {
    _capturing = false; hideToast();
    if (sidebarHost) sidebarHost.style.display = '';
    updateSelHls();
    showToast('❌ Capture thất bại — thử lại', 'error'); hideToast(2500);
  }

  function updateCaptureDoneState(imgUrl, wrap) {
    const w = wrap || sidebarSR?.querySelector('#vi-root')?.parentElement;
    if (!w) return;
    w.querySelector('#vi-cap-empty').style.display = 'none';
    w.querySelector('#vi-cap-done').style.display  = 'flex';
    const thumb = w.querySelector('#vi-thumb-img');
    if (thumb) thumb.src = imgUrl;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // FULLSCREEN ANNOTATOR
  // ══════════════════════════════════════════════════════════════════════════
  function openAnnotator(imgDataUrl) {
    _capturing = false; hideToast();
    screenshot  = imgDataUrl;
    annotations = [];           // reset khi mở ảnh mới
    annotTool   = null;
    mode        = 'annotator';
    if (sidebarHost) sidebarHost.style.display = 'none';
    updateCaptureDoneState(imgDataUrl);
    buildAnnotatorDOM(imgDataUrl);
  }

  function reopenAnnotator() {
    if (!screenshot || mode === 'annotator') return;
    annotTool = null; drawing = null;
    mode      = 'annotator';
    if (sidebarHost) sidebarHost.style.display = 'none';
    buildAnnotatorDOM(screenshot);
  }

  function buildAnnotatorDOM(imgDataUrl) {
    annotHost = document.createElement('div');
    annotHost.id = '__vi7_ann__';
    Object.assign(annotHost.style, { position:'fixed', top:'0', left:'0', width:'100%', height:'100%', zIndex:'2147483648', pointerEvents:'none', backgroundColor:'#0a0a0a' });
    document.documentElement.appendChild(annotHost);

    annotSR = annotHost.attachShadow({ mode:'open' });
    const wrap = document.createElement('div');
    wrap.style.cssText = 'width:100%;height:100%;pointer-events:auto;position:relative;';
    annotSR.appendChild(wrap);
    wrap.innerHTML = buildAnnotHTML(imgDataUrl);
    injectAnnotStyles(annotSR);
    svgEl = wrap.querySelector('#an-svg');
    bindAnnotEvents(wrap);

    const imgEl = wrap.querySelector('#an-img');
    if (imgEl) { imgEl.onload = renderSVG; if (imgEl.complete && imgEl.naturalWidth > 0) renderSVG(); }
    let rt; resH = () => { clearTimeout(rt); rt = setTimeout(renderSVG, 100); };
    window.addEventListener('resize', resH);

    const annotKeyH = e => {
      if (mode !== 'annotator') return;
      const act = annotSR.activeElement;
      if (act?.tagName === 'TEXTAREA' || act?.tagName === 'INPUT') return;
      if (e.key === 'b' || e.key === 'B') { e.preventDefault(); setAnnotTool(annotTool==='box'?null:'box', wrap); }
      if (e.key === 'a' || e.key === 'A') { e.preventDefault(); setAnnotTool(annotTool==='arrow'?null:'arrow', wrap); }
      if (e.key === 'Escape') {
        if (drawing) cancelNote(wrap);
        else if (annotTool) setAnnotTool(null, wrap);
        else closeAnnotator();
      }
    };
    document.addEventListener('keydown', annotKeyH);
    annotHost._keyH = annotKeyH;
    renderAnnList(wrap);  // render existing annotations nếu reopen
  }

  function closeAnnotator() {
    if (resH) { window.removeEventListener('resize', resH); resH = null; }
    if (annotHost?._keyH) { document.removeEventListener('keydown', annotHost._keyH); }
    removeWinDrag();
    if (annotHost) { annotHost.remove(); annotHost = annotSR = svgEl = null; }
    mode = 'sidebar';
    if (sidebarHost) {
      sidebarHost.style.display = '';
      updateSelHls();
      const wrap = sidebarSR?.querySelector('#vi-root')?.parentElement;
      if (wrap && screenshot) switchSidebarTab('capture', wrap);
    }
  }

  // ── Annotator HTML ────────────────────────────────────────────────────────
  function buildAnnotHTML(imgDataUrl) { return `
<div id="an-root">
  <div id="an-canvas-wrap">
    <img id="an-img" src="${imgDataUrl}" alt="" draggable="false"/>
    <svg id="an-svg" xmlns="http://www.w3.org/2000/svg"></svg>
  </div>
  <div id="an-panel">
    <div id="an-hdr">
      <button id="an-back">
        <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" width="12" height="12">
          <path d="M9 2L4 7L9 12" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        Inspect
      </button>
      <div id="an-logo">UI Inspector</div>
      <button id="an-x">✕</button>
    </div>
    <div id="an-tb">
      <button class="an-btn" id="an-btn-box">
        <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" width="13" height="13">
          <rect x="1.5" y="1.5" width="11" height="11" rx="1.5" stroke-dasharray="3 2"/>
        </svg>
        Box <kbd>B</kbd>
      </button>
      <button class="an-btn" id="an-btn-arr">
        <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" width="13" height="13">
          <path d="M2.5 11.5L11.5 2.5M11.5 2.5H7.5M11.5 2.5V6.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        Arrow <kbd>A</kbd>
      </button>
      <button class="an-btn an-recap" id="an-btn-recap" title="Chụp lại vùng khác">
        <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" width="12" height="12">
          <rect x="1" y="4" width="12" height="8" rx="1.5"/>
          <circle cx="7" cy="8" r="2.2"/>
          <path d="M4.5 4L5.3 2H8.7L9.5 4" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        Chụp lại
      </button>
      <button class="an-btn an-btn-ico" id="an-btn-clr" title="Xóa tất cả annotations">
        <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" width="13" height="13">
          <path d="M2 5h10M5 5V3.5h4V5M4 5l.7 7.5h4.6L10 5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
    </div>
    <div id="an-hint" class="an-hint" style="display:none">Drag trên ảnh để vẽ · Esc để bỏ tool</div>
    <div id="an-body">
      <div id="an-lim-wrap">
        <div id="an-lim-bar"><div id="an-lim-fill"></div></div>
        <span id="an-lim-lbl">0 / 3</span>
      </div>
      <div id="an-ann-list"></div>
      <div id="an-ai" class="an-ai-area" style="display:none">
        <div class="an-ai-lbl">Context for AI</div>
        <pre class="an-pre" id="an-ctx"></pre>
        <button class="an-send" id="an-send">
          <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" width="13" height="13">
            <path d="M2 7H12M8 3L12 7L8 11" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Đồng bộ IDE
        </button>
      </div>
    </div>
  </div>
</div>
<div id="an-popup" style="display:none">
  <div style="font-size:10px;text-transform:uppercase;letter-spacing:.6px;color:rgba(255,255,255,.3);font-weight:600;margin-bottom:7px;font-family:-apple-system,'Inter',sans-serif">Ghi chú (Enter lưu)</div>
  <input id="an-popup-inp" placeholder="Mô tả vùng cần sửa…" autocomplete="off"/>
  <div style="display:flex;gap:6px;margin-top:6px">
    <button id="an-popup-cancel" class="an-pop-sec" style="flex:1">Bỏ qua</button>
    <button id="an-popup-save"   class="an-pop-pri" style="flex:1">Lưu</button>
  </div>
</div>`; }

  // ── Annotator styles ──────────────────────────────────────────────────────
  function injectAnnotStyles(root) {
    const s = document.createElement('style');
    s.textContent = `
* { box-sizing:border-box; margin:0; padding:0; }
#an-root { position:fixed; top:0; left:0; width:100vw; height:100vh; display:flex; font-family:-apple-system,'Inter',sans-serif; font-size:12px; background:#0a0a0a; }
#an-canvas-wrap { flex:1; min-width:0; height:100vh; overflow:auto; position:relative; background:#141414; cursor:default; }
#an-canvas-wrap::-webkit-scrollbar { width:5px; height:5px; }
#an-canvas-wrap::-webkit-scrollbar-thumb { background:rgba(255,255,255,.15); border-radius:3px; }
#an-canvas-wrap.drawing { cursor:crosshair; }
#an-img { display:block; width:100%; height:auto; user-select:none; -webkit-user-drag:none; }
#an-svg { position:absolute; top:0; left:0; pointer-events:none; overflow:visible; z-index:3; }
#an-panel { width:300px; flex-shrink:0; height:100vh; background:#111; border-left:1px solid rgba(255,255,255,.1); display:flex; flex-direction:column; overflow:hidden; }
#an-hdr { display:flex; align-items:center; justify-content:space-between; padding:9px 12px; border-bottom:1px solid rgba(255,255,255,.08); flex-shrink:0; }
#an-logo { font-size:12px; font-weight:600; color:rgba(255,255,255,.55); }
#an-back { display:flex; align-items:center; gap:4px; background:rgba(255,255,255,.07); border:1px solid rgba(255,255,255,.12); color:rgba(255,255,255,.7); border-radius:5px; padding:4px 8px; cursor:pointer; font-size:11px; font-family:inherit; }
#an-back:hover { background:rgba(255,255,255,.12); }
#an-x { background:none; border:none; color:rgba(255,255,255,.35); cursor:pointer; font-size:14px; padding:2px 6px; border-radius:4px; line-height:1; }
#an-x:hover { background:rgba(255,255,255,.08); }
#an-tb { display:flex; align-items:center; gap:5px; padding:7px 10px; border-bottom:1px solid rgba(255,255,255,.06); flex-shrink:0; }
.an-btn { display:flex; align-items:center; gap:4px; background:rgba(255,255,255,.07); border:1px solid rgba(255,255,255,.12); color:rgba(255,255,255,.7); border-radius:6px; padding:4px 8px; cursor:pointer; font-size:11px; font-weight:500; font-family:inherit; white-space:nowrap; transition:background .15s; }
.an-btn:hover { background:rgba(255,255,255,.12); }
.an-btn.on-a { background:rgba(245,158,11,.18); border-color:rgba(245,158,11,.4); color:#f59e0b; }
.an-btn.on-b { background:rgba(96,165,250,.18); border-color:rgba(96,165,250,.4); color:#60a5fa; }
.an-btn-ico { padding:4px 7px; }
.an-recap { color:rgba(96,165,250,.8); border-color:rgba(96,165,250,.25); background:rgba(96,165,250,.08); margin-left:auto; font-size:10.5px; }
.an-recap:hover { background:rgba(96,165,250,.16); }
#an-btn-clr:hover { background:rgba(239,68,68,.12); border-color:rgba(239,68,68,.25); color:#f87171; }
.an-btn kbd { background:rgba(255,255,255,.08); border:1px solid rgba(255,255,255,.14); border-radius:3px; padding:0 4px; font-size:9.5px; color:rgba(255,255,255,.35); margin-left:1px; font-family:inherit; }
.an-hint { padding:5px 11px; font-size:10.5px; line-height:1.4; flex-shrink:0; background:rgba(245,158,11,.07); color:rgba(245,158,11,.8); border-bottom:1px solid rgba(245,158,11,.1); }
#an-body { flex:1; overflow-y:auto; padding:10px; display:flex; flex-direction:column; gap:8px; }
#an-body::-webkit-scrollbar { width:3px; }
#an-body::-webkit-scrollbar-thumb { background:rgba(255,255,255,.15); border-radius:2px; }
#an-lim-wrap { display:flex; align-items:center; gap:8px; flex-shrink:0; }
#an-lim-bar { flex:1; height:3px; background:rgba(255,255,255,.08); border-radius:2px; overflow:hidden; }
#an-lim-fill { height:100%; width:0; border-radius:2px; transition:width .2s,background .2s; background:#4ade80; }
#an-lim-lbl { font-size:9.5px; color:rgba(255,255,255,.3); white-space:nowrap; }
#an-ann-list { display:flex; flex-direction:column; gap:4px; }
.an-ann-item { display:flex; align-items:center; gap:5px; padding:5px 7px; background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.06); border-radius:5px; }
.an-badge { width:15px; height:15px; border-radius:3px; display:flex; align-items:center; justify-content:center; font-size:9px; font-weight:700; flex-shrink:0; }
.an-badge.box   { background:rgba(245,158,11,.2); color:#f59e0b; }
.an-badge.arrow { background:rgba(96,165,250,.2); color:#60a5fa; }
.an-note { flex:1; font-size:10px; color:rgba(255,255,255,.5); line-height:1.4; word-break:break-word; }
.an-del { background:none; border:none; color:rgba(255,255,255,.2); cursor:pointer; font-size:11px; padding:1px 3px; border-radius:2px; line-height:1; flex-shrink:0; }
.an-del:hover { color:#f87171; }
.an-ai-area { flex-shrink:0; background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.07); border-radius:7px; padding:8px; }
.an-ai-lbl { font-size:9.5px; text-transform:uppercase; letter-spacing:.6px; color:rgba(255,255,255,.28); font-weight:600; margin-bottom:4px; }
.an-pre { background:rgba(0,0,0,.3); border:1px solid rgba(255,255,255,.05); border-radius:3px; padding:5px 7px; font-size:9.5px; font-family:'SF Mono','Menlo',monospace; color:rgba(255,255,255,.45); white-space:pre-wrap; word-break:break-all; max-height:90px; overflow-y:auto; line-height:1.4; margin-bottom:5px; }
.an-send { display:flex; align-items:center; justify-content:center; gap:4px; width:100%; height:28px; border-radius:5px; border:none; background:rgba(96,165,250,.85); color:#000; font-size:11px; font-weight:600; font-family:inherit; cursor:pointer; }
.an-send:hover { background:#60a5fa; }
.an-send:disabled { opacity:.5; cursor:default; }
.vi-box-r   { fill:rgba(245,158,11,.1); stroke:rgba(245,158,11,.9); stroke-width:2; stroke-dasharray:5 3; }
.vi-box-bg  { fill:rgba(0,0,0,.65); }
.vi-box-lbl { fill:rgba(245,158,11,.95); font-family:-apple-system,'Inter',sans-serif; font-size:11px; font-weight:600; }
.vi-arr-ln  { stroke:rgba(96,165,250,.9); stroke-width:2.5; fill:none; }
.vi-arr-hd  { fill:rgba(96,165,250,.9); }
.vi-arr-bg  { fill:rgba(0,0,0,.6); }
.vi-arr-lbl { fill:rgba(96,165,250,.9); font-family:-apple-system,'Inter',sans-serif; font-size:11px; font-weight:500; }
#an-popup { position:fixed; z-index:2147483647; background:#1c1c1c; border:1px solid rgba(255,255,255,.15); border-radius:8px; padding:11px; width:240px; box-shadow:0 8px 24px rgba(0,0,0,.7); }
#an-popup-inp { width:100%; background:rgba(255,255,255,.08); border:1px solid rgba(255,255,255,.15); border-radius:5px; padding:6px 8px; color:rgba(255,255,255,.85); font-size:12px; font-family:-apple-system,'Inter',sans-serif; outline:none; line-height:1.5; }
#an-popup-inp:focus { border-color:rgba(245,158,11,.4); }
.an-pop-sec { display:flex; align-items:center; justify-content:center; height:28px; border-radius:5px; border:1px solid rgba(255,255,255,.15); background:transparent; color:rgba(255,255,255,.5); cursor:pointer; font-size:11px; font-family:-apple-system,'Inter',sans-serif; }
.an-pop-pri { display:flex; align-items:center; justify-content:center; height:28px; border-radius:5px; border:none; background:rgba(245,158,11,.85); color:#000; cursor:pointer; font-size:11px; font-weight:600; font-family:-apple-system,'Inter',sans-serif; }`;
    root.appendChild(s);
  }

  // ── Annotator events ──────────────────────────────────────────────────────
  function bindAnnotEvents(wrap) {
    const $ = id => wrap.querySelector('#'+id);
    $('an-back').addEventListener('click', closeAnnotator);
    $('an-x').addEventListener('click', closeAll);
    $('an-btn-box').addEventListener('click', () => setAnnotTool(annotTool==='box'?null:'box', wrap));
    $('an-btn-arr').addEventListener('click', () => setAnnotTool(annotTool==='arrow'?null:'arrow', wrap));
    $('an-btn-recap').addEventListener('click', () => {
      // Đóng annotator, reset state, mở capture lại
      closeAnnotatorSilent();
      triggerCapture(true); // true = reset screenshot + annotations
    });
    $('an-btn-clr').addEventListener('click', () => { annotations = []; renderSVG(); renderAnnList(wrap); });
    $('an-send').addEventListener('click', () => sendToIDE('capture'));
    $('an-popup-save').addEventListener('click', () => commitNote(wrap));
    $('an-popup-cancel').addEventListener('click', () => cancelNote(wrap));
    $('an-popup-inp').addEventListener('keydown', e => {
      if (e.key === 'Enter')  { e.preventDefault(); commitNote(wrap); }
      if (e.key === 'Escape') { cancelNote(wrap); }
    });
    $('an-canvas-wrap').addEventListener('mousedown', e => onCanvasDown(e, wrap));
  }

  // Đóng annotator DOM mà không switch sidebar tab (dùng khi capture lại)
  function closeAnnotatorSilent() {
    if (resH) { window.removeEventListener('resize', resH); resH = null; }
    if (annotHost?._keyH) { document.removeEventListener('keydown', annotHost._keyH); }
    removeWinDrag();
    if (annotHost) { annotHost.remove(); annotHost = annotSR = svgEl = null; }
    mode = 'sidebar';
  }

  function setAnnotTool(t, wrap) {
    annotTool = t;
    wrap.querySelector('#an-btn-box')?.classList.toggle('on-a', t==='box');
    wrap.querySelector('#an-btn-arr')?.classList.toggle('on-b', t==='arrow');
    const cw = wrap.querySelector('#an-canvas-wrap');
    if (cw) cw.classList.toggle('drawing', !!t);
    const hint = wrap.querySelector('#an-hint');
    if (hint) hint.style.display = t ? '' : 'none';
  }

  function onCanvasDown(e, wrap) {
    if (!annotTool || e.button !== 0) return;
    e.preventDefault();
    const { rx, ry } = toRatio(e.clientX, e.clientY);
    drawing = { id:uid(), type:annotTool, x1:rx, y1:ry, x2:rx, y2:ry, note:'' };
    removeWinDrag();
    winMM = ev => {
      if (!drawing) return;
      const { rx:rx2, ry:ry2 } = toRatio(ev.clientX, ev.clientY);
      drawing.x2 = clamp(rx2); drawing.y2 = clamp(ry2); renderSVG();
    };
    winMU = ev => {
      removeWinDrag();
      if (!drawing) return;
      const { rx:rx2, ry:ry2 } = toRatio(ev.clientX, ev.clientY);
      drawing.x2 = clamp(rx2); drawing.y2 = clamp(ry2);
      const img = annotSR?.querySelector('#an-img');
      const W = img?.offsetWidth||1, H = img?.offsetHeight||1;
      const dx = Math.abs(drawing.x2-drawing.x1)*W, dy = Math.abs(drawing.y2-drawing.y1)*H;
      if (Math.sqrt(dx*dx+dy*dy) < 6) { drawing = null; renderSVG(); return; }
      const popup = annotSR?.querySelector('#an-popup');
      if (popup) {
        popup.style.left = Math.min(ev.clientX+12, window.innerWidth-252)+'px';
        popup.style.top  = Math.min(ev.clientY+12, window.innerHeight-110)+'px';
        popup.style.display = 'block';
        const inp = annotSR.querySelector('#an-popup-inp');
        if (inp) { inp.value = ''; setTimeout(() => inp.focus(), 30); }
      }
    };
    window.addEventListener('mousemove', winMM);
    window.addEventListener('mouseup',   winMU);
  }

  function toRatio(clientX, clientY) {
    const img = annotSR?.querySelector('#an-img');
    if (!img) return { rx:0, ry:0 };
    const r = img.getBoundingClientRect();
    return { rx:clamp((clientX-r.left)/r.width), ry:clamp((clientY-r.top)/r.height) };
  }

  function renderSVG() {
    if (!svgEl) return;
    const img = annotSR?.querySelector('#an-img');
    if (!img || !img.offsetWidth) return;
    const W = img.offsetWidth, H = img.offsetHeight;
    const items = [...annotations, ...(drawing ? [drawing] : [])];
    let html = '';
    items.forEach(ann => {
      const x1=ann.x1*W, y1=ann.y1*H, x2=ann.x2*W, y2=ann.y2*H;
      const num = annotations.indexOf(ann) !== -1 ? annotations.indexOf(ann)+1 : '…';
      if (ann.type === 'box') {
        const bx=Math.min(x1,x2), by=Math.min(y1,y2), bw=Math.abs(x2-x1), bh=Math.abs(y2-y1);
        const lbl = ann.note ? `#${num} ${ann.note.slice(0,22)}` : `#${num}`;
        html += `<rect class="vi-box-r" x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="2"/>
          <rect class="vi-box-bg" x="${bx+2}" y="${by-14}" width="${lbl.length*5.6+4}" height="13" rx="2"/>
          <text class="vi-box-lbl" x="${bx+4}" y="${by-3}">${escXml(lbl)}</text>`;
      } else if (ann.type === 'arrow') {
        const dx=x2-x1, dy=y2-y1, len=Math.sqrt(dx*dx+dy*dy);
        if (len < 2) return;
        const ux=dx/len, uy=dy/len, hl=Math.min(12,len*.3), hw=hl*.45;
        const hx1=x2-ux*hl-uy*hw, hy1=y2-uy*hl+ux*hw, hx2=x2-ux*hl+uy*hw, hy2=y2-uy*hl-ux*hw;
        const mx=(x1+x2)/2, my=(y1+y2)/2;
        const lbl = ann.note ? `#${num} ${ann.note.slice(0,22)}` : `#${num}`;
        html += `<line class="vi-arr-ln" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>
          <polygon class="vi-arr-hd" points="${x2},${y2} ${hx1},${hy1} ${hx2},${hy2}"/>
          <rect class="vi-arr-bg" x="${mx-2}" y="${my-13}" width="${lbl.length*5.4+4}" height="12" rx="2"/>
          <text class="vi-arr-lbl" x="${mx+2}" y="${my-3}">${escXml(lbl)}</text>`;
      }
    });
    svgEl.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svgEl.setAttribute('width',  W+''); svgEl.setAttribute('height', H+'');
    svgEl.innerHTML = html;
  }

  function commitNote(wrap) {
    if (!drawing) return;
    const inp = annotSR?.querySelector('#an-popup-inp');
    drawing.note = inp?.value.trim() || '';
    if (annotations.length >= MAX) annotations.shift();
    annotations.push({ ...drawing }); drawing = null;
    annotSR?.querySelector('#an-popup') && (annotSR.querySelector('#an-popup').style.display = 'none');
    renderSVG(); renderAnnList(wrap);
  }
  function cancelNote(wrap) {
    drawing = null;
    const p = annotSR?.querySelector('#an-popup');
    if (p) p.style.display = 'none';
    renderSVG();
  }

  function renderAnnList(wrap) {
    if (!wrap) return;
    const list = wrap.querySelector('#an-ann-list');
    const fill = wrap.querySelector('#an-lim-fill');
    const lbl  = wrap.querySelector('#an-lim-lbl');
    const ai   = wrap.querySelector('#an-ai');
    const pre  = wrap.querySelector('#an-ctx');
    const n    = annotations.length;
    if (fill) { fill.style.width = (n/MAX*100)+'%'; fill.style.background = n>=MAX?'#f87171':n>=2?'#fb923c':'#4ade80'; }
    if (lbl)  lbl.textContent = `${n} / ${MAX}`;
    if (ai)   ai.style.display = n > 0 ? '' : 'none';
    if (pre)  pre.textContent  = buildCapCtx();
    if (!list) return;
    list.innerHTML = annotations.map(a => `
      <div class="an-ann-item">
        <span class="an-badge ${a.type}">${a.type==='box'?'□':'→'}</span>
        <span class="an-note">${esc(a.note||'(no note)')}</span>
        <button class="an-del" data-id="${a.id}">✕</button>
      </div>`).join('');
    list.querySelectorAll('.an-del').forEach(btn => btn.addEventListener('click', () => {
      annotations = annotations.filter(a => a.id !== btn.dataset.id);
      renderSVG(); renderAnnList(wrap);
    }));
  }

  function buildCapCtx() {
    // Header: URL + title của trang đang đứng khi chụp
    const pageUrl   = window.location.href;
    const pageTitle = document.title || '';
    let b = `Page: ${pageUrl}\n`;
    if (pageTitle) b += `Title: ${pageTitle}\n`;
    b += '\n';
    if (!annotations.length) { return b.trimEnd(); }
    b += `Annotations (${annotations.length}):\n`;
    annotations.forEach((a,i) => { b += `${i+1}. [${a.type.toUpperCase()}] ${a.note||'(no note)'}\n`; });
    return b.trimEnd();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CLOSE ALL
  // ══════════════════════════════════════════════════════════════════════════
  function closeAll() {
    if (resH) { window.removeEventListener('resize', resH); resH = null; }
    if (annotHost?._keyH) { document.removeEventListener('keydown', annotHost._keyH); }
    removeWinDrag();
    if (annotHost) { annotHost.remove(); annotHost = annotSR = svgEl = null; }
    closeSidebar();
    hideToast(); setCrosshairCursor(false);
    if (hoverHl) { hoverHl.remove(); hoverHl = null; }
    mode = 'closed'; inspectOn = false; annotTool = null;
    selections = []; screenshot = null; annotations = [];
    drawing = null; cachedPort = null; _capturing = false;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MCP SEND
  // ══════════════════════════════════════════════════════════════════════════
  async function findPort(force = false) {
    if (!force && cachedPort) return cachedPort;

    // Cooldown: nếu scan thất bại trong vòng 10s, không scan lại ngay
    // → tránh spam 11 ERR_CONNECTION_REFUSED vào console mỗi lần bấm nút
    const now = Date.now();
    if (!force && _lastScanFailed && (now - _lastScanFailed) < 10000) return null;

    const PORTS = Array.from({ length:11 }, (_,i) => 49210+i);
    try {
      const found = await Promise.any(PORTS.map(p => new Promise((res,rej) => {
        const ctrl = new AbortController();
        const t = setTimeout(() => { ctrl.abort(); rej(); }, 800);
        fetch(`http://127.0.0.1:${p}/health`, { signal:ctrl.signal })
          .then(r => { clearTimeout(t); r.ok ? res(p) : rej(); })
          .catch(() => { clearTimeout(t); rej(); });
      })));
      cachedPort = found; _lastScanFailed = 0; updateDot('connected'); return found;
    } catch {
      cachedPort = null; _lastScanFailed = Date.now(); updateDot('error'); return null;
    }
  }

  async function sendToIDE(which) {
    const btnEl = which === 'inspect' ? sidebarSR?.querySelector('#vi-send-ins') : annotSR?.querySelector('#an-send');
    if (!btnEl) return;
    btnEl.disabled = true; btnEl.textContent = 'Đang gửi…';
    const payload = which === 'inspect'
      ? { context:buildInsCtx(), selections:selections.map(s => ({...s.info, requirement:s.req})) }
      : { context:buildCapCtx(), annotations:annotations.map(a => ({type:a.type, note:a.note})), screenshot: screenshot, pageUrl: window.location.href };
    for (let attempt = 0; attempt < 2; attempt++) {
      const port = await findPort(attempt > 0);
      if (!port) continue;
      try {
        const res = await fetch(`http://127.0.0.1:${port}/api/vibe-context`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
        if (!res.ok) throw new Error('http_'+res.status);
        btnEl.textContent = '✓ Đã đồng bộ!'; btnEl.style.background='#22c55e'; btnEl.style.color='#000';
        setTimeout(() => resetSend(btnEl), 2000); return;
      } catch { cachedPort = null; updateDot('error'); }
    }
    btnEl.textContent = '❌ Không tìm thấy server'; btnEl.style.background='#ef4444';
    setTimeout(() => resetSend(btnEl), 2500);
  }

  function resetSend(btn) {
    btn.disabled=false; btn.style.background=''; btn.style.color='';
    btn.innerHTML = `<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" width="13" height="13"><path d="M2 7H12M8 3L12 7L8 11" stroke-linecap="round" stroke-linejoin="round"/></svg> Đồng bộ IDE`;
  }

  function updateDot(state) {
    const dot = sidebarSR?.querySelector('#vi-dot');
    if (!dot) return;
    const c = { unknown:'rgba(255,255,255,.2)', checking:'#fb923c', connected:'#4ade80', error:'#f87171' };
    const t = { unknown:'IDE: chưa kiểm tra', connected:'IDE: đã kết nối', error:'IDE: không tìm thấy' };
    dot.style.background = c[state]||c.unknown; dot.title = t[state]||'';
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TOAST
  // ══════════════════════════════════════════════════════════════════════════
  function showToast(msg, type='loading') {
    if (!toastEl) {
      const kf = document.createElement('style');
      kf.textContent = `@keyframes __vi_p__{0%,100%{transform:translateX(-50%) scale(1)}50%{transform:translateX(-50%) scale(1.04)}}`;
      document.documentElement.appendChild(kf);
      toastEl = document.createElement('div');
      toastEl.style.cssText = 'position:fixed!important;bottom:24px!important;left:50%!important;transform:translateX(-50%)!important;z-index:2147483649!important;pointer-events:none!important;font-family:-apple-system,"Inter",sans-serif!important;font-size:12.5px!important;font-weight:600!important;color:#000!important;padding:8px 20px!important;border-radius:20px!important;white-space:nowrap!important;display:none!important;';
      document.documentElement.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.style.setProperty('background', type==='error'?'rgba(239,68,68,.95)':'rgba(245,158,11,.97)', 'important');
    toastEl.style.setProperty('animation', type==='loading'?'__vi_p__ 1.4s ease-in-out infinite':'none', 'important');
    toastEl.style.setProperty('display', 'block', 'important');
  }
  function hideToast(delay=0) {
    if (!toastEl) return;
    if (delay > 0) setTimeout(() => { if (toastEl) toastEl.style.setProperty('display','none','important'); }, delay);
    else toastEl.style.setProperty('display', 'none', 'important');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ELEMENT INFO + STABLE SELECTOR
  // ══════════════════════════════════════════════════════════════════════════
  function getStableSelector(el) {
    if (!el || el.nodeType !== 1) return null;
    if (el.dataset?.testid) return `[data-testid="${el.dataset.testid}"]`;
    if (el.dataset?.vibeLoc) return `[data-vibe-loc="${el.dataset.vibeLoc}"]`;
    if (el.id) {
      try { if (document.querySelectorAll('#'+CSS.escape(el.id)).length === 1) return '#'+CSS.escape(el.id); } catch(e) {}
    }
    const aria = el.getAttribute('aria-label');
    if (aria) { try { if (document.querySelectorAll(`[aria-label="${aria.replace(/"/g,'\\"')}"]`).length===1) return `[aria-label="${aria.replace(/"/g,'\\"')}"]`; } catch(e) {} }
    const name = el.getAttribute('name');
    if (name) { try { if (document.querySelectorAll(`[name="${name}"]`).length===1) return `[name="${name}"]`; } catch(e) {} }
    const path = []; let cur = el;
    while (cur && cur.nodeType===1 && cur !== document.documentElement) {
      const tag = cur.tagName.toLowerCase();
      const sibs = cur.parentNode ? Array.from(cur.parentNode.children).filter(n=>n.tagName===cur.tagName) : [];
      path.unshift(sibs.length>1 ? `${tag}:nth-of-type(${sibs.indexOf(cur)+1})` : tag);
      cur = cur.parentElement;
      if (cur === document.body) { path.unshift('body'); break; }
    }
    return path.join(' > ') || el.tagName.toLowerCase();
  }

  function rgb2hex(rgb) {
    const m = rgb?.match(/\d+/g);
    if (!m) return '';
    return '#'+m.slice(0,3).map(n=>parseInt(n).toString(16).padStart(2,'0')).join('');
  }

  function getSourceInfo(el) {
    if (el.dataset?.vibeLoc) { const p=el.dataset.vibeLoc.split(':'); if (p.length>=2) return {file:p[0],line:p[1]}; }
    const fk = Object.keys(el).find(k=>k.startsWith('__reactFiber')||k.startsWith('__reactInternalInstance'));
    if (fk) {
      let node=el[fk];
      while(node) {
        if (node._debugSource) { const f=node._debugSource.fileName||''; return {file:f.replace(/^.*\/src\//,'src/').replace(/^.*\/app\//,'app/'),line:node._debugSource.lineNumber}; }
        if (node._debugOwner?._debugSource) { const f=node._debugOwner._debugSource.fileName||''; return {file:f.replace(/^.*\/src\//,'src/').replace(/^.*\/app\//,'app/'),line:node._debugOwner._debugSource.lineNumber}; }
        node=node.return;
      }
    }
    if (el.__vite_source) return {file:el.__vite_source.file,line:el.__vite_source.line};
    if (el.dataset?.file)  return {file:el.dataset.file,line:el.dataset.line};
    return null;
  }

  function getComponentName(el) {
    const fk = Object.keys(el).find(k=>k.startsWith('__reactFiber')||k.startsWith('__reactInternalInstance'));
    if (!fk) return null;
    let n=el[fk];
    while(n) {
      if (n.type&&typeof n.type==='function'&&n.type.name&&!/^[a-z]/.test(n.type.name)) return n.type.name;
      if (n._debugOwner?.type&&typeof n._debugOwner.type==='function'&&n._debugOwner.type.name) return n._debugOwner.type.name;
      n=n.return;
    }
    return null;
  }

  function getInfo(el) {
    const r=el.getBoundingClientRect(), cs=window.getComputedStyle(el);
    const cn=getComponentName(el)||el.dataset?.component||el.tagName.toLowerCase();
    const src=getSourceInfo(el);
    const cls=Array.from(el.classList).filter(c=>!c.startsWith('__vi')).join(' ');
    const stableSel=getStableSelector(el);
    const ff=cs.fontFamily?.split(',')[0]?.trim().replace(/['"]/g,'')||'';
    let txt=(el.innerText||el.textContent||'').trim();
    if (txt.length>80) txt=txt.slice(0,80)+'…';
    return {
      component:cn, tag:el.tagName.toLowerCase(),
      file:src?.file||null, line:src?.line||null,
      selector:stableSel, fullClasses:cls, textContent:txt,
      parentTag:el.parentElement?.tagName.toLowerCase()||null,
      size:Math.round(r.width)+'x'+Math.round(r.height)+'px',
      color:rgb2hex(cs.color), bgColor:rgb2hex(cs.backgroundColor),
      fontFamily:ff, fontSize:cs.fontSize||'', rect:r,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // UTILS
  // ══════════════════════════════════════════════════════════════════════════
  function removeWinDrag() {
    if (winMM) { window.removeEventListener('mousemove', winMM); winMM=null; }
    if (winMU) { window.removeEventListener('mouseup',   winMU); winMU=null; }
  }
  function uid()    { return Math.random().toString(36).slice(2,8); }
  function clamp(v) { return Math.max(0,Math.min(1,v)); }
  function esc(s)   { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function escXml(s){ return esc(s).replace(/"/g,'&quot;'); }

})();