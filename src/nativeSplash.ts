import * as NativeSplash from 'expo-splash-screen';

/**
 * Keeps the native launch screen (brand splash art, ios/SplashScreen.storyboard)
 * up until the first real JS frame, so a cold start never flashes an empty
 * or black view while fonts load. Release is idempotent and has a safety
 * timeout so a stuck font load can never trap a player on the launch art.
 */
export const NATIVE_SPLASH_SAFETY_MS = 8000;

let held = false;
let released = false;
let fontsIn = false;
let artIn = false;
let safetyTimer: ReturnType<typeof setTimeout> | null = null;

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

function hideNow(): void {
  if (released) return;
  released = true;
  if (safetyTimer) clearTimeout(safetyTimer);
  safetyTimer = null;
  NativeSplash.hideAsync().catch(() => undefined);
}

/** True while the native launch screen still covers the app. */
export function isNativeSplashUp(): boolean {
  return held && !released;
}

/**
 * Fonts are ready. With waitForArt (the app opens on the Splash route), the native art stays up
 * until the JS launch scene has drawn its art (nativeSplashArtDrawn), so the native fade lands on
 * art and a busy phone never shows a flat blue screen with an empty bar between the two. The
 * safety timer still caps it.
 */
export function releaseNativeSplash(options: { readonly waitForArt?: boolean } = {}): void {
  fontsIn = true;
  if (!options.waitForArt || artIn) hideNow();
}

/** The launch scene's art has drawn (LaunchScene's image onLoad). */
export function nativeSplashArtDrawn(): void {
  artIn = true;
  if (fontsIn) hideNow();
}

/** Same signal under the art lane's name: the splash art is on screen. */
export const splashArtShown = nativeSplashArtDrawn;
