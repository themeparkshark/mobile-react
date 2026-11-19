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

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** The local date one day after `date` (YYYY-MM-DD, calendar math only), or tomorrow by this phone's clock. */
function nextDay(date: string | null | undefined, now: Date): { y: number; m: number; d: number } {
  const [y, m, d] = (date ?? '').slice(0, 10).split('-').map(Number);
  if (y && m && d) {
    const t = new Date(Date.UTC(y, m - 1, d + 1));
    return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
  }
  const t = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return { y: t.getFullYear(), m: t.getMonth() + 1, d: t.getDate() };
}

export interface TomorrowChest {
  /** Tomorrow's place on the ladder (after Day 7 it starts again at Day 1). */
  readonly day: number;
  /** Tomorrow's weekday, in words. */
  readonly weekday: string;
  /** "Day 2 chest: Thursday" */
  readonly line: string;
  /** Tomorrow's ladder prize, when the server sent the ladder. */
  readonly prize: { readonly kind: 'coins' | 'energy' | 'ticket'; readonly amount: number } | null;
}

/**
 * T103: tomorrow's daily chest, pictured from the 7-day ladder: its day, its weekday and its prize. Read from today's
 * chest (gift_date, day, ladder); null when there is no chest at all.
 */
export function tomorrowChest(gift: { readonly day?: number; readonly gift_date?: string;
  readonly ladder?: readonly { readonly day: number; readonly coins: number; readonly energy: number; readonly tickets: number }[] } | null | undefined,
  now: Date = new Date()): TomorrowChest | null {
  if (!gift) return null;
  const length = gift.ladder?.length || 7;
  const today = Math.min(length, Math.max(1, Math.floor(Number(gift.day ?? 1)) || 1));
  const day = today >= length ? 1 : today + 1;
  const t = nextDay(gift.gift_date, now);
  const weekday = WEEKDAYS[new Date(Date.UTC(t.y, t.m - 1, t.d)).getUTCDay()];
  const r = gift.ladder?.find(x => x.day === day) ?? null;
  const prize = !r ? null : r.tickets > 0 ? { kind: 'ticket' as const, amount: r.tickets }
    : r.energy > 0 ? { kind: 'energy' as const, amount: r.energy } : r.coins > 0 ? { kind: 'coins' as const, amount: r.coins } : null;
  return { day, weekday, line: `Day ${day} chest: ${weekday}`, prize };
}
