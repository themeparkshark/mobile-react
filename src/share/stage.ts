/**
 * Share card stage geometry (pure numbers, no React), shared by FlexCard and its tests: where the
 * hero tile and the player's dressed shark stand on Story and Square cards. Every overlap is
 * measured from the dressed look's own painted reach (lookBounds), so a wide costume never covers
 * the prize and no tile or shark ever touches the words.
 */
import { BODY_EXTENT, type LookExtent } from './lookBounds';

/** Shark paper aspect (width / height), the same as FlexShark's 1353x1530 canvas. */
const SHARK_ASPECT = 1353 / 1530;

/**
 * Story: the dressed shark is the star. It is the biggest thing on the card, stands in front of the
 * hero tile (overlapping it by STORY_OVERLAP of its painted body), and its feet tuck behind the
 * kicker and title, which ride over the hero's lower edge (STORY_WORDS_LIFT). Alone (no shark) the
 * tile grows to STORY_HERO_SOLO.
 */
export const STORY_HERO = 118;
export const STORY_HERO_SOLO = 160;
/** The biggest the story shark's paper gets (its painted body is about 0.7 of it). */
export const STORY_SHARK_H = 290;
export const STORY_OVERLAP = 30;
/** How far the words ride over the hero's lower edge (and the shark's feet) on a shark card. */
export const STORY_WORDS_LIFT = 36;
/** A worn prize pin sits low on the belly: the words lift less, so they never cover the pin. */
export const STORY_WORDS_LIFT_PIN = 18;
export const STORY_ROW_PAD = 8;
/**
 * The shark paper (1353x1530): the painted body runs from about 0.18 to 0.82 of its height and
 * width, and a hat reaches up to about 0.1. So the paper may rise SHARK_RISE above the hero's top
 * (over the ribbon's clear lower edge) and its feet sit at SHARK_FEET.
 */
export const SHARK_RISE = 0.1;
export const SHARK_FEET = 0.82;

/** Where the tile and the shark stand in the story hero (pt, relative to the hero box). */
export interface StoryStage {
  readonly tile: number; readonly tileLeft: number; readonly tileTop: number;
  readonly shark: number; readonly sharkLeft: number; readonly sharkTop: number;
}

/**
 * How far the shark's paint may reach into the prize tile, as a share of the tile: the tile's frame
 * band (0.12) plus a fifth of its 0.76 art box, so at least 80% of the prize art always shows.
 */
export const PRIZE_EDGE = 0.27;

/**
 * The story stage for a hero box of room x width pt whose lower `lift` pt sit under the words.
 * The shark's feet land 4 pt above the box bottom (behind the words), its hat may rise over the
 * ribbon's clear edge, and its paint overlaps the tile by STORY_OVERLAP (never more than PRIZE_EDGE
 * of the tile). The overlap is measured from the dressed look's own front edge (`look`, from
 * lookExtent), so a ghost sheet or a blaster overlaps the tile's frame, never the prize. A look too
 * wide for the card shrinks the shark. The tile sits fully above the words. The pair is centered by
 * what you see (tile + painted look). Exported for tests.
 */
export function storyStage(room: number, width: number, lift: number, look: LookExtent = BODY_EXTENT): StoryStage {
  const r = room > 0 ? room : 190;
  const w = width > 0 ? width : 320;
  const above = r - lift - STORY_ROW_PAD;
  const tile = Math.max(80, Math.min(STORY_HERO, Math.round(above)));
  const overlap = Math.min(STORY_OVERLAP, Math.round(tile * PRIZE_EDGE));
  const span = look.right - look.left;
  const byHeight = Math.min(STORY_SHARK_H, Math.floor((r - 4) / (SHARK_FEET - SHARK_RISE)));
  const byWidth = Math.floor((w - tile + overlap) / (span * SHARK_ASPECT));
  const shark = Math.max(120, Math.min(byHeight, byWidth));
  const sharkW = shark * SHARK_ASPECT;
  const seen = tile + sharkW * span - overlap;
  const tileLeft = Math.round(Math.max(0, (w - seen) / 2));
  return {
    tile, tileLeft, tileTop: Math.round(above - tile),
    shark, sharkLeft: Math.round(tileLeft + tile - overlap - sharkW * look.left), sharkTop: Math.round(r - 4 - shark * SHARK_FEET),
  };
}

/** The square prize card's dressed shark (its paper; the painted body is about 0.7 of it). */
export const SQUARE_PRIZE_SHARK_H = 250;
/** The square prize card's tile and the shark's column width (pt). */
export const SQUARE_PRIZE_TILE = 78;
export const SQUARE_PRIZE_COL = 136;
/** The square's side padding: the prize shark's paint may use all but 4 pt of it. */
const SQUARE_PAD = 20;

/**
 * Where the square prize card's shark stands in its column of `room` pt: its feet 2 pt above the
 * column's bottom, its paint (the dressed look's own reach) centered between 4 pt inside the card's
 * left edge and 4 pt past the column, so a wide costume never covers the prize tile beside it and
 * never leaves the card. A wide look gets a smaller shark. Exported for tests.
 */
export function prizeSquareShark(room: number, look: LookExtent = BODY_EXTENT): { shark: number; left: number; top: number } {
  const span = look.right - look.left;
  const avail = SQUARE_PRIZE_COL + SQUARE_PAD;
  const byHeight = room > 0 ? Math.floor((room - 2) / (SHARK_FEET - SHARK_RISE)) : SQUARE_PRIZE_SHARK_H;
  const shark = Math.max(120, Math.min(SQUARE_PRIZE_SHARK_H, byHeight, Math.floor(avail / (span * SHARK_ASPECT))));
  const sharkW = shark * SHARK_ASPECT;
  return {
    shark,
    left: Math.round(-(SQUARE_PAD - 4) + (avail - sharkW * span) / 2 - sharkW * look.left),
    top: room > 0 ? Math.round(room - 2 - shark * SHARK_FEET) : 0,
  };
}

/** The square's hero tile at its biggest (its lip and shadow hang SQUARE_LIP below its box). */
export const SQUARE_HERO = 112;
/** The square shark's biggest paper (about a third of the card wide once painted). */
export const SQUARE_SHARK_MAX = 230;
/** The tile's lip hangs about 4% of its size below its box. */
const squareLip = (tile: number) => Math.ceil(tile * 0.04) + 1;
/** Clear room under the ribbon's tails before the tile starts. */
const SQUARE_TOP = 6;
/** The shark's feet tuck this far behind the kicker (like Story), and its hat may rise this far over the ribbon's clear edge. */
const SQUARE_FEET_TUCK = 18;
const SQUARE_HAT_RISE = 12;
/** How far the square shark stands in front of the tile's frame. */
const SQUARE_OVERLAP = 12;

/** Where the square's tile and shark stand in a stage of h x w pt. Exported for tests. */
export interface SquareStage {
  readonly tile: number; readonly tileLeft: number; readonly tileTop: number;
  readonly shark: number; readonly sharkLeft: number; readonly sharkTop: number;
}

/**
 * The square stage. The tile fits the stage with its lip clear of the bottom (the words row adds 8 pt
 * more), so the kicker always sits 8 pt or more below the tile. The shark's feet tuck behind the
 * kicker and its hat may rise over the ribbon's clear edge; it stands in front of the tile's frame
 * (SQUARE_OVERLAP, measured from the dressed look's own front edge), and a look too wide for the
 * card shrinks the shark. The pair is centered by what you see. Exported for tests.
 */
export function squareStage(h: number, w: number, showShark: boolean, look: LookExtent = BODY_EXTENT): SquareStage {
  const H = h > 0 ? h : 124;
  const W = w > 0 ? w : 320;
  const tile = Math.max(72, Math.min(SQUARE_HERO, Math.floor(H - SQUARE_TOP - squareLip(SQUARE_HERO))));
  const tileTop = Math.round(SQUARE_TOP + Math.max(0, (H - squareLip(tile) - SQUARE_TOP - tile) / 2));
  if (!showShark) return { tile, tileLeft: Math.round((W - tile) / 2), tileTop, shark: 0, sharkLeft: 0, sharkTop: 0 };
  const overlap = Math.min(SQUARE_OVERLAP, Math.round(tile * PRIZE_EDGE));
  const span = look.right - look.left;
  const byHeight = Math.floor((H + SQUARE_FEET_TUCK + SQUARE_HAT_RISE) / (SHARK_FEET - SHARK_RISE));
  const byWidth = Math.floor((W - tile + overlap) / (span * SHARK_ASPECT));
  const shark = Math.max(120, Math.min(SQUARE_SHARK_MAX, byHeight, byWidth));
  const sharkW = shark * SHARK_ASPECT;
  const seen = tile + sharkW * span - overlap;
  const tileLeft = Math.round(Math.max(0, (W - seen) / 2));
  return {
    tile, tileLeft, tileTop,
    shark, sharkLeft: Math.round(tileLeft + tile - overlap - sharkW * look.left), sharkTop: Math.round(H + SQUARE_FEET_TUCK - shark * SHARK_FEET),
  };
}

