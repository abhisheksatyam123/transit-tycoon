import { test, expect, describe } from 'bun:test';
import { translit, englishName } from '../js/simulation/scenarios/translit.js';

describe('translit', () => {
  test('letters map to simplified BGN/PCGN', () => {
    expect(translit('физтех')).toBe('fiztekh');
    expect(translit('Сокольники')).toBe('Sokolniki');
    expect(translit('Алма-Атинская')).toBe('Alma-Atinskaya');
    expect(translit('Щёлково')).toBe('Shchyolkovo');
  });
  test('hard/soft signs drop; ц ч ш щ ж х get digraphs', () => {
    expect(translit('Объединённая')).toBe('Obedinyonnaya');
    expect(translit('Тёплый Стан')).toBe('Tyoplyy Stan');
    expect(translit('Щукинская')).toBe('Shchukinskaya');
    expect(translit('Хорошёво')).toBe('Khoroshyovo');
  });
  test('non-Cyrillic and empty pass through', () => {
    expect(translit('Kremlin')).toBe('Kremlin');
    expect(translit('')).toBe('');
    expect(translit('12-й переключатель')).toBe('12-y pereklyuchatel');
  });
  test('deterministic', () => {
    expect(translit('Новогиреево')).toBe(translit('Новогиреево'));
  });
});

describe('englishName', () => {
  test('prefers OSM name:en', () => {
    expect(englishName('Северное Бутово', 'Severnoye Butovo')).toBe('Severnoye Butovo');
  });
  test('falls back to transliteration', () => {
    expect(englishName('Старые Химки')).toBe('Starye Khimki');
    expect(englishName('Савёлки')).toBe('Savyolki');
  });
  test('translates a leading settlement word', () => {
    expect(englishName('посёлок Ухтомского')).toBe('Settlement Ukhtomskogo');
  });
});
