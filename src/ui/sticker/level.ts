/**
 * The two-level rule, as pure functions (no React), so it is unit tested
 * (tools/tests/sticker-kit.test.cjs). Every part asks these; no part takes an `edge` prop.
 *
 * Level 1 sits on the world (the blue background or the map): colour, navy line, the white
 * cut edge, a hard drop. Level 2 sits inside a page: a navy line and a lip, never a white edge.
 * Inside a card is always level 2 on paper. The one exception the board draws: the one primary
 * button sitting in a wave foot wears the edge too (the win card's NEXT COIN).
 * Level 1 is set only by the root parts (Screen, World, MapGround); asking for the world inside
 * a page is refused, so a screen cannot break the rule by mistake.
 */
import { EDGE } from './tokens';

/** Where a part is mounted. 'world' and 'map' are level 1; 'page' is level 2. */
export type StickerLevel = 'world' | 'map' | 'page';

/** What colour the part sits on: decides ink (white on blue, navy on paper). */
export type StickerSurface = 'blue' | 'paper' | 'map';

export type StickerPlace = {
  readonly level: StickerLevel;
  readonly surface: StickerSurface;
  /** Inside a wave foot (a page's foot, or a screen's foot band). */
  readonly foot: boolean;
};

export const WORLD: StickerPlace = Object.freeze({ level: 'world', surface: 'blue', foot: false });
export const MAP: StickerPlace = Object.freeze({ level: 'map', surface: 'map', foot: false });
const IN_PAGE: StickerPlace = Object.freeze({ level: 'page', surface: 'blue', foot: false });
const IN_CARD: StickerPlace = Object.freeze({ level: 'page', surface: 'paper', foot: false });
const IN_FOOT: StickerPlace = Object.freeze({ level: 'page', surface: 'blue', foot: true });

/** Level number, as the board names it. */
export function levelNumber(level: StickerLevel): 1 | 2 {
  return level === 'page' ? 2 : 1;
}

export function isLevelOne(place: StickerPlace): boolean {
  return place.level !== 'page';
}

/** What a Page gives its children: inside a page is always level 2 on blue. */
export function insidePage(): StickerPlace {
  return IN_PAGE;
}

/** What a Card gives its children: always level 2, on paper, wherever the card sits. */
export function insideCard(): StickerPlace {
  return IN_CARD;
}

/** What a wave foot gives its children: level 2 on blue, marked as the foot. */
export function insideFoot(): StickerPlace {
  return IN_FOOT;
}

/**
 * A root ground (World, MapGround, Screen) asks for level 1. Inside a page that is refused:
 * the children keep the page's level 2, and a dev warning says so.
 */
export function groundFor(parent: StickerPlace, asked: 'world' | 'map', nested: boolean): { readonly place: StickerPlace; readonly refused: boolean } {
  if (nested && parent.level === 'page') return { place: parent, refused: true };
  return { place: asked === 'map' ? MAP : WORLD, refused: false };
}

export type EdgePart = 'page' | 'card' | 'label' | 'button';

/**
 * The white cut edge a part wears at a place, in pt (0: none).
 * Page, card and title label: on level 1 only (a page on the map takes the card's 3).
 * Button: only the one primary, and only on level 1 or in a wave foot.
 */
export function edgeFor(part: EdgePart, place: StickerPlace, primary: boolean = false): number {
  const one = isLevelOne(place);
  switch (part) {
    case 'page': return one ? (place.level === 'map' ? EDGE.card : EDGE.page) : 0;
    case 'card': return one ? EDGE.card : 0;
    case 'label': return one ? EDGE.label : 0;
    case 'button': return primary && (one || place.foot) ? EDGE.button : 0;
    default: return 0;
  }
}

/** Navy line width for a part at a place ('map' pieces get the 3 pt line). */
export function lineFor(level: StickerLevel, inPage: number, onMap: number): number {
  return level === 'map' ? onMap : inPage;
}

/** Whether a second gold primary just mounted in one screen or layer (one gold per screen). */
export function tooManyPrimaries(count: number): boolean {
  return count > 1;
}

const warned = new Set<string>();

/** One dev warning per key (a part name, or a part plus a rule). */
export function warnOnce(key: string, dev: boolean, warn: (message: string) => void, message: string): boolean {
  if (!dev || warned.has(key)) return false;
  warned.add(key);
  warn(`[sticker] ${message}`);
  return true;
}

/** Tests only: forget which keys already warned. */
export function resetWarnings(): void {
  warned.clear();
}
