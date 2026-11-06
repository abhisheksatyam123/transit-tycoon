/**
 * Settings window metadata (T43): OpenTTD settings_gui.cpp style categories. Pure data + helpers so the
 * grouping can be unit-tested. Every key of DEFAULT_SETTINGS (simulation/settings.js) belongs to exactly one group.
 * Interface holds UI-only preferences (localStorage), not game settings.
 */

/** @type {{id:string,title:string,help:string}[]} */
export const SETTING_GROUPS = [
  { id: 'interface', title: 'Interface', help: 'Display and sound preferences. Stored in this browser, not in the save.' },
  { id: 'construction', title: 'Construction', help: 'How the terrain affects building and vehicles.' },
  { id: 'vehicles', title: 'Vehicles', help: 'Breakdowns and service schedules for new vehicles.' },
  { id: 'economy', title: 'Economy', help: 'Money: inflation, cargo payments and subsidies.' },
  { id: 'environment', title: 'Environment', help: 'Trees and industries that grow or appear on the map.' },
  { id: 'companies', title: 'Companies', help: 'Policies for your company\'s vehicles.' },
];

/**
 * Game settings metadata. `type`: 'check' | 'number' | 'select'. `newGame` marks settings that were
 * opt-in at new-game time; they are live-toggleable (the sim reads them each tick) and are noted as such.
 * @type {{key:string,group:string,label:string,help:string,type:'check'|'number'|'select',min?:number,max?:number,options?:[string,string][],newGame?:boolean}[]}
 */
export const SETTING_META = [
  { key: 'gradients', group: 'construction', label: 'Gradients', type: 'check',
    help: 'Uphill slopes slow trains and road vehicles (heavier loads more); downhill gives a small speed bonus.' },
  { key: 'pathCosts', group: 'construction', label: 'Realistic pathfinder costs', type: 'check',
    help: 'Trains prefer flat routes, avoid unnecessary curves, bypass intermediate stations, and steer away from red signals or occupied tracks.' },
  { key: 'breakdowns', group: 'vehicles', label: 'Breakdowns', type: 'select',
    options: [['none', 'None'], ['reduced', 'Reduced'], ['normal', 'Normal']],
    help: 'How often vehicles break down and stop for a while. None = never.' },
  { key: 'serviceIntervalDays', group: 'vehicles', label: 'Service interval (days)', type: 'number', min: 0, max: 730,
    help: 'New vehicles service at the nearest depot every N days (0 = off). Existing vehicles keep theirs; change them in the vehicle window.' },
  { key: 'inflation', group: 'economy', label: 'Inflation', type: 'check',
    help: 'Costs and cargo payments rise every month.' },
  { key: 'cargoPaymentPercent', group: 'economy', label: 'Cargo payment %', type: 'number', min: 10, max: 300,
    help: 'Percent of the standard cargo payment rate.' },
  { key: 'subsidies', group: 'economy', label: 'Subsidies', type: 'check',
    help: 'Offer subsidies every month.' },
  { key: 'aiCompanies', group: 'companies', label: 'AI competitors', type: 'select', newGame: true,
    options: [['0', 'None'], ['1', '1 rival'], ['2', '2 rivals'], ['3', '3 rivals']],
    help: 'AI rival companies that build bus routes between nearby towns (opt-in; they use the same rules and costs as you). Set at game start.' },
  { key: 'autorenew', group: 'companies', label: 'Autorenew', type: 'check',
    help: 'Vehicles past their max age are replaced by a new one of the same model when they next stop in a depot (price minus resale). Off = old vehicles keep running.' },
  { key: 'treeGrowth', group: 'environment', label: 'Tree growth', type: 'check',
    help: 'Forests slowly spread to free grass next to them (a few tiles a month).' },
  { key: 'farmFields', group: 'environment', label: 'Farm fields', type: 'check', newGame: true,
    help: 'Farms plant field tiles around themselves; production follows the field count. Building over a field clears it. Applies to new farms; the new-game option sets it at start.' },
  { key: 'extraIndustries', group: 'environment', label: 'Extra industries (banks, chains)', type: 'check', newGame: true,
    help: 'Banks (valuables) appear in towns of 1200+ people. Also adds quarries, paper mills, printing works, building materials and food plants (stone, paper, food chains) with their vehicles. Changing it later only affects new placements.' },
  { key: 'buildingEras', group: 'environment', label: 'Building eras', type: 'check', newGame: true,
    help: 'Towns build houses of their period: 1950s cottages and terraces, then 1960s+ office blocks and flats, 1970s+ tower blocks. Old houses are rebuilt as newer types. Off = the classic house mix.' },
];

/** UI-only preferences shown in the Interface group (not in the save; not counted as "changed from default"). */
export const PREF_META = [
  { id: 'sound', group: 'interface', label: 'Sound effects', help: 'Build and vehicle sounds. Same as the toolbar sound button (M).' },
  { id: 'fx', group: 'interface', label: 'Vehicle effects', help: 'Smoke, sparks and wakes from trains, buses, trucks and ships. Off = no vehicle particles.' },
  { id: 'gfx', group: 'interface', label: 'OpenGFX sprites', help: 'Use the OpenGFX sprite pack. Off = procedural drawing. Same as K.' },
];

/** @param {string} key @returns {string|undefined} group id */
export function groupOfSetting(key) {
  const m = SETTING_META.find((s) => s.key === key);
  return m ? m.group : undefined;
}

/** True when the stored value differs from the default (drives the "changed" dot). */
export function isChanged(key, value, defaults) {
  return value !== defaults[key];
}

/**
 * Case-insensitive filter: a setting matches when the query is a substring of its label, help or group title.
 * Empty query matches everything.
 * @param {{label:string,help:string,group:string}} item
 * @param {string} query
 * @param {Record<string,string>} groupTitles id -> title
 */
export function matchesQuery(item, query, groupTitles) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return true;
  const hay = `${item.label} ${item.help} ${groupTitles[item.group] || ''}`.toLowerCase();
  return q.split(/\s+/).every((w) => hay.includes(w));
}
