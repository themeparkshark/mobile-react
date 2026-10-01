/**
 * SharkyCanvas: the Tide Run world in one Skia canvas on the UI thread
 * (design v7.1 sections 4, 7 and 13.3).
 *
 * Back to front:
 *   graded background group (one ColorMatrix: saturation -25%, lightness +15%,
 *   a blue haze, the Frenzy gold grade and the wipeout desaturate): water,
 *   god rays and toon caustics above y 300 only, far reef (0.2x), coral floor
 *   strip (0.5x), the 60% gate arches;
 *   sand, floor blob shadow, speed streaks and rising bubbles, ghosts/rivals,
 *   graze halos (white, outside the art), the world shadow pass, the world
 *   Atlas (every hazard and pickup), coral danger rims (inside the art, 2Hz),
 *   the Close Skim edge flash and sparkle burst, ring back halves, the Frenzy
 *   ribbon, the shark (render/SharkSprite), ring front halves, the bow wake,
 *   the Perfect shockwave, stamps, the ink kelp strips (1.4x, y < 150 and
 *   y > 850 only), fin-shaped warning badges at each hazard's own y, the Gate
 *   Rush bunting, then the sky band over the water line.
 *
 * Nothing here allocates React state per frame: derived values read the sim
 * and the presentation director (render/pres.ts) and feed fixed buffers.
 */

import React, { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import {
  Atlas, BlendMode, Canvas, Circle, ColorMatrix, Group, Image as SkImage, LinearGradient, Oval, Paint, Path, Rect,
  Shader, Skia, rect, useFont, useImage, useRSXformBuffer, useRectBuffer, vec,
  type SkImage as SkImageType,
} from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { useSpriteAtlas } from '../../../gamekit/fx/SpriteAtlas';
import {
  E_BOX, E_COIN, E_GATE, E_GIFT, E_JELLY, E_PUFFER, E_PYLON, E_RING, E_SCATTER, E_SHIELD, E_TOKEN, E_TORPEDO,
  CF_CLOSE, ENT_CAP, F_BADGE, F_DONE, F_HIT, F_PASS, F_SMASH, FLOOR_Y, G_FINISH, G_RIDE, G_SPLIT, JELLY_R,
  PH_POCKET, PH_WIPE, PUFF_R0, PUFF_R1, PYLON_W, RING_R, SURFACE_Y, TORP_H, TORP_W, hazardSpan, jellyY, pufferR,
  type SimState,
} from '../sim/core';
import { AMB_N, type Ambient, type RivalSlot } from '../useSharkyEngine';
import { VIEW_W, type SharkyLayout } from './view';
import { SHARKY_ART, SHARKY_STAMPS } from '../assets';
import { isBanner, presSharkY, RIBBON_N, type Pres } from './pres';
import { SharkSprite, SHARK_H, SHARK_W } from './SharkSprite';
import { DANGER, FRENZY_WATER, HAZE, INK, NEUTRAL, REWARD, REWARD_LIGHT, hexToRgb } from './palette';

const ZONES = [
  ['#8ce8f2', '#34bfdc', '#1aa3c8'], // lagoon aqua
  ['#7ae3ea', '#26b4cc', '#128fb3'], // midway turquoise
  ['#86e6e0', '#2ab3bf', '#1592a8'], // shipwreck sunlit teal
  ['#9af2ff', '#3cc8ee', '#1a9fd6'], // storm surge bright cyan
];

// Atlas sprite indices.
const SPR_COIN = 0; // coin spin frames 0..3 (render-time squash)
const SPR_TOKEN_G = 4;
const SPR_BOX = 5;
const SPR_JELLY = 6;
const SPR_PUFF = 7;
const SPR_PUFFED = 8;
const SPR_BOAT = 9;
const SPR_BUBBLE = 10;
const SPR_TOKEN_O = 11;
const SPR_TOKEN_B = 12;
const SPR_SEG = 13;
const SPR_CAP = 14;
const SPR_BURST = 15; // sparkle burst flipbook 15..17
const SPR_STREAK = 18; // bubble streak 18..19
const SPR_SPARKLE = 20;

const SLOTS = 200;
const PSTRIDE = 7; // sprite, cx, cy, scale(u per atlas px), rot, alpha, flip
const BACK_SLOTS = 72;
const RINGS = 4;
const BADGES = 6;
const RIVAL_N = 3;
const STAMP_N = 12;
/** Coin spin (12fps, 8 steps): squash frame index and mirror per step. */
const SPIN_FRAMES = [0, 1, 2, 3, 3, 2, 1, 0];

export interface SharkyCanvasProps {
  layout: SharkyLayout;
  sim: SharedValue<SimState>;
  rivals: SharedValue<RivalSlot[]>;
  ambient: SharedValue<Ambient>;
  pres: SharedValue<Pres>;
  tick: SharedValue<number>;
  alpha: SharedValue<number>;
  /** Rival outline colours (player colours). */
  rivalColors: string[];
  reducedMotion: boolean;
  /** Perf tier: 0 full, 1 lite (no caustic shader, no shadow pass), 2 min (also no far reef, rays, kelp strips). */
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

function outBack(k: number, s: number): number {
  'worklet';
  const t = k - 1;
  return 1 + (s + 1) * t * t * t + s * t * t;
}

/** Background grade (design 7.8 / 7.5 / 7.7): one 4x5 matrix. */
function gradeMatrix(frenzy: number, desat: number): number[] {
  'worklet';
  // Saturation 0.75 (less a desaturate for wipeouts).
  const sat = 0.75 * (1 - desat);
  const lr = 0.2126 * (1 - sat);
  const lg = 0.7152 * (1 - sat);
  const lb = 0.0722 * (1 - sat);
  // Lightness +15% then a 12% haze mix toward #cfeaff; Frenzy mixes 30% toward warm gold, x1.08.
  const haze = [0xcf / 255, 0xea / 255, 0xff / 255];
  const gold = [0xff / 255, 0xd8 / 255, 0x6b / 255];
  const light = 0.85;
  const mixH = 0.12;
  const mixG = 0.3 * frenzy;
  const bright = 1 + 0.08 * frenzy;
  const m: number[] = [];
  const rows = [[lr + sat, lg, lb], [lr, lg + sat, lb], [lr, lg, lb + sat]];
  for (let r = 0; r < 3; r++) {
    const scale = light * (1 - mixH) * (1 - mixG) * bright;
    const off = (0.15 * (1 - mixH) + haze[r] * mixH) * (1 - mixG) * bright + gold[r] * mixG * bright;
    m.push(rows[r][0] * scale, rows[r][1] * scale, rows[r][2] * scale, 0, off);
  }
  m.push(0, 0, 0, 1, 0);
  return m;
}

/** Squashed copies of a coin for the render-time spin (scaleX 1, 0.72, 0.4, 0.14). */
function squashFrames(img: SkImageType | null): Array<SkImageType | null> {
  if (!img) return [null, null, null, null];
  const out: Array<SkImageType | null> = [];
  for (const sx of [1, 0.72, 0.4, 0.14]) {
    try {
      const w = Math.max(4, Math.round(img.width() * sx));
      const h = img.height();
      const surf = Skia.Surface.MakeOffscreen(w, h);
      if (!surf) {
        out.push(img);
        continue;
      }
      const c = surf.getCanvas();
      c.clear(Skia.Color('transparent'));
      const paint = Skia.Paint();
      paint.setAntiAlias(true);
      c.drawImageRect(img, Skia.XYWHRect(0, 0, img.width(), h), Skia.XYWHRect(0, 0, w, h), paint);
      surf.flush();
      out.push(surf.makeImageSnapshot().makeNonTextureImage());
    } catch {
      out.push(img);
    }
  }
  return out;
}

export const SharkyCanvas = React.memo(function SharkyCanvas({
  layout, sim, rivals, ambient, pres, tick, alpha, rivalColors, reducedMotion, quality = 0,
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
  const burst0 = useImage(SHARKY_ART.sparkleBurst0);
  const burst1 = useImage(SHARKY_ART.sparkleBurst1);
  const burst2 = useImage(SHARKY_ART.sparkleBurst2);
  const streak0 = useImage(SHARKY_ART.streak0);
  const streak1 = useImage(SHARKY_ART.streak1);
  const sparkle = useImage(SHARKY_ART.sparkle);
  const finBadge = useImage(SHARKY_ART.finBadge);
  const bunting = useImage(SHARKY_ART.rushBunting);
  const stampImgs = SHARKY_STAMPS.map((src) => useImage(src ?? SHARKY_ART.bubble));
  const font = useFont(SHARKY_ART.displayFont, 44);

  const coins = useMemo(() => squashFrames(coin), [coin]);
  const atlas = useSpriteAtlas(
    [coins[0], coins[1], coins[2], coins[3], tokenG, box, jelly, puff, puffed, boat, bubble, tokenO, tokenB, seg, cap, burst0, burst1, burst2, streak0, streak1, sparkle],
    { cell: 256 },
  );
  const rects = useMemo(() => {
    if (!atlas) return [] as number[];
    const out: number[] = [];
    atlas.rects.forEach((r) => out.push(r.x, r.y, r.width, r.height));
    return out;
  }, [atlas]);

  // --- camera: view units -> field points, y follow and zoom about the shark --
  const worldTransform = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    const p = pres.value;
    const y = presSharkY(p, lerp(s.py, s.y, alpha.value) / 256);
    const z = p.zoom;
    return [
      { translateX: L.offX },
      { translateY: L.offY + p.camY * L.k },
      { scale: L.k },
      { translateX: p.anc },
      { translateY: y },
      { scale: z },
      { translateX: -p.anc },
      { translateY: -y },
    ];
  });

  // --- per-frame world plan ---------------------------------------------------
  const plan = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    const p = pres.value;
    const a = alpha.value;
    const out: number[] = new Array(SLOTS * PSTRIDE).fill(0);
    if (rects.length === 0) return out;
    const dist = lerp(s.pdist, s.dist, a) / 256;
    const anc = p.anc;
    const now = p.fx;
    const frenzy = s.frenzy > 0;
    const twos = Math.floor(now / 83.333);
    let n = 0;
    const put = (spr: number, cx: number, cy: number, w: number, rot: number, al: number, byH: boolean) => {
      if (n >= SLOTS) return;
      const o = n * PSTRIDE;
      const rw = rects[spr * 4 + 2];
      const rh = rects[spr * 4 + 3];
      out[o] = spr;
      out[o + 1] = cx;
      out[o + 2] = cy;
      out[o + 3] = byH ? (rh > 0 ? w / rh : 0) : rw > 0 ? w / rw : 0;
      out[o + 4] = rot;
      out[o + 5] = al;
      out[o + 6] = 1;
      n++;
    };
    const floatPhase = s.float > 0;
    for (let i = 0; i < ENT_CAP; i++) {
      const et = s.et[i];
      if (et === 0 || et === E_RING || et === E_GATE) continue;
      const ex = lerp(s.epx[i], s.ex[i], a);
      const vx = anc + (ex - dist);
      if (vx < -220 || vx > VIEW_W + 220) continue;
      const hazardAlpha = floatPhase ? 0.5 : 1;
      if (et === E_PYLON) {
        // Stacked coaster segments with a striped cap at each gap edge. A hit
        // shudders 4pt; a Close Skim jolts it away from the shark (art only).
        let jolt = 0;
        if ((s.ef[i] & F_HIT) && s.etm[i] < 8) jolt = Math.sin(s.etm[i] * 2.2) * 7;
        if (p.closeEnt === i && now - p.closeT < 120) jolt += 7 * Math.sin(((now - p.closeT) / 120) * Math.PI);
        if ((s.ef[i] & F_SMASH) && s.etm[i] < 12) jolt += Math.sin(s.etm[i] * 2.6) * 9;
        const cx = vx + PYLON_W / 2 + jolt;
        const half = s.ep1[i] / 2;
        const top = s.ey[i] - half;
        const bot = s.ey[i] + half;
        const capW = PYLON_W + 24;
        const capH = capW * rects[SPR_CAP * 4 + 3] / Math.max(1, rects[SPR_CAP * 4 + 2]);
        const segW = PYLON_W;
        const segH = segW * rects[SPR_SEG * 4 + 3] / Math.max(1, rects[SPR_SEG * 4 + 2]);
        for (let y = top - capH - segH / 2 + 10; y + segH / 2 > SURFACE_Y - 80; y -= segH - 6) put(SPR_SEG, cx, y, segW, 0, 1, false);
        for (let y = bot + capH + segH / 2 - 10; y - segH / 2 < FLOOR_Y + 80; y += segH - 6) put(SPR_SEG, cx, y, segW, 0, 1, false);
        put(SPR_CAP, cx, top - capH / 2, capW, 0, 1, false);
        put(SPR_CAP, cx, bot + capH / 2, capW, Math.PI, 1, false);
        continue;
      }
      if (et === E_COIN || et === E_SCATTER) {
        // Spin: a 12fps 8-step squash cycle, 40ms phase offset per coin in a line.
        const ph = (twos + Math.floor(((s.ep2[i] & CF_CLOSE ? 1 : 0) + i) * 0.5)) % 8;
        const fr = SPIN_FRAMES[ph];
        let al = 1;
        let h = 44;
        if (et === E_SCATTER) {
          const life = s.etm[i] / 90;
          // Flash at 8Hz in the last 500ms, then pop.
          if (life > 0.66) al = Math.floor(now / 62.5) % 2 ? 1 : 0.3;
          h = 40;
        }
        const cy = et === E_SCATTER ? lerp(s.epy[i], s.ey[i], a) : s.ey[i];
        if (frenzy) {
          // Star coins: 1.3x, a rotating outlined star behind, gold halo.
          put(SPR_SPARKLE, vx, cy, 70, now / 300 + i, 0.9, false);
          h = 57;
        }
        put(SPR_COIN + fr, vx, cy, h, 0, al, true);
        // White glint sweep every 1.2s per coin.
        const g = (now + i * 97) % 1200;
        if (g < 120) put(SPR_SPARKLE, vx + 8, cy - 10, 26 * (1 - Math.abs(g - 60) / 60), 0, 1, false);
      } else if (et === E_TOKEN) {
        const flip = Math.abs(Math.cos(now / 333 + i));
        put(s.ep1[i] === 1 ? SPR_TOKEN_O : s.ep1[i] === 2 ? SPR_TOKEN_B : SPR_TOKEN_G, vx, s.ey[i] + Math.sin(now / 333) * 6, 76 * (0.75 + 0.25 * flip), 0, 1, false);
      } else if (et === E_BOX) {
        if (s.ef[i] & F_DONE) {
          const k = s.etm[i];
          if (k < 8) put(SPR_BOX, vx, s.ey[i], 92 * (1 - k / 10), 0, 1 - k / 8, false);
        } else put(SPR_BOX, vx, s.ey[i] + Math.sin(now / 416 + i) * 5, 92, Math.sin(now / 500 + i) * 0.06, 1, false);
      } else if (et === E_SHIELD || et === E_GIFT) {
        put(SPR_BUBBLE, vx, s.ey[i] + Math.sin(now / 450) * 8, 96 * (1 + 0.05 * Math.sin(now / 200)), 0, 0.9, false);
        if (et === E_GIFT) put(SPR_COIN, vx, s.ey[i] + Math.sin(now / 450) * 8, 40, 0, 1, true);
      } else if (et === E_JELLY) {
        // Jellies draw at 1.1x (hitbox unchanged); bell squash 1.0/0.92 at 1.2Hz.
        const jy = lerp(s.epy[i], jellyY(s, i), a);
        const hit = (s.ef[i] & F_HIT) && s.etm[i] < 20;
        if ((s.ef[i] & F_DONE) && s.est[i] === 5) {
          const k = s.etm[i];
          if (k < 10) put(SPR_JELLY, vx, jy, 119 * (1 + k / 10), k * 0.2, 1 - k / 10, false);
          continue;
        }
        put(SPR_JELLY, vx + (hit ? 20 * (1 - s.etm[i] / 20) : 0), jy, 119 * (1 + 0.04 * Math.sin(now / 133 + i)), Math.sin(now / 133 + i) * 0.07, hazardAlpha * (hit && Math.floor(now / 50) % 2 ? 0.6 : 1), false);
      } else if (et === E_PUFFER) {
        const st = s.est[i];
        if (st === 5) {
          const k = s.etm[i];
          if (k < 10) put(SPR_PUFFED, vx, s.ey[i], 190 * (1 - k / 12), k * 0.3, 1 - k / 10, false);
          continue;
        }
        const r = pufferR(s, i);
        // Calm read (v7.1): 1.3x art, spikes wobble 6deg at 3Hz; wiggle telegraph +-8deg at 12Hz.
        const wig = st === 1 ? Math.sin(now / 13.3) * 0.14 : Math.sin(now / 53 + i) * 0.1;
        const spin = st === 4 ? s.etm[i] * 0.35 : 0;
        const big = st >= 2 && st !== 4 && r > (PUFF_R0 + PUFF_R1) / 2;
        put(big ? SPR_PUFFED : SPR_PUFF, vx, s.ey[i], r * 2 * (big ? 1.32 : 1.45) * 1.3, wig + spin, hazardAlpha, false);
      } else if (et === E_TORPEDO) {
        const st = s.est[i];
        if (st === 0) continue;
        const bob = Math.sin(now / 111) * 4;
        const spin = st === 4 ? s.etm[i] * 0.25 : 0;
        put(SPR_BOAT, vx, lerp(s.epy[i], s.ey[i], a) + bob, TORP_W + 12, spin, hazardAlpha, false);
      }
    }
    // Close Skim confirm: the drawn sparkle burst flipbook (12fps) at the contact.
    const tc = now - p.closeT;
    if (tc >= 0 && tc < 250) {
      const f = Math.min(2, Math.floor(tc / 83.3));
      put(SPR_BURST + f, anc + (p.closeX - dist), p.closeY, 120, 0, 1, false);
    }
    return out;
  });

  // Back plan: speed streaks and ambient bubbles (under the gameplay sprites).
  const backPlan = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    const p = pres.value;
    const out: number[] = new Array(BACK_SLOTS * PSTRIDE).fill(0);
    if (rects.length === 0) return out;
    const dist = lerp(s.pdist, s.dist, alpha.value) / 256;
    const anc = p.anc;
    const now = p.fx;
    let n = 0;
    const put = (spr: number, cx: number, cy: number, w: number, rot: number, al: number) => {
      if (n >= BACK_SLOTS) return;
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
    // Speed streaks (7.6): 2 at base (alpha 0.3), 4 at the cap (0.6), 12 in Overdrive or Frenzy.
    const sf = (s.speed - s.speedBase) / Math.max(1, s.speedCap - s.speedBase);
    const hot = s.od > 0 || s.frenzy > 0;
    const count = hot ? 12 : s.phase === PH_POCKET ? 1 : 2 + Math.round(2 * sf);
    const al = hot ? 0.7 : 0.3 + 0.3 * sf;
    const fr = Math.floor(now / 83.333) % 2;
    for (let k = 0; k < count; k++) {
      const lane = 160 + ((k * 211) % 680);
      const span = VIEW_W + 400;
      const x = VIEW_W + 200 - (((dist * 1.6 + k * 397) % span) + span) % span;
      put(SPR_STREAK + fr, x, lane, hot ? 150 : 110, 0, al);
    }
    const am = ambient.value;
    for (let i = 0; i < AMB_N; i++) {
      if (am.life[i] <= 0) continue;
      const k = am.life[i] / am.max[i];
      const vx = anc + (am.x[i] - dist);
      if (vx < -40 || vx > VIEW_W + 40) continue;
      if (am.kind[i] === 3) put(SPR_SPARKLE, vx, am.y[i], am.size[i] * 1.6 * k, am.life[i] * 9, 1);
      else if (am.kind[i] === 1) put(SPR_BUBBLE, vx, am.y[i], am.size[i] * (1.6 - k * 0.6), 0, 0.8);
      else put(SPR_BUBBLE, vx, am.y[i], am.size[i] * (am.kind[i] === 0 ? 0.6 + 0.4 * k : 1), 0, 0.9);
    }
    return out;
  });

  const mkBuffers = (src: SharedValue<number[]>, slots: number) => {
    const sprites = useRectBuffer(slots, (r, i) => {
      'worklet';
      const p = src.value;
      const spr = p[i * PSTRIDE];
      if (rects.length === 0) {
        r.setXYWH(0, 0, 0, 0);
        return;
      }
      r.setXYWH(rects[spr * 4], rects[spr * 4 + 1], rects[spr * 4 + 2], rects[spr * 4 + 3]);
    });
    const transforms = useRSXformBuffer(slots, (x, i) => {
      'worklet';
      const p = src.value;
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
      x.set(c, sn, p[o + 1] - (c * w * 0.5 - sn * h * 0.5), p[o + 2] - (sn * w * 0.5 + c * h * 0.5));
    });
    return { sprites, transforms };
  };
  const world = mkBuffers(plan, SLOTS);
  const back = mkBuffers(backPlan, BACK_SLOTS);
  const worldColors = useDerivedValue(() => {
    const p = plan.value;
    const out = [];
    for (let i = 0; i < SLOTS; i++) {
      const al = p[i * PSTRIDE + 5];
      out.push(new Float32Array([al, al, al, al]));
    }
    return out;
  });
  const backColors = useDerivedValue(() => {
    const p = backPlan.value;
    const out = [];
    for (let i = 0; i < BACK_SLOTS; i++) {
      const al = p[i * PSTRIDE + 5];
      out.push(new Float32Array([al, al, al, al]));
    }
    return out;
  });
  const shadowPaint = useMemo(() => {
    const pt = Skia.Paint();
    pt.setColorFilter(Skia.ColorFilter.MakeBlend(Skia.Color('rgba(35,56,79,0.18)'), BlendMode.SrcIn));
    return pt;
  }, []);

  // --- background grade ---------------------------------------------------------
  const grade = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    const p = pres.value;
    let f = 0;
    if (s.frenzy > 0) f = clamp01((p.fx - p.frenzyT) / 300);
    else if (p.fx - p.frenzyEndT < 400) f = 1 - clamp01((p.fx - p.frenzyEndT) / 400);
    const d = s.phase === PH_WIPE || (s.phase === 3 && s.hearts <= 0) ? 0.35 : 0;
    return gradeMatrix(f, d);
  });
  const gradeLayer = useMemo(() => <Paint><ColorMatrix matrix={grade} /></Paint>, [grade]);

  // --- zone water colours -------------------------------------------------------
  const waterColors = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    let z = s.sprint < 0 ? 0 : s.sprint;
    if (s.phase === PH_POCKET) z = Math.max(0, s.sprint - 1) + Math.min(1, s.phaseSteps / 48);
    z = Math.min(3, z);
    const i0 = Math.floor(z);
    const i1 = Math.min(3, i0 + 1);
    const f = z - i0;
    const mix = (x: string, y: string) => {
      const pa = parseInt(x.slice(1), 16);
      const pb = parseInt(y.slice(1), 16);
      return `rgb(${Math.round(lerp((pa >> 16) & 255, (pb >> 16) & 255, f))},${Math.round(lerp((pa >> 8) & 255, (pb >> 8) & 255, f))},${Math.round(lerp(pa & 255, pb & 255, f))})`;
    };
    return [mix(ZONES[i0][0], ZONES[i1][0]), mix(ZONES[i0][1], ZONES[i1][1]), mix(ZONES[i0][2], ZONES[i1][2])];
  });

  // --- parallax -------------------------------------------------------------
  const distV = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    return lerp(s.pdist, s.dist, alpha.value) / 256;
  });
  const FAR = { w: 1020, h: 680 };
  const farX = useDerivedValue(() => [{ translateX: -((distV.value * 0.2) % (FAR.w * 2)) }]);
  const REEF = { w: 620, h: 310 };
  const reefX = useDerivedValue(() => [{ translateX: -((distV.value * 0.5) % REEF.w) }]);
  const NEAR = { w: 880, h: 330 };
  const nearX = useDerivedValue(() => [{ translateX: -((distV.value * 1.4) % (NEAR.w * 2)) }]);

  // --- toon caustics and god rays (background, above y 300 only) --------------
  const caustic = useMemo(() => Skia.RuntimeEffect.Make(CAUSTIC_SKSL), []);
  const causticUniforms = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    const sf = (s.speed - s.speedBase) / Math.max(1, s.speedCap - s.speedBase);
    return { t: pres.value.fx / 1000, off: distV.value * 0.2, strength: 0.14 * (1 - 0.4 * sf) };
  });
  const rayTransform = useDerivedValue(() => [{ rotate: Math.sin((pres.value.fx / 1000) * 0.63) * 0.06 }]);
  const rayPaths = useMemo(() => {
    const out: ReturnType<typeof Skia.Path.Make>[] = [];
    [130, 380, 610].forEach((x, i) => {
      const w = [80, 120, 70][i];
      const p = Skia.Path.Make();
      p.moveTo(x - w * 0.4, SURFACE_Y);
      p.lineTo(x + w * 0.4, SURFACE_Y);
      p.lineTo(x + w * 1.2 - 60, 300);
      p.lineTo(x - w * 1.0 - 60, 300);
      p.close();
      out.push(p);
    });
    return out;
  }, []);

  // --- surface line -----------------------------------------------------------
  const surfacePath = useDerivedValue(() => {
    const d = distV.value;
    const t = pres.value.fx / 1000;
    const p = Skia.Path.Make();
    p.moveTo(-200, -900);
    for (let x = -200; x <= VIEW_W + 200; x += 24) {
      const y = SURFACE_Y + Math.sin((x + d) * 0.03 + t * 2.2) * 6 + Math.sin((x + d) * 0.011 - t) * 4;
      p.lineTo(x, y);
    }
    p.lineTo(VIEW_W + 200, -900);
    p.close();
    return p;
  });

  // --- halos, coral rims and the Close Skim edge flash --------------------------
  const hazardPaths = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    const p = pres.value;
    const dist = distV.value;
    const halo = Skia.Path.Make();
    const near = Skia.Path.Make();
    const rim = Skia.Path.Make();
    const flash = Skia.Path.Make();
    const flashOn = p.fx - p.closeT < 33 || (p.fx - p.closeT >= 0 && p.fx - p.closeT < 66 && Math.floor((p.fx - p.closeT) / 33) === 1);
    for (let i = 0; i < ENT_CAP; i++) {
      const t = s.et[i];
      if (t !== E_PYLON && t !== E_JELLY && t !== E_PUFFER && t !== E_TORPEDO) continue;
      if ((s.ef[i] & F_HIT) || (s.ef[i] & F_DONE && s.est[i] === 5)) continue;
      if (t === E_PUFFER && s.est[i] >= 4) continue;
      if (t === E_TORPEDO && (s.est[i] === 0 || s.est[i] >= 4)) continue;
      const vx = p.anc + (lerp(s.epx[i], s.ex[i], alpha.value) - dist);
      if (vx < -260 || vx > VIEW_W + 260) continue;
      const hp = s.grazeEnt === i || (s.ef[i] & F_PASS) ? near : halo;
      const isFlash = flashOn && p.closeEnt === i;
      if (t === E_PYLON) {
        const half = s.ep1[i] / 2;
        const top = s.ey[i] - half;
        const bot = s.ey[i] + half;
        const x0 = vx - 12;
        const x1 = vx + PYLON_W + 12;
        hp.addRRect(Skia.RRectXY(Skia.XYWHRect(x0 - 28, SURFACE_Y - 300, x1 - x0 + 56, top + 28 - (SURFACE_Y - 300)), 30, 30));
        hp.addRRect(Skia.RRectXY(Skia.XYWHRect(x0 - 28, bot - 28, x1 - x0 + 56, FLOOR_Y + 300 - (bot - 28)), 30, 30));
        rim.addRRect(Skia.RRectXY(Skia.XYWHRect(x0 + 6, SURFACE_Y - 300, x1 - x0 - 12, top - 6 - (SURFACE_Y - 300)), 10, 10));
        rim.addRRect(Skia.RRectXY(Skia.XYWHRect(x0 + 6, bot + 6, x1 - x0 - 12, FLOOR_Y + 300 - (bot + 6)), 10, 10));
        if (isFlash) {
          flash.addRRect(Skia.RRectXY(Skia.XYWHRect(x0, SURFACE_Y - 300, x1 - x0, top - (SURFACE_Y - 300)), 10, 10));
          flash.addRRect(Skia.RRectXY(Skia.XYWHRect(x0, bot, x1 - x0, FLOOR_Y + 300 - bot), 10, 10));
        }
      } else if (t === E_JELLY) {
        const jy = jellyY(s, i);
        const r = JELLY_R * 1.1;
        hp.addCircle(vx, jy, r + 28);
        rim.addCircle(vx, jy, r - 8);
        if (isFlash) flash.addCircle(vx, jy, r);
      } else if (t === E_PUFFER) {
        const r = pufferR(s, i) * 1.3;
        hp.addCircle(vx, s.ey[i], r + 28);
        rim.addCircle(vx, s.ey[i], r - 6);
        if (isFlash) flash.addCircle(vx, s.ey[i], r);
      } else {
        const sp = hazardSpan(s, i);
        const w = sp[1] - sp[0];
        hp.addRRect(Skia.RRectXY(Skia.XYWHRect(vx - w / 2 - 28, s.ey[i] - TORP_H / 2 - 28, w + 56, TORP_H + 56), 40, 40));
        rim.addRRect(Skia.RRectXY(Skia.XYWHRect(vx - w / 2 + 8, s.ey[i] - TORP_H / 2 + 8, w - 16, TORP_H - 16), 20, 20));
      }
    }
    return { halo, near, rim, flash };
  });
  const haloPath = useDerivedValue(() => hazardPaths.value.halo);
  const nearPath = useDerivedValue(() => hazardPaths.value.near);
  const rimPath = useDerivedValue(() => hazardPaths.value.rim);
  const flashPath = useDerivedValue(() => hazardPaths.value.flash);
  const rimOp = useDerivedValue(() => 0.8 + 0.2 * Math.sin((pres.value.fx / 1000) * 2 * Math.PI * 2));
  const hazardOp = useDerivedValue(() => (tick.value, sim.value.float > 0 ? 0.5 : 1));

  // --- floor blob shadow --------------------------------------------------------
  const shadowRect = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    const p = pres.value;
    const y = presSharkY(p, lerp(s.py, s.y, alpha.value) / 256);
    const k = clamp01((900 - y) / 800);
    const w = lerp(120, 70, k);
    return rect(p.anc - w / 2, FLOOR_Y - 9, w, 18);
  });
  const shadowOp = useDerivedValue(() => {
    const s = sim.value;
    const y = lerp(s.py, s.y, alpha.value) / 256;
    return lerp(0.3, 0.1, clamp01((900 - y) / 800));
  });

  // --- Frenzy ribbon: a tapered path through the tail tip's last 24 positions ---
  const ribbon = useDerivedValue(() => {
    tick.value;
    const p = pres.value;
    const path = Skia.Path.Make();
    const core = Skia.Path.Make();
    if (p.rN < 3) return { path, core };
    const dist = distV.value;
    const xs: number[] = [];
    const ys: number[] = [];
    for (let k = 0; k < p.rN; k++) {
      const j = (p.rHead - k + RIBBON_N * 4) % RIBBON_N;
      xs.push(p.anc + (p.rx[j] - dist));
      ys.push(p.ry[j]);
    }
    const n = xs.length;
    const left: number[] = [];
    const right: number[] = [];
    for (let k = 0; k < n; k++) {
      const k0 = Math.max(0, k - 1);
      const k1 = Math.min(n - 1, k + 1);
      let dx = xs[k1] - xs[k0];
      let dy = ys[k1] - ys[k0];
      const len = Math.max(0.001, Math.sqrt(dx * dx + dy * dy));
      dx /= len;
      dy /= len;
      const w = 13 * (1 - k / (n - 1));
      left.push(xs[k] - dy * w, ys[k] + dx * w);
      right.push(xs[k] + dy * w, ys[k] - dx * w);
    }
    path.moveTo(left[0], left[1]);
    for (let k = 1; k < n; k++) path.lineTo(left[k * 2], left[k * 2 + 1]);
    for (let k = n - 1; k >= 0; k--) path.lineTo(right[k * 2], right[k * 2 + 1]);
    path.close();
    core.moveTo(xs[0], ys[0]);
    for (let k = 1; k < Math.floor(n * 0.7); k++) core.lineTo(xs[k], ys[k]);
    return { path, core };
  });
  const ribbonPath = useDerivedValue(() => ribbon.value.path);
  const ribbonCore = useDerivedValue(() => ribbon.value.core);

  // --- bow wake (2 frames at 12fps, length by speed) ------------------------------
  const wake = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    const p = pres.value;
    const path = Skia.Path.Make();
    if (s.phase === PH_WIPE || s.phase === 3 || s.float > 0) return path;
    const y = presSharkY(p, lerp(s.py, s.y, alpha.value) / 256);
    const sf = (s.speed - s.speedBase) / Math.max(1, s.speedCap - s.speedBase);
    const len = (15 + 22 * sf) * (s.frenzy > 0 ? 1.5 : 1);
    const nx = p.anc + SHARK_W * 0.5 - 6;
    const f = Math.floor(p.fx / 83.333) % 2;
    const sp = 10 + f * 4;
    path.moveTo(nx, y - 8);
    path.quadTo(nx + sp, y - 14, nx - len * 0.2, y - 20 - len * 0.3);
    path.moveTo(nx, y + 8);
    path.quadTo(nx + sp, y + 14, nx - len * 0.2, y + 20 + len * 0.3);
    return path;
  });

  // --- Perfect shockwave: 16 -> 60pt over 180ms, 4pt line thinning to 1pt ----------
  const shock = useDerivedValue(() => {
    tick.value;
    const p = pres.value;
    const t = p.fx - p.perfT;
    if (t < 0 || t > 180) return { r: 0, w: 0, x: -999, y: -999 };
    const k = 1 - (1 - t / 180) * (1 - t / 180) * (1 - t / 180);
    return { r: lerp(30, 110, k), w: lerp(7.4, 1.8, t / 180), x: p.anc, y: p.perfY };
  });
  const shockR = useDerivedValue(() => shock.value.r);
  const shockW = useDerivedValue(() => shock.value.w);
  const shockX = useDerivedValue(() => shock.value.x);
  const shockY = useDerivedValue(() => shock.value.y);

  // --- stamps: drawn word art, one at a time ----------------------------------------
  const stampState = useDerivedValue(() => {
    tick.value;
    const p = pres.value;
    const id = p.stamp;
    const t = p.fx - p.stampT;
    const banner = isBanner(id);
    const hold = banner ? 900 : 380;
    const total = 150 + hold + 200;
    if (id === 0 || t < 0 || t > total) return { id: 0, sc: 0, sy: 1, op: 0, x: 0, y: 0, w: 0 };
    let sc = 1;
    let sy = 1;
    let op = 1;
    let dy = 0;
    if (t < 90) sc = lerp(0.6, 1.15, outBack(t / 90, 1.7));
    else if (t < 150) sc = lerp(1.15, 1, (t - 90) / 60);
    if (t < 17) sy = 0.85;
    if (t > 150 + hold) {
      const k = (t - 150 - hold) / 200;
      op = 1 - k;
      dy = -22 * k;
    }
    if (reducedMotion) {
      sc = 1;
      sy = 1;
    }
    const w = banner ? 470 : 250;
    const x = banner ? VIEW_W / 2 : Math.min(VIEW_W - w / 2 - 20, p.stampX + 30);
    const y = banner ? 210 : Math.max(120, p.stampY);
    return { id, sc, sy, op, x, y: y + dy, w };
  });

  // --- warning badges (fin-shaped, at the hazard's own y) -----------------------------
  const badges = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    const p = pres.value;
    const dist = distV.value;
    const edge = dist + (VIEW_W - p.anc);
    const lead = (Math.max(s.speedEff, s.speed) / 256) * 0.6 || 1;
    const out: number[] = [p.fx];
    for (let i = 0; i < ENT_CAP && out.length < 1 + BADGES * 7; i++) {
      const t = s.et[i];
      if (t !== E_PYLON && t !== E_JELLY && t !== E_PUFFER && t !== E_TORPEDO) continue;
      if (!(s.ef[i] & F_BADGE) || (s.ef[i] & F_HIT)) continue;
      if (t === E_TORPEDO) {
        const st = s.est[i];
        if (st !== 1 && st !== 2) continue;
        const flash = st === 2 ? (Math.floor(p.fx / 50) % 2 ? 1 : 0.4) : 1;
        out.push(3, s.ey[i], s.ey[i] - TORP_H / 2, s.ey[i] + TORP_H / 2, flash, 1, st === 2 ? 1 : 0);
        continue;
      }
      const sp = hazardSpan(s, i);
      const ahead = sp[0] - edge;
      if (ahead < -80 || ahead > lead) continue;
      const slide = clamp01((lead - ahead) / (lead * 0.2));
      const fade = ahead < 0 ? clamp01(1 + ahead / 80) : 1;
      if (t === E_PYLON) {
        const half = s.ep1[i] / 2;
        out.push(0, s.ey[i], s.ey[i] - half, s.ey[i] + half, fade, slide, 0);
      } else {
        const y = t === E_JELLY ? jellyY(s, i) : s.ey[i];
        const r = t === E_JELLY ? JELLY_R : PUFF_R1;
        out.push(t === E_JELLY ? 1 : 2, y, y - r, y + r, fade, slide, 0);
      }
    }
    return out;
  });
  const badgePaint = useMemo(() => {
    const pt = Skia.Paint();
    pt.setColorFilter(Skia.ColorFilter.MakeBlend(Skia.Color(DANGER), BlendMode.Multiply));
    return pt;
  }, []);

  // --- Gate Rush bunting drops in at the top during the rush -------------------------
  const buntingT = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    const k = clamp01(s.rushK / 288);
    return [{ translateX: -((distV.value * 1.1) % 512) }, { translateY: lerp(-160, 0, outBack(k, 1.4)) }];
  });

  const skyTile = useMemo(() => {
    const band = Math.max(1, L.offY + SURFACE_Y * L.k + 6);
    const R = 470 / 768;
    const hPt = Math.max(band / R, 160);
    return { w: hPt * (2048 / 768), h: hPt, y: band - hPt * R };
  }, [L]);
  const skyX = useDerivedValue(() => [{ translateX: -((distV.value * 0.06 * L.k) % (skyTile.w * 2)) }]);
  const inkLayer = useMemo(() => {
    const pt = Skia.Paint();
    pt.setColorFilter(Skia.ColorFilter.MakeBlend(Skia.Color('rgba(35,56,79,0.7)'), BlendMode.SrcIn));
    return pt;
  }, []);

  const q = quality;
  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* Graded background: water, rays, caustics, far reef, floor strip, arches. */}
      <Group layer={gradeLayer}>
        <Rect x={0} y={0} width={L.w} height={L.h}>
          <LinearGradient start={vec(0, L.offY)} end={vec(0, L.offY + FLOOR_Y * L.k)} colors={waterColors} />
        </Rect>
        <Group transform={worldTransform}>
          <Group transform={rayTransform} origin={vec(360, SURFACE_Y)} opacity={q < 2 ? 1 : 0}>
            {rayPaths.map((p, i) => (
              <Path key={i} path={p}>
                <LinearGradient start={vec(0, SURFACE_Y)} end={vec(0, 300)} colors={['rgba(255,255,255,0.10)', 'rgba(255,255,255,0)']} />
              </Path>
            ))}
          </Group>
          {caustic ? (
            <Rect x={-80} y={SURFACE_Y} width={q === 0 ? VIEW_W + 160 : 0} height={q === 0 ? 260 : 0}>
              <Shader source={caustic} uniforms={causticUniforms} />
            </Rect>
          ) : null}
          {farReef ? (
            <Group transform={farX} opacity={0.5}>
              {[0, 1, 2].map((k) => (
                <Group key={k} transform={k % 2 === 1 ? [{ translateX: -60 + (k + 1) * FAR.w }, { scaleX: -1 }] : [{ translateX: -60 + k * FAR.w }]}>
                  <SkImage image={farReef} x={0} y={FLOOR_Y + 30 - FAR.h} width={q < 2 ? FAR.w : 0} height={q < 2 ? FAR.h : 0} />
                </Group>
              ))}
            </Group>
          ) : null}
          <Group transform={reefX}>
            {[0, 1, 2].map((k) => (reefMid ? <SkImage key={k} image={reefMid} x={-60 + k * REEF.w} y={FLOOR_Y + 40 - REEF.h} width={REEF.w} height={REEF.h} opacity={0.85} /> : null))}
          </Group>
          <Gates sim={sim} pres={pres} tick={tick} alpha={alpha} tideArt={tideGate} rideArt={rideGate} part="arch" />
        </Group>
      </Group>

      <Group transform={worldTransform}>
        {/* Sand floor */}
        <Rect x={-300} y={FLOOR_Y - 4} width={VIEW_W + 600} height={1400}>
          <LinearGradient start={vec(0, FLOOR_Y)} end={vec(0, FLOOR_Y + 300)} colors={['#f7e3b0', '#ecc987']} />
        </Rect>
        <Rect x={-300} y={FLOOR_Y - 6} width={VIEW_W + 600} height={5} color={INK} opacity={0.55} />
        <Oval rect={shadowRect} color={INK} opacity={shadowOp} />

        {atlas ? <Atlas image={atlas.image} sprites={back.sprites} transforms={back.transforms} colors={backColors} blendMode="modulate" /> : null}

        <Rivals sim={sim} pres={pres} rivals={rivals} tick={tick} alpha={alpha} swim={swim} colors={rivalColors} />
        <Gates sim={sim} pres={pres} tick={tick} alpha={alpha} tideArt={tideGate} rideArt={rideGate} part="line" />

        {/* Graze halos: white = where to be */}
        <Group opacity={hazardOp}>
          <Path path={haloPath} style="stroke" strokeWidth={5.5} color={NEUTRAL} opacity={0.3} />
          <Path path={nearPath} style="stroke" strokeWidth={6.5} color={NEUTRAL} opacity={0.7} />
        </Group>

        <Rings sim={sim} pres={pres} tick={tick} alpha={alpha} image={ringImg} half="back" />

        {atlas ? (
          <Group opacity={hazardOp}>
            {q === 0 ? (
              <Group transform={[{ translateY: 7.4 }]} layer={shadowPaint}>
                <Atlas image={atlas.image} sprites={world.sprites} transforms={world.transforms} colors={worldColors} blendMode="modulate" />
              </Group>
            ) : null}
            <Atlas image={atlas.image} sprites={world.sprites} transforms={world.transforms} colors={worldColors} blendMode="modulate" />
          </Group>
        ) : null}

        {/* Coral danger rims: coral = what not to touch (2Hz pulse) */}
        <Group opacity={hazardOp}>
          <Path path={rimPath} style="stroke" strokeWidth={5.5} color={DANGER} opacity={rimOp} />
        </Group>
        <Path path={flashPath} style="stroke" strokeWidth={5.5} color={NEUTRAL} />

        {/* Frenzy ribbon */}
        <Path path={ribbonPath} color={REWARD} />
        <Path path={ribbonPath} style="stroke" strokeWidth={2.5} color={INK} opacity={0.6} />
        <Path path={ribbonCore} style="stroke" strokeWidth={2.5} color={NEUTRAL} opacity={0.9} />

        <SharkSprite sim={sim} pres={pres} tick={tick} alpha={alpha} swim={swim} dash={dashImg} dizzy={dizzy} bonked={bonked} cheer={cheer} bubble={bubble} font={font} reducedMotion={reducedMotion} />
        <Rings sim={sim} pres={pres} tick={tick} alpha={alpha} image={ringImg} half="front" />

        <Path path={wake} style="stroke" strokeWidth={7} strokeCap="round" color={INK} opacity={0.5} />
        <Path path={wake} style="stroke" strokeWidth={4} strokeCap="round" color={NEUTRAL} opacity={0.9} />
        <Circle cx={shockX} cy={shockY} r={shockR} style="stroke" strokeWidth={shockW} color={NEUTRAL} />

        {/* Ink kelp and rope strips (1.4x): only above y 150 and below y 850 */}
        {reefNear ? (
          <Group opacity={q < 2 ? 1 : 0}>
            <Group clip={rect(-300, 850, VIEW_W + 600, 600)} layer={inkLayer}>
              <Group transform={nearX}>
                {[0, 1, 2].map((k) => (
                  <Group key={k} transform={k % 2 === 1 ? [{ translateX: -60 + (k + 1) * NEAR.w }, { scaleX: -1 }] : [{ translateX: -60 + k * NEAR.w }]}>
                    <SkImage image={reefNear} x={0} y={FLOOR_Y + 150 - NEAR.h} width={NEAR.w} height={NEAR.h} />
                  </Group>
                ))}
              </Group>
            </Group>
            <Group clip={rect(-300, -400, VIEW_W + 600, 550)} layer={inkLayer}>
              <Group transform={nearX}>
                {[0, 1, 2].map((k) => (
                  <Group key={k} transform={[{ translateX: -260 + k * NEAR.w }, { translateY: SURFACE_Y - 170 }, { scaleY: -1 }, { translateY: -NEAR.h }]}>
                    <SkImage image={reefNear} x={0} y={0} width={NEAR.w} height={NEAR.h} opacity={0.8} />
                  </Group>
                ))}
              </Group>
            </Group>
          </Group>
        ) : null}

        <Stamps state={stampState} images={stampImgs} />
        <Badges list={badges} fin={finBadge} paint={badgePaint} icons={[cap, jelly, puff, boat]} />
        {bunting ? (
          <Group transform={buntingT}>
            {[0, 1, 2].map((k) => <SkImage key={k} image={bunting} x={-60 + k * 512} y={SURFACE_Y - 20} width={512} height={170} />)}
          </Group>
        ) : null}
      </Group>

      <SkyBand sky={sky} layout={L} tile={skyTile} skyX={skyX} surface={surfacePath} pres={pres} />
    </Canvas>
  );
});

// ---------------------------------------------------------------------------
// Sky band: art clipped by the animated water surface line.
// ---------------------------------------------------------------------------
const SkyBand = React.memo(function SkyBand({ sky, layout: L, tile, skyX, surface, pres }: {
  sky: SkImageType | null; layout: SharkyLayout; tile: { w: number; h: number; y: number };
  skyX: SharedValue<{ translateX: number }[]>; surface: SharedValue<ReturnType<typeof Skia.Path.Make>>; pres: SharedValue<Pres>;
}) {
  const clipPath = useDerivedValue(() => {
    const p = surface.value.copy();
    p.transform(Skia.Matrix().translate(L.offX, L.offY + pres.value.camY * L.k).scale(L.k, L.k));
    return p;
  });
  const tiles = useMemo(() => [0, 1, 2, 3], []);
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
      <Path path={clipPath} style="stroke" strokeWidth={Math.max(2, 3 * L.k * 1.6)} color={NEUTRAL} opacity={0.95} />
    </Group>
  );
});

// ---------------------------------------------------------------------------
// Gates: the 60% arch set piece (background) and the bunting line (world).
// ---------------------------------------------------------------------------
const ARCH_H = 606;
const ARCH_W = (ARCH_H * 384) / 351;
const Gates = React.memo(function Gates({ sim, pres, tick, alpha, tideArt, rideArt, part }: {
  sim: SharedValue<SimState>; pres: SharedValue<Pres>; tick: SharedValue<number>; alpha: SharedValue<number>;
  tideArt: SkImageType | null; rideArt: SkImageType | null; part: 'arch' | 'line';
}) {
  const list = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    const p = pres.value;
    const dist = lerp(s.pdist, s.dist, alpha.value) / 256;
    const out: number[] = [];
    for (let i = 0; i < ENT_CAP && out.length < 6; i++) {
      if (s.et[i] !== E_GATE) continue;
      const vx = p.anc + (s.ex[i] - dist);
      if (vx < -500 || vx > VIEW_W + 500) continue;
      out.push(vx, s.ep1[i], p.fx / 1000);
    }
    return out;
  });
  if (part === 'arch') {
    return (
      <Group>
        <GateArch i={0} list={list} tide={tideArt} ride={rideArt} />
        <GateArch i={1} list={list} tide={tideArt} ride={rideArt} />
      </Group>
    );
  }
  return (
    <Group>
      <GateLine i={0} list={list} />
      <GateLine i={1} list={list} />
    </Group>
  );
});

function GateArch({ i, list, tide, ride }: { i: number; list: SharedValue<number[]>; tide: SkImageType | null; ride: SkImageType | null }) {
  const st = useDerivedValue(() => {
    const l = list.value;
    const o = i * 3;
    if (o >= l.length) return { x: -9999, ride: 0, t: 0 };
    const big = l[o + 1] === G_RIDE || l[o + 1] === G_FINISH;
    return { x: l[o], ride: big ? 1 : 0, t: l[o + 2] };
  });
  const tr = useDerivedValue(() => {
    const v = st.value;
    const b = 1 + 0.015 * Math.sin(v.t * 3.1);
    return [{ translateX: v.x }, { translateY: 480 + ARCH_H / 2 }, { scale: b }];
  });
  const tideOp = useDerivedValue(() => (st.value.x < -9000 || st.value.ride ? 0 : 0.9));
  const rideOp = useDerivedValue(() => (st.value.x < -9000 || !st.value.ride ? 0 : 1));
  return (
    <Group transform={tr}>
      {tide ? <SkImage image={tide} x={-ARCH_W / 2} y={-ARCH_H} width={ARCH_W} height={ARCH_H} opacity={tideOp} /> : null}
      {ride ? <SkImage image={ride} x={-ARCH_W / 2} y={-ARCH_H} width={ARCH_W} height={ARCH_H} opacity={rideOp} /> : null}
    </Group>
  );
}

function GateLine({ i, list }: { i: number; list: SharedValue<number[]> }) {
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
      for (let y = SURFACE_Y + 20; y < FLOOR_Y; y += 46) split.addRRect(Skia.RRectXY(Skia.XYWHRect(x - 5, y, 10, 26), 5, 5));
      return { rope, flags, split };
    }
    // Bunting line across the arch opening; flags wave at 3Hz.
    const y0 = 220;
    const y1 = 780;
    rope.moveTo(x, y0);
    rope.quadTo(x + 22 + Math.sin(t * 2) * 6, (y0 + y1) / 2, x, y1);
    for (let k = 0; k < 7; k++) {
      const y = y0 + 20 + k * ((y1 - y0 - 40) / 6);
      const bow = Math.sin((k / 6) * Math.PI) * 18;
      const wave = Math.sin(t * 6.28 * 3 + k) * 7;
      flags.moveTo(x + bow, y - 15);
      flags.lineTo(x + bow + 40 + wave, y);
      flags.lineTo(x + bow, y + 15);
      flags.close();
    }
    return { rope, flags, split };
  });
  const rope = useDerivedValue(() => paths.value.rope);
  const flags = useDerivedValue(() => paths.value.flags);
  const split = useDerivedValue(() => paths.value.split);
  return (
    <Group>
      <Path path={split} color={NEUTRAL} opacity={0.9} />
      <Path path={split} style="stroke" strokeWidth={3} color={INK} opacity={0.5} />
      <Path path={rope} style="stroke" strokeWidth={5} color={INK} />
      <Path path={flags} color={REWARD} />
      <Path path={flags} style="stroke" strokeWidth={4} color={INK} />
    </Group>
  );
}

// ---------------------------------------------------------------------------
// Rings: drawn side-on in two halves so the shark swims THROUGH them.
// ---------------------------------------------------------------------------
const Rings = React.memo(function Rings({ sim, pres, tick, alpha, image, half }: {
  sim: SharedValue<SimState>; pres: SharedValue<Pres>; tick: SharedValue<number>; alpha: SharedValue<number>; image: SkImageType | null; half: 'back' | 'front';
}) {
  const list = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    const p = pres.value;
    const dist = lerp(s.pdist, s.dist, alpha.value) / 256;
    const out: number[] = [];
    for (let i = 0; i < ENT_CAP && out.length < RINGS * 3; i++) {
      if (s.et[i] !== E_RING) continue;
      const vx = p.anc + (s.ex[i] - dist);
      if (vx < -140 || vx > VIEW_W + 140) continue;
      // The Perfect ring freezes with the shark for 50ms (local freeze).
      out.push(vx, s.ey[i], s.ef[i] & F_DONE ? 1 : 0);
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
  const H = RING_R * 2 + 48;
  const W = H * 0.42;
  const tr = useDerivedValue(() => {
    const l = list.value;
    const o = i * 3;
    if (o >= l.length) return [{ translateX: -9999 }, { translateY: 0 }];
    return [{ translateX: l[o] }, { translateY: l[o + 1] }];
  });
  const op = useDerivedValue(() => {
    const l = list.value;
    const o = i * 3;
    return o < l.length && l[o + 2] ? 0.55 : half === 'back' ? 0.85 : 1;
  });
  const clip = useMemo(() => (half === 'back' ? rect(-W, -H, W, H * 2) : rect(0, -H, W, H * 2)), [half, W, H]);
  return (
    <Group transform={tr}>
      <Group clip={clip}>
        <SkImage image={image} x={-W / 2} y={-H / 2} width={W} height={H} fit="fill" opacity={op} />
      </Group>
    </Group>
  );
}

// ---------------------------------------------------------------------------
// Stamps: the drawn word art, one on screen at a time (design 7.2).
// ---------------------------------------------------------------------------
function Stamps({ state, images }: { state: SharedValue<{ id: number; sc: number; sy: number; op: number; x: number; y: number; w: number }>; images: Array<SkImageType | null> }) {
  return (
    <Group>
      {images.map((img, id) => (id === 0 || !img ? null : <Stamp key={id} id={id} state={state} image={img} />))}
    </Group>
  );
}

function Stamp({ id, state, image }: { id: number; state: SharedValue<{ id: number; sc: number; sy: number; op: number; x: number; y: number; w: number }>; image: SkImageType }) {
  const aspect = image.height() / Math.max(1, image.width());
  const tr = useDerivedValue(() => {
    const s = state.value;
    return [{ translateX: s.x }, { translateY: s.y }, { scaleX: s.sc }, { scaleY: s.sc * s.sy }];
  });
  const op = useDerivedValue(() => (state.value.id === id ? state.value.op : 0));
  const w = useDerivedValue(() => (state.value.id === id ? state.value.w : 0));
  const h = useDerivedValue(() => w.value * aspect);
  const x = useDerivedValue(() => -w.value / 2);
  const y = useDerivedValue(() => -h.value / 2);
  return (
    <Group transform={tr} opacity={op}>
      <SkImage image={image} x={x} y={y} width={w} height={h} />
    </Group>
  );
}
void STAMP_N;

// ---------------------------------------------------------------------------
// Warning badges: drawn shark-fin badges, coral, at the hazard's y (design 4.1).
// ---------------------------------------------------------------------------
function Badges({ list, fin, paint, icons }: { list: SharedValue<number[]>; fin: SkImageType | null; paint: ReturnType<typeof Skia.Paint>; icons: Array<SkImageType | null> }) {
  if (!fin) return null;
  return (
    <Group>
      {Array.from({ length: BADGES }, (_, i) => <Badge key={i} i={i} list={list} fin={fin} paint={paint} icons={icons} />)}
    </Group>
  );
}

function Badge({ i, list, fin, paint, icons }: { i: number; list: SharedValue<number[]>; fin: SkImageType; paint: ReturnType<typeof Skia.Paint>; icons: Array<SkImageType | null> }) {
  const S = 74; // 40pt tall on the reference phone
  const st = useDerivedValue(() => {
    const l = list.value;
    const o = 1 + i * 7;
    if (o >= l.length) return { on: 0, kind: 0, y: -999, y0: 0, y1: 0, op: 0, x: VIEW_W + 200, pulse: 1, lock: 0 };
    const slide = l[o + 5];
    const e = outBack(clamp01(slide), 1.6);
    const x = VIEW_W + 60 - 100 * e;
    // Pulse 1.0 to 1.15 at 6Hz (art only), on the fx clock.
    const pulse = 1 + 0.075 * (1 + Math.sin((l[0] / 1000) * 2 * Math.PI * 6));
    return { on: 1, kind: l[o], y: Math.max(SURFACE_Y + 50, Math.min(FLOOR_Y - 50, l[o + 1])), y0: l[o + 2], y1: l[o + 3], op: l[o + 4], x, pulse, lock: l[o + 6] };
  });
  const tr = useDerivedValue(() => [{ translateX: st.value.x }, { translateY: st.value.y }, { scale: st.value.pulse }]);
  const op = useDerivedValue(() => st.value.op);
  const bracket = useDerivedValue(() => {
    const v = st.value;
    const p = Skia.Path.Make();
    if (!v.on) return p;
    const bx = VIEW_W - 14;
    if (v.kind === 0) {
      // Pylon: two brackets with the gap left open.
      const top = Math.max(SURFACE_Y + 8, v.y0);
      const bot = Math.min(FLOOR_Y - 8, v.y1);
      p.moveTo(bx - 14, SURFACE_Y + 8); p.lineTo(bx, SURFACE_Y + 8); p.lineTo(bx, top); p.lineTo(bx - 14, top);
      p.moveTo(bx - 14, bot); p.lineTo(bx, bot); p.lineTo(bx, FLOOR_Y - 8); p.lineTo(bx - 14, FLOOR_Y - 8);
    } else {
      p.moveTo(bx - 14, v.y0); p.lineTo(bx, v.y0); p.lineTo(bx, v.y1); p.lineTo(bx - 14, v.y1);
    }
    return p;
  });
  const chevron = useMemo(() => {
    const p = Skia.Path.Make();
    p.moveTo(-S * 0.62, 0);
    p.lineTo(-S * 0.42, -14);
    p.lineTo(-S * 0.42, 14);
    p.close();
    return p;
  }, []);
  const aim = useDerivedValue(() => {
    const v = st.value;
    const p = Skia.Path.Make();
    if (v.kind !== 3 || !v.lock) return p;
    // Torpedo lock: a dotted coral aim line across the whole lane.
    for (let x = 30; x < VIEW_W - 60; x += 34) p.addRRect(Skia.RRectXY(Skia.XYWHRect(x, v.y - 4, 18, 8), 4, 4));
    return p;
  });
  const iconOp = (k: number) => useDerivedValue(() => (st.value.kind === k ? 1 : 0));
  const ic = [iconOp(0), iconOp(1), iconOp(2), iconOp(3)];
  return (
    <Group opacity={op}>
      <Path path={bracket} style="stroke" strokeWidth={9} strokeCap="round" color={INK} />
      <Path path={bracket} style="stroke" strokeWidth={5} strokeCap="round" color={DANGER} />
      <Path path={aim} color={DANGER} opacity={0.85} />
      <Group transform={tr}>
        <Group layer={paint}>
          <SkImage image={fin} x={-S / 2} y={-S / 2} width={S} height={S} />
        </Group>
        {icons.map((img, k) => (img ? (
          <SkImage key={k} image={img} x={-S * 0.2} y={-S * 0.18} width={S * 0.38} height={S * 0.38} fit="contain" opacity={ic[k]} />
        ) : null))}
        <Path path={chevron} color={NEUTRAL} />
        <Path path={chevron} style="stroke" strokeWidth={3} color={INK} />
      </Group>
    </Group>
  );
}

// ---------------------------------------------------------------------------
// Rivals and ghosts: behind hazards and the shark, 0.85 scale, body at 40%
// saturation and 0.55 alpha with a 2pt player-colour outline; they fade to 0.2
// when they overlap your shark (Trackmania fade-through, design 7.10).
// ---------------------------------------------------------------------------
const Rivals = React.memo(function Rivals({ sim, pres, rivals, tick, alpha, swim, colors }: {
  sim: SharedValue<SimState>; pres: SharedValue<Pres>; rivals: SharedValue<RivalSlot[]>; tick: SharedValue<number>; alpha: SharedValue<number>;
  swim: SkImageType | null; colors: string[];
}) {
  const list = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    const p = pres.value;
    const a = alpha.value;
    const dist = lerp(s.pdist, s.dist, a) / 256;
    const myY = lerp(s.py, s.y, a) / 256;
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
      const gap = d - dist;
      // Beyond +-160u the sprite hides (the rail and pills show the gap).
      if (gap > 160 || gap < -160) {
        out.push(-9999, 0, 0, 0);
        continue;
      }
      let tilt = vy / 1400;
      if (tilt < -0.45) tilt = -0.45;
      if (tilt > 0.55) tilt = 0.55;
      const overlap = Math.abs(gap) < 60 && Math.abs(y - myY) < 60 ? 0.2 : 0.55;
      out.push(p.anc + gap, y, tilt, overlap);
    }
    return out;
  });
  if (!swim) return null;
  return (
    <Group>
      {Array.from({ length: RIVAL_N }, (_, j) => <RivalShark key={j} j={j} list={list} swim={swim} color={colors[j] ?? NEUTRAL} />)}
    </Group>
  );
});

function RivalShark({ j, list, swim, color }: { j: number; list: SharedValue<number[]>; swim: SkImageType; color: string }) {
  const W = SHARK_W * 0.85;
  const H = SHARK_H * 0.85;
  const tr = useDerivedValue(() => {
    const l = list.value;
    return [{ translateX: l[j * 4] }, { translateY: l[j * 4 + 1] }, { rotate: l[j * 4 + 2] }];
  });
  const op = useDerivedValue(() => list.value[j * 4 + 3]);
  const outline = useMemo(() => {
    const p = Skia.Paint();
    p.setImageFilter(Skia.ImageFilter.MakeColorFilter(Skia.ColorFilter.MakeBlend(Skia.Color(color), BlendMode.SrcIn), Skia.ImageFilter.MakeDilate(4, 4, null)));
    return p;
  }, [color]);
  const desat = useMemo(() => {
    const p = Skia.Paint();
    const s = 0.4;
    const lr = 0.2126 * (1 - s);
    const lg = 0.7152 * (1 - s);
    const lb = 0.0722 * (1 - s);
    p.setColorFilter(Skia.ColorFilter.MakeMatrix([lr + s, lg, lb, 0, 0, lr, lg + s, lb, 0, 0, lr, lg, lb + s, 0, 0, 0, 0, 0, 1, 0]));
    return p;
  }, []);
  return (
    <Group transform={tr} opacity={op}>
      <Group layer={outline}>
        <SkImage image={swim} x={-W / 2} y={-H / 2} width={W} height={H} />
      </Group>
      <Group layer={desat}>
        <SkImage image={swim} x={-W / 2} y={-H / 2} width={W} height={H} />
      </Group>
    </Group>
  );
}

// ---------------------------------------------------------------------------
// Toon caustics: cell lines posterized to one hard tone (Alex's cel style),
// background band only (y 40 to 300), alpha down with speed.
// ---------------------------------------------------------------------------
const CAUSTIC_SKSL = `
uniform float t;
uniform float off;
uniform float strength;
float hash(float2 p) { return fract(sin(dot(p, float2(127.1, 311.7))) * 43758.5453); }
half4 main(float2 xy) {
  float2 p = float2(xy.x + off, xy.y) / 96.0;
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
  float fade = clamp(1.0 - (xy.y - 40.0) / 260.0, 0.0, 1.0);
  float a = line * strength * fade;
  return half4(a, a, a, a);
}
`;

export { SLOTS as SHARKY_ATLAS_SLOTS };
void E_COIN; void REWARD_LIGHT; void HAZE; void FRENZY_WATER; void hexToRgb;
