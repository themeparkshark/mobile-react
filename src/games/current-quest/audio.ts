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

import { useContext, useEffect, useRef } from 'react';
import { GameAudio, type PlayOptions } from '../../gamekit/audio/GameAudio';
import { nextBarMs } from '../../gamekit/core/audioMix';
import { registerStudioAudio } from '../../gamekit/audio/studioLibrary';
import type { BedDef, CueDef } from '../../gamekit/audio/chrisBank';
import { AuthContext } from '../../context/AuthProvider';
import { MusicContext } from '../../context/MusicProvider';

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

/**
 * v7.1 additions from the audio lead (0.A.10, G5), dev-only until Dustin's by-ear
 * OK: the second bed (Chris's track-2, 54.5 to 82.8 s, 16 bars at 136 BPM, the
 * same open / calm / lowstrokes recipe), the brighter fail stinger
 * `cq_sting_soclose` (login's final cadence, a soft tom and a G4 to D5 lift)
 * and the four aim blips pitched per direction. Release builds fall back to
 * Chris's sounds and the login bed.
 */
function registerV71(): void {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return;
  const cues: Record<string, CueDef> = {
    cq_sting_soclose: { src: require('../../assets/games/current-quest/music/cq_sting_soclose.m4a'), durationMs: 1300, bus: 'stinger', maxVoices: 1, priority: 3, approved: false, fallback: 'fx.whoosh' },
    cq_aim_0: { src: require('../../assets/games/current-quest/sfx/cq_aim_0.m4a'), durationMs: 154, bus: 'ui', maxVoices: 2, priority: 1, approved: false, fallback: 'cq_aim' },
    cq_aim_1: { src: require('../../assets/games/current-quest/sfx/cq_aim_1.m4a'), durationMs: 154, bus: 'ui', maxVoices: 2, priority: 1, approved: false, fallback: 'cq_aim' },
    cq_aim_2: { src: require('../../assets/games/current-quest/sfx/cq_aim_2.m4a'), durationMs: 154, bus: 'ui', maxVoices: 2, priority: 1, approved: false, fallback: 'cq_aim' },
    cq_aim_3: { src: require('../../assets/games/current-quest/sfx/cq_aim_3.m4a'), durationMs: 154, bus: 'ui', maxVoices: 2, priority: 1, approved: false, fallback: 'cq_aim' },
  };
  GameAudio.registerCues(cues);
  const bed = (src: number): BedDef => ({ src, bpm: 136, beatsPerBar: 4, offsetMs: 0, loopEndMs: BED2_LOOP_MS, approved: false });
  GameAudio.registerBeds({
    cq_bed2_open: bed(require('../../assets/games/current-quest/music/cq_bed2_open.m4a')),
    cq_bed2_calm: bed(require('../../assets/games/current-quest/music/cq_bed2_calm.m4a')),
    cq_bed2_lowstrokes: bed(require('../../assets/games/current-quest/music/cq_bed2_lowstrokes.m4a')),
  });
}

/** 16 bars at 136 BPM. */
export const BED2_LOOP_MS = 28235;
/** 16 bars at 89.103 BPM (the login edit). */
export const BED1_LOOP_MS = 42649;

export function registerCqAudio(): void {
  if (registered) return;
  registered = true;
  registerStudioAudio(['current-quest', 'sharky']);
  registerSequences();
  registerV71();
}

/** Every cue is loaded into the voice pool at game open; nothing loads mid-play (11.5). */
export const CQ_PRELOAD = [
  'cq_swim', 'cq_aim', 'cq_pearl', 'cq_golden_pearl', 'cq_current_grab', 'cq_spit_out', 'sk_bump', 'cq_upstream',
  'cq_lock_rattle', 'cq_tread', 'cq_undo', 'cq_riptide', 'cq_beached', 'cq_chest_open', 'sh_wave_wash', 'sh_thud',
  'cq_ring_on', 'cq_ring_lost', 'cq_whirlpool', 'cq_shell_tick', 'sh_heads_up', 'sh_bubble_pop', 'cq_tide_turn_short',
  'cq_ink', 'cq_surf_sting', 'cq_surge_4bar', 'cq_amb_lagoon', 'cq_win',
  ...Array.from({ length: 10 }, (_, k) => `cq_carry_${k + 1}`),
  ...Array.from({ length: 10 }, (_, k) => `cq_carry_${k + 1}_rip`),
  'cq_shells_1', 'cq_shells_2', 'cq_shells_3', 'ui.complete', 'fx.purchase', 'fx.whoosh', 'ui.press',
];


function play(id: string, opts?: PlayOptions): void {
  try {
    GameAudio.play(id, opts);
  } catch {
    // Audio must never break play.
  }
}

/** Re-target blip, pitched per direction (G5: up D, right C, down G, left A; a tread uses the plain blip). */
export function sfxAim(dir: number): void {
  const id = dir >= 0 && dir <= 3 && GameAudio.hasCue(`cq_aim_${dir}`) ? `cq_aim_${dir}` : 'cq_aim';
  play(id, { volume: 0.8 });
}

/** The fail stinger (0.A.10): a bright "so close", never silence. */
export function sfxSoClose(): void {
  play(GameAudio.hasCue('cq_sting_soclose') ? 'cq_sting_soclose' : 'fx.whoosh', { volume: 0.9 });
}

/** Shield / counter pop (0.A.6) and an opponent's distant splash (14.1), from shared one-shots. */
export function sfxShieldPop(): void { play('sh_bubble_pop', { volume: 0.95 }); play('cq_shell_tick', { volume: 0.7, delayMs: 60 }); }
export function sfxSplashIncoming(): void { play('sh_wave_wash', { volume: 0.7 }); }
export function sfxOpponentClear(): void { play('cq_tide_turn_short', { volume: 0.45 }); }

export function sfxSwim(step: number): void {
  try { GameAudio.playLadder('cq_swim', Math.max(0, Math.min(4, step))); } catch { /* noop */ }
}

/** One baked file for the whole carry (grab + slide + ladder ticks + hand-off whooshes + spit-out); Riptide strokes use the gold `_rip` take. */
export function sfxCarry(tiles: number, riptide = false): void {
  const n = Math.max(1, Math.min(10, tiles));
  const id = riptide && GameAudio.hasCue(`cq_carry_${n}_rip`) ? `cq_carry_${n}_rip` : `cq_carry_${n}`;
  if (GameAudio.hasCue(id)) play(id);
  else {
    play('cq_current_grab');
    play('cq_spit_out', { delayMs: 60 + 75 * n + 40 });
  }
}

/** A fast-forwarded carry: only its spit-out lands, so sound never lags the picture (7.3). */
export function sfxSpitOut(): void { play('cq_spit_out'); }

/** Riptide hand-off between two current runs. */
export function sfxHandoff(): void { play('cq_surf_sting', { volume: 0.55 }); }

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
/** Full tide turn (first of a voyage, Splash). */
export function sfxTide(): void { play('sh_wave_wash', { volume: 0.8 }); }
/** Compact tide turn: a short sting so later turns never become wallpaper (F5). */
export function sfxTideShort(): void { play('cq_tide_turn_short', { volume: 0.85 }); }
export function sfxTread(): void { play('cq_tread'); }
/** Tape-rewind undo; a hold-to-scrub rises a step per stroke (rate step only on the scrub, never the ladders). */
export function sfxUndo(step = 0): void { play('cq_undo', { pitch: Math.min(3, Math.max(0, step)) * 2 }); }
/** Wrong-turn X stamp on the stall card (-6 dB bump). */
export function sfxWrongTurn(): void { play('cq_ink', { volume: 0.7 }); }
/** Ambient lagoon bed (-30 LUFS, 20 s) under everything from GO to results. */
export function sfxAmbience(): void { play('cq_amb_lagoon', { volume: 0.9 }); }
/** Win cadence cut from the bed (Extreme Fever and 3-star finales). */
export function sfxWin(): void { play('cq_win', { volume: 0.85 }); }
export function sfxBeached(): void { play('cq_beached'); }
/** Par buoy sinks (0.A.14): a low bubble gurgle. */
export function sfxParSink(): void { play('sh_bubble_pop', { volume: 0.55, pitch: -5 }); play('sh_bubble_pop', { volume: 0.4, pitch: -8, delayMs: 140 }); }
export function sfxStall(): void { play('sh_thud'); }
export function sfxRingOn(): void { play('cq_ring_on'); }
export function sfxRingLost(): void { play('cq_ring_lost'); }
export function sfxWhirlpool(): void { play('cq_whirlpool'); }
export function sfxTip(): void { play('sh_heads_up'); }
export function sfxButton(): void { play('ui.press', { volume: 0.7 }); }
export function sfxTransition(): void { play('fx.whoosh', { volume: 0.9 }); }

/** Riptide stroke: the whoosh now, the 4-bar percussion surge on the bed's NEXT downbeat (11.2). */
export function sfxRiptide(): void {
  play('cq_riptide');
  GameAudio.duck(4, 40, 250, 300);
  const clock = GameAudio.music.clock();
  if (!clock) { play('cq_surge_4bar', { volume: 0.9 }); return; }
  void GameAudio.music.positionMs().then((pos) => {
    const at = nextBarMs(clock, pos, 40);
    play('cq_surge_4bar', { volume: 0.9, delayMs: Math.max(0, at - pos) });
  }).catch(() => play('cq_surge_4bar', { volume: 0.9 }));
}

/** Mid-run clear: baked shell tally (1..3 chimes on the ladder). */
export function sfxShells(n: number): void {
  const k = Math.max(1, Math.min(3, n));
  if (GameAudio.hasCue(`cq_shells_${k}`)) play(`cq_shells_${k}`);
  else for (let i = 0; i < k; i++) play('cq_shell_tick', { delayMs: i * 110 });
}

/** Final clear: Chris's purchase success (the win cadence joins on 3 stars or Extreme Fever). */
export function sfxFinalClear(): void {
  play('fx.purchase');
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

/**
 * Which layer of the lagoon bed fits the moment (design 11.2): the tom
 * heartbeat at 2 strokes left, the open layer during a Riptide surge, the calm
 * layer at LOW tide (the percussion audibly thins) and while thinking idle
 * (6 s without input), the open layer otherwise.
 */
export function bedFor(tideLow: boolean, left: number, riptide: boolean, idleThin = false, set: 1 | 2 = 1): string {
  const pre = set === 2 && GameAudio.bed('cq_bed2_open') ? 'cq_bed2_' : 'cq_bed_';
  if (left <= 2 && left >= 0) return `${pre}lowstrokes`;
  if (riptide) return `${pre}open`;
  if (idleThin) return `${pre}calm`;
  return tideLow ? `${pre}calm` : `${pre}open`;
}

/** Which bed set a run uses: runs alternate the login and track-2 beds by run index (0.A.10). */
export function bedSetFor(runIndex: number): 1 | 2 {
  return runIndex % 2 === 1 ? 2 : 1;
}

/**
 * Current Quest's own bed player (11.2, v7): the bed is silent on the Trick
 * Shot and enters on the Deep tray rise at a random bar (0, 4, 8 or 12 of the
 * 16-bar loop), so the same downbeat never greets every run. Layer changes
 * (tide, low strokes, surge, idle thinning) keep the loop position. It hands
 * the app's own music off and back exactly like useGameMusic.
 */
export function useCqMusic(bed: string | null, startBar: number): void {
  const app = useContext(MusicContext);
  const { player } = useContext(AuthContext);
  const musicOn = player?.enabled_music !== false;
  const started = useRef<string | null>(null);
  useEffect(() => {
    GameAudio.setMusicEnabled(musicOn);
    GameAudio.music.setAppMusicBridge({
      suspend: () => { try { void app?.stopMusic?.(); } catch { /* optional */ } },
      restore: () => { try { void app?.restoreMusic?.(); } catch { /* optional */ } },
    });
  }, [app, musicOn]);
  useEffect(() => {
    if (!musicOn) return;
    if (!bed) {
      if (started.current) { GameAudio.music.stop(400); started.current = null; }
      return;
    }
    void GameAudio.init().then(() => {
      if (!started.current) {
        started.current = bed;
        const def = GameAudio.bed(bed);
        const barMs = def?.bpm ? (60000 / def.bpm) * (def.beatsPerBar ?? 4) : 0;
        return GameAudio.music.play(bed, 350, Math.max(0, startBar) * barMs);
      }
      if (started.current === bed) return undefined;
      started.current = bed;
      return GameAudio.music.switchTo(bed, 'bar', 350, true);
    });
  }, [bed, musicOn, startBar]);
  useEffect(() => () => { started.current = null; GameAudio.music.stop(400); }, []);
}
