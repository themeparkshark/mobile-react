/**
 * Fail card Why line and tip (design 6.6), built only from replayed run
 * stats so it matches the server's replay: misses, hearts left and the steps
 * the ball was down. Positive and specific: one sentence of facts, one tip
 * from the biggest loss.
 */

import { HEARTS } from './constants';

export interface RunFacts {
  misses: number;
  heartsLeft: number;
  ballLiveSteps: number;
  clockSteps: number;
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

export function tipLine(f: RunFacts): string {
  const downS = Math.max(0, (f.clockSteps - f.ballLiveSteps) / 60);
  const lost = HEARTS - f.heartsLeft;
  const missCost = f.misses * 3;
  const heartCost = lost * 4;
  const ballCost = downS / 3;
  if (ballCost >= missCost && ballCost >= heartCost) return 'Keep the ball up to unlock x3.';
  if (heartCost >= missCost) return 'Watch for the coral shadow.';
  return 'Aim for the gold notch.';
}
