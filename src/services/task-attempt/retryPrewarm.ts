/**
 * Fix round w4 N04: TRY AGAIN knows its game before the server answers (the same game, or the one the server
 * named in retry_game), so the ride mounts it under the punch from the press: its board is drawn while the
 * Ticket is on its way and the punch hands over to a drawn board. Pure, so it is tested without a device.
 */
export function retryPrewarmGame(
  lost: { readonly game?: string | null; readonly retry_game?: string | null } | null | undefined,
  sameGame: boolean,
  known: readonly string[],
): string | null {
  const next = lost?.retry_game || (sameGame ? lost?.game : null);
  return next && known.includes(next) ? next : null;
}
