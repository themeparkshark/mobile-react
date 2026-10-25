import { GameAudio } from '../../../gamekit/audio/GameAudio';
import { createSfxLimiter } from '../../../audio/sfxLimiter';
import { beatHaptic, lastAppHapticAt, queueHaptic, type HapticIntent } from '../../../gamekit/Haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { momentSaver, playMoment, preloadMoments, studioMoment, studioReady } from '../../../gamekit/audio/playMoment';
import type { MomentName } from '../../../gamekit/audio/momentMap';
import { burstMoment, CATCH_WOBBLE_INTENTS, CATCH_WOBBLE_TICKS_MS, catchHeat, COIN_TICK_GAP_MS, decodeDay, EMPTY_RUN, encodeDay, HEAT_MAX, heatTier, HOT_LAYER_HEAT, MIN_BEAT_GAP_MS, REPEAT_WOBBLE_INTENTS, REPEAT_WOBBLE_TICKS_MS, type CatchRunState } from '../../../gamekit/audio/catchSoundPlan';
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
  // Not kept while sound is off (no engine), so turning Sound on preloads normally.
  ready = GameAudio.preload([...Object.keys(CUES), ...Object.values(HOUSE) as string[]]).then(ok => { if (!ok) ready = null; }, () => undefined);
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
 * the sound sits on the same beat as the motion. 'tap' plays the pluck; the first wobble beat lays
 * down the rising wobble ticks; 'beam' (every 10th catch) slams the gold beam in; 'burst' rings the
 * burst the picture shows (the full show's bell or golden chord, the short show's sparkle, the grand
 * 25th's shower); 'fly' slides up after the coin; 'miss' is the funny boing. While a catch is open its
 * own pop, chime and whoosh stay quiet (the marks already played them), the badge stamps and each coin
 * landing in the counter climbs the counter ladder. Switch off: none of this runs and nothing changes.
 */
const SESSION_IDLE_MS = 4000;
/**
 * Before the burst the catch can hold on the wobble while the server answers (wow-map holds its clock at
 * the hit-stop), so the studio catch stays open this long from the tap, not just SESSION_IDLE_MS: on a
 * slow park connection the burst, flight and stamp still speak the studio vocabulary instead of falling
 * back to today's sounds halfway through.
 */
const PRE_BURST_MS = 20_000;
/** The burst, its success pulse and a beam impact are beats whenever they come (a slow server delays them). */
const BURST_BEAT_MS = 400;
/** Until then the burst's own buzzes (heavy, success, the hot thump) are beats; coin ticks bunched with them are not. */
let burstBeatUntil = 0;
const BURST_INTENTS = new Set<HapticIntent>(['comboHeavy', 'success', 'hitRigid']);
/** After 'done', counter ticks from coins still landing keep the studio ladder this long. */
const DONE_TAIL_MS = 700;
/**
 * The studio catch while it is open. Round 5: the wobble ticks are scheduled on the audio clock from
 * the first wobble beat, all at once (wobbleVoices), so a busy JS thread can never bunch them into a
 * flam; the burst cancels any tick still waiting. Coin ticks are spaced on the audio clock too.
 */
let session: {
  until: number; burst: boolean; heat: number; done?: boolean;
  /** The short show (wow-map 'tap-repeat'). */
  repeatPlan: boolean;
  /** The gold beam dropped on this catch (wow-map 'beam' mark). */
  beam: boolean;
  /** Wobble ticks waiting on the audio clock: voice id and the time it starts. */
  wobbleVoices: { id: number; at: number }[];
  /** Highest counter rung played so far (-1 before the first): the counter only ever climbs. */
  rung: number;
  /** When the last coin tick into the counter starts (audio clock, ms): the next one waits COIN_TICK_GAP_MS. */
  lastTickAt: number;
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
/** A tick with this pitch or higher is the progress bar's gold tick (wow-map), not the coin count. */
const BAR_TICK_PITCH = 14;
/**
 * The catch's own beats (tap, wobbles, burst, success) own the haptic for this long after
 * the tap: they fire in the same call as their frame and sound (beatHaptic), never held behind the
 * shared 120 ms window, so a press buzz from the map a moment earlier cannot push them late.
 * Every player, switch on or off: it is a timing fix, not a new sound.
 */
const BEAT_WINDOW_MS = 1200;
let beatUntil = 0;
/**
 * The catch's beat haptics, every player (switch on or off). Round 5: a JS stall delivered two wobble
 * beats in the same millisecond (a flam you could hear and feel). Now the first wobble beat plans the
 * others at the show's own spacing (timers), whichever comes first of the timer and wow-map's own beat
 * fires each one once, two buzzes never land under MIN_BEAT_GAP_MS apart (a bunched one waits), and
 * the hit-stop or burst drops any wobble buzz still waiting. A press echo (the map's own press buzz a
 * moment before the tap) replaces the tap buzz instead of doubling it.
 */
let beats: {
  /** Catch haptics since the tap (the first is the press). */
  n: number;
  offsets: readonly number[];
  intents: readonly HapticIntent[];
  /** Wobble beats wow-map has sent so far. */
  seen: number;
  fired: boolean[];
  timers: ReturnType<typeof setTimeout>[];
  /** The hit-stop or burst has come: no wobble buzz after it. */
  closed: boolean;
} | null = null;
/**
 * The stamp is a beat too: the haptic that follows the badge sound in the same frame (wow-map's arrive()
 * plays catchSound('badge') then catchHaptic) fires with it, never held behind a coin-stream tick buzz
 * in the 120 ms window (the replay showed the stamp buzz 70 ms late). One pulse, every player.
 */
const LAND_BEAT_MS = 40;
let landBeatUntil = 0;
/** Heat of the catch in progress (or the last one), for every player: wow-map can scale its rays with it. */
let heatNow = 0;
/** Wobble buzzes climb with heat (tier 1: one rung, tier 2: two), capped below the burst's heavy. */
const WOBBLE_LADDER: readonly HapticIntent[] = ['tickSelection', 'tapLight', 'hitMedium'];
/** At heat tier 2 the burst lands a second, crisper thump this long after the heavy one. */
const HOT_THUMP_MS = 90;
/** The golden pair: the success pulse lands this long after the burst's heavy one (hapticGrammar 'golden'). */
const GOLDEN_SUCCESS_MS = 180;
/** When the burst's heavy buzz fired (every player), so a bunched success still lands GOLDEN_SUCCESS_MS after it. */
let burstBuzzAt = -Infinity;

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

/** Stop the wobble ticks that have not started yet (the burst came early, or the catch ended). */
function cutWobbles(): void {
  const s = session;
  if (!s) return;
  const now = Date.now();
  for (const v of s.wobbleVoices) {
    if (v.at > now) {
      try { GameAudio.stop(v.id); } catch { /* optional */ }
      traceEvent('mark', 'catch-wobble-cut', `${v.at - now} ms early`);
    }
  }
  s.wobbleVoices = [];
}

function closeBeats(): void {
  if (!beats) return;
  beats.closed = true;
  beats.timers.forEach(clearTimeout);
  beats.timers = [];
}

function endSession(): void {
  cutWobbles();
  session = null;
}

function keepSession(): void {
  // After 'done' only the short tail runs out; nothing stretches it. Before the burst the server hold keeps it open.
  if (session && !session.done) session.until = Math.max(session.until, Date.now() + SESSION_IDLE_MS);
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
  // 'tap-repeat': a later catch this session (wow-map's short show: two wobbles, burst at 450 ms).
  if (name === 'tap' || name === 'tap-repeat') {
    const now = Date.now();
    const repeatPlan = name === 'tap-repeat';
    beatUntil = now + BEAT_WINDOW_MS;
    catchLive = true;
    closeBeats();
    beats = {
      n: 0, seen: 0, fired: [], timers: [], closed: false,
      offsets: repeatPlan ? REPEAT_WOBBLE_TICKS_MS : CATCH_WOBBLE_TICKS_MS,
      intents: repeatPlan ? REPEAT_WOBBLE_INTENTS : CATCH_WOBBLE_INTENTS,
    };
    heatNow = catchHeat(run, now);
    if (!studioReady('catch.tap')) { endSession(); return; }
    // The studio switch can turn on after the find appeared (the flag reads late): decode now at the latest.
    preloadCatchMoments();
    primeCatchState();
    endSession();
    session = { until: now + PRE_BURST_MS, burst: false, heat: heatNow, repeatPlan, beam: false, wobbleVoices: [], rung: -1, lastTickAt: -Infinity, burstBuzzed: false };
    if (session.heat > 0) traceEvent('mark', 'catch-heat', `+${session.heat}`);
    playMoment('catch.tap');
    return;
  }
  if (name === 'hitstop' || name === 'burst' || name === 'miss' || name === 'skip' || name === 'beam') closeBeats();
  if (name === 'hitstop' || name === 'burst' || name === 'beam') burstBeatUntil = Date.now() + BURST_BEAT_MS;
  if (name === 'done' || name === 'miss') { beatUntil = 0; burstBeatUntil = 0; catchLive = false; }
  if (name === 'burst' && !sessionOpen()) {
    // Switch off: the run still counts (heat for the visuals), nothing plays and nothing is stored.
    run = burstMoment(run, Date.now(), { repeatPlan: beats?.offsets === REPEAT_WOBBLE_TICKS_MS }).state;
    return;
  }
  if (!sessionOpen()) return;
  keepSession();
  const s = session;
  if (!s) return;
  if (name === 'hitstop') {
    // The held breath is silent: a tick still waiting would ring through it.
    cutWobbles();
  } else if (name === 'beam') {
    // Every 10th catch the gold beam lands on the held frame: its own slam (wow-map buzzes the impact).
    s.beam = true;
    cutWobbles();
    playMoment('catch.lucky');
  } else if (name === 'burst') {
    cutWobbles();
    s.burst = true;
    s.until = Date.now() + SESSION_IDLE_MS;
    const next = burstMoment(run, Date.now(), { repeatPlan: s.repeatPlan, beam: s.beam });
    const stored = encodeDay(next.state);
    if (stored) void AsyncStorage.setItem(DAY_KEY, stored).catch(() => undefined);
    run = next.state;
    traceEvent('mark', 'catch-run', `#${run.count} -> ${next.moment}`);
    playMoment(next.moment);
    // A hot run (5 quick catches and up) adds a bright glockenspiel on the burst. Battery Saver: the burst alone.
    if (s.heat >= HOT_LAYER_HEAT && !momentSaver()) playMoment('catch.hot', { delayMs: 60 });
  } else if (name === 'fly') {
    playMoment('catch.fly');
  } else if (name === 'miss') {
    cutWobbles();
    s.burst = true;
    playMoment('game.miss');
  } else if (name === 'done') {
    // The coin stream can still be landing in the counter: its ticks keep the ladder for a short tail.
    cutWobbles();
    s.burst = true; s.done = true; s.until = Date.now() + DONE_TAIL_MS;
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
  closeBeats();
  beats = null;
  run = EMPTY_RUN;
  heatNow = 0;
  momentsReady = false;
  primed = true;
  beatUntil = 0;
  landBeatUntil = 0;
  burstBeatUntil = 0;
  burstBuzzAt = -Infinity;
  beatLaneAt = -Infinity;
  catchLive = false;
}

/** While a map catch is open (studio on): what the catch's own sounds become. */
function sessionSound(name: CatchSound, opts: { volume?: number; pitch?: number }): boolean {
  if (!sessionOpen() || !studioReady('catch.tap')) return false;
  keepSession();
  if (name === 'pop' || name === 'chime' || name === 'whoosh') return true; // the marks played these
  const s = session;
  if (!s) return false;
  const lift = Math.round((s.heat * COUNTER_HEAT_MAX) / HEAT_MAX);
  // The stamp is only the stamp: the counter already counted on the coins' own landings (round 5 drops
  // round 4's roll after the stamp, which ticked while the digits had nearly stopped).
  if (name === 'badge') return studioMoment('catch.land', { volume: opts.volume });
  if (name === 'tick') {
    if (opts.pitch === undefined) return studioMoment('ui.counterTick', { volume: opts.volume });
    // The progress bar's gold tick (a NEW find): its own top note, whatever the count reached.
    if (opts.pitch >= BAR_TICK_PITCH) return studioMoment('ui.counterTick', { volume: opts.volume, step: COUNTER_TOP });
    // A coin landing in the counter (wow-map plays one on every other coin, on the frame its digits
    // move): one rolling ladder that climbs up to 4 rungs with the run, never steps back or repeats,
    // and is spaced on the audio clock so a bunched beat cannot flam.
    if (s.rung >= COUNTER_TOP) return true;
    const now = Date.now();
    const at = Math.max(now, s.lastTickAt + COIN_TICK_GAP_MS);
    // A bunched batch keeps at most three ticks in flight (the counter tick's voice cap, so none steals
    // another before it is heard); a tick that would trail the digits by more than that is covered.
    if (at - now > 2 * COIN_TICK_GAP_MS) return true;
    const step = Math.min(COUNTER_TOP, Math.max(opts.pitch + lift, s.rung + 1));
    s.rung = step;
    s.lastTickAt = at;
    return studioMoment('ui.counterTick', { volume: opts.volume, step, delayMs: at - now });
  }
  return false;
}

/**
 * The catch's beat lane (every player): the latest beat pulse fired or already planned. A beat that would
 * land under MIN_BEAT_GAP_MS after it waits its turn instead of flamming (only the burst's heavy buzz never
 * waits: it is the peak), and while a catch is open any other pulse that would land on top of a beat is
 * dropped (a coin tick bunched with the burst is decoration).
 */
let beatLaneAt = -Infinity;
/** Between the tap and 'done' / 'miss'. */
let catchLive = false;

function laneLast(): number {
  return Math.max(lastAppHapticAt(), beatLaneAt);
}

/** Fire a beat haptic now, or at the lane's next free slot; `wobble` beats are dropped once the gather closes. */
function laneBeat(intent: HapticIntent, wobble = false): void {
  const now = Date.now();
  const gap = now - laneLast();
  if (gap >= MIN_BEAT_GAP_MS) { beatLaneAt = now; beatHaptic(intent); return; }
  const at = laneLast() + MIN_BEAT_GAP_MS;
  beatLaneAt = at;
  traceEvent('mark', 'catch-beat-spaced', `${intent} +${at - now} ms`);
  const b = beats;
  const t = setTimeout(() => { if (!(wobble && (b?.closed || beats !== b))) beatHaptic(intent); }, at - now);
  if (wobble && b) b.timers.push(t);
}

function spacedBeat(intent: HapticIntent, wobble: boolean): void {
  laneBeat(intent, wobble);
}

/** Heat lifts a wobble buzz (studio on only; Battery Saver keeps the plain one). */
function heated(intent: HapticIntent): HapticIntent {
  const s = session;
  if (!s || !sessionOpen() || !studioReady('catch.tap') || momentSaver()) return intent;
  const tier = heatTier(s.heat);
  const at = WOBBLE_LADDER.indexOf(intent);
  return tier > 0 && at >= 0 ? WOBBLE_LADDER[Math.min(WOBBLE_LADDER.length - 1, at + tier)] : intent;
}

/** Wobble k's buzz: once, whichever comes first of its timer and wow-map's own beat. */
function fireWobble(k: number, intent: HapticIntent): void {
  const b = beats;
  if (!b || b.closed || b.fired[k]) return;
  b.fired[k] = true;
  spacedBeat(heated(intent), true);
}

/**
 * The first wobble beat plans the rest of the gather: the remaining buzzes as timers at the show's
 * own spacing, and (studio on) every rising tick on the audio clock in one go, a rung higher in a
 * quick run, so the ticks stay even however busy the JS thread is.
 */
function startWobbles(intent: HapticIntent): void {
  const b = beats;
  if (!b) return;
  const base = b.offsets[0] ?? 0;
  fireWobble(0, intent);
  for (let k = 1; k < b.offsets.length; k++) {
    const at = b.offsets[k] - base;
    b.timers.push(setTimeout(() => fireWobble(k, b.intents[k] ?? intent), at));
  }
  const s = session;
  if (s && sessionOpen() && studioReady('catch.tap') && !s.burst) {
    const now = Date.now();
    // Each delay is measured from `now` (a slow JS thread can take a few ms over the three calls).
    s.wobbleVoices = b.offsets.map((off, k) => {
      const delayMs = Math.max(0, off - base - (Date.now() - now));
      return { id: playMoment('catch.wobble', { step: s.heat + k, delayMs }), at: now + off - base };
    }).filter((v) => v.id > 0);
  }
}

/**
 * A catch haptic. Inside the catch's beat window (tap to burst) it fires in this same call
 * (beatHaptic): no timer hop, no 120 ms gate, so the buzz leaves the JS thread with its frame and,
 * with the studio switch on, with its sound (audio-api output is about 20 ms, below what a hand can
 * tell). The wobble beats are planned from the first one (startWobbles) and never flam. Outside the
 * window (the Ride Photo catch, the miss, late beats) it is the shared gate, as before.
 */
export function catchHaptic(intent: HapticIntent, priority = 2): void {
  trace('haptic', intent);
  const now = Date.now();
  try {
    const b = beats;
    if (b && now < beatUntil && !b.closed) {
      b.n += 1;
      if (b.n === 1) {
        // The press: if the map's own press buzz just fired for this touch, that pulse is the tap.
        if (now - lastAppHapticAt() < MIN_BEAT_GAP_MS) { traceEvent('mark', 'catch-press-echo', intent); return; }
        beatHaptic(intent);
        return;
      }
      if (WOBBLE_INTENTS.has(intent) && b.seen < b.offsets.length) {
        const k = b.seen++;
        if (k === 0) startWobbles(intent);
        else fireWobble(k, intent);
        return;
      }
    }
    if (sessionOpen() && studioReady('catch.tap')) {
      const s = session;
      if (s && s.burst && !s.burstBuzzed && !s.done) {
        // The burst's own buzz. At heat tier 2 a second, crisper thump follows it (Battery Saver: one pulse).
        s.burstBuzzed = true;
        if (heatTier(s.heat) >= 2 && (now < beatUntil || now < burstBeatUntil) && !momentSaver()) {
          traceEvent('mark', 'catch-thump', `+${s.heat}`);
          setTimeout(() => { if (Date.now() < Math.max(beatUntil, burstBeatUntil)) beatHaptic('hitRigid'); }, HOT_THUMP_MS);
        }
      }
    }
  } catch { /* sound is decoration */ }
  const burstBeat = now < burstBeatUntil && BURST_INTENTS.has(intent);
  if (now < beatUntil || burstBeat) {
    const b = beats;
    if (intent === 'comboHeavy' && b?.closed) {
      // The peak: always on its frame, never waits.
      burstBuzzAt = now;
      beatLaneAt = Math.max(beatLaneAt, now);
      beatHaptic(intent);
      return;
    }
    // A stalled thread delivers the burst and its success together: the success still waits its 180 ms.
    if (intent === 'success' && now - burstBuzzAt < GOLDEN_SUCCESS_MS - 30) {
      const at = burstBuzzAt + GOLDEN_SUCCESS_MS;
      traceEvent('mark', 'catch-beat-spaced', `success +${at - now} ms`);
      burstBuzzAt = -Infinity;
      beatLaneAt = Math.max(beatLaneAt, at);
      setTimeout(() => beatHaptic('success'), at - now);
      return;
    }
    laneBeat(intent);
  } else if (now < landBeatUntil) {
    // The stamp is on its frame, unless it arrived in the same JS turn as another beat (a frozen screen
    // delivering everything at once) or a beat is still planned: then it takes the lane's next slot.
    landBeatUntil = 0;
    if (now - lastAppHapticAt() < LAND_BEAT_MS || beatLaneAt > now) laneBeat(intent);
    else { beatLaneAt = now; beatHaptic(intent); }
  } else if (catchLive && beatLaneAt > now - MIN_BEAT_GAP_MS) {
    traceEvent('mark', 'catch-pulse-dropped', intent);
  } else {
    queueHaptic(intent, priority);
  }
}

export function catchSound(name: CatchSound, opts: { volume?: number; pitch?: number } = {}): void {
  const cue = HOUSE[name] ?? `ride.${name}`;
  if (name === 'badge') landBeatUntil = Date.now() + LAND_BEAT_MS;

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
