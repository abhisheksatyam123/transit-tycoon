/**
 * Extra viewport window: a second live view of the map with its own camera. Drag inside to pan,
 * wheel to zoom, "Copy to main view" centres the main camera here, "Copy from main view" centres this
 * view on the main camera. Opens centred where the main view is (up to MAX_EXTRA_VIEWPORTS windows).
 */
import { el } from '../dom.js';
import { Renderer } from '../../renderer/renderer.js';
import { MAX_EXTRA_VIEWPORTS, freeSlot, registerExtra, unregisterExtra, extraCount } from '../extraViewport.js';

/** Slot numbers in use by open windows (one per window). */
const usedSlots = new Map(); // slot -> window id

/**
 * Open a new extra viewport window (max MAX_EXTRA_VIEWPORTS). Returns null when full.
 * @param {import('../app.js').App} app
 */
export function openExtraViewport(app) {
  const slot = freeSlot(usedSlots.keys());
  if (slot < 0) { app.toast(`At most ${MAX_EXTRA_VIEWPORTS} extra viewports`, 'info'); return null; }
  const id = 'extraViewport' + slot;
  usedSlots.set(slot, id);
  let renderer = null;
  const win = app.wm.open(id, {
    title: `Extra viewport ${slot + 1}`,
    width: 360,
    onClose: () => {
      unregisterExtra(slot);
      usedSlots.delete(slot);
    },
    build(body) {
      const VW = 340, VH = 220;
      const cv = /** @type {HTMLCanvasElement} */ (el('canvas.ext-view', { width: VW, height: VH, style: { width: '100%', height: VH + 'px', display: 'block', cursor: 'grab', background: '#06090f', touchAction: 'none' } }));
      renderer = new Renderer(cv, app.game, { secondary: true, heights: app.renderer.heights });
      renderer.overlay = app.renderer.overlay; // same selection / catchment highlights as the main view
      renderer.showMetro = app.renderer.showMetro;
      // start where the main view is, at the main zoom
      renderer.camera.x = app.renderer.camera.x;
      renderer.camera.y = app.renderer.camera.y;
      renderer.camera.zoom = app.renderer.camera.zoom;
      registerExtra(slot, renderer);
      const btnTo = el('button.btn', { type: 'button', text: 'Copy to main view', title: 'Centre the main view on this view', onclick: () => {
        const c = renderer.camera;
        app.renderer.camera.x = c.x;
        app.renderer.camera.y = c.y;
        app.renderer.camera.clamp();
        app.follow && app.follow(null);
      } });
      const btnFrom = el('button.btn', { type: 'button', text: 'Copy from main view', title: 'Centre this view on the main view', onclick: () => {
        renderer.camera.x = app.renderer.camera.x;
        renderer.camera.y = app.renderer.camera.y;
        renderer.camera.clamp();
      } });
      const btnZoom = el('button.btn', { type: 'button', text: 'Zoom 1x', title: 'Reset this view to zoom 1', onclick: () => { renderer.camera.zoom = 1; renderer.camera.clamp(); } });
      body.append(cv, el('div.btn-row', null, btnTo, btnFrom, btnZoom));

      // drag = pan (in view-screen px), wheel = zoom at the cursor
      let drag = null;
      cv.addEventListener('pointerdown', (e) => {
        drag = { x: e.clientX, y: e.clientY };
        cv.setPointerCapture(e.pointerId);
        cv.style.cursor = 'grabbing';
      });
      cv.addEventListener('pointermove', (e) => {
        if (!drag) return;
        const rect = cv.getBoundingClientRect();
        const sx = VW / rect.width, sy = VH / rect.height; // CSS px -> canvas px
        renderer.camera.pan(-(e.clientX - drag.x) * sx, -(e.clientY - drag.y) * sy);
        drag = { x: e.clientX, y: e.clientY };
      });
      const endDrag = () => { drag = null; cv.style.cursor = 'grab'; };
      cv.addEventListener('pointerup', endDrag);
      cv.addEventListener('pointercancel', endDrag);
      cv.addEventListener('wheel', (e) => {
        e.preventDefault();
        const rect = cv.getBoundingClientRect();
        const px = (e.clientX - rect.left) * (VW / rect.width), py = (e.clientY - rect.top) * (VH / rect.height);
        renderer.camera.zoomAt(e.deltaY < 0 ? 1.25 : 0.8, px, py);
      }, { passive: false });
      // the main game can be replaced (new game / load): follow it, keeping the shared heights
      return () => {
        if (renderer.game === app.game) return;
        renderer.shareHeights(app.renderer);
        renderer.setGame(app.game);
        renderer.shareHeights(app.renderer);
      };
    },
  });
  return win;
}
