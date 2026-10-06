/**
 * Teach the closet badge once (items that come and go): the first time a badged card shows,
 * its sentence appears on its own for a moment; after that it's the hold only. One flag per
 * device, claimed synchronously so only one card ever teaches.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'closet:badge-tip-taught';
let claimed = false;
let loading: Promise<boolean> | null = null;

/** Resolves true for exactly one caller ever (the first badged card), false for everyone else. */
export async function claimClosetTeach(): Promise<boolean> {
  if (claimed) return false;
  loading ??= AsyncStorage.getItem(KEY).then(v => v === '1', () => true);
  const already = await loading;
  if (already || claimed) { claimed = true; return false; }
  claimed = true;
  void AsyncStorage.setItem(KEY, '1').catch(() => undefined);
  return true;
}
