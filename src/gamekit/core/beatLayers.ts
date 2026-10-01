/**
 * beatLayers.ts: escalating, beat-locked percussion layers over a music bed
 * (pure, tested in node). The runtime player is audio/BeatLayers.ts.
 *
 * The designs all want the music to "level up" with the player without new
 * AI music, by layering Chris's own one-shots on the bed's grid:
 *   - Whack v5: x1.5 adds a tap.mp3 hat on 8ths, x2 a firework_pop clap on 2
 *     and 4, x2.5 a coin.mp3 shaker on 16ths, x3/x4 a pin_swap rim pip. Fever
 *     plays the full kit plus a reversed whoosh swell every 4 bars. Layers are
 *     removed on a combo break.
 *   - Parade Beat Fever: claps on 2 and 4 plus tambourine 8ths, 6 LU under the
 *     bed, from a 25 ms look-ahead scheduler 150 ms ahead.
 *   - Banana Golden Hour: tambourine 8ths from the sim clock and a G B D G
 *     glock arpeggio on each bar.
 *   - Line Party LAST 2 BARS: claps on 2 and 4 and a 16th glock arpeggio at -12 dB.
 *
 * Time model: "song time" is the bed position unwrapped across loops (ms).
 * The scheduler asks for every hit in (fromMs, toMs] and plays each with
 * delayMs = hitMs - nowMs, which react-native-audio-api turns into a
 * sample-accurate start(when). Accents are audio-only: never use them for scoring.
 */

export interface BeatGrid {
  bpm: number;
  beatsPerBar: number;
  /** Song ms of the first downbeat. */
  offsetMs: number;
}

export interface BeatLayerDef {
  id: string;
  /** GameAudio cue to play. */
  cue: string;
  /** Step length in beats: 1 = quarters, 0.5 = 8ths, 0.25 = 16ths, 16 = every 4 bars of 4/4. */
  step: number;
  /** Steps inside one bar (or one cycle when step >= a bar) that sound; default every step. */
  hits?: number[];
  /** Layer sounds when the level is at least this. */
  level: number;
  /** Level above which the layer drops out again (Infinity = never). */
  maxLevel?: number;
  /** Base gain (dB). */
  gainDb?: number;
  /** Per-hit accent (dB), cycled over the steps of a bar (downbeat +3, offbeat -3, ghost -9...). */
  accentDb?: number[];
  /** Per-hit pitch (semitones), cycled (glock arpeggios). */
  pitch?: number[];
  /** Play `ms` early so the peak (not the onset) lands on the grid (reversed swells). */
  leadMs?: number;
}

export interface LayerHit {
  layer: string;
  cue: string;
  /** Song ms of the grid point. */
  atMs: number;
  gainDb: number;
  pitch: number;
}

/** Steps in one bar for this layer (at least 1). */
function stepsPerCycle(g: BeatGrid, step: number): number {
  return Math.max(1, Math.round(g.beatsPerBar / step));
}

/**
 * All grid hits of the active layers in (fromMs, toMs] of song time. Layers
 * whose step is longer than a bar (swells every 4 bars) cycle over their own
 * length, counted from the first downbeat.
 */
export function layerHitsBetween(g: BeatGrid, layers: readonly BeatLayerDef[], level: number, fromMs: number, toMs: number): LayerHit[] {
  const out: LayerHit[] = [];
  if (toMs <= fromMs || g.bpm <= 0) return out;
  const beat = 60000 / g.bpm;
  for (const L of layers) {
    if (level < L.level || level > (L.maxLevel ?? Infinity)) continue;
    const stepMs = beat * L.step;
    const lead = L.leadMs ?? 0;
    const cycle = L.step >= g.beatsPerBar ? 1 : stepsPerCycle(g, L.step);
    // First step index whose (time - lead) is after fromMs.
    let k = Math.floor((fromMs + lead - g.offsetMs) / stepMs) + 1;
    for (;; k++) {
      const at = g.offsetMs + k * stepMs - lead;
      if (at > toMs) break;
      if (at <= fromMs) continue;
      const inCycle = ((k % cycle) + cycle) % cycle;
      if (L.hits && L.hits.indexOf(inCycle) < 0) continue;
      const acc = L.accentDb && L.accentDb.length ? L.accentDb[inCycle % L.accentDb.length] : 0;
      const n = L.hits ? L.hits.indexOf(inCycle) : inCycle;
      const pitch = L.pitch && L.pitch.length ? L.pitch[n % L.pitch.length] : 0;
      out.push({ layer: L.id, cue: L.cue, atMs: at, gainDb: (L.gainDb ?? 0) + acc, pitch });
    }
  }
  out.sort((a, b) => a.atMs - b.atMs);
  return out;
}

/** Ids of the layers sounding at a level (HUD, tester). */
export function activeLayers(layers: readonly BeatLayerDef[], level: number): string[] {
  return layers.filter((L) => level >= L.level && level <= (L.maxLevel ?? Infinity)).map((L) => L.id);
}

/**
 * Unwrap a looping bed position into monotonic song time. Keep one tracker
 * per bed; a backwards jump of more than half the loop is a wrap.
 */
export interface UnwrapState {
  loopMs: number;
  lastPos: number;
  wraps: number;
}

export function createUnwrap(loopMs: number): UnwrapState {
  return { loopMs, lastPos: -1, wraps: 0 };
}

export function unwrapPosition(u: UnwrapState, posMs: number): number {
  if (u.lastPos >= 0 && u.loopMs > 0 && posMs < u.lastPos - u.loopMs / 2) u.wraps += 1;
  u.lastPos = posMs;
  return u.wraps * u.loopMs + posMs;
}

/**
 * Map a combo multiplier to a layer level (Whack v5: x1.5 -> 1, x2 -> 2,
 * x2.5 -> 3, x3+ -> 4, fever -> 5).
 */
export function whackLayerLevel(multiplier: number, fever: boolean): number {
  if (fever) return 5;
  if (multiplier >= 3) return 4;
  if (multiplier >= 2.5) return 3;
  if (multiplier >= 2) return 2;
  if (multiplier >= 1.5) return 1;
  return 0;
}

/** Layer kits from the designs (Chris's one-shots; studio cues fall back to Chris until approved). */
export const BEAT_LAYER_KITS = {
  /** Whack v5 escalating music. */
  whack: [
    { id: 'hat', cue: 'ui.tap', step: 0.5, level: 1, gainDb: -14, accentDb: [0, -4] },
    { id: 'clap', cue: 'fx.firework', step: 1, hits: [1, 3], level: 2, gainDb: -12 },
    { id: 'shaker', cue: 'fx.coinTick', step: 0.25, level: 3, gainDb: -20, accentDb: [0, -6, -3, -6] },
    { id: 'rim', cue: 'ui.select', step: 1, hits: [3], level: 4, gainDb: -12 },
    { id: 'swell', cue: 'fx.whooshRev', step: 16, level: 5, gainDb: -8, leadMs: 590 },
  ],
  /** Parade Beat Fever layer (6 LU under the bed). */
  rhythmFever: [
    { id: 'clap', cue: 'sh_clap', step: 1, hits: [1, 3], level: 1, gainDb: -6 },
    { id: 'tamb', cue: 'rh_tamb', step: 0.5, level: 1, gainDb: -9, accentDb: [0, -3] },
  ],
  /** Banana Golden Hour: tambourine 8ths and a G B D G glock arpeggio per bar (G major bed). */
  bananaGoldenHour: [
    { id: 'tamb', cue: 'rh_tamb', step: 0.5, level: 1, gainDb: -10, accentDb: [0, -3] },
    { id: 'glock', cue: 'sh_glock', step: 1, level: 1, gainDb: -10, pitch: [0, 4, 7, 12] },
  ],
  /** Line Party LAST 2 BARS lift. */
  lineParty: [
    { id: 'clap', cue: 'sh_clap', step: 1, hits: [1, 3], level: 1, gainDb: -6 },
    { id: 'glock', cue: 'sh_glock', step: 0.25, level: 1, gainDb: -12, pitch: [0, 4, 7, 12] },
  ],
} satisfies Record<string, BeatLayerDef[]>;

export type BeatLayerKit = keyof typeof BEAT_LAYER_KITS;
