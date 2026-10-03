/**
 * What the next XP level opens, for the level card caption.
 * Mirrors the Ride Boss gates in the backend's config/progression.php
 * (`gates`: boss_normal 4, boss_hard 5, boss_shark 6). They only count while
 * the server's `ride_boss` flag is on. Keep the two in step when a gate moves.
 */
export const RIDE_BOSS_UNLOCKS: Readonly<Record<number, string>> = {
  4: 'Ride Boss fights',
  5: 'Hard Ride Bosses',
  6: 'Shark Ride Bosses',
};

export const EARN_XP_CAPTION = 'Win rides, find coins and play games for XP';

/** One short line under the XP numbers: what the next level unlocks, or how to earn XP. */
export function nextLevelCaption(level: number, rideBoss: boolean): string {
  const next = rideBoss ? RIDE_BOSS_UNLOCKS[level + 1] : undefined;
  return next ? `Level ${level + 1} unlocks ${next}` : EARN_XP_CAPTION;
}
