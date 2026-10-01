/**
 * Trivia Duel audio: cue map (design 13.3), release-safe fallbacks to Chris's
 * bank, Fin's babble, and the beat clock (11.1) that quantizes reveals to the
 * next 8th of the duel loop (136 BPM measured) and free-runs when muted.
 *
 * Key rule (rev 7, H3): every pitched ladder steps through the major
 * pentatonic of the loop that is playing (E for duel_loop, F for
 * duel_loop_final): 0, +2, +4, +7, +9, with +12 as the spark top step.
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
  glock: 'sh_glock',
  drum1: 'sh_drumroll_441ms',
  drum2: 'sh_drumroll_833ms',
  drum4: 'sh_drumroll_1764ms',
  gasp: 'crowd_gasp',
  tickHeavy: 'tv_tick_heavy',
  correct: 'tv_correct',
  vsSlam: 'tv_vs_slam',
  bell: 'sh_desk_bell',
  steal: 'tv_steal',
  chomp: 'sh_chomp',
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
  heartbeat: 'tv_heartbeat_soft',
  win: 'sting_trivia_win',
  lose: 'sting_trivia_lose',
} as const;

export const BEDS = {
  duel: 'duel_loop_rev7',
  hot: 'duel_loop_l2',
  blazing: 'duel_fever',
  /** 13.2: duel_loop +1 semitone at tape speed (144.08 BPM, F major), switched on the bar at the stamp. */
  final: 'duel_loop_final',
} as const;

/** Fallback chain per bed: the studio cut, then the Chris track it came from. */
const BED_FALLBACK: Record<string, string[]> = {
  duel_loop_rev7: ['duel_loop', 'chris.track3'],
  duel_loop_l2: ['duel_loop', 'chris.track3'],
  duel_fever: ['duel_loop', 'chris.track3'],
  duel_loop_final: ['final_tension_open', 'chris.inventory'],
};

let registered = false;
export function registerDuelAudio(): void {
  if (registered) return;
  registered = true;
  registerStudioAudio('trivia');
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    // Rev 7 candidates (pentatonic bakes, rank babble, derived beds): dev only until Dustin approves by ear.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const dev = require('./audioBank.dev');
    GameAudio.registerCues(withFallback(dev.DEV_CUES));
    GameAudio.registerBeds(dev.DEV_BEDS);
  }
  // 13.4 voice manager: ticks max 3, babble max 1, crowd max 1.
  GameAudio.setGroupCaps({ ticks: 3, babble: 1, crowd: 1 });
}

function withFallback(cues: Record<string, { fallback?: string }>): Record<string, any> {
  const out: Record<string, any> = {};
  Object.keys(cues).forEach((k) => { out[k] = { ...cues[k], fallback: cues[k].fallback ?? fallbackFor(k) }; });
  return out;
}

/** Which key the pitched ladders bake to right now: F during the Final, else E. */
let keyNow: 'e' | 'f' = 'e';
export function setDuelKey(k: 'e' | 'f'): void {
  keyNow = k;
}

/**
 * A pentatonic ladder step in the current key (step 0-4, 5 = +12 for sparks).
 * `family` is one of tv_correct, spark_tick, coin_tick, streak_step, tile.
 */
export function sfxKey(family: 'tv_correct' | 'spark_tick' | 'coin_tick' | 'streak_step' | 'tile', step: number, opts: { volume?: number; delayMs?: number } = {}): void {
  const name = `${family}_${keyNow}`;
  if (GameAudio.hasCue(name)) {
    sfxLadder(name, step, opts);
    return;
  }
  // Release / no bakes: the older studio ladders, then Chris.
  const legacy = family === 'tv_correct' ? CUE.correct : family === 'streak_step' ? CUE.streakStep : family === 'tile' ? CUE.lockIn : CUE.coinTick;
  sfxLadder(legacy, Math.min(step, 2), opts);
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

/** Studio bed if present, else its fallback chain (ending on the Chris track it was cut from). */
export function bed(name: string): string {
  if (GameAudio.bed(name)) return name;
  for (const alt of BED_FALLBACK[name] ?? []) if (GameAudio.bed(alt) || alt.startsWith('chris.')) return alt;
  return 'chris.track3';
}

/** Rank voice for Fin's babble (13.3): Deckhand +2, First Mate 0, Captain -3, Admiral -5 over E. */
export type BabbleVoice = 'deckhand' | 'first_mate' | 'captain' | 'admiral';

export { babbleSchedule, type BabbleHit } from './engine/babble';

/** One babble syllable in Fin's rank voice (max 1 voice; falls back to the older babble set). */
export function babbleSyllable(syllable: number, voice: BabbleVoice = 'first_mate', volume = 0.5): void {
  const name = `babble_${voice}`;
  if (GameAudio.hasCue(name)) sfxLadder(name, syllable - 1, { volume });
  else sfx(CUE.babble, { volume: volume * 0.9 });
}

/** Bark typing babble: one syllable per 5 typed characters (at 28ms per char that is 140ms apart). */
export function babble(i: number, text?: string, voice: BabbleVoice = 'first_mate'): void {
  if (i % 5 !== 1) return;
  const ch = (text ?? '').charAt(i - 1).toLowerCase();
  const code = ch.charCodeAt(0);
  const idx = code >= 97 && code <= 122 ? code - 97 : i;
  babbleSyllable((idx % 8) + 1, voice, 0.45);
}

/** Measured haptic-after-audio offset (13.4): audio first, haptic after. */
export const HAPTIC_AUDIO_OFFSET_MS = Platform.OS === 'ios' ? 12 : 28;

// -- Beat clock (11.1) -----------------------------------------------------------

const FREE = beatMapFromBpm(BEAT.duelBpm, 0, 128, 4, 0);
const FREE_F = beatMapFromBpm(BEAT.finalBpm, 0, 128, 4, 0);
let freeStart = Date.now();

export function resetFreeBeat(): void {
  freeStart = Date.now();
}

function mapAndPos(): { map: BeatMap; posP: Promise<number> | number } {
  const m = GameAudio.music;
  const map = m.playing ? m.beatMap() : null;
  if (map) return { map, posP: m.positionMs() };
  return { map: keyNow === 'f' ? FREE_F : FREE, posP: Date.now() - freeStart };
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

/** 13.4 mix: music -8dB under drum-rolls and reveals (80ms attack). */
export function duckForReveal(holdMs: number): void {
  try { GameAudio.duck(8, 80, holdMs, 300); } catch { /* audio never breaks play */ }
}

/** Last 3s of a window: music to its low-pass variant; reverts on lock. */
export function muffle(on: boolean): void {
  try { GameAudio.music.setState(on ? 'muffled' : 'open', on ? 200 : 150); } catch { /* ignore */ }
}
