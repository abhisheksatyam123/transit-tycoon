/**
 * Boot-time autosave protection: when the 'autosave' slot exists but could not be read/deserialized, the
 * session starts a fresh game. Keep that recoverable slot untouched for the rest of the session (the rotating
 * auto-1..3 ring may still be written) until the player saves to a manual slot or loads a game successfully.
 * Nothing here changes the save format.
 */
let locked = false;

/** Stop writing the 'autosave' slot for this session (boot load failed). */
export function lockAutosaveSlot() { locked = true; }

/** A manual save or a successful load proved the session healthy: allow 'autosave' writes again. */
export function unlockAutosaveSlot() { locked = false; }

/** @returns {boolean} true while the 'autosave' slot must not be overwritten. */
export function autosaveSlotLocked() { return locked; }

/**
 * Should a write to `slot` happen? Only the 'autosave' slot can be blocked; the auto-1..3 ring is always allowed.
 * @param {string} slot
 * @returns {boolean}
 */
export function shouldWriteAutosave(slot) { return slot !== 'autosave' || !locked; }

/** Test helper: clear the guard (the game itself never needs this). */
export function resetAutosaveGuard() { locked = false; }
