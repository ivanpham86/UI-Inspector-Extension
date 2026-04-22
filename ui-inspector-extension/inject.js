// inject.js

(function () {
  const KEY = Symbol.for('VIBE_INSPECTOR_V3');
  if (globalThis[KEY]) return;
  globalThis[KEY] = true;

  let tool = null;
  let prevCursor = '';

  // Highlight box
  const hl = document.createElement('div');
  hl.id = '__uii_hl__';
  Object.assign(hl.style, {
    position: 'fixed', pointerEvents: 'none', zIndex: '2147483647',
    top: 0, left: 0, width: 0, height: 0,
    outline: '2px solid rgba(245,158,11,.9)', outlineOffset: '2px',
    background: 'rgba(245,158,11,.07)',
    transition: 'top .05s,left .05s,width .05s,height .05s',
    boxSizing: 'border-box', display: 'none'
  });
  document.body.appendChild(hl);

  // ── Helpers ──────────────────────────────────────────────────────────────────
  function rgb2hex(rgb) {
    const m = rgb.match(/\d+/g);
    if (!m) return '';
    return '#' + m.slice(0, 3).map(n => parseInt(n).toString(16).padStart(2, '0')).join('');
  }

  function getSourceInfo(el) {
    if (el.dataset?.vibeLoc) {
      const parts = el.dataset.vibeLoc.split(':');
      if (parts.length >= 2) return { file: parts[0], line: parts[1] };
    }
    const fk = Object.keys(el).find(k => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
    if (fk) {
      let node = el[fk];
      while (node) {
        if (node._debugSource) {
          const f = node._debugSource.fileName || '';
          return { file: f.replace(/^.*\/src\//, 'src/').replace(/^.*\/app\//, 'app/'), line: node._debugSource.lineNumber };
        }
        if (node._debugOwner?._debugSource) {
          const f = node._debugOwner._debugSource.fileName || '';
          return { file: f.replace(/^.*\/src\//, 'src/').replace(/^.*\/app\//, 'app/'), line: node._debugOwner._debugSource.lineNumber };
        }
        node = node.return;
      }
    }
    if (el.__vite_source) return { file: el.__vite_source.file, line: el.__vite_source.line };
    if (el.dataset?.file) return { file: el.dataset.file, line: el.dataset.line };
    return null;
  }

  function getCN(el) {
    const fk = Object.keys(el).find(k => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
    if (!fk) return null;
    let n = el[fk];
    while (n) {
      if (n.type && typeof n.type === 'function' && n.type.name && !/^[a-z]/.test(n.type.name)) return n.type.name;
      if (n._debugOwner?.type && typeof n._debugOwner.type === 'function' && n._debugOwner.type.name) return n._debugOwner.type.name;
      n = n.return;
    }
    return null;
  }

  function getInfo(el) {
    const r = el.getBoundingClientRect();
    const cs = window.getComputedStyle(el);
    const cn = getCN(el) || el.dataset?.component || el.tagName.toLowerCase();
    const src = getSourceInfo(el);
    const fullClasses = Array.from(el.classList).filter(c => !c.startsWith('__uii')).join(' ');
    let sel = el.tagName.toLowerCase();
    if (el.id) sel += '#' + el.id;
    if (fullClasses) sel += '.' + fullClasses.split(' ').join('.');
    const ff = cs.fontFamily?.split(',')[0]?.trim().replace(/['"]/g, '') || '';
    const fs = cs.fontSize || '';
    let textContent = (el.innerText || el.textContent || '').trim();
    if (textContent.length > 100) textContent = textContent.substring(0, 100) + '...';
    return {
      component: cn,
      tag: el.tagName.toLowerCase(),
      file: src?.file || null,
      line: src?.line || null,
      selector: sel,
      fullClasses,
      textContent,
      parentTag: el.parentElement ? el.parentElement.tagName.toLowerCase() : null,
      size: Math.round(r.width) + 'x' + Math.round(r.height) + 'px',
      color: rgb2hex(cs.color || ''),
      bgColor: rgb2hex(cs.backgroundColor || ''),
      fontFamily: ff,
      fontSize: fs,
    };
  }

  // ── Send ──────────────────────────────────────────────────────────────────────
  function sendOut(msg) {
    try { chrome.runtime.sendMessage(msg); } catch (e) {}
    if (window !== window.top) window.parent.postMessage(msg, '*');
  }

  // ── Events ────────────────────────────────────────────────────────────────────
  let lastHoverTime = 0;

  document.addEventListener('mousemove', e => {
    if (tool !== 'inspect') return;
    const now = Date.now();
    if (now - lastHoverTime < 60) return;
    lastHoverTime = now;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || el.id === '__uii_hl__') return;
    const r = el.getBoundingClientRect();
    Object.assign(hl.style, {
      display: 'block',
      top: r.top + 'px', left: r.left + 'px',
      width: r.width + 'px', height: r.height + 'px'
    });
    sendOut({ type: 'HOVER', data: getInfo(el) });
  }, { passive: true });

  document.addEventListener('click', e => {
    if (tool !== 'inspect') return;
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || el.id === '__uii_hl__') return;
    sendOut({ type: 'SELECT', data: getInfo(el) });
    setTool(null);
  }, { capture: true });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && tool === 'inspect') setTool(null);
  });

  // ── Tool state ────────────────────────────────────────────────────────────────
  function setTool(t) {
    tool = t;
    if (t === 'inspect') {
      prevCursor = document.body.style.cursor;
      document.body.style.cursor = 'crosshair';
      hl.style.display = 'block';
    } else {
      document.body.style.cursor = prevCursor || '';
      Object.assign(hl.style, { width: 0, height: 0, display: 'none' });
    }
  }

  // ── Listen from extension ─────────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'SET_TOOL') setTool(msg.tool);
  });

  window.addEventListener('message', (e) => {
    if (e.data?.type === 'SET_TOOL') setTool(e.data.tool);
  });

  try { chrome.runtime.sendMessage({ type: 'CONTENT_READY' }); } catch (e) {}
})();