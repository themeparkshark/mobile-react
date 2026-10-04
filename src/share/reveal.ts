/** Pure helpers for the Flex moment (unit tested). */
import type { FlexKind } from './types';

/** How loud a moment is: Legendary and the top brags get the biggest burst. */
export function revealIntensity(kind: FlexKind, rarity: number | null): 'big' | 'medium' | 'small' {
  if (kind === 'crowned' || kind === 'set_complete' || kind === 'boss_win' || rarity === 5) return 'big';
  if (rarity === 4 || rarity === 3 || kind === 'standings' || kind === 'coin_level' || kind === 'fright_night') return 'medium';
  return 'small';
}

export const BURST = { big: 22, medium: 16, small: 10 } as const;

/** The first number in the giant stat, for the count-up ("LV 7" -> 7, "12/12" -> 12). */
export function countTarget(big: string | null): number | null {
  const m = big?.match(/\d+/);
  return m ? Math.min(999, Number(m[0])) : null;
}


/** The count-up values: at most 10 ticks, never 0, always ending on the target ("LV 1 … LV 10"). */
export function countSteps(target: number | null): number[] {
  if (target == null || !(target > 0)) return [];
  const steps = Math.min(Math.floor(target), 10);
  const out: number[] = [];
  for (let i = 1; i <= steps; i++) {
    const value = Math.max(1, Math.round((target * i) / steps));
    if (out[out.length - 1] !== value) out.push(value);
  }
  return out;
}
