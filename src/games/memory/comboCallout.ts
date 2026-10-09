/**
 * When a COMBO xN ribbon may fire. Each callout should read once and the
 * stage should breathe between them (mini-game review, round 2):
 *  - from chain 3 up;
 *  - never within 1.2 s of SWEET RUN, never while the last ribbon (about
 *    950 ms on screen) is still up;
 *  - from x6 on, even steps only.
 */
export const COMBO_AFTER_SWEET_MS = 1200;
export const COMBO_GAP_MS = 950;

export function shouldCallCombo(chain: number, now: number, last: { at: number; sweet: boolean }): boolean {
  if (chain < 3) return false;
  if (chain >= 6 && chain % 2 === 1) return false;
  const since = now - last.at;
  if (last.sweet && since < COMBO_AFTER_SWEET_MS) return false;
  return since >= COMBO_GAP_MS;
}
