/**
 * gameMomentSound.ts: plays an in-game moment's sound (wow-games lane).
 *
 * Every moment names a studio cue, a variant and today's sound. The studio
 * cue plays only while the wow-sound switch is on (off until Dustin approves
 * by ear); with it off the moment plays today's sound (Chris's bank through
 * playSfx), so nothing new reaches a speaker without his yes. The wow-sound
 * lane flips the switch with setGameMomentStudio() from its studio switch.
 */

import { GameAudio, type PlayOptions } from './GameAudio';
import { playSfx } from '../SFX';
import { playHaptic } from '../Haptics';
import type { HapticPatternName } from '../core/hapticGrammar';

let studioOn = false;
let useVariant = false;

/** Turn studio cues on for in-game moments (wired to the wow-sound switch). */
export function setGameMomentStudio(on: boolean, variant = false): void {
  studioOn = on;
  useVariant = variant;
}

export function gameMomentStudioOn(): boolean {
  return studioOn;
}

/**
 * Play one moment: the studio cue (or its variant) when the switch is on and
 * the cue exists, otherwise today's sound. `step` climbs a pitch ladder.
 */
export function playGameMoment(cue: string | null, variant: string | null, today: string | null,
  opts: PlayOptions & { step?: number } = {}): void {
  try {
    if (studioOn && cue) {
      const name = useVariant && variant && GameAudio.hasCue(variant) ? variant : cue;
      if (GameAudio.hasCue(name)) {
        if (opts.step !== undefined) GameAudio.playLadder(name, opts.step, opts);
        else GameAudio.play(name, opts);
        return;
      }
    }
    if (today) playSfx(today, opts.volume ?? 1);
  } catch {
    // Sound is decoration: a moment never breaks on it.
  }
}

/** The moment's buzz (haptic grammar name), through the in-game haptic bus. */
export function playGameHaptic(name: HapticPatternName): void {
  try {
    playHaptic(name);
  } catch {
    // Haptics are decoration too.
  }
}
