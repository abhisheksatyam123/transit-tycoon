/**
 * Shared OpenGFX pack state. `pack` is the loaded pack (null until ready or when disabled);
 * layers check it and fall back to procedural drawing when it is null.
 */
export const packState = { pack: null, enabled: true };

/** Pack active for drawing: loaded and enabled. Layers test this flag. */
export function packActive() { return !!(packState.pack && packState.enabled); }
