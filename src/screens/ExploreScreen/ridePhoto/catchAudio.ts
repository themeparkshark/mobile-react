import { GameAudio } from '../../../gamekit/audio/GameAudio';
import { createSfxLimiter } from '../../../audio/sfxLimiter';
import { beatHaptic, queueHaptic, type HapticIntent } from '../../../gamekit/Haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { momentSaver, playMoment, preloadMoments, studioMoment, studioReady } from '../../../gamekit/audio/playMoment';
import type { MomentName } from '../../../gamekit/audio/momentMap';
import { burstMoment, CATCH_WOBBLE_TICKS_MS, catchHeat, decodeDay, EMPTY_RUN, encodeDay, HEAT_MAX, heatTier, HOT_LAYER_HEAT, type CatchRunState } from '../../../gamekit/audio/catchSoundPlan';
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

/** The studio moments a map catch can play (decoded ahead so the first catch never waits on a file). */
export const CATCH_MOMENTS: readonly MomentName[] = [
  'catch.tap', 'catch.wobble', 'catch.burst', 'catch.repeat', 'catch.firstOfDay', 'catch.lucky', 'catch.milestone',
  'catch.hot', 'catch.fly', 'catch.land', 'ui.counterTick', 'game.miss',
];
let momentsReady = false;
/** Studio on: decode the catch moments once (a no-op with the switch off). Safe to call often. */
function preloadCatchMoments(): void {
  if (momentsReady || !studioReady('catch.tap')) return;
  momentsReady = true;
  void preloadMoments(CATCH_MOMENTS);
}

/** Load every catch sound once per session (called when a Ride Photo find appears). */
export function preloadCatchAudio(): Promise<void> {
  if (ready) return ready;
  if (!registered) {
    GameAudio.registerCues(CUES as never);
    GameAudio.registerBeds(BEDS as never);
    registered = true;
  }
  preloadCatchMoments();
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
/** After 'done', counter ticks from coins still landing keep the studio ladder this long. */
const DONE_TAIL_MS = 700;
/**
 * `haptics` counts the catch's haptics before the burst: the first is the press, the next three are the
 * wobble swings, and each wobble tick plays from that same call, so the tick and its buzz leave the JS
 * thread together (a separate timer drifted 50 to 130 ms under load). No wobble haptics (Reduce Motion
 * skips the wobble) means no ticks.
 */
let session: {
  until: number; wobbles: ReturnType<typeof setTimeout>[]; haptics: number; ticks: number; burst: boolean; heat: number; done?: boolean;
  /** Highest counter rung played so far (-1 before the first): the counter only ever climbs. */
  rung: number;
  /** The roll after the stamp has played the rest of the ladder; later counter ticks are covered. */
  rolled: boolean;
  /** The burst's own haptic (the first one after the burst mark) has fired. */
  burstBuzzed: boolean;
} | null = null;
const WOBBLE_INTENTS = new Set<HapticIntent>(['tickSelection', 'tapLight', 'hitMedium']);
let run: CatchRunState = EMPTY_RUN;
let primed = false;
const DAY_KEY = 'tps.sound.lastCatchDay';
/** Highest rung of the counter ladder (13 steps, 0..12). */
const COUNTER_TOP = 12;
/** Most rungs a quick run lifts the badge ticks. */
const COUNTER_HEAT_MAX = 4;
/**
 * The catch's own beats (tap, three wobbles, burst, success) own the haptic for this long after
 * the tap: they fire in the same call as their frame and sound (beatHaptic), never held behind the
 * shared 120 ms window, so a press buzz from the map a moment earlier cannot push them late.
 * Every player, switch on or off: it is a timing fix, not a new sound.
 */
const BEAT_WINDOW_MS = 1200;
let beatUntil = 0;
/**
 * The counter roll (COUNT tokens in src/ui/motion.ts: at most 12 ticks, a final bump of 1.12): when the
 * coin stamps into the badge, the rest of the counter ladder rolls up in ROLL_TICKS_MAX quick ticks
 * ROLL_STEP_MS apart and lands on the top rung, so the count is over within 300 ms of the stamp. The
 * badge cascade's later ticks (and the bar tick) are then covered by it, so a slow phone can never
 * trickle ticks seconds after the catch has settled.
 */
/** Three ticks: inside the counter tick's 3-voice cap, so none steals another before it is heard. */
const ROLL_TICKS_MAX = 3;
const ROLL_STEP_MS = 70;
const ROLL_VOLUME = 0.7;
const ROLL_FINAL_BUMP = 1.12;
/** Heat of the catch in progress (or the last one), for every player: wow-map can scale its rays with it. */
let heatNow = 0;
/** Wobble buzzes climb with heat (tier 1: one rung, tier 2: two), capped below the burst's heavy. */
const WOBBLE_LADDER: readonly HapticIntent[] = ['tickSelection', 'tapLight', 'hitMedium'];
/** At heat tier 2 the burst lands a second, crisper thump this long after the heavy one. */
const HOT_THUMP_MS = 90;

function primeCatchState(): void {
  if (primed) return;
  primed = true;
  void AsyncStorage.getItem(DAY_KEY).then((raw) => {
    const day = decodeDay(raw);
    if (day && run.dayKey === null) run = { ...run, dayKey: day.dayKey, dayCount: day.dayCount };
  }).catch(() => undefined);
}

function sessionOpen(now = Date.now()): boolean {
  return !!session && now < session.until;
}

function endSession(): void {
  session?.wobbles.forEach(clearTimeout);
  session = null;
}

function keepSession(): void {
  // After 'done' only the short tail runs out; nothing stretches it.
  if (session && !session.done) session.until = Date.now() + SESSION_IDLE_MS;
}

/**
 * How hot the current catch is (0 calm .. HEAT_MAX), known from the tap: every quick catch in a row
 * adds one, a 2 minute pause resets it. The same number drives the sound and the buzz; wow-map can
 * read it to give a hot run more rays or a brighter glow. Every player, switch on or off (it is a
 * count, not a sound).
 */
export function currentCatchHeat(): number {
  return heatNow;
}

function onCatchMark(name: string): void {
  // 'tap-repeat': a later catch this session (wow-map's short repeat: two wobbles, burst at 450 ms).
  if (name === 'tap' || name === 'tap-repeat') {
    beatUntil = Date.now() + BEAT_WINDOW_MS;
    const now = Date.now();
    heatNow = catchHeat(run, now);
    if (!studioReady('catch.tap')) { endSession(); return; }
    // The studio switch can turn on after the find appeared (the flag reads late): decode now at the latest.
    preloadCatchMoments();
    primeCatchState();
    endSession();
    session = { until: now + SESSION_IDLE_MS, wobbles: [], haptics: 0, ticks: 0, burst: false, heat: heatNow, rung: -1, rolled: false, burstBuzzed: false };
    if (session.heat > 0) traceEvent('mark', 'catch-heat', `+${session.heat}`);
    playMoment('catch.tap');
    return;
  }
  if (name === 'done' || name === 'miss') beatUntil = 0;
  if (name === 'burst' && !sessionOpen()) {
    // Switch off: the run still counts (heat for the visuals), nothing plays and nothing is stored.
    run = burstMoment(run, Date.now()).state;
    return;
  }
  if (!sessionOpen()) return;
  keepSession();
  if (name === 'burst') {
    session?.wobbles.forEach(clearTimeout);
    if (session) session.burst = true;
    const next = burstMoment(run, Date.now());
    const stored = encodeDay(next.state);
    if (stored) void AsyncStorage.setItem(DAY_KEY, stored).catch(() => undefined);
    run = next.state;
    traceEvent('mark', 'catch-run', `#${run.count} -> ${next.moment}`);
    playMoment(next.moment);
    // A hot run (5 quick catches and up) adds a bright glockenspiel on the burst. Battery Saver: the burst alone.
    if ((session?.heat ?? 0) >= HOT_LAYER_HEAT && !momentSaver()) playMoment('catch.hot', { delayMs: 60 });
  } else if (name === 'fly') {
    playMoment('catch.fly');
  } else if (name === 'miss') {
    session?.wobbles.forEach(clearTimeout);
    if (session) session.burst = true;
    playMoment('game.miss');
  } else if (name === 'done') {
    // The coin stream can still be landing in the counter: its ticks keep the ladder for a short tail.
    session?.wobbles.forEach(clearTimeout);
    if (session) { session.burst = true; session.done = true; session.until = Date.now() + DONE_TAIL_MS; }
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
  heatNow = 0;
  momentsReady = false;
  primed = true;
  beatUntil = 0;
}

/** While a map catch is open (studio on): what the catch's own sounds become. */
function sessionSound(name: CatchSound, opts: { volume?: number; pitch?: number }): boolean {
  if (!sessionOpen() || !studioReady('catch.tap')) return false;
  keepSession();
  if (name === 'pop' || name === 'chime' || name === 'whoosh') return true; // the marks played these
  const s = session;
  if (!s) return false;
  const lift = Math.round((s.heat * COUNTER_HEAT_MAX) / HEAT_MAX);
  if (name === 'badge') {
    const ok = studioMoment('catch.land', { volume: opts.volume });
    if (ok && !s.rolled) rollCounter(s, lift);
    return ok;
  }
  if (name === 'tick') {
    // After the roll the counter is already full: the cascade's later ticks are covered by it.
    if (s.rolled) return true;
    // One rolling ladder: the coin-stream ticks climb up to 4 rungs with the run and never step back or repeat.
    if (opts.pitch === undefined) return studioMoment('ui.counterTick', { volume: opts.volume });
    if (s.rung >= COUNTER_TOP) return true;
    const step = Math.min(COUNTER_TOP, Math.max(opts.pitch + lift, s.rung + 1));
    s.rung = step;
    return studioMoment('ui.counterTick', { volume: opts.volume, step });
  }
  return false;
}

/**
 * The stamp starts the roll: the rest of the counter ladder in up to ROLL_TICKS_MAX ticks, ROLL_STEP_MS
 * apart, ending on the top rung a touch louder (the count's final bump). Each tick is scheduled on the
 * audio clock from this one call (delayMs), so a busy JS thread cannot spread them out. Battery Saver:
 * just the top tick.
 */
function rollCounter(s: NonNullable<typeof session>, lift: number): void {
  s.rolled = true;
  const from = Math.min(COUNTER_TOP, Math.max(s.rung + 1, 2 + lift));
  const span = COUNTER_TOP - from;
  const n = momentSaver() ? 1 : Math.min(ROLL_TICKS_MAX, span + 1);
  const rungs: number[] = [];
  for (let i = 0; i < n; i++) rungs.push(n === 1 ? COUNTER_TOP : Math.round(from + (span * i) / (n - 1)));
  traceEvent('mark', 'catch-roll', rungs.join(' '));
  rungs.forEach((step, i) => {
    const last = i === rungs.length - 1;
    studioMoment('ui.counterTick', { step, delayMs: (i + 1) * ROLL_STEP_MS, volume: last ? Math.min(1, ROLL_VOLUME * ROLL_FINAL_BUMP) : ROLL_VOLUME });
  });
  s.rung = COUNTER_TOP;
}

/**
 * A catch haptic. Inside the catch's beat window (tap to burst) it fires in this same call
 * (beatHaptic): no timer hop, no 120 ms gate, so the buzz leaves the JS thread with its frame and,
 * with the studio switch on, with its sound (audio-api output is about 20 ms, below what a hand can
 * tell). Each wobble haptic also plays its rising tick from this call (one JS callback for both).
 * Outside the window (the Ride Photo catch, the miss, late beats) it is the shared gate, as before.
 */
export function catchHaptic(intent: HapticIntent, priority = 2): void {
  trace('haptic', intent);
  try {
    if (sessionOpen() && studioReady('catch.tap')) {
      const s = session;
      const tier = s ? heatTier(s.heat) : 0;
      // The held breath: the three wobble haptics each bring a rising tick, a rung higher in a quick run.
      if (s && !s.burst) {
        s.haptics += 1;
        if (s.haptics > 1 && s.ticks < CATCH_WOBBLE_TICKS_MS.length && WOBBLE_INTENTS.has(intent)) {
          playMoment('catch.wobble', { step: s.heat + s.ticks++ });
          // Hotter runs buzz heavier too (light, then medium), never past the burst's heavy.
          const at = WOBBLE_LADDER.indexOf(intent);
          if (tier > 0 && at >= 0 && !momentSaver()) intent = WOBBLE_LADDER[Math.min(WOBBLE_LADDER.length - 1, at + tier)];
        }
      } else if (s && s.burst && !s.burstBuzzed && !s.done) {
        // The burst's own buzz. At heat tier 2 a second, crisper thump follows it (Battery Saver: one pulse).
        s.burstBuzzed = true;
        if (tier >= 2 && Date.now() < beatUntil && !momentSaver()) {
          traceEvent('mark', 'catch-thump', `+${s.heat}`);
          setTimeout(() => { if (Date.now() < beatUntil) beatHaptic('hitRigid'); }, HOT_THUMP_MS);
        }
      } else if (s && s.rolled && intent === 'tickSelection') {
        // The stamp's buzz carries the rolled count; a bar tick seconds later would buzz with no sound.
        return;
      }
    }
  } catch { /* sound is decoration */ }
  if (Date.now() < beatUntil) beatHaptic(intent);
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
