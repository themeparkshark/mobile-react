/**
 * Map stability trace for the Release soak harness (EXPO_PUBLIC_DECLUTTER_SOAK=1) and
 * development. Release builds only forward console.error to the device log, so the
 * soak uses it; store builds never set the flag and log nothing.
 */
const SOAK = process.env.EXPO_PUBLIC_DECLUTTER_SOAK === '1';
export const SOAK_TRACE = SOAK || (typeof __DEV__ !== 'undefined' && __DEV__ && process.env.EXPO_PUBLIC_DECLUTTER_TRACE === '1');

export function soakLog(message: string): void {
  if (!SOAK_TRACE) return;
  const line = `[map-trace] ${Date.now()} ${message}`;
  if (SOAK) console.error(line);
  else console.log(line);
}
