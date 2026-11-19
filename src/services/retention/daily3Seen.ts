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
