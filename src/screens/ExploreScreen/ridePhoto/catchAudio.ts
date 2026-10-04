import { GameAudio } from '../../../gamekit/audio/GameAudio';
import { createSfxLimiter } from '../../../audio/sfxLimiter';
import { queueHaptic, type HapticIntent } from '../../../gamekit/Haptics';

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
  | 'pip0' | 'pip3' | 'pip7' | 'tick' | 'chime' | 'sparkle' | 'aww' | 'whoosh';

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
const HOUSE: Partial<Record<CatchSound, string>> = { tick: 'ui.select', chime: 'fx.coin', sparkle: 'fx.reveal', aww: 'fx.nopeShort', whoosh: 'fx.whoosh' };
// The chime is the fanfare that rides with the crowd; only the long tails queue.
const STINGERS = new Set<CatchSound>(['cheer', 'sparkle']);
const PRIORITY: Partial<Record<CatchSound, number>> = { shutter: 4, flash: 3, cheer: 3, badge: 3, chime: 3, sparkle: 3 };

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
export function catchMark(name: string): void { trace('mark', name); }

export function catchHaptic(intent: HapticIntent, priority = 2): void {
  trace('haptic', intent);
  queueHaptic(intent, priority);
}

export function catchSound(name: CatchSound, opts: { volume?: number; pitch?: number } = {}): void {
  const cue = HOUSE[name] ?? `ride.${name}`;

  const fire = () => {
    trace('sound', name, opts.pitch ? ` pitch=${opts.pitch}` : '');
    const def = CUES[cue];
    const id = limiter.request(name, { priority: PRIORITY[name] ?? 2, durationMs: def?.durationMs ?? 400 });
    if (id == null) return;
    void (async () => {
      try {
        if (!registered) await preloadCatchAudio();
        if (!GameAudio.backend) await GameAudio.init();
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
