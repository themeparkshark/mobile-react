/**
 * LagoonBoard: the whole Current Quest diorama in one Skia canvas (design 8, 9).
 *
 * Orthographic oblique board: flat toon water with the cell grid in the
 * shader, a sandy island rim whose front face carries the tide waterline,
 * hand-drawn current strips with scrolling foam, sandbar mounds that breach at
 * low tide, y-sorted uprights (Alex-style coral, chest, pearls) and the shark
 * drawn as a deforming mesh of the pose art (body wave, tail follow-through,
 * pose swaps). Everything animates on the UI thread from shared values; React
 * renders only when the board itself changes.
 */

import React, { useMemo } from 'react';
import {
  Canvas, Circle, Group, Image, ImageShader, Oval, Paint, Path, Points, Rect, RoundedRect, Shader, Skia, Text,
  Vertices, BlurMask, ColorMatrix, vec,
  type SkFont, type SkImage, type SkPoint,
} from '@shopify/react-native-skia';
import { useDerivedValue, useFrameCallback, type SharedValue } from 'react-native-reanimated';
import { currentDir, type Board } from './rules';
import {
  evalShark, meshIndices, meshTextures, meshVertices, newFrame,
  POSE_CHEER, POSE_DASH, POSE_DIZZY, POSE_IDLE, POSE_OUCH,
  type MotionPlan, type SharkFrame,
} from './motion';
import { CQ, type BoardLayout } from './theme';

// ---------------------------------------------------------------------------
// Shared state

export interface PreviewSV {
  valid: number;
  red: number;
  pts: number[];
  lx: number;
  ly: number;
  facing: number;
  rot: number;
  beached: number;
  clears: number;
}

export interface BannerSV {
  text: string;
  t0: number;
  kind: number; // 0 gold, 1 coral, 2 white
  ms: number;
}

export interface BoardSV {
  fxT: SharedValue<number>;
  timeScale: SharedValue<number>;
  plan: SharedValue<MotionPlan>;
  shark: SharedValue<SharkFrame>;
  tail: SharedValue<number>;
  /** Per pickup slot (pearls..., golden last): fx ms it was taken, -1 present. */
  picks: SharedValue<number[]>;
  /** Pickups waiting for the shark to reach them: pairs (pathIndex, slot). */
  pickQueue: SharedValue<number[]>;
  tideDrop: SharedValue<number>;
  chest: SharedValue<number>;
  unlockT: SharedValue<number>;
  rattleT: SharedValue<number>;
  armed: SharedValue<number>;
  previews: SharedValue<PreviewSV[]>;
  flow: SharedValue<number>;
  riptide: SharedValue<number>;
  gridA: SharedValue<number>;
  undoTint: SharedValue<number>;
  breath: SharedValue<number>;
  riseT0: SharedValue<number>;
  banner: SharedValue<BannerSV>;
  /** Tip footprints: x,y pairs. */
  hint: SharedValue<number[]>;
  hintT0: SharedValue<number>;
  swirl: SharedValue<number>;
  trail: SharedValue<number[]>;
  /** Current-run flare: fx ms the carry started and which run index. */
  flareT: SharedValue<number>;
  flareRun: SharedValue<number>;
  /** 1 while the player is walking (calmer camera, bigger targets). */
  walking: SharedValue<number>;
  /** Nervous idle at 2 strokes left. */
  nervous: SharedValue<number>;
}

export interface BoardImages {
  swim: SkImage | null;
  dash: SkImage | null;
  ouch: SkImage | null;
  cheer: SkImage | null;
  dizzy: SkImage | null;
  rock: SkImage | null;
  pearl: SkImage | null;
  golden: SkImage | null;
  chestClosed: SkImage | null;
  chestOpen: SkImage | null;
  padlock: SkImage | null;
  chevron: SkImage | null;
}

// ---------------------------------------------------------------------------
// Water shader (8.2): posterized 2-band caustics + readable grid

const WATER_SKSL = `
uniform float2 uSize;
uniform float4 uArea;
uniform float uCell;
uniform float uTime;
uniform float uGrid;
uniform float uBright;
uniform float uTint;

float hash(float2 p) { return fract(sin(dot(p, float2(127.1, 311.7))) * 43758.5453); }
float noise(float2 p) {
  float2 i = floor(p);
  float2 f = fract(p);
  float2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + float2(1.0, 0.0)), u.x), mix(hash(i + float2(0.0, 1.0)), hash(i + float2(1.0, 1.0)), u.x), u.y);
}

half4 main(float2 p) {
  float2 q = p / 64.0;
  float n = noise(q + float2(uTime * 0.06, uTime * 0.035)) * 0.62 + noise(q * 2.3 - float2(uTime * 0.045, -uTime * 0.03)) * 0.38;
  float ridge = 1.0 - abs(n * 2.0 - 1.0);
  float band = step(0.8, ridge);
  float2 a0 = uArea.xy;
  float2 a1 = uArea.xy + uArea.zw;
  bool inside = p.x >= a0.x && p.y >= a0.y && p.x <= a1.x && p.y <= a1.y;
  float3 base = float3(0.247, 0.757, 0.937);
  float3 caus = float3(0.561, 0.890, 0.980);
  float3 col = mix(base, caus, band * (inside ? 0.12 : 0.35));
  if (inside) {
    float2 g = (p - a0) / uCell;
    float2 cellI = floor(g);
    float checker = mod(cellI.x + cellI.y, 2.0);
    col = mix(col, float3(1.0), checker * 0.06 * uGrid);
    float2 f = fract(g) * uCell;
    float2 d2 = min(f, float2(uCell) - f);
    float dc = length(d2);
    float tick = (1.0 - smoothstep(0.0, 1.2, abs(dc - 5.0))) * step(d2.x, 7.0) * step(d2.y, 7.0);
    col = mix(col, float3(1.0), tick * 0.22 * uGrid);
    // Very soft depth toward the centre of each cell (reads as water, not paper).
    col = mix(col, float3(0.20, 0.70, 0.90), 0.05 * (1.0 - length(fract(g) - 0.5) * 1.4));
  }
  col = col + uBright;
  col = mix(col, float3(0.55, 0.75, 1.0), uTint * 0.12);
  return half4(half3(col), 1.0);
}
`;

const waterEffect = Skia.RuntimeEffect.Make(WATER_SKSL);

// ---------------------------------------------------------------------------
// Static geometry per board

interface CurrentRun {
  cells: number[];
  dir: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

function runsOf(board: Board, l: BoardLayout): CurrentRun[] {
  const runs: CurrentRun[] = [];
  const seen = new Set<number>();
  for (let i = 0; i < 25; i++) {
    const d = currentDir(board.tiles[i]);
    if (d < 0 || seen.has(i)) continue;
    // Walk back to the run's entry, then forward.
    let start = i;
    const back = (d + 2) % 4;
    for (;;) {
      const r = Math.floor(start / 5) + [-1, 0, 1, 0][back];
      const c = (start % 5) + [0, 1, 0, -1][back];
      if (r < 0 || r > 4 || c < 0 || c > 4) break;
      const p = r * 5 + c;
      if (currentDir(board.tiles[p]) !== d || seen.has(p)) break;
      start = p;
    }
    const cells: number[] = [];
    let p = start;
    for (;;) {
      cells.push(p);
      seen.add(p);
      const r = Math.floor(p / 5) + [-1, 0, 1, 0][d];
      const c = (p % 5) + [0, 1, 0, -1][d];
      if (r < 0 || r > 4 || c < 0 || c > 4) break;
      const q = r * 5 + c;
      if (currentDir(board.tiles[q]) !== d || seen.has(q)) break;
      p = q;
    }
    const rs = cells.map((x) => Math.floor(x / 5));
    const cs = cells.map((x) => x % 5);
    const r0 = Math.min(...rs);
    const r1 = Math.max(...rs);
    const c0 = Math.min(...cs);
    const c1 = Math.max(...cs);
    const th = l.cell * 0.62;
    const horiz = d === 1 || d === 3;
    const x = horiz ? l.ax + c0 * l.cell + l.cell * 0.08 : l.ax + (c0 + 0.5) * l.cell - th / 2;
    const y = horiz ? l.ay + (r0 + 0.5) * l.cell - th / 2 : l.ay + r0 * l.cell + l.cell * 0.08;
    const w = horiz ? (c1 - c0 + 1) * l.cell - l.cell * 0.16 : th;
    const h = horiz ? th : (r1 - r0 + 1) * l.cell - l.cell * 0.16;
    runs.push({ cells, dir: d, x, y, w, h });
  }
  return runs;
}

// ---------------------------------------------------------------------------

const POSE_SIDE = [true, true, false, false, false];
const MESH_IDX = meshIndices();

interface Props {
  board: Board;
  layout: BoardLayout;
  images: BoardImages;
  font: SkFont | null;
  sv: BoardSV;
  reducedMotion: boolean;
  /** Run failed (Trial): 30% desaturation, never darkened. */
  desaturate?: boolean;
}

function poseImage(images: BoardImages, pose: number): SkImage | null {
  return pose === POSE_DASH ? images.dash : pose === POSE_OUCH ? images.ouch : pose === POSE_CHEER ? images.cheer : pose === POSE_DIZZY ? images.dizzy : images.swim;
}

/** Draw size of a pose image at this cell size (side poses by width, upright by height). */
function poseSize(img: SkImage | null, side: boolean, cell: number): { w: number; h: number } {
  if (!img) return { w: cell, h: cell * 0.6 };
  const aspect = img.width() / img.height();
  if (side) { const w = cell * 1.34; return { w, h: w / aspect }; }
  const h = cell * 1.3;
  return { w: h * aspect, h };
}

function LagoonBoardImpl({ board, layout: l, images, font, sv, reducedMotion, desaturate = false }: Props) {
  const runs = useMemo(() => runsOf(board, l), [board, l]);
  const sands = useMemo(() => board.tiles.split('').map((t, i) => (t === 's' ? i : -1)).filter((i) => i >= 0), [board]);
  const rocks = useMemo(() => board.tiles.split('').map((t, i) => (t === '#' ? i : -1)).filter((i) => i >= 0), [board]);

  // Frame clock: fx time (freezes with hit-stop), shark evaluation, pickups.
  const frame = useMemo(() => newFrame(), []);
  useFrameCallback((info) => {
    'worklet';
    const raw = info.timeSincePreviousFrame;
    if (raw == null) return;
    const dt = (raw > 50 ? 50 : raw) * sv.timeScale.value;
    sv.fxT.value += dt;
    const t = sv.fxT.value;
    const p = sv.plan.value;
    if (p.t0 < 0) { p.t0 = t; }
    evalShark(p, t - p.t0, t, frame);
    // Nervous idle: faster fins and a glance toward the counter.
    if (sv.nervous.value > 0 && frame.pose === POSE_IDLE) {
      frame.waveF = 1.3;
      frame.waveA = 3;
      const glance = (t % 1500) < 200 ? 1 : 0;
      frame.rot += glance * -0.08 * frame.facing;
    }
    // Tail follow-through spring toward the body angle change.
    const target = -frame.rot * 0.9 + (frame.carrying ? 0 : Math.sin(t / 1000 * 1.4) * 0.05);
    const tail = sv.tail.value + (target - sv.tail.value) * Math.min(1, dt * 0.012);
    sv.tail.value = tail;
    sv.shark.value = {
      x: frame.x, y: frame.y, rot: frame.rot, sx: frame.sx, sy: frame.sy, scale: frame.scale, alpha: frame.alpha,
      facing: frame.facing, pose: frame.pose, waveA: reducedMotion ? frame.waveA * 0.5 : frame.waveA, waveF: frame.waveF,
      carrying: frame.carrying, roll: frame.roll, along: frame.along, done: frame.done,
    };
    // Pickups vanish exactly when the shark reaches their tile (magnetism into the wake).
    const q = sv.pickQueue.value;
    if (q.length) {
      let changed = false;
      const picks = sv.picks.value;
      for (let k = 0; k < q.length; k += 2) {
        if (q[k] >= 0 && frame.along >= q[k] - 0.35) {
          picks[q[k + 1]] = t;
          q[k] = -1;
          changed = true;
        }
      }
      if (changed) { sv.picks.value = picks.slice(); sv.pickQueue.value = q.slice(); }
    }
    // Riptide ribbon trail (last 10 positions).
    if (sv.riptide.value > 0.01 && frame.carrying) {
      const tr = sv.trail.value;
      tr.push(frame.x, frame.y);
      if (tr.length > 20) tr.splice(0, tr.length - 20);
      sv.trail.value = tr.slice();
    } else if (sv.trail.value.length) {
      const tr = sv.trail.value;
      tr.splice(0, 2);
      sv.trail.value = tr.slice();
    }
  });

  // ---- water
  const waterUniforms = useDerivedValue(() => ({
    uSize: vec(l.cw, l.ch),
    uArea: [l.ax, l.ay, l.size, l.size],
    uCell: l.cell,
    uTime: sv.fxT.value / 1000,
    uGrid: sv.gridA.value,
    uBright: sv.breath.value,
    uTint: sv.undoTint.value,
  }));

  // ---- rise transition (Captain Toad: the island rises out of the water)
  const riseK = useDerivedValue(() => {
    const e = (sv.fxT.value - sv.riseT0.value) / 420;
    if (e >= 1) return 1;
    if (e <= 0) return 0;
    const u = 1 - e;
    return 1 - u * u * u + Math.sin(e * Math.PI) * 0.06;
  });
  const riseTransform = useDerivedValue(() => [{ translateY: (1 - riseK.value) * 16 }]);
  const riseOpacity = useDerivedValue(() => Math.min(1, riseK.value * 1.6));
  const rowRise = [0, 1, 2, 3, 4].map((r) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useDerivedValue(() => {
      const e = (sv.fxT.value - sv.riseT0.value - 60 - r * 45) / 300;
      if (e >= 1) return [{ translateY: 0 }, { scaleY: 1 }];
      if (e <= 0) return [{ translateY: 14 }, { scaleY: 0.6 }];
      const s = 1 - Math.exp(-6 * e) * Math.cos(e * Math.PI * 2.4);
      return [{ translateY: (1 - s) * 14 }, { scaleY: 0.6 + 0.4 * s }];
    }));
  const rowOpacity = [0, 1, 2, 3, 4].map((r) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useDerivedValue(() => {
      const e = (sv.fxT.value - sv.riseT0.value - 60 - r * 45) / 160;
      return e <= 0 ? 0 : e >= 1 ? 1 : e;
    }));

  // ---- rim and tide waterline (9.6)
  const rimPath = useMemo(() => {
    const outer = Skia.RRectXY(Skia.XYWHRect(l.ax - l.rim, l.ay - l.rim, l.size + l.rim * 2, l.size + l.rim * 2), 20, 20);
    const inner = Skia.RRectXY(Skia.XYWHRect(l.ax, l.ay, l.size, l.size), 12, 12);
    const p = Skia.Path.Make();
    p.addRRect(outer);
    p.addRRect(inner);
    p.setFillType(1); // even-odd
    return p;
  }, [l]);
  const poolRect = useMemo(() => Skia.RRectXY(Skia.XYWHRect(4, l.ay - l.rim - 8, l.cw - 8, l.size + l.rim * 2 + l.face + 16), 26, 26), [l]);
  const poolGlow = useMemo(() => Skia.RRectXY(Skia.XYWHRect(0, l.ay - l.rim - 12, l.cw, l.size + l.rim * 2 + l.face + 24), 30, 30), [l]);
  const innerRRect = useMemo(() => Skia.RRectXY(Skia.XYWHRect(l.ax, l.ay, l.size, l.size), 12, 12), [l]);
  const faceY = l.ay + l.size + l.rim;
  const faceWaterY = useDerivedValue(() => faceY + sv.tideDrop.value);
  const faceWetH = useDerivedValue(() => Math.max(0, sv.tideDrop.value - 3));
  const faceWaterH = useDerivedValue(() => l.face + 4 - sv.tideDrop.value);
  const ripGlow = useDerivedValue(() => sv.riptide.value * (0.25 + 0.15 * Math.sin(sv.fxT.value / 1000 * Math.PI * 2 * 1.48)));

  // ---- currents: foam streaks scrolling along each run
  const foamPaths = runs.map((run, ri) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useDerivedValue(() => {
      const path = Skia.Path.Make();
      const t = sv.fxT.value / 1000;
      const horiz = run.dir === 1 || run.dir === 3;
      const sign = run.dir === 1 || run.dir === 2 ? 1 : -1;
      const len = horiz ? run.w : run.h;
      const thick = horiz ? run.h : run.w;
      let speed = 0.5 * (1 + sv.riptide.value);
      const flare = sv.flareRun.value === ri ? Math.max(0, 1 - (sv.fxT.value - sv.flareT.value) / 400) : 0;
      speed *= 1 + flare * 2;
      const spacing = l.cell * 0.5;
      const segLen = l.cell * 0.26;
      for (let lane = 0; lane < 3; lane++) {
        const off = (lane - 1) * thick * 0.26;
        const phase = ((t * speed * l.cell + lane * spacing * 0.37) % spacing + spacing) % spacing;
        for (let s = -spacing; s < len + spacing; s += spacing) {
          const along = sign > 0 ? s + phase : len - (s + phase);
          const a0 = Math.max(2, along - segLen / 2);
          const a1 = Math.min(len - 2, along + segLen / 2);
          if (a1 - a0 < 3) continue;
          if (horiz) path.addRRect(Skia.RRectXY(Skia.XYWHRect(run.x + a0, run.y + thick / 2 + off - 1.6, a1 - a0, 3.2), 1.6, 1.6));
          else path.addRRect(Skia.RRectXY(Skia.XYWHRect(run.x + thick / 2 + off - 1.6, run.y + a0, 3.2, a1 - a0), 1.6, 1.6));
        }
      }
      return path;
    }));
  const runAlpha = runs.map((_, ri) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useDerivedValue(() => {
      const flare = sv.flareRun.value === ri ? Math.max(0, 1 - (sv.fxT.value - sv.flareT.value) / 400) : 0;
      return 0.72 + 0.28 * Math.max(flare, sv.riptide.value);
    }));
  const chevronBob = useDerivedValue(() => Math.sin(sv.fxT.value / 1000 * Math.PI * 2 * 1.4) * 2);

  // ---- sandbars: water over the mound at HIGH, dry with a wet shoreline at LOW
  const sandWaterAlpha = useDerivedValue(() => 0.55 * (1 - sv.tideDrop.value / 8));
  const sandLift = useDerivedValue(() => [{ translateY: -3 * (sv.tideDrop.value / 8) }]);
  const shoreAlpha = useDerivedValue(() => sv.tideDrop.value / 8);

  // ---- pickups
  const nP = board.pearls.length;
  const pickScale = [0, 1, 2, 3].map((k) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useDerivedValue(() => {
      const at = sv.picks.value[k] ?? -1;
      if (at < 0) {
        const cell = k < nP ? board.pearls[k] : board.golden;
        // Wink when the shark rests one tile away.
        const f = sv.shark.value;
        const cx = l.ax + ((cell % 5) + 0.5) * l.cell;
        const cy = l.ay + (Math.floor(cell / 5) + 0.5) * l.cell;
        const d = Math.abs(f.x - cx) + Math.abs(f.y - cy);
        const near = d < l.cell * 1.2 && f.done ? 0.1 : 0;
        return 1 + near + Math.sin(sv.fxT.value / 1000 * Math.PI * 2 / 1.8 + k) * 0.03;
      }
      const e = (sv.fxT.value - at) / 80;
      return e < 1 ? 1 + 0.35 * e : Math.max(0, 1.35 - (e - 1) * 0.5);
    }));
  const pickAlpha = [0, 1, 2, 3].map((k) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useDerivedValue(() => {
      const at = sv.picks.value[k] ?? -1;
      if (at < 0) return 1;
      return Math.max(0, 1 - (sv.fxT.value - at) / 160);
    }));
  const pickBob = [0, 1, 2, 3].map((k) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useDerivedValue(() => [{ translateY: Math.sin(sv.fxT.value / 1000 * Math.PI * 2 / 1.8 + k * 1.3) * 2 }]));
  const goldenSpark = useDerivedValue(() => {
    const ph = (sv.fxT.value % 700) / 700;
    return ph < 0.35 ? Math.sin((ph / 0.35) * Math.PI) : 0;
  });
  const dryGlint = useDerivedValue(() => {
    if (sv.tideDrop.value < 6) return 0;
    const ph = (sv.fxT.value % 1200) / 1200;
    return ph < 0.25 ? Math.sin((ph / 0.25) * Math.PI) * 0.9 : 0;
  });

  // ---- chest
  const chestWiggle = useDerivedValue(() => {
    const t = sv.fxT.value;
    let rot = 0;
    if (sv.chest.value === 0) {
      const ph = t % 3000;
      rot = ph < 300 ? Math.sin((ph / 300) * Math.PI * 2) * 0.035 : 0;
    }
    const rt = t - sv.rattleT.value;
    if (rt >= 0 && rt < 180) rot += Math.sin((rt / 60) * Math.PI) * 0.17;
    return rot;
  });
  const chestIdx = board.chest;
  const chestCx = l.ax + ((chestIdx % 5) + 0.5) * l.cell;
  const chestBottom = l.ay + (Math.floor(chestIdx / 5) + 1) * l.cell - l.cell * 0.1;
  const chestTransform = useDerivedValue(() => {
    const ut = sv.fxT.value - sv.unlockT.value;
    const bounce = ut >= 0 && ut < 400 ? Math.sin((ut / 400) * Math.PI) * 0.12 * (1 - ut / 400) : 0;
    const open = sv.chest.value === 2 ? 1 : 0;
    return [{ rotate: chestWiggle.value }, { scaleX: 1 + bounce + open * 0.05 }, { scaleY: 1 - bounce * 0.6 + open * 0.08 }];
  });
  const closedAlpha = useDerivedValue(() => (sv.chest.value === 2 ? 0 : 1));
  const openAlpha = useDerivedValue(() => (sv.chest.value === 2 ? 1 : 0));
  const lockAlpha = useDerivedValue(() => {
    if (sv.chest.value === 0) return 1;
    const ut = sv.fxT.value - sv.unlockT.value;
    return ut < 0 ? 1 : Math.max(0, 1 - ut / 200);
  });
  const lockTransform = useDerivedValue(() => {
    const rt = sv.fxT.value - sv.rattleT.value;
    const ut = sv.fxT.value - sv.unlockT.value;
    let rot = rt >= 0 && rt < 180 ? Math.sin((rt / 60) * Math.PI) * 0.17 : 0;
    let dy = 0;
    if (sv.chest.value > 0 && ut >= 0) { rot += Math.sin(ut / 30) * 0.2 * Math.max(0, 1 - ut / 200); dy = ut * 0.05; }
    return [{ rotate: rot }, { translateY: dy }];
  });
  const chestGlow = useDerivedValue(() => (sv.chest.value === 1 ? 0.35 + 0.15 * Math.sin(sv.fxT.value / 200) : 0));

  // ---- shark mesh
  const sharkImage = useDerivedValue(() => {
    const p = sv.shark.value.pose;
    return p === POSE_DASH ? images.dash : p === POSE_OUCH ? images.ouch : p === POSE_CHEER ? images.cheer : p === POSE_DIZZY ? images.dizzy : images.swim;
  });
  const texs = useMemo(() => [0, 1, 2, 3, 4].map((pose) => {
    const img = poseImage(images, pose);
    return img ? meshTextures(img.width(), img.height()) : meshTextures(1, 1);
  }), [images]);
  const textures = useDerivedValue(() => texs[sv.shark.value.pose] ?? texs[0]);
  const vertsOut = useMemo(() => new Array(30).fill(0).map(() => ({ x: 0, y: 0 })), []);
  const sizes = useMemo(() => [0, 1, 2, 3, 4].map((pose) => poseSize(poseImage(images, pose), POSE_SIDE[pose], l.cell)), [images, l.cell]);
  const vertices = useDerivedValue<SkPoint[]>(() => {
    const f = sv.shark.value;
    const sz = sizes[f.pose] ?? sizes[0];
    // Anchor: side poses float at the cell centre, upright poses stand on it.
    const lift = POSE_SIDE[f.pose] ? -l.cell * 0.06 : -l.cell * 0.2;
    const ff = { ...f, y: f.y + lift };
    meshVertices(ff, sz.w, sz.h, POSE_SIDE[f.pose], sv.fxT.value, sv.tail.value, vertsOut);
    return vertsOut.map((v) => vec(v.x, v.y));
  });
  const sharkAlpha = useDerivedValue(() => sv.shark.value.alpha);
  const shadowRect = useDerivedValue(() => {
    const f = sv.shark.value;
    const w = l.cell * 0.9 * (f.carrying ? 0.7 : 1) * f.scale;
    return Skia.XYWHRect(f.x - w / 2, f.y + l.cell * 0.2, w, l.cell * 0.2);
  });
  const depthRect = useDerivedValue(() => {
    const f = sv.shark.value;
    const w = l.cell * 0.95;
    return Skia.XYWHRect(f.x - w / 2, f.y - w * 0.32, w, w * 0.64);
  });
  const sharkRow = useDerivedValue(() => {
    const r = Math.floor((sv.shark.value.y - l.ay) / l.cell + 0.15);
    return r < 0 ? 0 : r > 4 ? 4 : r;
  });
  const slotAlpha = [0, 1, 2, 3, 4].map((r) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useDerivedValue(() => (sharkRow.value === r ? sv.shark.value.alpha : 0)));

  // Riptide ribbon trail.
  const trailPath = useDerivedValue(() => {
    const p = Skia.Path.Make();
    const tr = sv.trail.value;
    for (let k = 0; k + 1 < tr.length; k += 2) {
      if (k === 0) p.moveTo(tr[k], tr[k + 1]); else p.lineTo(tr[k], tr[k + 1]);
    }
    return p;
  });
  const trailAlpha = useDerivedValue(() => (sv.trail.value.length > 3 ? 0.7 : 0));

  // Flow pips above the shark (3 small shells).
  const pipPos = useDerivedValue(() => {
    const f = sv.shark.value;
    return [f.x, f.y - l.cell * 0.62];
  });
  const pipFill = [0, 1, 2].map((k) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useDerivedValue(() => (sv.flow.value > k ? (sv.riptide.value > 0.5 ? CQ.gold : '#ffffff') : 'rgba(255,255,255,0.35)')));
  const pipCx = [0, 1, 2].map((k) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useDerivedValue(() => pipPos.value[0] + (k - 1) * 11));
  const pipCy = [0, 1, 2].map((k) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useDerivedValue(() => pipPos.value[1] + (k === 1 ? -4 : 0)));
  const pipAlpha = useDerivedValue(() => (sv.flow.value > 0 && sv.shark.value.alpha > 0.5 ? 1 : 0));

  // ---- preview (7.2): gold dotted carry path + 45% ghost; coral when no way home
  const armedPreview = useDerivedValue(() => {
    const a = sv.armed.value;
    if (a < 0) return null;
    return sv.previews.value[a] ?? null;
  });
  const previewDots = useDerivedValue<SkPoint[]>(() => {
    const pv = armedPreview.value;
    const out: SkPoint[] = [];
    if (!pv || !pv.valid) return out;
    const pts = pv.pts;
    for (let k = 0; k + 3 < pts.length; k += 2) {
      const x0 = pts[k]; const y0 = pts[k + 1]; const x1 = pts[k + 2]; const y1 = pts[k + 3];
      const len = Math.hypot(x1 - x0, y1 - y0);
      const steps = Math.max(1, Math.round(len / 13));
      for (let s = k === 0 ? 1 : 0; s < steps; s++) out.push(vec(x0 + ((x1 - x0) * s) / steps, y0 + ((y1 - y0) * s) / steps));
    }
    return out;
  });
  const previewColor = useDerivedValue(() => (armedPreview.value && armedPreview.value.red ? CQ.coral : CQ.gold));
  const previewOn = useDerivedValue(() => (armedPreview.value && armedPreview.value.valid ? 1 : 0));
  const ghostRect = useDerivedValue(() => {
    const pv = armedPreview.value;
    const sz = sizes[0];
    const x = pv ? pv.lx : -999;
    const y = pv ? pv.ly - l.cell * 0.06 : -999;
    return Skia.XYWHRect(x - sz.w / 2, y - sz.h / 2, sz.w, sz.h);
  });
  const ghostTransform = useDerivedValue(() => {
    const pv = armedPreview.value;
    if (!pv) return [{ scaleX: 1 }];
    return [{ translateX: pv.lx }, { translateY: pv.ly }, { scaleX: pv.facing }, { rotate: pv.rot }, { translateX: -pv.lx }, { translateY: -pv.ly }];
  });
  const ghostGold = useDerivedValue(() => (armedPreview.value && armedPreview.value.valid && !armedPreview.value.red ? 0.45 : 0));
  const ghostRed = useDerivedValue(() => (armedPreview.value && armedPreview.value.valid && armedPreview.value.red ? 0.55 : 0));
  const clearGlint = useDerivedValue(() => (armedPreview.value && armedPreview.value.clears ? 0.55 + 0.25 * Math.sin(sv.fxT.value / 90) : 0));

  // Tip footprints.
  const hintPts = useDerivedValue<SkPoint[]>(() => {
    const h = sv.hint.value;
    const out: SkPoint[] = [];
    for (let k = 0; k + 1 < h.length; k += 2) out.push(vec(h[k], h[k + 1]));
    return out;
  });
  const hintAlpha = useDerivedValue(() => {
    if (!sv.hint.value.length) return 0;
    const e = (sv.fxT.value - sv.hintT0.value) / 2500;
    return e > 1 ? 0 : 0.85 * (1 - e * e) * (0.75 + 0.25 * Math.sin(sv.fxT.value / 120));
  });

  // Stall swirl under the shark.
  const swirlPath = useDerivedValue(() => {
    const p = Skia.Path.Make();
    const f = sv.shark.value;
    const k = sv.swirl.value;
    if (k <= 0.01) return p;
    const rot = sv.fxT.value / 600;
    for (let s = 0; s < 44; s++) {
      const a = rot + s * 0.32;
      const r = 4 + s * 0.85 * k;
      const x = f.x + Math.cos(a) * r;
      const y = f.y + l.cell * 0.12 + Math.sin(a) * r * 0.45;
      if (s === 0) p.moveTo(x, y); else p.lineTo(x, y);
    }
    return p;
  });
  const swirlAlpha = useDerivedValue(() => sv.swirl.value * 0.35);

  // Banners (10.3): Shark font, gold fill, 4 px INK stroke.
  const bannerText = useDerivedValue(() => sv.banner.value.text);
  const bannerK = useDerivedValue(() => {
    const b = sv.banner.value;
    const e = sv.fxT.value - b.t0;
    if (!b.text || e < 0 || e > b.ms + 200) return 0;
    if (e < 260) { const k = e / 260; return k < 0.7 ? (k / 0.7) * 1.18 : 1.18 - ((k - 0.7) / 0.3) * 0.18; }
    if (e > b.ms) return Math.max(0, 1 - (e - b.ms) / 200);
    return 1;
  });
  const bannerX = useDerivedValue(() => {
    if (!font) return 0;
    const w = font.getTextWidth(bannerText.value);
    return (l.cw - w) / 2;
  });
  const bannerY = l.ay + l.size * 0.42;
  const bannerTransform = useDerivedValue(() => [
    { translateX: l.cw / 2 }, { translateY: bannerY }, { scale: bannerK.value }, { rotate: -0.05 },
    { translateX: -l.cw / 2 }, { translateY: -bannerY },
  ]);
  const bannerFill = useDerivedValue(() => (sv.banner.value.kind === 1 ? CQ.coral : sv.banner.value.kind === 2 ? '#ffffff' : CQ.gold));
  const bannerOpacity = useDerivedValue(() => (bannerK.value > 0.01 ? 1 : 0));

  const desatMatrix = useMemo(() => {
    const s = 0.7;
    const lr = 0.2126 * (1 - s);
    const lg = 0.7152 * (1 - s);
    const lb = 0.0722 * (1 - s);
    return [lr + s, lg, lb, 0, 0, lr, lg + s, lb, 0, 0, lr, lg, lb + s, 0, 0, 0, 0, 0, 1, 0];
  }, []);

  const redTint = useMemo(() => [0.6, 0.3, 0.1, 0, 0.45, 0.2, 0.3, 0.1, 0, 0.05, 0.2, 0.2, 0.2, 0, 0.02, 0, 0, 0, 1, 0], []);

  const cellX = (i: number) => l.ax + (i % 5) * l.cell;
  const cellY = (i: number) => l.ay + Math.floor(i / 5) * l.cell;

  // Uprights per row, back to front (y-sorted), with the shark slotted into its row.
  const rows = [0, 1, 2, 3, 4].map((r) => {
    const items: React.ReactNode[] = [];
    for (let c = 0; c < 5; c++) {
      const i = r * 5 + c;
      const x = cellX(i);
      const y = cellY(i);
      if (rocks.includes(i) && images.rock) {
        const w = l.cell * 1.02;
        const h = (w * images.rock.height()) / images.rock.width();
        items.push(
          <Group key={`rock${i}`}>
            <Oval x={x + l.cell * 0.08} y={y + l.cell * 0.66} width={l.cell * 0.84} height={l.cell * 0.28} color="rgba(31,143,209,0.25)" />
            <Image image={images.rock} x={x + (l.cell - w) / 2} y={y + l.cell * 0.94 - h} width={w} height={h} fit="contain" />
          </Group>,
        );
      }
      if (i === board.chest) {
        const w = l.cell * 1.02;
        const img = images.chestClosed;
        const h = img ? (w * img.height()) / img.width() : w * 0.8;
        const openImg = images.chestOpen;
        const oh = openImg ? (w * 1.05 * openImg.height()) / openImg.width() : h;
        items.push(
          <Group key="chest" transform={chestTransform} origin={vec(chestCx, chestBottom)}>
            <Oval x={chestCx - l.cell * 0.46} y={chestBottom - l.cell * 0.14} width={l.cell * 0.92} height={l.cell * 0.24} color="rgba(31,143,209,0.28)" />
            <Circle cx={chestCx} cy={chestBottom - h * 0.5} r={l.cell * 0.55} color={CQ.gold} opacity={chestGlow}>
              <BlurMask blur={10} style="normal" />
            </Circle>
            <Group opacity={closedAlpha}>
              {img ? <Image image={img} x={chestCx - w / 2} y={chestBottom - h} width={w} height={h} fit="contain" /> : null}
            </Group>
            <Group opacity={openAlpha}>
              {openImg ? <Image image={openImg} x={chestCx - (w * 1.05) / 2} y={chestBottom - oh} width={w * 1.05} height={oh} fit="contain" /> : null}
            </Group>
            <Group opacity={lockAlpha} transform={lockTransform} origin={vec(chestCx, chestBottom - h * 0.5)}>
              {images.padlock ? <Image image={images.padlock} x={chestCx - l.cell * 0.2} y={chestBottom - h * 0.62} width={l.cell * 0.4} height={l.cell * 0.46} fit="contain" /> : null}
            </Group>
          </Group>,
        );
      }
      const pk = board.pearls.indexOf(i);
      const isGolden = i === board.golden;
      if ((pk >= 0 || isGolden) && (isGolden ? images.golden : images.pearl)) {
        const slot = isGolden ? nP : pk;
        const img = (isGolden ? images.golden : images.pearl) as SkImage;
        const s = l.cell * (isGolden ? 0.6 : 0.46);
        const hImg = (s * img.height()) / img.width();
        const cx = x + l.cell / 2;
        const cy = y + l.cell * 0.52;
        items.push(
          <Group key={`pk${i}`} transform={pickBob[slot]}>
            <Group opacity={pickAlpha[slot]} transform={useScaleAt(pickScale[slot], cx, cy)}>
              <Oval x={cx - s * 0.42} y={cy + hImg * 0.34} width={s * 0.84} height={s * 0.22} color="rgba(31,143,209,0.28)" />
              <Image image={img} x={cx - s / 2} y={cy - hImg / 2} width={s} height={hImg} fit="contain" />
              {isGolden ? (
                <Group opacity={goldenSpark}>
                  <Path path={sparklePath(cx + s * 0.34, cy - hImg * 0.36, s * 0.22)} color="#ffffff" />
                  <Path path={sparklePath(cx + s * 0.34, cy - hImg * 0.36, s * 0.22)} color={CQ.ink} style="stroke" strokeWidth={1.2} />
                </Group>
              ) : board.tiles[i] === 's' ? (
                <Group opacity={dryGlint}>
                  <Path path={sparklePath(cx - s * 0.2, cy - hImg * 0.3, s * 0.2)} color="#ffffff" />
                </Group>
              ) : null}
            </Group>
          </Group>,
        );
      }
    }
    return items;
  });

  const sharkNode = (r: number) => (
    <Group key={`shark${r}`} opacity={slotAlpha[r]}>
      <Vertices vertices={vertices} textures={textures} indices={MESH_IDX}>
        <ImageShader image={sharkImage} tx="decal" ty="decal" fm="linear" />
      </Vertices>
    </Group>
  );

  return (
    <Canvas style={{ width: l.cw, height: l.ch }} pointerEvents="none">
      <Group layer={desaturate ? <Paint><ColorMatrix matrix={desatMatrix} /></Paint> : undefined}>
        {/* Open water around the island + play water with grid (one shader). */}
        {/* Soft lagoon pool around the island (the backdrop shows beyond it). */}
        <RoundedRect rect={poolGlow} color="rgba(143,227,250,0.55)">
          <BlurMask blur={8} style="normal" />
        </RoundedRect>
        {waterEffect ? (
          <RoundedRect rect={poolRect}>
            <Shader source={waterEffect} uniforms={waterUniforms} />
          </RoundedRect>
        ) : <RoundedRect rect={poolRect} color={CQ.water} />}
        <RoundedRect rect={poolRect} color="rgba(255,255,255,0.7)" style="stroke" strokeWidth={2} />

        <Group transform={riseTransform} opacity={riseOpacity}>
          {/* Island rim with its front face; the waterline on the face is the tide read. */}
          <Rect x={l.ax - l.rim + 6} y={faceY - 2} width={l.size + l.rim * 2 - 12} height={l.face + 2} color={CQ.wetSand} />
          <Rect x={l.ax - l.rim + 6} y={faceY - 2} width={l.size + l.rim * 2 - 12} height={faceWetH} color={CQ.sand} />
          <Rect x={l.ax - l.rim + 6} y={faceWaterY} width={l.size + l.rim * 2 - 12} height={faceWaterH} color="rgba(63,193,239,0.92)" />
          <Rect x={l.ax - l.rim + 6} y={faceWaterY} width={l.size + l.rim * 2 - 12} height={2} color="rgba(255,255,255,0.85)" />
          <Path path={rimPath} color={CQ.sand} />
          <Path path={rimPath} color={CQ.ink} style="stroke" strokeWidth={2} />
          <RoundedRect rect={innerRRect} color={CQ.gold} style="stroke" strokeWidth={5} opacity={ripGlow} blendMode="plus" />

          {/* Current strips: one per run, foam streaks scroll with the flow. */}
          {runs.map((run, ri) => {
            const rr = Skia.RRectXY(Skia.XYWHRect(run.x, run.y, run.w, run.h), Math.min(run.w, run.h) / 2, Math.min(run.w, run.h) / 2);
            return (
              <Group key={`run${ri}`} opacity={runAlpha[ri]}>
                <RoundedRect rect={rr} color={CQ.current} />
                <Group clip={rr}>
                  <Path path={foamPaths[ri]} color="rgba(255,255,255,0.92)" />
                </Group>
                <RoundedRect rect={rr} color={CQ.ink} style="stroke" strokeWidth={2} />
              </Group>
            );
          })}

          {/* Sandbar mounds (drawn as terrain, under a water layer at HIGH). */}
          {sands.map((i) => {
            const cx = cellX(i) + l.cell / 2;
            const cy = cellY(i) + l.cell * 0.56;
            const rx = l.cell * 0.44;
            const ry = l.cell * 0.3;
            return (
              <Group key={`sand${i}`}>
                <Group transform={sandLift}>
                  <Oval x={cx - rx} y={cy - ry + 5} width={rx * 2} height={ry * 2} color={CQ.wetSand} />
                  <Oval x={cx - rx} y={cy - ry} width={rx * 2} height={ry * 2} color={CQ.sand} />
                  <Oval x={cx - rx * 0.55} y={cy - ry * 0.62} width={rx * 0.7} height={ry * 0.5} color="rgba(255,255,255,0.45)" />
                  <Oval x={cx - rx} y={cy - ry} width={rx * 2} height={ry * 2 + 5} color={CQ.ink} style="stroke" strokeWidth={2} />
                  <Group opacity={shoreAlpha}>
                    <Oval x={cx - rx - 3} y={cy - ry - 2} width={rx * 2 + 6} height={ry * 2 + 9} color={CQ.shoreline} style="stroke" strokeWidth={3} />
                    <Oval x={cx - rx - 6} y={cy - ry - 4} width={rx * 2 + 12} height={ry * 2 + 13} color="rgba(255,255,255,0.8)" style="stroke" strokeWidth={1.5} />
                  </Group>
                </Group>
                <Oval x={cx - rx - 2} y={cy - ry - 2} width={rx * 2 + 4} height={ry * 2 + 9} color={CQ.water} opacity={sandWaterAlpha} />
              </Group>
            );
          })}

          {/* Chevron at each run's entry. */}
          {images.chevron ? runs.map((run, ri) => {
            const e = run.cells[0];
            const cx = cellX(e) + l.cell / 2;
            const cy = cellY(e) + l.cell / 2;
            const w = l.cell * 0.62;
            const h = (w * (images.chevron as SkImage).height()) / (images.chevron as SkImage).width();
            const rot = [-Math.PI / 2, 0, Math.PI / 2, Math.PI][run.dir];
            return (
              <Group key={`chev${ri}`} transform={[{ translateX: cx }, { translateY: cy }, { rotate: rot }]}>
                <Group transform={useBob(chevronBob)}>
                  <Image image={images.chevron} x={-w / 2} y={-h / 2} width={w} height={h} fit="contain" />
                </Group>
              </Group>
            );
          }) : null}
        </Group>

        {/* Tip footprints and the stall swirl sit on the water. */}
        <Group opacity={hintAlpha}>
          <Points points={hintPts} mode="points" color={CQ.ink} strokeWidth={17} strokeCap="round" />
          <Points points={hintPts} mode="points" color={CQ.gold} strokeWidth={13} strokeCap="round" />
        </Group>
        <Path path={swirlPath} color="#ffffff" style="stroke" strokeWidth={3} opacity={swirlAlpha} />

        {/* Seabed contact shadow + depth tint under the shark. */}
        <Oval rect={depthRect} color="rgba(31,143,209,0.10)" />
        <Oval rect={shadowRect} color="rgba(31,143,209,0.25)">
          <BlurMask blur={6} style="normal" />
        </Oval>

        {/* Riptide ribbon. */}
        <Path path={trailPath} color={CQ.gold} style="stroke" strokeWidth={9} strokeCap="round" strokeJoin="round" opacity={trailAlpha} />

        {/* Preview path (gold dots, INK rim). */}
        <Group opacity={previewOn}>
          <Points points={previewDots} mode="points" color={CQ.ink} strokeWidth={10} strokeCap="round" />
          <Points points={previewDots} mode="points" color={previewColor} strokeWidth={7} strokeCap="round" />
        </Group>

        {/* Uprights, y-sorted by row, shark slotted into its row. */}
        {[0, 1, 2, 3, 4].map((r) => (
          <Group key={`row${r}`}>
            <Group transform={rowRise[r]} origin={vec(l.cw / 2, l.ay + (r + 1) * l.cell)} opacity={rowOpacity[r]}>
              {rows[r]}
            </Group>
            {sharkNode(r)}
          </Group>
        ))}

        {/* Ghost shark at the landing tile. */}
        {images.swim ? (
          <Group transform={ghostTransform}>
            <Group opacity={ghostGold}>
              <Image image={images.swim} rect={ghostRect} fit="contain" />
            </Group>
            <Group opacity={ghostRed} layer={<Paint><ColorMatrix matrix={redTint} /></Paint>}>
              <Image image={images.swim} rect={ghostRect} fit="contain" />
            </Group>
          </Group>
        ) : null}
        <Circle cx={chestCx} cy={chestBottom - l.cell * 0.4} r={l.cell * 0.34} color="#ffffff" opacity={clearGlint} blendMode="plus">
          <BlurMask blur={8} style="normal" />
        </Circle>

        {/* Flow pips above the shark. */}
        <Group opacity={pipAlpha}>
          {[0, 1, 2].map((k) => (
            <Group key={`pip${k}`}>
              <Circle cx={pipCx[k]} cy={pipCy[k]} r={5.5} color={CQ.ink} />
              <Circle cx={pipCx[k]} cy={pipCy[k]} r={4} color={pipFill[k]} />
            </Group>
          ))}
        </Group>

        {/* Banners. */}
        {font ? (
          <Group transform={bannerTransform} opacity={bannerOpacity}>
            <Text text={bannerText} x={bannerX} y={bannerY + 14} font={font} color={CQ.ink} style="stroke" strokeWidth={7} strokeJoin="round" />
            <Text text={bannerText} x={bannerX} y={bannerY + 14} font={font} color={bannerFill} />
          </Group>
        ) : null}
      </Group>
    </Canvas>
  );
}

function useScaleAt(scale: SharedValue<number>, cx: number, cy: number) {
  return useDerivedValue(() => [
    { translateX: cx }, { translateY: cy }, { scale: scale.value }, { translateX: -cx }, { translateY: -cy },
  ]);
}

function useBob(bob: SharedValue<number>) {
  return useDerivedValue(() => [{ translateY: bob.value }]);
}

function sparklePath(cx: number, cy: number, r: number) {
  const p = Skia.Path.Make();
  const k = r * 0.28;
  p.moveTo(cx, cy - r);
  p.quadTo(cx + k * 0.3, cy - k * 0.3, cx + r, cy);
  p.quadTo(cx + k * 0.3, cy + k * 0.3, cx, cy + r);
  p.quadTo(cx - k * 0.3, cy + k * 0.3, cx - r, cy);
  p.quadTo(cx - k * 0.3, cy - k * 0.3, cx, cy - r);
  p.close();
  return p;
}

export const LagoonBoard = React.memo(LagoonBoardImpl);
