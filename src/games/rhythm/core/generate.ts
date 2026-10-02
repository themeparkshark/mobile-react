/**
 * generate: authored stage JSON + seed -> the round's Chart (design 7.3, 5.5).
 *
 * It adds no notes of its own. The seed only chooses among authored,
 * onset-backed alternates:
 *   1. every 'fill' group (in group id order) takes alt floor(r * 3);
 *   2. 'echo' groups: a seeded Fisher-Yates over the eligible groups, the
 *      first 2 play as ECHO (alt 1), the rest as normal bars (alt 0);
 *   3. 'freeze' groups (difficulty 3): the same draw, the first 2 get their
 *      FREEZE (alt 1);
 *   4. every CYMBAL with the 'either' flag, in note order: r < 0.5 keeps the
 *      CYMBAL, otherwise it plays as a DRUM on the same crash.
 * The PHP twin must draw in exactly this order (mulberry32 on the raw seed).
 *
 * Pure: no React, no worklets needed (runs once per round on JS).
 */

import {
  F_ECHO,
  F_EITHER,
  F_FLICK,
  K_BIG,
  K_CYMBAL,
  K_DRUM,
  K_FREEZE,
  K_POPPER,
  K_ROLL,
  SECTIONS,
  type Chart,
  type Difficulty,
  type NoteRow,
  type RoundFormat,
  type StageFormatJson,
  type StageJson,
} from './types';

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface GenerateOptions {
  /** First Parade (FTUE): DRUM and one BIG only, no-fail handled by the judge. */
  ftue?: boolean;
}

const QUEUE_SECTION_OF_BAR = [1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6, 6];
const RIDE_SECTION_OF_BAR = [1, 1, 1, 1, 4, 4, 4, 4, 6, 6, 6, 6];

function pickN(rand: () => number, ids: number[], n: number): Set<number> {
  const arr = ids.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return new Set(arr.slice(0, n));
}

/** Integer-safe beat time (ms float) at a fractional beat index. */
export function beatTime(beats: number[], beat: number): number {
  const n = beats.length;
  if (beat <= 0) return beats[0] + beat * (beats[1] - beats[0]);
  if (beat >= n - 1) return beats[n - 1] + (beat - (n - 1)) * (beats[n - 1] - beats[n - 2]);
  const i = Math.floor(beat);
  return beats[i] + (beat - i) * (beats[i + 1] - beats[i]);
}

export function chooseAlternates(fmt: StageFormatJson, difficulty: Difficulty, seed: number): { chosen: Map<number, number>; rand: () => number } {
  const rand = mulberry32(seed);
  const groups = (fmt.groups[String(difficulty)] ?? []).slice().sort((a, b) => a[0] - b[0]);
  const chosen = new Map<number, number>();
  for (const [id, type, alts] of groups) {
    if (type === 'fill') chosen.set(id, Math.min(alts - 1, Math.floor(rand() * alts)));
  }
  const echo = groups.filter((g) => g[1] === 'echo').map((g) => g[0]);
  const echoOn = pickN(rand, echo, 2);
  echo.forEach((id) => chosen.set(id, echoOn.has(id) ? 1 : 0));
  const freeze = groups.filter((g) => g[1] === 'freeze').map((g) => g[0]);
  const freezeOn = pickN(rand, freeze, 2);
  freeze.forEach((id) => chosen.set(id, freezeOn.has(id) ? 1 : 0));
  return { chosen, rand };
}

export function generate(stage: StageJson, format: RoundFormat, difficulty: Difficulty, seed: number, opts: GenerateOptions = {}): Chart {
  const fmt = stage.formats[format] ?? stage.formats.queue!;
  const realFormat: RoundFormat = stage.formats[format] ? format : 'queue';
  const d: Difficulty = realFormat === 'ride' ? 1 : difficulty;
  const rows: NoteRow[] = fmt.charts[String(d)] ?? fmt.charts['1'];
  const { chosen, rand } = chooseAlternates(fmt, d, seed >>> 0);

  const beats = fmt.beatUs.map((us) => us / 1000);
  const totalBars = fmt.preRollBars + fmt.playableBars + fmt.outroBars;
  const barStart: number[] = [];
  for (let b = 0; b <= totalBars; b++) barStart.push(beatTime(beats, b * 4));
  const barSection: number[] = [];
  const secOf = realFormat === 'ride' ? RIDE_SECTION_OF_BAR : QUEUE_SECTION_OF_BAR;
  for (let b = 0; b < totalBars; b++) {
    const r = b - fmt.preRollBars;
    if (r < 0) barSection.push(0);
    else if (r >= fmt.playableBars) barSection.push(SECTIONS.length - 1);
    else barSection.push(secOf[Math.min(secOf.length - 1, Math.floor((r * secOf.length) / fmt.playableBars))]);
  }

  const out: Chart = {
    stage: stage.id,
    format: realFormat,
    difficulty: d,
    seed: seed >>> 0,
    chartVersion: stage.chartVersion,
    beatmapHash: fmt.beatmapHash,
    beats,
    barStart,
    barSection,
    barEnergy: fmt.barEnergy,
    preRollBars: fmt.preRollBars,
    playableBars: fmt.playableBars,
    firstBar: fmt.preRollBars,
    lastBar: fmt.preRollBars + fmt.playableBars - 1,
    durationMs: fmt.durationMs,
    endMs: barStart[fmt.preRollBars + fmt.playableBars + 1],
    t: [], kind: [], zone: [], layers: [], end: [], flags: [], bar: [], beatLen: [],
    calls: [], callZone: [], freezeCues: [],
    popperTaps: d >= 3 ? 10 : 6,
  };

  let bigSeen = false;
  for (const row of rows) {
    const [tMs, beat, sixteenth, kind0, zone, layers, extra, group, alt, flags0] = row;
    if (group !== 0 && (chosen.get(group) ?? 0) !== alt) continue;
    let kind = kind0;
    let flags = flags0;
    if (kind === K_CYMBAL && (flags & F_EITHER)) {
      if (rand() >= 0.5) kind = K_DRUM;
    }
    if (opts.ftue) {
      // First Parade: DRUM and one BIG only.
      if (kind === K_BIG) {
        if (bigSeen) kind = K_DRUM;
        bigSeen = true;
      } else if (kind !== K_DRUM) {
        if (kind === K_POPPER || kind === K_FREEZE) continue;
        kind = K_DRUM;
      }
      flags &= ~(F_ECHO | F_FLICK);
    }
    if (kind !== K_CYMBAL || d < 3) flags &= ~F_FLICK;
    const bi = Math.floor(beat);
    const len = beats[Math.min(beats.length - 1, bi + 1)] - beats[Math.min(beats.length - 2, bi)];
    out.t.push(tMs);
    out.kind.push(kind);
    out.zone.push(kind === K_DRUM ? 0 : zone);
    out.layers.push(layers);
    out.end.push(kind === K_ROLL || kind === K_POPPER ? extra : 0);
    out.flags.push(flags);
    out.bar.push(Math.floor(beat / 4));
    out.beatLen.push(len);
    if (flags & F_ECHO) {
      out.calls.push(Math.round(beatTime(beats, beat + sixteenth / 4 - 4)));
      out.callZone.push(zone);
    }
    if (kind === K_FREEZE) out.freezeCues.push(Math.round(tMs - len));
  }
  // Stable order: time, then kind (so a BIG never sorts after a same-time DRUM).
  const idx = out.t.map((_, i) => i).sort((a, b) => out.t[a] - out.t[b] || out.kind[a] - out.kind[b]);
  const reorder = <T,>(arr: T[]): T[] => idx.map((i) => arr[i]);
  out.t = reorder(out.t);
  out.kind = reorder(out.kind);
  out.zone = reorder(out.zone);
  out.layers = reorder(out.layers);
  out.end = reorder(out.end);
  out.flags = reorder(out.flags);
  out.bar = reorder(out.bar);
  out.beatLen = reorder(out.beatLen);
  return out;
}

/** Notes of the chart that belong to a layer (for counts, tests and max score). */
export function layerCount(chart: Chart, layer: number): number {
  let n = 0;
  for (let i = 0; i < chart.t.length; i++) if (chart.layers[i] & layer) n++;
  return n;
}

export const NOTE_KIND_NAMES = ['DRUM', 'RIM', 'ROLL', 'BIG', 'CYMBAL', 'POPPER', 'FREEZE'];
