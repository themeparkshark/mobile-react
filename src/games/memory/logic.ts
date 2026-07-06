/**
 * logic.ts — pure Memory Match+ game logic (no React, no worklets).
 *
 * Kept framework-free so it can be reasoned about and unit-tested in isolation
 * (mirrors gamekit/Combo.ts). The React component owns animation + timing; this
 * owns the board, the match rule, and the score formula.
 *
 * Match rule (from legacy MemoryMatchMiniGame): flip two cards; they match iff
 * their symbolId is equal. Match → both locked as matched. Mismatch → both flip
 * back. Round ends when every pair is matched.
 */

import type { Deck } from './decks';

// -----------------------------------------------------------------------------
// Difficulty → board shape
// -----------------------------------------------------------------------------

export interface BoardShape {
  cols: number;
  rows: number;
  pairs: number;
}

/** 4x4 (8 pairs) for difficulty 1-2, 4x5 (10 pairs) for difficulty 3. */
export function boardShapeFor(difficulty: number): BoardShape {
  if (difficulty >= 3) return { cols: 4, rows: 5, pairs: 10 };
  return { cols: 4, rows: 4, pairs: 8 };
}

// -----------------------------------------------------------------------------
// Seeded RNG (mulberry32) — deterministic boards for replay/telemetry.
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

function shuffleInPlace<T>(arr: T[], rng: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// -----------------------------------------------------------------------------
// Board
// -----------------------------------------------------------------------------

export interface Card {
  /** Grid slot index (stable; identifies the card's position + animation). */
  slot: number;
  /** Which deck symbol this card shows. Two cards match iff symbolIndex equal. */
  symbolIndex: number;
}

export interface Board {
  shape: BoardShape;
  cards: Card[];
  /** Deck-symbol indices used this round (length = pairs). */
  symbolIndices: number[];
  seed: number;
}

/**
 * Build a shuffled board for the given difficulty + deck from a seed. Picks the
 * first `pairs` distinct symbols from the deck, duplicates each, shuffles.
 */
export function buildBoard(difficulty: number, deck: Deck, seed: number): Board {
  const shape = boardShapeFor(difficulty);
  const rng = makeRng(seed);

  // Choose distinct symbols. Shuffle the deck's symbol pool first so different
  // seeds surface different faces, then take the first `pairs`.
  const pool = shuffleInPlace(
    deck.symbols.map((_, i) => i),
    rng,
  ).slice(0, shape.pairs);

  const doubled = [...pool, ...pool];
  shuffleInPlace(doubled, rng);

  const cards: Card[] = doubled.map((symbolIndex, slot) => ({ slot, symbolIndex }));
  return { shape, cards, symbolIndices: pool, seed };
}

// -----------------------------------------------------------------------------
// Scoring
// -----------------------------------------------------------------------------

export interface ScoreConfig {
  /** Points for any match, before combo multiplier. */
  matchBase: number;
  /** Points per whole second remaining under the target time. */
  timeBonusPerSec: number;
  /** Soft target completion time in seconds (drives the time bonus + stars). */
  targetSeconds: number;
}

export function scoreConfigFor(difficulty: number): ScoreConfig {
  const shape = boardShapeFor(difficulty);
  return {
    matchBase: 100,
    timeBonusPerSec: 20,
    // Roughly ~7s of budget per pair; harder boards get proportionally more.
    targetSeconds: shape.pairs * 7,
  };
}

/**
 * Points awarded for a single match. `multiplier` comes from the combo state
 * machine (gamekit Combo.ts): consecutive matches within the combo window
 * escalate x2/x3/x5.
 */
export function matchPoints(cfg: ScoreConfig, multiplier: number): number {
  return Math.round(cfg.matchBase * multiplier);
}

/** End-of-round time bonus: reward finishing under the soft target. */
export function timeBonus(cfg: ScoreConfig, elapsedSeconds: number): number {
  const remaining = cfg.targetSeconds - elapsedSeconds;
  if (remaining <= 0) return 0;
  return Math.round(remaining * cfg.timeBonusPerSec);
}

/**
 * Stars for the results screen. 3 = fast + high combo, 2 = solid, 1 = cleared.
 * The board is always winnable, so a completed board is at least 1 star.
 */
export function starsFor(
  cfg: ScoreConfig,
  elapsedSeconds: number,
  maxCombo: number,
): number {
  const fast = elapsedSeconds <= cfg.targetSeconds * 0.6;
  const okay = elapsedSeconds <= cfg.targetSeconds;
  if (fast && maxCombo >= 3) return 3;
  if (okay) return 2;
  return 1;
}
