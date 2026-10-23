/**
 * The full-screen Flex moment, once per brag (a level, a streak day, a park day), from a root
 * screen. A brag that does not pass shouldFlexReveal() never shows; one already shown (saved
 * under its key) never shows again, even after a relaunch. Park days are held by the host until
 * the player has left the park (store.ts HOLD_IN_PARK).
 *
 * The key is saved as shown only when the moment is really on screen (the host calls
 * markRevealShown from the Modal's onShow), never when it is queued or held: a relaunch, crash
 * or dead phone inside the park keeps the moment, and the next recap load queues it again.
 * A later call for the same brag updates the waiting moment's numbers (one moment, newest count).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { shouldFlexReveal } from './copy';
import { flexReveal } from './store';
import type { FlexKind, FlexOptions, FlexPayload } from './types';

const PREFIX = 'flex-reveal:';
/** Shown already (this launch, or read back from storage). */
const shown = new Set<string>();
/** Storage read this launch already (storage is slow, a fast refocus must not double read). */
const checked = new Set<string>();

/** Stable storage key for one brag. Exported for tests. */
export function revealKey(kind: FlexKind, ref: string | number): string {
  return `${PREFIX}${kind}:${ref}`;
}

/** The host calls this when a once-only moment is really on screen. */
export function markRevealShown(key: string | undefined): void {
  if (!key || shown.has(key)) return;
  shown.add(key);
  void AsyncStorage.setItem(key, '1').catch(() => undefined);
}

/**
 * Shows the Flex moment for this brag the first time only. Resolves true when it was queued,
 * or when a waiting one took the newer payload.
 */
export async function flexRevealOnce<K extends FlexKind>(kind: K, ref: string | number, payload: FlexPayload<K>, options: FlexOptions): Promise<boolean> {
  if (!shouldFlexReveal(kind, payload)) return false;
  const key = revealKey(kind, ref);
  if (shown.has(key)) return false;
  if (!checked.has(key)) {
    checked.add(key);
    try {
      if (await AsyncStorage.getItem(key)) shown.add(key);
    } catch {
      // Storage is best effort: with no storage, once per launch is still once.
    }
  }
  if (shown.has(key)) return false;
  // Same key while one is waiting: store.ts updates that one in place (no second moment).
  flexReveal(kind, payload, { ...options, onceKey: key });
  return true;
}

/** Tests only. */
export function __resetRevealOnce(): void {
  shown.clear();
  checked.clear();
}
