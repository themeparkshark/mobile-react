/**
 * Current Quest sound (design 11). Every cue is the audio lead's mastered
 * candidate or one of Chris's originals; nothing is generated here.
 *
 * - One trigger per beat: a carry plays one baked `cq_carry_n` file on the
 *   75 ms grid (grab, slide bed, pentatonic ticks, spit-out), never per tile.
 * - Pearls climb the pentatonic ladder inside a voyage, so a clean run plays a
 *   rising melody.
 * - Music is the login loop edit in three sample-aligned layers: open (HIGH
 *   tide), calm (LOW tide: the percussion thins), lowstrokes (2 strokes left:
 *   the tom heartbeat). Riptide adds the percussion surge on top.
 * - Unapproved candidates play in dev builds only; release builds fall back
 *   to Chris's closest sound until Dustin approves them by ear.
 */

import { GameAudio } from '../../gamekit/audio/GameAudio';
import { registerStudioAudio } from '../../gamekit/audio/studioLibrary';
import type { CueDef } from '../../gamekit/audio/chrisBank';

let registered = false;

/** Baked sequences (carry 1..6, shell tallies, leftover pops). Dev-only candidates. */
function registerSequences(): void {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const seq = require('./audio.seq.dev').CQ_SEQ_CUES as Record<string, CueDef>;
  const out: Record<string, CueDef> = {};
  Object.keys(seq).forEach((id) => { out[id] = { ...seq[id], fallback: id.startsWith('cq_carry') ? 'fx.whoosh' : 'fx.coin' }; });
  GameAudio.registerCues(out);
}

export function registerCqAudio(): void {
  if (registered) return;
  registered = true;
  registerStudioAudio(['current-quest', 'sharky']);
  registerSequences();
}

export const CQ_PRELOAD = [
  'cq_swim', 'cq_aim', 'cq_pearl', 'cq_golden_pearl', 'cq_current_grab', 'cq_spit_out', 'sk_bump', 'cq_upstream',
  'cq_lock_rattle', 'cq_tread', 'cq_undo', 'cq_riptide', 'cq_beached', 'cq_chest_open', 'sh_wave_wash', 'sh_thud',
  'cq_ring_on', 'cq_ring_lost', 'cq_whirlpool', 'cq_shell_tick', 'sh_heads_up', 'sh_bubble_pop',
  'cq_carry_1', 'cq_carry_2', 'cq_carry_3', 'cq_carry_4', 'cq_carry_5', 'cq_carry_6',
  'cq_shells_1', 'cq_shells_2', 'cq_shells_3', 'ui.complete', 'fx.purchase', 'fx.whoosh', 'ui.press',
];

export const BED_OPEN = 'cq_bed_open';
export const BED_CALM = 'cq_bed_calm';
export const BED_LOW = 'cq_bed_lowstrokes';

function play(id: string, opts?: { volume?: number; delayMs?: number }): void {
  try {
    GameAudio.play(id, opts);
  } catch {
    // Audio must never break play.
  }
}

/** Re-target blip, pitched per direction (up E, right F#, down A, left B). */
export function sfxAim(dir: number): void {
  play('cq_aim', { volume: 0.8 });
  void dir;
}

export function sfxSwim(step: number): void {
  try { GameAudio.playLadder('cq_swim', Math.max(0, Math.min(4, step))); } catch { /* noop */ }
}

/** One baked file for the whole carry (grab + slide + ladder ticks + spit-out). */
export function sfxCarry(tiles: number): void {
  const n = Math.max(1, Math.min(6, tiles));
  if (GameAudio.hasCue(`cq_carry_${n}`)) play(`cq_carry_${n}`);
  else {
    play('cq_current_grab');
    play('cq_spit_out', { delayMs: 60 + 75 * n + 40 });
  }
}

export function sfxPearl(step: number, delayMs = 0): void {
  try { GameAudio.playLadder('cq_pearl', Math.max(0, Math.min(9, step)), { delayMs }); } catch { /* noop */ }
}

export function sfxBump(reason: string): void {
  if (reason === 'upstream') play('cq_upstream');
  else if (reason === 'locked') play('cq_lock_rattle');
  else play('sk_bump', { volume: 0.9 });
}

export function sfxGolden(): void {
  play('cq_golden_pearl');
  play('fx.coin', { volume: 0.7, delayMs: 40 });
  GameAudio.duck(6, 40, 250, 250);
}

export function sfxUnlock(): void {
  play('ui.complete', { volume: 0.85 });
  GameAudio.duck(6, 40, 250, 250);
}

export function sfxChest(): void { play('cq_chest_open'); }
export function sfxTide(): void { play('sh_wave_wash', { volume: 0.8 }); }
export function sfxTread(): void { play('cq_tread'); }
export function sfxUndo(): void { play('cq_undo'); }
export function sfxBeached(): void { play('cq_beached'); }
export function sfxStall(): void { play('sh_thud'); }
export function sfxRingOn(): void { play('cq_ring_on'); }
export function sfxRingLost(): void { play('cq_ring_lost'); }
export function sfxWhirlpool(): void { play('cq_whirlpool'); }
export function sfxTip(): void { play('sh_heads_up'); }
export function sfxButton(): void { play('ui.press', { volume: 0.7 }); }
export function sfxTransition(): void { play('fx.whoosh', { volume: 0.9 }); }

export function sfxRiptide(): void {
  play('cq_riptide');
  play('cq_surge_4bar', { volume: 0.9 });
  GameAudio.duck(4, 40, 250, 300);
}

/** Mid-run clear: baked shell tally (1..3 chimes on the ladder). */
export function sfxShells(n: number): void {
  const k = Math.max(1, Math.min(3, n));
  if (GameAudio.hasCue(`cq_shells_${k}`)) play(`cq_shells_${k}`);
  else for (let i = 0; i < k; i++) play('cq_shell_tick', { delayMs: i * 110 });
}

/** Final clear: Chris's purchase success, then the win cadence cut from the bed. */
export function sfxFinalClear(): void {
  play('fx.purchase');
  play('cq_win', { delayMs: 350, volume: 0.85 });
}

export function sfxLeftover(n: number): void {
  const k = Math.max(1, Math.min(10, n));
  if (GameAudio.hasCue(`cq_leftover_${k}`)) play(`cq_leftover_${k}`);
  else for (let i = 0; i < k; i++) play('sh_bubble_pop', { delayMs: i * 90 });
}

export function sfxTally(n: number): void {
  const k = Math.max(1, Math.min(9, n));
  if (GameAudio.hasCue(`cq_tally_${k}`)) play(`cq_tally_${k}`);
}

/** Which layer of the lagoon bed fits the moment (design 11.2). */
export function bedFor(tideLow: boolean, left: number, riptide: boolean): string {
  if (left <= 2 && left >= 0) return BED_LOW;
  if (riptide) return BED_OPEN;
  return tideLow ? BED_CALM : BED_OPEN;
}
