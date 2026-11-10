// OpenTTD economy.dist_local_authority (def 20, min 5) and station.modified_catchment (def true).
import { test, expect, describe } from 'bun:test';
import { flatGame } from './helpers.js';
import { DEFAULT_SETTINGS, setSetting, getSetting } from '../js/simulation/settings.js';
import { localAuthorityDist, authorityTown, LOCAL_AUTHORITY_DIST } from '../js/simulation/townAuthority.js';
import { catchRadius, catchmentTiles, CATCHMENT_UNMODIFIED } from '../js/simulation/stations.js';
import { Game } from '../js/simulation/game.js';
import { SETTING_META } from '../js/ui/settingsGroups.js';

const townState = (settings = {}) => ({
  towns: [{ id: 1, name: 'T', x: 10, y: 10 }],
  settings,
  map: { width: 40, height: 40, tiles: [] },
});

describe('dist_local_authority (distLocalAuthority)', () => {
  test('defaults to 20, the existing LOCAL_AUTHORITY_DIST', () => {
    expect(DEFAULT_SETTINGS.distLocalAuthority).toBe(20);
    expect(localAuthorityDist(townState())).toBe(LOCAL_AUTHORITY_DIST);
    expect(LOCAL_AUTHORITY_DIST).toBe(20);
  });

  test('authorityTown uses the setting: a tile 12 away is governed at 20, not at 5', () => {
    const st = townState();
    expect(authorityTown(st, 22, 10)?.id).toBe(1);
    setSetting(st, 'distLocalAuthority', 5);
    expect(localAuthorityDist(st)).toBe(5);
    expect(authorityTown(st, 22, 10)).toBeNull();
    expect(authorityTown(st, 14, 10)?.id).toBe(1);
  });

  test('values below the OpenTTD minimum (5) are clamped to 5', () => {
    const st = townState({ distLocalAuthority: 1 });
    expect(localAuthorityDist(st)).toBe(5);
  });

  test('a larger radius extends the authority area', () => {
    const st = townState({ distLocalAuthority: 40 });
    expect(authorityTown(st, 40, 10)?.id).toBe(1);
  });

  test('is registered in settings UI meta (difficulty group)', () => {
    const meta = SETTING_META.find((m) => m.key === 'distLocalAuthority');
    expect(meta).toBeDefined();
    expect(meta.group).toBe('difficulty');
  });
});

describe('modified_catchment (modifiedCatchment)', () => {
  const bus = { kind: 'bus' };
  const rail = { kind: 'rail' };

  test('defaults to true (per-type radius, current behaviour)', () => {
    expect(DEFAULT_SETTINGS.modifiedCatchment).toBe(true);
    expect(catchRadius(townState(), bus)).toBe(3);
    expect(catchRadius(townState(), rail)).toBe(4);
  });

  test('off: every station tile catches CA_UNMODIFIED (4), as in OpenTTD', () => {
    const st = townState({ modifiedCatchment: false });
    expect(CATCHMENT_UNMODIFIED).toBe(4);
    expect(catchRadius(st, bus)).toBe(4);
    expect(catchRadius(st, rail)).toBe(4);
  });

  test('catchment area grows when off (bus station: 7x7 -> 9x9)', () => {
    const station = { x: 10, y: 10, tiles: [{ x: 10, y: 10, kind: 'bus' }] };
    const on = catchmentTiles(townState(), station).length;
    const off = catchmentTiles(townState({ modifiedCatchment: false }), station).length;
    expect(on).toBe(49);
    expect(off).toBe(81);
  });

  test('is registered in settings UI meta (construction group)', () => {
    const meta = SETTING_META.find((m) => m.key === 'modifiedCatchment');
    expect(meta).toBeDefined();
    expect(meta.group).toBe('construction');
  });
});

describe('save/load and live toggle', () => {
  test('both settings survive save/load', () => {
    const g = flatGame();
    setSetting(g.state, 'distLocalAuthority', 30);
    setSetting(g.state, 'modifiedCatchment', false);
    const back = Game.deserialize(g.serialize());
    expect(getSetting(back.state, 'distLocalAuthority')).toBe(30);
    expect(getSetting(back.state, 'modifiedCatchment')).toBe(false);
  });

  test('a fresh game (no state.settings) reads the defaults', () => {
    const g = flatGame();
    expect(getSetting(g.state, 'distLocalAuthority')).toBe(20);
    expect(getSetting(g.state, 'modifiedCatchment')).toBe(true);
  });
});
