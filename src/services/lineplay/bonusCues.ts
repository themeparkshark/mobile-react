/**
 * Queue bonus haptics and stings, through the app-wide limiters from S0
 * (queueHaptic: 1 haptic per 120 ms; sfxLimiter: 2 voices). Every cue has a
 * visual twin, because sound is off by default in a queue.
 *
 * Sounds reuse existing app files until the dedicated stings (bonus_open,
 * part_pop, part_whoosh, coin_absorb, bonus_saved) pass Dustin's ear review.
 * coin_absorb climbs C, D, E for slots 1, 2, 3 by playback rate.
 *
 * Movement rule: while the line moves, the caller defers these through
 * MovementFxGate (bonusRounds.ts). The Part is never delayed, only the cue.
 */

import { queueHaptic, HAPTIC_PRIORITY, type HapticIntent } from '../../gamekit/Haptics';
import { playLimited, SFX_PRIORITY } from '../../audio/sfxLimiter';
import { absorbPitch } from './bonusRounds';

export type BonusCue = 'bonus_open' | 'part_pop' | 'part_whoosh' | 'coin_absorb' | 'bonus_saved' | 'line_moving';

export interface BonusCueRequest {
  readonly cue: BonusCue;
  /** Slot 1-3 for the coin_absorb ladder. */
  readonly slot?: number;
}

type PlaySound = (sound: unknown, options?: { volume?: number; rate?: number }) => void;

const SOUNDS: Readonly<Record<Exclude<BonusCue, 'line_moving'>, { file: unknown; priority: number; ms: number; volume: number }>> = {
  bonus_open: { file: require('../../../assets/sounds/reveal.mp3'), priority: SFX_PRIORITY.land, ms: 600, volume: 0.55 },
  part_pop: { file: require('../../../assets/sounds/tap.mp3'), priority: SFX_PRIORITY.tap, ms: 150, volume: 0.5 },
  part_whoosh: { file: require('../../../assets/sounds/whoosh.mp3'), priority: SFX_PRIORITY.whoosh, ms: 450, volume: 0.35 },
  coin_absorb: { file: require('../../../assets/sounds/coin.mp3'), priority: SFX_PRIORITY.land, ms: 400, volume: 0.6 },
  bonus_saved: { file: require('../../../assets/sounds/pin_swap_select_pin.mp3'), priority: SFX_PRIORITY.tap, ms: 400, volume: 0.4 },
};

const HAPTICS: Partial<Record<BonusCue, HapticIntent>> = {
  bonus_open: 'hitMedium',
  coin_absorb: 'success',
  line_moving: 'tickSelection',
};

const PITCH_RATE = { C: 1, D: 1.122, E: 1.26 } as const;

/** Play one cue's haptic and sting (both limited app-wide). */
export function playBonusCue(request: BonusCueRequest, playSound: PlaySound | null | undefined): void {
  const haptic = HAPTICS[request.cue];
  if (haptic) queueHaptic(haptic, HAPTIC_PRIORITY[haptic]);
  if (request.cue === 'line_moving' || !playSound) return;
  const sound = SOUNDS[request.cue];
  const rate = request.cue === 'coin_absorb' ? PITCH_RATE[absorbPitch(request.slot ?? 1)] : 1;
  playLimited(request.cue, { priority: sound.priority, durationMs: sound.ms, dropIfActive: request.cue === 'part_whoosh' },
    () => { playSound(sound.file, { volume: sound.volume, rate }); });
}
