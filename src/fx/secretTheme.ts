/**
 * The Secret Shop's midnight look (secret-shop/DESIGN.md 6): deep indigo
 * panels, gold keylines, violet accents. Every ink here is AA on every
 * surface here (tools/tests/secret-shop.test.cjs checks the pairs).
 */
export const SECRET_THEME = {
  /** Screen floor behind the shelves. */
  floor: '#160f3d',
  /** The hero stage sky, top to bottom. */
  sky: ['#2b1f6b', '#1b1446'] as const,
  /** Shelf panels, the try-on sheet. */
  panel: '#2a1d6e',
  /** Cards raised inside a panel. */
  card: '#3a2a8a',
  /** Pills on a panel. */
  well: '#20165a',
  ink: '#ffffff',
  inkSoft: '#e8defd',
  inkGold: '#ffe07a',
  border: '#d9c6ff',
  gold: '#ffd34d',
  violet: '#8f6bff',
  /** Secret tile plate: midnight violet, so the animated piece glows on it; white ink (AA). */
  tilePlate: ['#4a33a8', '#1f1558'] as const,
} as const;
