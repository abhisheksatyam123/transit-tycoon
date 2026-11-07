/**
 * Web Worker: packs a save (JSON envelope + LZ compression) off the main thread.
 * Protocol (SV, streamed): {op:'begin', id, meta} -> {op:'chunk', id, data} ... -> {op:'end', id}
 * (the worker concatenates the data pieces, then compresses). The one-shot form {id, meta, data} still works.
 * Out: {id, packed} | {id, error}.
 */
import { compress } from './lz.js';

/** @type {Map<number, {meta:object, parts:string[]}>} */
const jobs = new Map();

function pack(id, meta, data) {
  try {
    self.postMessage({ id, packed: compress(JSON.stringify({ meta, data })) });
  } catch (err) {
    self.postMessage({ id, error: String((err && err.message) || err) });
  }
}

self.onmessage = (ev) => {
  const m = ev.data;
  if (m.op === 'begin') { jobs.set(m.id, { meta: m.meta, parts: [] }); return; }
  if (m.op === 'chunk') {
    const j = jobs.get(m.id);
    if (j) j.parts.push(m.data);
    else self.postMessage({ id: m.id, error: 'unknown save job' });
    return;
  }
  if (m.op === 'end') {
    const j = jobs.get(m.id);
    jobs.delete(m.id);
    if (!j) { self.postMessage({ id: m.id, error: 'unknown save job' }); return; }
    pack(m.id, j.meta, j.parts.join(''));
    return;
  }
  pack(m.id, m.meta, m.data); // one-shot
};
