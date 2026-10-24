import { useEffect, useState } from 'react';
import {
  COVER_FADE_MS, COVER_FINISH_MS, coverCanLift, coverDeadline, coverHoldDeadline, coverStartShare,
} from '../../constants/launchHandoff';

/**
 * The map screen's one loading cover (sky, shark, bar) while the park tiles draw.
 *
 * This store only plans it: whether it is up, when it lifts (its deadline), and whether it should
 * lift now because the map has drawn. MapLaunchCover turns each plan into UI-thread animations
 * (a withDelay fade and the bar on the same clock) the moment it commits, so a busy JS thread
 * (the map screen mounting) can never hold the cover past its deadline. The cover's own shared
 * values start at full opacity, so its first frame is always the sky.
 * The screen draws the cover above its whole HUD (header and footer stay on top): a kid sees sky,
 * shark and bar, then the map and every button arrive in one fade.
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
  /** The map has drawn: finish the bar and fade now. */
  readonly lifting: boolean;
}

let plan: CoverPlan = { up: false, version: 0, token: 0, deadline: 0, share: null, lifting: false };
let startedAt = 0;
let mapMounted = false;
let firstCover = true;
let drawn = false;
let held = false;
let safety: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<(value: CoverPlan) => void>();

function publish(next: Omit<CoverPlan, 'version'>, notify = true) {
  plan = { ...next, version: plan.version + 1 };
  // A JS safety net for the React state only (tips and cards waiting on the cover), in case no
  // cover is mounted to report its fade. The fade itself runs on the UI thread.
  if (safety) clearTimeout(safety);
  safety = null;
  if (plan.up) {
    const tok = plan.token;
    const wait = (plan.lifting ? COVER_FINISH_MS : Math.max(0, plan.deadline - Date.now())) + COVER_FADE_MS + 600;
    safety = setTimeout(() => coverLifted(tok), wait);
  }
  if (notify) listeners.forEach(listener => listener(plan));
}

/** The cover with this token finished fading (called by MapLaunchCover from the UI thread). */
export function coverLifted(tok: number) {
  if (tok !== plan.token || !plan.up) return;
  publish({ ...plan, up: false, lifting: false, share: null });
}

function lift() {
  if (!plan.up || plan.lifting) return;
  publish({ ...plan, lifting: true, share: null });
}

/**
 * The map screen's first frame: raise the cover before any map has mounted, so the screen never
 * shows its buttons on an empty blue page. Safe to call during render: it notifies nobody, and
 * the hooks read the new plan when they mount.
 */
export function armMapCover(now = Date.now()) {
  if (plan.up && !plan.lifting) return;
  startedAt = now;
  mapMounted = false;
  drawn = false;
  const share = coverStartShare(firstCover, false, 0);
  firstCover = false;
  publish({ up: true, token: plan.token + 1, deadline: coverDeadline(now, null, false), share, lifting: false }, false);
}

/**
 * A map mounted: show the cover (or keep the one already up) and plan its lift. Returns the token
 * the map passes back to mapCoverDrawn and releaseMapCover.
 */
export function beginMapCover(now = Date.now()): number {
  const continuing = plan.up && !plan.lifting && plan.deadline > now;
  if (!continuing) { startedAt = now; mapMounted = false; }
  const deadline = coverDeadline(now, continuing ? { up: true, deadline: plan.deadline, startedAt, mapMounted } : null, true);
  mapMounted = true;
  const share = continuing ? null : coverStartShare(firstCover, false, 0);
  firstCover = false;
  drawn = false;
  publish({ up: true, token: plan.token + 1, deadline, share, lifting: false });
  return plan.token;
}

/** The map with this token has fully drawn: lift early unless the screen is still deciding which map to show. */
export function mapCoverDrawn(tok: number) {
  if (tok !== plan.token) return;
  drawn = true;
  if (coverCanLift(drawn, held)) lift();
}

/** The screen holds the cover (never past the hard cap) while it is still picking home or park. */
export function holdMapCover(hold: boolean, now = Date.now()) {
  if (held === hold) return;
  held = hold;
  if (!plan.up || plan.lifting) return;
  if (coverCanLift(drawn, held)) { lift(); return; }
  const next = coverHoldDeadline(held, now, { startedAt, deadline: plan.deadline });
  if (next !== plan.deadline) publish({ ...plan, deadline: next, share: null });
}

/** The map with this token unmounted. A map that replaces it in the same commit keeps the cover. */
export function releaseMapCover(tok: number) {
  if (tok !== plan.token) return;
  setTimeout(() => { if (tok === plan.token) { drawn = true; lift(); } }, 0);
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
