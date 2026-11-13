// N8 renderer cache/perf fixes: chunk signature, area invalidation, viewport culling, cache invalidation.
import { test, expect, describe } from 'bun:test';
import {
  GroundCache, CHUNK, MAX_CHUNKS, MAX_CHUNK_PIXELS, chunkWorldRect, chunkIntersects,
} from '../js/renderer/groundCache.js';
import { Renderer } from '../js/renderer/renderer.js';
import { invalidateMetro, metroData } from '../js/renderer/layers/metro.js';
import { lm3dOverlayBuckets, invalidateLm3d } from '../js/renderer/sprites/lm3d.js';
import { LM3D } from '../js/simulation/scenarios/moscowRegistry.js';
import { getNet, invalidateNet, invalidateNetArea, invalidateNetKind, netKindsInArea } from '../js/renderer/net/index.js';

function makeMap(W = 64, H = 64) {
  const tiles = [];
  for (let i = 0; i < W * H; i++) tiles.push({ terrain: 'grass', height: 0, rail: 0, road: 0 });
  return { width: W, height: H, tiles };
}
function fakeHeights(W, H) {
  return { cw: W + 1, data: new Float32Array((W + 1) * (H + 1)) };
}
function makeCache(map) {
  const cache = new GroundCache();
  cache.reset(map, fakeHeights(map.width, map.height));
  return cache;
}

describe('ground chunk signature (N8)', () => {
  test('last chunk row hashes real content (clamped vertices, no NaN->0)', () => {
    const map = makeMap(20, 20);
    const cache = makeCache(map);
    const cy = Math.floor((map.height - 1) / CHUNK);
    const cx = Math.floor(5 / CHUNK);
    const before = cache.signature(cx, cy);
    expect(Number.isFinite(before)).toBe(true);
    expect(before).not.toBe(0); // the old out-of-grid vertex read made this constant 0

    map.tiles[19 * map.width + 5].height = 2;
    expect(cache.signature(cx, cy)).not.toBe(before);
  });

  test('signature includes tram/river/canal/lock/overBridge/playerTunnel, station part/metro, all-side halo', () => {
    const setup = (apply) => {
      const map = makeMap(64, 64); // chunk (1,1) needs real east/south neighbours
      const cache = makeCache(map);
      const base = cache.signature(1, 1);
      apply(map, map.tiles[20 * map.width + 20]);
      return [base, cache.signature(1, 1)];
    };
    const fields = {
      tram: (m, t) => { t.tram = 1; },
      river: (m, t) => { t.river = 1; },
      canal: (m, t) => { t.canal = 1; },
      lock: (m, t) => { t.lock = 2; },
      overBridge: (m, t) => { t.overBridge = 'road'; },
      playerTunnel: (m, t) => { t.playerTunnel = 1; },
      stationPart: (m, t) => { t.building = { type: 'station', kind: 'airport', part: 'runway' }; },
      stationMetro: (m, t) => { t.building = { type: 'station', kind: 'rail', metro: { color: '#ff0000' } }; },
      northWestHalo: (m) => { m.tiles[15 * m.width + 20].river = 1; }, // west neighbour of chunk (1,1)
      northHalo: (m) => { m.tiles[20 * m.width + 15].canal = 1; }, // north neighbour
      eastHalo: (m) => { m.tiles[20 * m.width + 32].tram = 1; }, // east neighbour of chunk (1,1) (x = 32)
      southHalo: (m) => { m.tiles[32 * m.width + 20].road = 1; }, // south neighbour of chunk (1,1) (y = 32)
    };
    for (const [name, fn] of Object.entries(fields)) {
      const [a, b] = setup(fn);
      expect({ name, changed: a !== b }).toEqual({ name, changed: true });
    }
    // isolate the station kind/part/metro fields: base building present, only that field changes
    const setupBase = (base, mutate) => {
      const map = makeMap(64, 64);
      const cache = makeCache(map);
      const t = map.tiles[20 * map.width + 20];
      t.building = base;
      const before = cache.signature(1, 1);
      mutate(t.building);
      return [before, cache.signature(1, 1)];
    };
    const isolated = {
      stationKind: () => setupBase({ type: 'station', kind: 'rail', part: 'runway' }, (b) => { b.kind = 'airport'; }),
      stationPart: () => setupBase({ type: 'station', kind: 'airport', part: 'runway' }, (b) => { b.part = 'apron'; }),
      stationMetro: () => setupBase({ type: 'station', kind: 'rail' }, (b) => { b.metro = { color: '#ff0000' }; }),
    };
    for (const [name, fn] of Object.entries(isolated)) {
      const [a, b] = fn();
      expect({ name, changed: a !== b }).toEqual({ name, changed: true });
    }
  });
});

describe('viewport chunk culling and memory budget (N8)', () => {
  test('chunkIntersects is exact for the chunk world rectangle', () => {
    const map = makeMap(64, 64);
    const r = chunkWorldRect(1, 1, map);
    expect(chunkIntersects(1, 1, map, { x0: r.wx + 1, y0: r.wy + 1, x1: r.wx + 2, y1: r.wy + 2 })).toBe(true);
    expect(chunkIntersects(1, 1, map, { x0: r.wx + r.ww + 5, y0: r.wy, x1: r.wx + r.ww + 50, y1: r.wy + r.wh })).toBe(false);
    expect(chunkIntersects(1, 1, map, null)).toBe(true);
  });

  test('trim evicts least-recently-drawn chunks past the count and pixel budget', () => {
    const map = makeMap(64, 64);
    const cache = new GroundCache();
    cache.reset(map, fakeHeights(64, 64));
    cache.frame = 10;
    cache.chunks = new Array(300).fill(null).map((_, i) => ({
      canvas: { width: 1, height: 1 }, ww: 2048, wh: 1312, scale: 2, sig: 1, used: i === 0 ? 10 : 1,
    }));
    cache.trim();
    expect(cache.liveCount()).toBe(MAX_CHUNKS);
    expect(cache.livePixels()).toBeLessThanOrEqual(MAX_CHUNK_PIXELS);

    // byte budget: a few oversized stale chunks are released even below the count cap
    const big = new GroundCache();
    big.reset(map, fakeHeights(64, 64));
    big.frame = 10;
    big.chunks = new Array(4).fill(null).map((_, i) => ({
      canvas: { width: 1, height: 1 }, ww: 8192, wh: 5248, scale: 2, sig: 1, used: i === 0 ? 10 : 1,
    }));
    big.trim();
    expect(big.liveCount()).toBe(1);
    expect(big.livePixels()).toBeLessThanOrEqual(MAX_CHUNK_PIXELS);
  });
});

describe('area-scoped invalidation (N8)', () => {
  test('a 1-tile invalidation marks only the intersecting chunk (+1 margin); bare call marks all', () => {
    const map = makeMap(64, 64);
    const cache = makeCache(map);
    cache.chunks = new Array(cache.cols * cache.rows).fill(null).map(() => ({ sig: 123 }));
    cache.invalidate({ x0: 20, y0: 20, x1: 20, y1: 20 });
    const dirty = cache.chunks.map((c, i) => (c.sig === -1 ? i : -1)).filter((i) => i >= 0);
    const expected = Math.floor(20 / CHUNK) + Math.floor(20 / CHUNK) * cache.cols;
    expect(dirty).toEqual([expected]);

    cache.invalidate();
    expect(cache.chunks.every((c) => c.sig === -1)).toBe(true);
  });

  test('Renderer.invalidateGround(area) scopes chunks and net kind; bare call still invalidates everything', () => {
    const map = makeMap(64, 64);
    const r = Object.create(Renderer.prototype);
    r.ground = makeCache(map);
    r.ground.chunks = new Array(r.ground.cols * r.ground.rows).fill(null).map(() => ({ sig: 7 }));
    r.game = { state: { map } };
    r.invalidateGround({ x0: 40, y0: 40, x1: 40, y1: 40 });
    expect(r.ground.chunks.filter((c) => c.sig === -1).length).toBe(1);
    r.invalidateGround();
    expect(r.ground.chunks.every((c) => c.sig === -1)).toBe(true);
  });

  test('net invalidation is per kind', () => {
    const map = makeMap(16, 16);
    map.tiles[0].rail = 2; map.tiles[1].rail = 8;
    map.tiles[32].road = 2; map.tiles[33].road = 8;
    const road = getNet(map, 'road');
    const rail = getNet(map, 'rail');
    expect(netKindsInArea(map, { x0: 0, y0: 0, x1: 0, y1: 0 })).toEqual({ road: false, rail: true });
    invalidateNetKind(map, 'rail');
    expect(getNet(map, 'road')).toBe(road);
    expect(getNet(map, 'rail')).not.toBe(rail);

    // area invalidation must also catch a removed rail tile (post-command state no longer has rail)
    const rail2 = getNet(map, 'rail');
    map.tiles[0].rail = 0; map.tiles[1].rail = 0;
    invalidateNetArea(map, { x0: 0, y0: 0, x1: 1, y1: 0 });
    expect(getNet(map, 'rail')).not.toBe(rail2);
  });

  test('industryById resolves a same-count replaced list', () => {
    const r = Object.create(Renderer.prototype);
    r.industryMap = new Map();
    r._indLen = -1;
    const a = { id: 1, type: 'coal' }, b = { id: 2, type: 'farm' };
    r.game = { state: { industries: [a, b] } };
    expect(r.industryById(1)).toBe(a);
    const c = { id: 3, type: 'iron' }, d = { id: 4, type: 'mill' };
    r.game.state.industries = [c, d];
    expect(r.industryById(3)).toBe(c);
  });
});

describe('metro and landmark cache invalidation (N8)', () => {
  test('metroData rebuilds after invalidateMetro (new tunnel edge appears)', () => {
    const tiles = [];
    for (let i = 0; i < 64; i++) tiles.push({ terrain: 'grass', height: 0 });
    const state = { map: { width: 8, height: 8, tiles }, metro: { lines: [{ color: '#ff0000' }] }, stations: [] };
    tiles[0].tunnel = 1; tiles[0].rail = 2; // east
    tiles[1].tunnel = 1; tiles[1].rail = 8; // west
    const first = metroData(state);
    expect(first.edges.length).toBe(1);
    tiles[18].tunnel = 1; tiles[18].rail = 2;
    tiles[19].tunnel = 1; tiles[19].rail = 8;
    expect(metroData(state).edges.length).toBe(1); // still cached
    invalidateMetro();
    expect(metroData(state).edges.length).toBe(2);
  });

  test('lm3dOverlayBuckets picks up an inserted overlay after the generation bump', () => {
    LM3D.n8probe = { levels: [] };
    const map = makeMap(8, 8);
    map.lm3dOverlays = [];
    expect(lm3dOverlayBuckets(map).size).toBe(0);
    map.lm3dOverlays.push({ id: 'n8probe', x: 1, y: 2 });
    invalidateLm3d();
    const buckets = lm3dOverlayBuckets(map);
    expect(buckets.get(2 * map.width + 1).map((o) => o.id)).toEqual(['n8probe']);
    delete LM3D.n8probe;
  });
});


describe('per-frame allocation reuse (N8)', () => {
  test('segScreen records are pooled across frames', () => {
    const r = Object.create(Renderer.prototype);
    r.segScreen = [];
    r._segPool = [];
    r.pushSegScreen(10, 20, 7);
    const first = r.segScreen[0];
    r.segScreen.length = 0;
    r.pushSegScreen(11, 21, 8);
    expect(r.segScreen[0]).toBe(first);
    expect(r.segScreen[0]).toEqual({ x: 11, y: 21, id: 8 });
  });
});
