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

/**
 * The map guide's target, when it points at a coin in this park: the shelf's
 * NEXT COIN card then names the same coin the map card does (one next thing).
 */
export function guideShelfPick<T extends { readonly id: number }>(
  target: { readonly taskId: number; readonly parkId: number } | null | undefined,
  parkId: number, atPark: boolean, rows: readonly T[]): T | null {
  if (!target || !atPark || target.parkId !== parkId) return null;
  return rows.find(row => row.id === target.taskId) ?? null;
}

/** The NEXT COIN card's line under the guide's target, in a 7-year-old's words. */
export function guideShelfHint(reason: string | null | undefined): string {
  if (reason === 'in_line') return 'You are in its line. Play while you wait!';
  if (reason === 'level_up') return 'Ready to level up!';
  return 'The map shows the way.';
}
