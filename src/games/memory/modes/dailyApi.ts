/**
 * modes/dailyApi.ts: Daily friend ghosts and challenges over plain HTTP
 * (design 4.4, 11). WS7 owns the endpoints; until they ship every call
 * resolves to an empty or false result and the par shark stands in, so the
 * client never depends on them. Nothing is sent without an explicit tap.
 *
 *   GET  /memory/daily/ghosts?date=YYYY-MM-DD  -> { ghosts: [{name, kind, verdicts}] }
 *   POST /memory/challenges { friend_ids, date } (only from the SEND tap)
 */
import apiClient from '../../../api/client';
import type { DailyGhost } from './daily';

export async function fetchDailyGhosts(day: string): Promise<DailyGhost[]> {
  try {
    const res = await apiClient.get('/memory/daily/ghosts', { params: { date: day }, timeout: 2500 });
    const list = (res?.data?.ghosts ?? []) as { name?: string; kind?: string; verdicts?: unknown }[];
    return list
      .filter((g) => typeof g.name === 'string' && Array.isArray(g.verdicts))
      .map((g) => ({
        name: String(g.name).slice(0, 12),
        kind: g.kind === 'team' ? 'team' : 'friend',
        verdicts: (g.verdicts as unknown[]).map((v) => Number(v)).filter((v) => v >= 0 && v <= 4),
      }));
  } catch {
    return [];
  }
}

/** Best ghost to race: the friend with the fewest turns to clear, else none. */
export function pickGhost(ghosts: DailyGhost[]): DailyGhost | null {
  let best: DailyGhost | null = null;
  let bestTurns = Infinity;
  for (const g of ghosts) {
    const pairs = g.verdicts.filter((v) => v === 0 || v === 1).length;
    const turns = pairs >= 8 ? g.verdicts.length : Infinity;
    if (turns < bestTurns) { best = g; bestTurns = turns; }
  }
  return best ?? (ghosts[0] ?? null);
}
