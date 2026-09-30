/**
 * FxGovernor (design 9.12): the hard FX budget every Current Quest beat asks
 * before it flashes, punches, shakes, freezes or banners.
 *
 *  - at most 1 flash per 2 s, alpha capped at 20%, always a local radial
 *  - no camera punch within 150 ms of a board shake (and vice versa)
 *  - at most one hit-stop per stroke
 *  - when beats collide on one stroke the higher priority keeps its big
 *    moves; lower beats degrade to particles plus SFX only
 *  - the Riptide banner waits until 300 ms after a GOLDEN! banner ends
 */

export const PRI_TIDE = 1;
export const PRI_PEARL = 2;
export const PRI_RIPTIDE = 3;
export const PRI_UNLOCK = 4;
export const PRI_GOLDEN = 5;
export const PRI_CLEAR = 6;

export const FLASH_GAP_MS = 2000;
export const FLASH_MAX_ALPHA = 0.2;
export const PUNCH_SHAKE_GAP_MS = 150;
export const GOLDEN_BANNER_MS = 500;
export const BANNER_AFTER_GOLDEN_MS = 300;

export interface FxGovernor {
  lastFlash: number;
  lastShake: number;
  lastPunch: number;
  stroke: number;
  strokeHitStop: boolean;
  /** Highest priority that claimed big moves this stroke. */
  strokeTop: number;
  bannerFreeAt: number;
}

export function createGovernor(): FxGovernor {
  return { lastFlash: -1e9, lastShake: -1e9, lastPunch: -1e9, stroke: -1, strokeHitStop: false, strokeTop: 0, bannerFreeAt: 0 };
}

function onStroke(g: FxGovernor, stroke: number): void {
  if (g.stroke !== stroke) {
    g.stroke = stroke;
    g.strokeHitStop = false;
    g.strokeTop = 0;
  }
}

/** Claim the stroke's big moves for a beat; false = degrade to particles + SFX. */
export function claimBig(g: FxGovernor, stroke: number, priority: number): boolean {
  onStroke(g, stroke);
  if (priority < g.strokeTop) return false;
  g.strokeTop = priority;
  return true;
}

/** Local radial flash: returns the alpha to use (0 = refused). */
export function requestFlash(g: FxGovernor, now: number, alpha: number): number {
  if (now - g.lastFlash < FLASH_GAP_MS) return 0;
  g.lastFlash = now;
  return Math.min(alpha, FLASH_MAX_ALPHA);
}

export function requestShake(g: FxGovernor, now: number): boolean {
  if (now - g.lastPunch < PUNCH_SHAKE_GAP_MS) return false;
  g.lastShake = now;
  return true;
}

export function requestPunch(g: FxGovernor, now: number): boolean {
  if (now - g.lastShake < PUNCH_SHAKE_GAP_MS) return false;
  g.lastPunch = now;
  return true;
}

export function requestHitStop(g: FxGovernor, stroke: number): boolean {
  onStroke(g, stroke);
  if (g.strokeHitStop) return false;
  g.strokeHitStop = true;
  return true;
}

/** When may a banner of this priority show (ms)? GOLDEN! pushes the rest back. */
export function bannerAt(g: FxGovernor, now: number, priority: number): number {
  const at = Math.max(now, priority >= PRI_GOLDEN ? now : g.bannerFreeAt);
  if (priority >= PRI_GOLDEN) g.bannerFreeAt = at + GOLDEN_BANNER_MS + BANNER_AFTER_GOLDEN_MS;
  return at;
}
