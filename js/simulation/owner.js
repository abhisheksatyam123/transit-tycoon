/**
 * Company ownership of vehicles, stations and depots (gap #25 stage 1, AI competitors).
 * The player owns everything that has no `ownerId`; an AI rival's entities carry `ownerId: <rival id>`.
 * Money (income, running costs, purchases) of an entity goes to companyOf(state, entity).
 */

/** Error text for a player command on a rival asset. */
export const RIVAL_OWNED = 'Owned by a rival company';

/** The company record that pays for / earns from an entity (player = state.company). */
export function companyOf(state, entity) {
  if (entity && entity.ownerId != null) {
    const r = companyById(state, entity.ownerId);
    if (r) return r;
  }
  return state.company;
}

/** Company record for an owner id (null/undefined = player); null when the rival does not exist. */
export function companyById(state, ownerId) {
  if (ownerId == null) return state.company;
  return (state.rivals || []).find((r) => r.id === ownerId) || null;
}

/** True when `opts.owner` (null = player) does not own `entity`: a command must refuse it. */
export function ownerMismatch(entity, opts = {}) {
  return ((entity && entity.ownerId) ?? null) !== ((opts && opts.owner) ?? null);
}

/** Give an entity to a rival (ownerId + the rival's list); the player keeps no field. */
export function stampOwner(state, entity, ownerId) {
  if (ownerId == null) return entity;
  const r = companyById(state, ownerId);
  if (!r) return entity;
  entity.ownerId = ownerId;
  return entity;
}
