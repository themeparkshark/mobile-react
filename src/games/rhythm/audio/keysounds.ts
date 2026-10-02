/**
 * Keysounds (design 7.5): the player's own drum, layered offline by
 * tools/rhythm/render_drumline.py from the studio one-shots, a procedural
 * marching knock and a beater click. PERFECT plays the brighter _plus take
 * (Beatstar Perfect+). Early hits start on the note's grid time.
 */

import { GameAudio } from '../../../gamekit';
import { J_PERFECT, J_SHARP, K_BIG, K_RIM } from '../core/types';

let registered = false;

export function registerKeysounds(): void {
  if (registered) return;
  registered = true;
  GameAudio.registerCues({
    rh_drum_hit: { src: require('./sfx/rh_drum_hit.wav'), durationMs: 260, maxVoices: 8, priority: 2, fallback: 'ui.tap' },
    rh_drum_hit_plus: { src: require('./sfx/rh_drum_hit_plus.wav'), durationMs: 260, maxVoices: 8, priority: 2, fallback: 'ui.tap' },
    rh_rim_hit: { src: require('./sfx/rh_rim_hit.wav'), durationMs: 220, maxVoices: 8, priority: 2, fallback: 'ui.tap' },
    rh_rim_hit_plus: { src: require('./sfx/rh_rim_hit_plus.wav'), durationMs: 220, maxVoices: 8, priority: 2, fallback: 'ui.tap' },
    rh_big_crash: { src: require('./sfx/rh_big_crash.wav'), durationMs: 1000, maxVoices: 3, priority: 3, fallback: 'ui.tap' },
  });
}

export const KEYSOUND_CUES = ['rh_drum_hit', 'rh_drum_hit_plus', 'rh_rim_hit', 'rh_rim_hit_plus', 'rh_big_crash'];

/** Level re the bed (7.5): about -7 LU, PERFECT about -5 LU; Pocket Parade a touch softer. */
const VOL = 0.72;
const VOL_PLUS = 0.9;

/**
 * Play the keysound for a judged hit. `deltaMs` < 0 is an early hit: it starts
 * on the grid (deltaMs later); on-time and late hits start now.
 */
export function playKeysound(kind: number, grade: number, deltaMs: number, quiet = false): void {
  const plus = grade === J_PERFECT || grade === J_SHARP;
  const delayMs = deltaMs < 0 ? Math.min(60, -deltaMs) : 0;
  const k = quiet ? 0.7 : 1;
  if (kind === K_BIG) {
    GameAudio.play('rh_big_crash', { volume: VOL_PLUS * k, delayMs });
    return;
  }
  const cue = kind === K_RIM ? (plus ? 'rh_rim_hit_plus' : 'rh_rim_hit') : plus ? 'rh_drum_hit_plus' : 'rh_drum_hit';
  GameAudio.play(cue, { volume: (plus ? VOL_PLUS : VOL) * k, delayMs });
}
