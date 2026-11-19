/**
 * The daily chest's day words (fix pass w4): why a chest started over (T110) and tomorrow's chest pictured (T103).
 * Pure, no imports, unit tested in tools/tests/fix-w4-rewards-daily.test.cjs.
 */

/**
 * T110: today's daily chest started the ladder again after days away (the server's streak_reset). Said once, kindly,
 * where the chest shows: never a bare "Day 1 of 7" with no word why. Null when there is nothing to say.
 */
export function chestRestartLine(reset: { readonly days_away?: number } | null | undefined): string | null {
  const n = Math.floor(Number(reset?.days_away ?? 0));
  if (!(n > 0)) return null;
  return `Welcome back! Away ${n} ${n === 1 ? 'day' : 'days'}, so your chest starts at Day 1 again.`;
}
