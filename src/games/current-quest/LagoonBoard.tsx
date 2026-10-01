/**
 * LagoonBoard: the whole Current Quest diorama in one Skia canvas (design v7.1 8, 9, 0.A.2, 0.A.13).
 *
 * Orthographic oblique board, always 5 columns and 5 to 7 rows: flat toon
 * water with the cell grid in the shader, a sandy island rim whose front face
 * carries the tide waterline, Alex-style hand-drawn current foam strips that
 * scroll with the flow, sandbar mounds that crossfade between their wet (HIGH)
 * and dry (LOW) pipeline sprites, y-sorted uprights (three coral variants,
 * chest with its pearl-socket badge, pearls) and the red-cap shark drawn as a
 * deforming mesh of five pose images (body wave, tail follow-through, pose
 * swaps). Every procedural shape is an ink brush stroke (9.13). Everything
 * animates on the UI thread from shared values; React renders only when the
 * board itself changes.
 */

import React, { useEffect, useMemo } from 'react';
import {
  Canvas, Circle, Group, Image, ImageShader, Oval, Paint, Path, Points, Rect, RoundedRect, Shader, Skia, Text,
  Vertices, BlurMask, ColorMatrix, useFont, vec,
  type SkFont, type SkImage, type SkPoint,
} from '@shopify/react-native-skia';
import { useDerivedValue, useFrameCallback, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { cellsOf, currentDir, heightOf, MAX_H, type Board } from './rules';
import {
  evalShark, meshIndices, meshTextures, meshVertices, newFrame,
  POSE_BRACE, POSE_CHEER, POSE_COUNT, POSE_DASH, POSE_DIZZY, POSE_IDLE, POSE_OUCH, POSE_SURF,
  type MotionPlan, type SharkFrame,
} from './motion';
import { InkStrip, ringPts, spiralPts, waveRowPts, xMarkPts } from './InkStrip';
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
  /** 1 when this stroke would be a Riptide stroke (gold path, "RIPTIDE!"). */
  rip: number;
  /** Icons along the dotted path: x, y, kind (0 pearl, 1 golden, 2 tide turn, 3 unlock). */
  icons: number[];
  /** 1 when this stroke turns the tide: the board ghosts its post-stroke sandbars (0.A.2, Into the Breach). */
  turn: number;
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
  /** Riptide surge glow 0..1 (gold rim pulse, foam x2) for 4 bars after a Riptide stroke. */
  surge: SharedValue<number>;
  gridA: SharedValue<number>;
  undoTint: SharedValue<number>;
  breath: SharedValue<number>;
  riseT0: SharedValue<number>;
  banner: SharedValue<BannerSV>;
  /** Tip footprints: x,y pairs. */
  hint: SharedValue<number[]>;
  hintT0: SharedValue<number>;
  swirl: SharedValue<number>;
  /** Riptide ribbon: last positions as x,y pairs. */
  trail: SharedValue<number[]>;
  /** Current-run flare: fx ms the carry started and which run index. */
  flareT: SharedValue<number>;
  flareRun: SharedValue<number>;
  /** 1 while the player is walking (calmer camera, bigger targets). */
  walking: SharedValue<number>;
  /** Nervous idle at 2 strokes left. */
  nervous: SharedValue<number>;
  /** Pearls banked so far (chest socket badge) and when the last one landed. */
  banked: SharedValue<number>;
  bankT: SharedValue<number>;
  /** Route recap (missed Par): your path and the par path as x,y pairs, and its fx start. */
  recap: SharedValue<number[]>;
  recapPar: SharedValue<number[]>;
  recapT0: SharedValue<number>;
  /** Wrong-turn X: [x, y] or [], stamped at wrongT0. */
  wrong: SharedValue<number[]>;
  wrongT0: SharedValue<number>;
  /** Full tide sweep (first turn of a voyage, Splash): fx start and direction (+1 to LOW). */
  sweepT0: SharedValue<number>;
  /** Glance tour at voyage start (chest glint, golden sparkle, shark ring). */
  tourT0: SharedValue<number>;
  /** fx ms of the last player input (idle personalities start 6 s after it). */
  idleSince: SharedValue<number>;
  /** Coral sway impulses: pairs (cell, fx t0). */
  sway: SharedValue<number[]>;
  /** Shield dome on the shark (Showdown First Find, 0.A.6): 1 up, 0 down; popT = fx ms it popped. */
  shield: SharedValue<number>;
  shieldPopT: SharedValue<number>;
  /** Tide warning pip over the shark at 1 move left (0.A.2: a warning only): 0 off, 1 next is LOW, 2 next is HIGH. */
  tidePip: SharedValue<number>;
  /** The tide palette level 0 (HIGH) .. 1 (LOW), crossfaded on turns (8.2 Alto). */
  lowK: SharedValue<number>;
  /** Par buoy beside the chest (0.A.14, Cut the Rope): the par target (0 hides it), and fx ms it sank (Par lost). */
  parBuoy: SharedValue<number>;
  parSinkT: SharedValue<number>;
}

export interface BoardImages {
  idle: SkImage | null;
  dash: SkImage | null;
  surf: SkImage | null;
  ouch: SkImage | null;
  cheer: SkImage | null;
  coralA: SkImage | null;
  coralB: SkImage | null;
  coralC: SkImage | null;
  sand: SkImage | null;
  sandWet: SkImage | null;
  foam: SkImage | null;
  pearl: SkImage | null;
  golden: SkImage | null;
  chestClosed: SkImage | null;
  chestOpen: SkImage | null;
  padlock: SkImage | null;
  chevron: SkImage | null;
  /** P1 poses (gate-passed): skid brace, dizzy (beached, whirlpool) and the idle blink frame. */
  brace?: SkImage | null;
  dizzy?: SkImage | null;
  blink?: SkImage | null;
  /** Shell cradle under each pearl (J13) and the shield dome. */
  socket?: SkImage | null;
  bubble?: SkImage | null;
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
uniform float uLow;

float hash(float2 p) { return fract(sin(dot(p, float2(127.1, 311.7))) * 43758.5453); }
float noise(float2 p) {
  float2 i = floor(p);
  float2 f = fract(p);
  float2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + float2(1.0, 0.0)), u.x), mix(hash(i + float2(0.0, 1.0)), hash(i + float2(1.0, 1.0)), u.x), u.y);
}

half4 main(float2 p) {
  float2 q = p / 64.0;
  float n = noise(q + float2(uTime * 0.05, uTime * 0.03)) * 0.62 + noise(q * 2.3 - float2(uTime * 0.04, -uTime * 0.025)) * 0.38;
  float ridge = 1.0 - abs(n * 2.0 - 1.0);
  float band = step(0.8, ridge);
  float2 a0 = uArea.xy;
  float2 a1 = uArea.xy + uArea.zw;
  bool inside = p.x >= a0.x && p.y >= a0.y && p.x <= a1.x && p.y <= a1.y;
  // Tide palette (8.2): HIGH #2fb6ec / #7fdaf7, LOW #5fd0f0 / #a8ecfb; never darker than #1f8fd1.
  float3 base = mix(float3(0.184, 0.714, 0.925), float3(0.373, 0.816, 0.941), uLow);
  float3 caus = mix(float3(0.498, 0.855, 0.969), float3(0.659, 0.925, 0.984), uLow);
  // Depth falloff: 6% deeper toward the back row.
  if (p.y < uArea.y + uArea.w) base = mix(base * 0.94, base, clamp((p.y - uArea.y) / max(1.0, uArea.w), 0.0, 1.0));
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

export interface CurrentRun {
  cells: number[];
  dir: number;
  /** Centre and length/thickness in board px (local frame rotated to the flow). */
  cx: number;
  cy: number;
  len: number;
  th: number;
}

const DR = [-1, 0, 1, 0];
const DC = [0, 1, 0, -1];

/** Maximal same-direction current chains, in a stable order (also used by the game for the flare). */
export function runsOf(board: Board, l: BoardLayout | null): CurrentRun[] {
  const runs: CurrentRun[] = [];
  const seen = new Set<number>();
  const H = heightOf(board);
  const n = cellsOf(board);
  const at = (r: number, c: number) => (r < 0 || r >= H || c < 0 || c > 4 ? -1 : r * 5 + c);
  for (let i = 0; i < n; i++) {
    const d = currentDir(board.tiles[i]);
    if (d < 0 || seen.has(i)) continue;
    let start = i;
    const back = (d + 2) % 4;
    for (;;) {
      const p = at(Math.floor(start / 5) + DR[back], (start % 5) + DC[back]);
      if (p < 0 || currentDir(board.tiles[p]) !== d || seen.has(p)) break;
      start = p;
    }
    const cells: number[] = [];
    let p = start;
    for (;;) {
      cells.push(p);
      seen.add(p);
      const q = at(Math.floor(p / 5) + DR[d], (p % 5) + DC[d]);
      if (q < 0 || currentDir(board.tiles[q]) !== d || seen.has(q)) break;
      p = q;
    }
    const cell = l ? l.cell : 1;
    const ax = l ? l.ax : 0;
    const ay = l ? l.ay : 0;
    const first = cells[0];
    const last = cells[cells.length - 1];
    const cx = ax + ((((first % 5) + (last % 5)) / 2) + 0.5) * cell;
    const cy = ay + (((Math.floor(first / 5) + Math.floor(last / 5)) / 2) + 0.5) * cell;
    runs.push({ cells, dir: d, cx, cy, len: cells.length * cell - cell * 0.1, th: cell * 0.66 });
  }
  return runs;
}

// ---------------------------------------------------------------------------

/** Side poses swim along x; upright poses stand. Surf faces left in the art, so its texture is mirrored. */
const POSE_SIDE = [false, true, false, false, false, true, false];
const POSE_MIRROR = [false, false, false, false, false, true, false];
/** Facing of each image as drawn (after the mirror): +1 looks right. Dizzy and brace face left in the P1 art. */
const POSE_NATIVE = [1, 1, -1, 1, -1, 1, -1];
const MESH_IDX = meshIndices();
const ROWS = Array.from({ length: MAX_H }, (_, r) => r);

interface Props {
  board: Board;
  layout: BoardLayout;
  images: BoardImages;
  font: SkFont | null;
  sv: BoardSV;
  reducedMotion: boolean;
  /** Lite perf tier: no ambient life, half the foam. */
  lite?: boolean;
  /** Run failed (Trial): 30% desaturation, never darkened. */
  desaturate?: boolean;
}

function poseImage(images: BoardImages, pose: number): SkImage | null {
  if (pose === POSE_DASH) return images.dash;
  if (pose === POSE_SURF) return images.surf;
  if (pose === POSE_DIZZY) return images.dizzy ?? images.ouch;
  if (pose === POSE_BRACE) return images.brace ?? images.surf;
  if (pose === POSE_OUCH) return images.ouch;
  if (pose === POSE_CHEER) return images.cheer;
  return images.idle;
}

/** Draw size of a pose image at this cell size (side poses by width, upright by height). */
function poseSize(img: SkImage | null, side: boolean, cell: number): { w: number; h: number } {
  if (!img) return { w: cell, h: cell * 0.6 };
  const aspect = img.width() / img.height();
  if (side) { const w = cell * 1.36; return { w, h: w / aspect }; }
  const h = cell * 1.32;
  return { w: h * aspect, h };
}

function hashCell(i: number, salt: number): number {
  let h = (i * 2654435761 + salt * 40503) >>> 0;
  h ^= h >>> 13;
  return h >>> 0;
}

function LagoonBoardImpl({ board, layout: l, images, font, sv, reducedMotion, lite = false, desaturate = false }: Props) {
  const H = heightOf(board);
  const runs = useMemo(() => runsOf(board, l), [board, l]);
  const sands = useMemo(() => board.tiles.split('').map((t, i) => (t === 's' ? i : -1)).filter((i) => i >= 0), [board]);
  const rocks = useMemo(() => board.tiles.split('').map((t, i) => (t === '#' ? i : -1)).filter((i) => i >= 0), [board]);
  const goldenXY = useMemo(() => (board.golden >= 0
    ? [l.ax + ((board.golden % 5) + 0.5) * l.cell, l.ay + (Math.floor(board.golden / 5) + 0.5) * l.cell] : [-1, -1]), [board, l]);
  const chestXY = useMemo(() => [l.ax + ((board.chest % 5) + 0.5) * l.cell, l.ay + (Math.floor(board.chest / 5) + 0.5) * l.cell], [board, l]);

  // Frame clock: fx time (freezes with hit-stop), shark evaluation, pickups, idle personality.
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
    const resting = p.kind === 0 && frame.done && !p.beached;
    if (sv.nervous.value > 0 && resting) {
      // Nervous idle: fin flap x2, faster body wave, a glance toward the counter every 1.5 s.
      frame.waveF = 1.3;
      frame.waveA = 3.2;
      const glance = (t % 1500) < 200 ? 1 : 0;
      frame.rot += glance * -0.1 * frame.facing;
    } else if (resting && sv.walking.value < 0.5) {
      // Idle personalities (Threes / Monument Valley), also the soft pre-Tip nudge.
      // They only ever look at the golden pearl or the chest, never the best move.
      const idle = t - sv.idleSince.value;
      if (idle > 6000) {
        const cyc = (idle - 6000) % 8000;
        if (cyc < 1200 && goldenXY[0] >= 0 && (sv.picks.value[board.pearls.length] ?? -1) === -1) {
          frame.facing = goldenXY[0] >= frame.x ? 1 : -1;
          frame.rot += Math.sin(Math.min(1, cyc / 200) * Math.PI / 2) * (goldenXY[1] < frame.y ? -0.12 : 0.12) * frame.facing;
        } else if (cyc >= 2000 && cyc < 2300) {
          frame.waveA = 6;
          frame.waveF = 3.2;
        } else if (cyc >= 4000 && cyc < 4600) {
          const k = Math.sin(((cyc - 4000) / 600) * Math.PI);
          const dx = chestXY[0] - frame.x;
          const dy = chestXY[1] - frame.y;
          const d = Math.hypot(dx, dy) || 1;
          frame.x += (dx / d) * 6 * k;
          frame.y += (dy / d) * 6 * k;
          frame.facing = dx >= 0 ? 1 : -1;
        }
      }
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
    // Riptide ribbon trail (last 10 positions) while a Riptide carry runs.
    if (p.rip && frame.carrying) {
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
    uArea: [l.ax, l.ay, l.pw, l.ph],
    uCell: l.cell,
    uTime: sv.fxT.value / 1000,
    uGrid: sv.gridA.value,
    uBright: sv.breath.value,
    uTint: sv.undoTint.value,
    uLow: sv.lowK.value,
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
  const rowRise = ROWS.map((r) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useDerivedValue(() => {
      const e = (sv.fxT.value - sv.riseT0.value - 60 - r * 40) / 300;
      if (e >= 1) return [{ translateY: 0 }, { scaleY: 1 }];
      if (e <= 0) return [{ translateY: 12 }, { scaleY: 0.6 }];
      const s = 1 - Math.exp(-6 * e) * Math.cos(e * Math.PI * 2.4);
      return [{ translateY: (1 - s) * 12 }, { scaleY: 0.6 + 0.4 * s }];
    }));
  const rowOpacity = ROWS.map((r) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useDerivedValue(() => {
      const e = (sv.fxT.value - sv.riseT0.value - 60 - r * 40) / 160;
      return e <= 0 ? 0 : e >= 1 ? 1 : e;
    }));

  // ---- rim and tide waterline (9.6)
  const rimPath = useMemo(() => {
    const outer = Skia.RRectXY(Skia.XYWHRect(l.ax - l.rim, l.ay - l.rim, l.pw + l.rim * 2, l.ph + l.rim * 2), 20, 20);
    const inner = Skia.RRectXY(Skia.XYWHRect(l.ax, l.ay, l.pw, l.ph), 12, 12);
    const p = Skia.Path.Make();
    p.addRRect(outer);
    p.addRRect(inner);
    p.setFillType(1); // even-odd
    return p;
  }, [l]);
  const poolRect = useMemo(() => Skia.RRectXY(Skia.XYWHRect(4, l.ay - l.rim - 8, l.cw - 8, l.ph + l.rim * 2 + l.face + 16), 26, 26), [l]);
  const poolGlow = useMemo(() => Skia.RRectXY(Skia.XYWHRect(0, l.ay - l.rim - 12, l.cw, l.ph + l.rim * 2 + l.face + 24), 30, 30), [l]);
  const innerRRect = useMemo(() => Skia.RRectXY(Skia.XYWHRect(l.ax, l.ay, l.pw, l.ph), 12, 12), [l]);
  const faceY = l.ay + l.ph + l.rim;
  const faceWaterY = useDerivedValue(() => faceY + sv.tideDrop.value);
  const faceWetH = useDerivedValue(() => Math.max(0, sv.tideDrop.value - 3));
  const faceWaterH = useDerivedValue(() => l.face + 4 - sv.tideDrop.value);
  // Riptide surge: bright gold glow along the inside of the rim, pulsing on the bed's beat (89 BPM).
  const ripGlow = useDerivedValue(() => sv.surge.value * (0.25 + 0.15 * Math.sin(sv.fxT.value / 1000 * Math.PI * 2 * 1.485)));

  // ---- currents: one hand-drawn foam strip per run, UV-scrolled at 0.5 tiles/s
  const foamTex = images.foam;
  const foamScale = useMemo(() => {
    if (!foamTex) return 1;
    return (l.cell * 0.66) / foamTex.height();
  }, [foamTex, l.cell]);
  // Plain number for the worklet: the UI thread never calls into an SkImage.
  const foamTileW = foamTex ? foamTex.width() * foamScale : l.cell * 3;
  const runScroll = runs.map((run, ri) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useDerivedValue(() => {
      const flare = sv.flareRun.value === ri ? Math.max(0, 1 - (sv.fxT.value - sv.flareT.value) / 400) : 0;
      const speed = 0.5 * (1 + sv.surge.value) * (1 + flare * 2);
      const tileW = foamTileW;
      const off = ((sv.fxT.value / 1000) * speed * l.cell) % tileW;
      return [{ translateX: -run.len / 2 + off - tileW }, { translateY: -run.th / 2 }, { scale: foamScale }];
    }));
  const runAlpha = runs.map((_, ri) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useDerivedValue(() => {
      const flare = sv.flareRun.value === ri ? Math.max(0, 1 - (sv.fxT.value - sv.flareT.value) / 400) : 0;
      return 0.78 + 0.22 * Math.max(flare, sv.surge.value);
    }));
  const chevronBob = useDerivedValue(() => Math.sin(sv.fxT.value / 1000 * Math.PI * 2 * 1.4) * 2);
  // Tempo pulse (8.3, P6): every 1.6 s a highlight runs down each run's chevrons at 75 ms per tile.
  const runTiles = useMemo(() => runs.flatMap((run, ri) => run.cells.map((cell, k) => ({ ri, cell, k, dir: run.dir, entry: k === 0 }))), [runs]);
  const tileGlow = runTiles.map((t) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useDerivedValue(() => {
      const ph = (sv.fxT.value + t.ri * 400) % 1600;
      const e = (ph - t.k * 75) / 160;
      const pulse = e >= 0 && e < 1 ? Math.sin(e * Math.PI) : 0;
      return 0.8 + 0.2 * pulse;
    }));
  const tileScale = runTiles.map((t, i) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useDerivedValue(() => {
      const base = t.entry ? 1 : 0.6;
      const g = (tileGlow[i].value - 0.8) / 0.2;
      return [{ scale: base * (1 + 0.12 * g) }];
    }));

  const chevBobEntry = useDerivedValue(() => [{ translateX: chevronBob.value }]);

  // ---- sandbars: wet sprite at HIGH, dry sprite with a wet shoreline at LOW
  const dryAlpha = useDerivedValue(() => Math.min(1, sv.tideDrop.value / 8));
  const wetAlpha = useDerivedValue(() => 1 - Math.min(1, sv.tideDrop.value / 8));
  const sandLift = useDerivedValue(() => [{ translateY: -2 * (sv.tideDrop.value / 8) }]);
  const shoreAlpha = useDerivedValue(() => Math.max(0, (sv.tideDrop.value - 4) / 4));
  // Post-stroke ghosts (0.A.2): while an armed stroke would turn the tide, every sandbar shows its next state at 45%.
  const ghostTurn = useDerivedValue(() => {
    const a = sv.armed.value;
    const pv = a >= 0 ? sv.previews.value[a] : null;
    return pv && pv.valid && pv.turn ? 1 : 0;
  });
  const dryGhost = useDerivedValue(() => (ghostTurn.value && sv.tideDrop.value < 4 ? 0.45 + 0.1 * Math.sin(sv.fxT.value / 160) : 0));
  const wetGhost = useDerivedValue(() => (ghostTurn.value && sv.tideDrop.value >= 4 ? 0.45 + 0.1 * Math.sin(sv.fxT.value / 160) : 0));

  // ---- coral sway (idle +/-1 deg; impulse when a carry passes or the shark bumps it)
  const rockSway = rocks.map((cell) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useDerivedValue(() => {
      const t = sv.fxT.value;
      let a = reducedMotion ? 0 : Math.sin(t / 1000 * Math.PI * 2 * 0.3 + cell) * 0.017;
      const im = sv.sway.value;
      for (let k = 0; k + 1 < im.length; k += 2) {
        if (im[k] !== cell) continue;
        const e = (t - im[k + 1]) / 1000;
        if (e >= 0 && e < 1.2) a += Math.exp(-5 * e) * Math.sin(e * Math.PI * 2 * 2.2) * 0.1;
      }
      return a;
    }));

  // ---- pickups
  const nP = board.pearls.length;
  const pickScale = [0, 1, 2, 3].map((k) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useDerivedValue(() => {
      // -1 = still on the board; any other value is the fx ms it was taken (-1e9 = long ago, from a resync).
      const at = sv.picks.value[k] ?? -1;
      if (at === -1) {
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
      if (at === -1) return 1;
      return Math.max(0, 1 - (sv.fxT.value - at) / 160);
    }));
  const pickBob = [0, 1, 2, 3].map((k) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useDerivedValue(() => {
      // High and dry: a pearl on a dry sandbar stops bobbing.
      const cell = k < nP ? board.pearls[k] : board.golden;
      const dry = cell >= 0 && board.tiles[cell] === 's' && sv.tideDrop.value > 6;
      return [{ translateY: dry ? 0 : Math.sin(sv.fxT.value / 1000 * Math.PI * 2 / 1.8 + k * 1.3) * 2 }];
    }));
  const goldenSpark = useDerivedValue(() => {
    const ph = (sv.fxT.value % 700) / 700;
    const tour = sv.fxT.value - sv.tourT0.value;
    const tourK = tour >= 150 && tour < 400 ? Math.sin(((tour - 150) / 250) * Math.PI) : 0;
    return Math.max(ph < 0.35 ? Math.sin((ph / 0.35) * Math.PI) : 0, tourK);
  });
  const goldenSparkScale = useDerivedValue<number>(() => {
    const tour = sv.fxT.value - sv.tourT0.value;
    return tour >= 150 && tour < 400 ? 1.6 : 1;
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
  // Unlocked: the lid peeks open with a thin gold glow in the gap; tour: a chest glint.
  const chestGlow = useDerivedValue(() => {
    const tour = sv.fxT.value - sv.tourT0.value;
    const tourK = tour >= 0 && tour < 260 ? Math.sin((tour / 260) * Math.PI) * 0.7 : 0;
    return Math.max(sv.chest.value === 1 ? 0.35 + 0.15 * Math.sin(sv.fxT.value / 200) : 0, tourK);
  });
  // Pearl-socket badge over the padlock (9.7): fills as pearls bank.
  const socketFill = [0, 1, 2].map((k) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useDerivedValue(() => (sv.banked.value > k ? 1 : 0)));
  const socketPop = [0, 1, 2].map((k) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useDerivedValue(() => {
      const e = (sv.fxT.value - sv.bankT.value) / 220;
      const pop = sv.banked.value === k + 1 && e >= 0 && e < 1 ? Math.sin(e * Math.PI) * 0.45 : 0;
      return 1 + pop;
    }));
  const socketAlpha = useDerivedValue(() => (sv.chest.value === 2 ? 0 : sv.chest.value === 1 ? Math.max(0, 1 - (sv.fxT.value - sv.unlockT.value) / 500) : 1));

  // ---- shark mesh
  // Blink (9.1): the P1 eyes-closed idle frame for 140 ms every 3 to 6 s while resting.
  const sharkImage = useDerivedValue(() => {
    const f = sv.shark.value;
    const p = f.pose;
    if (p === POSE_IDLE && images.blink && f.done) {
      const t = sv.fxT.value % 4700;
      if (t < 140 || (t > 2600 && t < 2740 && (sv.fxT.value / 4700) % 2 < 1)) return images.blink;
    }
    return p === POSE_DASH ? images.dash : p === POSE_SURF ? images.surf : p === POSE_DIZZY ? (images.dizzy ?? images.ouch)
      : p === POSE_BRACE ? (images.brace ?? images.surf) : p === POSE_OUCH ? images.ouch : p === POSE_CHEER ? images.cheer : images.idle;
  });
  const texs = useMemo(() => Array.from({ length: POSE_COUNT }, (_, pose) => {
    const img = poseImage(images, pose);
    return img ? meshTextures(img.width(), img.height(), undefined, undefined, POSE_MIRROR[pose]) : meshTextures(1, 1);
  }), [images]);
  const textures = useDerivedValue(() => texs[sv.shark.value.pose] ?? texs[0]);
  const vertsOut = useMemo(() => new Array(30).fill(0).map(() => ({ x: 0, y: 0 })), []);
  const sizes = useMemo(() => Array.from({ length: POSE_COUNT }, (_, pose) => poseSize(poseImage(images, pose), POSE_SIDE[pose], l.cell)), [images, l.cell]);
  const vertices = useDerivedValue<SkPoint[]>(() => {
    const f = sv.shark.value;
    const sz = sizes[f.pose] ?? sizes[0];
    // Anchor: side poses float at the cell centre, upright poses stand on it.
    const lift = POSE_SIDE[f.pose] ? -l.cell * 0.04 : -l.cell * 0.2;
    const ff = { ...f, y: f.y + lift, facing: f.facing * POSE_NATIVE[f.pose] };
    meshVertices(ff, sz.w, sz.h, POSE_SIDE[f.pose], sv.fxT.value, sv.tail.value, vertsOut);
    return vertsOut.map((v) => vec(v.x, v.y));
  });
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
    return r < 0 ? 0 : r > H - 1 ? H - 1 : r;
  });
  const slotAlpha = ROWS.map((r) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useDerivedValue(() => (sharkRow.value === r ? sv.shark.value.alpha : 0)));

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
    const march = (sv.fxT.value / 60) % 13;
    for (let k = 0; k + 3 < pts.length; k += 2) {
      const x0 = pts[k]; const y0 = pts[k + 1]; const x1 = pts[k + 2]; const y1 = pts[k + 3];
      const len = Math.hypot(x1 - x0, y1 - y0);
      const steps = Math.max(1, Math.round(len / 13));
      for (let s = k === 0 ? 1 : 0; s < steps; s++) {
        const u = Math.min(1, (s + march / 13) / steps);
        out.push(vec(x0 + (x1 - x0) * u, y0 + (y1 - y0) * u));
      }
    }
    return out;
  });
  const previewColor = useDerivedValue(() => (armedPreview.value && armedPreview.value.red ? CQ.coral : armedPreview.value && armedPreview.value.rip ? '#fff3a6' : CQ.gold));
  const previewOn = useDerivedValue(() => (armedPreview.value && armedPreview.value.valid ? 1 : 0));
  const previewDotW = useDerivedValue(() => (armedPreview.value && armedPreview.value.rip ? 9 : 7));
  const previewInkW = useDerivedValue(() => previewDotW.value + 3);
  const ghostRect = useDerivedValue(() => {
    const pv = armedPreview.value;
    const sz = sizes[0];
    const x = pv ? pv.lx : -999;
    const y = pv ? pv.ly - l.cell * 0.2 : -999;
    return Skia.XYWHRect(x - sz.w / 2, y - sz.h / 2, sz.w, sz.h);
  });
  const ghostTransform = useDerivedValue(() => {
    const pv = armedPreview.value;
    if (!pv) return [{ scaleX: 1 }];
    const rot = pv.beached ? 1.22 * pv.facing : pv.rot;
    return [{ translateX: pv.lx }, { translateY: pv.ly }, { scaleX: pv.facing }, { rotate: rot }, { translateX: -pv.lx }, { translateY: -pv.ly }];
  });
  const ghostGold = useDerivedValue(() => (armedPreview.value && armedPreview.value.valid && !armedPreview.value.red ? 0.45 : 0));
  const ghostRed = useDerivedValue(() => (armedPreview.value && armedPreview.value.valid && armedPreview.value.red ? 0.55 : 0));
  const clearGlint = useDerivedValue(() => (armedPreview.value && armedPreview.value.clears ? 0.55 + 0.25 * Math.sin(sv.fxT.value / 90) : 0));
  // Icons along the path (Into the Breach full outcome): pearl, golden, tide turn, unlock.
  const iconXY = [0, 1, 2, 3, 4].map((k) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useDerivedValue(() => {
      const pv = armedPreview.value;
      const ic = pv && pv.valid ? pv.icons : [];
      return k * 3 + 2 < ic.length ? [ic[k * 3], ic[k * 3 + 1], ic[k * 3 + 2]] : [-999, -999, -1];
    }));
  const iconKindA = [0, 1, 2, 3].map((kind) => [0, 1, 2, 3, 4].map((k) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useDerivedValue(() => (iconXY[k].value[2] === kind ? 1 : 0))));
  const iconTf = [0, 1, 2, 3, 4].map((k) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useDerivedValue(() => [{ translateX: iconXY[k].value[0] }, { translateY: iconXY[k].value[1] - l.cell * 0.36 }]));

  // Tip footprints.
  const hintPts = useDerivedValue<SkPoint[]>(() => {
    const h = sv.hint.value;
    const out: SkPoint[] = [];
    for (let k = 0; k + 1 < h.length; k += 2) out.push(vec(h[k], h[k + 1]));
    return out;
  });
  const hintAlpha = useDerivedValue(() => {
    if (!sv.hint.value.length) return 0;
    const e = Math.max(0, (sv.fxT.value - sv.hintT0.value) / 2500);
    return e > 1 ? 0 : 0.85 * (1 - e * e) * (0.75 + 0.25 * Math.sin(sv.fxT.value / 120));
  });

  // Stall swirl under the shark (brush spiral, INK edge, slowly rotating).
  const swirlPts = useDerivedValue(() => {
    const k = sv.swirl.value;
    if (k <= 0.01) return [];
    const f = sv.shark.value;
    return spiralPts(f.x, f.y + l.cell * 0.12, k, sv.fxT.value / 600, 0.45);
  });
  const swirlAlpha = useDerivedValue(() => sv.swirl.value * 0.55);

  // Riptide ribbon (gold brush, INK outer edge).
  const trailAlpha = useDerivedValue<number>(() => (sv.trail.value.length > 3 ? 0.9 : 0));

  // Route recap (missed Par): par route as a gold brush, yours as INK dots, drawn on over 500 ms.
  const recapK = useDerivedValue(() => {
    const e = (sv.fxT.value - sv.recapT0.value) / 500;
    return e < 0 ? 0 : e > 1 ? 1 : e;
  });
  const recapAlpha = useDerivedValue(() => {
    const e = sv.fxT.value - sv.recapT0.value;
    if (e < 0 || !sv.recapPar.value.length) return 0;
    return e < 1100 ? 1 : Math.max(0, 1 - (e - 1100) / 300);
  });
  const recapMine = useDerivedValue<SkPoint[]>(() => {
    const pts = sv.recap.value;
    const out: SkPoint[] = [];
    const n = pts.length / 2;
    const upto = Math.ceil(n * recapK.value);
    for (let k = 0; k + 3 < pts.length && k / 2 < upto; k += 2) {
      const x0 = pts[k]; const y0 = pts[k + 1]; const x1 = pts[k + 2]; const y1 = pts[k + 3];
      const steps = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / 11));
      for (let s = 0; s < steps; s++) out.push(vec(x0 + ((x1 - x0) * s) / steps, y0 + ((y1 - y0) * s) / steps));
    }
    return out;
  });

  // Wrong-turn X: stamped (scale 1.4 -> 1, 120 ms) and held while the stall card is up.
  const wrongPts = useDerivedValue(() => {
    const w = sv.wrong.value;
    if (w.length < 2) return [];
    const e = Math.min(1, Math.max(0, (sv.fxT.value - sv.wrongT0.value) / 120));
    return xMarkPts(w[0], w[1], l.cell * 0.26, 1.4 - 0.4 * e);
  });
  const wrongAlpha = useDerivedValue<number>(() => (sv.wrong.value.length >= 2 && sv.fxT.value >= sv.wrongT0.value ? 1 : 0));

  // Tide turn (J4): a horizontal foam-capped brush wave rolls from the front tray wall to the back row in 500 ms.
  const sweepK = useDerivedValue(() => {
    const e = (sv.fxT.value - sv.sweepT0.value) / 500;
    return e < 0 || e > 1 ? -1 : e;
  });
  const sweepPts = useDerivedValue(() => {
    const k = sweepK.value;
    if (k < 0) return [];
    const e = Math.sin((k * Math.PI) / 2);
    return waveRowPts(l.ay + l.ph + l.rim - (l.ph + l.rim + 6) * e, l.ax - 4, l.ax + l.pw + 4, sv.fxT.value, 4);
  });
  // The water behind the front: a soft band trailing the wave (it reads as the water level moving).
  const sweepBand = useDerivedValue(() => {
    const k = sweepK.value;
    if (k < 0) return Skia.XYWHRect(0, -100, 1, 1);
    const e = Math.sin((k * Math.PI) / 2);
    const y = l.ay + l.ph + l.rim - (l.ph + l.rim + 6) * e;
    return Skia.XYWHRect(l.ax, y, l.pw, Math.min(l.cell * 0.9, l.ay + l.ph - y + 4));
  });
  const sweepAlpha = useDerivedValue(() => (sweepK.value < 0 ? 0 : Math.min(1, Math.sin(sweepK.value * Math.PI) * 2)));

  // Shield dome (0.A.6): a bubble bobbing with the shark; it pops into shards when it takes a Splash.
  const shieldRect = useDerivedValue(() => {
    const f = sv.shark.value;
    const r = l.cell * 0.54 * (1 + 0.03 * Math.sin(sv.fxT.value / 300));
    return Skia.XYWHRect(f.x - r, f.y - r - l.cell * 0.16, r * 2, r * 2);
  });
  const shieldAlpha = useDerivedValue(() => {
    const pop = sv.fxT.value - sv.shieldPopT.value;
    if (pop >= 0 && pop < 220) return 1 - pop / 220;
    return sv.shield.value * 0.6;
  });
  // Tide warning pip over the shark at 1 move left (0.A.2: a warning only, the medallion is the counter).
  const pipXY = useDerivedValue(() => {
    const f = sv.shark.value;
    const k = 1 + 0.25 * Math.max(0, Math.sin((sv.fxT.value / 500) * Math.PI));
    return [{ translateX: f.x + l.cell * 0.34 }, { translateY: f.y - l.cell * 0.92 }, { scale: k }];
  });
  const pipAlpha = useDerivedValue(() => (sv.tidePip.value > 0 && sv.shark.value.done ? 1 : 0));
  const pipLowA = useDerivedValue(() => (sv.tidePip.value === 1 ? 1 : 0));
  const pipHighA = useDerivedValue(() => (sv.tidePip.value === 2 ? 1 : 0));
  // Golden pearl rays (J13): 3 soft rays turning at 6 deg/s at 14%, additive, bright only.
  const raysPath = useDerivedValue(() => {
    const p = Skia.Path.Make();
    if (goldenXY[0] < 0 || (sv.picks.value[board.pearls.length] ?? -1) !== -1) return p;
    const a0 = (sv.fxT.value / 1000) * (6 * Math.PI / 180);
    const R = l.cell * 0.85;
    for (let k = 0; k < 3; k++) {
      const a = a0 + (k * Math.PI * 2) / 3;
      p.moveTo(goldenXY[0], goldenXY[1]);
      p.lineTo(goldenXY[0] + Math.cos(a - 0.16) * R, goldenXY[1] + Math.sin(a - 0.16) * R);
      p.lineTo(goldenXY[0] + Math.cos(a + 0.16) * R, goldenXY[1] + Math.sin(a + 0.16) * R);
      p.close();
    }
    return p;
  });

  // Glance tour shark ring (300 to 500 ms) and the resume re-find pulse share one brush ring.
  const tourRingPts = useDerivedValue(() => {
    const e = sv.fxT.value - sv.tourT0.value;
    if (e < 280 || e > 560) return [];
    const k = (e - 280) / 280;
    const f = sv.shark.value;
    return ringPts(f.x, f.y, l.cell * (0.35 + 0.25 * k), -1.2 + k);
  });
  const tourRingAlpha = useDerivedValue(() => {
    const e = sv.fxT.value - sv.tourT0.value;
    return e < 280 || e > 560 ? 0 : Math.sin(((e - 280) / 280) * Math.PI);
  });

  // Ambient life (9.7): fish shadows under the water, a gull shadow every ~30 s.
  const fishLanes = useMemo(() => {
    const out: { row: number; dir: number; period: number; phase: number }[] = [];
    for (let k = 0; k < 2; k++) {
      const row = hashCell(k + 7, board.tiles.length + board.start) % H;
      out.push({ row, dir: k % 2 ? -1 : 1, period: 6000 + (hashCell(k, board.chest) % 4000), phase: hashCell(k + 3, board.golden + 9) % 6000 });
    }
    return out;
  }, [board, H]);
  const fishPos = fishLanes.map((lane) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useDerivedValue(() => {
      const t = sv.fxT.value + lane.phase;
      const cyc = t % (lane.period + 3000);
      if (cyc > lane.period) return [-999, -999, 0];
      const k = cyc / lane.period;
      const x = lane.dir > 0 ? l.ax - l.cell + (l.pw + 2 * l.cell) * k : l.ax + l.pw + l.cell - (l.pw + 2 * l.cell) * k;
      const y = l.ay + (lane.row + 0.5) * l.cell + Math.sin(t / 700) * 4;
      const sharkRowNow = Math.floor((sv.shark.value.y - l.ay) / l.cell);
      const hide = sharkRowNow === lane.row || sv.shark.value.carrying > 0;
      return [x, y, hide ? 0 : Math.min(1, Math.sin(k * Math.PI) * 3)];
    }));
  const fishPaths = fishLanes.map((lane, i) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useDerivedValue(() => {
      const [x, y] = fishPos[i].value;
      const p = Skia.Path.Make();
      const s = l.cell * 0.22;
      const wig = Math.sin(sv.fxT.value / 120) * s * 0.25;
      p.addOval(Skia.XYWHRect(x - s, y - s * 0.42, s * 2, s * 0.84));
      p.moveTo(x - lane.dir * s * 0.9, y);
      p.lineTo(x - lane.dir * s * 1.6, y - s * 0.5 + wig);
      p.lineTo(x - lane.dir * s * 1.6, y + s * 0.5 + wig);
      p.close();
      return p;
    }));
  const fishAlpha = fishLanes.map((_, i) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useDerivedValue(() => fishPos[i].value[2] * 0.12));
  const gullPath = useDerivedValue(() => {
    const p = Skia.Path.Make();
    const t = (sv.fxT.value + 9000) % 30000;
    if (t > 1600) return p;
    const k = t / 1600;
    const x = -40 + (l.cw + 80) * k;
    const y = l.ay + l.ph * (0.85 - 0.6 * k);
    const s = l.cell * 0.55;
    const flap = Math.sin(t / 90) * s * 0.18;
    p.moveTo(x - s, y - flap);
    p.quadTo(x - s * 0.4, y - s * 0.35, x, y);
    p.quadTo(x + s * 0.4, y - s * 0.35, x + s, y - flap);
    p.quadTo(x + s * 0.4, y - s * 0.1, x, y + s * 0.12);
    p.quadTo(x - s * 0.4, y - s * 0.1, x - s, y - flap);
    p.close();
    return p;
  });

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
  const bannerY = l.ay + l.ph * 0.42;
  const bannerTransform = useDerivedValue(() => [
    { translateX: l.cw / 2 }, { translateY: bannerY }, { scale: bannerK.value }, { rotate: -0.05 },
    { translateX: -l.cw / 2 }, { translateY: -bannerY },
  ]);
  const bannerFill = useDerivedValue(() => (sv.banner.value.kind === 1 ? CQ.coral : sv.banner.value.kind === 2 ? '#ffffff' : CQ.gold));
  const bannerOpacity = useDerivedValue(() => (bannerK.value > 0.01 ? 1 : 0));

  // Run failed (Trial): 30% desaturation through a saturation-blend overlay, never darkened.
  // Kept structurally stable (opacity only): toggling a layer on this tree mid-draw crashes Skia.
  const desatK = useSharedValue(0);
  useEffect(() => { desatK.value = withTiming(desaturate ? 0.3 : 0, { duration: 300 }); }, [desaturate, desatK]);
  const ambientOn = useSharedValue(lite || reducedMotion ? 0 : 1);
  useEffect(() => { ambientOn.value = lite || reducedMotion ? 0 : 1; }, [lite, reducedMotion, ambientOn]);
  const gullAlpha = useDerivedValue(() => 0.08 * ambientOn.value);

  const redTint = useMemo(() => [0.6, 0.3, 0.1, 0, 0.45, 0.2, 0.3, 0.1, 0, 0.05, 0.2, 0.2, 0.2, 0, 0.02, 0, 0, 0, 1, 0], []);

  const cellX = (i: number) => l.ax + (i % 5) * l.cell;
  const cellY = (i: number) => l.ay + Math.floor(i / 5) * l.cell;
  const coralFor = (i: number): SkImage | null => {
    const v = hashCell(i, board.tiles.length) % 3;
    return (v === 0 ? images.coralA : v === 1 ? images.coralB : images.coralC) ?? images.coralA;
  };

  // Uprights per row, back to front (y-sorted), with the shark slotted into its row.
  const rows = ROWS.slice(0, H).map((r) => {
    const items: React.ReactNode[] = [];
    for (let c = 0; c < 5; c++) {
      const i = r * 5 + c;
      const x = cellX(i);
      const y = cellY(i);
      const ri = rocks.indexOf(i);
      const img = ri >= 0 ? coralFor(i) : null;
      if (ri >= 0 && img) {
        const w = l.cell * 1.04;
        const h = (w * img.height()) / img.width();
        const baseX = x + l.cell / 2;
        const baseY = y + l.cell * 0.94;
        items.push(
          <Group key={`rock${i}`}>
            <Oval x={x + l.cell * 0.08} y={y + l.cell * 0.66} width={l.cell * 0.84} height={l.cell * 0.28} color="rgba(31,143,209,0.25)" />
            <Group transform={useRotAt(rockSway[ri], baseX, baseY)}>
              <Image image={img} x={x + (l.cell - w) / 2} y={baseY - h} width={w} height={h} fit="contain" />
            </Group>
          </Group>,
        );
      }
      if (i === board.chest) {
        const w = l.cell * 1.02;
        const cimg = images.chestClosed;
        const h = cimg ? (w * cimg.height()) / cimg.width() : w * 0.8;
        const openImg = images.chestOpen;
        const oh = openImg ? (w * 1.05 * openImg.height()) / openImg.width() : h;
        const sockR = l.cell * 0.085;
        const sockY = chestBottom - h * 1.02;
        items.push(
          <Group key="chest" transform={chestTransform} origin={vec(chestCx, chestBottom)}>
            <Oval x={chestCx - l.cell * 0.46} y={chestBottom - l.cell * 0.14} width={l.cell * 0.92} height={l.cell * 0.24} color="rgba(31,143,209,0.28)" />
            <Circle cx={chestCx} cy={chestBottom - h * 0.5} r={l.cell * 0.55} color={CQ.gold} opacity={chestGlow}>
              <BlurMask blur={10} style="normal" />
            </Circle>
            <Group opacity={closedAlpha}>
              {cimg ? <Image image={cimg} x={chestCx - w / 2} y={chestBottom - h} width={w} height={h} fit="contain" /> : null}
            </Group>
            <Group opacity={openAlpha}>
              {openImg ? <Image image={openImg} x={chestCx - (w * 1.05) / 2} y={chestBottom - oh} width={w * 1.05} height={oh} fit="contain" /> : null}
            </Group>
            <Group opacity={lockAlpha} transform={lockTransform} origin={vec(chestCx, chestBottom - h * 0.5)}>
              {images.padlock ? <Image image={images.padlock} x={chestCx - l.cell * 0.2} y={chestBottom - h * 0.62} width={l.cell * 0.4} height={l.cell * 0.46} fit="contain" /> : null}
            </Group>
            {/* Pearl sockets in an arc over the padlock: the requirement lives on the chest itself. */}
            <Group opacity={socketAlpha}>
              {board.pearls.map((_, k) => {
                const n = board.pearls.length;
                const sx = chestCx + (k - (n - 1) / 2) * sockR * 2.5;
                const sy = sockY + Math.abs(k - (n - 1) / 2) * sockR * 0.7;
                return (
                  <Group key={`sock${k}`} transform={useScaleAt(socketPop[k], sx, sy)}>
                    <Circle cx={sx} cy={sy} r={sockR + 1.5} color={CQ.ink} opacity={0.85} />
                    <Circle cx={sx} cy={sy} r={sockR - 0.5} color={CQ.goldDeep} />
                    {images.pearl ? (
                      <>
                        <Group opacity={0.4}>
                          <Image image={images.pearl} x={sx - sockR * 0.9} y={sy - sockR * 0.9} width={sockR * 1.8} height={sockR * 1.8} fit="contain" />
                        </Group>
                        <Group opacity={socketFill[k]}>
                          <Image image={images.pearl} x={sx - sockR * 1.1} y={sy - sockR * 1.1} width={sockR * 2.2} height={sockR * 2.2} fit="contain" />
                        </Group>
                      </>
                    ) : null}
                  </Group>
                );
              })}
            </Group>
          </Group>,
        );
      }
      const pk = board.pearls.indexOf(i);
      const isGolden = i === board.golden;
      if ((pk >= 0 || isGolden) && (isGolden ? images.golden : images.pearl)) {
        const slot = isGolden ? nP : pk;
        const pimg = (isGolden ? images.golden : images.pearl) as SkImage;
        const s = l.cell * (isGolden ? 0.6 : 0.4);
        const hImg = (s * pimg.height()) / pimg.width();
        const cx = x + l.cell / 2;
        const cy = y + l.cell * 0.52;
        items.push(
          <Group key={`pk${i}`} transform={pickBob[slot]}>
            <Group opacity={pickAlpha[slot]} transform={useScaleAt(pickScale[slot], cx, cy)}>
              <Oval x={cx - s * 0.42} y={cy + hImg * 0.34} width={s * 0.84} height={s * 0.22} color="rgba(31,143,209,0.28)" />
              {images.socket && !isGolden ? (
                <Image image={images.socket} x={cx - l.cell * 0.3} y={cy - l.cell * 0.18} width={l.cell * 0.6} height={l.cell * 0.6} fit="contain" opacity={0.95} />
              ) : null}
              <Image image={pimg} x={cx - s / 2} y={cy - hImg / 2} width={s} height={hImg} fit="contain" />
              {isGolden ? (
                <Group opacity={goldenSpark} transform={useScaleAt(goldenSparkScale, cx + s * 0.34, cy - hImg * 0.36)}>
                  <Path path={sparklePath(cx + s * 0.34, cy - hImg * 0.36, s * 0.22)} color="#ffffff" />
                  <Path path={sparklePath(cx + s * 0.34, cy - hImg * 0.36, s * 0.22)} color={CQ.ink} style="stroke" strokeWidth={2} />
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

  // J12: the shark behind an upright (coral or chest in the row in front) draws through it as a 40% INK silhouette.
  const blockers = useMemo(() => board.tiles.split('').map((t, i) => (t === '#' || i === board.chest ? 1 : 0)), [board]);
  const sharkBehind = useDerivedValue(() => {
    const f = sv.shark.value;
    const c = Math.floor((f.x - l.ax) / l.cell);
    const below = (sharkRow.value + 1) * 5 + c;
    if (c < 0 || c > 4 || below >= blockers.length) return 0;
    return blockers[below] ? 0.4 * f.alpha : 0;
  });
  const inkMatrix = useMemo(() => [0, 0, 0, 0, 0x2f / 255, 0, 0, 0, 0, 0x2f / 255, 0, 0, 0, 0, 0x3a / 255, 0, 0, 0, 1, 0], []);

  // Par buoy (0.A.14): floats beside the chest with the par number, sinks with a gurgle when Par is lost.
  const buoyLeft = chestIdx % 5 === 4;
  const buoyX = chestCx + (buoyLeft ? -1 : 1) * l.cell * 0.46;
  const buoyY = chestBottom - l.cell * 0.2;
  const buoyTf = useDerivedValue(() => {
    const t = sv.fxT.value;
    const e = sv.parSinkT.value < 0 ? 0 : Math.max(0, Math.min(1, (t - sv.parSinkT.value) / 700));
    const bob = Math.sin(t / 620) * 1.6 * (1 - e);
    const tilt = Math.sin(t / 900) * 0.06 + e * (buoyLeft ? -0.5 : 0.5);
    return [{ translateX: buoyX }, { translateY: buoyY + bob + e * e * l.cell * 0.42 }, { rotate: tilt }];
  });
  const buoyA = useDerivedValue(() => {
    if (sv.parBuoy.value <= 0) return 0;
    if (sv.parSinkT.value < 0) return 1;
    const e = (sv.fxT.value - sv.parSinkT.value) / 700;
    return e <= 0 ? 1 : e >= 1 ? 0 : 1 - e * e;
  });
  const buoyText = useDerivedValue(() => `par ${sv.parBuoy.value}`);
  const buoyR = l.cell * 0.15;
  const buoyBody = useMemo(() => {
    const p = Skia.Path.Make();
    p.addOval(Skia.XYWHRect(-buoyR, -buoyR * 0.8, buoyR * 2, buoyR * 1.6));
    return p;
  }, [buoyR]);
  const buoyCap = useMemo(() => {
    const p = Skia.Path.Make();
    p.moveTo(-buoyR * 0.55, -buoyR * 0.55);
    p.lineTo(0, -buoyR * 1.7);
    p.lineTo(buoyR * 0.55, -buoyR * 0.55);
    p.close();
    return p;
  }, [buoyR]);
  const buoyFont = useFont(require('../../../assets/fonts/shark-random-funnyness-2.ttf'), Math.max(10, Math.round(l.cell * 0.19)));
  const buoyTagW = useDerivedValue(() => (buoyFont ? buoyFont.getTextWidth(buoyText.value) + 8 : 0));
  const buoyTagX = useDerivedValue(() => -buoyTagW.value / 2);
  const buoyTagRect = useDerivedValue(() => Skia.RRectXY(Skia.XYWHRect(buoyTagX.value, buoyR * 0.95, buoyTagW.value, l.cell * 0.22), 6, 6));
  const buoyTextX = useDerivedValue(() => buoyTagX.value + 4);

  const sharkNode = (r: number) => (
    <Group key={`shark${r}`} opacity={slotAlpha[r]}>
      <Vertices vertices={vertices} textures={textures} indices={MESH_IDX}>
        <ImageShader image={sharkImage} tx="decal" ty="decal" fm="linear" />
      </Vertices>
    </Group>
  );

  const ghostImg = images.idle;
  const foamImg = images.foam;
  const iconSize = l.cell * 0.32;

  return (
    <Canvas style={{ width: l.cw, height: l.ch }} pointerEvents="none">
      <Group>
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

        {/* Ambient: fish shadows glide under the water, a gull shadow crosses now and then. */}
        <Group opacity={ambientOn}>
          {fishLanes.map((_, i) => (
            <Path key={`fish${i}`} path={fishPaths[i]} color="#0b6f99" opacity={fishAlpha[i]}>
              <BlurMask blur={3} style="normal" />
            </Path>
          ))}
        </Group>

        <Group transform={riseTransform} opacity={riseOpacity}>
          {/* Island rim with its front face; the waterline on the face is the tide read. */}
          <Rect x={l.ax - l.rim + 6} y={faceY - 2} width={l.pw + l.rim * 2 - 12} height={l.face + 2} color={CQ.wetSand} />
          <Rect x={l.ax - l.rim + 6} y={faceY - 2} width={l.pw + l.rim * 2 - 12} height={faceWetH} color={CQ.sand} />
          <Rect x={l.ax - l.rim + 6} y={faceWaterY} width={l.pw + l.rim * 2 - 12} height={faceWaterH} color="rgba(63,193,239,0.92)" />
          <Rect x={l.ax - l.rim + 6} y={faceWaterY} width={l.pw + l.rim * 2 - 12} height={2} color="rgba(255,255,255,0.85)" />
          <Path path={rimPath} color={CQ.sand} />
          <Path path={rimPath} color={CQ.ink} style="stroke" strokeWidth={2} />
          <RoundedRect rect={innerRRect} color={CQ.gold} style="stroke" strokeWidth={6} opacity={ripGlow} blendMode="plus" />

          {/* Current strips: one hand-drawn foam strip per run, scrolling with the flow. */}
          {runs.map((run, ri) => {
            const rot = [-Math.PI / 2, 0, Math.PI / 2, Math.PI][run.dir];
            const rr = Skia.RRectXY(Skia.XYWHRect(-run.len / 2, -run.th / 2, run.len, run.th), run.th / 2, run.th / 2);
            return (
              <Group key={`run${ri}`} opacity={runAlpha[ri]} transform={[{ translateX: run.cx }, { translateY: run.cy }, { rotate: rot }]}>
                <RoundedRect rect={rr} color={CQ.current} />
                {foamImg ? (
                  <Group clip={rr}>
                    <Group transform={runScroll[ri]}>
                      <Rect x={0} y={0} width={(run.len * 3) / foamScale + foamImg.width() * 2} height={foamImg.height()}>
                        <ImageShader image={foamImg} tx="repeat" ty="decal" fm="linear" />
                      </Rect>
                    </Group>
                  </Group>
                ) : null}
                <RoundedRect rect={rr} color={CQ.ink} style="stroke" strokeWidth={2} />
              </Group>
            );
          })}

          {/* Sandbar mounds: the wet sprite (submerged, HIGH) crossfades to the dry one (LOW). */}
          {sands.map((i) => {
            const cx = cellX(i) + l.cell / 2;
            const w = l.cell * 0.98;
            const dry = images.sand;
            const wet = images.sandWet;
            const hd = dry ? (w * dry.height()) / dry.width() : w * 0.7;
            const hw = wet ? (w * wet.height()) / wet.width() : hd;
            const bottom = cellY(i) + l.cell * 0.9;
            return (
              <Group key={`sand${i}`}>
                <Group opacity={shoreAlpha}>
                  <Oval x={cx - w * 0.5} y={bottom - hd * 0.42} width={w} height={hd * 0.5} color={CQ.shoreline} />
                  <Oval x={cx - w * 0.54} y={bottom - hd * 0.46} width={w * 1.08} height={hd * 0.58} color="rgba(255,255,255,0.75)" style="stroke" strokeWidth={2} />
                </Group>
                {wet ? (
                  <Group opacity={wetAlpha}>
                    <Image image={wet} x={cx - w / 2} y={bottom - hw} width={w} height={hw} fit="contain" />
                  </Group>
                ) : null}
                {dry ? (
                  <Group opacity={dryAlpha} transform={sandLift}>
                    <Image image={dry} x={cx - w / 2} y={bottom - hd} width={w} height={hd} fit="contain" />
                  </Group>
                ) : null}
                {dry ? (
                  <Group opacity={dryGhost}>
                    <Image image={dry} x={cx - w / 2} y={bottom - hd - 2} width={w} height={hd} fit="contain" />
                  </Group>
                ) : null}
                {wet ? (
                  <Group opacity={wetGhost}>
                    <Image image={wet} x={cx - w / 2} y={bottom - hw} width={w} height={hw} fit="contain" />
                  </Group>
                ) : null}
              </Group>
            );
          })}

          {/* A chevron on every current tile (0.6 cell, 80%), the run's entry at 1.0 cell; the tempo pulse runs down them. */}
          {images.chevron ? runTiles.map((t, i) => {
            const cx = cellX(t.cell) + l.cell / 2;
            const cy = cellY(t.cell) + l.cell / 2;
            const cw = l.cell * 0.62;
            const chev = images.chevron as SkImage;
            const chh = (cw * chev.height()) / chev.width();
            const rot = [-Math.PI / 2, 0, Math.PI / 2, Math.PI][t.dir];
            return (
              <Group key={`chev${t.cell}`} transform={[{ translateX: cx }, { translateY: cy }, { rotate: rot }]} opacity={tileGlow[i]}>
                <Group transform={tileScale[i]}>
                  <Group transform={t.entry ? chevBobEntry : undefined}>
                    <Image image={chev} x={-cw / 2} y={-chh / 2} width={cw} height={chh} fit="contain" />
                  </Group>
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
        <InkStrip pts={swirlPts} alpha={swirlAlpha} color="#ffffff" head={2} tail={6} taperIn={0.05} />

        {/* Seabed contact shadow + depth tint under the shark. */}
        <Oval rect={depthRect} color="rgba(31,143,209,0.10)" />
        <Oval rect={shadowRect} color="rgba(31,143,209,0.25)">
          <BlurMask blur={6} style="normal" />
        </Oval>

        {/* Riptide ribbon: tapering gold brush with an INK edge. */}
        <InkStrip pts={sv.trail} alpha={trailAlpha} color={CQ.gold} head={0} tail={10} taperIn={0} />

        {/* Route recap: the par route (gold brush) under your route (INK dots). */}
        <InkStrip pts={sv.recapPar} progress={recapK} alpha={recapAlpha} color={CQ.gold} head={7} tail={9} taperIn={0.04} />
        <Group opacity={recapAlpha}>
          <Points points={recapMine} mode="points" color="#ffffff" strokeWidth={7} strokeCap="round" />
          <Points points={recapMine} mode="points" color={CQ.ink} strokeWidth={4} strokeCap="round" />
        </Group>

        {/* Preview path (gold dots marching along the route, INK rim). */}
        <Group opacity={previewOn}>
          <Points points={previewDots} mode="points" color={CQ.ink} strokeWidth={previewInkW} strokeCap="round" />
          <Points points={previewDots} mode="points" color={previewColor} strokeWidth={previewDotW} strokeCap="round" />
        </Group>

        <Group opacity={ambientOn}>
          <Path path={raysPath} color={CQ.gold} opacity={0.14} blendMode="plus">
            <BlurMask blur={4} style="normal" />
          </Path>
        </Group>

        {/* Uprights, y-sorted by row, shark slotted into its row. */}
        {ROWS.slice(0, H).map((r) => (
          <Group key={`row${r}`}>
            <Group transform={rowRise[r]} origin={vec(l.cw / 2, l.ay + (r + 1) * l.cell)} opacity={rowOpacity[r]}>
              {rows[r]}
            </Group>
            {sharkNode(r)}
          </Group>
        ))}
        <Group opacity={sharkBehind} layer={<Paint><ColorMatrix matrix={inkMatrix} /></Paint>}>
          <Vertices vertices={vertices} textures={textures} indices={MESH_IDX}>
            <ImageShader image={sharkImage} tx="decal" ty="decal" fm="linear" />
          </Vertices>
        </Group>

        {/* Par buoy beside the chest. */}
        <Group transform={buoyTf} opacity={buoyA}>
          <Path path={buoyCap} color={CQ.ink} style="stroke" strokeWidth={3} strokeJoin="round" />
          <Path path={buoyCap} color={CQ.gold} />
          <Path path={buoyBody} color={CQ.ink} style="stroke" strokeWidth={3} />
          <Path path={buoyBody} color="#ffffff" />
          <Group clip={buoyBody}>
            <Rect x={-buoyR} y={-buoyR} width={buoyR * 2} height={buoyR * 0.85} color={CQ.coral} />
          </Group>
          {buoyFont ? (
            <>
              <RoundedRect rect={buoyTagRect} color={CQ.ink} />
              <RoundedRect rect={buoyTagRect} color={CQ.cream} style="fill" opacity={1} />
              <RoundedRect rect={buoyTagRect} color={CQ.ink} style="stroke" strokeWidth={2} />
              <Text text={buoyText} x={buoyTextX} y={buoyR * 0.95 + l.cell * 0.18} font={buoyFont} color={CQ.navy} />
            </>
          ) : null}
        </Group>

        {/* Ghost shark at the landing tile (beached flop if the sand dries under it). */}
        {ghostImg ? (
          <Group transform={ghostTransform}>
            <Group opacity={ghostGold}>
              <Image image={ghostImg} rect={ghostRect} fit="contain" />
            </Group>
            <Group opacity={ghostRed} layer={<Paint><ColorMatrix matrix={redTint} /></Paint>}>
              <Image image={ghostImg} rect={ghostRect} fit="contain" />
            </Group>
          </Group>
        ) : null}
        <Circle cx={chestCx} cy={chestBottom - l.cell * 0.4} r={l.cell * 0.34} color="#ffffff" opacity={clearGlint} blendMode="plus">
          <BlurMask blur={8} style="normal" />
        </Circle>

        {/* Path icons: pearl / golden / tide turn / unlock, where they would happen. */}
        {[0, 1, 2, 3, 4].map((k) => (
          <Group key={`icon${k}`} transform={iconTf[k]}>
            <Circle cx={0} cy={0} r={iconSize * 0.62} color={CQ.ink} opacity={previewOn} />
            <Circle cx={0} cy={0} r={iconSize * 0.62 - 2} color="#fff8e4" opacity={previewOn} />
            {images.pearl ? (
              <Group opacity={iconKindA[0][k]}>
                <Image image={images.pearl} x={-iconSize / 2} y={-iconSize / 2} width={iconSize} height={iconSize} fit="contain" />
              </Group>
            ) : null}
            {images.golden ? (
              <Group opacity={iconKindA[1][k]}>
                <Image image={images.golden} x={-iconSize / 2} y={-iconSize / 2} width={iconSize} height={iconSize} fit="contain" />
              </Group>
            ) : null}
            {images.sandWet ? (
              <Group opacity={iconKindA[2][k]}>
                <Image image={images.sandWet} x={-iconSize / 2} y={-iconSize / 2} width={iconSize} height={iconSize} fit="contain" />
              </Group>
            ) : null}
            {images.padlock ? (
              <Group opacity={iconKindA[3][k]}>
                <Image image={images.padlock} x={-iconSize / 2} y={-iconSize / 2} width={iconSize} height={iconSize} fit="contain" />
              </Group>
            ) : null}
          </Group>
        ))}

        {/* Wrong-turn X (stall card), tide sweep wave, glance-tour ring. */}
        <InkStrip pts={wrongPts} alpha={wrongAlpha} color={CQ.coral} head={9} tail={6} taperIn={0.08} />
        <Rect rect={sweepBand} color="#ffffff" opacity={sweepAlpha} blendMode="softLight" />
        <InkStrip pts={sweepPts} alpha={sweepAlpha} color="#ffffff" head={8} tail={8} taperIn={0.05} />
        <InkStrip pts={tourRingPts} alpha={tourRingAlpha} color={CQ.gold} head={6} tail={2} taperIn={0.05} />

        <Path path={gullPath} color="#0b6f99" opacity={gullAlpha}>
          <BlurMask blur={4} style="normal" />
        </Path>

        {/* Shield dome and the tide warning pip ride the shark. */}
        {images.bubble ? (
          <Group opacity={shieldAlpha}>
            <Image image={images.bubble} rect={shieldRect} fit="contain" />
          </Group>
        ) : null}
        <Group transform={pipXY} opacity={pipAlpha}>
          <Circle cx={0} cy={0} r={l.cell * 0.24} color={CQ.ink} />
          <Circle cx={0} cy={0} r={l.cell * 0.24 - 2} color={CQ.gold} />
          <Group opacity={pipLowA}>
            <Path path={moundPath(0, 3, l.cell * 0.17)} color={CQ.sand} />
            <Path path={moundPath(0, 3, l.cell * 0.17)} color={CQ.ink} style="stroke" strokeWidth={2} />
          </Group>
          <Group opacity={pipHighA}>
            <Path path={wavePath(0, 0, l.cell * 0.17)} color="#2fb6ec" />
            <Path path={wavePath(0, 0, l.cell * 0.17)} color={CQ.ink} style="stroke" strokeWidth={2} />
          </Group>
        </Group>

        {/* Banners. */}
        {font ? (
          <Group transform={bannerTransform} opacity={bannerOpacity}>
            <Text text={bannerText} x={bannerX} y={bannerY + 14} font={font} color={CQ.ink} style="stroke" strokeWidth={7} strokeJoin="round" />
            <Text text={bannerText} x={bannerX} y={bannerY + 14} font={font} color={bannerFill} />
          </Group>
        ) : null}
        <RoundedRect rect={poolRect} color="#808080" blendMode="saturation" opacity={desatK} />
      </Group>
    </Canvas>
  );
}

function useScaleAt(scale: SharedValue<number>, cx: number, cy: number) {
  return useDerivedValue(() => [
    { translateX: cx }, { translateY: cy }, { scale: scale.value }, { translateX: -cx }, { translateY: -cy },
  ]);
}

function useRotAt(rot: SharedValue<number>, cx: number, cy: number) {
  return useDerivedValue(() => [
    { translateX: cx }, { translateY: cy }, { skewX: rot.value }, { translateX: -cx }, { translateY: -cy },
  ]);
}

function useBob(bob: SharedValue<number>) {
  return useDerivedValue(() => [{ translateY: bob.value }]);
}

function moundPath(cx: number, cy: number, s: number) {
  const p = Skia.Path.Make();
  p.moveTo(cx - s, cy + s * 0.45);
  p.cubicTo(cx - s * 0.6, cy - s * 0.6, cx + s * 0.6, cy - s * 0.6, cx + s, cy + s * 0.45);
  p.close();
  return p;
}

function wavePath(cx: number, cy: number, s: number) {
  const p = Skia.Path.Make();
  p.moveTo(cx - s, cy + s * 0.3);
  p.cubicTo(cx - s * 0.5, cy - s * 0.7, cx + s * 0.1, cy - s * 0.6, cx + s * 0.2, cy);
  p.cubicTo(cx + s * 0.4, cy + s * 0.3, cx + s * 0.8, cy + s * 0.1, cx + s, cy - s * 0.1);
  p.lineTo(cx + s, cy + s * 0.6);
  p.lineTo(cx - s, cy + s * 0.6);
  p.close();
  return p;
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
