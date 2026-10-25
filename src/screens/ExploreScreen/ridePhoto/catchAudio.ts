import { GameAudio } from '../../../gamekit/audio/GameAudio';
import { createSfxLimiter } from '../../../audio/sfxLimiter';
import { beatHaptic, HAPTIC_GATE_MS, lastAppHapticAt, queueHaptic, setHapticTraceListener, type HapticIntent } from '../../../gamekit/Haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { momentSaver, playMoment, preloadMoments, studioMoment, studioReady } from '../../../gamekit/audio/playMoment';
import type { MomentName } from '../../../gamekit/audio/momentMap';
import { BEAM_SLAM_LATE_MS, burstMoment, burstTakesVoicing, burstVoicing, CATCH_BURST_MS, CATCH_WOBBLE_INTENTS, REPEAT_BURST_MS, counterLift, CATCH_WOBBLE_TICKS_MS, catchHeat, COIN_TICK_GAP_MS, decodeDay, EMPTY_RUN, encodeDay, heatTier, HOT_LAYER_HEAT, MIN_BEAT_GAP_MS, REPEAT_WOBBLE_INTENTS, REPEAT_WOBBLE_TICKS_MS, type CatchRunState } from '../../../gamekit/audio/catchSoundPlan';
import { CAPTURE_LINES, captureTraceOn, traceEvent } from '../../../gamekit/audio/studioTrace';

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
  // Same rule as the cue preload below: nothing loaded (muted, or no engine yet) means try again next time.
  void preloadMoments(CATCH_MOMENTS).then((ok) => { if (!ok) momentsReady = false; }, () => { momentsReady = false; });
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
/**
 * Wave 5: the same buffer the release-like catch capture writes (studioTrace CAPTURE_LINES: lane tooling only,
 * EXPO_PUBLIC_MOTION_CAPTURE=HomeCatchPreview, never in a store or OTA bundle), so timing claims come from release JS.
 */
export const catchTraceBuffer: string[] = CAPTURE_LINES;
const CAPTURE_TRACE = captureTraceOn();
function trace(kind: string, name: string, extra = '') {
  if (!__DEV__ && !CAPTURE_TRACE) return;
  const line = `[catch-av] ${Date.now()} ${kind} ${name}${extra}`;
  if (__DEV__) console.log(line);
  if (catchTraceBuffer.length < 12_000) catchTraceBuffer.push(line);
}
// Release-like capture: every buzz that really fires is logged next to the sounds (the dev trace mode has its own).
if (CAPTURE_TRACE && !__DEV__) {
  try { setHapticTraceListener((intent) => trace('fired', intent)); } catch { /* optional */ }
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
  /** Wobble ticks waiting on the audio clock: voice id, the time it starts and its rung. */
  wobbleVoices: { id: number; at: number; step: number }[];
  /** Counter ticks laid on the audio clock (bunched coins wait COIN_TICK_GAP_MS): merged at 'done'. */
  counterVoices: { id: number; at: number; step: number }[];
  /** The coin ticks' own volume (wow-map plays them at 0.45), so the merged final tick matches them. */
  tickVolume?: number;
  /** Highest counter rung played so far (-1 before the first): the counter only ever climbs. */
  rung: number;
  /** When the last coin tick into the counter starts (audio clock, ms): the next one waits COIN_TICK_GAP_MS. */
  lastTickAt: number;
} | null = null;
const WOBBLE_INTENTS = new Set<HapticIntent>(['tickSelection', 'tapLight', 'hitMedium']);
let run: CatchRunState = EMPTY_RUN;
let primed = false;
const DAY_KEY = 'tps.sound.lastCatchDay';
/** Highest rung of the counter ladder (13 steps, 0..12). */
const COUNTER_TOP = 12;
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
  /** When the tap came (ms): wobble beats count until the gather closes, up to PRE_BURST_MS after it. */
  tapAt: number;
  /** The burst frame on the catch clock (wave 5), and when the first wobble was due (wall ms; set by startWobbles). */
  burstAt: number;
  due0?: number;
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
/** The hot glockenspiel rides this long after the burst (wave 4: 40 ms, so its tail ends before the short show's stamp at 1020). */
const HOT_LAYER_DELAY_MS = 40;
/** At heat tier 2 the burst lands a second, crisper thump this long after the heavy one. */
const HOT_THUMP_MS = 90;
/** The golden pair: the success pulse lands this long after the burst's heavy one (hapticGrammar 'golden'). */
const GOLDEN_SUCCESS_MS = 180;
/** When the burst's heavy buzz fired (every player), so a bunched success still lands GOLDEN_SUCCESS_MS after it. */
let burstBuzzAt = -Infinity;
/**
 * Wave 5: this catch's marks from wow-map (every player): the gold beam dropped, the grand 25th, a miss. Round 2:
 * `beamDue`, the beam will drop on this catch (known on the tap), so its slam buzz takes the gather's last rung.
 */
let catchFlags = { beam: false, grand: false, missed: false, beamDue: false };
/** The burst's first heavy buzz (or the beam's) has fired; a later heavy is the grand catch's second hit. */
let burstHeavyDone = false;
/** When the burst was due on the UI clock (wall ms), and when its sound started. */
let burstDueAt = -Infinity;
let burstSoundAt = -Infinity;
let thumpTimer: ReturnType<typeof setTimeout> | null = null;
/** The coin's slide home starts at least this long after the burst's bell (one celebration sound at a time). */
const FLY_AFTER_BURST_MS = 120;
/**
 * Wave 5 (fix 3): the wall time the beat in hand was due on wow-map's UI clock. HomeCatchMoment calls catchBeatAt at
 * the top of every runOnJS beat, so a JS turn that arrives late still lays the buzzes and sounds that follow the beat
 * (the wobble ticks, the hot thump) on the plan instead of on its arrival. Valid for the rest of that JS turn only.
 */
let beatDue: { at: number; setAt: number } | null = null;
const BEAT_DUE_TURN_MS = 3;
const BEAT_DUE_MAX_LATE_MS = 3000;
export function catchBeatAt(plannedAt: number): void {
  const now = Date.now();
  const late = now - plannedAt;
  beatDue = Number.isFinite(plannedAt) && late >= -20 && late <= BEAT_DUE_MAX_LATE_MS ? { at: Math.min(now, plannedAt), setAt: now } : null;
  if (beatDue && late > 16) {
    trace('late', `${Math.round(late)}ms`);
    traceEvent('mark', 'catch-beat-late', `${Math.round(late)} ms`);
  }
}
/** When the beat in hand was due (its UI-clock time), or now outside a beat. */
function dueNow(now = Date.now()): number {
  return beatDue && now - beatDue.setAt <= BEAT_DUE_TURN_MS ? beatDue.at : now;
}

/**
 * Wave 5 round 2 (the grade's fix 4): the beam's slam buzz, every player. A lighter rigid pulse as the beam lands
 * (wow-map's 'slam' beat, BEAM_SLAM_BUZZ_LEAD_MS before the held frame, 120 ms before the burst; round 3 lands the
 * beam and its slam sound on this same beat, so buzz, sound and picture are one hit), so the burst's heavy
 * lands on the burst frame itself (the brightest frame) a full beat later. The gather's last wobble buzz gives way to
 * it on a beam catch (fireWobble), so it always has room. A slam that reaches JS late is dropped (the heavy carries
 * the impact alone), never pushed toward the heavy; a miss never slams.
 */
function slamBuzz(): void {
  if (catchFlags.missed || !catchFlags.beamDue) return;
  const now = Date.now();
  const late = now - dueNow(now);
  if (late > BEAM_SLAM_LATE_MS) {
    trace('drop', `slam ${Math.round(late)}ms late`);
    traceEvent('mark', 'catch-pulse-dropped', `slam ${Math.round(late)} ms late`);
    return;
  }
  if (now - laneLast() < MIN_BEAT_GAP_MS) {
    trace('drop', 'slam lane busy');
    traceEvent('mark', 'catch-pulse-dropped', 'slam lane busy');
    return;
  }
  beatLaneAt = now;
  beatHaptic('hitRigid');
}

/**
 * The hot thump (heat tier 2): one crisp buzz on the beat after the burst (burst + 90 ms on the plan), between the
 * heavy and the success at +180, on every show (the beam catches too, whose heavy came with the beam). The grand
 * 25th has its own second heavy on that beat, so it never thumps. A burst that reached JS late buzzes its heavy late,
 * so the thump keeps its 90 ms after that heavy (and the success its 180), so every beat still buzzes and none flams.
 */
function scheduleThump(heat: number): void {
  if (thumpTimer) clearTimeout(thumpTimer);
  // The heavy fired just before the burst mark, in this same turn (round 2: on the beam catches too; the beam's slam is
  // a lighter buzz before it), so the thump keeps its 90 ms from the real heavy.
  const heavyAt = burstHeavyDone && Number.isFinite(burstBuzzAt) ? burstBuzzAt : Math.max(burstDueAt, Date.now());
  const due = heavyAt + HOT_THUMP_MS;
  traceEvent('mark', 'catch-thump', `+${heat}`);
  thumpTimer = setTimeout(() => {
    thumpTimer = null;
    const now = Date.now();
    if (now >= Math.max(beatUntil, burstBeatUntil) || stale(due, 'hitRigid')) return;
    if (now - laneLast() < MIN_BEAT_GAP_MS - 10) { traceEvent('mark', 'catch-pulse-dropped', 'hitRigid'); return; }
    beatLaneAt = now;
    beatHaptic('hitRigid');
  }, Math.max(0, due - Date.now()));
}

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

/**
 * Stop the wobble ticks that would start more than `graceMs` from now (the catch ended, or a burst came
 * with a tick still far off). Wave 4: the burst keeps a tick that starts inside TICK_GRACE_MS, so a hot
 * catch never loses a tick it already planned.
 */
function cutWobbles(graceMs = 0): void {
  const s = session;
  if (!s) return;
  const now = Date.now();
  for (const v of s.wobbleVoices) {
    if (v.at > now + graceMs) {
      try { GameAudio.stop(v.id); } catch { /* optional */ }
      trace('cut', `catch.wobble l${v.step} +${v.at - now}`);
      traceEvent('mark', 'catch-wobble-cut', `${v.at - now} ms early`);
    }
  }
  s.wobbleVoices = [];
}

/** A wobble tick still waiting at the burst plays if it starts this soon (it is part of the gather, not late). */
const TICK_GRACE_MS = 30;
/** Pulled-in wobble ticks keep at least this much air after the tick before them (never a flam). */
const TICK_PULL_GAP_MS = 100;
/** The held breath before the burst (hit-stop to burst, DURATION.hitStop): a pulled tick must start inside it. */
const HOLD_MS = 70;

/**
 * Wave 4 (fix 2): the held breath truncates only the tail, never a planned tick. A busy JS thread can
 * deliver the first wobble beat late, so the ticks planned from it would ring after the hit-stop; on the
 * hot heat-5 catch that cut the second tick. Now the hit-stop pulls every tick still waiting in to now
 * (TICK_PULL_GAP_MS after the one before it), so a hot catch always keeps all of its ticks. Only a tick
 * that could not start inside the hold is cut.
 */
function pullWobbles(): void {
  const s = session;
  if (!s) return;
  const now = Date.now();
  let prev = -Infinity;
  const kept: { id: number; at: number; step: number }[] = [];
  for (const v of s.wobbleVoices) {
    if (v.at <= now) { prev = Math.max(prev, v.at); kept.push(v); continue; }
    try { GameAudio.stop(v.id); } catch { /* optional */ }
    trace('cut', `catch.wobble l${v.step} +${v.at - now}`);
    const at = Math.max(now, prev + TICK_PULL_GAP_MS);
    if (at > now + HOLD_MS) { traceEvent('mark', 'catch-wobble-cut', `${v.at - now} ms early`); continue; }
    const id = playMoment('catch.wobble', { step: v.step, delayMs: at - now });
    traceEvent('mark', 'catch-wobble-pulled', `l${v.step} ${v.at - at} ms in`);
    if (id > 0) kept.push({ id, at, step: v.step });
    prev = at;
  }
  s.wobbleVoices = kept;
}

/**
 * Wave 4 (fix 5): nothing after the settle. At 'done' the counter ticks still waiting on the audio clock
 * (a bunched batch) are merged into one final tick on the done frame, at the highest rung they reached,
 * and any coin tick or coin buzz that arrives after 'done' is covered by it.
 */
function mergeCounterAtDone(s: NonNullable<typeof session>): void {
  const now = Date.now();
  let top = -1;
  let started = -Infinity;
  // Latest first, so each stop hands the cue's cooldown back to the tick before it.
  for (const v of s.counterVoices.slice().reverse()) {
    if (v.at > now) {
      try { GameAudio.stop(v.id); } catch { /* optional */ }
      trace('cut', `ui.counterTick l${v.step} +${v.at - now}`);
      top = Math.max(top, v.step);
    } else started = Math.max(started, v.at);
  }
  s.counterVoices = [];
  if (s.rung < 0 || s.rung >= COUNTER_TOP && top < 0) return;
  // The stream was still landing when the badge left: a tick still waiting (cut above), or the last one
  // just before 'done'. Otherwise the counter already finished: nothing to add.
  const sinceLast = now - started;
  if (top < 0 && sinceLast >= 2 * COIN_TICK_GAP_MS) return;
  // Wave 5 (fix 5): the merged tick sits on the done frame itself, never after it. When a real tick began under
  // one coin gap ago, that tick is the last one (a second tick now would double it, a later one would trail done).
  if (sinceLast < COIN_TICK_GAP_MS) {
    s.rung = COUNTER_TOP;
    trace('final', `ui.counterTick ${sinceLast} ms ago`);
    traceEvent('mark', 'catch-counter-final', `the tick ${sinceLast} ms ago is the last`);
    return;
  }
  const step = Math.min(COUNTER_TOP, Math.max(top, s.rung + 1));
  s.rung = COUNTER_TOP;
  traceEvent('mark', 'catch-counter-merged', `l${step}`);
  trace('start', 'ui.counterTick', ` merged l${step}`);
  studioMoment('ui.counterTick', { step, volume: s.tickVolume });
}

/** When the last catch settled ('done'), every player: coin buzzes after it are covered by the settle. */
let settledAt = -Infinity;
/**
 * A key beat (heavy, success, stamp) still buzzes when a frozen JS turn handed it over together with 'done' (the
 * player saw nothing yet), but never more than two beat gaps after the settle.
 */
function pastSettle(): boolean {
  return Number.isFinite(settledAt) && Date.now() > settledAt + 2 * MIN_BEAT_GAP_MS;
}
/** The coins' own pulses (the counter's tick buzz); the stamp and the burst are never dropped. */
const COIN_PULSE: HapticIntent = 'tickSelection';
function afterSettle(intent: HapticIntent, now: number): boolean {
  return intent === COIN_PULSE && now >= settledAt && now - settledAt < DONE_TAIL_MS;
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
    settledAt = -Infinity;
    catchFlags = { beam: false, grand: false, missed: false, beamDue: false };
    burstHeavyDone = false;
    burstDueAt = -Infinity;
    burstSoundAt = -Infinity;
    if (thumpTimer) { clearTimeout(thumpTimer); thumpTimer = null; }
    closeBeats();
    beats = {
      n: 0, seen: 0, fired: [], timers: [], closed: false, tapAt: now, burstAt: repeatPlan ? REPEAT_BURST_MS : CATCH_BURST_MS,
      offsets: repeatPlan ? REPEAT_WOBBLE_TICKS_MS : CATCH_WOBBLE_TICKS_MS,
      intents: repeatPlan ? REPEAT_WOBBLE_INTENTS : CATCH_WOBBLE_INTENTS,
    };
    heatNow = catchHeat(run, now);
    if (!studioReady('catch.tap')) { endSession(); return; }
    // The studio switch can turn on after the find appeared (the flag reads late): decode now at the latest.
    preloadCatchMoments();
    primeCatchState();
    endSession();
    session = { until: now + PRE_BURST_MS, burst: false, heat: heatNow, repeatPlan, beam: false, wobbleVoices: [], counterVoices: [], rung: -1, lastTickAt: -Infinity };
    if (session.heat > 0) traceEvent('mark', 'catch-heat', `+${session.heat}`);
    playMoment('catch.tap');
    return;
  }
  // Wave 5: wow-map names the grand 25th on the tap; a beam after a miss is a stale beat (never a slam on a boing).
  if (name === 'grand') { catchFlags.grand = true; return; }
  // Round 2: the beam drops on this catch (wow-map knows it on the tap) and its slam buzz comes before the burst.
  if (name === 'beam-due') { catchFlags.beamDue = true; return; }
  if (name === 'slam') { slamBuzz(); return; }
  if (name === 'miss') catchFlags.missed = true;
  if (name === 'beam') { if (catchFlags.missed) return; catchFlags.beam = true; }
  if (name === 'burst') burstDueAt = dueNow();
  if (name === 'hitstop' || name === 'burst' || name === 'miss' || name === 'skip' || name === 'beam') closeBeats();
  if (name === 'hitstop' || name === 'burst' || name === 'beam') burstBeatUntil = Date.now() + BURST_BEAT_MS;
  if (name === 'done' || name === 'miss') { beatUntil = 0; burstBeatUntil = 0; catchLive = false; }
  if (name === 'done') settledAt = Date.now();
  if (name === 'burst' && !sessionOpen()) {
    // Switch off: the run still counts (heat for the visuals), nothing plays and nothing is stored.
    run = burstMoment(run, Date.now(), { repeatPlan: beats?.offsets === REPEAT_WOBBLE_TICKS_MS, beam: catchFlags.beam, grand: catchFlags.grand }).state;
    return;
  }
  if (!sessionOpen()) return;
  keepSession();
  const s = session;
  if (!s) return;
  if (name === 'hitstop') {
    // The held breath: a tick still waiting is pulled in to start inside it (never dropped, never late).
    pullWobbles();
  } else if (name === 'beam') {
    // Every 10th catch the gold beam lands on the held frame: its own slam (wow-map buzzes the impact).
    s.beam = true;
    pullWobbles();
    playMoment('catch.lucky');
  } else if (name === 'burst') {
    cutWobbles(TICK_GRACE_MS);
    s.burst = true;
    s.until = Date.now() + SESSION_IDLE_MS;
    const next = burstMoment(run, Date.now(), { repeatPlan: s.repeatPlan, beam: s.beam, grand: catchFlags.grand });
    const stored = encodeDay(next.state);
    if (stored) void AsyncStorage.setItem(DAY_KEY, stored).catch(() => undefined);
    run = next.state;
    traceEvent('mark', 'catch-run', `#${run.count} -> ${next.moment}`);
    // Wave 4: the everyday burst rotates four voicings and climbs a semitone per heat rung, so catch 10
    // of a quick run rings higher than catch 2 and no two catches in a row sound the same.
    const voice = burstTakesVoicing(next.moment) ? burstVoicing(run.count, s.heat) : null;
    if (voice) traceEvent('mark', 'catch-voicing', `rr${voice.rr} ${voice.semis >= 0 ? '+' : ''}${voice.semis}`);
    // Wave 5: each voicing also swaps its tail (momentMap voicings), so neighbours sound different on a phone speaker.
    playMoment(next.moment, voice ? { pitch: voice.semis, volume: voice.volume, voicing: voice.rr } : {});
    burstSoundAt = Date.now();
    trace('start', next.moment, voice ? ` v${voice.rr} ${voice.semis >= 0 ? '+' : ''}${voice.semis}` : '');
    // A hot run (5 quick catches and up) adds a bright glockenspiel on the burst, in tune with it. Battery Saver: the burst alone.
    if (s.heat >= HOT_LAYER_HEAT && !momentSaver()) playMoment('catch.hot', { delayMs: HOT_LAYER_DELAY_MS, pitch: voice?.semis });
    // Heat tier 2: the second, crisper thump on the beat after the burst (Battery Saver: one pulse; the grand has its own).
    if (heatTier(s.heat) >= 2 && !momentSaver() && !catchFlags.grand) scheduleThump(s.heat);
  } else if (name === 'fly') {
    // Wave 5 (fix 4): a slow server or a stalled JS turn can hand the burst and the flight over together; the slide
    // then waits until the bell's attack has passed, so the two never stack.
    const wait = Math.max(0, burstSoundAt + FLY_AFTER_BURST_MS - Date.now());
    if (wait > 0) traceEvent('mark', 'catch-fly-spaced', `+${wait} ms`);
    playMoment('catch.fly', wait > 0 ? { delayMs: wait } : {});
    trace('start', 'catch.fly', wait > 0 ? ` +${wait}` : '');
  } else if (name === 'miss') {
    cutWobbles();
    s.burst = true;
    playMoment('game.miss');
  } else if (name === 'done') {
    // Nothing after the settle: ticks still waiting merge into one final tick on this frame (wave 4).
    cutWobbles();
    mergeCounterAtDone(s);
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
  settledAt = -Infinity;
  catchFlags = { beam: false, grand: false, missed: false, beamDue: false };
  burstHeavyDone = false;
  burstDueAt = -Infinity;
  burstSoundAt = -Infinity;
  if (thumpTimer) { clearTimeout(thumpTimer); thumpTimer = null; }
  beatDue = null;
}

/** While a map catch is open (studio on): what the catch's own sounds become. */
function sessionSound(name: CatchSound, opts: { volume?: number; pitch?: number }): boolean {
  if (!sessionOpen() || !studioReady('catch.tap')) return false;
  keepSession();
  if (name === 'pop' || name === 'chime' || name === 'whoosh') return true; // the marks played these
  const s = session;
  if (!s) return false;
  // A quick run starts the counter higher (wave 5: one more rung on a hot short catch).
  const lift = counterLift(s.heat, s.repeatPlan);
  // The stamp is only the stamp: the counter already counted on the coins' own landings (round 5 drops
  // round 4's roll after the stamp, which ticked while the digits had nearly stopped).
  if (name === 'badge') return studioMoment('catch.land', { volume: opts.volume });
  if (name === 'tick') {
    // After 'done' the merged final tick has already covered the coins still landing (wave 4, fix 5).
    if (s.done) { traceEvent('mark', 'catch-tick-after-done', 'covered'); return true; }
    if (opts.pitch === undefined) return studioMoment('ui.counterTick', { volume: opts.volume });
    // The progress bar's gold tick (a NEW find): its own top note, whatever the count reached.
    if (opts.pitch >= BAR_TICK_PITCH) {
      // Wave 5: spaced on the counter's own lane like the coins, so a frozen turn that hands it over with a coin
      // tick never loses it to the cue's cooldown (it is the honest "new find" note).
      const now = Date.now();
      const at = Math.max(now, s.lastTickAt + COIN_TICK_GAP_MS);
      if (at - now > 2 * COIN_TICK_GAP_MS) return true;
      s.lastTickAt = at;
      const id = playMoment('ui.counterTick', { volume: opts.volume, step: COUNTER_TOP, delayMs: at - now });
      if (id > 0) s.counterVoices.push({ id, at, step: COUNTER_TOP });
      return true;
    }
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
    s.tickVolume = opts.volume;
    const id = playMoment('ui.counterTick', { volume: opts.volume, step, delayMs: at - now });
    if (id > 0) s.counterVoices.push({ id, at, step });
    return true;
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
/**
 * A buzz that a timer delivers this late is stale: the frame it belonged to is long gone (a starved JS
 * thread fired the stamp's spaced buzz 750 ms late, after the catch had settled), so it is dropped.
 */
const STALE_BEAT_MS = 150;
function stale(plannedAt: number, intent: HapticIntent): boolean {
  const late = Date.now() - plannedAt;
  if (late <= STALE_BEAT_MS) return false;
  traceEvent('mark', 'catch-beat-stale', `${intent} ${late} ms late`);
  return true;
}

/**
 * `keep` (wave 5): a beat that must buzz (the stamp). It is never dropped as stale; if another buzz took its slot
 * while it waited, it takes the next free one.
 */
function laneBeat(intent: HapticIntent, wobble = false, keep = false): void {
  const now = Date.now();
  const gap = now - laneLast();
  if (gap >= MIN_BEAT_GAP_MS) { beatLaneAt = now; beatHaptic(intent); return; }
  const at = laneLast() + MIN_BEAT_GAP_MS;
  beatLaneAt = at;
  traceEvent('mark', 'catch-beat-spaced', `${intent} +${at - now} ms`);
  const b = beats;
  const t = setTimeout(() => {
    if (wobble && (b?.closed || beats !== b)) return;
    // A coin pulse that waited its turn past the settle is covered by it (wave 4: nothing after 'done').
    if (afterSettle(intent, Date.now())) { traceEvent('mark', 'catch-pulse-after-done', intent); return; }
    if (keep) {
      // A kept beat never trails the settle by more than its own spacing (a frozen turn can hand 'done' over with it).
      if (pastSettle()) { traceEvent('mark', 'catch-pulse-after-done', intent); return; }
      // Something buzzed on its own frame meanwhile: wait one more gap instead of flamming.
      if (Date.now() - lastAppHapticAt() < MIN_BEAT_GAP_MS - 10) { laneBeat(intent, false, true); return; }
      beatLaneAt = Math.max(beatLaneAt, Date.now());
      beatHaptic(intent);
      return;
    }
    if (stale(at, intent)) return;
    if (Date.now() - lastAppHapticAt() < MIN_BEAT_GAP_MS - 10) { traceEvent('mark', 'catch-pulse-dropped', intent); return; }
    beatHaptic(intent);
  }, at - now);
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

/**
 * Round 2: the burst's time is projected from the first wobble's UI-clock time, and a loaded UI thread runs its frame
 * callbacks late, so the projection can land up to about 40 ms after the real burst (release-like 50-catch run at
 * f2a33980: projected 746, real 710, and a wobble buzz 83 ms before the heavy). A wobble buzz this much closer than one
 * beat gap to the projected burst is dropped too (its tick still rings).
 */
const WOBBLE_BURST_GUARD_MS = 30;
/** Wobble k's buzz: once, whichever comes first of its timer and wow-map's own beat. */
function fireWobble(k: number, intent: HapticIntent): void {
  const b = beats;
  if (!b || b.closed || b.fired[k]) return;
  b.fired[k] = true;
  // Round 2: on a beam catch the slam's rigid buzz is the gather's top rung (120 ms before the burst), so the last
  // wobble's buzz gives way to it (its tick still rings). Tick, light, then the slam, then the heavy on the burst.
  if (catchFlags.beamDue && k === b.offsets.length - 1) {
    trace('drop', `wobble${k + 1} gives way to the slam`);
    return;
  }
  // Wave 5 (live release run, load 100): a wobble buzz that comes so late it would land under one beat gap before
  // the burst's heavy (which never waits) is dropped, never flammed into it.
  if (b.due0 !== undefined && Date.now() > b.due0 + (b.burstAt - (b.offsets[0] ?? 0)) - MIN_BEAT_GAP_MS - WOBBLE_BURST_GUARD_MS) {
    trace('drop', `wobble${k + 1} too near the burst`);
    traceEvent('mark', 'catch-pulse-dropped', `wobble ${k + 1} near the burst`);
    return;
  }
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
  const now = Date.now();
  // Wave 5: planned from the first wobble's UI-clock time, so a late JS turn does not push the rest late too;
  // each one still keeps TICK_PULL_GAP_MS after the one before it (never a flam).
  const due0 = dueNow(now);
  b.due0 = due0;
  const plan: number[] = [];
  b.offsets.forEach((off, k) => plan.push(k === 0 ? now : Math.max(due0 + off - base, plan[k - 1] + TICK_PULL_GAP_MS)));
  fireWobble(0, intent);
  for (let k = 1; k < b.offsets.length; k++) {
    const due = plan[k];
    b.timers.push(setTimeout(() => { if (!stale(due, b.intents[k] ?? intent)) fireWobble(k, b.intents[k] ?? intent); }, Math.max(0, due - Date.now())));
  }
  const s = session;
  if (s && sessionOpen() && studioReady('catch.tap') && !s.burst) {
    // Each delay is measured from the clock at its own call (a slow JS thread can take a few ms over the three calls).
    s.wobbleVoices = plan.map((at, k) => {
      const delayMs = Math.max(0, at - Date.now());
      return { id: playMoment('catch.wobble', { step: s.heat + k, delayMs }), at, step: s.heat + k };
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
  if (afterSettle(intent, now)) { traceEvent('mark', 'catch-pulse-after-done', intent); return; }
  try {
    const b = beats;
    // Wave 4: a frozen JS thread can deliver the wobble beats more than BEAT_WINDOW_MS after the tap (the live
    // trace at load 265 got its first wobble at 1453 ms and lost every tick). They are the gather's beats until
    // the hit-stop or burst closes it, however late they come.
    const gathering = !!b && !b.closed && b.n >= 1 && b.seen < b.offsets.length && WOBBLE_INTENTS.has(intent) && now - b.tapAt < PRE_BURST_MS;
    if (b && !b.closed && (now < beatUntil || gathering)) {
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
  } catch { /* sound is decoration */ }
  const burstBeat = now < burstBeatUntil && BURST_INTENTS.has(intent);
  if (now < beatUntil || burstBeat) {
    const b = beats;
    if (intent === 'comboHeavy' && b?.closed) {
      if (burstHeavyDone) {
        // Wave 5: a second heavy (the grand 25th's, one beat after its burst) is its own beat, never a flam.
        laneBeat(intent, false, true);
        return;
      }
      // The peak: always on its frame, never waits.
      burstHeavyDone = true;
      burstBuzzAt = now;
      beatLaneAt = Math.max(beatLaneAt, now);
      beatHaptic(intent);
      return;
    }
    // A stalled thread delivers the burst and its success together: the success still waits its 180 ms.
    if (intent === 'success' && now - burstBuzzAt < GOLDEN_SUCCESS_MS - 30) {
      // Wave 5: and never under one beat gap after the hot thump (a late thump timer once left 83 ms).
      const at = Math.max(burstBuzzAt + GOLDEN_SUCCESS_MS, laneLast() + MIN_BEAT_GAP_MS);
      traceEvent('mark', 'catch-beat-spaced', `success +${at - now} ms`);
      burstBuzzAt = -Infinity;
      beatLaneAt = Math.max(beatLaneAt, at);
      // Wave 5: the success is a key beat: a starved timer still buzzes it (live: a 254 ms freeze lost it), never after done.
      setTimeout(() => {
        if (pastSettle()) return;
        if (Date.now() - lastAppHapticAt() < MIN_BEAT_GAP_MS - 10) { laneBeat('success', false, true); return; }
        beatHaptic('success');
      }, at - now);
      return;
    }
    // Wave 5: the heavies and the success are key beats (kept however late their turn comes); the rest is decoration.
    laneBeat(intent, false, intent === 'success' || intent === 'comboHeavy');
  } else if (now < landBeatUntil) {
    // The stamp is on its frame, unless it arrived in the same JS turn as another beat (a frozen screen
    // delivering everything at once) or a beat is still planned: then it takes the lane's next slot.
    landBeatUntil = 0;
    // Wave 5: the stamp always buzzes (never dropped as stale, however late its turn comes).
    if (now - lastAppHapticAt() < LAND_BEAT_MS || beatLaneAt > now) laneBeat(intent, false, true);
    else { beatLaneAt = now; beatHaptic(intent); }
  } else if (catchLive && beatLaneAt > now - MIN_BEAT_GAP_MS) {
    traceEvent('mark', 'catch-pulse-dropped', intent);
  } else if (catchLive && intent === COIN_PULSE && now - lastAppHapticAt() < HAPTIC_GATE_MS) {
    // Wave 4: a coin pulse bunched onto another pulse would wait 120 ms in the shared gate and can buzz
    // after the settle; the coins are decoration, so it is dropped instead of smeared.
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
