/**
 * Near-miss line for a loss (design 11.9): find the smallest single change
 * that flips the result and say it in one friendly line.
 *   speed: "Just 35 away! A GREAT answer on question 2 wins it."
 *   wager: "Just 120 away! GO BIG on the Final wins it."
 *   miss:  "Just 60 away! One more right answer wins it."
 * Never "lost", never a betting word. A big gap gets no sentence at all: the
 * card shows Fin and the REMATCH button pulses.
 */
import { POINTS } from './config';
import type { MatchPlan, MatchTally, RoundResult } from './match';
import { streakMult } from './scoring';

export interface NearMiss {
  gap: number;
  kind: 'speed' | 'bigFinal' | 'miss' | 'tie' | 'none';
  line: string;
}

const TIER_SPEED: [string, number][] = [['GREAT', 70], ['LIGHTNING', 100]];

export function nearMiss(plan: MatchPlan, tally: MatchTally, results: readonly RoundResult[]): NearMiss {
  const gap = tally.opp.score - tally.me.score;
  if (gap < 0) return { gap, kind: 'none', line: '' };
  if (gap === 0) return { gap, kind: 'tie', line: 'Dead even! Sudden death decides it.' };
  const need = gap + 1;

  // 1) Speed: a faster lock on a question you already got right.
  let bestSpeed: { round: number; tier: string; add: number } | null = null;
  results.forEach((r, i) => {
    const round = plan.rounds[i];
    if (!round || !r.me.correct || round.spec.type === 'buzz') return;
    const mult = streakMult(Math.max(1, r.me.streak?.streak ?? 1));
    for (const [tier, speed] of TIER_SPEED) {
      const add = Math.round((speed - r.me.speed) * mult);
      if (add >= need && (!bestSpeed || add < bestSpeed.add)) { bestSpeed = { round: i, tier, add }; break; }
    }
  });
  if (bestSpeed) {
    const b = bestSpeed as { round: number; tier: string; add: number };
    const word = b.tier;
    return { gap, kind: 'speed', line: `Just ${gap} away! A ${word} answer on question ${b.round + 1} wins it.` };
  }

  // 2) Big Final: going bigger on a Final you got right.
  const fi = plan.rounds.findIndex((r) => r.spec.type === 'final');
  const fr = fi >= 0 ? results[fi] : undefined;
  if (fr && fr.me.correct) {
    const scoreBefore = tally.me.score - fr.me.points;
    const allIn = Math.max(0, scoreBefore) - fr.me.stake;
    if (allIn >= need) return { gap, kind: 'bigFinal', line: `Just ${gap} away! GO BIG on the Final wins it.` };
  }

  // 3) Miss: one more right answer.
  if (results.some((r) => !r.me.correct) && POINTS.base * 1.5 >= need) {
    return { gap, kind: 'miss', line: `Just ${gap} away! One more right answer wins it.` };
  }
  // A big gap is not "so close": no sentence, the card shows Fin and REMATCH.
  if (gap > 300) return { gap, kind: 'miss', line: '' };
  return { gap, kind: 'miss', line: `Just ${gap} away! So close!` };
}

/**
 * Ride challenge loss line (4.1): name the one change that wins the coin.
 * "A right answer on Q2 wins the coin." Results are in question order.
 */
export function rideNearMiss(results: readonly { me: { correct: boolean } }[], need = 2): string {
  const right = results.filter((r) => r.me.correct).length;
  if (right >= need) return '';
  const firstMiss = results.findIndex((r) => !r.me.correct);
  if (need - right === 1 && firstMiss >= 0) return `A right answer on Q${firstMiss + 1} wins the coin.`;
  return 'Two right answers win the coin.';
}

/**
 * Points a wrong Big Final took away, or 0. A duel can end with right
 * answers and a low score only this way, so the card names it.
 */
export function finalPointsLost(plan: { rounds: readonly { spec: { type: string } }[] }, results: readonly { me: { correct: boolean; stake?: number } }[]): number {
  const fi = plan.rounds.findIndex((r) => r.spec.type === 'final');
  const fr = fi >= 0 ? results[fi] : undefined;
  return fr && !fr.me.correct && (fr.me.stake ?? 0) > 0 ? Math.round(fr.me.stake ?? 0) : 0;
}
