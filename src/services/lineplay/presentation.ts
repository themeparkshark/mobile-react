/**
 * Page order for the queue carousel. The ride chapter opens the wait and its
 * missions follow in story order. The optional Crew Prompts card (self-reported
 * talk-and-notice play) is never an early page: it closes the playlist. Shared
 * crew pages are appended last so a live unlock never shifts the page a player
 * is on.
 */
export function linePlayPages<T extends { id: string; kind: string }>(
  playlist: readonly T[],
  sharedPages: readonly T[] = [],
): T[] {
  const intro = playlist.find(item => item.kind === 'chapter_intro');
  const prompts = playlist.filter(item => item.kind === 'crew_grid');
  const middle = playlist.filter(item => item !== intro && item.kind !== 'crew_grid');
  return [...(intro ? [intro] : []), ...middle, ...prompts, ...sharedPages];
}

/** One fast destination per arcade game; prefer a round the guest has not played. */
export function queueArcadeDestinations<T extends { id: string; kind: string; gameId?: string }>(
  pages: readonly T[],
  completedIds: ReadonlySet<string>,
): Array<{ id: string; gameId: string; index: number; completed: boolean }> {
  const choices = new Map<string, { id: string; gameId: string; index: number; completed: boolean }>();
  pages.forEach((page, index) => {
    if (page.kind !== 'minigame' || !page.gameId) return;
    const completed = completedIds.has(page.id);
    const previous = choices.get(page.gameId);
    if (!previous || (previous.completed && !completed)) {
      choices.set(page.gameId, { id: page.id, gameId: page.gameId, index, completed });
    }
  });
  return [...choices.values()];
}

/**
 * Games that live in the LinePlay Games sheet every wait without being a playlist page (fix w4 T031).
 * Parade Beat left the swipe rotation (Sept 30) but it is a favorite, so the sheet always offers it.
 * Their tiles carry an index at or below ARCADE_EXTRA_INDEX (never a page index): a tap plays the
 * game straight from the sheet, with no page to jump to.
 */
export const ARCADE_EXTRA_GAMES: readonly string[] = ['timing'];
export const ARCADE_EXTRA_INDEX = -100;

export function arcadeExtraId(gameId: string): string {
  return `arcade-${gameId}`;
}

/** The arcade's tiles: every playlist game, then each extra game the playlist does not already hold. */
export function queueArcadeWithExtras<C extends { id: string; gameId: string; index: number; completed: boolean }>(
  fromPages: readonly C[],
  completedIds: ReadonlySet<string>,
  extra: (gameId: string, index: number, completed: boolean) => C,
): C[] {
  const have = new Set(fromPages.map(choice => choice.gameId));
  const extras = ARCADE_EXTRA_GAMES.filter(gameId => !have.has(gameId))
    .map((gameId, i) => extra(gameId, ARCADE_EXTRA_INDEX - i, completedIds.has(arcadeExtraId(gameId))));
  return [...fromPages, ...extras];
}

/** The game an extra tile plays (null for a page tile): a minigame item no playlist page holds. */
export function arcadeExtraItem(index: number, seed: number): { kind: 'minigame'; id: string; gameId: string; seed: number } | null {
  if (index > ARCADE_EXTRA_INDEX) return null;
  const gameId = ARCADE_EXTRA_GAMES[ARCADE_EXTRA_INDEX - index];
  return gameId ? { kind: 'minigame', id: arcadeExtraId(gameId), gameId, seed } : null;
}
