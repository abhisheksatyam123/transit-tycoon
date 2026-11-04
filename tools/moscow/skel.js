/**
 * Rail de-duplication helpers: Zhang-Suen thinning of a binary tile mask and tracing of the
 * skeleton into polylines (node-to-node edges and closed loops).
 */

/**
 * Zhang-Suen thinning. Input and output are Uint8Array masks of w*h (1 = foreground).
 * @param {Uint8Array} src mask (not modified)
 * @param {number} w width
 * @param {number} h height
 * @returns {Uint8Array} thinned mask
 */
export function thin(src, w, h) {
  const m = Uint8Array.from(src);
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : m[y * w + x]);
  let changed = true;
  while (changed) {
    changed = false;
    for (let pass = 0; pass < 2; pass++) {
      const del = [];
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (!m[y * w + x]) continue;
        const p2 = at(x, y - 1), p3 = at(x + 1, y - 1), p4 = at(x + 1, y), p5 = at(x + 1, y + 1);
        const p6 = at(x, y + 1), p7 = at(x - 1, y + 1), p8 = at(x - 1, y), p9 = at(x - 1, y - 1);
        const B = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
        if (B < 2 || B > 6) continue;
        const seq = [p2, p3, p4, p5, p6, p7, p8, p9, p2];
        let A = 0;
        for (let i = 0; i < 8; i++) if (!seq[i] && seq[i + 1]) A++;
        if (A !== 1) continue;
        if (pass === 0) { if (p2 * p4 * p6 || p4 * p6 * p8) continue; }
        else if (p2 * p4 * p8 || p2 * p6 * p8) continue;
        del.push(y * w + x);
      }
      for (const i of del) m[i] = 0;
      if (del.length) changed = true;
    }
  }
  return m;
}

const NB = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];

/**
 * Trace a thinned mask into polylines of integer points. Each polyline runs node-to-node
 * (nodes = pixels with degree != 2) or is a closed loop through a degree-2 ring.
 * @param {Uint8Array} sk skeleton mask
 * @param {number} w width
 * @param {number} h height
 * @returns {Array<Array<{x:number,y:number}>>}
 */
export function tracePolylines(sk, w, h) {
  const on = (i) => sk[i] === 1;
  const neigh = (i) => {
    const x = i % w, y = (i - x) / w, res = [];
    for (const [dx, dy] of NB) {
      const X = x + dx, Y = y + dy;
      if (X >= 0 && Y >= 0 && X < w && Y < h && on(Y * w + X)) res.push(Y * w + X);
    }
    return res;
  };
  const deg = new Map();
  const pix = [];
  for (let i = 0; i < sk.length; i++) if (on(i)) { pix.push(i); deg.set(i, neigh(i)); }
  const isNode = (i) => deg.get(i).length !== 2;
  const used = new Set(); // undirected edges used: "a-b" keys
  const key = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);
  const lines = [];
  const toPt = (i) => ({ x: i % w, y: (i - (i % w)) / w });
  // walk from node n along neighbour b until a node is hit
  for (const n of pix) {
    if (!isNode(n)) continue;
    for (const b of deg.get(n)) {
      if (used.has(key(n, b))) continue;
      const path = [n];
      let prev = n, cur = b;
      used.add(key(n, b));
      while (true) {
        path.push(cur);
        if (isNode(cur)) break;
        const nx = deg.get(cur).find((q) => q !== prev && !used.has(key(cur, q)));
        if (nx === undefined) break;
        used.add(key(cur, nx));
        prev = cur; cur = nx;
      }
      lines.push(path.map(toPt));
    }
  }
  // closed loops made only of degree-2 pixels
  const seen = new Set();
  for (const p of pix) {
    if (isNode(p) || seen.has(p)) continue;
    const path = [p];
    seen.add(p);
    let prev = -1, cur = p;
    for (;;) {
      const nx = deg.get(cur).find((q) => q !== prev && !seen.has(q));
      if (nx === undefined) break;
      seen.add(nx); path.push(nx); prev = cur; cur = nx;
    }
    path.push(p);
    lines.push(path.map(toPt));
  }
  return lines;
}
