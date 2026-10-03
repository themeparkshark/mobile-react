/** Rank the Haunt payoff helpers. Pure, unit tested (fright-r3). */
import type { FrightReaction } from '../../api/endpoints/fright/types';

/** How long the submit stamp stays up before the card closes. */
export const RANK_STAMP_MS = 1500;

/** "4 FINS · +25 XP" (or "1 FIN" with no XP). */
export function rankStamp(score: number, xp?: number | null): string {
  const fins = `${score} ${score === 1 ? 'FIN' : 'FINS'}`;
  return xp && xp > 0 ? `${fins} · +${xp} XP` : fins;
}

/** Reaction chips toggle: tapping the selected one clears it; only Done submits. */
export function toggleReaction(current: FrightReaction | null, tapped: FrightReaction): FrightReaction | null {
  return current === tapped ? null : tapped;
}
