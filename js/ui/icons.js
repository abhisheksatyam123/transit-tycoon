/**
 * Inline SVG icons for toolbar buttons (24x24 viewBox, stroke-based, currentColor).
 */

/** @type {Record<string,string>} SVG inner markup per icon name */
const PATHS = {
  pause: '<path d="M8 5v14M16 5v14" stroke-width="3"/>',
  play1: '<path d="M8 5l10 7-10 7z" fill="currentColor"/>',
  play2: '<path d="M4 6l8 6-8 6zM12 6l8 6-8 6z" fill="currentColor"/>',
  play4: '<path d="M2 7l5 5-5 5zM7 7l5 5-5 5zM12 7l5 5-5 5zM17 7l5 5-5 5z" fill="currentColor"/>',
  rail: '<path d="M8 3L5 21M16 3l3 18M6.5 7h11M6 12h12M5.3 17h13.4"/>',
  road: '<path d="M7 3L4 21M17 3l3 18M12 4v3M12 10v4M12 17v3"/>',
  station: '<path d="M3 10h18M5 10V7l7-4 7 4v3M6 10v8M18 10v8M3 20h18M9 14h6"/>',
  airport: '<path d="M10.5 3h3v7l7 4v2l-7-2v5l2.5 2v1.5L12 20.5l-3 .5V19.5l2.5-2v-5l-7 2v-2l7-4z"/>',
  bus: '<rect x="5" y="4" width="14" height="13" rx="2"/><path d="M5 11h14M8 20v-3M16 20v-3"/><circle cx="8.5" cy="14" r="1"/><circle cx="15.5" cy="14" r="1"/>',
  truck: '<path d="M2 6h11v10H2zM13 9h4l3 4v3h-7z"/><circle cx="6" cy="18" r="2"/><circle cx="16" cy="18" r="2"/>',
  railDepot: '<path d="M3 21V9l9-6 9 6v12M8 21v-7h8v7M8 17.5h8"/>',
  roadDepot: '<path d="M3 21V9l9-6 9 6v12M7 21v-8h10v8M10 13v8M14 13v8"/>',
  demolish: '<path d="M14 4l6 6-9 9H5v-6zM4 21h16M11 7l6 6"/>',
  query: '<circle cx="11" cy="11" r="7"/><path d="M16 16l5 5M11 8v.01M11 11v3"/>',
  vehicles: '<rect x="3" y="7" width="13" height="10" rx="2"/><path d="M16 10h3l2 3v4h-5"/><circle cx="7" cy="18" r="1.5"/><circle cx="17" cy="18" r="1.5"/>',
  finances: '<path d="M12 2v20M17 6H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>',
  stations: '<path d="M4 20V9h16v11M4 9l8-5 8 5M9 20v-5h6v5"/>',
  towns: '<path d="M3 21V10l5-3 5 3v11M13 21V5l4-2 4 2v16M6 13h4M6 17h4M16 9h2M16 13h2M16 17h2M2 21h20"/>',
  industries: '<path d="M2 21V11l6 4V11l6 4V5h4v16zM2 21h20"/>',
  news: '<path d="M4 5h13v14H6a2 2 0 01-2-2zM17 9h3v8a2 2 0 01-2 2M7 9h7M7 13h7M7 16h4"/>',
  save: '<path d="M5 3h11l3 3v15H5zM8 3v6h7V3M8 21v-7h8v7"/>',
  load: '<path d="M3 7h6l2 2h10v11H3zM12 17v-6M9 14l3-3 3 3"/>',
  newGame: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 015 .5c0 1.5-2.5 2-2.5 3.5M12 17v.01"/>',
  metro: '<circle cx="12" cy="12" r="9"/><path d="M8 16V8l4 5 4-5v8"/>',
  traffic: '<circle cx="12" cy="12" r="9"/><path d="M12 12l4-5M7 15h2M15 15h2"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/>',
  goals: '<path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17l-6.1 3.6 1.4-6.8L2.2 9.1l6.9-.8z"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
  subsidies: '<circle cx="12" cy="12" r="9"/><path d="M14.5 9a3 3 0 0 0-5 1c0 3 5 2 5 5a3 3 0 0 1-5 1M12 6v2M12 16v2"/>',
  issues: '<path d="M12 3L2 20h20zM12 9v5M12 17v.01"/>',
  soundOn: '<path d="M4 9h4l5-4v14l-5-4H4zM16 9a4 4 0 010 6M18.5 6.5a8 8 0 010 11"/>',
  soundOff: '<path d="M4 9h4l5-4v14l-5-4H4zM17 9l5 6M22 9l-5 6"/>',
};

/**
 * Build an inline SVG icon element.
 * @param {string} name
 * @returns {SVGSVGElement}
 */
export function icon(name) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = /** @type {SVGSVGElement} */ (document.createElementNS(NS, 'svg'));
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '18');
  svg.setAttribute('height', '18');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = PATHS[name] || PATHS.query;
  return svg;
}
