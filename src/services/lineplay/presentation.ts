/** Keep the first queue action playable even when shared features arrive later. */
export function linePlayPages<T extends { id: string; kind: string }>(
  playlist: readonly T[],
  sharedPages: readonly T[] = [],
): T[] {
  const intro = playlist.find(item => item.kind === 'chapter_intro');
  const grid = playlist.find(item => item.kind === 'crew_grid');
  const featured = [intro, grid].filter((item): item is T => item != null);
  const featuredIds = new Set(featured.map(item => item.id));
  return [...featured, ...playlist.filter(item => !featuredIds.has(item.id)), ...sharedPages];
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
