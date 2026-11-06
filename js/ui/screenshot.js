/**
 * Screenshots (OpenTTD Ctrl+S "Screenshot" and the "Whole-map screenshot" / giant screenshot).
 * - screenshotCanvas(): the main map canvas as a PNG download (no UI windows: they are DOM, not canvas).
 * - giantScreenshot(): renders the whole map at the plan's zoom (js/renderer/giantShot.js) into one
 *   offscreen canvas, strip by strip so the page keeps responding, then downloads it.
 * Render-only: the game state is read, never changed.
 */
import { Renderer } from '../renderer/renderer.js';
import { giantShotPlan, GIANT_MAX_SIDE } from '../renderer/giantShot.js';

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
