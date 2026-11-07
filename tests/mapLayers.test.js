/** Owners and Vegetation map layers (OTTD smallmap owner / vegetation views). */
import { test, expect, describe } from 'bun:test';
import { tileRgb, ownerRgb, vegetationRgb, hexToRgb, MAP_MODES, TOWN_OWNER_COLOR, VEGETATION_COLORS } from '../js/ui/windows/map.js';
import { DEFAULT_PLAYER_COLOUR } from '../js/simulation/companyColour.js';

describe('map layers: owners and vegetation', () => {
  test('modes include owners and vegetation after the original five', () => {
    expect(MAP_MODES.map(([k]) => k)).toEqual(['terrain', 'industries', 'routes', 'vehicles', 'towns', 'owners', 'vegetation']);
  });

  test('owners: player tiles use the player colour, rivals their colour, towns the town colour', () => {
    const ext = { playerHex: '#112233', rivals: new Map([[5, '#445566']]), stationOwner: new Map([[9, null], [10, 5]]) };
    expect(ownerRgb({ terrain: 'grass', owner: 'company' }, ext)).toEqual([0x11, 0x22, 0x33]);
    expect(ownerRgb({ terrain: 'grass', owner: 'rival', rivalId: 5 }, ext)).toEqual([0x44, 0x55, 0x66]);
    expect(ownerRgb({ terrain: 'grass', building: { type: 'station', stationId: 9 } }, ext)).toEqual([0x11, 0x22, 0x33]);
    expect(ownerRgb({ terrain: 'grass', building: { type: 'station', stationId: 10 } }, ext)).toEqual([0x44, 0x55, 0x66]);
    expect(ownerRgb({ terrain: 'grass', building: { type: 'house' } }, ext)).toEqual(hexToRgb(TOWN_OWNER_COLOR));
    // unowned land is a dim terrain tint, never a company colour
    const free = ownerRgb({ terrain: 'grass', owner: null }, ext);
    expect(free).not.toEqual([0x11, 0x22, 0x33]);
  });

  test('owners: default player colour when no colour is set', () => {
    expect(ownerRgb({ terrain: 'grass', owner: 'company' }, {})).toEqual(hexToRgb(DEFAULT_PLAYER_COLOUR));
  });

  test('vegetation: each ground type maps to its OTTD clear colour', () => {
    expect(vegetationRgb({ terrain: 'grass' })).toEqual(hexToRgb(VEGETATION_COLORS.grass));
    expect(vegetationRgb({ terrain: 'forest' })).toEqual(hexToRgb(VEGETATION_COLORS.trees));
    expect(vegetationRgb({ terrain: 'rock' })).toEqual(hexToRgb(VEGETATION_COLORS.rough));
    expect(vegetationRgb({ terrain: 'desert' })).toEqual(hexToRgb(VEGETATION_COLORS.desert));
    expect(vegetationRgb({ terrain: 'snow' })).toEqual(hexToRgb(VEGETATION_COLORS.snow));
    expect(vegetationRgb({ terrain: 'water' })).toEqual(hexToRgb(VEGETATION_COLORS.water));
    expect(vegetationRgb({ terrain: 'grass', field: 1 })).toEqual(hexToRgb(VEGETATION_COLORS.fields));
    expect(vegetationRgb({ terrain: 'grass', road: 1 })).toEqual(hexToRgb(VEGETATION_COLORS.buildings));
    expect(vegetationRgb({ terrain: 'grass', building: { type: 'house' } })).toEqual(hexToRgb(VEGETATION_COLORS.buildings));
  });

  test('tileRgb dispatches the new modes', () => {
    const t = { terrain: 'forest' };
    expect(tileRgb(t, 'vegetation')).toEqual(vegetationRgb(t));
    expect(tileRgb({ terrain: 'grass', owner: 'company' }, 'owners', null, { playerHex: '#010203' })).toEqual([1, 2, 3]);
  });

  test('existing terrain layer output is unchanged', () => {
    expect(tileRgb({ terrain: 'grass', height: 0 }, 'terrain')).toEqual([63, 110, 41]); // grass * contourFactor(0)=0.8
  });
});
