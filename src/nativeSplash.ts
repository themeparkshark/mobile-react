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
  safetyTimer = setTimeout(releaseNativeSplash, NATIVE_SPLASH_SAFETY_MS);
}

export function releaseNativeSplash(): void {
  if (released) return;
  released = true;
  if (safetyTimer) clearTimeout(safetyTimer);
  safetyTimer = null;
  NativeSplash.hideAsync().catch(() => undefined);
}
