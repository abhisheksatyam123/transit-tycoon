/**
 * OpenGFX dispatcher for building tiles (houses and industries). Landmarks, stations and depots
 * stay procedural. Called from layers/objects.js drawObject when packActive().
 */
import { HALF_H } from '../iso.js';
import { drawOgfxHouse } from './houses.js';
import { drawOgfxIndustryTile } from './industries.js';
import { industryStyle, industryPiece } from '../sprites/buildings.js';

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {any} tile
 * @param {number} x tile x
 * @param {number} y tile y
 * @param {number} sx tile centre screen x
 * @param {number} sy tile centre screen y
 * @param {(id:number)=>any} industryById
 * @returns {string|null|false} smoke piece for industries, null for houses, false = not drawn (use procedural)
 */
export function drawOgfxBuilding(ctx, tile, x, y, sx, sy, industryById) {
  const b = tile.building;
  const topX = sx, topY = sy - HALF_H;
  if (b.type === 'house') return drawOgfxHouse(ctx, b, x, y, topX, topY) ? null : false;
  const ind = industryById(b.industryId);
  if (!ind) return false;
  if (!drawOgfxIndustryTile(ctx, ind, x, y, topX, topY)) return false;
  const style = industryStyle(ind.typeId);
  return industryPiece(style, x - ind.x, y - ind.y, ind.w || 1);
}
