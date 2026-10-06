/**
 * The Secret Shop's members' vault (secret-shop/DESIGN.md 6, redesign October 5): the house
 * language at midnight. Deep navy panels in the brand blue family (never purple), one gold rim
 * on every vault panel, a darker lip under each panel, a top gloss, ribbon plate headers and
 * navy text shadows. Every ink here is AA on every surface here (tools/tests/secret-shop.test.cjs
 * checks the pairs).
 */
export const SECRET_THEME = {
  /** Screen floor behind the shelves (top and bottom of the vault gradient). */
  floor: '#0a1636',
  floorDeep: '#050c22',
  /** The hero stage sky, top to bottom. */
  sky: ['#16397c', '#0a1a45'] as const,
  /** Vault panels, the try-on sheet: body top and bottom. */
  panel: '#12306c',
  panelDeep: '#0b2156',
  /** The darker lip under every vault panel (the house 3D edge). */
  lip: '#06102e',
  /** Cards raised inside a panel. */
  card: '#1a4590',
  /** Pills and wells on a panel. */
  well: '#081638',
  ink: '#ffffff',
  inkSoft: '#d4e5ff',
  inkGold: '#ffe07a',
  /** The one rim colour on every vault panel and tile: gold. */
  border: '#ffcf3b',
  gold: '#ffcf3b',
  goldLip: '#d99a00',
  /** The vault's accent (buttons, answer box): the brand's bright blue, not violet. */
  accent: '#2f86e8',
  /** Secret tile plate: deep navy, so the animated piece glows on it; white ink (AA). */
  tilePlate: ['#1d4f9e', '#0b2255'] as const,
} as const;
