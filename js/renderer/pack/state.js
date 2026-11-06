/**
 * Shared OpenGFX pack state. `pack` is the loaded base pack (null until ready or when disabled);
 * `extra` is the separate EXTRA pack (canals, locks, river slopes, tram overlays; assets/opengfx/extra),
 * which arrives after the base pack and may stay null. Layers check the flags and fall back to procedural art.
 */
export const packState = { pack: null, extra: null, enabled: true };

/** Pack active for drawing: loaded and enabled. Layers test this flag. */
export function packActive() { return !!(packState.pack && packState.enabled); }
