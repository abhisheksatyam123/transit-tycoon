/**
 * Real satellite cities around Moscow (outside or on the MKAD), used as towns and as
 * density seeds for the outer region. [name, nameRu, lat, lon, radius_m].
 * Entries outside the bake bbox are dropped by `satelliteList()`.
 */
import { BBOX } from './proj.js';

export const SATELLITES = [
  ['Khimki', 'Химки', 55.889, 37.445, 2500],
  ['Dolgoprudny', 'Долгопрудный', 55.935, 37.514, 2000],
  ['Mytishchi', 'Мытищи', 55.911, 37.730, 2800],
  ['Korolyov', 'Королёв', 55.922, 37.854, 2500],
  ['Balashikha', 'Балашиха', 55.796, 37.938, 3000],
  ['Reutov', 'Реутов', 55.760, 37.857, 1800],
  ['Lyubertsy', 'Люберцы', 55.676, 37.893, 3000],
  ['Dzerzhinsky', 'Дзержинский', 55.630, 37.850, 2000],
  ['Kotelniki', 'Котельники', 55.660, 37.864, 1500],
  ['Vidnoye', 'Видное', 55.552, 37.705, 2000],
  ['Domodedovo', 'Домодедово', 55.437, 37.766, 2000],
  ['Shcherbinka', 'Щербинка', 55.500, 37.560, 1500],
  ['Podolsk', 'Подольск', 55.431, 37.545, 3000],
  ['Troitsk', 'Троицк', 55.485, 37.305, 2000],
  ['Moskovsky', 'Московский', 55.600, 37.355, 1800],
  ['Kommunarka', 'Коммунарка', 55.570, 37.480, 1500],
  ['Krasnogorsk', 'Красногорск', 55.831, 37.330, 2200],
  ['Odintsovo', 'Одинцово', 55.678, 37.278, 2200],
  ['Lobnya', 'Лобня', 55.995, 37.480, 1500],
];

/**
 * Satellites inside the bake bbox.
 * @returns {{name:string,nameRu:string,lat:number,lon:number,radius:number}[]}
 */
export function satelliteList() {
  return SATELLITES
    .filter(([, , lat, lon]) => lat > BBOX.s && lat < BBOX.n && lon > BBOX.w && lon < BBOX.e)
    .map(([name, nameRu, lat, lon, radius]) => ({ name, nameRu, lat, lon, radius }));
}

/** Settlement radius (m) by OSM place type; villages and hamlets are ignored. */
const PLACE_RADIUS = { city: 3500, town: 2000, suburb: 1200 };

/**
 * Settlement seeds for the outer region: OSM place nodes (city/town/suburb) plus the
 * curated satellites. Coordinates are float tile coords.
 * @param {Array<object>|null} placeEls raw place elements
 * @param {(lat:number,lon:number)=>{x:number,y:number}} projectF
 * @returns {{x:number,y:number,r:number}[]} r in metres
 */
export function settlementSeeds(placeEls, projectF) {
  const out = [];
  for (const e of placeEls || []) {
    const r = PLACE_RADIUS[(e.tags || {}).place];
    if (e.type !== 'node' || !r) continue;
    if (!(e.lat > BBOX.s && e.lat < BBOX.n && e.lon > BBOX.w && e.lon < BBOX.e)) continue;
    out.push({ ...projectF(e.lat, e.lon), r });
  }
  for (const s of satelliteList()) out.push({ ...projectF(s.lat, s.lon), r: s.radius });
  return out;
}
