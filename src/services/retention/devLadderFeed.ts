/**
 * Lane testing only: feeds the unlock ladder before the map's own feed exists
 * on this branch (guide-map owns feedLadder in the integrated build).
 *
 * Runs only when BOTH lane-only variables are set at bundle time:
 * EXPO_PUBLIC_STUDIO_MUTE=1 (only lane.sh sets it) and EXPO_PUBLIC_CL_LADDER_FEED.
 * Store and OTA bundles never set either, so this is a no-op there.
 *   EXPO_PUBLIC_CL_LADDER_FEED=all    every rung open (Dustin's state B, like reveal_all)
 *   EXPO_PUBLIC_CL_LADDER_FEED=server the player's real level and coins from the profile
 */
import { feedLadder } from '../reveal/revealLadder';

const MODE = process.env.EXPO_PUBLIC_CL_LADDER_FEED;
const LANE = process.env.EXPO_PUBLIC_STUDIO_MUTE === '1';

export function devLadderFeedOn(): boolean {
  return LANE && (MODE === 'all' || MODE === 'server');
}

export function devLadderFeed(input: {
  readonly flags: Readonly<Record<string, boolean>> | undefined;
  readonly level: number;
  readonly coinsWon: number;
  readonly hasTeam: boolean;
  readonly atPark: boolean;
}): void {
  if (!devLadderFeedOn() || !input.flags) return;
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
