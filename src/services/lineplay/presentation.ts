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
