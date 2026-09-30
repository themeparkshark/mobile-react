/**
 * Words for the park header's goal card. Only a reviewed ride coin
 * (server coin_kind 'ride') is called a ride; a food stand, show or
 * landmark coin is just "your next coin", so the header never sends
 * someone to "the ride" at Panda Express.
 */
export type NextCoinKind = string | null | undefined;

export function isRideCoin(kind: NextCoinKind): boolean {
  return kind === 'ride';
}

export function nextCoinEyebrow(kind: NextCoinKind): string {
  return isRideCoin(kind) ? 'YOUR NEXT RIDE COIN' : 'YOUR NEXT COIN';
}

export function ticketsReadyHint(kind: NextCoinKind): string {
  return isRideCoin(kind) ? 'Tickets ready. Head to the ride.' : 'Tickets ready. Head there to play.';
}

/** The coin kind for a goal task, looked up in the park's own task lists. */
export function goalCoinKind(taskId: number | null | undefined,
  ...lists: ReadonlyArray<ReadonlyArray<{ id: number; coin_kind?: string | null }>>): string | null {
  if (!taskId) return null;
  for (const list of lists) {
    const hit = list.find(task => task.id === taskId);
    if (hit) return hit.coin_kind ?? null;
  }
  return null;
}
