import { useEffect, useState } from 'react';
import { Easing, cancelAnimation, makeMutable, runOnJS, withDelay, withTiming } from 'react-native-reanimated';
import {
  COVER_FADE_MS, COVER_FINISH_MS, coverCanLift, coverDeadline, coverStartShare,
} from '../../constants/launchHandoff';

/**
 * The map screen's one loading cover (sky, shark, bar) while the park tiles draw.
 *
 * Its opacity and bar are shared values animated on the UI thread: the lift is scheduled with
 * withDelay the moment a map mounts, so a busy JS thread (the map screen mounting) can never hold
 * the cover past its deadline, and the bar reaches full on the same clock, exactly as the cover
 * lifts. The screen draws the cover above its whole HUD (header and footer stay on top), so a
 * kid sees sky, shark and bar, then the map and every button arrive in one fade.
 */
export const coverOpacity = makeMutable(0);
export const coverFill = makeMutable(0);

let up = false;
let token = 0;
let deadline = 0;
let firstCover = true;
let drawn = false;
let held = false;
let lifting = false;
const listeners = new Set<(value: boolean) => void>();

function setUp(value: boolean) {
  if (up === value) return;
  up = value;
  listeners.forEach(listener => listener(value));
}

function lifted(tok: number) {
  if (tok !== token) return;
  lifting = false;
  setUp(false);
}

/** Fade the cover now (the bar first finishes). Safe to call more than once. */
function lift(tok: number) {
  if (tok !== token || lifting || !up) return;
  lifting = true;
  cancelAnimation(coverFill);
  cancelAnimation(coverOpacity);
  coverFill.value = withTiming(1, { duration: COVER_FINISH_MS, easing: Easing.out(Easing.quad) });
  coverOpacity.value = withDelay(COVER_FINISH_MS, withTiming(0, { duration: COVER_FADE_MS, easing: Easing.out(Easing.quad) },
    (finished) => { 'worklet'; if (finished) runOnJS(lifted)(tok); }));
}

/**
 * A map mounted: show the cover (or keep the one already up) and schedule its lift on the UI
 * thread. Returns the token the map passes back to mapCoverDrawn and releaseMapCover.
 */
export function beginMapCover(now = Date.now()): number {
  const continuing = up && !lifting && deadline > now;
  token += 1;
  const tok = token;
  deadline = coverDeadline(now, { up: continuing, deadline });
  const share = coverStartShare(firstCover, continuing, coverFill.value);
  firstCover = false;
  drawn = false;
  lifting = false;
  const remaining = Math.max(0, deadline - now);
  cancelAnimation(coverFill);
  cancelAnimation(coverOpacity);
  coverFill.value = share;
  coverOpacity.value = 1;
  // One clock: the bar reaches full exactly when the fade starts, and the fade is already
  // scheduled on the UI thread, so nothing on the JS thread can hold the cover up.
  coverFill.value = withTiming(1, { duration: remaining, easing: Easing.out(Easing.cubic) });
  coverOpacity.value = withDelay(remaining, withTiming(0, { duration: COVER_FADE_MS, easing: Easing.out(Easing.quad) },
    (finished) => { 'worklet'; if (finished) runOnJS(lifted)(tok); }));
  setUp(true);
  return tok;
}

/** The map with this token has fully drawn: lift early unless the screen is still deciding which map to show. */
export function mapCoverDrawn(tok: number) {
  if (tok !== token) return;
  drawn = true;
  if (coverCanLift(drawn, held)) lift(tok);
}

/** The screen holds the cover (never past its deadline) while it is still picking home or park. */
export function holdMapCover(hold: boolean) {
  held = hold;
  if (coverCanLift(drawn, held)) lift(token);
}

/** The map with this token unmounted. A map that replaces it in the same commit keeps the cover. */
export function releaseMapCover(tok: number) {
  if (tok !== token) return;
  // Wait a frame: a replacement map begins in the same commit and keeps the cover up.
  setTimeout(() => { if (tok === token) { drawn = true; lift(tok); } }, 0);
}

export function isMapCovered(): boolean {
  return up;
}

/** Whether the map screen's loading cover is up (React state for gating tips and cards). */
export function useMapCovered(): boolean {
  const [value, setValue] = useState(up);
  useEffect(() => {
    setValue(up);
    listeners.add(setValue);
    return () => { listeners.delete(setValue); };
  }, []);
  return value;
}
