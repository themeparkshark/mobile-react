/**
 * beatMap: per-beat music timing (beyond a constant BPM).
 *
 * Chris's tracks are live-feel edits, so Rhythm, Memory's marquee, Trivia's
 * reveals and Banana's ladder lock to measured beat times, not a BPM. A beat
 * map is the sorted list of beat onsets (ms, from librosa plus hand fixes) and
 * the index of the first downbeat. Everything else (fractional beat, phase,
 * next 8th, next bar) comes from it. Past the ends it extrapolates with the
 * nearest interval, and loops wrap with `loopMs`.
 *
 * Pure and worklet-safe.
 */

export interface BeatMap {
  /** Beat onsets in ms from the start of the file, ascending, at least 2. */
  beats: number[];
  beatsPerBar: number;
  /** Index into `beats` of the first downbeat. */
  downbeat: number;
  /** Loop length in ms (0 = no wrap). */
  loopMs: number;
}

export function beatMapFromBpm(bpm: number, offsetMs = 0, count = 64, beatsPerBar = 4, loopMs = 0): BeatMap {
  'worklet';
  const step = 60000 / bpm;
  const beats: number[] = [];
  for (let i = 0; i < Math.max(2, count); i++) beats.push(offsetMs + i * step);
  return { beats, beatsPerBar, downbeat: 0, loopMs };
}

function wrap(map: BeatMap, ms: number): number {
  'worklet';
  if (map.loopMs > 0) {
    const m = ms % map.loopMs;
    return m < 0 ? m + map.loopMs : m;
  }
  return ms;
}

/** Fractional beat index at a playback position. */
export function beatIndexAt(map: BeatMap, positionMs: number): number {
  'worklet';
  const b = map.beats;
  const n = b.length;
  const ms = wrap(map, positionMs);
  if (ms <= b[0]) return (ms - b[0]) / (b[1] - b[0]);
  if (ms >= b[n - 1]) return n - 1 + (ms - b[n - 1]) / (b[n - 1] - b[n - 2]);
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (b[mid] <= ms) lo = mid;
    else hi = mid;
  }
  return lo + (ms - b[lo]) / (b[hi] - b[lo]);
}

/** Time (ms, unwrapped file time) of a fractional beat index. */
export function timeOfBeat(map: BeatMap, beat: number): number {
  'worklet';
  const b = map.beats;
  const n = b.length;
  if (beat <= 0) return b[0] + beat * (b[1] - b[0]);
  if (beat >= n - 1) return b[n - 1] + (beat - (n - 1)) * (b[n - 1] - b[n - 2]);
  const i = Math.floor(beat);
  return b[i] + (beat - i) * (b[i + 1] - b[i]);
}

/** 0-1 phase inside the current beat (0 = on the beat). */
export function beatPhaseAt(map: BeatMap, positionMs: number): number {
  'worklet';
  const f = beatIndexAt(map, positionMs);
  return f - Math.floor(f);
}

/** 0-1 phase inside the current bar, and the bar number. */
export function barAt(map: BeatMap, positionMs: number): { bar: number; phase: number; beatInBar: number } {
  'worklet';
  const rel = beatIndexAt(map, positionMs) - map.downbeat;
  const bar = Math.floor(rel / map.beatsPerBar);
  const inBar = rel - bar * map.beatsPerBar;
  return { bar, phase: inBar / map.beatsPerBar, beatInBar: Math.floor(inBar) };
}

/**
 * Delay (ms from `positionMs`) to the next grid line. `division` is in beats:
 * 1 = beat, 0.5 = 8th, 0.25 = 16th, beatsPerBar = bar (bar lines follow the
 * downbeat). `minLeadMs` skips a line that is too close to act on.
 */
export function msToNext(map: BeatMap, positionMs: number, division = 1, minLeadMs = 0): number {
  'worklet';
  const ms = wrap(map, positionMs);
  const base = division >= map.beatsPerBar ? map.downbeat : 0;
  const f = beatIndexAt(map, ms) - base;
  let k = Math.floor(f / division + 1e-9) + 1;
  for (let guard = 0; guard < 64; guard++) {
    const t = timeOfBeat(map, base + k * division);
    const d = t - ms;
    if (d >= minLeadMs) return d;
    k++;
  }
  return minLeadMs;
}

/** Signed error (ms) from the nearest grid line; negative = early. */
export function gridErrorMs(map: BeatMap, positionMs: number, division = 1): number {
  'worklet';
  const ms = wrap(map, positionMs);
  const f = beatIndexAt(map, ms) / division;
  const near = Math.round(f) * division;
  return ms - timeOfBeat(map, near);
}

/**
 * Residual check for the Rhythm 5 ms gate: fit a line through the beats and
 * return the worst deviation. A live-feel track has residual; a map that is
 * wildly off (a missed beat) shows up as a large one.
 */
export function beatMapResidualMs(map: BeatMap): { bpm: number; maxResidualMs: number; meanIntervalMs: number } {
  const b = map.beats;
  const n = b.length;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) {
    sx += i; sy += b[i]; sxx += i * i; sxy += i * b[i];
  }
  const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  const icpt = (sy - slope * sx) / n;
  let worst = 0;
  for (let i = 0; i < n; i++) worst = Math.max(worst, Math.abs(b[i] - (icpt + slope * i)));
  return { bpm: 60000 / slope, maxResidualMs: worst, meanIntervalMs: slope };
}

/** Worst local jump between neighbouring intervals (catches a doubled or missed beat). */
export function beatMapMaxJitterMs(map: BeatMap): number {
  const b = map.beats;
  let worst = 0;
  for (let i = 2; i < b.length; i++) worst = Math.max(worst, Math.abs((b[i] - b[i - 1]) - (b[i - 1] - b[i - 2])));
  return worst;
}
