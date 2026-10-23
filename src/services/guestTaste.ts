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
 * The demo coin is never promised as kept: it shows how a shelf fills up.
 *
 * The taste belongs to the first account that signs in after it (claimGuestWarmup).
 * A brother or sister who makes a new account later on the same phone gets the
 * full welcome, and the next guest after a sign-out starts a fresh taste.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export const GUEST_TASTE_KEY = '@tps_guest_taste_v1';
/** Player ids that claimed a guest taste on this phone (newest last, a few kept). */
export const GUEST_CLAIMS_KEY = '@tps_guest_taste_claims_v1';
const MAX_CLAIMS = 8;

export type GuestStep = 'find' | 'play' | 'coin' | 'save';

export interface GuestTasteProgress {
  /** Tapped Finn's treat. */
  readonly caught: boolean;
  /** Won Finn's four-pair warm-up. */
  readonly won: boolean;
  /** Watched the coin land on the shelf. */
  readonly shelved: boolean;
  /** The player who signed in after this taste and kept it. */
  readonly claimedBy?: number | null;
}

export const EMPTY_GUEST_TASTE: GuestTasteProgress = { caught: false, won: false, shelved: false };

/**
 * Does this player keep a guest warm-up, and should they claim it now? Pure.
 * Only one account ever claims a taste: the first one that signs in after it.
 */
export function guestClaimFor(progress: GuestTasteProgress, claims: readonly number[], playerId: number | null | undefined):
  { readonly played: boolean; readonly claim: boolean } {
  if (playerId == null) return { played: false, claim: false };
  if (claims.includes(playerId) || progress.claimedBy === playerId) return { played: true, claim: false };
  if (progress.won && progress.claimedBy == null) return { played: true, claim: true };
  return { played: false, claim: false };
}

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
  yum: 'Yum!',
  play: { title: 'Now a quick game!', body: 'Match 4 pairs with me.', button: 'Play' },
  coin: { ribbon: 'Ride Coins', body: 'Win at rides to fill your shelf!', tap: 'Tap to go on' },
  save: { title: 'Make your own shark!', body: 'Real treats and ride coins are waiting for you.',
    grownUp: 'Ask a grown-up to sign in', have: 'I already have a shark', again: 'Play more games' },
} as const;

function parse(raw: string | null): GuestTasteProgress {
  if (!raw) return EMPTY_GUEST_TASTE;
  try {
    const value = JSON.parse(raw) as Partial<GuestTasteProgress> | null;
    if (!value || typeof value !== 'object') return EMPTY_GUEST_TASTE;
    const caught = value.caught === true, won = caught && value.won === true;
    const claimedBy = typeof value.claimedBy === 'number' ? value.claimedBy : null;
    return { caught, won, shelved: won && value.shelved === true, claimedBy };
  } catch {
    return EMPTY_GUEST_TASTE;
  }
}

async function readSaved(): Promise<GuestTasteProgress> {
  try {
    return parse(await AsyncStorage.getItem(GUEST_TASTE_KEY));
  } catch {
    return EMPTY_GUEST_TASTE;
  }
}

/** The taste a guest on this phone plays now. A claimed taste belongs to its account: a new guest starts fresh. */
export async function readGuestTaste(): Promise<GuestTasteProgress> {
  const saved = await readSaved();
  return saved.claimedBy != null ? EMPTY_GUEST_TASTE : saved;
}

async function readClaims(): Promise<number[]> {
  try {
    const value = JSON.parse((await AsyncStorage.getItem(GUEST_CLAIMS_KEY)) ?? '[]') as unknown;
    return Array.isArray(value) ? value.filter((id): id is number => typeof id === 'number') : [];
  } catch {
    return [];
  }
}

export async function saveGuestTaste(progress: GuestTasteProgress): Promise<void> {
  try {
    await AsyncStorage.setItem(GUEST_TASTE_KEY, JSON.stringify(progress));
  } catch { /* the taste still plays; it just starts over next time */ }
}

/** True once this phone's guest has already won Finn's warm-up (and no account has taken it yet). */
export async function guestPlayedWarmup(): Promise<boolean> {
  return (await readGuestTaste()).won;
}

/**
 * Called when a player signs in. True only for the account that kept the
 * guest's warm-up: the first account after the taste claims it for good.
 */
export async function claimGuestWarmup(playerId: number | null | undefined): Promise<boolean> {
  if (playerId == null) return false;
  const [saved, claims] = await Promise.all([readSaved(), readClaims()]);
  const { played, claim } = guestClaimFor(saved, claims, playerId);
  if (claim) {
    try {
      await AsyncStorage.setItem(GUEST_TASTE_KEY, JSON.stringify({ ...saved, claimedBy: playerId }));
      await AsyncStorage.setItem(GUEST_CLAIMS_KEY, JSON.stringify([...claims, playerId].slice(-MAX_CLAIMS)));
    } catch { /* the welcome back still shows this once */ }
  }
  return played;
}
