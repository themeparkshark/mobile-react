/** Find the first optional round appended after the original queue plan. */
export function firstAddedRoundIndex(
  pages: readonly { id: string }[],
  playlist: readonly { id: string }[],
  addedCount: number,
): number {
  if (!Number.isInteger(addedCount) || addedCount <= 0 || addedCount > playlist.length) return -1;
  const firstId = playlist[playlist.length - addedCount]?.id;
  return firstId ? pages.findIndex(page => page.id === firstId) : -1;
}
