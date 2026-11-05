/**
 * Ported from OpenLoco (MIT), https://github.com/OpenLoco/OpenLoco
 * Source: src/GameCommands/Track/{CreateTrackMod,RemoveTrackMod}.cpp (0x004A6479, 0x004A668A),
 *         src/GameCommands/Road/{CreateRoadMod,RemoveRoadMod}.cpp (0x0047A21E, ...).
 * args: {pos, rotation, trackId|roadId, index, trackObjType|roadObjType, type (bitmask of mods), modSection}
 *       modSection: ModSection.single=0 | block=1 | allConnected=2.
 * result.cost for create = build cost of the mods not yet present (sum over the section); remove = sell cost of present mods.
 */
import { getTrackPiece, getRoadPiece } from '../trackData.js';
import { AdditionalTaDFlags } from '../trackEnum.js';
import { Flags, FAILURE, hasFlags, defineCommand, setPosition, setErrorText, checkCompanyCompatibility } from './gameCommands.js';
import { findTrackPiece, findRoadPiece, pieceStart } from './common.js';
import { modsToNetwork } from './network.js';

function trackMod(apply) {
  return (ctx, a, flags) => {
    setPosition(ctx, a.pos);
    const el = findTrackPiece(ctx.tm, a.pos, a.rotation, a.index, a.trackObjType, a.trackId);
    if (!el || !checkCompanyCompatibility(ctx, el.owner())) return FAILURE;
    const piece = getTrackPiece(el.trackId())[el.sequenceIndex()];
    const first = pieceStart(a.pos, piece, el.rotation());
    const tad = (el.trackId() << 3) | el.rotation();
    const r = modsToNetwork(ctx, { pos: first, tad: tad & AdditionalTaDFlags.basicTaDMask, company: el.owner(), objType: a.trackObjType, flags, modSection: a.modSection || 0, modIds: a.type, apply, isRoad: false });
    if (apply && r.allPlacementsFailed) { setErrorText(ctx, 'track_road_unsuitable'); return FAILURE; }
    if (apply && r.networkTooComplex && hasFlags(flags, Flags.apply) && !hasFlags(flags, Flags.ghost)) ctx.warning = 'too_much_track_some_track_not_upgraded';
    return r.cost;
  };
}
function roadMod(apply) {
  return (ctx, a, flags) => {
    setPosition(ctx, a.pos);
    const el = findRoadPiece(ctx.tm, a.pos, a.rotation, a.index, a.roadObjType, a.roadId);
    if (!el || !checkCompanyCompatibility(ctx, el.owner())) return FAILURE;
    const piece = getRoadPiece(el.roadId())[el.sequenceIndex()];
    const first = pieceStart(a.pos, piece, el.rotation());
    const rad = (el.roadId() << 3) | el.rotation();
    const r = modsToNetwork(ctx, { pos: first, tad: rad, company: el.owner(), objType: a.roadObjType, flags, modSection: a.modSection || 0, modIds: a.type, apply, isRoad: true });
    if (apply && r.allPlacementsFailed) { setErrorText(ctx, 'track_road_unsuitable'); return FAILURE; }
    if (apply && r.networkTooComplex && hasFlags(flags, Flags.apply) && !hasFlags(flags, Flags.ghost)) ctx.warning = 'too_much_track_some_track_not_upgraded';
    return r.cost;
  };
}
export const createTrackModCommand = defineCommand(trackMod(true), 'createTrackMod');
export const removeTrackModCommand = defineCommand(trackMod(false), 'removeTrackMod');
export const createRoadModCommand = defineCommand(roadMod(true), 'createRoadMod');
export const removeRoadModCommand = defineCommand(roadMod(false), 'removeRoadMod');
