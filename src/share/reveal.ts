/** Pure helpers for the Flex moment (unit tested). */
import type { FlexKind } from './types';

/** How loud a moment is: Legendary and the top brags get the biggest burst. */
export function revealIntensity(kind: FlexKind, rarity: number | null): 'big' | 'medium' | 'small' {
  if (kind === 'crowned' || kind === 'set_complete' || kind === 'boss_win' || rarity === 5) return 'big';
  if (rarity === 4 || rarity === 3 || kind === 'standings' || kind === 'coin_level' || kind === 'fright_night') return 'medium';
  return 'small';
}

export const BURST = { big: 14, medium: 10, small: 6 } as const;

/** The first number in the giant stat, for the count-up ("LV 7" -> 7, "12/12" -> 12). */
export function countTarget(big: string | null): number | null {
  const m = big?.match(/\d+/);
  return m ? Math.min(999, Number(m[0])) : null;
}

