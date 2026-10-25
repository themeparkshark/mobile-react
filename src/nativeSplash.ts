import * as NativeSplash from 'expo-splash-screen';

/**
 * Keeps the native launch screen (brand splash art, ios/SplashScreen.storyboard)
 * up until the first real JS frame, so a cold start never flashes an empty
 * or black view while fonts load. Release is idempotent and has a safety
 * timeout so a stuck font load can never trap a player on the launch art.
 */
export const NATIVE_SPLASH_SAFETY_MS = 8000;
// Once fonts are ready, wait this long at most for the JS splash art to be on
// screen. Hiding before it is drawn faded the launch art out to bare blue.
export const SPLASH_ART_WAIT_MS = 700;

let held = false;
let released = false;
let fontsDone = false;
let artDone = false;
let safetyTimer: ReturnType<typeof setTimeout> | null = null;
let artWait: ReturnType<typeof setTimeout> | null = null;

export function holdNativeSplash(): void {
  if (held) return;
  held = true;
  try {
    NativeSplash.setOptions({ fade: true, duration: 220 });
  } catch {
    // Older native builds without setOptions still hide correctly.
  }
  NativeSplash.preventAutoHideAsync().catch(() => undefined);
  safetyTimer = setTimeout(hideNow, NATIVE_SPLASH_SAFETY_MS);
}

/** True while the native launch screen still covers the app. */
export function isNativeSplashUp(): boolean {
  return held && !released;
}

/** Root calls this when fonts settle. Hides now if the splash art is drawn, else waits a moment for it. */
export function releaseNativeSplash(): void {
  if (released || fontsDone) return;
  fontsDone = true;
  if (artDone) hideNow();
  else artWait = setTimeout(hideNow, SPLASH_ART_WAIT_MS);
}

/** Splash calls this once its art is on screen, so the native fade lands on art, never on blue. */
export function splashArtShown(): void {
  artDone = true;
  if (fontsDone) hideNow();
}

function hideNow(): void {
  if (released) return;
  released = true;
  if (safetyTimer) clearTimeout(safetyTimer);
  safetyTimer = null;
  if (artWait) clearTimeout(artWait);
  artWait = null;
  NativeSplash.hideAsync().catch(() => undefined);
}
