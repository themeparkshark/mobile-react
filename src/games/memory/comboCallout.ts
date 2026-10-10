/**
 * Combo callouts (mini-game review rounds 2-3). Every callout reads once, the
 * stage breathes between them, and the ribbon never shows a number that
 * disagrees with the flame counter:
 *  - from chain 3 up;
 *  - never within 1.2 s of SWEET RUN;
 *  - a rise while a COMBO ribbon is still up retexts it in place (punch);
 *  - otherwise a new ribbon, with even steps only from x6.
 */
export const COMBO_AFTER_SWEET_MS = 1200;
/** About how long a combo ribbon is up (unfurl 180 + hold 480 + roll 160). */
export const COMBO_UP_MS = 820;

export type ComboCall = 'show' | 'retext' | null;

export function comboCall(chain: number, now: number, last: { at: number; sweet: boolean }): ComboCall {
  if (chain < 3) return null;
  const since = now - last.at;
  if (last.sweet && since < COMBO_AFTER_SWEET_MS) return null;
  if (!last.sweet && last.at > 0 && since < COMBO_UP_MS) return 'retext';
  if (chain >= 6 && chain % 2 === 1) return null;
  return 'show';
}

/** Back-compat helper: should anything fire at all. */
export function shouldCallCombo(chain: number, now: number, last: { at: number; sweet: boolean }): boolean {
  return comboCall(chain, now, last) !== null;
}
