// N7 phase 2/3: opt-in multiple singlehead locomotives in the lead block (multiEngineConsists, default off).
// Off must be byte-identical (no v.engines field, same motion/cost/save); on sums power/weight, mins speed.
import { test, expect, describe } from 'bun:test';
import { flatGame, coalLine } from './helpers.js';
import { DEFAULT_SETTINGS, getSetting, setSetting } from '../js/simulation/settings.js';
import { SETTING_META } from '../js/ui/settingsGroups.js';
import { engineList, extraEngineCount, MAX_EXTRA_ENGINES } from '../js/simulation/consistEngines.js';
import { totalWeight, totalPower, KMH_TO_TILES_PER_TICK } from '../js/simulation/loco/vehicleMotion.js';
import { consistMotion } from '../js/simulation/loco/trainRealistic.js';
import { consistMaxSpeedTiles } from '../js/simulation/consist.js';
import { MODEL_BY_ID } from '../js/config/vehicles.js';
import { vehiclePrice } from '../js/simulation/prices.js';
import { serializeState, parseState } from '../js/simulation/save.js';
import { autorenewVehicle } from '../js/simulation/autorenew.js';
import { getVehicleSegments } from '../js/simulation/vehicles.js';
import { trainLengthTiles } from '../js/simulation/platformLength.js';
import { SEGMENT_SPACING } from '../js/simulation/constants.js';

function setup(year = 1920) {
  const g = flatGame(21);
  g.state.date.year = year;
  const L = coalLine(g);
  return { g, L };
}

describe('multiEngineConsists setting', () => {
  test('defaults off and has exactly one SETTING_META entry (vehicles / check)', () => {
    expect(DEFAULT_SETTINGS.multiEngineConsists).toBe(false);
    const entries = SETTING_META.filter((m) => m.key === 'multiEngineConsists');
    expect(entries.length).toBe(1);
    expect(entries[0].group).toBe('vehicles');
    expect(entries[0].type).toBe('check');
    expect(entries[0].help).toContain('OpenTTD-style');
  });
});

describe('default off: byte-identical behaviour', () => {
  test('purchase writes no v.engines and spec.engines is ignored', () => {
    const { g, L } = setup();
    const r = g.buyVehicle(L.depotId, {
      modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 2, cargoId: 'COAL',
      engines: ['eng_thunder'],
    });
    expect(r.ok).toBe(true);
    const v = r.vehicle;
    expect(Object.prototype.hasOwnProperty.call(v, 'engines')).toBe(false);
    expect(engineList(v)).toEqual(['eng_puffer']);
    expect(extraEngineCount(v)).toBe(0);
    // cost is the plain single-engine price (the ignored spec.engines adds nothing)
    const plain = g.buyVehicle(L.depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 2, cargoId: 'COAL' }, { dryRun: true });
    const withExtra = g.buyVehicle(L.depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 2, cargoId: 'COAL', engines: ['eng_thunder'] }, { dryRun: true });
    expect(withExtra.cost).toBe(plain.cost);
  });

  test('motion and physics are exactly the single-engine path', () => {
    const { g, L } = setup();
    const v = g.buyVehicle(L.depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 2, cargoId: 'COAL' }).vehicle;
    expect(g.state.vehicles.length).toBe(1);
    expect(totalWeight(v)).toBe(60 + 2 * 25);
    expect(totalPower(v, MODEL_BY_ID.eng_puffer)).toBe(600);
    const c = consistMotion(v, MODEL_BY_ID.eng_puffer);
    expect(c.engines).toBe(0);
    expect(c.mass).toBe(110);
    expect(c.power).toBe(600 * 746);
    expect(consistMaxSpeedTiles(g.state, v)).toBe(v.maxSpeed);
  });

  test('save has no engines array and a plain save/load round-trip is unchanged', () => {
    const { g, L } = setup();
    const v = g.buyVehicle(L.depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 2, cargoId: 'COAL' }).vehicle;
    const before = serializeState(g.state);
    expect(before.includes('"engines":[')).toBe(false);
    const s = parseState(before);
    const v2 = s.vehicles.find((x) => x.id === v.id);
    expect(Object.prototype.hasOwnProperty.call(v2, 'engines')).toBe(false);
    expect(serializeState(s)).toBe(before);
  });

  test('add/remove engine commands refuse while the setting is off', () => {
    const { g, L } = setup();
    const v = g.buyVehicle(L.depotId, { modelId: 'eng_puffer', wagons: 0 }).vehicle;
    expect(g.addEngine(v.id, 'eng_puffer').ok).toBe(false);
    expect(g.removeEngine(v.id).ok).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(v, 'engines')).toBe(false);
  });
});

describe('on: purchases, physics, cache', () => {
  test('purchase sums cost/running/power/weight and keeps capacity', () => {
    const { g, L } = setup(1950);
    setSetting(g.state, 'multiEngineConsists', true);
    const single = g.buyVehicle(L.depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 2, cargoId: 'COAL' }, { dryRun: true });
    const r = g.buyVehicle(L.depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 2, cargoId: 'COAL', engines: ['eng_comet'] });
    expect(r.ok).toBe(true);
    const v = r.vehicle;
    expect(v.engines).toEqual(['eng_comet']);
    expect(engineList(v)).toEqual(['eng_puffer', 'eng_comet']);
    expect(extraEngineCount(v)).toBe(1);
    expect(v.capacity).toBe(2 * 30); // engines add no capacity
    expect(r.cost).toBe(single.cost + vehiclePrice(g.state, MODEL_BY_ID.eng_comet.cost));
    expect(totalWeight(v)).toBe(120 + 2 * 25);
    expect(totalPower(v, MODEL_BY_ID.eng_puffer)).toBe(600 + 1100);
    expect(v.runningCost).toBe(MODEL_BY_ID.eng_puffer.running + MODEL_BY_ID.eng_comet.running + MODEL_BY_ID.wag_hopper.running * 2);
  });

  test('a mixed-consist purchase carries extra engines and sums their cost', () => {
    const { g, L } = setup(1950);
    setSetting(g.state, 'multiEngineConsists', true);
    const spec = { modelId: 'eng_comet', consist: [{ modelId: 'wag_hopper', cargoId: 'COAL' }, { modelId: 'wag_hopper', cargoId: 'COAL' }], engines: ['eng_puffer'] };
    const plain = g.buyVehicle(L.depotId, { ...spec, engines: [] }, { dryRun: true });
    const r = g.buyVehicle(L.depotId, spec);
    expect(r.ok).toBe(true);
    expect(r.vehicle.engines).toEqual(['eng_puffer']);
    expect(r.vehicle.wagons).toBe(2);
    expect(r.cost).toBe(plain.cost + vehiclePrice(g.state, MODEL_BY_ID.eng_puffer.cost));
  });

  test('speed is the minimum over the engines, even with wagonSpeedLimits off', () => {
    const { g } = setup(1960);
    setSetting(g.state, 'multiEngineConsists', true);
    const v = { kind: 'train', modelId: 'eng_thunder', engines: ['eng_puffer'], wagons: 0, maxSpeed: MODEL_BY_ID.eng_thunder.speed * KMH_TO_TILES_PER_TICK };
    expect(consistMaxSpeedTiles(g.state, v)).toBe(MODEL_BY_ID.eng_puffer.speed * KMH_TO_TILES_PER_TICK);
    const c = consistMotion(v, MODEL_BY_ID.eng_thunder);
    expect(c.engines).toBe(1);
    expect(c.mass).toBe(120);
    expect(c.power).toBe((1800 + 600) * 746);
    // both engines weigh 60 t: tractive effort is the sum, unchanged coefficient
    expect(c.te).toBe(120 * 9800 * 76 / 256);
  });

  test('motion cache invalidates when an extra engine changes model but not count', () => {
    const { g } = setup(1960);
    setSetting(g.state, 'multiEngineConsists', true);
    const v = { kind: 'train', modelId: 'eng_thunder', engines: ['eng_puffer'], wagons: 1, maxSpeed: MODEL_BY_ID.eng_thunder.speed * KMH_TO_TILES_PER_TICK };
    const a = consistMotion(v, MODEL_BY_ID.eng_thunder);
    v.engines = ['eng_arrow']; // same length, different model
    const b = consistMotion(v, MODEL_BY_ID.eng_thunder);
    expect(b).not.toBe(a);
    expect(b.power).toBe((1800 + 2600) * 746);
    expect(consistMotion(v, MODEL_BY_ID.eng_thunder)).toBe(b); // stable list, cache reused
  });
});

describe('on: depot add/remove, clone, limit, save, autoreplace', () => {
  test('add and remove an extra engine in a depot (cost, refund, max speed refresh)', () => {
    const { g, L } = setup(1950);
    setSetting(g.state, 'multiEngineConsists', true);
    const v = g.buyVehicle(L.depotId, { modelId: 'eng_comet', wagons: 0 }).vehicle;
    const money = g.state.company.money;
    const add = g.addEngine(v.id, 'eng_puffer');
    expect(add.ok).toBe(true);
    expect(add.engines).toBe(2);
    expect(v.engines).toEqual(['eng_puffer']);
    expect(g.state.company.money).toBe(money - add.cost);
    expect(v.maxSpeed).toBe(MODEL_BY_ID.eng_puffer.speed * KMH_TO_TILES_PER_TICK);
    const rem = g.removeEngine(v.id);
    expect(rem.ok).toBe(true);
    expect(rem.cost).toBeGreaterThan(0);
    expect(Object.prototype.hasOwnProperty.call(v, 'engines')).toBe(false);
    expect(v.maxSpeed).toBe(MODEL_BY_ID.eng_comet.speed * KMH_TO_TILES_PER_TICK);
    expect(g.removeEngine(v.id).ok).toBe(false);
  });

  test('depot edits require an empty train and a depot', () => {
    const { g, L } = setup(1960);
    setSetting(g.state, 'multiEngineConsists', true);
    const v = g.buyVehicle(L.depotId, { modelId: 'eng_thunder', wagons: 1, cargoId: 'COAL' }).vehicle;
    v.load.amount = 5;
    expect(g.addEngine(v.id, 'eng_puffer').ok).toBe(false);
    v.load.amount = 0;
    v.state = 'moving';
    expect(g.addEngine(v.id, 'eng_puffer').ok).toBe(false);
  });

  test('cap: at most MAX_EXTRA_ENGINES extras (4 engines total)', () => {
    const { g, L } = setup(1950);
    setSetting(g.state, 'multiEngineConsists', true);
    const v = g.buyVehicle(L.depotId, { modelId: 'eng_comet', wagons: 0 }).vehicle;
    for (let i = 0; i < MAX_EXTRA_ENGINES; i++) expect(g.addEngine(v.id, 'eng_puffer').ok).toBe(true);
    expect(extraEngineCount(v)).toBe(MAX_EXTRA_ENGINES);
    const extra = g.addEngine(v.id, 'eng_puffer');
    expect(extra.ok).toBe(false);
    expect(extra.error).toContain('at most 4 engines');
    expect(g.buyVehicle(L.depotId, { modelId: 'eng_comet', engines: new Array(MAX_EXTRA_ENGINES + 1).fill('eng_puffer') }).ok).toBe(false);
  });

  test('clone keeps the lead-block engine list at the normal summed price', () => {
    const { g, L } = setup(1950);
    setSetting(g.state, 'multiEngineConsists', true);
    const v = g.buyVehicle(L.depotId, { modelId: 'eng_comet', wagonModelId: 'wag_hopper', wagons: 1, cargoId: 'COAL', engines: ['eng_puffer'] }).vehicle;
    const c = g.cloneVehicle(v.id, { shareOrders: false });
    expect(c.ok).toBe(true);
    expect(c.vehicle.engines).toEqual(['eng_puffer']);
    expect(engineList(c.vehicle)).toEqual(['eng_comet', 'eng_puffer']);
    const plain = g.buyVehicle(L.depotId, { modelId: 'eng_comet', wagonModelId: 'wag_hopper', wagons: 1, cargoId: 'COAL', engines: ['eng_puffer'] }, { dryRun: true });
    expect(c.cost).toBe(plain.cost);
  });

  test('save/load round-trip keeps v.engines and the same motion', () => {
    const { g, L } = setup(1950);
    setSetting(g.state, 'multiEngineConsists', true);
    const v = g.buyVehicle(L.depotId, { modelId: 'eng_comet', wagonModelId: 'wag_hopper', wagons: 1, cargoId: 'COAL', engines: ['eng_puffer'] }).vehicle;
    const before = consistMotion(v, MODEL_BY_ID.eng_comet);
    const s = parseState(serializeState(g.state));
    const v2 = s.vehicles.find((x) => x.id === v.id);
    expect(v2.engines).toEqual(['eng_puffer']);
    const after = consistMotion(v2, MODEL_BY_ID.eng_comet);
    expect(after.mass).toBe(before.mass);
    expect(after.power).toBe(before.power);
    expect(after.te).toBe(before.te);
    expect(getSetting(s, 'multiEngineConsists')).toBe(true);
  });

  test('autoreplace maps each extra engine through its rule; no rule keeps it', () => {
    const { g, L } = setup(1965);
    setSetting(g.state, 'multiEngineConsists', true);
    const v = g.buyVehicle(L.depotId, { modelId: 'eng_thunder', wagons: 0, engines: ['eng_comet', 'eng_thunder'] }).vehicle;
    expect(g.setAutoreplace('eng_comet', 'eng_thunder').ok).toBe(true);
    const nv = autorenewVehicle(g.ctx, v);
    expect(nv).not.toBe(null);
    expect(nv.modelId).toBe('eng_thunder'); // lead has no rule
    expect(nv.engines).toEqual(['eng_thunder', 'eng_thunder']); // remapped / kept
  });

  test('the vehicle limit counts the consist once, not its engines', () => {
    const { g, L } = setup(1950);
    setSetting(g.state, 'multiEngineConsists', true);
    setSetting(g.state, 'maxTrains', 1);
    const v = g.buyVehicle(L.depotId, { modelId: 'eng_comet', wagons: 0 }).vehicle;
    expect(g.addEngine(v.id, 'eng_puffer').ok).toBe(true); // still one train
    expect(g.buyVehicle(L.depotId, { modelId: 'eng_comet', wagons: 0 }).ok).toBe(false);
  });

  test('non-train purchases are unaffected by an engines list', () => {
    const { g, L } = setup(1960);
    setSetting(g.state, 'multiEngineConsists', true);
    const depot = g.state.depots.find((d) => d.id === L.depotId);
    const road = g.state.depots.find((d) => d.kind === 'road') || depot;
    const r = g.buyVehicle(road.id, { modelId: 'bus_city', engines: ['eng_puffer'] });
    // wrong depot kind on purpose: either way no engine list is attached and the error is the usual one
    if (r.ok) {
      expect(Object.prototype.hasOwnProperty.call(r.vehicle, 'engines')).toBe(false);
      expect(engineList(r.vehicle)).toEqual([]);
    } else {
      expect(Object.prototype.hasOwnProperty.call(r, 'vehicle')).toBe(false);
    }
  });
});

describe('on: consist length and drawing', () => {
  function moving(v) {
    v.state = 'moving';
    v.path = [{ x: v.tx, y: v.ty }, { x: v.tx + 1, y: v.ty }];
    v.progress = 0;
    v.history = [{ x: v.tx + 1, y: v.ty }, { x: v.tx, y: v.ty }];
    return v;
  }

  test('extra engines add loco segments and platform length; default stays one loco', () => {
    const { g, L } = setup(1950);
    setSetting(g.state, 'multiEngineConsists', true);
    const v = g.buyVehicle(L.depotId, { modelId: 'eng_comet', wagonModelId: 'wag_hopper', wagons: 2, cargoId: 'COAL', engines: ['eng_puffer'] }).vehicle;
    expect(trainLengthTiles(v)).toBe(4 * SEGMENT_SPACING);
    const segs = getVehicleSegments(moving(v));
    expect(segs.filter((s) => s.part === 'loco').length).toBe(2);
    expect(segs.filter((s) => s.part === 'wagon').length).toBe(2);

    const { g: g2, L: L2 } = setup(1950);
    const plain = g2.buyVehicle(L2.depotId, { modelId: 'eng_comet', wagonModelId: 'wag_hopper', wagons: 2, cargoId: 'COAL' }).vehicle;
    expect(trainLengthTiles(plain)).toBe(3 * SEGMENT_SPACING);
    expect(getVehicleSegments(moving(plain)).filter((s) => s.part === 'loco').length).toBe(1);
  });
});
