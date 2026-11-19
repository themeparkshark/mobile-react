/**
 * Which day's Daily 3 goals this player has seen (fix round w3, T096).
 *
 * Daily 3 used to be met first as "All 3 done! Open your chest" for goals the player never saw: the server counts
 * the whole local day, and the goals often finish (open the chest, win a coin) before the Rewards sheet is opened.
 * Until the goals were shown on a day, the Rewards row leads to the three goals (ticked), and the chest opens from
 * there; a goal that ticks while the map is up says so in a small toast. Kept per player on this phone, one date.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const key = (playerId: number) => `tps.daily3.seen.v1@${playerId}`;
let memo: { playerId: number; date: string } | null = null;

/** The local date (server's `date`) whose goals were last shown, or null. */
export async function daily3SeenDate(playerId: number): Promise<string | null> {
  if (memo && memo.playerId === playerId) return memo.date;
  try {
    const v = await AsyncStorage.getItem(key(playerId));
    if (v) memo = { playerId, date: v };
    return v;
  } catch {
    return null;
  }
}

export function noteDaily3Seen(playerId: number, date: string): void {
  memo = { playerId, date };
  void AsyncStorage.setItem(key(playerId), date).catch(() => undefined);
}

/** The toast for goals that just ticked while the map is up ("Daily 3: 2 of 3 done"). */
export function tickToast(done: number, total: number): string {
  return done >= total ? `Daily 3: all ${total} done! Your chest is in Rewards` : `Daily 3: ${done} of ${total} done`;
}

/** The first tick on first sight lands after the sheet has zoomed open; each next one a beat later (fix pass w4, T096). */
export const TICK_FIRST_MS = 450;
export const TICK_GAP_MS = 420;
/** The chest's OPEN! waits for the last tick plus this, so the chest is offered only after every goal was seen ticking. */
export const TICK_SETTLE_MS = 380;

/** When the chest may be offered after `ticks` goals tick one by one (0: at once). */
export function chestAfterTicksMs(ticks: number): number {
  return ticks > 0 ? TICK_FIRST_MS + (ticks - 1) * TICK_GAP_MS + TICK_SETTLE_MS : 0;
}

/**
 * Today's goals were shown to this player (fix pass w4, T096): the server's `seen_at` once it sends one, or this
 * phone's record of the day. Either is enough (a phone that saw them before the server kept a time still counts).
 */
export function seenToday(state: { readonly date: string; readonly seen_at?: string | null }, localSeenDate: string | null): boolean {
  return !!state.seen_at || localSeenDate === state.date;
}

/**
 * The goals that tick one by one the first time today's Daily 3 is shown (fix pass w4, T096): the server's
 * `done_before_seen` when it sends it (only goals still done), else every goal already done. Never any once seen.
 */
export function ticksOnFirstSight(state: { readonly goals: readonly { readonly key: string; readonly done: boolean }[];
  readonly done_before_seen?: readonly string[] | null }, seen: boolean): string[] {
  if (seen) return [];
  const done = state.goals.filter(g => g.done).map(g => g.key);
  const listed = Array.isArray(state.done_before_seen) ? state.done_before_seen : null;
  if (!listed) return done;
  // The server's list in goal order, plus any goal done since (it ticks too, never a silent check).
  return done.filter(k => listed.includes(k)).concat(done.filter(k => !listed.includes(k)));
}
