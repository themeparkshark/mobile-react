/**
 * One loading bar from launch to the map. The splash fills its bar to this share,
 * then the map's sky cover shows the same bar and fills the rest while the park
 * tiles draw, so a kid sees one bar finish, never a second, frozen loading screen.
 */
export const LAUNCH_HANDOFF_SHARE = 0.7;
/** How long the cover bar takes to creep toward full if the map is still drawing. */
export const COVER_BAR_CREEP_MS = 3200;
/** The cover never waits longer than this for the map to draw. */
export const COVER_MAX_MS = 3200;
