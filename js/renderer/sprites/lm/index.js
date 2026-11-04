/**
 * Registry of pixel-art (OpenGFX-style) landmark sprites. Group files call registerLandmark(id, build)
 * at import time; drawLandmark() (../landmarks.js) prefers a registered builder over the old
 * procedural vector sprite. build(w, h) must return a pixel sprite ({canvas,w,h,ax,ay,pixel:true},
 * e.g. footprintPixel(w,h,tall)...toSprite()) anchored at the footprint centre on the ground.
 */
import './group1.js';
import './group2.js';
import { PIXEL_LANDMARKS } from './registry.js';

export { PIXEL_LANDMARKS };
