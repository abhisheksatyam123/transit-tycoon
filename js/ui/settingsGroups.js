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
  { key: 'roadOvertaking', group: 'vehicles', label: 'Road vehicle overtaking', type: 'check',
    help: 'Faster road vehicles pass slower ones on straight roads with a free opposite lane (not trams, junctions or stations).' },
  { key: 'trainAcceleration', group: 'vehicles', label: 'Train acceleration', type: 'select',
    options: [['original', 'Original'], ['realistic', 'Realistic (OpenTTD)']],
    help: 'Realistic: trains slow for curves (OpenTTD corner limits) and accelerate from tractive effort, air drag, rolling friction and slope against their weight.' },
  { key: 'gradients', group: 'construction', label: 'Gradients', type: 'check',
    help: 'Uphill slopes slow trains and road vehicles (heavier loads more); downhill gives a small speed bonus.' },
  { key: 'pathCosts', group: 'construction', label: 'Realistic pathfinder costs', type: 'check',
    help: 'Trains prefer flat routes, avoid unnecessary curves, bypass intermediate stations, and steer away from red signals or occupied tracks.' },
  { key: 'breakdowns', group: 'vehicles', label: 'Breakdowns', type: 'select',
    options: [['none', 'None'], ['reduced', 'Reduced'], ['normal', 'Normal']],
    help: 'How often vehicles break down and stop for a while. None = never.' },
  { key: 'disasters', group: 'vehicles', label: 'Disasters', type: 'check',
    help: 'Now and then a zeppelin crashes on an airport runway (no landings for a while) or a small UFO destroys a road vehicle. Off = no disasters.' },
  { key: 'planeCrashes', group: 'vehicles', label: 'Plane crashes', type: 'select',
    options: [['off', 'Off'], ['reduced', 'Reduced'], ['normal', 'Normal']],
    help: 'Planes can crash when they land at an airport: passengers die, the station loses its cargo and the town rating drops. Off = never.' },
  { key: 'serviceIntervalDays', group: 'vehicles', label: 'Service interval (days)', type: 'number', min: 0, max: 730,
    help: 'New vehicles service at the nearest depot every N days (0 = off). Existing vehicles keep theirs; change them in the vehicle window.' },
  { key: 'inflation', group: 'economy', label: 'Inflation', type: 'check',
    help: 'Costs and cargo payments rise every month.' },
  { key: 'timetableSeparation', group: 'vehicles', label: 'Timetable separation', type: 'check',
    help: 'Vehicles on a complete timetable with shared orders depart at evenly spaced slots (start date + round offsets), so buses on one line keep even gaps. Off = depart as soon as loaded.' },
  { key: 'cargodist', group: 'economy', label: 'Cargo distribution (passengers/mail)', type: 'select',
    options: [['off', 'Off'], ['asymmetric', 'Asymmetric'], ['symmetric', 'Symmetric']],
    help: 'Passengers and mail get destinations (OpenTTD cargodist): a station routes them by the link graph of your vehicle routes, so they ride via transfers. Off = classic pickup from any vehicle.' },
  { key: 'freightDistribution', group: 'economy', label: 'Freight distribution', type: 'select',
    options: [['manual', 'Manual'], ['asymmetric', 'Asymmetric']],
    help: 'Freight (coal, goods, ...) gets destinations among the stations that accept it, weighted by acceptance, via the link graph of your routes. Manual = classic pickup from any vehicle.' },
  { key: 'cargodistMcf', group: 'economy', label: 'Capacity-limited routing', type: 'check',
    help: 'Cargodist routes fill the shortest links up to their monthly capacity first, then overflow to longer routes (OpenTTD MCF, simplified). Needs a cargo distribution setting.' },
  { key: 'linkgraphDistributionPax', group: 'economy', label: 'Passenger distribution', type: 'select',
    options: [['follow', 'Follow cargo distribution'], ['manual', 'Manual'], ['asymmetric', 'Asymmetric'], ['symmetric', 'Symmetric']],
    help: 'Per-class distribution (OpenTTD linkgraph distribution_pax). Manual = passengers ride without destinations. Follow = the cargo distribution setting.' },
  { key: 'linkgraphDistributionMail', group: 'economy', label: 'Mail distribution', type: 'select',
    options: [['follow', 'Follow cargo distribution'], ['manual', 'Manual'], ['asymmetric', 'Asymmetric'], ['symmetric', 'Symmetric']],
    help: 'Per-class distribution for mail (OpenTTD linkgraph distribution_mail). Manual = mail rides without destinations.' },
  { key: 'linkgraphRecalcInterval', group: 'economy', label: 'Link graph interval (months)', type: 'number', min: 1, max: 12,
    help: 'A link graph job starts every this many months (OpenTTD linkgraph recalc_interval, days). 1 = rebuilt monthly.' },
  { key: 'linkgraphRecalcTime', group: 'economy', label: 'Link graph delay (months)', type: 'number', min: 0, max: 12,
    help: 'A link graph job takes this many months before its routing is applied (OpenTTD linkgraph recalc_time). 0 = applied at once.' },
  { key: 'linkgraphAccuracy', group: 'economy', label: 'Link graph accuracy', type: 'number', min: 2, max: 64,
    help: 'Accuracy of the capacity routing (OpenTTD linkgraph accuracy). Higher = fewer augmenting paths per demand pair, faster. Default 16.' },
  { key: 'linkgraphDemandDistance', group: 'economy', label: 'Demand distance effect %', type: 'number', min: 0, max: 255,
    help: 'How much distance reduces demand (OpenTTD demand_distance). 0 = distance ignored (current); 100 = the OpenTTD default.' },
  { key: 'linkgraphDemandSize', group: 'economy', label: 'Demand size effect %', type: 'number', min: 0, max: 100,
    help: 'How much the supply size of a destination increases its demand (OpenTTD demand_size). 100 = current.' },
  { key: 'linkgraphShortPathSaturation', group: 'economy', label: 'Short path saturation %', type: 'number', min: 1, max: 100,
    help: 'Percent of a link capacity the first routing pass fills before longer paths (OpenTTD short_path_saturation). 100 = current; OpenTTD default 80.' },
  { key: 'cargoPaymentPercent', group: 'economy', label: 'Cargo payment %', type: 'number', min: 10, max: 300,
    help: 'Percent of the standard cargo payment rate.' },
  { key: 'loanInterestRate', group: 'economy', label: 'Loan interest (OpenLoco units)', type: 'number', min: 0, max: 30,
    help: 'Yearly loan interest in OpenLoco units (percent): monthly charge = loan x rate / 1200, for you and AI rivals. OpenLoco editor default 10; 5 = current.' },
  { key: 'subsidies', group: 'economy', label: 'Subsidies', type: 'check',
    help: 'Offer subsidies every month.' },
  { key: 'economyRecessions', group: 'economy', label: 'Recessions', type: 'check',
    help: 'The economy slumps now and then for about a year: industries and towns produce half the cargo and passengers. Off = no recessions.' },
  { key: 'aiCompanies', group: 'companies', label: 'AI competitors', type: 'select', newGame: true,
    options: [['0', 'None'], ['1', '1 rival'], ['2', '2 rivals'], ['3', '3 rivals']],
    help: 'AI rival companies that build bus routes between nearby towns (opt-in; they use the same rules and costs as you). Set at game start.' },
  { key: 'enginePreview', group: 'companies', label: 'Engine preview', type: 'check',
    help: 'New vehicle models are first offered exclusively to one company for a year (OpenTTD engine preview). You get an offer dialog; a rival with AI competitors may take it. Off = models appear for everyone at once.' },
  { key: 'shares', group: 'companies', label: 'Company shares', type: 'check',
    help: 'Buy and sell 25% shares of rival companies from the Companies window (OpenTTD). Buying all four takes the company over. Needs AI competitors; a company can be bought only after 6 months.' },
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
  { key: 'largeHouses', group: 'environment', label: 'Large houses (2x1, 2x2)', type: 'check', newGame: true,
    help: 'Towns sometimes build multi-tile houses (1x2 and 2x2, OpenTTD style) on free flat land inside the town. Off = 1x1 houses only.' },
];

/** UI-only preferences shown in the Interface group (not in the save; not counted as "changed from default"). */
export const PREF_META = [
  { id: 'sound', group: 'interface', label: 'Sound effects', help: 'Build and vehicle sounds. Same as the toolbar sound button (M).' },
  { id: 'fx', group: 'interface', label: 'Vehicle effects', help: 'Smoke, sparks and wakes from trains, buses, trucks and ships. Off = no vehicle particles.' },
  { id: 'townLabels', group: 'interface', label: 'Town names', help: 'Name signs on the map at each town centre (population from zoom 1). Same as the Town names checkbox here; stored in this browser.' },
  { id: 'stationLabels', group: 'interface', label: 'Station names', help: 'Name signs above stations, coloured by owner (rivals in their own colour). Hidden when zoomed far out. Stored in this browser.' },
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
