/**
 * The phase log of the sheet hosts and the presses that open them (fix pass w4, lane press).
 *
 * A press that does nothing has to be read off the phone step by step: did the touch reach JS, did the button hear
 * it, did the sheet ask the app's one native door, did UIKit put it up. Every host writes one short line per step.
 * On in dev builds and in lane bundles built with EXPO_PUBLIC_PRESS_TRACE=1 (release-like JS too: the lines go to the
 * device log through React Native's native log hook, never to the screen and never as a red box). Store and OTA bundles never set the flag, so there they cost one false check.
 */
const ON = (typeof __DEV__ !== 'undefined' && __DEV__) || process.env.EXPO_PUBLIC_PRESS_TRACE === '1';

export const pressTraceOn = ON;

/** React Native's own native log call (release bundles strip console.log, tools/babel/strip-console.cjs). */
type NativeLog = (message: string, level: number) => void;

/** One line: `[tps-press] <ms> <step> <detail>`. Detail is built only when the log is on. */
export function pressTrace(step: string, detail?: () => string): void {
  if (!ON) return;
  const line = `[tps-press] ${Date.now()} ${step}${detail ? ` ${detail()}` : ''}`;
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    // eslint-disable-next-line no-console
    console.log(line);
    return;
  }
  (globalThis as { nativeLoggingHook?: NativeLog }).nativeLoggingHook?.(line, 1);
}
