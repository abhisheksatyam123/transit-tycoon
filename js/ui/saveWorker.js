/**
 * Web Worker: packs a save (JSON envelope + LZ compression) off the main thread.
 * Protocol: in {id, meta, data} -> out {id, packed} | {id, error}.
 */
import { compress } from './lz.js';

self.onmessage = (ev) => {
  const { id, meta, data } = ev.data;
  try {
    self.postMessage({ id, packed: compress(JSON.stringify({ meta, data })) });
  } catch (err) {
    self.postMessage({ id, error: String((err && err.message) || err) });
  }
};
