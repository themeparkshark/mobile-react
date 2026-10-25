import { useCallback, useEffect, useId, useLayoutEffect, useState } from 'react';
import {
  COVER_FADE_MS, COVER_FINISH_MS, COVER_SMOOTH_WAIT_MS, LATER_COVER_SHARE, coverCeiling, coverLiftAt,
} from '../../constants/launchHandoff';
import { openAudioStartAfterLaunch } from '../../gamekit/audio/startGate';

/**
 * The map screen's one loading cover (sky, shark, bar) while the park tiles draw.
 *
 * This store only plans it: whether it is up, when it lifts (its deadline), and whether it should
 * lift now because the map has drawn. MapLaunchCover turns each plan into UI-thread animations
 * (a withDelay fade and the bar on the same clock) the moment it commits, so a busy JS thread
 * (the map screen mounting) can never hold the cover past its deadline. The cover's own shared
 * values start at full opacity, so its first frame is always the sky.
 * The app's first cover is the launch scene over the whole screen (header and footer too); a later
 * cover (walking into a park) is the light sky under the header. Either way the map and every
 * button arrive in one fade, and never onto a map whose tiles have not drawn.
 */
export interface CoverPlan {
  readonly up: boolean;
  /** Changes on every new plan; the cover animates once per version. */
  readonly version: number;
  /** Which cover the lift callback belongs to. */
  readonly token: number;
  /** When the fade starts (ms since epoch), unless it lifts sooner. */
  readonly deadline: number;
  /** Where the bar starts; null keeps the bar going from where it is (never jumps back). */
  readonly share: number | null;
  /** How far the bar may creep before the next real step (honest progress). */
  readonly ceiling: number;
  /** The map has drawn: finish the bar and fade now. */
  readonly lifting: boolean;
  /**
   * The app's first cover: it shows the launch scene (the splash art and the one launch bar) over
   * the whole screen, header and footer included, so launch reads as one splash, then the game.
   */
  readonly launch: boolean;
  /**
   * The map under the cover is really on screen: its tiles have drawn (or the tile sheet's wait ran
   * out). With the cover gone, this is the first visible map frame; tips time their calm from it.
   */
  readonly shown: boolean;
}

let plan: CoverPlan = { up: false, version: 0, token: 0, deadline: 0, share: null, ceiling: 0, lifting: false, launch: false, shown: false };
let startedAt = 0;
/** When the newest map mounted under the cover (the launch cover gives each one its own time to draw). */
let mountedAt = 0;
let mapMounted = false;
let firstCover = true;
let drawn = false;
let held = false;
/** Header and HUD icons that mounted under the cover and have not drawn yet (useCoverArt). */
const artWaiting = new Set<string>();
let safety: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<(value: CoverPlan) => void>();

/** Loading covers on screen right now (each one reports its own fade's end). */
let coversMounted = 0;
/** A cover mounted or unmounted (MapLaunchCover's animated part). */
export function noteCoverMounted(on: boolean) {
  coversMounted = Math.max(0, coversMounted + (on ? 1 : -1));
}
/** With a cover on screen, the safety waits this much longer at most for the cover's own report. */
export const COVER_SAFETY_GRACE_MS = 3000;
/** How often the safety looks again while a mounted cover is still fading. */
const SAFETY_RECHECK_MS = 250;

function publish(next: Omit<CoverPlan, 'version'>, notify = true) {
  plan = { ...next, version: plan.version + 1 };
  // A JS safety net for the React state only (tips and cards waiting on the cover), in case no
  // cover is mounted to report its fade. The fade itself runs on the UI thread. While a cover is
  // mounted it is left to finish and report its own fade (up to a grace period): on a busy phone the
  // UI thread runs late, and lifting the plan early unmounted the cover mid-fade, which flashed the
  // whole splash back for a frame over a half-lifted map (seen in a release launch).
  if (safety) clearTimeout(safety);
  safety = null;
  if (plan.up) {
    const tok = plan.token;
    const wait = (plan.lifting ? COVER_SMOOTH_WAIT_MS + COVER_FINISH_MS : Math.max(0, plan.deadline - Date.now()) + COVER_FINISH_MS)
      + COVER_FADE_MS + 600;
    const giveUpAt = Date.now() + wait + COVER_SAFETY_GRACE_MS;
    const check = () => {
      safety = null;
      if (tok !== plan.token || !plan.up) return;
      if (coversMounted > 0 && Date.now() < giveUpAt) { safety = setTimeout(check, SAFETY_RECHECK_MS); return; }
      coverLifted(tok);
    };
    safety = setTimeout(check, wait);
  }
  if (notify) listeners.forEach(listener => listener(plan));
}

/**
 * The cover with this token began its deadline fade on the UI thread (no map reported drawn in
 * time). From here it is lifting: a map screen that mounts now (a remount right after the lift)
 * starts a new, later cover instead of picking up this half-gone launch cover again, which flashed
 * the whole splash back over the map (seen once in ten release launches under heavy load).
 */
export function coverFadeStarted(tok: number) {
  if (tok !== plan.token || !plan.up || plan.lifting) return;
  plan = { ...plan, lifting: true };
}

/** The cover with this token finished fading (called by MapLaunchCover from the UI thread). */
export function coverLifted(tok: number) {
  if (tok !== plan.token || !plan.up) return;
  const wasLaunch = plan.launch;
  artWaiting.clear();
  // No map ever mounted under this cover (nothing to wait for): the screen is what shows.
  publish({ ...plan, up: false, lifting: false, share: null, shown: plan.shown || !mapMounted });
  // Launch is over: the audio hardware may wake once the map has settled (never during launch).
  if (wasLaunch) openAudioStartAfterLaunch();
}

/** Re-plan the lift from what is true now: lift at once, or wait (bar creeping to the next step). */
function replan(now: number, notify = true) {
  if (!plan.up || plan.lifting) return;
  const at = coverLiftAt({ now, startedAt, drawn, held, artPending: artWaiting.size > 0, launch: plan.launch, mountedAt });
  if (at <= now) { publish({ ...plan, lifting: true, share: null }, notify); return; }
  const ceiling = Math.max(plan.ceiling, coverCeiling(mapMounted, held));
  if (at === plan.deadline && ceiling === plan.ceiling) return;
  publish({ ...plan, deadline: at, ceiling, share: null }, notify);
}

/**
 * The map screen's first frame: raise the cover before any map has mounted, so the screen never
 * shows its buttons on an empty blue page. Safe to call during render: it notifies nobody, and
 * the hooks read the new plan when they mount.
 */
export function armMapCover(now = Date.now()) {
  if (plan.up && !plan.lifting) return;
  startedAt = now;
  mountedAt = now;
  mapMounted = false;
  drawn = false;
  const launch = firstCover;
  firstCover = false;
  publish({
    up: true, token: plan.token + 1, deadline: coverLiftAt({ now, startedAt, drawn, held, artPending: artWaiting.size > 0, launch, mountedAt }),
    share: launch ? null : LATER_COVER_SHARE, ceiling: coverCeiling(false, held), lifting: false, launch, shown: false,
  }, false);
}

/**
 * A map mounted: show the cover (or keep the one already up) and plan its lift. Returns the token
 * the map passes back to mapCoverDrawn and releaseMapCover.
 */
export function beginMapCover(now = Date.now()): number {
  const continuing = plan.up && !plan.lifting;
  const launch = continuing ? plan.launch : firstCover;
  if (!continuing) { startedAt = now; firstCover = false; }
  mountedAt = now;
  mapMounted = true;
  drawn = false;
  publish({
    up: true, token: plan.token + 1, deadline: coverLiftAt({ now, startedAt, drawn, held, artPending: artWaiting.size > 0, launch, mountedAt }),
    share: continuing || launch ? null : LATER_COVER_SHARE,
    ceiling: Math.max(continuing ? plan.ceiling : 0, coverCeiling(true, held)), lifting: false, launch, shown: false,
  });
  if (__DEV__) coverLog('map mounted', now);
  return plan.token;
}

/** The map with this token has drawn its tiles: lift now, or as soon as the screen has picked its map. */
export function mapCoverDrawn(tok: number) {
  // Called on every fully drawn frame while the cover is up: only the first one counts.
  if (tok !== plan.token || drawn) return;
  drawn = true;
  if (__DEV__) coverLog('map drawn', Date.now());
  if (!plan.up) { mapTilesShown(tok); return; }
  if (!plan.shown) plan = { ...plan, shown: true };
  replan(Date.now());
}

/**
 * The map with this token is on screen: its tiles drew after the cover lifted, or the tile sheet's
 * wait ran out. Tips and Finn's cards time their calm window from here.
 */
export function mapTilesShown(tok: number) {
  if (tok !== plan.token || plan.shown) return;
  publish({ ...plan, shown: true });
}

/**
 * A header or HUD icon that must be on the first frame after the cover lifts (the coin, key and
 * ticket pills, the chest button, the player's shark). Mounted under a cover, it holds the lift
 * (never past the cover's hard cap) until its art has drawn. Returns the callback for the image's
 * onLoad and onError. An icon that mounts with no cover up never waits for anything.
 */
export function useCoverArt(enabled = true): () => void {
  const key = useId();
  useLayoutEffect(() => {
    if (!enabled || !plan.up || plan.lifting) return;
    artWaiting.add(key);
    replan(Date.now(), true);
    return () => { if (artWaiting.delete(key)) replan(Date.now()); };
  }, [enabled, key]);
  return useCallback(() => { if (artWaiting.delete(key)) replan(Date.now()); }, [key]);
}

/** The screen holds the cover (never past COVER_MAX_MS once the map drew) while it is still picking home or park. */
export function holdMapCover(hold: boolean, now = Date.now()) {
  if (held === hold) return;
  held = hold;
  if (__DEV__) coverLog(hold ? 'picking home or park' : 'map picked', now);
  replan(now);
}

/** The map with this token unmounted. A map that replaces it in the same commit keeps the cover. */
export function releaseMapCover(tok: number) {
  if (tok !== plan.token) return;
  setTimeout(() => { if (tok === plan.token) { drawn = true; replan(Date.now()); } }, 0);
}

function coverLog(step: string, now: number) {
  console.log(`[launch-cover] ${step} at +${now - startedAt} ms (lift at +${plan.deadline - startedAt} ms${plan.lifting ? ', lifting' : ''})`);
}

/** The app's first cover (the launch scene) is still to come, or up and not lifting yet. */
export function launchCoverAhead(): boolean {
  return firstCover || (plan.up && plan.launch && !plan.lifting);
}

export function isMapCovered(): boolean {
  return plan.up;
}

/** The current cover plan, kept in React state. */
export function useCoverPlan(): CoverPlan {
  const [value, setValue] = useState(plan);
  useEffect(() => {
    setValue(plan);
    listeners.add(setValue);
    return () => { listeners.delete(setValue); };
  }, []);
  return value;
}

/** Whether the map screen's loading cover is up (for gating tips and cards). */
export function useMapCovered(): boolean {
  return useCoverPlan().up;
}

/**
 * The map is really on screen: the cover is gone and the map's tiles have drawn (or their wait ran
 * out). A kid's first seconds of map are timed from here, not from the cover's JS lift.
 */
export function useMapOnScreen(): boolean {
  const value = useCoverPlan();
  return !value.up && value.shown;
}
