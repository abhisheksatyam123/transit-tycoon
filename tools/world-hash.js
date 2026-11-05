#!/usr/bin/env bun
/**
 * Print a short hash of a random world's serialized state after N days, to prove changes
 * leave random (non-scenario) worlds identical. Usage: bun tools/world-hash.js [seed] [days]
 */
import { Game } from '../js/simulation/game.js';
import { serializeState } from '../js/simulation/save.js';
import { TICKS_PER_DAY } from '../js/simulation/constants.js';

const seed = Number(process.argv[2] || 1), days = Number(process.argv[3] || 60);
const g = Game.create({ seed });
g.stepDays(days);
const s = serializeState(g.state);
const h = new Bun.CryptoHasher('sha256').update(s).digest('hex').slice(0, 16);
console.log(`seed ${seed} days ${days} hash ${h} chars ${s.length}`);
