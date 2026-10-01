/**
 * audioMix.ts: pure audio-mix rules shared by every backend.
 *
 * Voice allocation (per-cue polyphony, a global voice cap, priority stealing
 * of the oldest lowest-priority voice), per-cue cooldowns that merge rapid
 * repeats, pitch variance, dB maths, ducking envelopes, and the beat clock
 * used for bar-synced music changes and quantized stingers.
 */

export function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

export function gainToDb(gain: number): number {
  return gain <= 0 ? -120 : 20 * Math.log10(gain);
}

export function semitonesToRate(semitones: number): number {
  return Math.pow(2, semitones / 12);
}

export type Bus = 'sfx' | 'ui' | 'tell' | 'stinger' | 'music' | 'voice';

export interface VoiceInfo {
  id: number;
  cue: string;
  priority: number;
  startedAt: number;
  /** Expected end (startedAt + duration); 0 if unknown. */
  endsAt: number;
  /** Voice group (Trivia: 'tick' max 3, 'babble' max 1, 'crowd' max 1). */
  group?: string;
}

export interface AllocRequest {
  cue: string;
  priority: number;
  now: number;
  maxVoicesForCue: number;
  cooldownMs: number;
  lastPlayedAt: number;
  /** Voice group and its cap (0 / undefined = no group cap). */
  group?: string;
  groupCap?: number;
}

export type AllocDecision =
  | { action: 'play' }
  | { action: 'steal'; victimId: number }
  | { action: 'drop'; why: 'cooldown' | 'busy' };

/**
 * Decide whether a new play may start. Voices that already ended are ignored.
 * Order: cooldown merge -> per-cue cap (steal that cue's oldest) -> global cap
 * (steal the oldest voice of the lowest priority, if not higher than ours).
 */
export function allocateVoice(active: readonly VoiceInfo[], req: AllocRequest, globalCap: number): AllocDecision {
  if (req.cooldownMs > 0 && req.now - req.lastPlayedAt < req.cooldownMs) return { action: 'drop', why: 'cooldown' };
  const live = active.filter((v) => v.endsAt === 0 || v.endsAt > req.now);
  const same = live.filter((v) => v.cue === req.cue);
  if (req.maxVoicesForCue > 0 && same.length >= req.maxVoicesForCue) {
    const oldest = same.reduce((a, b) => (b.startedAt < a.startedAt ? b : a));
    return { action: 'steal', victimId: oldest.id };
  }
  if (req.group && req.groupCap && req.groupCap > 0) {
    const inGroup = live.filter((v) => v.group === req.group);
    if (inGroup.length >= req.groupCap) {
      const oldest = inGroup.reduce((a, b) => (b.startedAt < a.startedAt ? b : a));
      return { action: 'steal', victimId: oldest.id };
    }
  }
  if (live.length >= globalCap) {
    let victim: VoiceInfo | null = null;
    for (const v of live) {
      if (!victim || v.priority < victim.priority || (v.priority === victim.priority && v.startedAt < victim.startedAt)) victim = v;
    }
    if (!victim || victim.priority > req.priority) return { action: 'drop', why: 'busy' };
    return { action: 'steal', victimId: victim.id };
  }
  return { action: 'play' };
}

/** Random pitch variance in semitones (+/- range), from a 0..1 roll. */
export function pitchVariance(range: number, roll: number): number {
  return (roll * 2 - 1) * range;
}

/**
 * Ducking envelope: gain multiplier at time `t` for a duck that started at 0
 * (attack to depthDb, hold, release back to 0 dB).
 */
export function duckGainAt(t: number, depthDb: number, attackMs: number, holdMs: number, releaseMs: number): number {
  if (t < 0) return 1;
  const depth = dbToGain(-Math.abs(depthDb));
  if (t < attackMs) return 1 + (depth - 1) * (attackMs > 0 ? t / attackMs : 1);
  if (t < attackMs + holdMs) return depth;
  const r = t - attackMs - holdMs;
  if (r < releaseMs) return depth + (1 - depth) * (releaseMs > 0 ? r / releaseMs : 1);
  return 1;
}

/** Combine overlapping ducks: the deepest wins. */
export function combineDucks(gains: readonly number[]): number {
  let g = 1;
  for (const x of gains) if (x < g) g = x;
  return g;
}

// =============================================================================
// Beat clock
// =============================================================================

export interface BeatClock {
  bpm: number;
  beatsPerBar: number;
  /** ms into the track where beat 0 (a downbeat) lands. */
  offsetMs: number;
}

export function beatMs(c: BeatClock): number {
  return 60000 / c.bpm;
}

export function barMs(c: BeatClock): number {
  return beatMs(c) * c.beatsPerBar;
}

/** Beat number (fractional) at a track position. */
export function beatAt(c: BeatClock, positionMs: number): number {
  return (positionMs - c.offsetMs) / beatMs(c);
}

/**
 * Time (track ms) of the next grid point at `subdivision` beats (1 = beat,
 * 0.5 = half-beat, beatsPerBar = bar) strictly after positionMs (plus a
 * minimum lead so the change can be scheduled).
 */
export function nextGridMs(c: BeatClock, positionMs: number, subdivision = 1, minLeadMs = 0): number {
  const step = beatMs(c) * subdivision;
  const rel = positionMs + minLeadMs - c.offsetMs;
  const k = Math.floor(rel / step) + 1;
  return c.offsetMs + k * step;
}

export function nextBarMs(c: BeatClock, positionMs: number, minLeadMs = 0): number {
  return nextGridMs(c, positionMs, c.beatsPerBar, minLeadMs);
}

/** Position inside a loop of loopMs (handles negatives). */
export function loopPosition(positionMs: number, loopMs: number): number {
  if (loopMs <= 0) return positionMs;
  const p = positionMs % loopMs;
  return p < 0 ? p + loopMs : p;
}

/** Equal-power crossfade gains for progress 0..1: [outGain, inGain]. */
export function equalPower(progress: number): [number, number] {
  const p = progress < 0 ? 0 : progress > 1 ? 1 : progress;
  return [Math.cos((p * Math.PI) / 2), Math.sin((p * Math.PI) / 2)];
}

/**
 * Rez-style hit quantization (Line Party, Banana tambourine): delay a
 * decorative/own-hit sound to the next grid point when that point is at most
 * `maxSnapMs` away; otherwise play now (0). Audio only: score and sim time
 * never move. `subdivision` is in beats (0.25 = 16th notes).
 */
export function quantizeDelayMs(c: BeatClock, positionMs: number, subdivision = 0.25, maxSnapMs = 50): number {
  const step = beatMs(c) * subdivision;
  if (step <= 0) return 0;
  const rel = positionMs - c.offsetMs;
  const phase = ((rel % step) + step) % step;
  if (phase < 0.5) return 0;
  const wait = step - phase;
  return wait <= maxSnapMs ? wait : 0;
}
