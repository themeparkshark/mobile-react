/**
 * Finn cards and ride mastery (design v4 6.11). Bonking a golden in a ride's
 * queue for the first time unlocks that ride's costume Finn card; mastery
 * stars per ride are reported to WS5 (meta.mastery) for the park map. The
 * server is the source of truth (it verifies the proof's theme and ride);
 * this module is the pure rule plus a tiny local cache for the dev build.
 */

export interface FinnCard {
  rideId: string;
  theme: string;
  /** Park-local date it was earned (YYYY-MM-DD). */
  date: string;
  /** Best Line of the Day rank there (if known). */
  bestRank: number | null;
}

export type CardBook = Record<string, FinnCard>;

/**
 * Apply one finished Run: returns the updated book and the card newly
 * unlocked (exactly once per ride), or null. Only queue formats in a ride's
 * line count, and only when a golden was bonked.
 */
export function applyRunToBook(book: CardBook, run: { rideId: string | null; theme: string; format: string; goldens: number; date: string; rank?: number | null }): {
  book: CardBook; unlocked: FinnCard | null;
} {
  if (!run.rideId || run.goldens <= 0) return { book, unlocked: null };
  if (run.format !== 'queue' && run.format !== 'lineDay' && run.format !== 'daily') return { book, unlocked: null };
  const prev = book[run.rideId];
  if (prev) {
    if (run.rank != null && (prev.bestRank == null || run.rank < prev.bestRank)) {
      return { book: { ...book, [run.rideId]: { ...prev, bestRank: run.rank } }, unlocked: null };
    }
    return { book, unlocked: null };
  }
  const card: FinnCard = { rideId: run.rideId, theme: run.theme, date: run.date, bestRank: run.rank ?? null };
  return { book: { ...book, [run.rideId]: card }, unlocked: card };
}

export type MasteryBook = Record<string, number>;

/** Best stars per ride (0-3), never decreasing. */
export function applyMastery(m: MasteryBook, rideId: string | null, stars: number): MasteryBook {
  if (!rideId) return m;
  const s = Math.max(0, Math.min(3, stars | 0));
  if ((m[rideId] ?? 0) >= s) return m;
  return { ...m, [rideId]: s };
}

/** Theme label for a card ("PIRATE FINN"). */
export function cardTitle(theme: string): string {
  const names: Record<string, string> = {
    park: 'PARK FINN', pirates: 'PIRATE FINN', mansion: 'SPOOKY FINN', space: 'ASTRO FINN', jungle: 'EXPLORER FINN', backlot: 'DIRECTOR FINN',
  };
  return names[theme] ?? 'FINN';
}

/** Run of the park day (0-based), kept per park-local date: drives the Boss Run cadence. */
export function nextRunOfDay(stored: { date: string; n: number } | null, today: string): { date: string; n: number; runOfDay: number } {
  if (!stored || stored.date !== today) return { date: today, n: 1, runOfDay: 0 };
  return { date: today, n: stored.n + 1, runOfDay: stored.n };
}
