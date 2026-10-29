/**
 * Lane testing only: feeds the unlock ladder before the map's own feed exists
 * on this branch (guide-map owns feedLadder in the integrated build).
 *
 * Runs only when BOTH lane-only variables are set at bundle time:
 * EXPO_PUBLIC_STUDIO_MUTE=1 (only lane.sh sets it) and EXPO_PUBLIC_CL_LADDER_FEED.
 * Store and OTA bundles never set either, so this is a no-op there.
 *   EXPO_PUBLIC_CL_LADDER_FEED=all    every rung open (Dustin's state B, like reveal_all)
 *   EXPO_PUBLIC_CL_LADDER_FEED=server the player's real level and coins from the profile
 *   EXPO_PUBLIC_CL_LADDER_FEED=manual the lane sets the progress over the debugger (globalThis.__tpsLadderDev),
 *                                     to walk a rung opening and its NEW tag on device
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { feedLadder, markRungSeen, recordProgress, rungState, startAppOpen, type ProgressEvent, type Rung } from '../reveal/revealLadder';

const MODE = process.env.EXPO_PUBLIC_CL_LADDER_FEED;
const LANE = process.env.EXPO_PUBLIC_STUDIO_MUTE === '1';

export function devLadderFeedOn(): boolean {
  return LANE && (MODE === 'all' || MODE === 'server' || MODE === 'manual');
}

type Manual = { coinsWon: number; level: number; hasTeam: boolean; trailBoxes: number; ownsPin: boolean };
let manual: Manual = { coinsWon: 0, level: 1, hasTeam: false, trailBoxes: 0, ownsPin: false };
let lastFlags: Record<string, boolean> | null = null;
let lastAtPark = false;

function feedManual(): void {
  if (!lastFlags) return;
  feedLadder({ flags: { ...lastFlags }, atPark: lastAtPark,
    progress: { ...manual, levelUpReady: false, keysHeld: 0, revealAll: false } });
}

if (LANE && MODE === 'manual') {
  (globalThis as { __tpsLadderDev?: unknown }).__tpsLadderDev = {
    /** Forget this phone's ladder records (then reload the app so the ladder hydrates fresh). */
    wipe: async () => {
      const keys = await AsyncStorage.getAllKeys();
      const mine = keys.filter(k => k.startsWith('tps.reveal.v1@'));
      await AsyncStorage.multiRemove(mine);
      return mine.length;
    },
    feed: (p: Partial<Manual>) => { manual = { ...manual, ...p }; feedManual(); return manual; },
    record: (event: ProgressEvent) => { recordProgress(event); return true; },
    newOpen: () => { startAppOpen(); return true; },
    seen: (rung: Rung) => { markRungSeen(rung); return true; },
    state: (rung: Rung) => rungState(rung),
  };
}

export function devLadderFeed(input: {
  readonly flags: Readonly<Record<string, boolean>> | undefined;
  readonly level: number;
  readonly coinsWon: number;
  readonly hasTeam: boolean;
  readonly atPark: boolean;
}): void {
  if (!devLadderFeedOn() || !input.flags) return;
  if (MODE === 'manual') {
    lastFlags = { ...input.flags };
    lastAtPark = input.atPark;
    feedManual();
    return;
  }
  feedLadder({
    flags: { ...input.flags },
    atPark: input.atPark,
    progress: {
      coinsWon: input.coinsWon, level: input.level, hasTeam: input.hasTeam,
      levelUpReady: false, keysHeld: 0, trailBoxes: MODE === 'all' ? 1 : 0, ownsPin: false,
      revealAll: MODE === 'all',
    },
  });
}
