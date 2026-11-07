/**
 * Player company colour (OpenTTD company colour choice, CmdSetCompanyColour). The 16 OpenTTD company
 * colours; the three AI rival colours are part of the palette so a colour can be taken by a rival.
 * Stored lazily: state.company.colour is set only when the player picks a colour (absent = default yellow).
 */

/** Default player colour (the value the companies window always showed). */
export const DEFAULT_PLAYER_COLOUR = '#f5b300';

/** The 16 company colours (hex approximations of OpenTTD's company palette). */
export const COMPANY_COLOURS = [
  { id: 0, name: 'Dark Blue', hex: '#1d3b8f' },
  { id: 1, name: 'Pale Green', hex: '#9fd39a' },
  { id: 2, name: 'Pink', hex: '#f29ac0' },
  { id: 3, name: 'Orange', hex: '#f2921d' },
  { id: 4, name: 'Dark Green', hex: '#1e6b34' },
  { id: 5, name: 'Blue', hex: '#2b7fd9' },
  { id: 6, name: 'Cream', hex: '#efe2b8' },
  { id: 7, name: 'Mauve', hex: '#b070c0' },
  { id: 8, name: 'Purple', hex: '#6a2ca0' },
  { id: 9, name: 'Red', hex: '#d9482b' },
  { id: 10, name: 'Light Blue', hex: '#8fd3f0' },
  { id: 11, name: 'Brown', hex: '#7a4a1e' },
  { id: 12, name: 'Grey', hex: '#8c8c8c' },
  { id: 13, name: 'White', hex: '#f4f4f4' },
  { id: 14, name: 'Yellow', hex: DEFAULT_PLAYER_COLOUR },
  { id: 15, name: 'Light Green', hex: '#3aa35a' },
];

/** The player's colour: the chosen one, else the default. */
export function playerColourOf(state) {
  return (state && state.company && state.company.colour) || DEFAULT_PLAYER_COLOUR;
}

/**
 * CmdSetCompanyColour: the player picks one of COMPANY_COLOURS. Refused when a rival already uses it.
 * @param {{state:any}} ctx
 * @param {string} hex
 * @returns {{ok:true,cost:number}|{ok:false,error:string}}
 */
export function setCompanyColour(ctx, hex) {
  const { state } = ctx;
  const h = String(hex || '').toLowerCase();
  if (!COMPANY_COLOURS.some((c) => c.hex === h)) return { ok: false, error: 'Unknown company colour' };
  if ((state.rivals || []).some((r) => String(r.colour || '').toLowerCase() === h)) {
    return { ok: false, error: 'That colour is already used by a rival company' };
  }
  if (state.company.colour !== h) state.company.colour = h;
  return { ok: true, cost: 0 };
}
