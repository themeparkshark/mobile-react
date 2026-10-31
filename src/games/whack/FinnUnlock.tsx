/**
 * FinnUnlock: the new costume Finn a run unlocked, shown as a picture inside
 * the results card (never as words in the title), with the one unlock look
 * every game shares (gamekit/results/UnlockTile): Alex's cheering costume
 * Finn on a white tile with a gold NEW tag, bare on the card's blue. It pops
 * in on its own beat, after the stars, the tally and the total have landed,
 * so the star title (NICE!, GREAT!, INCREDIBLE!) and the score each keep
 * their moment. The name is only spoken (VoiceOver).
 */

import React, { useContext } from 'react';
import { THEMED_SHARK_FRAMES } from './assets';
import type { WhackThemeId } from './timeline';
import { cardTitle } from './meta/collection';
import { ResultsSettleContext } from '../../gamekit/results/ResultsCard';
import { UNLOCK_TILE_PT, UnlockTile } from '../../gamekit/results/UnlockTile';

/**
 * When the new Finn pops in if no card tells us (ms after the card lands).
 * Inside the shared card it pops on the card's settle moment instead:
 * after the stars, the tally and the total, so the Finn gets its own beat.
 */
export const FINN_UNLOCK_AT_MS = 1900;
/** The new Finn's tile size (pt): the shared unlock tile. */
export const FINN_TILE_PT = UNLOCK_TILE_PT;

export function FinnUnlock({ theme, reducedMotion }: { theme: WhackThemeId; reducedMotion: boolean }) {
  const settle = useContext(ResultsSettleContext);
  // No panel pops first (the tile sits bare on the blue), so the Finn lands on the settle moment itself.
  const at = settle > 0 ? settle : FINN_UNLOCK_AT_MS;
  const name = cardTitle(theme).toLowerCase();
  return (
    <UnlockTile source={THEMED_SHARK_FRAMES[theme][1]} label={`New Finn unlocked: ${name}`} atMs={at}
      reducedMotion={reducedMotion} fit="bottom" />
  );
}
