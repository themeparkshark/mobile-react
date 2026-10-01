/** Banana note ladder (pure): see audio.ts (design 8.3). */

/**
 * One octave of G major (8 degrees, 0 = tonic G). Climbs per chain catch,
 * loops the 8 degrees, resolves on the tonic at a tier-up and the finale,
 * resets on a chain break.
 */
export interface Ladder {
  i: number;
}

export function ladderNext(l: Ladder, tierUp: boolean): number {
  if (tierUp) l.i = 0;
  else l.i = l.i >= 7 ? 0 : l.i + 1;
  return l.i;
}

/** Note index to play (0..7). */
export function ladderNote(l: Ladder): number {
  return l.i < 0 ? 0 : l.i;
}

export function ladderReset(l: Ladder): void {
  l.i = -1;
}

/** Timbre layers for a tier (max 2). onBeat at x3+ swaps the top layer for the bright set. */
export function ladderLayers(tier: number, onBeat: boolean): ('glock' | 'chime' | 'bell' | 'stab' | 'bright')[] {
  if (tier <= 1) return ['glock'];
  if (tier === 2) return ['glock', 'chime'];
  if (tier === 3) return onBeat ? ['chime', 'bright'] : ['chime', 'bell'];
  return onBeat ? ['bell', 'bright'] : ['bell', 'stab'];
}
