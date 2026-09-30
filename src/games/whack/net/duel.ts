/**
 * Bonk Battle (design 10.2 A): a best-of-3 simultaneous-async duel. Both
 * players get the identical Burst (same seed, no symmetry), each plays it
 * whenever the line allows inside a 3-minute window, and the server reveals
 * both results together. Goldens and DOUBLE BONKs queue Cotton Candy splats
 * into the rival's next Burst (max 3); 3 QUICKs in a row block one.
 */

import { mixSeed } from '../../../gamekit/core/rng';
import { buildBurst, type BurstInput, type Timeline, type WhackThemeId } from '../timeline';
import { E_DOUBLE, E_HIT, createSim, simAdvanceTo, simSwipe, simTap, simUnfreeze, TAP_SWIPE } from '../sim';
import { K_GOLDEN, type Difficulty } from '../waves';

export const DUEL_BURSTS = 3;
export const DUEL_WINDOW_MS = 3 * 60 * 1000;
export const DUEL_LIFETIME_MS = 15 * 60 * 1000;
export const MAX_SPLATS = 3;

export function duelBurstInput(matchSeed: number, burstIndex: number, difficulty: Difficulty, theme: WhackThemeId,
  unlockMin: number, incoming: number[]): BurstInput {
  return {
    seed: mixSeed(matchSeed >>> 0, 0xd0e1),
    burstIndex,
    format: 'duel',
    difficulty,
    theme,
    unlockLevel: unlockMin,
    xform: 0,
    walkBoost: null,
    incoming: incoming.length ? { matchSeed, senderEventIds: incoming.slice(0, MAX_SPLATS) } : null,
  };
}

/** Event ids of the goldens and DOUBLE BONKs a Burst's tap log produced (the splats it sends). */
export function sabotageSenders(tl: Timeline, taps: number[][]): number[] {
  const s = createSim(tl, undefined, true);
  const out: number[] = [];
  for (const [gt, hole, flags] of taps) {
    simAdvanceTo(s, gt);
    s.ev.length = 0;
    if (s.ended || s.t !== gt) break;
    if (hole < 0) simUnfreeze(s);
    else if (flags & TAP_SWIPE) simSwipe(s, hole);
    else simTap(s, hole);
    for (let i = 0; i < s.ev.length; i += 5) {
      const k = s.ev[i];
      const h = s.ev[i + 1];
      if (k === E_HIT && Math.floor(s.ev[i + 2] / 10) === K_GOLDEN) out.push(s.hEv[h]);
      if (k === E_DOUBLE) out.push(s.hEv[h]);
    }
    s.ev.length = 0;
    if (out.length >= MAX_SPLATS) break;
  }
  return out.slice(0, MAX_SPLATS);
}

export interface DuelBurstScore {
  /** null = the window expired before a verified submission (forfeit, counts 0). */
  me: number | null;
  rival: number | null;
  meStreak?: number;
  rivalStreak?: number;
}

export function burstWinner(b: DuelBurstScore): 'me' | 'rival' | 'tie' {
  const a = b.me ?? -1;
  const z = b.rival ?? -1;
  if (a === z) return 'tie';
  return a > z ? 'me' : 'rival';
}

/** Most Bursts won; ties go to total replayed score, then max streak. */
export function duelWinner(bursts: DuelBurstScore[]): { winner: 'me' | 'rival' | 'tie'; wins: [number, number]; over: boolean } {
  const wins: [number, number] = [0, 0];
  let totalA = 0;
  let totalZ = 0;
  let streakA = 0;
  let streakZ = 0;
  for (const b of bursts) {
    const w = burstWinner(b);
    if (w === 'me') wins[0]++;
    else if (w === 'rival') wins[1]++;
    totalA += b.me ?? 0;
    totalZ += b.rival ?? 0;
    streakA = Math.max(streakA, b.meStreak ?? 0);
    streakZ = Math.max(streakZ, b.rivalStreak ?? 0);
  }
  const over = wins[0] >= 2 || wins[1] >= 2 || bursts.length >= DUEL_BURSTS;
  let winner: 'me' | 'rival' | 'tie' = 'tie';
  if (wins[0] !== wins[1]) winner = wins[0] > wins[1] ? 'me' : 'rival';
  else if (totalA !== totalZ) winner = totalA > totalZ ? 'me' : 'rival';
  else if (streakA !== streakZ) winner = streakA > streakZ ? 'me' : 'rival';
  return { winner, wins, over };
}

/** Timeline of a duel Burst (both players build exactly this). */
export function duelTimeline(matchSeed: number, burstIndex: number, d: Difficulty, theme: WhackThemeId, unlockMin: number, incoming: number[]): Timeline {
  return buildBurst(duelBurstInput(matchSeed, burstIndex, d, theme, unlockMin, incoming));
}
