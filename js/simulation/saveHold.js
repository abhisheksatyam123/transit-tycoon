/**
 * Save hold (SV): while a time-sliced save reads the game state, the simulation must not advance and
 * player commands are blocked. Counted (nested saves are safe). Nothing saved or shown is changed by it.
 */
let holds = 0;

/** Start holding the simulation (and input). Pair with endSaveHold in a finally. */
export function beginSaveHold() { holds++; }

/** Release one hold. */
export function endSaveHold() { if (holds > 0) holds--; }

/** True while a sliced save is reading the state. */
export function saveHeld() { return holds > 0; }
