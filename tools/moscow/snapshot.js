#!/usr/bin/env bun
/**
 * Bake the default Moscow day-0 game (scenario 'moscow', seed 1) to assets/scenarios/moscow-day0.json
 * so the browser can deserialize it instead of spending ~3.6 s building it at page load.
 * Regenerate after any change to the Moscow bake, scenario build code, landmarks or save format:
 *   bun run snapshot:moscow
 * tests/moscowSnapshot.test.js fails ("stale snapshot") when the file no longer matches a fresh build.
 */
import { Game } from '../../js/simulation/game.js';
import { SNAPSHOT_PATH, SNAPSHOT_META_PATH, SNAPSHOT_REQUEST } from '../../js/ui/scenarioSnapshot.js';
import { createHash } from 'crypto';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';

const root = resolve(import.meta.dir, '../..');
const json = Game.create({ ...SNAPSHOT_REQUEST }).serialize();
const sha256 = createHash('sha256').update(json).digest('hex');
mkdirSync(dirname(join(root, SNAPSHOT_PATH)), { recursive: true });
writeFileSync(join(root, SNAPSHOT_PATH), json);
writeFileSync(join(root, SNAPSHOT_META_PATH), JSON.stringify({ request: SNAPSHOT_REQUEST, sha256, chars: json.length }, null, 2) + '\n');
console.log(`wrote ${SNAPSHOT_PATH}: ${json.length} chars, sha256 ${sha256.slice(0, 16)}`);
