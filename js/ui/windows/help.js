/**
 * Help window: concise tutorial and controls reference.
 */
import { el } from '../dom.js';

const STEPS = [
  ['Find a cargo chain', 'Open Industries (I). A Coal Mine → Power Station pair a short distance apart is the classic first route. Double-click an entry to jump there.'],
  ['Build two stations', 'Pick Station (3). R rotates, [ and ] change the length. The blue area is the catchment: the mine must be inside it at one end, the power station at the other. The station window lists what it accepts.'],
  ['Connect with rail', 'Pick Rail (1) and drag from one station end to the other. Track goes along x first, then y — drag several shorter pieces for curves. Green preview = OK (cost shown), red = blocked.'],
  ['Build a depot', 'Pick Rail Depot (6), press R until the exit faces your track, and place it next to the line so the exit connects.'],
  ['Buy a train', 'Click the depot → Buy vehicle. Choose an engine, Hopper Wagons for coal, and a few wagons.'],
  ['Set orders', 'In the Orders window: Add order → click the mine station, then Add order → the power station. Tick "Full load" on the mine order. Press Start.'],
  ['Earn money', 'You are paid on delivery: farther and faster pays more. Watch income pop up and check Finances (F). Borrow if needed — interest is charged monthly.'],
  ['Grow', 'Run buses between two towns (Road, Bus Stop, Road Depot). Serving towns makes them grow. Deliver goods from secondary industries to towns.'],
];

const KEYS = [
  ['Right / middle drag, WASD, arrows', 'Pan'], ['Wheel, + / -', 'Zoom'], ['Space', 'Pause'],
  ['1 – 9', 'Build tools'], ['0', 'Airport (6×4, R rotates runway)'], ['R', 'Rotate station / depot'], ['[ ]', 'Station length'],
  ['Esc', 'Cancel tool / close window'], ['V F T I N H L', 'Vehicles, Finances, Towns, Industries, News, Help, Load'],
  ['K', 'Toggle graphics: OpenGFX / Procedural'],   ['M', 'Mute sound'], ['Click map', 'Inspect tile, station, depot, vehicle'],
];

/**
 * @param {import('../app.js').App} app
 */
export function openHelp(app) {
  return app.wm.open('help', {
    title: 'How to play',
    width: 460,
    className: 'help',
    build(body) {
      body.appendChild(el('p.lead', { text: 'Build a transport company: connect industries and towns with rail and road, run vehicles with orders, and make a profit.' }));
      const ol = el('ol.steps');
      for (const [t, d] of STEPS) ol.appendChild(el('li', null, el('b', { text: t + '. ' }), d));
      body.appendChild(ol);
      body.appendChild(el('h4.win-h', { text: 'Controls' }));
      const grid = el('div.kv-grid.keys');
      for (const [k, v] of KEYS) grid.append(el('span.kbd', { text: k }), el('span', { text: v }));
      body.appendChild(grid);
      body.appendChild(el('p.muted.small', { text: 'The game auto-saves every in-game month. Transit Tycoon JS is original code inspired by the gameplay of OpenTTD.' }));
    },
  });
}
