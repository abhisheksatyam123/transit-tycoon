/**
 * Moscow-only data and builder. Import this (or await loadMoscowData()) before creating, loading or
 * drawing a Moscow game. Random games never import it.
 */
import { MOSCOW } from '../../config/maps/moscow.js';
import { LM3D } from '../../config/landmarks3d.js';
import { buildMoscow } from './moscow.js';
import { registerMoscowData } from './moscowRegistry.js';

registerMoscowData({ map: MOSCOW, lm3d: LM3D, build: buildMoscow });
