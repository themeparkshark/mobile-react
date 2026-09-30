/**
 * logic.ts: Memory Match boards (pure, no React).
 *
 * Seeds, grid presets and special placement. The rules live in engine.ts.
 *
 *   boardSeed(seed, runIndex)   PLAY AGAIN deals a new board, same inputs same board
 *   buildLayout({...})          faces by card id (deck faces 0..n, FACE_GOLD, FACE_GULL)
 *   buildBoard(difficulty, ...) legacy shape (tests, older callers)
 */

import type { Deck } from './decks';
import { FACE_GOLD, FACE_GULL, GRID_FOR_PAIRS } from './engine';

export interface BoardShape {
  cols: number;
  rows: number;
  pairs: number;
}

/** Ride Sprint (difficulty 0) is 8 pairs on 4x4. Queue boards 8 or 10 pairs. */
export function boardShapeFor(difficulty: number): BoardShape {
  if (difficulty >= 3) return { cols: 4, rows: 5, pairs: 10 };
  return { cols: 4, rows: 4, pairs: 8 };
}

export function shapeForPairs(pairs: number): BoardShape {
  const g = GRID_FOR_PAIRS[pairs] ?? [4, Math.ceil((pairs * 2) / 4)];
  return { cols: g[0], rows: g[1], pairs };
}

// -----------------------------------------------------------------------------
// Seeds
// -----------------------------------------------------------------------------

export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return function rng(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A different board for every run index, stable for the same inputs. */
export function boardSeed(seed: number, runIndex: number): number {
  let h = (seed >>> 0) ^ Math.imul((runIndex + 1) >>> 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

function shuffleInPlace<T>(arr: T[], rng: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
  return arr;
}

// -----------------------------------------------------------------------------
// Layouts
// -----------------------------------------------------------------------------

export interface LayoutOptions {
  pairs: number;
  /** Number of faces in the deck (10 for every authored deck). */
  deckSize: number;
  seed: number;
  golden?: boolean;
  gull?: boolean;
}

export interface Layout {
  cols: number;
  rows: number;
  pairs: number;
  /** faces[cardId]. A card starts at slot == cardId. */
  faces: number[];
  /** Deck faces used on this board (preload + prize shelf). */
  deckFaces: number[];
}

export function buildLayout(opts: LayoutOptions): Layout {
  const shape = shapeForPairs(opts.pairs);
  const rng = makeRng(opts.seed);
  const specials: number[] = [];
  if (opts.golden) specials.push(FACE_GOLD);
  if (opts.gull) specials.push(FACE_GULL);
  const need = Math.max(0, opts.pairs - specials.length);
  const pool: number[] = [];
  for (let i = 0; i < opts.deckSize; i++) pool.push(i);
  shuffleInPlace(pool, rng);
  const deckFaces = pool.slice(0, Math.min(need, pool.length));
  const pairsFaces = [...deckFaces, ...specials];
  const faces = shuffleInPlace([...pairsFaces, ...pairsFaces], rng);
  return { cols: shape.cols, rows: shape.rows, pairs: pairsFaces.length, faces, deckFaces };
}

// -----------------------------------------------------------------------------
// Legacy board shape (kept for older callers and tests)
// -----------------------------------------------------------------------------

export interface Card {
  slot: number;
  symbolIndex: number;
}

export interface Board {
  shape: BoardShape;
  cards: Card[];
  symbolIndices: number[];
  seed: number;
}

export function buildBoard(difficulty: number, deck: Pick<Deck, 'symbols'>, seed: number): Board {
  const shape = boardShapeFor(difficulty);
  const layout = buildLayout({ pairs: shape.pairs, deckSize: deck.symbols.length, seed });
  const cards: Card[] = layout.faces.map((symbolIndex, slot) => ({ slot, symbolIndex }));
  return { shape, cards, symbolIndices: layout.deckFaces, seed };
}
