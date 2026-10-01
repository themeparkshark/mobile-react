/**
 * nearMiss.ts: the one line on the results card that makes you press Play
 * again. Every design asks for it (Trivia nearMiss.ts, Whack "result card
 * shows the next goal", Sharky ghost delta bar and NEXT STAR meter, Line
 * Party "so close" runner-up).
 *
 * Picks the most motivating true statement, in this order:
 *   1. You beat a rival or ghost ("You beat Sam by 120").
 *   2. You were close to a rival or ghost ("Only 60 behind Sam").
 *   3. A new personal best.
 *   4. Close to the next star (within `nearFrac` of the gap).
 *   5. Close to your best.
 *   6. The next star goal, plain.
 * Plain text, no emoji, positive framing, never "you lost".
 */

import { formatScore, nextStarGoal, type StarThresholds } from './scoring';

export type NearMissKind = 'beatRival' | 'nearRival' | 'newBest' | 'nearStar' | 'nearBest' | 'nextStar' | 'maxed' | 'none';

export interface NearMissInput {
  score: number;
  thresholds?: StarThresholds;
  best?: number | null;
  /** Rival or ghost to compare against. */
  rival?: { name: string; score: number } | null;
  /** Fraction of the star gap that counts as "close" (default 0.2). */
  nearFrac?: number;
}

export interface NearMiss {
  kind: NearMissKind;
  text: string;
  /** Points involved (lead or gap), for a delta bar. */
  gap: number;
}

export function nearMissLine(input: NearMissInput): NearMiss {
  const { score, thresholds, best, rival } = input;
  const nearFrac = input.nearFrac ?? 0.2;
  if (rival && rival.name) {
    const d = score - rival.score;
    if (d > 0) return { kind: 'beatRival', text: `You beat ${rival.name} by ${formatScore(d)}`, gap: d };
    if (d === 0) return { kind: 'nearRival', text: `Dead heat with ${rival.name}`, gap: 0 };
    const behind = -d;
    const span = Math.max(1, rival.score);
    if (behind / span <= 0.25) return { kind: 'nearRival', text: `Only ${formatScore(behind)} behind ${rival.name}`, gap: behind };
  }
  if (best != null && best > 0 && score > best) {
    return { kind: 'newBest', text: `New best by ${formatScore(score - best)}`, gap: score - best };
  }
  if (thresholds) {
    const g = nextStarGoal(score, thresholds);
    if (!g.nextStar) return { kind: 'maxed', text: 'Three stars. Go beat your best', gap: 0 };
    const prev = g.nextStar === 1 ? 0 : g.nextStar === 2 ? thresholds.one : thresholds.two;
    const span = Math.max(1, g.target - prev);
    if (g.remaining / span <= nearFrac) {
      return { kind: 'nearStar', text: `Just ${formatScore(g.remaining)} from star ${g.nextStar}`, gap: g.remaining };
    }
    if (best != null && best > 0 && best - score <= best * 0.1) {
      return { kind: 'nearBest', text: `${formatScore(best - score)} off your best`, gap: best - score };
    }
    return { kind: 'nextStar', text: `${formatScore(g.remaining)} more for star ${g.nextStar}`, gap: g.remaining };
  }
  if (best != null && best > 0 && best - score <= best * 0.1) {
    return { kind: 'nearBest', text: `${formatScore(best - score)} off your best`, gap: best - score };
  }
  return { kind: 'none', text: '', gap: 0 };
}
