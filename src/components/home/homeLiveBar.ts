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
