/**
 * Near-miss line for a loss (design 11.9): find the smallest single change
 * that flips the result and say it in one friendly line.
 *   speed: "Lost by 35. A GREAT lock on Q2 wins it."
 *   wager: "Lost by 120. ALL IN on the Final wins it."
 *   miss:  "Lost by 60. One more right answer wins it."
 */
import { POINTS } from './config';
import type { MatchPlan, MatchTally, RoundResult } from './match';
import { streakMult } from './scoring';

export interface NearMiss {
  gap: number;
  kind: 'speed' | 'wager' | 'miss' | 'tie' | 'none';
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
    return { gap, kind: 'speed', line: `Lost by ${gap}. A ${b.tier} lock on Q${b.round + 1} wins it.` };
  }

  // 2) Wager: a bigger stake on a correct Final.
  const fi = plan.rounds.findIndex((r) => r.spec.type === 'final');
  const fr = fi >= 0 ? results[fi] : undefined;
  if (fr && fr.me.correct) {
    const scoreBefore = tally.me.score - fr.me.points;
    const allIn = Math.max(0, scoreBefore) - fr.me.stake;
    if (allIn >= need) return { gap, kind: 'wager', line: `Lost by ${gap}. ALL IN on the Final wins it.` };
  }

  // 3) Miss: one more right answer.
  if (results.some((r) => !r.me.correct) && POINTS.base * 1.5 >= need) {
    return { gap, kind: 'miss', line: `Lost by ${gap}. One more right answer wins it.` };
  }
  return { gap, kind: 'miss', line: `Lost by ${gap}. So close! Rematch?` };
}
