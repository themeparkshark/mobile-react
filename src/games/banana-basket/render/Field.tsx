/**
 * Banana Basket field (design rev 8, sections 7 and 12.2): ONE Skia canvas,
 * everything driven by shared values (zero React renders during play).
 *
 * World layers (back to front, inside the camera group): sky + posterized
 * rays, Alex's clouds (wobble on the beat), hills and the flat plaza (the AI
 * plate waits for Dustin's OK, 7.8), splat decals, the coaster track with
 * hanging-prize strings, Finn's snack cart, landing shadows / Excellent rings
 * / coral puffer shadows / gull shadow / blue ball marker, the free-ball
 * pail, the shark (Rig B key holds, 18 deg lean, cap and squash), Golden Hour
 * halo underlays, items and prizes (one Atlas draw, hidden by the Veil),
 * the pile and splats (second Atlas draw), the basket (counter-rotated so the
 * rim stays within 4 deg) with its gold notch and 4 zone seams, the aim
 * ghost-line, the ribbon trail and the ball, gulls, POW flipbook, the parked
 * shield bubble, the head chip, the Veil, and the lock ring at the thumb.
 *
 * HUD (no camera): Golden Hour frame, hearts, time bar, star meter with
 * notches and NEXT STAR, set pips, the rival portrait / heat strip, stamps.
 *
 * All drawing is in field units (400 x 720 logical): the root group scales
 * by k = width / 400 and adds extra sky on tall phones.
 */

import React, { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import {
  Atlas, BlendColor, Canvas, Circle, Group, Image as SkImage, LinearGradient, Oval, Path, Rect, RoundedRect, Skia, Text,
  rect, useFont, useImage, useRSXformBuffer, useRectBuffer, vec, type SkImage as SkImageT, type Transforms3d,
} from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { useSpriteAtlas } from '../../../gamekit/fx/SpriteAtlas';
import {
  BALL_ARC_BOUNCES, BALL_R, FIELD_H, FIELD_W, HALF_ZONE, ITEM_SIZE, K_BANANA, K_BUNCH, K_COIN, K_LUCKY, K_PUFFER, LANE_Y,
  LOCK_STEPS, MAX_PRIZES, PERFECT_D, PLAZA_Y, PRIZE_R, S_BONKED, S_DUNK, S_FALL, S_FREE, S_HANG, S_MISS, S_PASS, S_POP,
  S_REEL, STEPS_BEAT, SUB, TWIST_GIANT, ZONE_CENTER, ZONE_INNER,
} from '../constants';
import { MAX_ITEMS, MODE_QUEUE, ballIsLive, gatedTier, tierOf, type SimState } from '../state';
import { gullX, gullY, zoneOf } from '../sim';
import { pailX, zoneArc } from '../patterns';
import {
  MAX_SPLATS, POSE_BONKED, POSE_CHEER, POSE_CHOMP, POSE_DIZZY, POSE_FIST, POSE_GRIN, POSE_HOP, POSE_IDLE, POSE_SLUMP,
  POSE_STRAIN, STAMP_TEXT, ST_GOLDEN, ST_NONE, ST_OUT, ST_POP, ST_TIME, stampIsBig, type Vis,
} from './vis';
import type { Ghost } from '../ghost';
import type { HeatStripEntry } from '../heat';

export interface FieldLayout {
  width: number;
  height: number;
  k: number;
  /** Extra sky above the logical field (px). */
  oy: number;
}

export function fieldLayout(width: number, height: number): FieldLayout {
  const k = width / FIELD_W;
  const oy = Math.max(0, height - FIELD_H * k);
  return { width, height, k, oy };
}

/** fu -> px inside the field container (FxStage coordinates). */
export function toPx(l: FieldLayout, xFu: number, yFu: number): { x: number; y: number } {
  return { x: xFu * l.k, y: yFu * l.k + l.oy };
}

// Sprite atlas indices.
const SP_BANANA = 0;
const SP_BUNCH = 1;
const SP_COIN = 2;
const SP_PUFFER = 3;
const SP_PUFFER_FULL = 4;
const SP_JUICE = 5;
const SP_GLINT = 6;

const SLOT_ITEMS = MAX_ITEMS;
const SLOTS_A = SLOT_ITEMS + MAX_PRIZES;
const SLOT_PILE = 12;
const SLOTS_B = SLOT_PILE + MAX_SPLATS;
const PILE_AT = [1, 3, 6, 8, 11, 15, 20, 25, 32, 40, 50, 64];

const SHARK_H = 150;
const SHARK_W = (SHARK_H * 418) / 576;
// Normalized hold poses (tools/banana/prep-poses.py): 640 x 600 canvases at
// one character scale; FIN_Y is where the fins grip the (separate) basket rim.
const POSE_S = 0.27;
const POSE_W = 640 * POSE_S;
const POSE_H = 600 * POSE_S;
/** Fin grip line per drawn pose (canvas px), index = POSE_* id. */
const FIN_Y = [360, 380, 360, 360, 360, 450, 360, 367, 450, 360];
const BASKET_W = 142;
const BASKET_H = (BASKET_W * 332) / 384;
const BASKET_RIM = 0.3;
const INK = '#23263a';
const CORAL = '#ff5a4e';
const GOLD = '#fec90e';
const BLUE = '#2d9cff';
const TIER_COLORS = [INK, INK, BLUE, GOLD, CORAL];
const TIME_X = 112;
const TIME_W = 262;
const TRACK_Y = 116;
const CHIP_Y = LANE_Y - 168;

export interface FieldImages {
  poseIdle: SkImageT | null;
  poseHop: SkImageT | null;
  poseChomp: SkImageT | null;
  poseFlinch: SkImageT | null;
  poseCheer: SkImageT | null;
  sharkFacepalm: SkImageT | null;
  cart: SkImageT | null;
  finn: SkImageT | null;
  gullGlide: SkImageT | null;
  gullUp: SkImageT | null;
  plop: (SkImageT | null)[];
  pow: (SkImageT | null)[];
  fxSheet: SkImageT | null;
  sharkDizzy: SkImageT | null;
  sharkFist: SkImageT | null;
  basket: SkImageT | null;
  ball: SkImageT | null;
  heart: SkImageT | null;
  coin: SkImageT | null;
  crown: SkImageT | null;
  pail: SkImageT | null;
  timer: SkImageT | null;
  rush: SkImageT | null;
  streak: SkImageT | null;
  cloud: SkImageT | null;
  starburst: SkImageT | null;
}

export function useFieldImages(): FieldImages & { atlasSources: (SkImageT | null)[] } {
  const banana = useImage(require('../../../assets/games/banana-basket/v2/banana.png'));
  const bunch = useImage(require('../../../assets/games/banana-basket/v2/bunch.png'));
  const coin = useImage(require('../../../assets/games/banana-basket/v2/coin.png'));
  const puffer = useImage(require('../../../assets/games/banana-basket/v2/puffer.png'));
  const pufferFull = useImage(require('../../../assets/games/banana-basket/v2/puffer_full.png'));
  const juice = useImage(require('../../../assets/games/banana-basket/v2/juice_a.png'));
  const glint = useImage(require('../../../assets/games/banana-basket/v2/glint.png'));
  const plop0 = useImage(require('../../../assets/games/banana-basket/v2/plop_0.png'));
  const plop1 = useImage(require('../../../assets/games/banana-basket/v2/plop_1.png'));
  const plop2 = useImage(require('../../../assets/games/banana-basket/v2/plop_2.png'));
  const plop3 = useImage(require('../../../assets/games/banana-basket/v2/plop_3.png'));
  const powS = useImage(require('../../../assets/games/banana-basket/v2/pow_s.png'));
  const powM = useImage(require('../../../assets/games/banana-basket/v2/pow_m.png'));
  const powL = useImage(require('../../../assets/games/banana-basket/v2/pow_l.png'));
  return {
    poseIdle: useImage(require('../../../assets/games/banana-basket/v2/pose_idle.png')),
    poseHop: useImage(require('../../../assets/games/banana-basket/v2/pose_hop.png')),
    poseChomp: useImage(require('../../../assets/games/banana-basket/v2/pose_chomp.png')),
    poseFlinch: useImage(require('../../../assets/games/banana-basket/v2/pose_flinch.png')),
    poseCheer: useImage(require('../../../assets/games/banana-basket/v2/pose_cheer.png')),
    sharkFacepalm: useImage(require('../../../assets/games/banana-basket/v2/shark_facepalm.png')),
    cart: useImage(require('../../../assets/games/banana-basket/v2/cart.png')),
    finn: useImage(require('../../../assets/games/banana-basket/v2/finn.png')),
    gullGlide: useImage(require('../../../assets/games/banana-basket/v2/gull_glide.png')),
    gullUp: useImage(require('../../../assets/games/banana-basket/v2/gull_up.png')),
    plop: [plop0, plop1, plop2, plop3],
    pow: [powS, powM, powL],
    fxSheet: useImage(require('../../../assets/games/banana-basket/v2/fx_sheet.png')),
    sharkDizzy: useImage(require('../../../assets/games/banana-basket/v2/shark_dizzy.png')),
    sharkFist: useImage(require('../../../assets/games/banana-basket/v2/shark_fist.png')),
    basket: useImage(require('../../../assets/games/banana-basket/v2/basket.png')),
    ball: useImage(require('../../../assets/games/banana-basket/v2/ball.png')),
    heart: useImage(require('../../../assets/games/banana-basket/v2/heart.png')),
    coin,
    crown: useImage(require('../../../assets/games/banana-basket/v2/crown.png')),
    pail: useImage(require('../../../assets/games/banana-basket/v2/pail.png')),
    timer: useImage(require('../../../assets/games/banana-basket/v2/timer.png')),
    rush: useImage(require('../../../assets/games/banana-basket/v2/rush.png')),
    streak: useImage(require('../../../assets/games/banana-basket/v2/streak.png')),
    cloud: useImage(require('../../../../assets/images/screens/explore/cloud.png')),
    starburst: useImage(require('../../../../assets/images/screens/explore/starburst.png')),
    atlasSources: [banana, bunch, coin, puffer, pufferFull, juice, glint],
  };
}

function spriteFor(kind: number, puff: number): number {
  'worklet';
  if (kind === K_BANANA) return SP_BANANA;
  if (kind === K_BUNCH || kind === K_LUCKY) return SP_BUNCH;
  if (kind === K_COIN) return SP_COIN;
  if (kind === K_PUFFER) return puff >= 2 ? SP_PUFFER_FULL : SP_PUFFER;
  return SP_BANANA;
}

function easeOutBack(t: number): number {
  'worklet';
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const u = t - 1;
  return 1 + c3 * u * u * u + c1 * u * u;
}

function clamp01(v: number): number {
  'worklet';
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Render-only prize sway and its drop / pop / reel animation. Returns [x, y, scale, alpha]. */
function prizePose(s: SimState, v: Vis, h: number, out: number[]): void {
  'worklet';
  const st = s.hSt[h];
  const x0 = s.hX[h];
  const y0 = s.hY[h];
  const age = v.t - v.prizeT[h];
  const sway = Math.sin(v.t / 420 + h * 1.7) * 4;
  if (st === S_HANG) {
    // 300 ms spring down from the clip on the track.
    const u = clamp01(age / 300);
    const y = TRACK_Y + (y0 - TRACK_Y) * easeOutBack(u);
    out[0] = x0 + sway * u;
    out[1] = y;
    out[2] = 1;
    out[3] = 1;
  } else if (st === S_POP) {
    // The string snaps and the prize flies to the basket (200 ms).
    const u = clamp01((s.hT[h] / 256) / 12);
    const bx = s.bx / SUB;
    out[0] = x0 + (bx - x0) * u * u;
    out[1] = y0 + (LANE_Y - 10 - y0) * u * u - Math.sin(u * Math.PI) * 40;
    out[2] = 1 + 0.3 * Math.sin(u * Math.PI);
    out[3] = 1 - u * 0.4;
  } else if (st === S_REEL) {
    const u = clamp01((s.hT[h] / 256) / 18);
    out[0] = x0 + sway;
    out[1] = y0 + (TRACK_Y - y0) * (u * u * (3 - 2 * u));
    out[2] = 1 - 0.3 * u;
    out[3] = 1 - u;
  } else {
    out[3] = 0;
  }
}

export interface FieldProps {
  layout: FieldLayout;
  sim: SharedValue<SimState>;
  vis: SharedValue<Vis>;
  tick: SharedValue<number>;
  images: ReturnType<typeof useFieldImages>;
  camera: SharedValue<Transforms3d>;
  cameraOrigin: { x: number; y: number };
  ghost: SharedValue<Ghost | null>;
  ghostName: string;
  reducedMotion: boolean;
  /** Star targets [1, 2, 3, crown] for this ruleset (crown 0 = none). */
  targets: readonly number[];
  /** The thumb's last touch point (fu): the lock ring draws here. */
  thumb: SharedValue<{ x: number; y: number }>;
  /** Line Heat live strip (null outside heats). */
  strip?: SharedValue<HeatStripEntry[] | null>;
}

export const BananaField = React.memo(function BananaField(props: FieldProps) {
  const { layout, sim, vis, tick, images, camera, cameraOrigin, ghost, ghostName, reducedMotion, targets, thumb, strip } = props;
  const { k, oy, width, height } = layout;
  const atlas = useSpriteAtlas(images.atlasSources, { cell: 256 });
  const font = useFont(require('../../../../assets/fonts/shark-random-funnyness-2.ttf'), 28);
  const fontSmall = useFont(require('../../../../assets/fonts/shark-random-funnyness-2.ttf'), 17);
  const fontTiny = useFont(require('../../../../assets/fonts/shark-random-funnyness-2.ttf'), 13);
  const fontStamp = useFont(require('../../../../assets/fonts/shark-random-funnyness-2.ttf'), 40);

  const root = useMemo(() => [{ translateY: oy }, { scale: k }], [k, oy]);
  const skyTop = -oy / k;
  const tgt = useMemo(() => targets.slice(0, 4), [targets]);
  const meterMax = useMemo(() => Math.max(1, (tgt[3] > 0 ? tgt[3] : tgt[2] * 1.15)), [tgt]);

  // -- veil (ranked runs, 3.2): 150 ms after time stops, airborne things fade under a white wash ------
  const veil = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    const v = vis.value;
    if (!s.ranked || s.done) return 0;
    if (s.holdTs === 0) return clamp01((v.frozenMs - 150) / 150);
    // Fade back in over the last 6 steps of the ramp-up.
    return s.holdTs < 205 ? clamp01((205 - s.holdTs) / 146) * (v.frozenMs > 0 ? 1 : 0) : 0;
  });
  const itemsOp = useDerivedValue(() => 1 - veil.value);
  const washOp = useDerivedValue(() => veil.value * 0.45);

  // -- items + prizes: Atlas A; pile + splats: Atlas B --------------------------------------
  const rects = atlas?.rects;
  const spritesA = useRectBuffer(SLOTS_A, (r, i) => {
    'worklet';
    tick.value;
    if (!rects) return;
    const s = sim.value;
    let idx = SP_BANANA;
    if (i < SLOT_ITEMS) idx = s.iSt[i] === S_FREE ? SP_BANANA : spriteFor(s.iKind[i], s.iPuff[i]);
    else idx = s.hKind[i - SLOT_ITEMS] === K_LUCKY ? SP_BUNCH : SP_COIN;
    const src = rects[idx];
    r.setXYWH(src.x, src.y, src.width, src.height);
  });
  const transformsA = useRSXformBuffer(SLOTS_A, (xf, i) => {
    'worklet';
    tick.value;
    if (!rects) return;
    const s = sim.value;
    const v = vis.value;
    let x = 0;
    let y = 0;
    let size = 0;
    let rot = 0;
    let idx = SP_BANANA;
    const bx = s.bx / SUB;
    if (i < SLOT_ITEMS) {
      const st = s.iSt[i];
      if (st === S_FREE) {
        xf.set(0, 0, -5000, -5000);
        return;
      }
      const kind = s.iKind[i];
      idx = spriteFor(kind, s.iPuff[i]);
      size = kind === K_BANANA && s.twist === TWIST_GIANT ? 72 : ITEM_SIZE[kind];
      if (s.iFlag[i] === 1) size *= 1.15;
      x = s.iX[i] / SUB;
      y = s.iY[i] / SUB;
      const ageMs = (s.iAge[i] / 256) * 16.67;
      const seed = s.iId[i];
      const spin = (((seed * 73) % 130) + 90) * (seed % 2 === 0 ? 1 : -1);
      rot = reducedMotion ? 0 : ((spin * ageMs) / 1000) * (Math.PI / 180);
      if (kind === K_COIN) rot = Math.sin(ageMs / 180) * 0.25;
      if (kind === K_PUFFER) {
        size = s.iPuff[i] === 0 ? 46 : s.iPuff[i] === 1 ? 58 : 68;
        // Wobble +-6 deg at 5 Hz.
        rot = reducedMotion ? 0 : Math.sin(ageMs / 32) * 0.1;
      }
      if (st === S_DUNK) {
        const u = clamp01(s.iT[i] / 256 / 6);
        x = x + (bx - x) * u;
        y = LANE_Y - 8 + u * 22;
        size *= 1 - 0.35 * u;
        rot *= 1 - u;
      } else if (st === S_POP) {
        const u = clamp01(s.iT[i] / 256 / 12);
        x = x + (bx - x) * u * u;
        y = y + (LANE_Y - 10 - y) * u * u;
        size *= 1 + 0.2 * Math.sin(u * Math.PI);
      } else if (st === S_BONKED) {
        rot = ((s.iT[i] / 256) * 16.67 * 540 * Math.PI) / 180000;
      } else if (st === S_MISS && kind === K_BANANA && y > LANE_Y + 80) {
        // squashes flat on the plaza
        size *= 0.9;
      }
    } else {
      const h = i - SLOT_ITEMS;
      if (s.hSt[h] === S_FREE) {
        xf.set(0, 0, -5000, -5000);
        return;
      }
      const o = [0, 0, 1, 1];
      prizePose(s, v, h, o);
      if (o[3] <= 0.02) {
        xf.set(0, 0, -5000, -5000);
        return;
      }
      idx = s.hKind[h] === K_LUCKY ? SP_BUNCH : SP_COIN;
      size = (s.hKind[h] === K_LUCKY ? 74 : 60) * o[2];
      x = o[0];
      y = o[1];
      rot = reducedMotion ? 0 : Math.sin(v.t / 420 + h * 1.7) * 0.08;
    }
    const src = rects[idx];
    const sc = size / Math.max(src.width, src.height);
    const c = Math.cos(rot) * sc;
    const sn = Math.sin(rot) * sc;
    const hw = src.width / 2;
    const hh = src.height / 2;
    xf.set(c, sn, x - (c * hw - sn * hh), y - (sn * hw + c * hh));
  });
  const spritesB = useRectBuffer(SLOTS_B, (r, i) => {
    'worklet';
    if (!rects) return;
    const idx = i < SLOT_PILE ? (i % 4 === 3 ? SP_BUNCH : SP_BANANA) : SP_BANANA;
    const src = rects[idx];
    r.setXYWH(src.x, src.y, src.width, src.height);
  });
  const transformsB = useRSXformBuffer(SLOTS_B, (xf, i) => {
    'worklet';
    tick.value;
    if (!rects) return;
    const s = sim.value;
    const v = vis.value;
    let x = 0;
    let y = 0;
    let size = 0;
    let rot = 0;
    let idx = SP_BANANA;
    const bx = s.bx / SUB;
    if (i < SLOT_PILE) {
      const n = i;
      const count = s.catches;
      if (count < PILE_AT[n]) {
        xf.set(0, 0, -5000, -5000);
        return;
      }
      idx = n % 4 === 3 ? SP_BUNCH : SP_BANANA;
      const row = n < 4 ? 0 : n < 8 ? 1 : 2;
      const col = n % 4;
      const sag = Math.min(10, Math.floor(count / 10) * 2);
      x = bx - 42 + col * 28 + (row % 2) * 12;
      y = LANE_Y + 4 - row * 13 + sag * 0.3;
      size = 42 + row * 2;
      rot = ((n * 47) % 60 - 30) * (Math.PI / 180);
      // Top sprites jostle on a catch (2 fu spring, impulse from basket vx).
      const jig = v.t - v.squashT;
      if (jig >= 0 && jig < 180 && n >= Math.max(0, count - 3)) {
        const imp = Math.max(-1, Math.min(1, s.bv / 5000));
        rot += Math.sin(jig / 18) * 0.12 * Math.exp(-jig / 90);
        x += imp * 2 * Math.exp(-jig / 90);
      }
    } else {
      const n = i - SLOT_PILE;
      if (v.splatT[n] < -1e5) {
        xf.set(0, 0, -5000, -5000);
        return;
      }
      idx = SP_BANANA;
      const age = v.t - v.splatT[n];
      x = v.splatX[n];
      y = v.splatY[n] - 4;
      size = age < 80 ? 46 - (age / 80) * 12 : 34;
      rot = -0.35 + ((n * 31) % 40) * 0.01;
    }
    const src = rects[idx];
    const sc = size / Math.max(src.width, src.height);
    const c = Math.cos(rot) * sc;
    const sn = Math.sin(rot) * sc;
    const hw = src.width / 2;
    const hh = src.height / 2;
    // Splats squash flat (scaleY 0.4).
    if (i >= SLOT_PILE) {
      xf.set(c, sn * 0.4, x - (c * hw - sn * hh), y - (sn * hw + c * hh) * 0.4);
      return;
    }
    xf.set(c, sn, x - (c * hw - sn * hh), y - (sn * hw + c * hh));
  });

  // -- strings for hanging prizes (one ink path) ----------------------------------------------
  const strings = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    const v = vis.value;
    const p = Skia.Path.Make();
    const o = [0, 0, 1, 1];
    for (let h = 0; h < MAX_PRIZES; h++) {
      if (s.hSt[h] !== S_HANG && s.hSt[h] !== S_REEL) continue;
      prizePose(s, v, h, o);
      const top = s.hX[h];
      p.moveTo(top, TRACK_Y + 2);
      p.quadTo((top + o[0]) / 2 + 3, (TRACK_Y + o[1]) / 2, o[0], o[1] - (s.hKind[h] === K_LUCKY ? 30 : 24));
      p.addCircle(top, TRACK_Y + 2, 4);
    }
    return p;
  });
  // Lucky Bunch gold halo underlay + an orbiting sparkle.
  const luckyHalo = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    const v = vis.value;
    const p = Skia.Path.Make();
    const o = [0, 0, 1, 1];
    for (let h = 0; h < MAX_PRIZES; h++) {
      if (s.hSt[h] !== S_HANG || s.hKind[h] !== K_LUCKY) continue;
      prizePose(s, v, h, o);
      p.addCircle(o[0], o[1], 42);
      const a = v.t / 180 + h;
      p.addCircle(o[0] + Math.cos(a) * 42, o[1] + Math.sin(a) * 42, 5);
    }
    return p;
  });
  // Golden Hour halo underlays (7.4): gold discs under every item, prize and the shark.
  const halos = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    const p = Skia.Path.Make();
    if (s.ghQ === 0) return p;
    const o = [0, 0, 1, 1];
    for (let i = 0; i < MAX_ITEMS; i++) {
      if (s.iSt[i] !== S_FALL || s.iKind[i] === K_PUFFER) continue;
      p.addCircle(s.iX[i] / SUB, s.iY[i] / SUB, ITEM_SIZE[s.iKind[i]] * 0.5 + 6);
    }
    for (let h = 0; h < MAX_PRIZES; h++) {
      if (s.hSt[h] !== S_HANG) continue;
      prizePose(s, vis.value, h, o);
      p.addCircle(o[0], o[1], 36);
    }
    return p;
  });
  const haloOp = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    const v = vis.value;
    if (s.ghQ === 0) return 0;
    const left = s.ghEnd - s.clock;
    // The last 3 beats blink on 8th notes.
    if (left < 3 * STEPS_BEAT && !reducedMotion) return Math.floor(s.clock / 14) % 2 === 0 ? 0.85 : 0.35;
    return 0.85 * clamp01((v.t - v.ghStartT) / 200);
  });

  // -- shadows, rings, puffer shadows, ball marker ---------------------------------------------
  const shadows = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    const p = Skia.Path.Make();
    for (let i = 0; i < MAX_ITEMS; i++) {
      if (s.iSt[i] !== S_FALL || s.iKind[i] === K_PUFFER) continue;
      const prog = clamp01(s.iAge[i] / 256 / Math.max(1, s.iLand[i]));
      const w = 20 + 36 * prog;
      const x = s.iX[i] / SUB;
      p.addOval(rect(x - w / 2, LANE_Y + 22 - w * 0.14, w, w * 0.28));
    }
    return p;
  });
  const pufferShadows = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    const p = Skia.Path.Make();
    for (let i = 0; i < MAX_ITEMS; i++) {
      if (s.iSt[i] !== S_FALL || s.iKind[i] !== K_PUFFER) continue;
      const prog = clamp01(s.iAge[i] / 256 / Math.max(1, s.iLand[i]));
      const w = 20 + 44 * prog;
      const x = s.iX[i] / SUB;
      p.addOval(rect(x - w / 2, LANE_Y + 22 - w * 0.16, w, w * 0.32));
    }
    return p;
  });
  const splatPuddles = useDerivedValue(() => {
    tick.value;
    const v = vis.value;
    const p = Skia.Path.Make();
    for (let n = 0; n < MAX_SPLATS; n++) {
      if (v.splatT[n] < -1e5) continue;
      const age = v.t - v.splatT[n];
      const w = age < 80 ? 20 + (age / 80) * 30 : 50;
      p.addOval(rect(v.splatX[n] - w / 2, v.splatY[n] + 2, w, w * 0.26));
    }
    return p;
  });
  const pufferPulse = useDerivedValue(() => {
    tick.value;
    return 0.55 + 0.35 * Math.abs(Math.sin(vis.value.t / 125));
  });
  const ringsWhite = useDerivedValue(() => {
    tick.value;
    return rings(sim.value, false);
  });
  const ringsGold = useDerivedValue(() => {
    tick.value;
    return rings(sim.value, true);
  });

  // -- aim ghost-line (3.4): first 3 bounces of each life, from 24 steps before contact --------------
  const aimLine = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    const p = Skia.Path.Make();
    if (s.bOn !== 1 || s.bVy <= 0 || s.bPredStep < 0 || s.bN >= BALL_ARC_BOUNCES) return p;
    const left = s.bPredStep - s.clock;
    if (left > 24 || left < 0) return p;
    const z = zoneOf(s.bPredX - s.bx);
    const ax: number[] = [];
    const ay: number[] = [];
    for (let i = 0; i < 100; i++) {
      ax.push(0);
      ay.push(0);
    }
    const kk = zoneArc(s, s.bPredX, s.bN + 1, z, ax, ay);
    const n = kk < 40 ? kk : 40;
    for (let m = 2; m < n; m += 3) {
      p.addCircle(ax[m], ay[m], 3.6);
      // Ends in a ring when it would hit a hanging prize.
      for (let h = 0; h < MAX_PRIZES; h++) {
        if (s.hSt[h] !== S_HANG) continue;
        const dx = ax[m] - s.hX[h];
        const dy = ay[m] - s.hY[h];
        if (dx * dx + dy * dy <= (BALL_R + PRIZE_R) * (BALL_R + PRIZE_R)) {
          p.addCircle(s.hX[h], s.hY[h], PRIZE_R + 8);
          return p;
        }
      }
    }
    return p;
  });
  const aimOp = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    const left = s.bPredStep - s.clock;
    return clamp01((26 - left) / 8);
  });
  const ballMarker = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    const p = Skia.Path.Make();
    if (s.bOn !== 1 || s.bPredStep < 0) return p;
    const x = s.bPredX / SUB;
    const near = clamp01(1 - (s.bPredStep - s.clock) / 70);
    const w = 22 + 30 * near;
    p.addOval(rect(x - w / 2, LANE_Y + 22 - w * 0.16, w, w * 0.32));
    return p;
  });

  // -- ribbon trail (7.2) -----------------------------------------------------------------------
  const trail = useDerivedValue(() => {
    tick.value;
    const v = vis.value;
    const p = Skia.Path.Make();
    const n = v.trailN;
    if (n < 3 || reducedMotion) return p;
    const len = v.trailX.length;
    const head = (v.trailHead - 1 + len) % len;
    // A tapered ribbon: offset both sides by a width that shrinks along the tail.
    const xs: number[] = [];
    const ys: number[] = [];
    for (let i = 0; i < n; i++) {
      const j = (head - i + len) % len;
      xs.push(v.trailX[j]);
      ys.push(v.trailY[j]);
    }
    const lx: number[] = [];
    const ly: number[] = [];
    const rx: number[] = [];
    const ry: number[] = [];
    for (let i = 0; i < n; i++) {
      const a = i === 0 ? 0 : i - 1;
      const b = i === n - 1 ? n - 1 : i + 1;
      let dx = xs[b] - xs[a];
      let dy = ys[b] - ys[a];
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      dx /= d;
      dy /= d;
      const w = 9 * (1 - i / n);
      lx.push(xs[i] - dy * w);
      ly.push(ys[i] + dx * w);
      rx.push(xs[i] + dy * w);
      ry.push(ys[i] - dx * w);
    }
    p.moveTo(lx[0], ly[0]);
    for (let i = 1; i < n; i++) p.lineTo(lx[i], ly[i]);
    for (let i = n - 1; i >= 0; i--) p.lineTo(rx[i], ry[i]);
    p.close();
    return p;
  });
  const trailColor = useDerivedValue(() => {
    tick.value;
    const n = sim.value.bN;
    return sim.value.bGold ? GOLD : n >= 20 ? CORAL : n >= 10 ? GOLD : n >= 5 ? BLUE : '#ffffff';
  });

  // -- shark and basket ---------------------------------------------------------------------
  const sharkTransform = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    const v = vis.value;
    const bx = s.bx / SUB;
    const speed = Math.abs(s.bv) / SUB;
    // Beat-locked idle (Cuphead): breathing on the 900/7 BPM grid from the sim clock.
    const ph = (s.clock % STEPS_BEAT) / STEPS_BEAT;
    const amp = reducedMotion ? 0.5 : 1;
    const breathe = speed <= 1 ? 1 + 0.02 * amp * Math.sin(ph * Math.PI * 2) : 1;
    const sq = squash(v);
    const land = v.t - v.hopLand;
    const hopSq = land >= 0 && land < 70 && !reducedMotion ? 1 - 0.12 * Math.sin((land / 70) * Math.PI) : 1;
    // Smear: a 1-frame 1.15 stretch entering a key hold.
    const pt = v.t - v.poseT;
    const smear = pt >= 0 && pt < 17 && !reducedMotion ? 1.15 : 1;
    // Speed-cap tell: 1-frame 1.08 stretch along vx on the first sweep step.
    const st = v.t - v.sweepStartT;
    const sweepStretch = st >= 0 && st < 17 && !reducedMotion ? 1.08 : 1;
    const sag = Math.min(10, Math.floor(s.catches / 10) * 2) * 0.4;
    const fin = FIN_Y[v.show] * POSE_S;
    return [
      { translateX: bx },
      { translateY: LANE_Y - 34 + sag },
      { rotate: (v.lean * Math.PI) / 180 },
      { scaleX: (v.face / sq) * (2 - hopSq) * sweepStretch },
      { scaleY: sq * breathe * hopSq * smear },
      { translateX: -POSE_W / 2 },
      { translateY: -fin },
    ];
  });
  // Full-body card poses (dizzy, fist pump, slump) stand on the tail behind the basket.
  const bodyTransform = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    const v = vis.value;
    const hop = v.show === POSE_FIST && !reducedMotion ? -Math.abs(Math.sin((v.t - v.timeT) / 180)) * 14 : 0;
    return [{ translateX: s.bx / SUB }, { translateY: LANE_Y + 60 + hop }, { translateX: -SHARK_W / 2 }, { translateY: -SHARK_H }];
  });
  const showOp = (a: number, b: number) => useDerivedValue(() => {
    tick.value;
    const p = vis.value.show;
    return p === a || p === b ? 1 : 0;
  });
  const opIdle = showOp(POSE_IDLE, POSE_GRIN);
  const opHop = showOp(POSE_HOP, POSE_STRAIN);
  const opChomp = showOp(POSE_CHOMP, POSE_CHOMP);
  const opCheer = showOp(POSE_CHEER, POSE_CHEER);
  const opFlinch = showOp(POSE_BONKED, POSE_BONKED);
  const opDizzy = showOp(POSE_DIZZY, POSE_DIZZY);
  const opFist = showOp(POSE_FIST, POSE_FIST);
  const opSlump = showOp(POSE_SLUMP, POSE_SLUMP);
  const flashOp = useDerivedValue(() => {
    tick.value;
    const v = vis.value;
    // Only the puffer hit whitens the whole shark (one frame).
    const sil = v.rt - v.silhouetteT;
    return sil >= 0 && sil < 34 ? (reducedMotion ? 0.15 : 0.95) : 0;
  });
  // PERFECT / POP impact frame on the basket's front lip (1 frame).
  const lipOp = useDerivedValue(() => {
    tick.value;
    const v = vis.value;
    const l = v.rt - v.lipT;
    const f = v.rt - v.flashT;
    if (l >= 0 && l < 20) return reducedMotion ? 0.15 : 0.85;
    return f >= 0 && f < 20 ? (reducedMotion ? 0.1 : 0.4) : 0;
  });
  const flashOn = (a: number, b: number) => useDerivedValue(() => {
    tick.value;
    const p = vis.value.show;
    return p === a || p === b ? flashOp.value : 0;
  });
  const flIdle = flashOn(POSE_IDLE, POSE_GRIN);
  const flHop = flashOn(POSE_HOP, POSE_STRAIN);
  const flChomp = flashOn(POSE_CHOMP, POSE_CHOMP);
  const flCheer = flashOn(POSE_CHEER, POSE_CHEER);
  const flFlinch = flashOn(POSE_BONKED, POSE_BONKED);
  // Invulnerability blink (10 Hz) after a puffer hit.
  const sharkOp = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    if (s.invulnQ <= 0 || reducedMotion) return 1;
    return Math.floor(vis.value.t / 50) % 2 === 0 ? 1 : 0.35;
  });
  // The basket stays level: rim angle = clamp(lean * 0.2, +-4 deg); the puffer hit kicks it 18 deg.
  const basketTransform = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    const v = vis.value;
    const bx = s.bx / SUB;
    const sq = squash(v);
    const sag = Math.min(10, Math.floor(s.catches / 10) * 2) * 0.4;
    const ht = v.t - v.heartT;
    const hitTilt = ht >= 0 && ht < 420 ? Math.sin(ht / 50) * 0.31 * Math.exp(-ht / 140) : 0;
    const rim = Math.max(-4, Math.min(4, v.lean * 0.2));
    const st = v.t - v.stealT;
    const knock = st >= 0 && st < 300 && !reducedMotion ? Math.sin((st / 300) * Math.PI) * 40 * (v.gullEdge > 200 ? -1 : 1) : 0;
    return [
      { translateX: bx + knock },
      { translateY: LANE_Y + BASKET_H * (1 - BASKET_RIM) + sag },
      { rotate: (rim * Math.PI) / 180 + hitTilt },
      { scaleX: 1 / sq },
      { scaleY: sq },
      { translateX: -BASKET_W / 2 },
      { translateY: -BASKET_H },
    ];
  });
  // Zone seams at +-13 and +-41 fu; the contacted zone flashes white for 2 frames.
  const seams = useMemo(() => {
    const p = Skia.Path.Make();
    const rimY = BASKET_H * BASKET_RIM;
    for (const d of [-ZONE_INNER - 1, -ZONE_CENTER - 1, ZONE_CENTER + 1, ZONE_INNER + 1]) {
      const x = BASKET_W / 2 + d * (BASKET_W / (HALF_ZONE * 2 + 18));
      p.addRRect(Skia.RRectXY(rect(x - 1.6, rimY - 9, 3.2, 14), 1.6, 1.6));
    }
    return p;
  }, []);
  const zoneFlash = useDerivedValue(() => {
    tick.value;
    const v = vis.value;
    const p = Skia.Path.Make();
    const t = v.t - v.zoneT;
    if (t < 0 || t > 50) return p;
    const rimY = BASKET_H * BASKET_RIM;
    const scale = BASKET_W / (HALF_ZONE * 2 + 18);
    const edges = [-88, -41, -13, 13, 41, 88];
    const z = v.zoneIdx;
    const a = z === 0 ? edges[0] : z === 1 ? edges[1] : z === 2 ? edges[2] : z === 3 ? edges[3] : edges[4];
    const b = z === 0 ? edges[1] : z === 1 ? edges[2] : z === 2 ? edges[3] : z === 3 ? edges[4] : edges[5];
    p.addRRect(Skia.RRectXY(rect(BASKET_W / 2 + a * scale, rimY - 8, (b - a) * scale, 10), 5, 5));
    return p;
  });

  // -- ball -------------------------------------------------------------------------------------
  const ballTransform = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    const v = vis.value;
    if (s.bOn !== 1) {
      // In the pail after a save: the ball rides the pail until its kick.
      if (s.bKeep === 1) {
        const px = pailX(s.clock);
        return [{ translateX: px }, { translateY: PLAZA_Y - 30 }, { scale: 0.8 }, { translateX: -BALL_R }, { translateY: -BALL_R }];
      }
      return [{ translateX: -500 }, { translateY: -500 }];
    }
    const t = v.t - v.ballSquashT;
    // Contact squash 1.30 x 0.70 for 70 ms, then a spring.
    let sx = 1;
    let sy = 1;
    if (t >= 0 && t < 70 && !reducedMotion) {
      sx = 1.3;
      sy = 0.7;
    } else if (t >= 70 && t < 230 && !reducedMotion) {
      const u = (t - 70) / 160;
      const w = Math.exp(-4 * u) * Math.cos(10 * u);
      sx = 1 + 0.3 * w * 0.5;
      sy = 1 - 0.3 * w * 0.5;
    }
    // Spin by zone (render-only), decays.
    const spin = (s.bX / SUB) / BALL_R + (v.zoneIdx - 2) * Math.max(0, 1 - (v.t - v.zoneT) / 1500) * ((v.t - v.zoneT) / 80);
    return [
      { translateX: s.bX / SUB },
      { translateY: s.bY / SUB },
      { scaleX: sx },
      { scaleY: sy },
      { rotate: reducedMotion ? 0 : spin },
      { translateX: -BALL_R },
      { translateY: -BALL_R },
    ];
  });
  const goldBallOp = useDerivedValue(() => {
    tick.value;
    return sim.value.bOn === 1 && sim.value.bGold ? 1 : 0;
  });
  const ballRingColor = useDerivedValue(() => {
    tick.value;
    const n = sim.value.bN;
    return n >= 20 ? CORAL : n >= 10 ? GOLD : n >= 5 ? BLUE : '#ffffff';
  });
  const ballRingOp = useDerivedValue(() => {
    tick.value;
    return sim.value.bOn === 1 && sim.value.bN > 0 ? 1 : 0;
  });
  const ballRingW = useDerivedValue(() => {
    tick.value;
    const t = vis.value.t - vis.value.ringT;
    return t >= 0 && t < 160 ? 6 - 2.5 * (t / 160) : 3.5;
  });
  // Juggle counter under the ball from 5 bounces (BEST JUGGLE).
  const juggleText = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    return s.bOn === 1 && s.bN >= 5 ? `${s.bN}` : '';
  });
  const juggleX = useDerivedValue(() => {
    tick.value;
    const w = fontSmall ? fontSmall.measureText(juggleText.value).width : 10;
    return sim.value.bX / SUB - w / 2;
  });
  const juggleY = useDerivedValue(() => {
    tick.value;
    return sim.value.bY / SUB + BALL_R + 20;
  });

  // -- the free-ball pail (3.5) --------------------------------------------------------------------
  const pailOp = useDerivedValue(() => {
    tick.value;
    return sim.value.hasPail ? 1 : 0;
  });
  const pailTransform = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    const v = vis.value;
    const x = pailX(s.clock);
    const t = v.t - v.pailT;
    const pop = t >= 0 && t < 220 ? 1 + 0.18 * Math.sin((t / 220) * Math.PI) : 1;
    return [{ translateX: x }, { translateY: PLAZA_Y + 4 }, { scale: pop }, { translateX: -26 }, { translateY: -50 }];
  });
  const pailUsedOp = useDerivedValue(() => {
    tick.value;
    return sim.value.pailUsed ? 0.55 : 0;
  });
  const pailShine = useDerivedValue(() => {
    tick.value;
    const t = vis.value.t - vis.value.pailT;
    return t >= 0 && t < 300 ? 1 - t / 300 : 0;
  });

  // -- world ambience ------------------------------------------------------------------------
  const cloudX = (speed: number, base: number) => useDerivedValue(() => {
    tick.value;
    const t = vis.value.cloudT / 1000;
    const span = FIELD_W + 200;
    return ((base + t * speed) % span) - 120;
  });
  const c1 = cloudX(8, 40);
  const c2 = cloudX(12, 260);
  const c3 = cloudX(18, 480);
  const cloudBob = useDerivedValue(() => {
    tick.value;
    const ph = (sim.value.clock % STEPS_BEAT) / STEPS_BEAT;
    return reducedMotion ? 0 : -Math.max(0, Math.cos(ph * Math.PI * 2)) * 1;
  });
  const cY1 = useDerivedValue(() => 150 + cloudBob.value);
  const cY2 = useDerivedValue(() => 210 - cloudBob.value);
  const cY3 = useDerivedValue(() => 128 + cloudBob.value);
  const rayRot = useDerivedValue(() => {
    tick.value;
    return reducedMotion ? [{ rotate: 0 }] : [{ rotate: (vis.value.cloudT / 1000) * 0.1 }];
  });
  const rays = useMemo(() => {
    const p = Skia.Path.Make();
    for (let r = 0; r < 6; r++) {
      const a0 = (r / 6) * Math.PI * 2;
      const a1 = a0 + 0.24;
      p.moveTo(0, 0);
      p.lineTo(Math.cos(a0) * 900, Math.sin(a0) * 900);
      p.lineTo(Math.cos(a1) * 900, Math.sin(a1) * 900);
      p.close();
    }
    return p;
  }, []);
  const hillInk = useMemo(() => {
    const p = Skia.Path.Make();
    p.addOval(rect(-120, 392, 360, 170));
    p.addOval(rect(170, 402, 360, 170));
    return p;
  }, []);
  const plazaTiles = useMemo(() => {
    const p = Skia.Path.Make();
    for (let r = 0; r < 6; r++) {
      const y = LANE_Y + 52 + r * 34;
      const off = r % 2 === 0 ? 0 : 30;
      for (let x = -60 + off; x < FIELD_W + 60; x += 60) p.addRRect(Skia.RRectXY(rect(x + 3, y, 54, 26), 8, 8));
    }
    return p;
  }, []);
  const railTicks = useMemo(() => {
    const p = Skia.Path.Make();
    for (let x = 62; x <= 338; x += 46) p.addRRect(Skia.RRectXY(rect(x - 2, LANE_Y + 19, 4, 10), 2, 2));
    return p;
  }, []);
  const track = useMemo(() => {
    const p = Skia.Path.Make();
    p.moveTo(-20, TRACK_Y);
    p.cubicTo(80, TRACK_Y - 14, 150, TRACK_Y + 12, 210, TRACK_Y - 2);
    p.cubicTo(270, TRACK_Y - 16, 330, TRACK_Y + 6, 420, TRACK_Y - 6);
    return p;
  }, []);
  const ties = useMemo(() => {
    const p = Skia.Path.Make();
    for (let x = -10; x < 420; x += 22) {
      const y = TRACK_Y - 2 + Math.sin(x / 40) * 5;
      p.addRect(rect(x, y - 2, 6, 14));
    }
    return p;
  }, []);
  // Foreground bunting strings across the top corners (lean with Crosswind).
  const buntingFor = (parity: number) => useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    const lean = s.twist === 1 ? s.wind * 6 : 0;
    const p = Skia.Path.Make();
    for (let i = 0; i < 12; i++) {
      if (i % 2 !== parity) continue;
      const u = (i + 0.5) / 12;
      const x = -10 + (FIELD_W + 20) * u;
      const y = FIELD_H - 34 + Math.sin(u * Math.PI * 2) * 5;
      p.moveTo(x - 9, y);
      p.lineTo(x + 9, y);
      p.lineTo(x + lean * 0.6, y + 18);
      p.close();
    }
    return p;
  });

  const buntA = buntingFor(0);
  const buntB = buntingFor(1);

  // -- Golden Hour ------------------------------------------------------------------------------
  const goldAmt = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    const v = vis.value;
    if (s.ghQ > 0) return clamp01((v.t - v.ghStartT) / 300);
    return clamp01(1 - (v.t - v.ghEndT) / 300);
  });
  const burstTransform = useDerivedValue(() => {
    tick.value;
    const v = vis.value;
    const g = goldAmt.value;
    const sc = g * Math.min(1, easeOutBack(clamp01((v.t - v.ghStartT) / 350)));
    return [
      { translateX: v.cartPos },
      { translateY: TRACK_Y - 20 },
      { rotate: reducedMotion ? 0 : (v.t / 1000) * 0.52 },
      { scale: Math.max(0.001, sc * 0.45) },
      { translateX: -395 },
      { translateY: -397 },
    ];
  });
  const burstOpacity = useDerivedValue(() => goldAmt.value * 0.4);
  const frameOpacity = useDerivedValue(() => goldAmt.value);
  // Gold basket sheen: the tint swells once every 4 beats (7.4), never washing out the wicker.
  const sheenOp = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    const u = ((s.clock - s.setStart) % (STEPS_BEAT * 4)) / (STEPS_BEAT * 4);
    return goldAmt.value * (0.55 + 0.45 * Math.max(0, Math.sin(u * Math.PI)));
  });

  // -- HUD ---------------------------------------------------------------------------------
  const timeFrac = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    const lt = s.clock - s.setStart;
    return clamp01(1 - lt / Math.max(1, s.setLen));
  });
  const timeFillW = useDerivedValue(() => TIME_W * timeFrac.value);
  const rushOp = useDerivedValue(() => {
    tick.value;
    return sim.value.rushOn ? 1 : 0;
  });
  const timeColor = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    if (s.rushOn) return CORAL;
    return GOLD;
  });
  const timePulse = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    if (!s.rushOn || reducedMotion) return [{ scaleY: 1 }];
    return [{ scaleY: 1 + 0.15 * Math.abs(Math.sin(vis.value.t / 80)) }];
  });
  const frozenShimmer = useDerivedValue(() => {
    tick.value;
    const v = vis.value;
    if (v.frozenMs < 200) return -60;
    return ((v.cloudT / 1200) % 1) * 240 + TIME_X - 40;
  });
  const heartOp = (i: number) => useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    const v = vis.value;
    if (s.hearts > i) return 1;
    const t = v.t - v.heartT;
    if (v.heartIdx === i && t >= 0 && t < 260) return 1 - t / 260;
    return 0.18;
  });
  const heartScale = (i: number) => useDerivedValue(() => {
    tick.value;
    const v = vis.value;
    const t = v.t - v.heartT;
    const sc = v.heartIdx === i && t >= 0 && t < 260 ? 1 + 0.3 * Math.sin((t / 260) * Math.PI) : 1;
    const cx = 22 + i * 30;
    return [{ translateX: cx }, { translateY: 24 }, { scale: sc }, { translateX: -13 }, { translateY: -12 }];
  });
  const h0 = heartOp(0);
  const h1 = heartOp(1);
  const h2 = heartOp(2);
  const hs0 = heartScale(0);
  const hs1 = heartScale(1);
  const hs2 = heartScale(2);

  // Star meter (Angry Birds 2): score on a fill bar with 1/2/3-star and crown notches.
  const meterScore = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    return s.score + s.bonus;
  });
  const meterFillW = useDerivedValue(() => TIME_W * clamp01(meterScore.value / meterMax));
  const meterFillColor = useDerivedValue(() => {
    const sc = meterScore.value;
    return sc >= tgt[2] ? GOLD : sc >= tgt[0] ? BLUE : '#7cc8ff';
  });
  const scoreText = useDerivedValue(() => `${meterScore.value}`);
  const nextText = useDerivedValue(() => {
    const sc = meterScore.value;
    for (let i = 0; i < 4; i++) {
      if (tgt[i] > 0 && sc < tgt[i]) return i < 3 ? `NEXT STAR +${tgt[i] - sc}` : `CROWN +${tgt[i] - sc}`;
    }
    return '';
  });
  const notchScale = (i: number) => useDerivedValue(() => {
    tick.value;
    const v = vis.value;
    const t = v.t - v.notchT;
    const pop = v.notchIdx === i && t >= 0 && t < 260 ? 1 + 0.4 * Math.sin((t / 260) * Math.PI) : 1;
    const x = TIME_X + 2 + TIME_W * clamp01(tgt[i] / meterMax);
    return [{ translateX: x }, { translateY: 51 }, { scale: pop }];
  });
  const notchLit = (i: number) => useDerivedValue(() => (meterScore.value >= tgt[i] && tgt[i] > 0 ? 1 : 0));
  const n0 = notchScale(0);
  const n1 = notchScale(1);
  const n2 = notchScale(2);
  const n3 = notchScale(3);
  const l0 = notchLit(0);
  const l1 = notchLit(1);
  const l2 = notchLit(2);
  const l3 = notchLit(3);
  const crownOp = useDerivedValue(() => 0.45 + 0.55 * l3.value);

  // -- the head chip (7.6): tier, Coin Meter ring, padlock when the ball gate holds -------------------
  const chipX = useDerivedValue(() => {
    tick.value;
    // A 60 ms lag behind the shark.
    return Math.max(70, Math.min(330, sim.value.bx / SUB));
  });
  const chipTransform = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    const v = vis.value;
    const ct = v.t - v.chipT;
    let pop = ct >= 0 && ct < 180 ? 1 + 0.12 * Math.sin((ct / 180) * Math.PI) : 1;
    const bt = v.t - v.badgeT;
    if (bt >= 0 && bt < 260) pop = Math.max(pop, 1 + 0.4 * Math.sin((bt / 260) * Math.PI));
    const beat = (s.clock % STEPS_BEAT) / STEPS_BEAT;
    const pulse = reducedMotion ? 1 : 1 + 0.04 * Math.max(0, Math.cos(beat * Math.PI * 2));
    const st = v.t - v.badgeShakeT;
    let shake = st >= 0 && st < 180 && !reducedMotion ? Math.sin(st / 15) * 6 * (1 - st / 180) : 0;
    // Golden Hour wind-up: the chip shakes +-3 fu until the beat.
    if (v.ghArmT > v.ghStartT && s.ghArmAt >= 0 && !reducedMotion) shake += Math.sin(v.t / 12) * 3;
    return [{ translateX: chipX.value + shake }, { translateY: CHIP_Y }, { scale: pop * pulse }];
  });
  const tierText = useDerivedValue(() => {
    tick.value;
    return `x${gatedTier(sim.value)}`;
  });
  const tierColor = useDerivedValue(() => {
    tick.value;
    return TIER_COLORS[gatedTier(sim.value)];
  });
  const lockOp = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    return s.full === 1 && tierOf(s.chain) > 2 && !ballIsLive(s) ? 1 : 0;
  });
  const meterArcs = (i: number) => useDerivedValue(() => {
    tick.value;
    const p = Skia.Path.Make();
    p.addArc(rect(16 - 15, -15, 30, 30), -90 + i * 120 + 6, 108);
    return p;
  });
  const arc0 = meterArcs(0);
  const arc1 = meterArcs(1);
  const arc2 = meterArcs(2);
  const pipOp = (i: number) => useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    if (s.ghQ > 0 || s.ghArmAt >= 0) return 1;
    return s.meter > i ? 1 : 0.15;
  });
  const p0 = pipOp(0);
  const p1 = pipOp(1);
  const p2 = pipOp(2);
  const ringDim = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    return s.full === 1 && s.rushOn ? 0.4 : 1;
  });
  // Ready sparkle at 2 of 3 pips (Brawl Stars): a beat-locked glint on the ring.
  const readyOp = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    if (s.meter !== 2 || s.ghQ > 0 || s.rushOn) return 0;
    const ph = (s.clock % STEPS_BEAT) / STEPS_BEAT;
    return ph < 0.3 ? 1 - ph / 0.3 : 0;
  });
  const shardOp = useDerivedValue(() => {
    tick.value;
    const t = vis.value.t - vis.value.unlockT;
    return t >= 0 && t < 400 ? 1 - t / 400 : 0;
  });
  const shardTransformA = useDerivedValue(() => {
    const t = Math.max(0, vis.value.t - vis.value.unlockT) / 1000;
    return [{ translateX: -40 - t * 120 }, { translateY: -10 - t * 160 + t * t * 900 }, { rotate: -t * 9 }];
  });
  const shardTransformB = useDerivedValue(() => {
    const t = Math.max(0, vis.value.t - vis.value.unlockT) / 1000;
    return [{ translateX: -22 + t * 110 }, { translateY: -10 - t * 140 + t * t * 900 }, { rotate: t * 8 }];
  });
  const flameOp = useDerivedValue(() => {
    tick.value;
    return gatedTier(sim.value) >= 3 ? 1 : 0;
  });
  const flameTransform = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    const t = vis.value.t;
    const big = gatedTier(s) >= 4 ? 1 : 0.7;
    const flick = reducedMotion ? 1 : 1 + 0.08 * Math.sin(t / 45);
    return [{ translateX: s.bx / SUB + 50 }, { translateY: LANE_Y - 4 }, { scale: big * flick }, { translateX: -15 }, { translateY: -34 }];
  });
  // Rim notch: the PERFECT window, glowing when the next landing is inside it.
  const notchOp = useDerivedValue(() => {
    tick.value;
    return 0.4 + 0.6 * vis.value.notch;
  });
  const notchGlowR = useDerivedValue(() => 10 + 10 * vis.value.notch);
  const notchGlowOp = useDerivedValue(() => 0.45 * vis.value.notch);

  // -- parked shield bubble, lock ring, CLOSE CALL speed lines, sweep dust ------------------------------
  const shieldOp = useDerivedValue(() => {
    tick.value;
    const v = vis.value;
    const t = v.t - v.shieldT;
    return t >= 0 && t < 140 ? 1 - t / 140 : 0;
  });
  const shieldR = useDerivedValue(() => {
    const t = Math.max(0, vis.value.t - vis.value.shieldT);
    return 70 + t * 0.12;
  });
  const shieldCx = useDerivedValue(() => {
    tick.value;
    return sim.value.bx / SUB;
  });
  const lockOpRing = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    return s.parked && s.queued ? 1 : 0;
  });
  const lockArc = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    const p = Skia.Path.Make();
    if (!(s.parked && s.queued)) return p;
    const u = clamp01(s.fullRun / LOCK_STEPS);
    const t = thumb.value;
    p.addArc(rect(t.x - 28, t.y - 28, 56, 56), -90, 360 * u);
    return p;
  });
  const lockRing = useDerivedValue(() => {
    tick.value;
    const p = Skia.Path.Make();
    const t = thumb.value;
    p.addCircle(t.x, t.y, 28);
    return p;
  });
  const speedLines = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    const v = vis.value;
    const p = Skia.Path.Make();
    if (reducedMotion) return p;
    const ct = v.t - v.closeT;
    if (ct >= 0 && ct < 260) {
      for (let i = 0; i < 6; i++) {
        const y = LANE_Y - 120 + i * 22;
        const x = v.closeX + (i % 2 === 0 ? -1 : 1) * (40 + ct * 0.4);
        p.moveTo(x - 30, y);
        p.lineTo(x + 30, y);
      }
    }
    if (v.wasSweeping) {
      // Speed-cap tell: 4 speed lines behind the shark.
      const dir = s.bv > 0 ? -1 : 1;
      const bx = s.bx / SUB;
      for (let i = 0; i < 4; i++) {
        const y = LANE_Y - 70 + i * 18;
        p.moveTo(bx + dir * (70 + i * 6), y);
        p.lineTo(bx + dir * (110 + i * 10), y);
      }
    }
    return p;
  });
  const dust = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    const v = vis.value;
    const p = Skia.Path.Make();
    if (!v.wasSweeping || reducedMotion) return p;
    const dir = s.bv > 0 ? -1 : 1;
    const bx = s.bx / SUB;
    const ph = (v.t % 50) / 50;
    for (let i = 0; i < 3; i++) {
      const r = 7 + (i + ph) * 4;
      p.addCircle(bx + dir * (60 + (i + ph) * 16), LANE_Y + 40 - i * 4, r);
    }
    return p;
  });

  // Frozen prompt (unranked) / thumb glyph under the veil.
  const frozenOp = useDerivedValue(() => {
    tick.value;
    const v = vis.value;
    if (v.frozenMs < 600 || sim.value.done) return 0;
    return 0.75 + 0.25 * Math.sin(v.cloudT / 160);
  });
  const frozenX = useDerivedValue(() => {
    tick.value;
    return sim.value.bx / SUB;
  });
  const frozenRingR = useDerivedValue(() => 30 + 8 * Math.abs(Math.sin(vis.value.cloudT / 220)));
  const holdX = useDerivedValue(() => {
    tick.value;
    return sim.value.bx / SUB - (fontSmall ? fontSmall.measureText('HOLD TO PLAY').width / 2 : 40);
  });

  // Set pips (queue).
  const setOp = (i: number) => useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    if (s.mode !== MODE_QUEUE) return 0;
    return s.set >= i ? 1 : 0.3;
  });
  const set0 = setOp(0);
  const set1 = setOp(1);
  const set2 = setOp(2);
  const isQueue = useDerivedValue(() => (sim.value.mode === MODE_QUEUE ? 1 : 0));

  // Rival portrait (ghost rounds): their shark reacting at YOUR clock step, score, tug bar; rail tick.
  const ghostOp = useDerivedValue(() => (ghost.value ? 1 : 0));
  const ghostX = useDerivedValue(() => {
    tick.value;
    const g = ghost.value;
    return g ? g.sim.bx / SUB : 200;
  });
  const ghostScoreText = useDerivedValue(() => {
    tick.value;
    const g = ghost.value;
    if (!g) return '';
    return `${g.sim.score + g.sim.bonus}`;
  });
  const tugW = useDerivedValue(() => {
    tick.value;
    const g = ghost.value;
    if (!g) return 0;
    const mine = sim.value.score;
    const theirs = g.sim.score;
    const f = mine + theirs > 0 ? mine / (mine + theirs) : 0.5;
    return 84 * f;
  });
  const ghostRim = useDerivedValue(() => {
    tick.value;
    const g = ghost.value;
    return g && g.sim.ghQ > 0 ? GOLD : BLUE;
  });
  const ghostHype = useDerivedValue(() => {
    tick.value;
    const g = ghost.value;
    return g && (g.sim.ghQ > 0 || gatedTier(g.sim) >= 3) ? 1 : 0;
  });
  const ghostCalm = useDerivedValue(() => 1 - ghostHype.value);
  const ghostScoreX = useDerivedValue(() => {
    const t = ghostScoreText.value;
    return 346 - (fontSmall ? fontSmall.measureText(t).width / 2 : 10);
  });
  const ghostNameX = useDerivedValue(() => 346 - (fontTiny ? fontTiny.measureText(ghostName).width / 2 : 10));
  const ghostTickX = useDerivedValue(() => ghostX.value - 3);

  // Line Heat strip (11.2): up to 8 pills ranked by live score; yours ringed; strangers are
  // fin silhouettes (no name); a frozen chip dims and shows the thumb dot.
  const stripOp = useDerivedValue(() => (strip && strip.value ? 1 : 0));
  const pillOp = (i: number) => useDerivedValue(() => {
    tick.value;
    const list = strip ? strip.value : null;
    if (!list || i >= list.length) return 0;
    return list[i].frozen ? 0.55 : 1;
  });
  const pillMe = (i: number) => useDerivedValue(() => {
    tick.value;
    const list = strip ? strip.value : null;
    return list && i < list.length && list[i].me ? 1 : 0;
  });
  const pillText = (i: number) => useDerivedValue(() => {
    tick.value;
    const list = strip ? strip.value : null;
    if (!list || i >= list.length) return '';
    const e = list[i];
    return `${i + 1} ${e.me ? 'YOU' : e.silhouette ? '' : e.label}`.trim();
  });
  const pillFin = (i: number) => useDerivedValue(() => {
    tick.value;
    const list = strip ? strip.value : null;
    return list && i < list.length && list[i].silhouette ? 1 : 0;
  });
  const PILLS = [0, 1, 2, 3, 4, 5, 6, 7];
  const pOps = PILLS.map((i) => pillOp(i));
  const pMes = PILLS.map((i) => pillMe(i));
  const pTexts = PILLS.map((i) => pillText(i));
  const pFins = PILLS.map((i) => pillFin(i));
  const finPath = useMemo(() => {
    const p = Skia.Path.Make();
    p.moveTo(-4, 6);
    p.lineTo(4, -7);
    p.lineTo(8, 6);
    p.close();
    return p;
  }, []);

  // -- stamps --------------------------------------------------------------------------------------
  const stampText = useDerivedValue(() => {
    tick.value;
    const v = vis.value;
    const age = v.t - v.stampT;
    const hold = v.stamp === ST_TIME || v.stamp === ST_OUT ? 100000 : v.stamp === ST_GOLDEN ? 1450 : 800;
    if (v.stamp === ST_NONE || age > hold) return '';
    return STAMP_TEXT[v.stamp] ?? '';
  });
  const stampTransform = useDerivedValue(() => {
    tick.value;
    const v = vis.value;
    const age = v.t - v.stampT;
    const big = stampIsBig(v.stamp);
    let sc = 1;
    if (age < 110) sc = 0.5 + 0.7 * easeOutBack(age / 110) * (big ? 1.1 : 1);
    else if (age < 180) sc = 1.2 - 0.2 * ((age - 110) / 70);
    if (big && age < 180 && (v.stamp === ST_TIME || v.stamp === ST_OUT)) sc = 2 - easeOutBack(age / 180);
    if (v.stamp === ST_POP && v.stampSuffix === 1) sc *= 1.3;
    const w = fontStamp ? fontStamp.measureText(stampText.value).width : 100;
    const scaleFit = Math.min(1, 360 / Math.max(1, w));
    if (big) return [{ translateX: 200 }, { translateY: 300 }, { scale: sc * scaleFit * 1.1 }, { translateX: -w / 2 }];
    const x = Math.max(110, Math.min(290, v.stampX));
    return [{ translateX: x }, { translateY: LANE_Y - 210 - (age < 600 ? age / 30 : 20) }, { scale: sc * scaleFit * 0.62 }, { translateX: -w / 2 }];
  });
  const stampColor = useDerivedValue(() => {
    tick.value;
    const st = vis.value.stamp;
    if (st === ST_GOLDEN) return GOLD;
    if (st === ST_OUT) return CORAL;
    return '#ffffff';
  });
  const stampOpacity = useDerivedValue(() => {
    tick.value;
    const v = vis.value;
    const age = v.t - v.stampT;
    const hold = v.stamp === ST_TIME || v.stamp === ST_OUT ? 100000 : v.stamp === ST_GOLDEN ? 1450 : 800;
    if (age > hold) return 0;
    if (age > hold - 150) return (hold - age) / 150;
    return 1;
  });

  // -- snack cart + Finn, gull -------------------------------------------------------------------------
  const cartTransform = useDerivedValue(() => {
    tick.value;
    const v = vis.value;
    const s = sim.value;
    const x = v.cartPos;
    const trackY = TRACK_Y - 2 + Math.sin(x / 40) * 5;
    const tt = v.t - Math.max(v.cartT, v.serveTellT);
    const wobble = tt >= -400 && tt < 400 && !reducedMotion ? Math.sin(tt / 30) * 0.12 * (1 - Math.abs(tt) / 400) : 0;
    const ph = (s.clock % STEPS_BEAT) / STEPS_BEAT;
    const rattle = reducedMotion ? 0 : -Math.max(0, Math.cos(ph * Math.PI * 2)) * 1.5;
    return [{ translateX: x }, { translateY: trackY + 4 + rattle }, { rotate: wobble }, { translateX: -24 }, { translateY: -48 }];
  });
  const finnY = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    const v = vis.value;
    const ph = (s.clock % STEPS_BEAT) / STEPS_BEAT;
    const bob = reducedMotion ? 0 : -Math.max(0, Math.cos(ph * Math.PI * 2)) * 2;
    const bt = v.t - v.badgeT;
    const hop = bt >= 0 && bt < 300 && !reducedMotion ? -Math.sin((bt / 300) * Math.PI) * 10 : 0;
    return -18 + bob + hop;
  });
  const gullShadow = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    const p = Skia.Path.Make();
    if (s.gSt !== 1 && s.gSt !== 2) return p;
    const u = s.gSt === 2 ? 1 : clamp01((s.gQ / 256) / Math.max(1, s.gLen));
    const w = 20 + 70 * u * u;
    const x = s.gX / SUB;
    p.addOval(rect(x - w, LANE_Y + 22 - w * 0.22, w * 2, w * 0.44));
    return p;
  });
  const gullShadowColor = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    const u = s.gSt === 2 ? 1 : clamp01((s.gQ / 256) / Math.max(1, s.gLen));
    return u < 0.5 ? '#ffffff' : u < 0.85 ? GOLD : CORAL;
  });
  const gullOp = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    const v = vis.value;
    if (s.gSt === 1 || s.gSt === 2) return 1;
    return v.t - v.gullT < 600 && v.gullPhase >= 3 ? 1 : 0;
  });
  const gullTransform = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    const v = vis.value;
    let x = v.gullX;
    let y = 150;
    let rot = 0;
    let face = v.gullEdge > 200 ? 1 : -1;
    if (s.gSt === 1) {
      // Wing flash at the entry edge, circling high.
      const u = clamp01((s.gQ / 256) / Math.max(1, s.gLen));
      const edge = v.gullEdge > 200 ? FIELD_W - 30 : 30;
      x = edge + (reducedMotion ? 0 : Math.sin(v.t / 300) * 18);
      y = 140 + Math.sin(u * Math.PI) * -12;
    } else if (s.gSt === 2) {
      x = gullX(s);
      y = gullY(s);
      rot = 0.45 * face;
    } else {
      const u = clamp01((v.t - v.gullT) / 600);
      // Bonked back (6) the way it came, or flies off after the steal / whiff.
      const back = v.gullPhase === 6 ? 1 : 0;
      x = v.gullX + (v.gullEdge - v.gullX) * u * (back ? 1 : 0.6);
      y = LANE_Y - 40 - u * 380;
      rot = back ? u * 8 : -0.3 * face;
      if (!back) face = -face;
    }
    return [{ translateX: x }, { translateY: y }, { rotate: rot }, { scaleX: face }, { translateX: -45 }, { translateY: -24 }];
  });
  const gullFlap = useDerivedValue(() => {
    tick.value;
    return Math.floor(vis.value.t / 62) % 2;
  });
  const gullGlideOp = useDerivedValue(() => (gullFlap.value === 0 ? gullOp.value : 0));
  const gullUpOp = useDerivedValue(() => (gullFlap.value === 1 ? gullOp.value : 0));

  // -- catch plop star-burst (4 frames x 30 ms) and the ink POW (3 frames x 2 steps) ---------------
  const plopFrame = (f: number) => useDerivedValue(() => {
    tick.value;
    const t = vis.value.t - vis.value.plopT;
    return t >= f * 30 && t < (f + 1) * 30 ? 1 : 0;
  });
  const plop0 = plopFrame(0);
  const plop1 = plopFrame(1);
  const plop2 = plopFrame(2);
  const plop3 = plopFrame(3);
  const plopX = useDerivedValue(() => vis.value.plopX - 34);
  const powFrame = (f: number) => useDerivedValue(() => {
    tick.value;
    if (reducedMotion) return 0;
    const t = vis.value.t - vis.value.powT;
    return t >= f * 34 && t < (f + 1) * 34 ? 1 : 0;
  });
  const pow0 = powFrame(0);
  const pow1 = powFrame(1);
  const pow2 = powFrame(2);
  const powX = useDerivedValue(() => vis.value.powX - 45);
  const powY = useDerivedValue(() => vis.value.powY - 48);

  if (!atlas) {
    return (
      <Canvas style={[StyleSheet.absoluteFill, { width, height }]} pointerEvents="none">
        <Rect x={0} y={0} width={width} height={height} color="#8fd6ff" />
      </Canvas>
    );
  }

  const skyStart = vec(0, skyTop);
  const skyEnd = vec(0, LANE_Y + 40);
  const im = images;
  const BW = BASKET_W;
  const rimY = BASKET_H * BASKET_RIM;
  const notchXs = [0, 1, 2, 3];
  return (
    <Canvas style={[StyleSheet.absoluteFill, { width, height }]} pointerEvents="none">
      <Group transform={root}>
        <Group transform={camera} origin={cameraOrigin}>
          {/* Sky: blue in every state, posterized flat rays */}
          <Rect x={-40} y={skyTop - 40} width={FIELD_W + 80} height={LANE_Y + 120 - skyTop}>
            <LinearGradient start={skyStart} end={skyEnd} colors={['#3db8ff', '#8fd6ff', '#bfeaff']} />
          </Rect>
          <Group transform={[{ translateX: 200 }, { translateY: 300 }]}>
            <Group transform={rayRot}>
              <Path path={rays} color="#ffffff" opacity={0.09} />
            </Group>
          </Group>
          {im.cloud ? (
            <>
              <SkImage image={im.cloud} x={c1} y={cY1} width={116} height={77} opacity={0.95} />
              <SkImage image={im.cloud} x={c2} y={cY2} width={82} height={54} opacity={0.9} />
              <SkImage image={im.cloud} x={c3} y={cY3} width={62} height={41} opacity={0.85} />
            </>
          ) : null}
          {/* Hills and the flat-painted plaza (the AI plate ships only with Dustin's OK) */}
          <Oval x={-120} y={392} width={360} height={170} color="#a9e59a" />
          <Oval x={170} y={402} width={360} height={170} color="#98dc88" />
          <Path path={hillInk} style="stroke" strokeWidth={3} color="#6cbf6e" opacity={0.5} />
          <Rect x={-40} y={470} width={FIELD_W + 80} height={FIELD_H - 470 + 200} color="#f6d9a6" />
          <Path path={plazaTiles} color="#f1cd92" />
          <Rect x={-40} y={470} width={FIELD_W + 80} height={6} color="#e8b979" />
          <Rect x={-40} y={LANE_Y + 14} width={FIELD_W + 80} height={20} color="#ffffff" opacity={0.55} />
          <Path path={railTicks} color="#ffffff" opacity={0.9} />
          <Rect x={-40} y={PLAZA_Y - 4} width={FIELD_W + 80} height={4} color="#e0a868" />
          <Path path={splatPuddles} color="#fff4c8" opacity={0.85} />
          <Path path={splatPuddles} style="stroke" strokeWidth={2.5} color={INK} opacity={0.55} />
          {/* Golden Hour: Alex's starburst spins behind the cart */}
          {im.starburst ? (
            <Group transform={burstTransform} opacity={burstOpacity}>
              <SkImage image={im.starburst} x={0} y={0} width={790} height={794}>
                <BlendColor color="#ffe27a" mode="srcIn" />
              </SkImage>
            </Group>
          ) : null}
          {/* Coaster track, prize strings, Finn's snack cart */}
          <Path path={ties} color="#2d6fd6" opacity={0.85} />
          <Path path={track} style="stroke" strokeWidth={7} color={INK} />
          <Path path={track} style="stroke" strokeWidth={4} color="#ffffff" />
          <Group opacity={itemsOp}>
            <Path path={strings} style="stroke" strokeWidth={3.2} color={INK} />
            <Path path={strings} style="stroke" strokeWidth={1.4} color="#ffffff" />
          </Group>
          {im.cart ? (
            <Group transform={cartTransform}>
              {im.finn ? <SkImage image={im.finn} x={11} y={finnY} width={26} height={26} /> : null}
              <SkImage image={im.cart} x={0} y={0} width={48} height={50} />
            </Group>
          ) : null}
          {/* Landing shadows, puffer coral shadows, gull shadow, ball marker, Excellent rings */}
          <Path path={shadows} color="#0b2a55" opacity={0.18} />
          <Path path={pufferShadows} color={CORAL} opacity={pufferPulse} />
          <Path path={pufferShadows} style="stroke" strokeWidth={3} color={INK} opacity={0.7} />
          <Path path={gullShadow} color={gullShadowColor} opacity={0.55} />
          <Path path={gullShadow} style="stroke" strokeWidth={3} color={INK} opacity={0.7} />
          <Path path={ballMarker} color={BLUE} opacity={0.25} />
          <Path path={ballMarker} style="stroke" strokeWidth={5} color={INK} opacity={0.6} />
          <Path path={ballMarker} style="stroke" strokeWidth={3} color={BLUE} />
          <Path path={ringsWhite} style="stroke" strokeWidth={5} color={INK} opacity={0.6} />
          <Path path={ringsWhite} style="stroke" strokeWidth={2.5} color="#ffffff" />
          <Path path={ringsGold} style="stroke" strokeWidth={5} color={INK} />
          <Path path={ringsGold} style="stroke" strokeWidth={3} color={GOLD} />
          {/* The free-ball pail on the plaza */}
          {im.pail ? (
            <Group opacity={pailOp}>
              <Group transform={pailTransform}>
                <SkImage image={im.pail} x={0} y={0} width={52} height={56} />
                <RoundedRect x={4} y={2} width={44} height={12} r={6} color="#cfd8e3" opacity={pailUsedOp} />
                <RoundedRect x={4} y={2} width={44} height={12} r={6} style="stroke" strokeWidth={2.5} color={INK} opacity={pailUsedOp} />
                <SkImage image={im.pail} x={0} y={0} width={52} height={56} opacity={pailShine}>
                  <BlendColor color="#ffffff" mode="srcIn" />
                </SkImage>
              </Group>
            </Group>
          ) : null}
          {/* Sweep dust (speed-cap tell) */}
          <Path path={dust} color="#fff8e4" opacity={0.85} />
          <Path path={dust} style="stroke" strokeWidth={2.5} color={INK} opacity={0.6} />
          {/* The shark (Rig B): key holds hang from the fin line on the rim */}
          <Group opacity={sharkOp}>
            <Group transform={sharkTransform}>
              {im.poseIdle ? <SkImage image={im.poseIdle} x={0} y={0} width={POSE_W} height={POSE_H} opacity={opIdle} /> : null}
              {im.poseHop ? <SkImage image={im.poseHop} x={0} y={0} width={POSE_W} height={POSE_H} opacity={opHop} /> : null}
              {im.poseChomp ? <SkImage image={im.poseChomp} x={0} y={0} width={POSE_W} height={POSE_H} opacity={opChomp} /> : null}
              {im.poseCheer ? <SkImage image={im.poseCheer} x={0} y={0} width={POSE_W} height={POSE_H} opacity={opCheer} /> : null}
              {im.poseFlinch ? <SkImage image={im.poseFlinch} x={0} y={0} width={POSE_W} height={POSE_H} opacity={opFlinch} /> : null}
              {/* Impact frame: one-frame white silhouette of the pose on screen */}
              {im.poseIdle ? <SkImage image={im.poseIdle} x={0} y={0} width={POSE_W} height={POSE_H} opacity={flIdle}><BlendColor color="#ffffff" mode="srcIn" /></SkImage> : null}
              {im.poseHop ? <SkImage image={im.poseHop} x={0} y={0} width={POSE_W} height={POSE_H} opacity={flHop}><BlendColor color="#ffffff" mode="srcIn" /></SkImage> : null}
              {im.poseChomp ? <SkImage image={im.poseChomp} x={0} y={0} width={POSE_W} height={POSE_H} opacity={flChomp}><BlendColor color="#ffffff" mode="srcIn" /></SkImage> : null}
              {im.poseCheer ? <SkImage image={im.poseCheer} x={0} y={0} width={POSE_W} height={POSE_H} opacity={flCheer}><BlendColor color="#ffffff" mode="srcIn" /></SkImage> : null}
              {im.poseFlinch ? <SkImage image={im.poseFlinch} x={0} y={0} width={POSE_W} height={POSE_H} opacity={flFlinch}><BlendColor color="#ffffff" mode="srcIn" /></SkImage> : null}
            </Group>
          </Group>
          <Group transform={bodyTransform}>
            {im.sharkDizzy ? <SkImage image={im.sharkDizzy} x={0} y={0} width={SHARK_W * 0.96} height={SHARK_H} opacity={opDizzy} /> : null}
            {im.sharkFist ? <SkImage image={im.sharkFist} x={0} y={0} width={SHARK_W} height={SHARK_H} opacity={opFist} /> : null}
            {im.sharkFacepalm ? <SkImage image={im.sharkFacepalm} x={-14} y={0} width={(SHARK_H * 551) / 768} height={SHARK_H} opacity={opSlump} /> : null}
          </Group>
          {/* Head chip: tier, Coin Meter ring, padlocked ball when the gate holds (drawn behind items at 85%) */}
          {fontSmall ? (
            <Group transform={chipTransform} opacity={0.92}>
              <RoundedRect x={-46} y={-17} width={92} height={34} r={17} color="#ffffff" />
              <RoundedRect x={-46} y={-17} width={92} height={34} r={17} style="stroke" strokeWidth={3.5} color={INK} />
              <Text x={-38} y={8} text={tierText} font={fontSmall} color={tierColor} />
              <Group transform={[{ translateX: 10 }]} opacity={ringDim}>
                <Path path={arc0} style="stroke" strokeWidth={5} color={GOLD} opacity={p0} />
                <Path path={arc1} style="stroke" strokeWidth={5} color={GOLD} opacity={p1} />
                <Path path={arc2} style="stroke" strokeWidth={5} color={GOLD} opacity={p2} />
                {im.coin ? <SkImage image={im.coin} x={6} y={-10} width={20} height={20} /> : null}
                <Circle cx={30} cy={-12} r={4} color="#ffffff" opacity={readyOp} />
              </Group>
              <Group opacity={lockOp}>
                <RoundedRect x={-48} y={-36} width={30} height={22} r={7} color="#dff3ff" />
                <RoundedRect x={-48} y={-36} width={30} height={22} r={7} style="stroke" strokeWidth={2.5} color={INK} />
                {im.ball ? <SkImage image={im.ball} x={-42} y={-34} width={18} height={18} /> : null}
              </Group>
              <Group opacity={shardOp}>
                <Group transform={shardTransformA}><RoundedRect x={-10} y={-8} width={20} height={16} r={4} color="#dff3ff" /><RoundedRect x={-10} y={-8} width={20} height={16} r={4} style="stroke" strokeWidth={2.5} color={INK} /></Group>
                <Group transform={shardTransformB}><RoundedRect x={-10} y={-8} width={20} height={16} r={4} color="#dff3ff" /><RoundedRect x={-10} y={-8} width={20} height={16} r={4} style="stroke" strokeWidth={2.5} color={INK} /></Group>
              </Group>
            </Group>
          ) : null}
          {/* Golden Hour halos under items and prizes */}
          <Path path={halos} color={GOLD} opacity={haloOp} />
          <Group opacity={itemsOp}>
            <Path path={luckyHalo} style="stroke" strokeWidth={6} color={INK} opacity={0.5} />
            <Path path={luckyHalo} style="stroke" strokeWidth={3.5} color={GOLD} />
            {/* Items and hanging prizes: one Atlas draw (hidden by the Veil) */}
            <Atlas image={atlas.image} sprites={spritesA} transforms={transformsA} />
          </Group>
          {/* Pile and splat decals */}
          <Atlas image={atlas.image} sprites={spritesB} transforms={transformsB} />
          {/* Basket (counter-rotated, level rim) with the gold notch and the 4 zone seams */}
          <Group transform={basketTransform}>
            {im.basket ? <SkImage image={im.basket} x={0} y={0} width={BW} height={BASKET_H} /> : null}
            {im.basket ? (
              <Group clip={rect(0, 0, BW, BASKET_H)}>
                <SkImage image={im.basket} x={0} y={0} width={BW} height={BASKET_H} opacity={sheenOp}>
                  <BlendColor color="rgba(255,205,40,0.45)" mode="srcATop" />
                </SkImage>
              </Group>
            ) : null}
            {im.basket ? (
              <SkImage image={im.basket} x={0} y={0} width={BW} height={BASKET_H} opacity={flashOp}>
                <BlendColor color="#ffffff" mode="srcIn" />
              </SkImage>
            ) : null}
            {im.basket ? (
              <Group clip={rect(0, rimY - 10, BW, 34)}>
                <SkImage image={im.basket} x={0} y={0} width={BW} height={BASKET_H} opacity={lipOp}>
                  <BlendColor color="#ffffff" mode="srcIn" />
                </SkImage>
              </Group>
            ) : null}
            <Path path={seams} color="#8a5a2b" />
            <Path path={zoneFlash} color="#ffffff" opacity={0.95} />
            <Circle cx={BW / 2} cy={rimY - 2} r={notchGlowR} color={GOLD} opacity={notchGlowOp} />
            <RoundedRect x={BW / 2 - 13} y={rimY - 8} width={26} height={11} r={4} color={INK} />
            <RoundedRect x={BW / 2 - 11} y={rimY - 6} width={22} height={7} r={3} color={GOLD} opacity={notchOp} />
          </Group>
          {/* Rim flame at x3+ */}
          {im.streak ? (
            <Group transform={flameTransform} opacity={flameOp}>
              <SkImage image={im.streak} x={0} y={0} width={30} height={35} />
            </Group>
          ) : null}
          {/* Catch plop star-burst flipbook */}
          {im.plop[0] ? <SkImage image={im.plop[0]} x={plopX} y={LANE_Y - 44} width={68} height={68} opacity={plop0} /> : null}
          {im.plop[1] ? <SkImage image={im.plop[1]} x={plopX} y={LANE_Y - 44} width={68} height={68} opacity={plop1} /> : null}
          {im.plop[2] ? <SkImage image={im.plop[2]} x={plopX} y={LANE_Y - 44} width={68} height={68} opacity={plop2} /> : null}
          {im.plop[3] ? <SkImage image={im.plop[3]} x={plopX} y={LANE_Y - 44} width={68} height={68} opacity={plop3} /> : null}
          {/* Aim ghost-line, ribbon trail, ball, bounce ring, juggle counter */}
          <Group opacity={aimOp}>
            <Path path={aimLine} color="#ffffff" />
            <Path path={aimLine} style="stroke" strokeWidth={2} color={INK} />
          </Group>
          <Group opacity={itemsOp}>
            <Path path={trail} color={trailColor} opacity={0.9} />
            <Path path={trail} style="stroke" strokeWidth={2.5} color={INK} opacity={0.8} />
          </Group>
          {im.ball ? (
            <Group transform={ballTransform}>
              <SkImage image={im.ball} x={0} y={0} width={BALL_R * 2} height={BALL_R * 2} />
              <Circle cx={BALL_R} cy={BALL_R} r={BALL_R + 3} style="stroke" strokeWidth={6} color={INK} opacity={ballRingOp} />
              <Circle cx={BALL_R} cy={BALL_R} r={BALL_R + 3} style="stroke" strokeWidth={ballRingW} color={ballRingColor} opacity={ballRingOp} />
              <Circle cx={BALL_R} cy={BALL_R} r={BALL_R - 1} style="stroke" strokeWidth={4} color={GOLD} opacity={goldBallOp} />
            </Group>
          ) : null}
          {fontSmall ? (
            <>
              <Text x={juggleX} y={juggleY} text={juggleText} font={fontSmall} color={INK} style="stroke" strokeWidth={5} />
              <Text x={juggleX} y={juggleY} text={juggleText} font={fontSmall} color="#ffffff" />
            </>
          ) : null}
          {/* Gull (queue Gull Set) */}
          <Group transform={gullTransform}>
            {im.gullGlide ? <SkImage image={im.gullGlide} x={0} y={0} width={90} height={46} opacity={gullGlideOp} /> : null}
            {im.gullUp ? <SkImage image={im.gullUp} x={0} y={-20} width={90} height={89} opacity={gullUpOp} /> : null}
          </Group>
          {/* CLOSE CALL and sweep speed lines */}
          <Path path={speedLines} style="stroke" strokeWidth={5} color={INK} opacity={0.5} strokeCap="round" />
          <Path path={speedLines} style="stroke" strokeWidth={2.5} color="#ffffff" strokeCap="round" />
          {/* Ink POW flipbook (PERFECT, puffer hit, BONK) */}
          {im.pow[0] ? <SkImage image={im.pow[0]} x={powX} y={powY} width={90} height={98} opacity={pow0} /> : null}
          {im.pow[1] ? <SkImage image={im.pow[1]} x={powX} y={powY} width={90} height={98} opacity={pow1} /> : null}
          {im.pow[2] ? <SkImage image={im.pow[2]} x={powX} y={powY} width={90} height={98} opacity={pow2} /> : null}
          {/* Parked shield: a white bubble glint around the shark */}
          <Group opacity={shieldOp}>
            <Circle cx={shieldCx} cy={LANE_Y - 50} r={shieldR} color="#ffffff" opacity={0.25} />
            <Circle cx={shieldCx} cy={LANE_Y - 50} r={shieldR} style="stroke" strokeWidth={4} color="#ffffff" />
            <Circle cx={shieldCx} cy={LANE_Y - 50} r={shieldR} style="stroke" strokeWidth={1.5} color={INK} opacity={0.6} />
          </Group>
          {/* The Veil: a flat white wash over the sky band (never dark) */}
          <Rect x={-40} y={skyTop - 40} width={FIELD_W + 80} height={LANE_Y - 40 - skyTop} color="#ffffff" opacity={washOp} />
          {/* Frozen prompt: thumb glyph */}
          <Group opacity={frozenOp}>
            <Circle cx={frozenX} cy={LANE_Y + 128} r={frozenRingR} style="stroke" strokeWidth={6} color={INK} opacity={0.5} />
            <Circle cx={frozenX} cy={LANE_Y + 128} r={frozenRingR} style="stroke" strokeWidth={4} color="#ffffff" />
            <Circle cx={frozenX} cy={LANE_Y + 128} r={13} color="#ffffff" />
            <Circle cx={frozenX} cy={LANE_Y + 128} r={13} style="stroke" strokeWidth={3} color={INK} />
            {fontSmall ? <Text x={holdX} y={LANE_Y + 176} text="HOLD TO PLAY" font={fontSmall} color={INK} /> : null}
          </Group>
          {/* Lock ring at the thumb's last touch point (fills over the remaining lock) */}
          <Group opacity={lockOpRing}>
            <Path path={lockRing} style="stroke" strokeWidth={6} color={INK} opacity={0.45} />
            <Path path={lockRing} style="stroke" strokeWidth={3} color="#ffffff" opacity={0.6} />
            <Path path={lockArc} style="stroke" strokeWidth={5} color="#ffffff" strokeCap="round" />
          </Group>
          {/* Rival rail tick (ghost rounds) */}
          <Group opacity={ghostOp}>
            <RoundedRect x={ghostTickX} y={LANE_Y + 36} width={6} height={16} r={3} color={CORAL} />
            <RoundedRect x={ghostTickX} y={LANE_Y + 36} width={6} height={16} r={3} style="stroke" strokeWidth={1.5} color={INK} />
          </Group>
        </Group>

        {/* Golden Hour frame (HUD layer: never shakes) */}
        <Group opacity={frameOpacity}>
          <Rect x={0} y={skyTop} width={FIELD_W} height={FIELD_H - skyTop} style="stroke" strokeWidth={10} color={GOLD} />
          <Rect x={5} y={skyTop + 5} width={FIELD_W - 10} height={FIELD_H - skyTop - 10} style="stroke" strokeWidth={3} color="#fff1c4" />
        </Group>
        {/* Foreground bunting (parallax-free HUD-adjacent, leans with Crosswind) */}
        <Path path={buntA} color={BLUE} opacity={0.95} />
        <Path path={buntB} color="#ffffff" opacity={0.95} />
        <Path path={buntA} style="stroke" strokeWidth={2} color={INK} opacity={0.7} />
        <Path path={buntB} style="stroke" strokeWidth={2} color={INK} opacity={0.7} />

        {/* Top band: hearts, time bar, star meter */}
        {im.heart ? (
          <>
            <Group transform={hs0} opacity={h0}><SkImage image={im.heart} x={0} y={0} width={26} height={24} /></Group>
            <Group transform={hs1} opacity={h1}><SkImage image={im.heart} x={0} y={0} width={26} height={24} /></Group>
            <Group transform={hs2} opacity={h2}><SkImage image={im.heart} x={0} y={0} width={26} height={24} /></Group>
          </>
        ) : null}
        <RoundedRect x={TIME_X} y={15} width={TIME_W + 4} height={16} r={8} color="#ffffff" />
        <Group transform={timePulse} origin={vec(200, 23)}>
          <RoundedRect x={TIME_X + 2} y={17} width={timeFillW} height={12} r={6} color={timeColor} />
        </Group>
        <Group clip={rect(TIME_X + 2, 17, TIME_W, 12)}>
          <Rect x={frozenShimmer} y={17} width={30} height={12} color="#ffffff" opacity={0.7} />
        </Group>
        <RoundedRect x={TIME_X} y={15} width={TIME_W + 4} height={16} r={8} style="stroke" strokeWidth={3} color={INK} />
        {im.timer ? <SkImage image={im.timer} x={TIME_X - 20} y={9} width={26} height={26} /> : null}
        {im.rush ? <SkImage image={im.rush} x={TIME_X + TIME_W + 2} y={8} width={18} height={30} opacity={rushOp} /> : null}
        {/* Star meter */}
        <RoundedRect x={TIME_X} y={44} width={TIME_W + 4} height={14} r={7} color="#ffffff" />
        <RoundedRect x={TIME_X + 2} y={46} width={meterFillW} height={10} r={5} color={meterFillColor} />
        <RoundedRect x={TIME_X} y={44} width={TIME_W + 4} height={14} r={7} style="stroke" strokeWidth={2.5} color={INK} />
        {notchXs.map((i) => (tgt[i] > 0 ? (
          <Group key={i} transform={i === 0 ? n0 : i === 1 ? n1 : i === 2 ? n2 : n3}>
            {i < 3 ? (
              <>
                <Circle cx={0} cy={0} r={9} color="#ffffff" />
                <Circle cx={0} cy={0} r={9} color={GOLD} opacity={i === 0 ? l0 : i === 1 ? l1 : l2} />
                <Circle cx={0} cy={0} r={9} style="stroke" strokeWidth={2.5} color={INK} />
                {fontTiny ? <Text x={-3.5} y={4.5} text={`${i + 1}`} font={fontTiny} color={INK} /> : null}
              </>
            ) : im.crown ? (
              <Group opacity={crownOp}>
                <SkImage image={im.crown} x={-12} y={-13} width={24} height={22} />
              </Group>
            ) : null}
          </Group>
        ) : null))}
        {font ? (
          <>
            <Text x={12} y={72} text={scoreText} font={font} color={INK} style="stroke" strokeWidth={6} />
            <Text x={12} y={72} text={scoreText} font={font} color="#ffffff" />
          </>
        ) : null}
        {fontTiny ? <Text x={TIME_X + 4} y={74} text={nextText} font={fontTiny} color={INK} /> : null}
        <Group opacity={isQueue}>
          <Circle cx={TIME_X + TIME_W - 28} cy={70} r={5} color="#ffffff" opacity={set0} />
          <Circle cx={TIME_X + TIME_W - 12} cy={70} r={5} color="#ffffff" opacity={set1} />
          <Circle cx={TIME_X + TIME_W + 4} cy={70} r={5} color="#ffffff" opacity={set2} />
          <Circle cx={TIME_X + TIME_W - 28} cy={70} r={5} style="stroke" strokeWidth={2} color={INK} />
          <Circle cx={TIME_X + TIME_W - 12} cy={70} r={5} style="stroke" strokeWidth={2} color={INK} />
          <Circle cx={TIME_X + TIME_W + 4} cy={70} r={5} style="stroke" strokeWidth={2} color={INK} />
        </Group>

        {/* Line Heat strip: 8 ranked pills under the star meter */}
        <Group opacity={stripOp}>
          {PILLS.map((i) => (
            <Group key={i} opacity={pOps[i]} transform={[{ translateX: 8 + i * 48 }, { translateY: 82 }]}>
              <RoundedRect x={0} y={0} width={45} height={18} r={9} color="#ffffff" />
              <RoundedRect x={0} y={0} width={45} height={18} r={9} style="stroke" strokeWidth={2} color={INK} />
              <Group opacity={pMes[i]}>
                <RoundedRect x={0} y={0} width={45} height={18} r={9} style="stroke" strokeWidth={3.5} color={BLUE} />
              </Group>
              <Group opacity={pFins[i]} transform={[{ translateX: 30 }, { translateY: 9 }]}>
                <Path path={finPath} color="#7a8aa6" />
              </Group>
              {fontTiny ? <Text x={5} y={13.5} text={pTexts[i]} font={fontTiny} color={INK} /> : null}
            </Group>
          ))}
        </Group>

        {/* Rival portrait window (ghost rounds): their shark, score, tug bar */}
        <Group opacity={ghostOp}>
          <RoundedRect x={302} y={96} width={88} height={88} r={16} color="#ffffff" />
          <RoundedRect x={302} y={96} width={88} height={88} r={16} style="stroke" strokeWidth={4} color={ghostRim} />
          <Group clip={rect(304, 98, 84, 84)}>
            {im.poseIdle ? <SkImage image={im.poseIdle} x={282} y={92} width={POSE_W * 0.82} height={POSE_H * 0.82} opacity={ghostCalm} /> : null}
            {im.poseCheer ? <SkImage image={im.poseCheer} x={282} y={92} width={POSE_W * 0.82} height={POSE_H * 0.82} opacity={ghostHype} /> : null}
          </Group>
          <RoundedRect x={304} y={188} width={84} height={8} r={4} color="#ffffff" />
          <RoundedRect x={304} y={188} width={tugW} height={8} r={4} color={BLUE} />
          <RoundedRect x={304} y={188} width={84} height={8} r={4} style="stroke" strokeWidth={2} color={INK} />
          {fontSmall ? <Text x={ghostScoreX} y={214} text={ghostScoreText} font={fontSmall} color={INK} /> : null}
          {fontTiny ? <Text x={ghostNameX} y={92} text={ghostName} font={fontTiny} color={INK} /> : null}
        </Group>

        {/* Stamps */}
        {fontStamp ? (
          <Group transform={stampTransform} opacity={stampOpacity}>
            <Text x={0} y={0} text={stampText} font={fontStamp} color={INK} style="stroke" strokeWidth={9} />
            <Text x={0} y={0} text={stampText} font={fontStamp} color={stampColor} />
          </Group>
        ) : null}
      </Group>
    </Canvas>
  );
});

function squash(v: Vis): number {
  'worklet';
  const t = v.t - v.squashT;
  if (t < 0 || t > 220) return 1;
  const amt = 0.12 * v.squashAmt;
  if (t < 60) return 1 - amt * (t / 60);
  const u = (t - 60) / 160;
  return 1 - amt + amt * (1 - Math.exp(-5 * u) * Math.cos(9 * u));
}

/** Excellent rings: from 60% of the fall, 28 -> 6 fu radius; gold when the basket is in the PERFECT window. */
function rings(s: SimState, gold: boolean) {
  'worklet';
  const p = Skia.Path.Make();
  const bx = s.bx / SUB;
  for (let i = 0; i < MAX_ITEMS; i++) {
    if (s.iSt[i] !== S_FALL || s.iKind[i] === K_PUFFER) continue;
    const prog = s.iAge[i] / 256 / Math.max(1, s.iLand[i]);
    if (prog < 0.6 || prog > 1.05) continue;
    const x = s.iX[i] / SUB;
    const inPerfect = Math.abs(bx - x) <= PERFECT_D;
    if (inPerfect !== gold) continue;
    const u = clamp01((prog - 0.6) / 0.4);
    const r = 28 - 22 * u;
    p.addOval(rect(x - r, LANE_Y - r * 0.4, r * 2, r * 0.8));
  }
  return p;
}

export { S_HANG, S_MISS, S_PASS, SP_GLINT, SP_JUICE };
