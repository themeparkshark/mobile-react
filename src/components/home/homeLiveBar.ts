/**
 * Which bar the home map shows at the top. A live boss always earns it (JOIN
 * is a real action). The team race bar ("TEAM MOUSE LEADS") belongs to the
 * Home Hunt board, so it shows only when the server sends
 * home_hunt_board_enabled: true (HOME_HUNT_BOARD_ENABLED, off today). A server
 * that does not send the field keeps it hidden.
 */
export function homeLiveBar(live: { readonly home_hunt_board_enabled?: boolean } | null, raidLive: boolean): 'raid' | 'teams' | null {
  if (!live) return null;
  if (raidLive) return 'raid';
  return live.home_hunt_board_enabled === true ? 'teams' : null;
}

/**
 * Fix w4 T098: a boss raid from home is a coin levels thing (it costs Energy and a Ticket and pays XP and MVP). It
 * waits until the player has won a ride coin and coin levels are open (rung 3); before that the home map shows no
 * raid chip, raid row or next boss line. Pure.
 */
export function homeRaidsAllowed(input: { readonly coinLevelsOpen: boolean; readonly coinsWon: number | null | undefined }): boolean {
  return input.coinLevelsOpen && typeof input.coinsWon === 'number' && Number.isFinite(input.coinsWon) && input.coinsWon > 0;
}

/** The live parks with every raid and the next boss line taken out (raids not allowed yet). Pure. */
export function withoutRaids<T extends { readonly parks: readonly { readonly raid?: unknown }[]; readonly next_boss?: unknown }>(live: T): T {
  return { ...live, parks: live.parks.map(p => ({ ...p, raid: null })), next_boss: null };
}
