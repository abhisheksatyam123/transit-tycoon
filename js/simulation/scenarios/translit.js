/**
 * Moscow scenario: deterministic Cyrillic -> Latin transliteration (simplified BGN/PCGN-like),
 * used for station, line and district names when the baked OSM data has no name:en.
 * Pure: the same input always gives the same output. Non-Cyrillic characters pass through.
 */

const LOWER = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh', з: 'z', и: 'i', й: 'y',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
  х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

/** Whole-word generic terms (lowercase Cyrillic -> English), applied when they start a name. */
const WORDS = { 'посёлок': 'Settlement', 'поселок': 'Settlement', 'микрорайон': 'Microdistrict' };

/**
 * Transliterate one Cyrillic string to Latin script.
 * @param {string} s
 * @returns {string}
 */
export function translit(s) {
  if (typeof s !== 'string' || !/[\u0400-\u04FF]/.test(s)) return s ?? '';
  let out = '';
  for (const ch of s) {
    const lower = ch.toLowerCase();
    const t = LOWER[lower];
    if (t === undefined) { out += ch; continue; }
    if (ch !== lower) {
      // capitalise: first letter of a token or a whole-uppercase letter pair; keep simple: upper the first char of the output
      out += t.length ? t[0].toUpperCase() + t.slice(1) : '';
    } else out += t;
  }
  return out;
}

/**
 * English name for a Moscow scenario entity: explicit name:en if present, else a transliteration
 * of the Russian name (with a generic-term translation for leading "посёлок"/"микрорайон").
 * @param {string} name Russian name
 * @param {string} [nameEn] OSM name:en
 * @returns {string}
 */
export function englishName(name, nameEn) {
  if (nameEn) return nameEn;
  if (!name) return '';
  const m = /^(\S+)(\s+.*)?$/.exec(name);
  const head = m && WORDS[m[1].toLowerCase()];
  if (head) return head + translit(m[2] || '');
  return translit(name);
}
