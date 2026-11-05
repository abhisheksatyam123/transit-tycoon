#!/usr/bin/env bun
/**
 * Headless real-city harness: generates a world, builds bus lines, a town link and a coal line,
 * runs for N years printing monthly stats, then reports diagnostics and a save/load determinism check.
 * Usage: bun tools/simulate-city.js [--seed N] [--years Y] [--json path]
 */
import { tl } from '../js/simulation/scenarios/moscowScale.js';
import { writeFileSync } from 'fs';
import { Game } from '../js/simulation/game.js';
import { runDiagnostics, summarizeIssues } from '../js/simulation/diagnostics.js';
import { labelComponents } from '../js/simulation/diagIssue.js';
import { placeIndustry } from '../js/simulation/industries.js';
import { TICKS_PER_DAY } from '../js/simulation/constants.js';

// ---------------------------------------------------------------- args
function parseArgs(argv) {
  const o = { seed: 1, years: 3, json: null, scenario: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--seed') o.seed = Number(argv[++i]);
    else if (argv[i] === '--years') o.years = Number(argv[++i]);
    else if (argv[i] === '--json') o.json = argv[++i];
    else if (argv[i] === '--scenario') o.scenario = argv[++i];
  }
  return o;
}

// ---------------------------------------------------------------- tile helpers
const tileAt = (g, x, y) => g.state.map.tiles[y * g.state.map.width + x];
const inMap = (g, x, y) => x >= 0 && y >= 0 && x < g.state.map.width && y < g.state.map.height;
const isFree = (t) => t && t.terrain !== 'water' && !t.building && !t.road && !t.rail;
const isStraightRoad = (t) => t && !t.building && (t.road === 10 || t.road === 5);
const DIRS = [{ bit: 1, dx: 0, dy: -1 }, { bit: 2, dx: 1, dy: 0 }, { bit: 4, dx: 0, dy: 1 }, { bit: 8, dx: -1, dy: 0 }];

/** Straight road tiles within r of (cx,cy), nearest first. */
function straightRoadNear(g, cx, cy, r) {
  const out = [];
  for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
    if (inMap(g, x, y) && isStraightRoad(tileAt(g, x, y))) out.push({ x, y, d: Math.hypot(x - cx, y - cy) });
  }
  return out.sort((a, b) => a.d - b.d);
}

/** Record a command result: push a setup issue on failure. */
function attempt(report, label, r) {
  if (!r || !r.ok) {
    report.setup.push(`setup: ${label} failed: ${r ? r.error : 'no result'}`);
    return false;
  }
  return true;
}

// ---------------------------------------------------------------- setup
function buildBusNetwork(g, report) {
  const towns = [...g.state.towns].sort((a, b) => b.population - a.population).slice(0, 2);
  for (const town of towns) {
    const roads = straightRoadNear(g, town.x, town.y, tl(10));
    const stops = [];
    for (const p of roads) {
      if (stops.length >= 4) break;
      if (stops.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < tl(4))) continue;
      const r = g.buildRoadStop(p.x, p.y, 'bus');
      if (attempt(report, `bus stop in ${town.name}`, r)) stops.push({ x: p.x, y: p.y, id: g.state.stations.find((st) => st.x === p.x && st.y === p.y).id });
    }
    if (stops.length < 2) { report.setup.push(`setup: ${town.name} has only ${stops.length} bus stops`); continue; }
    const depot = roadDepotNear(g, town.x, town.y);
    if (!depot) { report.setup.push(`setup: no road depot site near ${town.name}`); continue; }
    const dr = g.buildDepot(depot.x, depot.y, 'road', depot.dir);
    if (!attempt(report, `road depot in ${town.name}`, dr)) continue;
    const model = g.listModels('bus')[0];
    for (let b = 0; b < 2; b++) {
      const bought = g.buyVehicle(dr.depotId, { modelId: model.id });
      if (!attempt(report, `buy bus for ${town.name}`, bought)) continue;
      const orders = stops.map((st) => ({ stationId: st.id, full: false }));
      attempt(report, `bus orders ${town.name}`, g.setOrders(bought.vehicle.id, orders.slice(b).concat(orders.slice(0, b))));
      attempt(report, `start bus ${town.name}`, g.startVehicle(bought.vehicle.id));
    }
    report.setup.push(`bus network in ${town.name}: ${stops.length} stops, depot ${depot.x},${depot.y}`);
  }
}

/** A free tile next to a road tile, with the depot's dir facing that road. */
function roadDepotNear(g, cx, cy) {
  for (const p of straightRoadNear(g, cx, cy, tl(10))) {
    for (const d of DIRS) {
      const x = p.x + d.dx, y = p.y + d.dy;
      if (inMap(g, x, y) && isFree(tileAt(g, x, y))) return { x, y, dir: DIRS.find((q) => q.bit === oppBit(d.bit)).bit };
    }
  }
  return null;
}
const oppBit = (b) => ({ 1: 4, 2: 8, 4: 1, 8: 2 })[b];

/** Road component label of a town centre (or -1 if none). */
function roadLabel(g, town) {
  const labels = labelComponents(g.state.map, 'road', () => true);
  return labels[town.y * g.state.map.width + town.x];
}

/** Try L-shaped road lines between the two nearest towns' edges; log failures. */
function connectTowns(g, report) {
  const towns = [...g.state.towns];
  if (towns.length < 2) return;
  let best = null;
  for (const a of towns) for (const b of towns) {
    if (a === b) continue;
    const d = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    if (!best || d < best.d) best = { a, b, d };
  }
  const { a, b } = best;
  const la = roadLabel(g, a), lb = roadLabel(g, b);
  if (la >= 0 && la === lb) { report.setup.push(`road link ${a.name}-${b.name} already connected`); return; }
  const from = straightRoadNear(g, a.x, a.y, tl(4))[0];
  const to = straightRoadNear(g, b.x, b.y, tl(4))[0];
  if (!from || !to) { report.setup.push(`setup: no road tiles to link ${a.name} and ${b.name}`); return; }
  const variants = [[from.x, from.y, to.x, from.y], [from.x, from.y, from.x, to.y], [from.x, to.y, to.x, to.y], [to.x, from.y, to.x, to.y]];
  let ok = false;
  for (const v of variants) {
    if (v[0] === v[2] && v[1] === v[3]) continue; // zero-length: would lay a dangling stub
    const r = g.buildRoad(...v);
    if (r.ok) { ok = true; report.setup.push(`road link ${a.name}-${b.name} via ${v.join(',')}`); break; }
    report.setup.push(`setup: road link ${a.name}-${b.name} variant ${v.join(',')} failed: ${r.error}`);
  }
  if (!ok) report.setup.push(`setup: could not road-link ${a.name} and ${b.name}`);
}

/** Coal mine -> power station with rail stations, L-shaped rail, a depot and a full-load hopper train. */
function buildCoalLine(g, report) {
  const s = g.state;
  const mines = s.industries.filter((i) => i.typeId === 'coal_mine');
  const plants = s.industries.filter((i) => i.typeId === 'power_station');
  if (!mines.length || !plants.length) { report.setup.push('setup: no coal mine or power station on this map'); return; }
  const mine = mines[0];
  const plant = plants.reduce((best, p) => (Math.abs(p.x - mine.x) + Math.abs(p.y - mine.y) < Math.abs(best.x - mine.x) + Math.abs(best.y - mine.y) ? p : best));
  const dist = Math.abs(plant.x - mine.x) + Math.abs(plant.y - mine.y);
  if (dist > tl(40)) report.setup.push(`setup: nearest power station is ${dist} tiles away`);
  const y = mine.y + mine.h + 1;
  const sa = g.buildRailStation(mine.x, y, 'x', 3);
  const sb = g.buildRailStation(plant.x, y, 'x', 3);
  if (!attempt(report, 'mine rail station', sa) || !attempt(report, 'plant rail station', sb)) return;
  const line = g.buildRail(mine.x + 3, y, plant.x - 1, y);
  if (!attempt(report, 'rail line', line)) return;
  const dx = Math.round((mine.x + plant.x) / 2), dy = y + 1;
  const dep = g.buildDepot(dx, dy, 'rail', 1);
  if (!attempt(report, 'rail depot', dep)) return;
  const stA = s.stations[s.stations.length - 2], stB = s.stations[s.stations.length - 1];
  const engine = g.listModels('engine').at(-1) || g.listModels('engine')[0];
  const bought = g.buyVehicle(dep.depotId, { modelId: engine.id, wagonModelId: 'wag_hopper', wagons: 4, cargoId: 'COAL' });
  if (!attempt(report, 'buy coal train', bought)) return;
  attempt(report, 'coal orders', g.setOrders(bought.vehicle.id, [{ stationId: stA.id, full: true }, { stationId: stB.id, full: false }]));
  attempt(report, 'start coal train', g.startVehicle(bought.vehicle.id));
  report.setup.push(`coal line ${mine.id}->${plant.id}, ${dist} tiles, rail row y=${y}`);
}

// ---------------------------------------------------------------- run
function runYears(g, report, years) {
  const s = g.state;
  const totalDays = years * 365;
  const startDay = s.tick / TICKS_PER_DAY;
  let maxMs = 0, sumMs = 0, days = 0;
  let lastMonth = s.date.month;
  let monthlyIssues = null;
  for (let d = 0; d < totalDays; d++) {
    const t0 = performance.now();
    for (let k = 0; k < TICKS_PER_DAY; k++) g.step();
    const ms = performance.now() - t0;
    maxMs = Math.max(maxMs, ms); sumMs += ms; days++;
    if (s.date.month !== lastMonth) {
      lastMonth = s.date.month;
      monthlyIssues = runDiagnostics(g);
      report.months.push(monthLine(g, monthlyIssues));
      console.log(report.months.at(-1).text);
    }
  }
  report.perf = { days, msPerDayAvg: +(sumMs / Math.max(1, days)).toFixed(3), msPerDayMax: +maxMs.toFixed(3), startDay };
}

/** One monthly report row. */
function monthLine(g, issues) {
  const s = g.state;
  const ledger = s.company.ledger.history.at(-1);
  const pop = s.towns.reduce((a, t) => a + (t.population || 0), 0);
  const running = s.vehicles.filter((v) => v.state === 'running').length;
  const lost = s.vehicles.filter((v) => v.state === 'lost').length;
  const ts = g.trafficStats ? safe(() => g.trafficStats()) : null;
  const sum = summarizeIssues(issues);
  const date = `${s.date.year}-${String(s.date.month + 1).padStart(2, '0')}`;
  const traffic = ts ? ` traffic act=${ts.active} trips=${ts.tripsTotal} failed=${ts.failedTotal} aborted=${ts.abortedTotal} suppressed=${ts.suppressedTotal ?? 0} speed=${(ts.avgSpeedRatio ?? 0).toFixed(2)} congested=${ts.congestedTiles}` : ' traffic=n/a';
  const text = `${date} money=${Math.round(s.company.money)} income=${ledger ? Math.round(ledger.income) : 'n/a'} pop=${pop} veh run=${running} lost=${lost}${traffic} issues e=${sum.error} w=${sum.warn} i=${sum.info}`;
  return { date, money: s.company.money, income: ledger ? ledger.income : null, population: pop, vehicles: { running, lost }, traffic: ts ? { active: ts.active, trips: ts.tripsTotal, failed: ts.failedTotal, aborted: ts.abortedTotal, suppressed: ts.suppressedTotal ?? 0, avgSpeedRatio: ts.avgSpeedRatio, congested: ts.congestedTiles } : null, issues: sum, text };
}

function safe(fn) { try { return fn(); } catch { return null; } }

// ---------------------------------------------------------------- invariants & determinism
/** Extra consistency checks beyond the diagnostics: returns list of strings. */
function checkInvariants(g) {
  const s = g.state, out = [];
  if (!Number.isFinite(s.company.money)) out.push('money not finite');
  for (const v of s.vehicles) {
    if (!Number.isFinite(v.tx) || !Number.isFinite(v.ty)) out.push(`vehicle ${v.id} non-finite target`);
    if (!s.stations.every(() => true)) out.push('stations');
  }
  for (const st of s.stations) for (const p of st.tiles || []) {
    const b = tileAt(g, p.x, p.y).building;
    if (!b || b.stationId !== st.id) out.push(`station ${st.id} tile ${p.x},${p.y} orphaned`);
  }
  return out.length ? out : ['all ok'];
}

/** Serialize, reload, run both 30 days, compare serialized state. */
function checkDeterminism(g) {
  const snap = g.serialize();
  const a = Game.deserialize(snap);
  const b = g;
  const runDays = (gm, n) => { for (let i = 0; i < n * TICKS_PER_DAY; i++) gm.step(); return gm.serialize(); };
  const ra = runDays(a, 30);
  const rb = runDays(b, 30);
  return ra === rb ? 'MATCH' : 'MISMATCH';
}

// ---------------------------------------------------------------- printing
function printReport(r) {
  console.log('\n== setup ==');
  for (const line of r.setup.slice(0, 50)) console.log('  ' + line);
  console.log(`== perf == days=${r.perf.days} ms/day avg=${r.perf.msPerDayAvg} max=${r.perf.msPerDayMax}`);
  console.log(`== summary == error=${r.summary.error} warn=${r.summary.warn} info=${r.summary.info} byCategory=${JSON.stringify(r.summary.byCategory)}`);
  console.log('== diagnostics (sorted by severity, cap 50) ==');
  const order = { error: 0, warn: 1, info: 2 };
  const sorted = [...r.issues].sort((x, y) => order[x.severity] - order[y.severity]);
  for (const it of sorted.slice(0, 50)) console.log(`  [${it.severity}] ${it.category} ${it.id}: ${it.message}`);
  if (sorted.length > 50) console.log(`  ... ${sorted.length - 50} more`);
  console.log('== invariants ==');
  for (const line of r.invariants) console.log('  ' + line);
  console.log(`== determinism (save/load, 30 days) == ${r.determinism}`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = { seed: args.seed, years: args.years, setup: [], months: [], perf: {}, issues: [], summary: null, invariants: [], determinism: null };

  if (args.scenario) {
    // scenario worlds build their own network; the harness only runs and checks them
    const game = Game.create({ scenario: args.scenario, seed: args.seed });
    report.setup.push(...game.state.scenarioLog.map((l) => `scenario: ${l}`));
    return runAndReport(game, report, args);
  }
  const game = Game.create({ seed: args.seed });
  const s = game.state;
  s.company.money = 2_000_000;

  buildBusNetwork(game, report);
  connectTowns(game, report);
  buildCoalLine(game, report);
  return runAndReport(game, report, args);
}

/** Run the years, then diagnostics, invariants and determinism; print and exit. */
function runAndReport(game, report, args) {

  const issues0 = runDiagnostics(game);
  report.setup.push(`initial issues: ${issues0.length}`);
  runYears(game, report, args.years);

  report.issues = runDiagnostics(game);
  report.summary = summarizeIssues(report.issues);
  report.invariants = checkInvariants(game);
  report.determinism = checkDeterminism(game);
  printReport(report);
  if (args.json) writeFileSync(args.json, JSON.stringify(report, null, 2));
  process.exit(report.summary.error > 0 || report.determinism !== 'MATCH' ? 1 : 0);
}

main();
