/**
 * The bundled HTML minigames (Sharky, Banana Basket) run in a WebView that can
 * never leave the device (Apple Kids category, 1.3).
 *
 * - originWhitelist is deliberately '*': react-native-webview hands any URL
 *   that fails the whitelist to Linking.openURL, which would open Safari
 *   ungated. With '*', every navigation reaches allowMinigameNavigation,
 *   which lets only the game's own file (and about:blank) load and blocks
 *   everything else in place. No new windows.
 * - The pages make no network request: three.js is bundled into each page
 *   (tools/minigames/build.cjs) and the pixel web font is gone (system font).
 */
export const MINIGAME_ORIGIN_WHITELIST = ['*'];

/** onShouldStartLoadWithRequest: the game's own file, or nothing (blocked in place). */
export function allowMinigameNavigation(request: { readonly url: string }): boolean {
  const url = request.url ?? '';
  return url === 'about:blank' || url.startsWith('file://');
}
