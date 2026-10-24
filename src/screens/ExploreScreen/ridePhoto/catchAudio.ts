import { GameAudio } from '../../../gamekit/audio/GameAudio';
import { createSfxLimiter } from '../../../audio/sfxLimiter';
import { queueHaptic, type HapticIntent } from '../../../gamekit/Haptics';
import { AccessibilityInfo } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { playMoment, studioMoment, studioReady } from '../../../gamekit/audio/playMoment';
import type { MomentName } from '../../../gamekit/audio/momentMap';
import { burstMoment, CATCH_WOBBLE_TICKS_MS, EMPTY_RUN, type CatchRunState } from '../../../gamekit/audio/catchSoundPlan';
import { traceEvent } from '../../../gamekit/audio/studioTrace';

/**
 * The catch's own audio channel: real camera sounds (licensed, Epidemic Sound),
 * mixed through a 4-voice limiter that is only used while a catch is open, so
 * the shutter, flash, whirr and crowd can layer without the app-wide 2-voice cap.
 * Stingers never stack: a new stinger waits for the previous tail.
 */

const S = {
  shutter: require('../../../../assets/sounds/ride-photo/shutter.mp3'),
  notYet: require('../../../../assets/sounds/ride-photo/not-yet.mp3'),
  // Ride sounds (licensed, Epidemic Sound; sfx/rides, trimmed and looped in round 5).
  flumeSplash: require('../../../../assets/sounds/ride-photo/rides/flume-splash-big.mp3'),
  flumeChain: require('../../../../assets/sounds/ride-photo/rides/flume-lift-chain.mp3'),
  teacupClink: require('../../../../assets/sounds/ride-photo/rides/teacup-clink.mp3'),
  teacupWhoosh: require('../../../../assets/sounds/ride-photo/rides/teacups-spin-whoosh.mp3'),
  brakes: require('../../../../assets/sounds/ride-photo/rides/brakes-hiss.mp3'),
  whee: require('../../../../assets/sounds/ride-photo/rides/crowd-scream-fun.mp3'),
  gull: require('../../../../assets/sounds/ride-photo/rides/seagull.mp3'),
  fireworks: require('../../../../assets/sounds/ride-photo/rides/fireworks-pop.mp3'),
  golden: require('../../../../assets/sounds/ride-photo/rides/golden-hour-shimmer.mp3'),
  organLoop: require('../../../../assets/sounds/ride-photo/rides/organ-loop.mp3'),
  waterLoop: require('../../../../assets/sounds/ride-photo/rides/flume-water-loop.mp3'),
  flash: require('../../../../assets/sounds/ride-photo/flash.mp3'),
  charge: require('../../../../assets/sounds/ride-photo/flash-charge.mp3'),
  film: require('../../../../assets/sounds/ride-photo/film.mp3'),
  cheer: require('../../../../assets/sounds/ride-photo/cheer.mp3'),
  pop: require('../../../../assets/sounds/ride-photo/print-pop.mp3'),
  badge: require('../../../../assets/sounds/ride-photo/badge-land.mp3'),
  clack: require('../../../../assets/sounds/ride-photo/clack.mp3'),
  pip0: require('../../../../assets/sounds/ride-photo/pip-0.mp3'),
  pip3: require('../../../../assets/sounds/ride-photo/pip-3.mp3'),
  pip7: require('../../../../assets/sounds/ride-photo/pip-7.mp3'),
};

export type CatchSound = 'shutter' | 'notYet' | 'flumeSplash' | 'flumeChain' | 'teacupClink' | 'teacupWhoosh' | 'brakes'
  | 'whee' | 'gull' | 'fireworks' | 'golden' | 'flash' | 'charge' | 'film' | 'cheer' | 'pop' | 'badge' | 'clack'
  | 'pip0' | 'pip3' | 'pip7' | 'tick' | 'chime' | 'sparkle' | 'aww' | 'whoosh'
  // v2 catch reveal (house cues, no new assets)
  | 'riser' | 'coinTick' | 'stamp' | 'reward' | 'firework';

const CUES: Record<string, { src: unknown; gainDb?: number; bus: 'sfx' | 'stinger' | 'ui'; maxVoices: number; durationMs: number }> = {
  'ride.shutter': { src: S.shutter, gainDb: 0, bus: 'sfx', maxVoices: 2, durationMs: 350 },
  'ride.notYet': { src: S.notYet, gainDb: -2, bus: 'ui', maxVoices: 1, durationMs: 110 },
  'ride.flumeSplash': { src: S.flumeSplash, gainDb: -3, bus: 'sfx', maxVoices: 1, durationMs: 1000 },
  'ride.flumeChain': { src: S.flumeChain, gainDb: -10, bus: 'sfx', maxVoices: 1, durationMs: 2100 },
  'ride.teacupClink': { src: S.teacupClink, gainDb: -8, bus: 'sfx', maxVoices: 1, durationMs: 150 },
  'ride.teacupWhoosh': { src: S.teacupWhoosh, gainDb: -10, bus: 'sfx', maxVoices: 1, durationMs: 280 },
  'ride.brakes': { src: S.brakes, gainDb: -12, bus: 'sfx', maxVoices: 1, durationMs: 1600 },
  'ride.whee': { src: S.whee, gainDb: -8, bus: 'sfx', maxVoices: 1, durationMs: 700 },
  'ride.gull': { src: S.gull, gainDb: -10, bus: 'sfx', maxVoices: 1, durationMs: 320 },
  'ride.fireworks': { src: S.fireworks, gainDb: -10, bus: 'sfx', maxVoices: 1, durationMs: 900 },
  'ride.golden': { src: S.golden, gainDb: -6, bus: 'sfx', maxVoices: 1, durationMs: 1300 },
  'ride.flash': { src: S.flash, gainDb: -3, bus: 'sfx', maxVoices: 1, durationMs: 600 },
  'ride.charge': { src: S.charge, gainDb: -6, bus: 'sfx', maxVoices: 1, durationMs: 500 },
  'ride.film': { src: S.film, gainDb: -5, bus: 'sfx', maxVoices: 1, durationMs: 600 },
  'ride.cheer': { src: S.cheer, gainDb: -3, bus: 'stinger', maxVoices: 1, durationMs: 2000 },
  'ride.pop': { src: S.pop, gainDb: -4, bus: 'sfx', maxVoices: 2, durationMs: 500 },
  'ride.badge': { src: S.badge, gainDb: -3, bus: 'sfx', maxVoices: 1, durationMs: 500 },
  'ride.clack': { src: S.clack, gainDb: -8, bus: 'sfx', maxVoices: 1, durationMs: 1400 },
  'ride.pip0': { src: S.pip0, gainDb: -4, bus: 'ui', maxVoices: 1, durationMs: 90 },
  'ride.pip3': { src: S.pip3, gainDb: -4, bus: 'ui', maxVoices: 1, durationMs: 90 },
  'ride.pip7': { src: S.pip7, gainDb: -4, bus: 'ui', maxVoices: 1, durationMs: 90 },
};
/** Borrowed house cues for the small beats. */
const HOUSE: Partial<Record<CatchSound, string>> = { tick: 'ui.select', chime: 'fx.coin', sparkle: 'fx.reveal', aww: 'fx.nopeShort', whoosh: 'fx.whoosh',
  riser: 'fx.whooshRev', coinTick: 'fx.coinTick', stamp: 'ui.confirm', reward: 'fx.reward', firework: 'fx.firework' };
/** Studio sound on (wow-sound switch): the house beats speak the app's moment vocabulary. Off: unchanged. */
const MOMENT: Partial<Record<CatchSound, MomentName>> = { chime: 'catch.burst', coinTick: 'catch.count', sparkle: 'reward.reveal', stamp: 'reward.stamp' };
// The chime is the fanfare that rides with the crowd; only the long tails queue.
const STINGERS = new Set<CatchSound>(['cheer', 'sparkle', 'reward']);
const PRIORITY: Partial<Record<CatchSound, number>> = { shutter: 4, flash: 3, cheer: 3, badge: 3, chime: 3, sparkle: 3, reward: 3, stamp: 3, firework: 3, coinTick: 1 };

/** Ride ambience beds (loop while the viewfinder is open): the teacups' organ, the flume's water. */
const BEDS = {
  'ride.organ': { src: S.organLoop, gainDb: -14 },
  'ride.water': { src: S.waterLoop, gainDb: -12 },
};

let registered = false;
let ready: Promise<void> | null = null;
const limiter = createSfxLimiter({ maxVoices: 4 });
let stingerUntil = 0;

/** Load every catch sound once per session (called when a Ride Photo find appears). */
export function preloadCatchAudio(): Promise<void> {
  if (ready) return ready;
  if (!registered) {
    GameAudio.registerCues(CUES as never);
    GameAudio.registerBeds(BEDS as never);
    registered = true;
  }
  ready = GameAudio.preload([...Object.keys(CUES), ...Object.values(HOUSE) as string[]]).catch(() => undefined);
  return ready;
}

/** Play on the catch channel. A stinger waits for the previous stinger's tail instead of stacking. */
/** Development: every sound and haptic is logged with a timestamp, for AUDIO_TIMELINE.md and sync review. */
/** Preview recordings in a Release build (no console there) read the trace from this buffer. */
export const catchTraceBuffer: string[] = [];
function trace(kind: string, name: string, extra = '') {
  if (!__DEV__) return;
  const line = `[catch-av] ${Date.now()} ${kind} ${name}${extra}`;
  console.log(line);
  if (catchTraceBuffer.length < 5000) catchTraceBuffer.push(line);
}
/**
 * Studio sound for the map catch (wow-sound): the catch's beat marks drive the moment vocabulary, so
 * the sound sits on the same beat as the motion. 'tap' plays the pluck and the three rising wobble
 * ticks; 'burst' rings the burst for this catch (first of the day, a quick repeat, every 12th a lucky
 * shower, or the full bell); 'fly' slides up after the coin; 'miss' is the funny boing. While a catch
 * is open its own pop, chime and whoosh stay quiet (the marks already played them), the badge stamps
 * and the badge beats climb the counter ladder. Switch off: none of this runs and nothing changes.
 */
const SESSION_IDLE_MS = 4000;
let session: { until: number; wobbles: ReturnType<typeof setTimeout>[] } | null = null;
let run: CatchRunState = EMPTY_RUN;
let reduced = false;
let primed = false;
const DAY_KEY = 'tps.sound.lastCatchDay';

function primeCatchState(): void {
  if (primed) return;
  primed = true;
  void AccessibilityInfo.isReduceMotionEnabled().then((v) => { reduced = v; }).catch(() => undefined);
  try { AccessibilityInfo.addEventListener('reduceMotionChanged', (v: boolean) => { reduced = v; }); } catch { /* optional */ }
  void AsyncStorage.getItem(DAY_KEY).then((day) => { if (day && run.dayKey === null) run = { ...run, dayKey: day }; }).catch(() => undefined);
}

function sessionOpen(now = Date.now()): boolean {
  return !!session && now < session.until;
}

function endSession(): void {
  session?.wobbles.forEach(clearTimeout);
  session = null;
}

function keepSession(): void {
  if (session) session.until = Date.now() + SESSION_IDLE_MS;
}

function onCatchMark(name: string): void {
  if (name === 'tap') {
    if (!studioReady('catch.tap')) return;
    primeCatchState();
    endSession();
    session = { until: Date.now() + SESSION_IDLE_MS, wobbles: [] };
    playMoment('catch.tap');
    if (!reduced) {
      // The held breath: three rising ticks on the wobble swings (the haptics fire on the same beats).
      CATCH_WOBBLE_TICKS_MS.forEach((at, step) => {
        session?.wobbles.push(setTimeout(() => { if (sessionOpen()) playMoment('catch.wobble', { step }); }, at));
      });
    }
    return;
  }
  if (!sessionOpen()) return;
  keepSession();
  if (name === 'burst') {
    session?.wobbles.forEach(clearTimeout);
    const next = burstMoment(run, Date.now());
    if (next.moment === 'catch.firstOfDay' && next.state.dayKey) void AsyncStorage.setItem(DAY_KEY, next.state.dayKey).catch(() => undefined);
    run = next.state;
    traceEvent('mark', 'catch-run', `#${run.count} -> ${next.moment}`);
    playMoment(next.moment);
  } else if (name === 'fly') {
    playMoment('catch.fly');
  } else if (name === 'miss') {
    session?.wobbles.forEach(clearTimeout);
    playMoment('game.miss');
  } else if (name === 'done') {
    endSession();
  }
}

export function catchMark(name: string): void {
  trace('mark', name);
  traceEvent('mark', `catch ${name}`);
  try { onCatchMark(name); } catch { /* sound is decoration */ }
}

/** Tests only. */
export function resetCatchSoundForTests(): void {
  endSession();
  run = EMPTY_RUN;
  reduced = false;
  primed = true;
}

/** While a map catch is open (studio on): what the catch's own sounds become. */
function sessionSound(name: CatchSound, opts: { volume?: number; pitch?: number }): boolean {
  if (!sessionOpen() || !studioReady('catch.tap')) return false;
  keepSession();
  if (name === 'pop' || name === 'chime' || name === 'whoosh') return true; // the marks played these
  if (name === 'badge') return studioMoment('catch.land', { volume: opts.volume });
  if (name === 'tick') return studioMoment('ui.counterTick', { volume: opts.volume, step: opts.pitch });
  return false;
}

/**
 * While a studio-sound catch is open, every catch haptic waits for the audio output latency
 * (20 ms on audio-api), so the buzz is felt on the same frame the sound is heard. Off: unchanged.
 */
export function catchHaptic(intent: HapticIntent, priority = 2): void {
  trace('haptic', intent);
  let lead = 0;
  try { lead = sessionOpen() && studioReady('catch.tap') ? GameAudio.latencyMs : 0; } catch { lead = 0; }
  if (lead > 0) setTimeout(() => queueHaptic(intent, priority), lead);
  else queueHaptic(intent, priority);
}

export function catchSound(name: CatchSound, opts: { volume?: number; pitch?: number } = {}): void {
  const cue = HOUSE[name] ?? `ride.${name}`;

  const fire = () => {
    trace('sound', name, opts.pitch ? ` pitch=${opts.pitch}` : '');
    if (sessionSound(name, opts)) return;
    const def = CUES[cue];
    const id = limiter.request(name, { priority: PRIORITY[name] ?? 2, durationMs: def?.durationMs ?? 400 });
    if (id == null) return;
    void (async () => {
      try {
        if (!registered) await preloadCatchAudio();
        if (!GameAudio.backend) await GameAudio.init();
        const moment = MOMENT[name];
        if (moment && studioMoment(moment, { volume: opts.volume })) return;
        GameAudio.play(cue, { volume: opts.volume, pitch: opts.pitch });
      } catch {
        // Sound is decoration; never break the catch.
      }
    })();
  };
  if (STINGERS.has(name)) {
    const now = Date.now();
    const wait = Math.max(0, stingerUntil - now);
    stingerUntil = now + wait + (name === 'cheer' ? 1400 : 500);
    if (wait > 0) { setTimeout(fire, wait); return; }
  }
  fire();
}

/** The crowd swells over everything else for a Frame It!. */
export function duckForCheer(): void {
  try { GameAudio.duck(6, 60, 1100, 300); } catch { /* optional */ }
}

/** Start a ride's ambience bed (teacups organ, flume water) for the open; no-op for rides without one. */
export function startRideAmbience(kind: string): void {
  const bed = kind === 'teacups' ? 'ride.organ' : kind === 'flume' ? 'ride.water' : null;
  if (!bed) return;
  trace('sound', `bed-${bed}`);
  void (async () => {
    try {
      if (!registered) await preloadCatchAudio();
      if (!GameAudio.backend) await GameAudio.init();
      await GameAudio.music.play(bed, 400);
    } catch { /* ambience is decoration */ }
  })();
}

export function stopRideAmbience(): void {
  try { GameAudio.music.stop(300); } catch { /* optional */ }
}
