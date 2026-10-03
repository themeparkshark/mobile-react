/**
 * Preview build only (claude/dustin-preview, TestFlight channel "testflight").
 * This binary talks to the production API, which does not have the RC backend
 * yet. Features whose server routes are missing there are switched off here.
 */

/** POST/DELETE /players/{id}/block and GET /me/blocks are not on production yet (404). */
export const SERVER_HAS_BLOCKING = false;
