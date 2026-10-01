/**
 * modes/unlocks.ts: Time Attack's first-success unlock ledger, Heat and
 * Memory Rank (design v8 4.2, 5.8).
 *
 * One new system per board, and each one only after you have proven the last:
 *
 *   B1  chain, clock                         none
 *   B2  Golden Coin                          cleared any board with <= 1 slip
 *   B3  Showtime gauge, pot, Photo Flash     reached chain 3 once
 *   B4  Peek                                 triggered Showtime once
 *   B5  QUICK                                made a glimpse match on a peeked card
 *   B6+ size and shorter glimpses only
 *
 * If the next system's requirement isn't met, that board deals with no new
 * system and the pictogram card reads "One more like this." The ledger is
 * lifetime (persisted per profile) and also updates inside a run, so a clean
 * B1 already unlocks the Golden Coin on B2.
 *
 * Heat (opt-in, deck mastery L2+): Seagull and Tide from B3, +25% each, +60%
 * both. Never in ranked or paid modes, never on a board below B3.
 */

import type { BoardSystems } from '../engine';

export type SystemId = 'golden' | 'showtime' | 'peek' | 'quick';
export const SYSTEM_ORDER: SystemId[] = ['golden', 'showtime', 'peek', 'quick'];

export interface UnlockLedger {
  /** Cleared any Time Attack board with at most 1 slip. */
  cleanClear: boolean;
  /** Reached chain 3. */
  chain3: boolean;
  /** Triggered Showtime. */
  showtime: boolean;
  /** Made a glimpse match on a card revealed by Peek. */
  peekMatch: boolean;
}

export const EMPTY_LEDGER: UnlockLedger = { cleanClear: false, chain3: false, showtime: false, peekMatch: false };

export const REQUIREMENT: Record<SystemId, keyof UnlockLedger> = {
  golden: 'cleanClear',
  showtime: 'chain3',
  peek: 'showtime',
  quick: 'peekMatch',
};

export const SYSTEM_LABEL: Record<SystemId, string> = {
  golden: 'GOLDEN COIN',
  showtime: 'SHOWTIME',
  peek: 'PEEK',
  quick: 'QUICK',
};

export const SYSTEM_HINT: Record<SystemId, string> = {
  golden: 'Clear a board with 1 slip or less',
  showtime: 'Reach a chain of 3',
  peek: 'Trigger Showtime',
  quick: 'Match a card you peeked',
};

export interface HeatToggles {
  seagull: boolean;
  tide: boolean;
}

export const NO_HEAT: HeatToggles = { seagull: false, tide: false };

export function heatPct(h: HeatToggles): number {
  if (h.seagull && h.tide) return 60;
  if (h.seagull || h.tide) return 25;
  return 0;
}

export interface BoardPlan {
  /** Systems live on this board. */
  sys: BoardSystems;
  /** How many systems are introduced after this board (carry into the next plan). */
  introduced: number;
  /** The system this board introduces, if any. */
  unlock: SystemId | null;
  /** The next system was due but its requirement isn't met yet ("One more like this."). */
  locked: SystemId | null;
}

/**
 * Plan board `board` (1-based) of a run. `introduced` is how many systems the
 * run has already brought in (0 at B1).
 */
export function planBoard(board: number, introduced: number, ledger: UnlockLedger, heat: HeatToggles = NO_HEAT): BoardPlan {
  let n = Math.max(0, Math.min(SYSTEM_ORDER.length, introduced));
  let unlock: SystemId | null = null;
  let locked: SystemId | null = null;
  if (board >= 2 && n < SYSTEM_ORDER.length) {
    const next = SYSTEM_ORDER[n];
    if (ledger[REQUIREMENT[next]]) {
      unlock = next;
      n += 1;
    } else {
      locked = next;
    }
  }
  const has = (id: SystemId) => SYSTEM_ORDER.indexOf(id) < n;
  const heatOn = board >= 3;
  const seagull = heatOn && heat.seagull;
  const tideShift = heatOn && heat.tide;
  const sys: BoardSystems = {
    golden: has('golden'),
    showtime: has('showtime'),
    photoFlash: has('showtime'),
    peek: has('peek'),
    quick: has('quick'),
    seagull,
    tideShift,
    heatPct: heatPct({ seagull, tide: tideShift }),
  };
  return { sys, introduced: n, unlock, locked };
}

/** Update the ledger from a finished board's numbers. Returns a new ledger. */
export function recordBoard(
  ledger: UnlockLedger,
  b: { cleared: boolean; slips: number; maxChain: number; showtimes: number; peekMatches: number },
): UnlockLedger {
  return {
    cleanClear: ledger.cleanClear || (b.cleared && b.slips <= 1),
    chain3: ledger.chain3 || b.maxChain >= 3,
    showtime: ledger.showtime || b.showtimes > 0,
    peekMatch: ledger.peekMatch || b.peekMatches > 0,
  };
}

// -----------------------------------------------------------------------------
// Memory Rank (v1b, local): from the best board reached across the last 10 runs
// -----------------------------------------------------------------------------

export type MemoryRank = 'none' | 'bronzeBooth' | 'silverBooth' | 'goldBooth' | 'barker' | 'goldBarker';

export const RANK_LABEL: Record<MemoryRank, string> = {
  none: 'NEW SHARK',
  bronzeBooth: 'BRONZE BOOTH',
  silverBooth: 'SILVER BOOTH',
  goldBooth: 'GOLD BOOTH',
  barker: 'BARKER',
  goldBarker: 'GOLD BARKER',
};

/** Rim tint per rank (token rim, booth menu plate). */
export const RANK_TINT: Record<MemoryRank, string> = {
  none: '#FFFFFF',
  bronzeBooth: '#D98A4E',
  silverBooth: '#CFE3F2',
  goldBooth: '#FEC90E',
  barker: '#FEC90E',
  goldBarker: '#FFB400',
};

/** `recent` = best board reached per run, newest last (only the last 10 count). */
export function memoryRank(recent: number[]): MemoryRank {
  const last = recent.slice(-10);
  const best = last.reduce((m, x) => Math.max(m, x), 0);
  const b6 = last.filter((x) => x >= 6).length;
  if (b6 >= 3) return 'goldBarker';
  if (best >= 5) return 'barker';
  if (best >= 4) return 'goldBooth';
  if (best >= 3) return 'silverBooth';
  if (best >= 2) return 'bronzeBooth';
  return 'none';
}
