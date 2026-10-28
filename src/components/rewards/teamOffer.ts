/**
 * The team offer after the first coin, once ever per player (core loop
 * blueprint 4.3 rule 3): the win card, then the team step, then the map.
 * Saved per player id (AsyncStorage "tps.teamOffer.v1@p<id>"); a failed read
 * or write never blocks the win, it only means the offer may show once more.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'tps.teamOffer.v1';

export function teamOfferKey(playerId: number | string): string {
  return `${KEY}@p${playerId}`;
}

/**
 * Whether this win should open the team step: a brand-new coin, the player's
 * first coin ever, no team yet (the server's needs_team), and never offered.
 */
export function wantsTeamStep(input: {
  needsTeam: boolean; isNewCoin: boolean; firstCoinEver: boolean; offeredBefore: boolean;
}): boolean {
  return input.needsTeam && input.isNewCoin && input.firstCoinEver && !input.offeredBefore;
}

export async function teamOffered(playerId: number | null | undefined): Promise<boolean> {
  if (playerId == null) return true;
  try {
    return (await AsyncStorage.getItem(teamOfferKey(playerId))) === '1';
  } catch {
    return false;
  }
}

export async function markTeamOffered(playerId: number | null | undefined): Promise<void> {
  if (playerId == null) return;
  try { await AsyncStorage.setItem(teamOfferKey(playerId), '1'); } catch { /* best effort */ }
}

/** Where the screen goes after LET'S GO, Later or the close X. */
export interface TeamSelectionParams {
  readonly onTeamSelected?: () => void;
  readonly isOnboarding?: boolean;
  /**
   * The first-coin step (blueprint 4.3 rule 3): opened right after the first
   * win card ever closes. It shows a Later button, and afterwards goes back to
   * the map (or on to `next`, the shelf the player asked for on the win card).
   */
  readonly firstCoin?: boolean;
  readonly next?: { readonly name: string; readonly params?: object };
}


/**
 * Where LET'S GO, Later and the close X take the player: always somewhere
 * (must-fix 2, the team welcome dead end). The callback (Profile's refresh)
 * runs first and never replaces the way out.
 */
export function teamExit(params: TeamSelectionParams | undefined, canGoBack: boolean):
  { kind: 'reset' } | { kind: 'next'; name: string; params?: object } | { kind: 'back' } {
  if (params?.next?.name) return { kind: 'next', name: params.next.name, params: params.next.params };
  if (params?.isOnboarding || !canGoBack) return { kind: 'reset' };
  return { kind: 'back' };
}
