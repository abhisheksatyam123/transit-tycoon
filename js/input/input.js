/**
 * Input: mouse / keyboard / touch on the world canvas -> camera movement and active tool.
 * Left button = tool (or inspect when no tool), right/middle drag = pan, wheel = zoom,
 * WASD / arrows = pan, + / - = zoom, Esc = cancel tool / close top window.
 */
import { play } from '../audio/sfx.js';
import { netActive, setNetActive } from '../renderer/net/state.js';
import { labelAt } from '../renderer/layers/labels.js';
import { openSignPrompt } from '../ui/tools/sign.js';
import { findSign } from '../simulation/cmdSign.js';
import { TRANSPARENCY_OPTIONS, loadTransparency, setTransparency } from '../renderer/transparency.js';


const PAN_SPEED = 700; // CSS px per second

/**
 * Wire input handlers.
 * @param {import('../ui/app.js').App} app
 * @param {HTMLCanvasElement} canvas
 * @param {Record<string,()=>void>} shortcuts key -> action (lower-case keys)
 * @returns {{update:(dt:number)=>void}} per-frame updater for held keys
 */
export function setupInput(app, canvas, shortcuts) {
  const held = new Set();
  let panning = false, panX = 0, panY = 0, panMoved = 0;
  let leftDown = false;
  let lastTile = { x: -1, y: -1 };
  /** @type {Map<number,{x:number,y:number}>} active touches for pinch zoom */
  const touches = new Map();
  let pinchDist = 0;

  const local = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const inMap = (t) => app.game.inBounds(t.x, t.y);

  const hover = (p) => {
    const t = app.renderer.pickTile(p.x, p.y);
    app.toasts.setCursor(p.x, p.y);
    if (!inMap(t)) {
      app.renderer.overlay.hover = null;
      return null;
    }
    app.renderer.overlay.hover = t;
    if (t.x !== lastTile.x || t.y !== lastTile.y) {
      lastTile = t;
      if (app.tool) app.tool.move(t);
    }
    return t;
  };

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  canvas.addEventListener('pointerdown', (e) => {
    canvas.focus();
    const p = local(e);
    if (e.pointerType === 'touch') {
      touches.set(e.pointerId, p);
      if (touches.size === 2) {
        const [a, b] = Array.from(touches.values());
        pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
        if (app.tool && leftDown) app.tool.cancel();
        leftDown = false;
        panning = true; panX = (a.x + b.x) / 2; panY = (a.y + b.y) / 2;
        return;
      }
    }
    // Right click with an active tool cancels the tool (OpenTTD convention); otherwise it pans.
    if (e.button === 2 && app.tool) { app.setTool(null); e.preventDefault(); return; }
    canvas.setPointerCapture(e.pointerId);
    const panButton = e.button === 1 || e.button === 2 || (e.pointerType === 'touch' && !app.tool);
    if (panButton) {
      panning = true; panX = p.x; panY = p.y; panMoved = 0;
      e.preventDefault();
      return;
    }
    if (e.button !== 0) return;
    const t = hover(p);
    if (!t) return;
    leftDown = true;
    if (app.tool) app.tool.down(t);
  });

  canvas.addEventListener('pointermove', (e) => {
    const p = local(e);
    if (e.pointerType === 'touch' && touches.has(e.pointerId)) {
      touches.set(e.pointerId, p);
      if (touches.size === 2) {
        const [a, b] = Array.from(touches.values());
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
        if (pinchDist > 0) app.renderer.camera.zoomAt(d / pinchDist, cx, cy);
        pinchDist = d;
        app.renderer.camera.pan(panX - cx, panY - cy);
        panX = cx; panY = cy;
        return;
      }
    }
    if (panning) {
      app.renderer.camera.pan(panX - p.x, panY - p.y);
      panMoved += Math.abs(panX - p.x) + Math.abs(panY - p.y);
      panX = p.x; panY = p.y;
      if (panMoved > 4) app.follow(null);
      return;
    }
    hover(p);
  });

  const release = (e) => {
    touches.delete(e.pointerId);
    if (touches.size < 2) pinchDist = 0;
    const p = local(e);
    if (panning) {
      const wasClick = panMoved < 4 && e.pointerType === 'touch' && !app.tool;
      panning = false;
      if (wasClick) click(p);
      return;
    }
    if (!leftDown) return;
    leftDown = false;
    const t = app.renderer.pickTile(p.x, p.y);
    if (app.tool) {
      const clamped = clampTile(t);
      // ctrl and the screen point let a station tool open its distant-join picker (ui/tools/joinPicker.js)
      app.tool.up({ ...clamped, ctrl: !!(e.ctrlKey || e.metaKey), cx: e.clientX, cy: e.clientY });
      lastTile = { x: -1, y: -1 };
    } else click(p);
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', (e) => {
    touches.delete(e.pointerId);
    panning = false;
    leftDown = false;
    if (app.tool) app.tool.cancel();
  });
  canvas.addEventListener('pointerleave', () => { if (!leftDown && !panning) app.renderer.overlay.hover = null; });

  /** Click with no tool: vehicle under cursor, else inspect tile. */
  const click = (p) => {
    const sign = labelAt(app.renderer.labelHits, p.x, p.y);
    if (sign && sign.kind === 'sign') { const sg = findSign(app.game.state, sign.id); if (sg) openSignPrompt(app, { id: sg.id, x: sg.x, y: sg.y }); return; }
    if (sign) { app.open(sign.kind, sign.id); return; }
    const vid = app.renderer.pickVehicle(p.x, p.y);
    if (vid !== null) { app.open('vehicle', vid); return; }
    const t = app.renderer.pickTile(p.x, p.y);
    if (inMap(t)) app.inspectTile(t.x, t.y);
  };

  /** Keep drag endpoints inside the map. */
  const clampTile = (t) => {
    const m = app.game.state.map;
    return { x: Math.max(0, Math.min(m.width - 1, t.x)), y: Math.max(0, Math.min(m.height - 1, t.y)) };
  };

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const p = local(e);
    app.renderer.camera.zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, p.x, p.y);
  }, { passive: false });

  window.addEventListener('keydown', (e) => {
    const target = /** @type {HTMLElement} */ (e.target);
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) return;
    if (e.ctrlKey && e.altKey && !e.metaKey && e.key.toLowerCase() === 'c') { // hidden cheats window (OpenTTD cheat_gui)
      e.preventDefault(); app.open('cheats'); return;
    }
    if (e.ctrlKey && !e.altKey && !e.metaKey && /^Digit[1-6]$/.test(e.code || '')) { // transparency toggles (renderer/transparency.js); Ctrl+Shift+1..6 too, browsers keep Ctrl+1..8 for tabs
      e.preventDefault();
      const opt = TRANSPARENCY_OPTIONS[Number(e.code.slice(5)) - 1];
      const on = !(loadTransparency() || {})[opt.id];
      setTransparency(opt.id, on);
      app.renderer.invalidateGround();
      app.toast?.(`${opt.label} transparency: ${on ? 'on' : 'off'}`, 'info');
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'escape') {
      if (app.tool) app.setTool(null);
      else if (!app.wm.closeTop()) app.selectStation(null);
      e.preventDefault();
      return;
    }
    if (app.tool && app.tool.key && app.tool.key(e)) { e.preventDefault(); return; }
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
      held.add(k);
      app.follow(null);
      e.preventDefault();
      return;
    }
    if (k === '+' || k === '=') { app.renderer.camera.zoomAt(1.25); return; }
    if (k === '-' || k === '_') { app.renderer.camera.zoomAt(0.8); return; }
    if (k === 'r' && !shortcuts[k]) { // smooth road/rail ribbons on/off (net renderer)
      setNetActive(!netActive());
      app.renderer.invalidateGround();
      app.toast?.(netActive() ? 'Smooth roads and rails: on' : 'Smooth roads and rails: off', 'info');
      e.preventDefault();
      return;
    }
    const fn = shortcuts[k];
    if (fn) { e.preventDefault(); play('click'); fn(); }
  });
  window.addEventListener('keyup', (e) => held.delete(e.key.toLowerCase()));
  window.addEventListener('blur', () => held.clear());

  return {
    update(dt) {
      if (!held.size) return;
      let dx = 0, dy = 0;
      if (held.has('a') || held.has('arrowleft')) dx -= 1;
      if (held.has('d') || held.has('arrowright')) dx += 1;
      if (held.has('w') || held.has('arrowup')) dy -= 1;
      if (held.has('s') || held.has('arrowdown')) dy += 1;
      if (dx || dy) app.renderer.camera.pan(dx * PAN_SPEED * dt, dy * PAN_SPEED * dt);
    },
  };
}
