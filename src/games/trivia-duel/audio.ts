/**
 * Trivia Duel audio: cue map (design 13.3), release-safe fallbacks to Chris's
 * bank, Fin's babble, and the beat clock (11.1) that quantizes reveals to the
 * next 8th of the duel loop (136 BPM measured) and free-runs when muted.
 */
import { Platform } from 'react-native';
import { GameAudio } from '../../gamekit/audio/GameAudio';
import { fallbackFor, registerStudioAudio } from '../../gamekit/audio/studioLibrary';
import { beatMapFromBpm, msToNext, type BeatMap } from '../../gamekit/core/beatMap';
import { BEAT } from './engine/config';

export const CUE = {
  tilePress: 'ui.tap',
  tick: 'ui.button',
  wrong: 'fx.nope',
  whoosh: 'fx.whoosh',
  streakStep: 'fx.reveal',
  rankUp: 'fx.reward',
  coinTick: 'coin_tick',
  lockIn: 'tv_lock_in',
  oppLock: 'tv_opp_lock',
  unlock: 'sh_glock',
  tickHeavy: 'tv_tick_heavy',
  drum1: 'sh_drumroll',
  correct: 'tv_correct',
  vsSlam: 'tv_vs_slam',
  bell: 'sh_desk_bell',
  steal: 'tv_steal',
  photo: 'sh_camera',
  chomp: 'sh_chomp',
  freeze: 'sh_freeze',
  unfreeze: 'sh_unfreeze',
  sonar: 'sh_sonar',
  shieldPop: 'sh_shield_pop',
  powerup: 'sh_powerup',
  crowd: 'sh_crowd_cheer',
  clap: 'sh_clap',
  stamp: 'sh_stamp',
  ignite: 'tv_flame_ignite',
  fizz: 'tv_flame_fizz',
  think: 'tv_think',
  oops: 'tv_oops',
  bonk: 'tv_head_bonk',
  babble: 'tv_babble',
  chip: 'tv_wager_chip',
  win: 'sting_trivia_win',
  lose: 'sting_trivia_lose',
} as const;

export const BEDS = {
  duel: 'duel_loop',
  hot: 'duel_loop_l2',
  blazing: 'duel_fever',
  finalClosed: 'final_tension_closed',
  finalOpen: 'final_tension_open',
} as const;

let registered = false;
export function registerDuelAudio(): void {
  if (registered) return;
  registered = true;
  registerStudioAudio('trivia');
}

/** Play a cue; unapproved studio cues fall back to the closest Chris sound in release. */
export function sfx(name: string, opts: { volume?: number; pan?: number; delayMs?: number; pitch?: number } = {}): void {
  try {
    if (GameAudio.hasCue(name)) GameAudio.play(name, opts);
    else GameAudio.play(fallbackFor(name), opts);
  } catch {
    // Audio is never allowed to break play.
  }
}

export function sfxLadder(name: string, step: number, opts: { volume?: number; delayMs?: number } = {}): void {
  try {
    if (GameAudio.hasCue(name)) GameAudio.playLadder(name, step, opts);
    else GameAudio.play(fallbackFor(name), opts);
  } catch {
    // ignore
  }
}

/** Studio bed if present, else the Chris track it was cut from. */
export function bed(name: string): string {
  if (GameAudio.bed(name)) return name;
  return name.startsWith('final') ? 'chris.inventory' : 'chris.track3';
}

/** One babble syllable per typed character (Animal Crossing style), capped at 1 voice. */
export function babble(i: number): void {
  if (i % 2 !== 0) return;
  sfx(CUE.babble, { volume: 0.55, pitch: ((i * 7) % 5 - 2) * 0.5 });
}

/** Measured haptic-after-audio offset (13.4): audio first, haptic after. */
export const HAPTIC_AUDIO_OFFSET_MS = Platform.OS === 'ios' ? 12 : 28;

// -- Beat clock (11.1) -----------------------------------------------------------

const FREE = beatMapFromBpm(BEAT.duelBpm, 0, 128, 4, 0);
let freeStart = Date.now();

export function resetFreeBeat(): void {
  freeStart = Date.now();
}

function mapAndPos(): { map: BeatMap; posP: Promise<number> | number } {
  const m = GameAudio.music;
  const map = m.playing ? m.beatMap() : null;
  if (map) return { map, posP: m.positionMs() };
  return { map: FREE, posP: Date.now() - freeStart };
}

/** Delay (ms) to the next grid line: 0.5 = 8th, 2 = half-bar... beat units. */
export async function msToGrid(division: number, minLeadMs = 20): Promise<number> {
  try {
    const { map, posP } = mapAndPos();
    const pos = await posP;
    return Math.max(0, Math.min(600, msToNext(map, pos, division, minLeadMs)));
  } catch {
    return 0;
  }
}

/** Beat length (ms) of whatever is playing. */
export function beatMs(final = false): number {
  return 60000 / (final ? BEAT.finalBpm : BEAT.duelBpm);
}
