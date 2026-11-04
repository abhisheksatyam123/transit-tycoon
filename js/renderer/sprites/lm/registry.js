/** Shared map id -> builder(w, h) => pixel sprite. See ./index.js. */
export const PIXEL_LANDMARKS = new Map();

/**
 * @param {string} id landmark id (js/simulation/scenarios/moscowLandmarks.js)
 * @param {(w:number,h:number)=>{canvas:any,w:number,h:number,ax:number,ay:number,pixel:boolean}} build
 */
export function registerLandmark(id, build) {
  PIXEL_LANDMARKS.set(id, build);
}
