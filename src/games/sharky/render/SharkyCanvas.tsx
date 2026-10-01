/**
 * SharkyCanvas: the Tide Run world in one Skia canvas on the UI thread.
 *
 * Layers (back to front): sky band (Alex-style lagoon art, mirror-tiled),
 * graded water, toon caustics + flat god rays (background only), coral floor
 * strip (0.5x), rival silhouettes, rings (back half), world Atlas (every
 * pickup and hazard in one draw), pylons and gates, the shark (Alex's swim
 * pose with a rigid head and a rear-only tail mesh, pose swaps), rings (front
 * half), bubbles, near strip (40% alpha, floor band only), edge badges.
 *
 * Nothing here allocates React state per frame: a single derived "plan" is
 * recomputed from the sim each frame and fed to fixed-size Skia buffers.
 * The component is memoized; props never change during a run.
 */

import React, { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import {
  Atlas,
  Canvas,
  Circle,
  Fill,
  Group,
  Image as SkImage,
  ImageShader,
  LinearGradient,
  Path,
  Rect,
  RoundedRect,
  Shader,
  Skia,
  Text as SkText,
  Vertices,
  rect,
  useFont,
  useImage,
  useRSXformBuffer,
  useRectBuffer,
  vec,
  type SkFont,
  type SkImage as SkImageType,
} from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { useSpriteAtlas } from '../../../gamekit/fx/SpriteAtlas';
import {
  E_BOX, E_COIN, E_GATE, E_JELLY, E_PUFFER, E_PYLON, E_RING, E_SCATTER, E_SHIELD, E_TOKEN, E_TORPEDO,
  ENT_CAP, F_BADGE, F_DONE, F_HIT, FLOOR_Y, PYLON_W, G_RIDE, G_SPLIT, G_FINISH, JELLY_R, PH_POCKET, PH_WIPE, PH_DONE,
  PUFF_R0, PUFF_R1, RING_R, SURFACE_Y, TORP_W, aheadU, anchorX, hazardSpan, jellyY, pufferR,
  type SimState,
} from '../sim/core';
import { AMB_N, type Ambient, type RivalSlot } from '../useSharkyEngine';
import { VIEW_H, VIEW_W, type SharkyLayout } from './view';
import { SHARKY_ART } from '../assets';

// ---------------------------------------------------------------------------
// Palette (bright world: blue, white, gold; coral is danger only)
// ---------------------------------------------------------------------------
export const INK = '#23384f';
export const CORAL = '#ff6b57';
export const GOLD = '#ffc233';
const ZONES = [
  ['#8ce8f2', '#34bfdc', '#1aa3c8'], // lagoon aqua
  ['#7ae3ea', '#26b4cc', '#128fb3'], // midway turquoise
  ['#86e6e0', '#2ab3bf', '#1592a8'], // shipwreck sunlit teal
  ['#9af2ff', '#3cc8ee', '#1a9fd6'], // storm surge bright cyan
];

// Atlas sprite indices.
const SPR_COIN = 0;
const SPR_TOKEN_G = 1;
const SPR_BOX = 2;
const SPR_JELLY = 3;
const SPR_PUFF = 4;
const SPR_PUFFED = 5;
const SPR_BOAT = 6;
const SPR_BUBBLE = 7;
const SPR_TOKEN_O = 8;
const SPR_TOKEN_B = 9;
const SPR_SEG = 10;
const SPR_CAP = 11;
const SPR_POLE = 12;

const SLOTS = 176; // atlas draw slots per frame
const PSTRIDE = 7; // sprite, cx, cy, scale(u per atlas px), rot, alpha, flip
const PYLONS = 6;
const RINGS = 4;
const BADGES = 6;
const RIVAL_N = 3;

const SHARK_W = 150;

// Tail mesh: 12 x 4 quads over the swim pose; only the rear 55% moves.
const MESH_C = 12;
const MESH_R = 4;

export interface SharkyCanvasProps {
  layout: SharkyLayout;
  sim: SharedValue<SimState>;
  rivals: SharedValue<RivalSlot[]>;
  ambient: SharedValue<Ambient>;
  tick: SharedValue<number>;
  alpha: SharedValue<number>;
  /** Rival tint colours (player colours). */
  rivalColors: string[];
  reducedMotion: boolean;
  /** Perf tier: 0 full, 1 lite (no caustic shader), 2 min (also no far reef, rays, near strip). */
  quality?: number;
}

function lerp(a: number, b: number, t: number): number {
  'worklet';
  return a + (b - a) * t;
}

function clamp01(v: number): number {
  'worklet';
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Render-time shark state shared by several layers. */
interface SharkPose {
  x: number;
  y: number;
  tilt: number;
  sx: number;
  sy: number;
  alpha: number;
  pose: number; // 0 swim, 1 dash/chomp, 2 dizzy, 3 bonked, 4 cheer
  t: number;
  hold: number;
}

function sharkPose(s: SimState, a: number): SharkPose {
  'worklet';
  const y = lerp(s.py, s.y, a) / 256;
  let x = anchorX(s);
  // Horizontal stumble: slide back 30u, recover with the speed ramp.
  if (s.stumble > 0) {
    const k = s.stumble > 33 ? 1 : s.stumble / 33;
    x -= 30 * k;
  }
  const vy = s.vy / 256;
  let tilt = vy / 1400;
  if (tilt < -0.45) tilt = -0.45;
  if (tilt > 0.55) tilt = 0.55;
  if (s.float > 0 || s.phase === PH_POCKET) tilt *= 0.3;
  let sx = 1;
  let sy = 1;
  const sincePress = s.step - s.lastPress;
  if (s.holding && sincePress < 8) {
    // Press squash 1.15 / 0.88, springing back.
    const k = 1 - sincePress / 8;
    sx = 1 - 0.12 * k;
    sy = 1 + 0.15 * k;
    sx = 1 + 0.15 * k * 0.6;
    sy = 1 - 0.12 * k;
  }
  if (s.dash > 0) {
    sx = 1.12;
    sy = 0.92;
  }
  let alpha = 1;
  if (s.iframes > 0 && s.reviveShield === 0 && Math.floor(s.iframes / 3) % 2 === 1) alpha = 0.45;
  let pose = 0;
  if (s.phase === PH_WIPE || (s.phase === PH_DONE && s.hearts <= 0)) pose = 3;
  else if (s.phase === PH_DONE) pose = 4;
  else if (s.dash > 0 || s.skimTimer > 50 || (s.stChomps > 0 && s.chainTimer > 105 && s.frenzy === 0 && false)) pose = 1;
  else if (s.iframes > 30 && s.reviveShield === 0) pose = 2;
  return { x, y, tilt, sx, sy, alpha, pose, t: (s.worldT + a) / 60, hold: s.holding };
}

export const SharkyCanvas = React.memo(function SharkyCanvas({
  layout, sim, rivals, ambient, tick, alpha, rivalColors, reducedMotion, quality = 0,
}: SharkyCanvasProps) {
  const L = layout;
  // --- art ------------------------------------------------------------------
  const coin = useImage(SHARKY_ART.coin);
  const tokenG = useImage(SHARKY_ART.tokenGold);
  const tokenO = useImage(SHARKY_ART.tokenOrange);
  const tokenB = useImage(SHARKY_ART.tokenBlue);
  const box = useImage(SHARKY_ART.prizeBox);
  const jelly = useImage(SHARKY_ART.jelly);
  const puff = useImage(SHARKY_ART.puffer);
  const puffed = useImage(SHARKY_ART.pufferPuffed);
  const boat = useImage(SHARKY_ART.boat);
  const seg = useImage(SHARKY_ART.pylonSegment);
  const cap = useImage(SHARKY_ART.pylonCap);
  const pole = useImage(SHARKY_ART.gatePole);
  const bubble = useImage(SHARKY_ART.bubble);
  const ringImg = useImage(SHARKY_ART.ring);
  const swim = useImage(SHARKY_ART.swim);
  const dashImg = useImage(SHARKY_ART.dash);
  const dizzy = useImage(SHARKY_ART.dizzy);
  const bonked = useImage(SHARKY_ART.bonked);
  const cheer = useImage(SHARKY_ART.cheer);
  const sky = useImage(SHARKY_ART.sky);
  const reefMid = useImage(SHARKY_ART.reefMid);
  const reefNear = useImage(SHARKY_ART.nearKelp);
  const farReef = useImage(SHARKY_ART.farReef);
  const tideGate = useImage(SHARKY_ART.tideGate);
  const rideGate = useImage(SHARKY_ART.rideGate);
  const font = useFont(SHARKY_ART.font, 44);

  const atlas = useSpriteAtlas([coin, tokenG, box, jelly, puff, puffed, boat, bubble, tokenO, tokenB, seg, cap, pole], { cell: 256 });
  const rects = useMemo(() => {
    if (!atlas) return [] as number[];
    const out: number[] = [];
    atlas.rects.forEach((r) => out.push(r.x, r.y, r.width, r.height));
    return out;
  }, [atlas]);

  // --- per-frame plan -------------------------------------------------------
  const plan = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    const a = alpha.value;
    const out: number[] = new Array(SLOTS * PSTRIDE).fill(0);
    if (rects.length === 0) return out;
    const dist = lerp(s.pdist, s.dist, a) / 256;
    const anc = anchorX(s);
    const t = (s.worldT + a) / 60;
    const frenzy = s.frenzy > 0;
    let n = 0;
    const put = (spr: number, cx: number, cy: number, w: number, rot: number, al: number) => {
      if (n >= SLOTS) return;
      const o = n * PSTRIDE;
      const rw = rects[spr * 4 + 2];
      out[o] = spr;
      out[o + 1] = cx;
      out[o + 2] = cy;
      out[o + 3] = rw > 0 ? w / rw : 0;
      out[o + 4] = rot;
      out[o + 5] = al;
      out[o + 6] = 1;
      n++;
    };
    const floatPhase = s.float > 0;
    // Ambient bubbles and sand puffs first (they sit behind the gameplay sprites).
    const am = ambient.value;
    for (let i = 0; i < AMB_N; i++) {
      if (am.life[i] <= 0) continue;
      const k = am.life[i] / am.max[i];
      const vx = anc + (am.x[i] - dist);
      if (vx < -40 || vx > VIEW_W + 40) continue;
      if (am.kind[i] === 3) put(SPR_COIN, vx, am.y[i], am.size[i] * k, am.life[i] * 9, 1);
      else if (am.kind[i] === 1) put(SPR_BUBBLE, vx, am.y[i], am.size[i] * (1.6 - k * 0.6), 0, 1);
      else put(SPR_BUBBLE, vx, am.y[i], am.size[i] * (am.kind[i] === 0 ? 0.6 + 0.4 * k : 1), 0, 1);
    }
    for (let i = 0; i < ENT_CAP; i++) {
      const et = s.et[i];
      if (et === 0 || et === E_RING) continue;
      const ex = lerp(s.epx[i], s.ex[i], a);
      const vx = anc + (ex - dist);
      if (vx < -200 || vx > VIEW_W + 200) continue;
      const hazardAlpha = floatPhase ? 0.5 : 1;
      if (et === E_PYLON) {
        // Stacked coaster segments with a striped cap at each gap edge.
        const shake = (s.ef[i] & F_HIT) && s.etm[i] < 8 ? Math.sin(s.etm[i] * 2.2) * 3 : 0;
        const cx = vx + PYLON_W / 2 + shake;
        const half = s.ep1[i] / 2;
        const top = s.ey[i] - half;
        const bot = s.ey[i] + half;
        const capW = 124;
        const capH = capW * rects[SPR_CAP * 4 + 3] / Math.max(1, rects[SPR_CAP * 4 + 2]);
        const segW = PYLON_W;
        const segH = segW * rects[SPR_SEG * 4 + 3] / Math.max(1, rects[SPR_SEG * 4 + 2]);
        for (let y = top - capH - segH / 2 + 10; y + segH / 2 > SURFACE_Y - 80; y -= segH - 6) put(SPR_SEG, cx, y, segW, 0, 1);
        for (let y = bot + capH + segH / 2 - 10; y - segH / 2 < FLOOR_Y + 80; y += segH - 6) put(SPR_SEG, cx, y, segW, 0, 1);
        put(SPR_CAP, cx, top - capH / 2, capW, 0, 1);
        put(SPR_CAP, cx, bot + capH / 2, capW, Math.PI, 1);
        continue;
      }
      if (et === E_GATE) {
        if (s.ep1[i] === G_SPLIT) continue;
        const big = s.ep1[i] === G_RIDE || s.ep1[i] === G_FINISH;
        if (!big) continue; // Tide Gates are the bubble arch + bunting (Gates layer).
        const h = 360;
        const w = h * rects[SPR_POLE * 4 + 2] / Math.max(1, rects[SPR_POLE * 4 + 3]);
        put(SPR_POLE, vx, FLOOR_Y + 10 - h / 2, w, 0, 1);
        put(SPR_POLE, vx, SURFACE_Y - 10 + h / 2, w, Math.PI, 1);
        continue;
      }
      if (et === E_COIN) {
        const glint = 1 + 0.06 * Math.sin(t * 6.283 + i);
        put(SPR_COIN, vx, s.ey[i], (frenzy ? 62 : 48) * glint, 0, 1);
      } else if (et === E_SCATTER) {
        const life = s.etm[i] / 90;
        put(SPR_COIN, vx, lerp(s.epy[i], s.ey[i], a), 40, Math.sin(t * 14 + i) * 0.6, life > 0.75 ? (Math.floor(t * 16) % 2 ? 1 : 0.4) : 1);
      } else if (et === E_TOKEN) {
        const flip = Math.abs(Math.cos(t * 3 + i));
        put(s.ep1[i] === 1 ? SPR_TOKEN_O : s.ep1[i] === 2 ? SPR_TOKEN_B : SPR_TOKEN_G, vx, s.ey[i] + Math.sin(t * 3) * 6, 70 * (0.75 + 0.25 * flip), 0, 1);
      } else if (et === E_BOX) {
        if (s.ef[i] & F_DONE) {
          const k = s.etm[i];
          if (k < 8) put(SPR_BOX, vx, s.ey[i], 84 * (1 - k / 10), 0, 1 - k / 8);
        } else put(SPR_BOX, vx, s.ey[i] + Math.sin(t * 2.4 + i) * 5, 84, Math.sin(t * 2 + i) * 0.06, 1);
      } else if (et === E_SHIELD) {
        put(SPR_BUBBLE, vx, s.ey[i] + Math.sin(t * 2.2) * 8, 90 * (1 + 0.05 * Math.sin(t * 5)), 0, 0.9);
      } else if (et === E_JELLY) {
        const jy = lerp(s.epy[i], jellyY(s, i), a);
        const hit = (s.ef[i] & F_HIT) && s.etm[i] < 20;
        put(SPR_JELLY, vx + (hit ? 20 * (1 - s.etm[i] / 20) : 0), jy, 108, Math.sin(t * 7.5 + i) * 0.07, hazardAlpha * (hit && Math.floor(t * 20) % 2 ? 0.6 : 1));
      } else if (et === E_PUFFER) {
        const st = s.est[i];
        if (st === 5) {
          const k = s.etm[i];
          if (k < 10) put(SPR_PUFFED, vx, s.ey[i], 150 * (1 - k / 12), k * 0.3, 1 - k / 10);
          continue;
        }
        const r = pufferR(s, i);
        const wig = st === 1 ? Math.sin(t * 75) * 0.14 : 0;
        const spin = st === 4 ? s.etm[i] * 0.35 : 0;
        const big = st >= 2 && st !== 4 && r > (PUFF_R0 + PUFF_R1) / 2;
        put(big ? SPR_PUFFED : SPR_PUFF, vx, s.ey[i], r * 2 * (big ? 1.32 : 1.45), wig + spin, hazardAlpha);
      } else if (et === E_TORPEDO) {
        const st = s.est[i];
        if (st === 0) continue;
        const bob = Math.sin(t * 9) * 4;
        const spin = st === 4 ? s.etm[i] * 0.25 : 0;
        put(SPR_BOAT, vx, lerp(s.epy[i], s.ey[i], a) + bob, TORP_W + 10, spin, hazardAlpha);
      }
    }
    return out;
  });

  const sprites = useRectBuffer(SLOTS, (r, i) => {
    'worklet';
    const p = plan.value;
    const spr = p[i * PSTRIDE];
    if (rects.length === 0) {
      r.setXYWH(0, 0, 0, 0);
      return;
    }
    r.setXYWH(rects[spr * 4], rects[spr * 4 + 1], rects[spr * 4 + 2], rects[spr * 4 + 3]);
  });
  const transforms = useRSXformBuffer(SLOTS, (x, i) => {
    'worklet';
    const p = plan.value;
    const o = i * PSTRIDE;
    const sc = p[o + 3];
    if (sc === 0 || rects.length === 0) {
      x.set(0, 0, -9999, -9999);
      return;
    }
    const spr = p[o];
    const w = rects[spr * 4 + 2];
    const h = rects[spr * 4 + 3];
    const rot = p[o + 4];
    const c = Math.cos(rot) * sc;
    const sn = Math.sin(rot) * sc;
    const tx = p[o + 1] - (c * w * 0.5 - sn * h * 0.5);
    const ty = p[o + 2] - (sn * w * 0.5 + c * h * 0.5);
    x.set(c, sn, tx, ty);
  });
  // Float phases hazards through: the whole world layer drops to 55% (nothing scores then).
  const worldAlpha = useDerivedValue(() => {
    tick.value;
    return sim.value.float > 0 ? 0.55 : 1;
  });

  // --- camera (world group) -------------------------------------------------
  const worldTransform = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    const y = lerp(s.py, s.y, alpha.value) / 256;
    const follow = reducedMotion ? 0 : (500 - y) * 0.06;
    return [{ translateX: L.offX }, { translateY: L.offY + follow * L.k }, { scale: L.k }];
  });

  // --- zone grading ---------------------------------------------------------
  const zone = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    let z = s.sprint < 0 ? 0 : s.sprint;
    // The next sprint is already queued in a pocket: grade across it.
    if (s.phase === PH_POCKET) z = Math.max(0, s.sprint - 1) + Math.min(1, s.phaseSteps / 48);
    return Math.min(3, z);
  });
  const waterColors = useDerivedValue(() => {
    const z = zone.value;
    const i0 = Math.floor(z);
    const i1 = Math.min(3, i0 + 1);
    const f = z - i0;
    const mix = (a: string, b: string) => {
      const pa = parseInt(a.slice(1), 16);
      const pb = parseInt(b.slice(1), 16);
      const r = Math.round(lerp((pa >> 16) & 255, (pb >> 16) & 255, f));
      const g = Math.round(lerp((pa >> 8) & 255, (pb >> 8) & 255, f));
      const bl = Math.round(lerp(pa & 255, pb & 255, f));
      return `rgb(${r},${g},${bl})`;
    };
    return [mix(ZONES[i0][0], ZONES[i1][0]), mix(ZONES[i0][1], ZONES[i1][1]), mix(ZONES[i0][2], ZONES[i1][2])];
  });

  // --- parallax -------------------------------------------------------------
  const SKY_TILE = useMemo(() => {
    // Sky band art (mirror-tiled so it scrolls forever), in field pt.
    // sk_sky_band: 2048 x 768. Its painted lagoon water spans rows 404-480, so
    // row 470 lands on the surface line and the skyline fills the band above.
    const band = Math.max(1, L.offY + SURFACE_Y * L.k + 6);
    const R = 470 / 768;
    const hPt = Math.max(band / R, 160);
    const wPt = hPt * (2048 / 768);
    return { w: wPt, h: hPt, y: band - hPt * R };
  }, [L]);
  const skyX = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    const d = lerp(s.pdist, s.dist, alpha.value) / 256;
    const px = (d * 0.06 * L.k) % (SKY_TILE.w * 2);
    return [{ translateX: -px }];
  });
  const FAR = { w: 1020, h: 680 };
  const farX = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    const d = lerp(s.pdist, s.dist, alpha.value) / 256;
    return [{ translateX: -((d * 0.2) % (FAR.w * 2)) }];
  });
  const REEF = { w: 620, h: 310 };
  const reefX = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    const d = lerp(s.pdist, s.dist, alpha.value) / 256;
    return [{ translateX: -((d * 0.5) % REEF.w) }];
  });
  const NEAR = { w: 880, h: 330 };
  const nearX = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    const d = lerp(s.pdist, s.dist, alpha.value) / 256;
    return [{ translateX: -((d * 1.15) % NEAR.w) }];
  });

  // --- toon caustics (background only) ---------------------------------------
  const caustic = useMemo(() => Skia.RuntimeEffect.Make(CAUSTIC_SKSL), []);
  const causticUniforms = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    const d = lerp(s.pdist, s.dist, alpha.value) / 256;
    const sf = (s.speed - s.speedBase) / Math.max(1, s.speedCap - s.speedBase);
    return { t: (s.worldT + alpha.value) / 60, off: d * 0.2, strength: 0.16 * (1 - 0.4 * sf) };
  });
  const rays = useDerivedValue(() => {
    tick.value;
    const t = (sim.value.worldT + alpha.value) / 60;
    return Math.sin(t * 0.94) * 0.07;
  });
  const rayTransform = useDerivedValue(() => [{ rotate: rays.value }]);
  const rayPaths = useMemo(() => {
    const out: ReturnType<typeof Skia.Path.Make>[] = [];
    const xs = [120, 360, 610, 840];
    const ws = [70, 110, 60, 90];
    xs.forEach((x, i) => {
      const p = Skia.Path.Make();
      p.moveTo(x - ws[i] * 0.4, SURFACE_Y);
      p.lineTo(x + ws[i] * 0.4, SURFACE_Y);
      p.lineTo(x + ws[i] * 1.6 - 120, 780);
      p.lineTo(x - ws[i] * 1.2 - 120, 780);
      p.close();
      out.push(p);
    });
    return out;
  }, []);

  // --- surface line ---------------------------------------------------------
  const surfacePath = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    const d = lerp(s.pdist, s.dist, alpha.value) / 256;
    const t = (s.worldT + alpha.value) / 60;
    const p = Skia.Path.Make();
    p.moveTo(-40, -600);
    for (let x = -40; x <= VIEW_W + 40; x += 24) {
      const y = SURFACE_Y + Math.sin((x + d) * 0.03 + t * 2.2) * 6 + Math.sin((x + d) * 0.011 - t) * 4;
      p.lineTo(x, y);
    }
    p.lineTo(VIEW_W + 40, -600);
    p.close();
    return p;
  });

  const skyTiles = useMemo(() => [0, 1, 2, 3], []);

  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* Water body fills the whole field; bands draw over it. */}
      <Rect x={0} y={0} width={L.w} height={L.h}>
        <LinearGradient start={vec(0, L.offY)} end={vec(0, L.offY + FLOOR_Y * L.k)} colors={waterColors} />
      </Rect>

      <Group transform={worldTransform}>
        {/* God rays and caustics: far layer only, never over gameplay sprites. */}
        {/* Quality tiers never unmount Skia nodes (removing a node with live
            derived props crashed Skia 1.5 on the UI thread); they zero sizes instead. */}
        <Group transform={rayTransform} origin={vec(480, SURFACE_Y)} opacity={quality < 2 ? 1 : 0}>
          {rayPaths.map((p, i) => (
            <Path key={i} path={p} color="#ffffff" opacity={0.07 + (i % 2) * 0.03} />
          ))}
        </Group>
        {caustic ? (
          <Rect x={-60} y={SURFACE_Y} width={quality === 0 ? VIEW_W + 120 : 0} height={quality === 0 ? 560 : 0}>
            <Shader source={caustic} uniforms={causticUniforms} />
          </Rect>
        ) : null}

        {/* Far layer (0.2x): the sunken carnival reef, low contrast behind everything. */}
        {farReef ? (
          <Group transform={farX} opacity={0.42}>
            {[0, 1, 2, 3].map((k) => (
              <Group key={k} transform={k % 2 === 1 ? [{ translateX: -60 + (k + 1) * FAR.w }, { scaleX: -1 }] : [{ translateX: -60 + k * FAR.w }]}>
                <SkImage image={farReef} x={0} y={FLOOR_Y + 30 - FAR.h} width={quality < 2 ? FAR.w : 0} height={quality < 2 ? FAR.h : 0} />
              </Group>
            ))}
          </Group>
        ) : null}

        {/* Coral floor strip (mid layer, 0.5x), bottom band only. */}
        <Group transform={reefX}>
          {[0, 1, 2, 3].map((k) => (
            reefMid ? <SkImage key={k} image={reefMid} x={-60 + k * REEF.w} y={FLOOR_Y + 40 - REEF.h} width={REEF.w} height={REEF.h} opacity={0.85} /> : null
          ))}
        </Group>

        {/* Sand floor */}
        <Rect x={-200} y={FLOOR_Y - 4} width={VIEW_W + 400} height={1400}>
          <LinearGradient start={vec(0, FLOOR_Y)} end={vec(0, FLOOR_Y + 300)} colors={['#f7e3b0', '#ecc987']} />
        </Rect>
        <Rect x={-200} y={FLOOR_Y - 6} width={VIEW_W + 400} height={5} color={INK} opacity={0.55} />

        <Rivals sim={sim} rivals={rivals} tick={tick} alpha={alpha} swim={swim} colors={rivalColors} />
        <Gates sim={sim} tick={tick} alpha={alpha} font={font} tideArt={tideGate} rideArt={rideGate} />
        <Rings sim={sim} tick={tick} alpha={alpha} image={ringImg} half="back" />

        {atlas ? (
          <Group opacity={worldAlpha}>
            <Atlas image={atlas.image} sprites={sprites} transforms={transforms} />
          </Group>
        ) : null}

        <Shark sim={sim} tick={tick} alpha={alpha} swim={swim} dash={dashImg} dizzy={dizzy} bonked={bonked} cheer={cheer} bubble={bubble} />
        <Rings sim={sim} tick={tick} alpha={alpha} image={ringImg} half="front" />
        <FrenzyPot sim={sim} tick={tick} alpha={alpha} font={font} />

        {/* Near strip: 40% alpha (25% in Storm Surge), floor band only. */}
        <Group transform={nearX} opacity={0.5}>
          {[0, 1, 2, 3].map((k) => (
            reefNear ? (
              <Group key={k} transform={k % 2 === 1 ? [{ translateX: -60 + (k + 1) * NEAR.w }, { scaleX: -1 }] : [{ translateX: -60 + k * NEAR.w }]}>
                <SkImage image={reefNear} x={0} y={FLOOR_Y + 110 - NEAR.h} width={quality < 2 ? NEAR.w : 0} height={quality < 2 ? NEAR.h : 0} />
              </Group>
            ) : null
          ))}
        </Group>

        <Badges sim={sim} tick={tick} alpha={alpha} font={font} />
      </Group>

      {/* Sky band over the water top: Alex-style lagoon skyline, mirror-tiled. */}
      <Group clip={rect(0, 0, L.w, 1)}>
        <Rect x={0} y={0} width={0} height={0} color="transparent" />
      </Group>
      <SkyBand sim={sim} tick={tick} alpha={alpha} sky={sky} layout={L} tile={SKY_TILE} skyX={skyX} surface={surfacePath} tiles={skyTiles} />
    </Canvas>
  );
});

// ---------------------------------------------------------------------------
// Sky band: art clipped by the animated water surface line.
// ---------------------------------------------------------------------------
const SkyBand = React.memo(function SkyBand({ sky, layout: L, tile, skyX, surface, tiles }: {
  sim: SharedValue<SimState>; tick: SharedValue<number>; alpha: SharedValue<number>;
  sky: SkImageType | null; layout: SharkyLayout; tile: { w: number; h: number; y: number };
  skyX: SharedValue<{ translateX: number }[]>; surface: SharedValue<ReturnType<typeof Skia.Path.Make>>; tiles: number[];
}) {
  const clipPath = useDerivedValue(() => {
    const p = surface.value.copy();
    p.transform(Skia.Matrix().translate(L.offX, L.offY).scale(L.k, L.k));
    return p;
  });
  const lip = useDerivedValue(() => clipPath.value);
  return (
    <Group>
      <Group clip={clipPath}>
        <Rect x={0} y={0} width={L.w} height={tile.y + tile.h}>
          <LinearGradient start={vec(0, 0)} end={vec(0, tile.y + tile.h * 0.8)} colors={['#6cc9ff', '#bfe9ff', '#e8f8ff']} />
        </Rect>
        <Group transform={skyX}>
          {sky ? tiles.map((k) => (
            <Group key={k} transform={k % 2 === 1 ? [{ translateX: (k + 1) * tile.w }, { scaleX: -1 }] : [{ translateX: k * tile.w }]}>
              <SkImage image={sky} x={0} y={tile.y} width={tile.w} height={tile.h} fit="fill" />
            </Group>
          )) : null}
        </Group>
      </Group>
      <Path path={lip} style="stroke" strokeWidth={Math.max(2, 3 * L.k * 1.6)} color="#ffffff" opacity={0.95} />
    </Group>
  );
});

// ---------------------------------------------------------------------------
// Shark: Alex's swim pose, rigid head + rear tail mesh, pose swaps.
// ---------------------------------------------------------------------------
const MESH_TEX_W = 576;
const MESH_TEX_H = 331;
const MESH_INDICES = (() => {
  const idx: number[] = [];
  for (let r = 0; r < MESH_R; r++) {
    for (let c = 0; c < MESH_C; c++) {
      const a = r * (MESH_C + 1) + c;
      const b = a + 1;
      const d = a + (MESH_C + 1);
      const e = d + 1;
      idx.push(a, b, d, b, e, d);
    }
  }
  return idx;
})();

const Shark = React.memo(function Shark({ sim, tick, alpha, swim, dash, dizzy, bonked, cheer, bubble }: {
  sim: SharedValue<SimState>; tick: SharedValue<number>; alpha: SharedValue<number>;
  swim: SkImageType | null; dash: SkImageType | null; dizzy: SkImageType | null; bonked: SkImageType | null;
  cheer: SkImageType | null; bubble: SkImageType | null;
}) {
  const pose = useDerivedValue(() => {
    tick.value;
    return sharkPose(sim.value, alpha.value);
  });
  const transform = useDerivedValue(() => {
    const p = pose.value;
    const s = sim.value;
    let spin = 0;
    let lift = 0;
    let scale = 1;
    if (p.pose === 3) {
      // Wipeout: 540 deg spin while floating up 120u over 900ms.
      const k = Math.min(1, s.phaseSteps / 54);
      const e = 1 - (1 - k) * (1 - k);
      spin = e * Math.PI * 3;
      lift = -120 * e;
      scale = 1 + 0.1 * e;
    }
    if (p.pose === 4) {
      const k = Math.min(1, s.phaseSteps / 30);
      lift = -40 * Math.sin(k * Math.PI);
    }
    return [
      { translateX: p.x },
      { translateY: p.y + lift },
      { rotate: p.tilt + spin },
      { scaleX: p.sx * scale },
      { scaleY: p.sy * scale },
    ];
  });
  const vertices = useDerivedValue(() => {
    const p = pose.value;
    const pts = [];
    const amp = p.hold ? 6 : 4;
    const f = p.hold ? 3.2 : 2.2;
    const h = (SHARK_W * MESH_TEX_H) / MESH_TEX_W;
    for (let r = 0; r <= MESH_R; r++) {
      for (let c = 0; c <= MESH_C; c++) {
        const x = -SHARK_W / 2 + (SHARK_W * c) / MESH_C;
        let y = -h / 2 + (h * r) / MESH_R;
        // Rear 55% only (columns 0..6 from the tail, the image faces right).
        if (c < 7) {
          const w = ((6.6 - c) / 6.6) * ((6.6 - c) / 6.6);
          y += amp * w * Math.sin(2 * Math.PI * f * p.t - (12 - c) * 0.55);
        }
        pts.push(vec(x, y));
      }
    }
    return pts;
  });
  const textures = useMemo(() => {
    const pts = [];
    for (let r = 0; r <= MESH_R; r++) {
      for (let c = 0; c <= MESH_C; c++) pts.push(vec((MESH_TEX_W * c) / MESH_C, (MESH_TEX_H * r) / MESH_R));
    }
    return pts;
  }, []);
  const op = (k: number) => useDerivedValue(() => (pose.value.pose === k ? pose.value.alpha : 0));
  const o0 = op(0);
  const o1 = op(1);
  const o2 = op(2);
  const o3 = op(3);
  const o4 = op(4);
  const floatScale = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    if (s.float === 0) return 0;
    const k = Math.min(1, s.floatSteps / 24);
    const back = 1.4;
    const e = 1 + (back + 1) * Math.pow(k - 1, 3) + back * Math.pow(k - 1, 2);
    return Math.max(0, e);
  });
  const floatT = useDerivedValue(() => {
    const p = pose.value;
    const sc = floatScale.value;
    return [{ translateX: p.x }, { translateY: p.y }, { scale: sc }];
  });
  const shieldOp = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    return s.shield || s.reviveShield > 0 ? 0.55 + 0.1 * Math.sin(s.worldT / 5) : 0;
  });
  const shieldT = useDerivedValue(() => [{ translateX: pose.value.x }, { translateY: pose.value.y }]);
  const DH = (SHARK_W * 458) / 768;
  // Dash afterimages: 3 ghosts trailing 30u apart, fading 0.45 -> 0.
  const ghostOp = useDerivedValue(() => (tick.value, sim.value.dash > 0 ? 1 : 0));
  const ghostT = [1, 2, 3].map((k) => useDerivedValue(() => {
    const p = pose.value;
    return [{ translateX: p.x - k * 34 }, { translateY: p.y }, { rotate: p.tilt }, { scaleX: 1.12 }, { scaleY: 0.92 }];
  }));
  return (
    <Group>
      {dash ? (
        <Group opacity={ghostOp}>
          {ghostT.map((t, k) => (
            <Group key={k} transform={t} opacity={0.45 - k * 0.13}>
              <SkImage image={dash} x={-SHARK_W * 0.55} y={-DH / 2} width={SHARK_W * 1.1} height={DH * 1.1} />
            </Group>
          ))}
        </Group>
      ) : null}
      <Group transform={transform}>
        {swim ? (
          <Group opacity={o0}>
            <Vertices vertices={vertices} textures={textures} indices={MESH_INDICES} mode="triangles">
              <ImageShader image={swim} />
            </Vertices>
          </Group>
        ) : null}
        {dash ? <SkImage image={dash} x={-SHARK_W * 0.55} y={-DH / 2} width={SHARK_W * 1.1} height={DH * 1.1} opacity={o1} /> : null}
        {dizzy ? <SkImage image={dizzy} x={-60} y={-80} width={120} height={167} opacity={o2} /> : null}
        {bonked ? <SkImage image={bonked} x={-62} y={-83} width={124} height={166} opacity={o3} /> : null}
        {cheer ? <SkImage image={cheer} x={-64} y={-80} width={128} height={160} opacity={o4} /> : null}
      </Group>
      {/* Shield / revive bubble */}
      <Group transform={shieldT} opacity={shieldOp}>
        <Circle cx={0} cy={0} r={92} color="#bfeaff" opacity={0.35} />
        <Circle cx={0} cy={0} r={92} style="stroke" strokeWidth={6} color="#ffffff" />
        <Circle cx={-34} cy={-44} r={12} color="#ffffff" opacity={0.8} />
      </Group>
      {/* Bubble Float */}
      <Group transform={floatT}>
        {bubble ? <SkImage image={bubble} x={-118} y={-118} width={236} height={236} opacity={0.55} /> : null}
        <Circle cx={0} cy={0} r={112} style="stroke" strokeWidth={5} color="#ffffff" opacity={0.9} />
      </Group>
    </Group>
  );
});

// ---------------------------------------------------------------------------
// Gates: Tide Gate (bunting arch), race split line, Ride Gate / finish.
// ---------------------------------------------------------------------------
const Gates = React.memo(function Gates({ sim, tick, alpha, font, tideArt, rideArt }: {
  sim: SharedValue<SimState>; tick: SharedValue<number>; alpha: SharedValue<number>; font: SkFont | null;
  tideArt: SkImageType | null; rideArt: SkImageType | null;
}) {
  const list = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    const a = alpha.value;
    const dist = lerp(s.pdist, s.dist, a) / 256;
    const anc = anchorX(s);
    const out: number[] = [];
    for (let i = 0; i < ENT_CAP && out.length < 6; i++) {
      if (s.et[i] !== E_GATE) continue;
      const vx = anc + (s.ex[i] - dist);
      // Wide window: the arch set piece is ~1100u across.
      if (vx < -300 || vx > VIEW_W + 900) continue;
      out.push(vx, s.ep1[i], (s.worldT + a) / 60);
    }
    return out;
  });
  return (
    <Group>
      <GateArch i={0} list={list} tide={tideArt} ride={rideArt} />
      <GateArch i={1} list={list} tide={tideArt} ride={rideArt} />
      <Gate i={0} list={list} font={font} />
      <Gate i={1} list={list} font={font} />
    </Group>
  );
});

/**
 * The gate set piece: a huge front-view arch (Tide Gate: bubble-and-bunting arch
 * with the tide clock; Ride Gate: the bulb-lit grand entrance) framing the whole
 * water column, so crossing a gate reads as swimming through it. Drawn behind
 * every gameplay sprite. A Tide Gate arch is centred 300u before the bunting
 * line so it has fully passed before the sim culls the gate entity.
 */
const ARCH_H = 1010;
const ARCH_W = (ARCH_H * 384) / 351;
function GateArch({ i, list, tide, ride }: { i: number; list: SharedValue<number[]>; tide: SkImageType | null; ride: SkImageType | null }) {
  const st = useDerivedValue(() => {
    const l = list.value;
    const o = i * 3;
    if (o >= l.length || l[o + 1] === G_SPLIT) return { x: -9999, ride: 0, t: 0 };
    const big = l[o + 1] === G_RIDE || l[o + 1] === G_FINISH;
    return { x: l[o] + (big ? 0 : -300), ride: big ? 1 : 0, t: l[o + 2] };
  });
  const tr = useDerivedValue(() => {
    const v = st.value;
    // A slow 1.5% breathe so the arch feels alive (bubbles / bulbs).
    const b = 1 + 0.015 * Math.sin(v.t * 3.1);
    return [{ translateX: v.x }, { translateY: FLOOR_Y + 40 }, { scale: b }];
  });
  const tideOp = useDerivedValue(() => (st.value.x < -9000 || st.value.ride ? 0 : 0.72));
  const rideOp = useDerivedValue(() => (st.value.x < -9000 || !st.value.ride ? 0 : 1));
  return (
    <Group transform={tr}>
      {tide ? <SkImage image={tide} x={-ARCH_W / 2} y={-ARCH_H} width={ARCH_W} height={ARCH_H} opacity={tideOp} /> : null}
      {ride ? <SkImage image={ride} x={-ARCH_W / 2} y={-ARCH_H} width={ARCH_W} height={ARCH_H} opacity={rideOp} /> : null}
    </Group>
  );
}

function Gate({ i, list, font }: { i: number; list: SharedValue<number[]>; font: SkFont | null }) {
  const paths = useDerivedValue(() => {
    const l = list.value;
    const o = i * 3;
    const rope = Skia.Path.Make();
    const flags = Skia.Path.Make();
    const split = Skia.Path.Make();
    if (o >= l.length) return { rope, flags, split };
    const x = l[o];
    const kind = l[o + 1];
    const t = l[o + 2];
    if (kind === G_SPLIT) {
      for (let y = SURFACE_Y; y < FLOOR_Y; y += 40) split.addRect(Skia.XYWHRect(x - 4, y, 8, 22));
      return { rope, flags, split };
    }
    // Bunting rope between the hanging pole and the standing pole, flags wave at 3 Hz.
    const y0 = SURFACE_Y + 250;
    const y1 = FLOOR_Y - 250;
    rope.moveTo(x, y0);
    rope.quadTo(x + 26 + Math.sin(t * 2) * 6, (y0 + y1) / 2, x, y1);
    for (let k = 0; k < 7; k++) {
      const y = y0 + 20 + k * ((y1 - y0 - 40) / 6);
      const bow = Math.sin((k / 6) * Math.PI) * 22;
      const wave = Math.sin(t * 6.28 * 1.5 + k) * 8;
      flags.moveTo(x + bow, y - 16);
      flags.lineTo(x + bow + 44 + wave, y);
      flags.lineTo(x + bow, y + 16);
      flags.close();
    }
    return { rope, flags, split };
  });
  const rope = useDerivedValue(() => paths.value.rope);
  const flags = useDerivedValue(() => paths.value.flags);
  const split = useDerivedValue(() => paths.value.split);
  void font;
  return (
    <Group>
      <Path path={split} color="#ffffff" opacity={0.85} />
      <Path path={rope} style="stroke" strokeWidth={5} color={INK} />
      <Path path={flags} color={GOLD} />
      <Path path={flags} style="stroke" strokeWidth={4} color={INK} />
    </Group>
  );
}

// ---------------------------------------------------------------------------
// Rings: drawn side-on in two halves so the shark swims THROUGH them.
// ---------------------------------------------------------------------------
const Rings = React.memo(function Rings({ sim, tick, alpha, image, half }: {
  sim: SharedValue<SimState>; tick: SharedValue<number>; alpha: SharedValue<number>; image: SkImageType | null; half: 'back' | 'front';
}) {
  const list = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    const a = alpha.value;
    const dist = lerp(s.pdist, s.dist, a) / 256;
    const anc = anchorX(s);
    const out: number[] = [];
    for (let i = 0; i < ENT_CAP && out.length < RINGS * 3; i++) {
      if (s.et[i] !== E_RING) continue;
      const vx = anc + (s.ex[i] - dist);
      if (vx < -120 || vx > VIEW_W + 120) continue;
      const done = s.ef[i] & F_DONE ? Math.min(1, (vx < anc ? (anc - vx) / 80 : 0)) : 0;
      out.push(vx, s.ey[i], done);
    }
    return out;
  });
  if (!image) return null;
  return (
    <Group>
      {Array.from({ length: RINGS }, (_, i) => <Ring key={i} i={i} list={list} image={image} half={half} />)}
    </Group>
  );
});

function Ring({ i, list, image, half }: { i: number; list: SharedValue<number[]>; image: SkImageType; half: 'back' | 'front' }) {
  const H = RING_R * 2 + 44;
  const W = H * 0.42;
  const tr = useDerivedValue(() => {
    const l = list.value;
    const o = i * 3;
    if (o >= l.length) return [{ translateX: -9999 }, { translateY: 0 }];
    return [{ translateX: l[o] }, { translateY: l[o + 1] }];
  });
  const clip = useMemo(() => (half === 'back' ? rect(-W, -H, W, H * 2) : rect(0, -H, W, H * 2)), [half, W, H]);
  return (
    <Group transform={tr}>
      <Group clip={clip}>
        <SkImage image={image} x={-W / 2} y={-H / 2} width={W} height={H} fit="fill" opacity={half === 'back' ? 0.85 : 1} />
      </Group>
    </Group>
  );
}

// ---------------------------------------------------------------------------
// Frenzy Pot: floating gold number above the shark.
// ---------------------------------------------------------------------------
const FrenzyPot = React.memo(function FrenzyPot({ sim, tick, alpha, font }: { sim: SharedValue<SimState>; tick: SharedValue<number>; alpha: SharedValue<number>; font: SkFont | null }) {
  const text = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    return s.frenzy > 0 ? `${s.pot}` : '';
  });
  const pos = useDerivedValue(() => {
    const s = sim.value;
    const y = lerp(s.py, s.y, alpha.value) / 256;
    const w = font ? font.measureText(text.value).width : 0;
    return [{ translateX: anchorX(s) - w / 2 }, { translateY: y - 70 }];
  });
  if (!font) return null;
  return (
    <Group transform={pos}>
      <SkText x={0} y={0} text={text} font={font} color={INK} style="stroke" strokeWidth={8} />
      <SkText x={0} y={0} text={text} font={font} color={GOLD} />
    </Group>
  );
});

// ---------------------------------------------------------------------------
// Edge badges: coral tabs at the right edge 600ms before a hazard enters.
// ---------------------------------------------------------------------------
const Badges = React.memo(function Badges({ sim, tick, alpha, font }: { sim: SharedValue<SimState>; tick: SharedValue<number>; alpha: SharedValue<number>; font: SkFont | null }) {
  const list = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    const a = alpha.value;
    const dist = lerp(s.pdist, s.dist, a) / 256;
    const edge = dist + aheadU(s);
    const lead = ((s.speedEff / 256) * 0.6) || 1;
    const out: number[] = [];
    for (let i = 0; i < ENT_CAP && out.length < BADGES * 6; i++) {
      const t = s.et[i];
      if (t !== E_PYLON && t !== E_JELLY && t !== E_PUFFER && t !== E_TORPEDO) continue;
      if (!(s.ef[i] & F_BADGE) || (s.ef[i] & F_HIT)) continue;
      if (t === E_TORPEDO) {
        const st = s.est[i];
        if (st !== 1 && st !== 2) continue;
        const flash = st === 2 ? (Math.floor(s.etm[i] / 3) % 2 ? 1 : 0.35) : 1;
        out.push(3, s.ey[i] - 60, s.ey[i] + 60, 0, flash, 1);
        continue;
      }
      const sp = hazardSpan(s, i);
      const ahead = sp[0] - edge;
      if (ahead < -60 || ahead > lead) continue;
      const slide = clamp01((lead - ahead) / (lead * 0.2));
      const fade = ahead < 0 ? clamp01(1 + ahead / 60) : 1;
      if (t === E_PYLON) {
        const half = s.ep1[i] / 2;
        out.push(0, s.ey[i] - half, s.ey[i] + half, 0, fade, slide);
      } else {
        const y = t === E_JELLY ? jellyY(s, i) : s.ey[i];
        const r = t === E_JELLY ? JELLY_R : PUFF_R1;
        out.push(1, y - r, y + r, 0, fade, slide);
      }
    }
    return out;
  });
  return (
    <Group>
      {Array.from({ length: BADGES }, (_, i) => <Badge key={i} i={i} list={list} font={font} />)}
    </Group>
  );
});

function Badge({ i, list, font }: { i: number; list: SharedValue<number[]>; font: SkFont | null }) {
  const paths = useDerivedValue(() => {
    const l = list.value;
    const o = i * 6;
    const p = Skia.Path.Make();
    if (o >= l.length) return p;
    const kind = l[o];
    const slide = l[o + 5];
    // outBack slide-in from the right edge.
    const k = slide;
    const e = 1 + 2.7 * Math.pow(k - 1, 3) + 1.7 * Math.pow(k - 1, 2);
    const x = VIEW_W + 4 - 30 * e;
    if (kind === 0) {
      // Pylon: bracket above and below the gap, gap left open.
      p.addRRect(Skia.RRectXY(Skia.XYWHRect(x, SURFACE_Y + 6, 34, Math.max(10, l[o + 1] - SURFACE_Y - 12)), 10, 10));
      p.addRRect(Skia.RRectXY(Skia.XYWHRect(x, l[o + 2] + 6, 34, Math.max(10, FLOOR_Y - l[o + 2] - 12)), 10, 10));
    } else if (kind === 1) {
      p.addRRect(Skia.RRectXY(Skia.XYWHRect(x, l[o + 1], 34, l[o + 2] - l[o + 1]), 14, 14));
    } else {
      p.addRRect(Skia.RRectXY(Skia.XYWHRect(VIEW_W - 58, l[o + 1] + 20, 52, 80), 16, 16));
    }
    return p;
  });
  const op = useDerivedValue(() => {
    const l = list.value;
    const o = i * 6;
    return o < l.length ? l[o + 4] : 0;
  });
  const bang = useDerivedValue(() => {
    const l = list.value;
    const o = i * 6;
    return o < l.length && l[o] === 3 ? '!' : '';
  });
  const bangY = useDerivedValue(() => {
    const l = list.value;
    const o = i * 6;
    return o < l.length ? l[o + 1] + 78 : -999;
  });
  return (
    <Group opacity={op}>
      <Path path={paths} color={CORAL} />
      <Path path={paths} style="stroke" strokeWidth={6} color={INK} />
      {font ? <SkText x={VIEW_W - 42} y={bangY} text={bang} font={font} color="#ffffff" /> : null}
    </Group>
  );
}

// ---------------------------------------------------------------------------
// Rivals and ghosts: player-colour silhouettes at 0.4 alpha behind hazards.
// ---------------------------------------------------------------------------
const Rivals = React.memo(function Rivals({ sim, rivals, tick, alpha, swim, colors }: {
  sim: SharedValue<SimState>; rivals: SharedValue<RivalSlot[]>; tick: SharedValue<number>; alpha: SharedValue<number>;
  swim: SkImageType | null; colors: string[];
}) {
  const list = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    const a = alpha.value;
    const dist = lerp(s.pdist, s.dist, a) / 256;
    const anc = anchorX(s);
    const rv = rivals.value;
    const out: number[] = [];
    for (let j = 0; j < RIVAL_N; j++) {
      const g = rv[j];
      if (!g || g.kind === 0) {
        out.push(-9999, 0, 0, 0);
        continue;
      }
      let d = 0;
      let y = 500;
      let vy = 0;
      if (g.kind === 1 && g.sim) {
        d = lerp(g.sim.pdist, g.sim.dist, a) / 256;
        y = lerp(g.sim.py, g.sim.y, a) / 256;
        vy = g.sim.vy / 256;
      } else {
        const dt = (s.step - g.rAt + a) / 60;
        d = g.rDist + g.rVel * Math.min(0.25, Math.max(0, dt));
        y = g.rY;
      }
      let gap = d - dist;
      const clamped = gap > 220 ? 1 : gap < -220 ? -1 : 0;
      if (gap > 220) gap = 220;
      if (gap < -220) gap = -220;
      let tilt = vy / 1400;
      if (tilt < -0.45) tilt = -0.45;
      if (tilt > 0.55) tilt = 0.55;
      out.push(anc + gap, y, tilt, clamped);
    }
    return out;
  });
  if (!swim) return null;
  return (
    <Group>
      {Array.from({ length: RIVAL_N }, (_, j) => <RivalShark key={j} j={j} list={list} swim={swim} color={colors[j] ?? '#ffffff'} />)}
    </Group>
  );
});

function RivalShark({ j, list, swim, color }: { j: number; list: SharedValue<number[]>; swim: SkImageType; color: string }) {
  const tr = useDerivedValue(() => {
    const l = list.value;
    return [{ translateX: l[j * 4] }, { translateY: l[j * 4 + 1] }, { rotate: l[j * 4 + 2] }];
  });
  const h = (SHARK_W * MESH_TEX_H) / MESH_TEX_W;
  const tint = useMemo(() => {
    const paint = Skia.Paint();
    paint.setColorFilter(Skia.ColorFilter.MakeBlend(Skia.Color(color), 5 /* SrcIn */));
    return paint;
  }, [color]);
  return (
    <Group transform={tr} opacity={0.4}>
      <Group layer={tint}>
        <SkImage image={swim} x={-SHARK_W / 2 - 3} y={-h / 2 - 3} width={SHARK_W + 6} height={h + 6} />
      </Group>
      <Group layer={tint}>
        <SkImage image={swim} x={-SHARK_W / 2} y={-h / 2} width={SHARK_W} height={h} />
      </Group>
    </Group>
  );
}

// ---------------------------------------------------------------------------
// Toon caustics: cell lines posterized to one hard tone (Alex's cel style),
// white at ~12%, top 55% of the water, alpha down with speed.
// ---------------------------------------------------------------------------
const CAUSTIC_SKSL = `
uniform float t;
uniform float off;
uniform float strength;
float hash(float2 p) { return fract(sin(dot(p, float2(127.1, 311.7))) * 43758.5453); }
half4 main(float2 xy) {
  float2 p = float2(xy.x + off, xy.y) / 110.0;
  float2 i = floor(p);
  float2 f = fract(p);
  float d1 = 8.0;
  float d2 = 8.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      float2 g = float2(float(x), float(y));
      float h = hash(i + g);
      float2 o = 0.5 + 0.38 * sin(t * 0.8 + 6.2831 * float2(h, fract(h * 7.13)));
      float d = length(g + o - f);
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
    }
  }
  float line = (d2 - d1) < 0.07 ? 1.0 : 0.0;
  float fade = clamp(1.0 - (xy.y - 40.0) / 540.0, 0.0, 1.0);
  float a = line * strength * fade;
  return half4(a, a, a, a);
}
`;

export { SLOTS as SHARKY_ATLAS_SLOTS };
void E_COIN; void PH_DONE;
