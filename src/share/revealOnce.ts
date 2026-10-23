/**
 * The full-screen Flex moment, once per brag (a level, a streak day, a park day), from a root
 * screen. A brag that does not pass shouldFlexReveal() never shows; one already shown (saved
 * under its key) never shows again, even after a relaunch. Park days are held by the host until
 * the player has left the park (store.ts HOLD_IN_PARK).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { shouldFlexReveal } from './copy';
import { flexReveal } from './store';
import type { FlexKind, FlexOptions, FlexPayload } from './types';

const PREFIX = 'flex-reveal:';
/** Asked this launch already (storage is slow, a fast refocus must not double up). */
const asked = new Set<string>();

/** Stable storage key for one brag. Exported for tests. */
export function revealKey(kind: FlexKind, ref: string | number): string {
  return `${PREFIX}${kind}:${ref}`;
}

/** Shows the Flex moment for this brag the first time only. Resolves true when it was queued. */
export async function flexRevealOnce<K extends FlexKind>(kind: K, ref: string | number, payload: FlexPayload<K>, options: FlexOptions): Promise<boolean> {
  if (!shouldFlexReveal(kind, payload)) return false;
  const key = revealKey(kind, ref);
  if (asked.has(key)) return false;
  asked.add(key);
  try {
    if (await AsyncStorage.getItem(key)) return false;
    await AsyncStorage.setItem(key, '1');
  } catch {
    // Storage is best effort: with no storage, once per launch is still once.
  }
  flexReveal(kind, payload, options);
  return true;
}

/** Tests only. */
export function __resetRevealOnce(): void {
  asked.clear();
}
