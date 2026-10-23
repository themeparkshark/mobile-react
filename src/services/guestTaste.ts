/**
 * Guest taste: a brand-new player plays before signing in.
 *
 * Finn drops a treat next to the guest, the guest taps it, plays Finn's
 * four-pair warm-up, and watches a coin land on a shelf. Then Finn asks them
 * to sign in to save their shark. Everything here is on the phone only: the
 * server never sees a guest.
 *
 * What a guest keeps after signing in on the same phone:
 *  - Finn's warm-up counts as played, so the park guide skips straight to
 *    the first ride coin instead of replaying it.
 *  - Finn greets them as a returning shark, and the first home find (the
 *    server always spawns one within reach of a new player) is theirs to grab.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export const GUEST_TASTE_KEY = '@tps_guest_taste_v1';

export type GuestStep = 'find' | 'play' | 'coin' | 'save';

export interface GuestTasteProgress {
  /** Tapped Finn's treat. */
  readonly caught: boolean;
  /** Won Finn's four-pair warm-up. */
  readonly won: boolean;
  /** Watched the coin land on the shelf. */
  readonly shelved: boolean;
}

export const EMPTY_GUEST_TASTE: GuestTasteProgress = { caught: false, won: false, shelved: false };

/** Which part of the taste comes next. Pure, so it is unit tested. */
export function guestStep(progress: GuestTasteProgress): GuestStep {
  if (!progress.caught) return 'find';
  if (!progress.won) return 'play';
  if (!progress.shelved) return 'coin';
  return 'save';
}

/** Kid-readable lines, kept together so tests and screenshots agree. */
export const GUEST_TASTE_COPY = {
  find: { title: 'Hi! I’m Finn.', body: 'A churro landed right next to you. Tap it!' },
  caught: 'Nice catch!',
  play: { title: 'Now a quick game!', body: 'Match 4 pairs with me.', button: 'Play' },
  coin: { title: 'Coins go on your shelf!', body: 'Win games at rides to fill it up.' },
  save: { title: 'Save your shark', body: 'Sign in so your shark stays yours. More treats are waiting!', again: 'Play more games' },
} as const;

function parse(raw: string | null): GuestTasteProgress {
  if (!raw) return EMPTY_GUEST_TASTE;
  try {
    const value = JSON.parse(raw) as Partial<GuestTasteProgress> | null;
    if (!value || typeof value !== 'object') return EMPTY_GUEST_TASTE;
    const caught = value.caught === true, won = caught && value.won === true;
    return { caught, won, shelved: won && value.shelved === true };
  } catch {
    return EMPTY_GUEST_TASTE;
  }
}

export async function readGuestTaste(): Promise<GuestTasteProgress> {
  try {
    return parse(await AsyncStorage.getItem(GUEST_TASTE_KEY));
  } catch {
    return EMPTY_GUEST_TASTE;
  }
}

export async function saveGuestTaste(progress: GuestTasteProgress): Promise<void> {
  try {
    await AsyncStorage.setItem(GUEST_TASTE_KEY, JSON.stringify(progress));
  } catch { /* the taste still plays; it just starts over next time */ }
}

/** True once this phone's guest has already won Finn's warm-up. */
export async function guestPlayedWarmup(): Promise<boolean> {
  return (await readGuestTaste()).won;
}
