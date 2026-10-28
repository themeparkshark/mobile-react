/**
 * SharkyUnlock: the new thing a Sharky run unlocked (Prize Boxes, Overdrive,
 * Rally, Power-ups), in the one unlock look every game shares
 * (gamekit/results/UnlockTile, the same tile as Whack's new Finn): a picture
 * on a white tile with a gold NEW tag, bare on the card's blue above the
 * buttons, on its own beat after the stars, the title and the score.
 */

import React from 'react';
import { UnlockTile } from '../../../gamekit/results/UnlockTile';
import { SHARKY_ART } from '../assets';

/** Existing Sharky art for each unlock (no new art). */
const UNLOCK_ART: Record<string, number> = {
  'PRIZE BOXES': SHARKY_ART.prizeBox,
  OVERDRIVE: SHARKY_ART.dash,
  'RALLY YOUR CREW': SHARKY_ART.fanCheer,
  'POWER-UPS': SHARKY_ART.sparkle,
};

/** "NEW: Prize Boxes" -> "Prize Boxes" (the words are only spoken). */
export function unlockName(card: string): string {
  return card.replace(/^NEW:\s*/i, '').trim();
}

/** The picture for an unlock, or the prize box for one we do not know yet. */
export function unlockArt(card: string): number {
  return UNLOCK_ART[unlockName(card).toUpperCase()] ?? SHARKY_ART.prizeBox;
}

export function SharkyUnlock({ card, atMs, reducedMotion }: { card: string; atMs: number; reducedMotion: boolean }) {
  return (
    <UnlockTile source={unlockArt(card)} label={`New unlocked: ${unlockName(card).toLowerCase()}`} atMs={atMs} reducedMotion={reducedMotion}
      caption={`${unlockName(card)} unlocked`} />
  );
}
