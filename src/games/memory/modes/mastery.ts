/**
 * modes/mastery.ts: deck mastery (design v8 5.8; local in v1c, synced in v2).
 *
 * XP per deck: Time Attack board clear 1, Ride Sprint clear 2 (3-star 4),
 * Daily clear 3. Levels at 10 / 25 / 45 / 70 XP.
 *   L2  Heat toggles for that deck
 *   L3  the charm slot
 *   L4  Wide Flash becomes pickable
 *   L5  the deck's mastery card back and a ring on its album page
 */

export const LEVEL_XP = [0, 10, 25, 45, 70];

export type Mastery = Record<string, number>;

export function levelFor(xp: number): number {
  let lvl = 1;
  for (let i = 1; i < LEVEL_XP.length; i++) if (xp >= LEVEL_XP[i]) lvl = i + 1;
  return lvl;
}

export function xpFor(mode: 'timeAttack' | 'ride' | 'daily', r: { boardsCleared?: number; cleared?: boolean; stars?: number }): number {
  if (mode === 'timeAttack') return Math.max(0, r.boardsCleared ?? 0);
  if (mode === 'ride') return r.cleared ? ((r.stars ?? 0) >= 3 ? 4 : 2) : 0;
  return r.cleared ? 3 : 0;
}

export function addXp(m: Mastery, deck: string, xp: number): { mastery: Mastery; before: number; after: number } {
  const prev = m[deck] ?? 0;
  const next = prev + Math.max(0, xp);
  return { mastery: { ...m, [deck]: next }, before: levelFor(prev), after: levelFor(next) };
}

export const heatUnlocked = (xp: number) => levelFor(xp) >= 2;
export const charmUnlocked = (xp: number) => levelFor(xp) >= 3;
