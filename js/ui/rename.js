/**
 * Rename dialogs for stations, vehicles, towns and the company (gap #37). Each opens the shared
 * text prompt and sends the matching rename command; windows refresh their titles on the next
 * update tick (wm.updateAll), and the dialog calls it right away.
 */
import { openPrompt } from './prompt.js';
import { MODEL_BY_ID } from '../config/vehicles.js';
import { depotDisplayName, engineDisplayName, presidentDisplayName } from '../simulation/cmdRename.js';

/** @type {Record<string,{title:string,current:(app:any,id:any)=>string|undefined,cmd:(g:any,id:any,name:string)=>any}>} */
const KINDS = {
  station: { title: 'Rename station', current: (app, id) => (app.findStation(id) || {}).name, cmd: (g, id, n) => g.renameStation(id, n) },
  vehicle: { title: 'Rename vehicle', current: (app, id) => (app.findVehicle(id) || {}).name, cmd: (g, id, n) => g.renameVehicle(id, n) },
  depot: { title: 'Rename depot', current: (app, id) => { const d = app.findDepot(id); return d ? depotDisplayName(d) : undefined; }, cmd: (g, id, n) => g.renameDepot(id, n) },
  town: { title: 'Rename town', current: (app, id) => (app.findTown(id) || {}).name, cmd: (g, id, n) => g.renameTown(id, n) },
  engine: { title: 'Rename engine', current: (app, id) => engineLabel(app, id), cmd: (g, id, n) => g.renameEngine(id, n) },
  president: { title: 'Rename president', current: (app) => presidentDisplayName(app.game.state), cmd: (g, _id, n) => g.renamePresident(n) },
  company: { title: 'Rename company', current: (app) => app.game.state.company.name, cmd: (g, _id, n) => g.renameCompany(n) },
};

/** Current display name of an engine model (by id), or undefined when the model is unknown. */
function engineLabel(app, id) {
  const m = MODEL_BY_ID[id];
  return m ? engineDisplayName(app.game.state, m) : undefined;
}

/**
 * @param {import('./app.js').App} app
 * @param {'station'|'vehicle'|'town'|'company'|'depot'|'engine'|'president'} kind
 * @param {number|null} [id] entity id (null for the company / president)
 * @param {() => void} [after] called after a successful rename (e.g. to refresh a list)
 */
export function openRename(app, kind, id = null, after = null) {
  const k = KINDS[kind];
  if (!k) return null;
  const current = k.current(app, id);
  if (current === undefined) return null;
  return openPrompt({
    title: k.title,
    label: kind === 'company' ? 'Company name' : kind === 'president' ? 'President name' : 'Name',
    value: current,
    onSubmit: (text) => {
      const r = k.cmd(app.game, id, text);
      if (r && r.ok) { app.wm.updateAll(); if (after) after(); }
      return r;
    },
  });
}
