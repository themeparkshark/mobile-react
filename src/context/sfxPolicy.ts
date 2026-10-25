/**
 * Are sound effects on? Pure, so it is unit tested.
 *  - Signed-in players follow their own Sound Effects setting.
 *  - A guest hears the game too (Finn's churro, the first win, the coin clink).
 *    The game plays as an ambient sound, so the phone's silent switch still mutes it.
 *  - Dev capture runs (clean capture or studio mute) stay quiet for guests,
 *    because test phones play through a desk speaker.
 */
export function sfxAllowed({ isReady, signedIn, playerSetting, quietCapture }: {
  readonly isReady: boolean;
  readonly signedIn: boolean;
  readonly playerSetting: boolean | null | undefined;
  readonly quietCapture: boolean;
}): boolean {
  if (!isReady) return true;
  if (signedIn) return playerSetting === true;
  return !quietCapture;
}

/** Dev only: lane captures run with clean capture on, and never play out loud for a guest. */
export const QUIET_CAPTURE = typeof __DEV__ !== 'undefined' && __DEV__ &&
  (process.env.EXPO_PUBLIC_CLEAN_CAPTURE === '1' || process.env.EXPO_PUBLIC_STUDIO_MUTE === '1');
