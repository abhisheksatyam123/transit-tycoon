/**
 * Screenshots (OpenTTD Ctrl+S "Screenshot" and the "Whole-map screenshot" / giant screenshot).
 * - screenshotCanvas(): the main map canvas as a PNG download (no UI windows: they are DOM, not canvas).
 * - giantScreenshot(): renders the whole map at the plan's zoom (js/renderer/giantShot.js) into one
 *   offscreen canvas, strip by strip so the page keeps responding, then downloads it.
 * Render-only: the game state is read, never changed.
 */
import { Renderer } from '../renderer/renderer.js';
import { giantShotPlan, GIANT_MAX_SIDE } from '../renderer/giantShot.js';
import { MAX_ZOOM } from '../renderer/camera.js';

/** @param {string} name */
function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Date part used in screenshot file names (local date, YYYY-MM-DD). */
export function shotDate(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** @param {HTMLCanvasElement} cv @returns {Promise<Blob>} */
function toPng(cv) {
  return new Promise((resolve, reject) => cv.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encode failed'))), 'image/png'));
}

/**
 * Save the current main map view as a PNG. Renders one frame first so the canvas is current.
 * @param {import('../renderer/renderer.js').Renderer} renderer
 * @returns {Promise<string>} file name
 */
export async function screenshotCanvas(renderer) {
  const cv = renderer.canvas;
  renderer.render(0);
  const blob = await toPng(cv);
  const name = `transit-tycoon-${shotDate()}.png`;
  downloadBlob(blob, name);
  return name;
}

/** Zoom levels for the two extra screenshot menu entries (OpenTTD SC_DEFAULTZOOM / SC_ZOOMEDIN). */
export const SHOT_ZOOMS = { default: 1, zoomedIn: MAX_ZOOM };

/**
 * File name for an extra-zoom screenshot (pure): transit-tycoon-default-YYYY-MM-DD.png /
 * transit-tycoon-zoomedIn-YYYY-MM-DD.png. Unknown kind returns null (no entry).
 * @param {string} kind
 * @param {Date} [d]
 * @returns {string|null}
 */
export function zoomShotName(kind, d = new Date()) {
  if (!(kind in SHOT_ZOOMS)) return null;
  return `transit-tycoon-${kind}-${shotDate(d)}.png`;
}

/**
 * Save the current viewport at a fixed zoom as a PNG. A short-lived secondary renderer (same pattern as
 * giantScreenshot / extra viewport) draws the same camera centre at the wanted zoom into an offscreen
 * canvas of the viewport's pixel size, so the main renderer and its camera are never touched.
 * @param {import('../renderer/renderer.js').Renderer} renderer main renderer
 * @param {number} zoom
 * @param {string} kind key of SHOT_ZOOMS (used for the file name)
 * @returns {Promise<string>} file name
 */
export async function screenshotCanvasAtZoom(renderer, zoom, kind) {
  const cam = renderer.camera;
  const W = Math.max(1, Math.round(cam.viewW)), H = Math.max(1, Math.round(cam.viewH));
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const r = new Renderer(cv, renderer.game, { secondary: true, fixedView: true });
  r.shareHeights(renderer);
  r.dpr = 1;
  r.overlay = renderer.overlay; // same selection / catchment highlights as the main view
  r.showMetro = renderer.showMetro;
  const c = r.camera;
  c.setMap(renderer.game.state.map.width, renderer.game.state.map.height);
  c.zoom = zoom;
  c.viewW = W;
  c.viewH = H;
  c.x = cam.x;
  c.y = cam.y;
  c.clamp = () => {}; // the view is copied from the main camera; do not move it
  for (let i = 0; i < 400; i++) {
    r.render(0);
    if (!r.ground.pending) break;
    await new Promise((res) => setTimeout(res, 0));
  }
  const blob = await toPng(cv);
  const name = zoomShotName(kind) || zoomShotName('default');
  downloadBlob(blob, name);
  return name;
}

/**
 * Render the whole map to one PNG. Strips are drawn with the normal renderer (a hidden secondary
 * Renderer with its own camera and a canvas sized to the image) and copied out, one strip per tick.
 * @param {any} game
 * @param {import('../renderer/renderer.js').Renderer} main main renderer (heights are shared)
 * @param {{onProgress?:(f:number)=>void, maxSide?:number}} [opt]
 * @returns {Promise<{name:string, width:number, height:number, zoom:number}>}
 */
export async function giantScreenshot(game, main, opt = {}) {
  const m = game.state.map;
  let maxH = 0;
  for (const t of m.tiles) if (t.height > maxH) maxH = t.height;
  const plan = giantShotPlan({ mapW: m.width, mapH: m.height, maxHeight: maxH, maxSide: opt.maxSide || GIANT_MAX_SIDE });
  const out = document.createElement('canvas');
  out.width = plan.width;
  out.height = plan.height;
  const octx = out.getContext('2d');
  octx.fillStyle = '#06090f';
  octx.fillRect(0, 0, out.width, out.height);
  // work canvas: one strip of the output at a time, drawn at zoom = plan.zoom with dpr 1
  const strip = document.createElement('canvas');
  strip.width = plan.width;
  strip.height = Math.min(plan.height, 512);
  const r = new Renderer(strip, game, { secondary: true, fixedView: true });
  r.shareHeights(main);
  r.dpr = 1;
  const cam = r.camera;
  cam.setMap(m.width, m.height);
  cam.zoom = plan.zoom;
  // stop the camera clamp from moving the view: the plan origin lies outside the map's projected bounds
  cam.clamp = () => {};
  const z = plan.zoom;
  for (let y0 = 0; y0 < plan.height; y0 += strip.height) {
    const h = Math.min(strip.height, plan.height - y0);
    strip.height = h;
    // render() maps screen px p to world (p - viewW/2)/zoom + x, so the centre sits half a view below the strip top
    cam.viewW = strip.width;
    cam.viewH = h;
    cam.x = plan.originX + cam.viewW / 2 / z;
    cam.y = plan.originY + y0 / z + cam.viewH / 2 / z;
    // the first frames of a fresh ground cache may hold placeholder chunks: draw until none are pending
    for (let i = 0; i < 400; i++) {
      r.render(0);
      if (!r.ground.pending) break;
      await new Promise((res) => setTimeout(res, 0));
    }
    octx.drawImage(strip, 0, y0);
    if (opt.onProgress) opt.onProgress((y0 + h) / plan.height);
    await new Promise((res) => setTimeout(res, 0)); // yield to the page between strips
  }
  const blob = await toPng(out);
  const name = `transit-tycoon-map-${shotDate()}.png`;
  downloadBlob(blob, name);
  return { name, width: plan.width, height: plan.height, zoom: plan.zoom };
}
