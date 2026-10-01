/**
 * Results lines (design 6.6, 7.7), built only from replayed run stats so they
 * match the server's replay: the fail Why line and its tip, the NEXT STAR
 * delta, and BALL SHARE. Positive and specific: one sentence of facts, one
 * tip from the biggest loss.
 */

import { HEARTS } from './constants';

export interface RunFacts {
  misses: number;
  heartsLeft: number;
  ballLiveSteps: number;
  clockSteps: number;
  bestLife?: number;
}

export function whyLine(f: RunFacts): string {
  const parts: string[] = [];
  if (f.misses > 0) parts.push(`Missed ${f.misses} banana${f.misses === 1 ? '' : 's'}.`);
  const lost = HEARTS - f.heartsLeft;
  if (lost > 0) parts.push(`Lost ${lost} heart${lost === 1 ? '' : 's'}.`);
  const downS = Math.max(0, Math.round((f.clockSteps - f.ballLiveSteps) / 60));
  if (downS >= 3) parts.push(`Ball down for ${downS} s.`);
  return parts.join(' ');
}

/** One tip from the biggest loss (6.6). */
export function tipLine(f: RunFacts): string {
  const downS = Math.max(0, (f.clockSteps - f.ballLiveSteps) / 60);
  const lost = HEARTS - f.heartsLeft;
  const missCost = f.misses * 3;
  const heartCost = lost * 4;
  const ballCost = downS / 3;
  if (ballCost >= missCost && ballCost >= heartCost) {
    return (f.bestLife ?? 0) >= 8 ? 'Save the pail for long juggles.' : 'Aim with the rim zones.';
  }
  if (heartCost >= missCost) return 'Watch the coral shadow.';
  return 'Aim with the rim zones.';
}

/** "+120 TO 2 STARS" (or null when every notch is passed). */
export function nextStarDelta(score: number, targets: readonly number[]): { delta: number; label: string } | null {
  const names = ['1 STAR', '2 STARS', '3 STARS', 'CROWN'];
  for (let i = 0; i < targets.length; i++) {
    if (targets[i] > 0 && score < targets[i]) return { delta: targets[i] - score, label: names[i] };
  }
  return null;
}

/** Results card "PILE: 58" from the catch count (the verlet pile is v2.1). */
export function pileLine(catches: number): string {
  return `PILE: ${catches}`;
}
