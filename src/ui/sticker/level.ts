/**
 * The two-level rule, as pure functions (no React), so it is unit tested
 * (tools/tests/sticker-kit.test.cjs).
 *
 * Level 1 sits on the world (the blue background or the map): colour, navy line, the white
 * cut edge, a hard drop. Level 2 sits inside a page: a navy line and a lip, never a white edge.
 * A part learns its level from where it is mounted (StickerContext); a screen cannot put a
 * white edge inside a page, even by asking for one.
 */

/** Where a part is mounted. 'world' and 'map' are level 1; 'page' is level 2. */
export type StickerLevel = 'world' | 'map' | 'page';

/** What colour the part sits on: decides ink (white on blue, navy on paper). */
export type StickerSurface = 'blue' | 'paper' | 'map';

export type StickerPlace = { readonly level: StickerLevel; readonly surface: StickerSurface };

export const WORLD: StickerPlace = Object.freeze({ level: 'world', surface: 'blue' });

/** Level number, as the board names it. */
export function levelNumber(level: StickerLevel): 1 | 2 {
  return level === 'page' ? 2 : 1;
}

/** What a Page gives its children: inside a page is always level 2 on blue. */
export function insidePage(): StickerPlace {
  return { level: 'page', surface: 'blue' };
}

/** What a Card gives its children: the same level as the card's place, on paper. */
export function insideCard(place: StickerPlace): StickerPlace {
  return { level: place.level === 'page' ? 'page' : place.level, surface: 'paper' };
}

export type EdgeDecision = {
  /** Draw the white cut edge. */
  readonly edge: boolean;
  /** A screen asked for an edge the rule does not allow here (dev warning). */
  readonly refused: boolean;
};

/**
 * Whether a part wears the white cut edge.
 * `asked` is the screen's wish: undefined means "follow the rule" (edge on level 1 only),
 * false turns the edge off anywhere, true is honoured on level 1 and refused inside a page.
 */
export function decideEdge(level: StickerLevel, asked?: boolean): EdgeDecision {
  if (asked === false) return { edge: false, refused: false };
  if (level === 'page') return { edge: false, refused: asked === true };
  return { edge: true, refused: false };
}

/** Navy line width for a part at a level ('map' pieces get the 3 pt line). */
export function lineFor(level: StickerLevel, inPage: number, onMap: number): number {
  return level === 'map' ? onMap : inPage;
}

const warned = new Set<string>();

/** One dev warning per part name when a screen forces a white edge inside a page. */
export function warnRefusedEdge(part: string, dev: boolean, warn: (message: string) => void): boolean {
  if (!dev || warned.has(part)) return false;
  warned.add(part);
  warn(`[sticker] ${part}: a white cut edge was asked for inside a page. Level 2 never wears it (DIRECTION.md, two levels); drawn without it.`);
  return true;
}

/** Tests only: forget which parts already warned. */
export function resetEdgeWarnings(): void {
  warned.clear();
}
