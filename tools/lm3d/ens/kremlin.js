/** Kremlin + Red Square ensemble (lead). */
import { stBasil, byBuilding } from '../styles.js';

export const KREMLIN = [
  {
    id: 'kremlin', src: 'kremlin', covers: ['kremlin', 'red_square', 'gum'], anchor: [55.7492, 37.6175], title: 'Moscow Kremlin, Red Square, St Basil\'s Cathedral & GUM', ground: 'grass',
    sel: { poly: [[55.74885, 37.61130], [55.75060, 37.61090], [55.75290, 37.61190], [55.75470, 37.61500], [55.75610, 37.61700],
      [55.75610, 37.61840], [55.75600, 37.62290], [55.75440, 37.62340], [55.75180, 37.62420], [55.75020, 37.62340], [55.74930, 37.62180]] },
    styles: [stBasil, byBuilding([
      { osm: 'r51497', wall: '#dcbb6c', roof: '#8d969a' }, // Arsenal: ochre
      { osm: 'r225033', wall: '#efe4c6', roof: '#47805e' }, // Grand Kremlin Palace: cream, green roof
      { osm: 'r1359335', wall: '#ece0bf', roof: '#47805e' }, // Armoury
      { osm: 'r3031379', wall: '#e9e7e2', roof: '#9a9c9e' }, // State Kremlin Palace: white marble + glass
      { osm: 'r3062892', wall: '#f0e2c0', roof: '#8d969a' }, // Manege
      { osm: 'r3330565', wall: '#e6d5ae', roof: '#62786c', glassRound: '#a9c6d6' }, // GUM
      { osm: 'r452031', wall: '#e6d5ae', roof: '#62786c' }, // Middle Trading Rows
      { osm: 'r5963922', wall: '#b8402f', roof: '#a3abb0', force: true, win: false }, // Historical Museum: red brick, silver roofs
      { osm: 'r7624254', wall: '#c4553f', roof: '#3f7a4f' }, // Kazan Cathedral
      { osm: 'r3272726', wall: '#6e2a26', roof: '#4a2522', win: false }, // Lenin Mausoleum: red/black granite
    ])],
    trees: true,
  },
];
