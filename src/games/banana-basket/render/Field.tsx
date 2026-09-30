/**
 * Banana Basket field: ONE Skia canvas, everything driven by shared values
 * (zero React renders during play).
 *
 * Layers (back to front): sky + posterized rays, Alex's clouds, hills and the
 * plaza, the coaster track, splat decals, landing shadows and Excellent rings,
 * the shark (pose layers) and the banana pile, the basket, falling items (one
 * <Atlas> draw), the juggle ball and its predicted arc, Golden Hour frame,
 * then the HUD (time bar, hearts, coin meter, chain badge, score chip,
 * stamps, rival strip). The camera transforms the world group only; the HUD
 * never shakes or scales.
 *
 * All drawing is in field units (400 x 720 logical): the root group scales
 * by k = width / 400 and adds extra sky on tall phones.
 */

import React, { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import {
  Atlas,
  BlendColor,
  Canvas,
  Circle,
  Group,
  Image as SkImage,
  LinearGradient,
  Oval,
  Path,
  Rect,
  RoundedRect,
  Skia,
  Text,
  rect,
  useColorBuffer,
  useFont,
  useImage,
  useRSXformBuffer,
  useRectBuffer,
  vec,
  type SkFont,
  type SkImage as SkImageT,
  type Transforms3d,
} from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { useSpriteAtlas } from '../../../gamekit/fx/SpriteAtlas';
import {
  BALL_ARC_BOUNCES, BALL_R, CARD_SET_BASE, FIELD_H, FIELD_W, HALF_ZONE, ITEM_SIZE, K_BANANA, K_BUNCH, K_COIN, K_FINGER,
  K_GIFT, K_LUCKY, K_PUFFER, K_WATCH, LANE_Y, METER_PIPS, PERFECT_D, PLAZA_Y, S_BONKED, S_DUNK, S_FALL, S_FREE, S_MISS,
  S_PASS, S_POP, S_RIM, SUB, TIER_AT,
} from '../constants';
import { MAX_ITEMS, MODE_QUEUE, tierOf, type SimState } from '../state';
import {
  MAX_SPLATS, POSE_BONKED, POSE_CHEER, POSE_DIZZY, POSE_FIST, POSE_IDLE, STAMP_TEXT, ST_GOLDEN, ST_NONE, ST_PERFECT,
  ST_RUSH, ST_TIME, ST_OUT, type Vis,
} from './vis';
import type { Ghost } from '../ghost';

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
const SP_GIFT = 5;
const SP_FINGER = 6;
const SP_WATCH = 7;

const SLOT_ITEMS = MAX_ITEMS;
const SLOT_PILE = 12;
const SLOT_SPLAT = MAX_SPLATS;
const SLOTS = SLOT_ITEMS + SLOT_PILE + SLOT_SPLAT;
const PILE_AT = [1, 3, 6, 8, 11, 15, 20, 25, 32, 40, 50, 64];

const SHARK_H = 178;
const SHARK_W = (SHARK_H * 573) / 768;
const BASKET_W = 156;
const BASKET_H = (BASKET_W * 332) / 384;
const BASKET_RIM = 0.3;
const INK = '#23263a';
const CORAL = '#ff6b5c';
const GOLD = '#fec90e';
const TIER_COLORS = ['#2d9cff', '#2d9cff', '#2d9cff', GOLD, CORAL, CORAL];

export interface FieldImages {
  sharkHold: SkImageT | null;
  sharkCheer: SkImageT | null;
  sharkBonked: SkImageT | null;
  sharkDizzy: SkImageT | null;
  sharkFist: SkImageT | null;
  basket: SkImageT | null;
  ball: SkImageT | null;
  heart: SkImageT | null;
  coin: SkImageT | null;
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
  const gift = useImage(require('../../../assets/games/banana-basket/v2/gift.png'));
  const finger = useImage(require('../../../assets/games/banana-basket/v2/finger.png'));
  const timer = useImage(require('../../../assets/games/banana-basket/v2/timer.png'));
  return {
    sharkHold: useImage(require('../../../assets/games/banana-basket/v2/shark_hold.png')),
    sharkCheer: useImage(require('../../../assets/games/banana-basket/v2/shark_cheer.png')),
    sharkBonked: useImage(require('../../../assets/games/banana-basket/v2/shark_bonked.png')),
    sharkDizzy: useImage(require('../../../assets/games/banana-basket/v2/shark_dizzy.png')),
    sharkFist: useImage(require('../../../assets/games/banana-basket/v2/shark_fist.png')),
    basket: useImage(require('../../../assets/games/banana-basket/v2/basket.png')),
    ball: useImage(require('../../../assets/games/banana-basket/v2/ball.png')),
    heart: useImage(require('../../../assets/games/banana-basket/v2/heart.png')),
    coin,
    timer,
    rush: useImage(require('../../../assets/games/banana-basket/v2/rush.png')),
    streak: useImage(require('../../../assets/games/banana-basket/v2/streak.png')),
    cloud: useImage(require('../../../../assets/images/screens/explore/cloud.png')),
    starburst: useImage(require('../../../../assets/images/screens/explore/starburst.png')),
    atlasSources: [banana, bunch, coin, puffer, pufferFull, gift, finger, timer],
  };
}

function spriteFor(kind: number, puff: number): number {
  'worklet';
  if (kind === K_BANANA) return SP_BANANA;
  if (kind === K_BUNCH || kind === K_LUCKY) return SP_BUNCH;
  if (kind === K_COIN) return SP_COIN;
  if (kind === K_PUFFER) return puff >= 2 ? SP_PUFFER_FULL : SP_PUFFER;
  if (kind === K_GIFT) return SP_GIFT;
  if (kind === K_FINGER) return SP_FINGER;
  if (kind === K_WATCH) return SP_WATCH;
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
}

export const BananaField = React.memo(function BananaField(props: FieldProps) {
  const { layout, sim, vis, tick, images, camera, cameraOrigin, ghost, ghostName, reducedMotion } = props;
  const { k, oy, width, height } = layout;
  const atlas = useSpriteAtlas(images.atlasSources, { cell: 256 });
  const font = useFont(require('../../../../assets/fonts/shark-random-funnyness-2.ttf'), 30);
  const fontSmall = useFont(require('../../../../assets/fonts/shark-random-funnyness-2.ttf'), 17);
  const fontStamp = useFont(require('../../../../assets/fonts/shark-random-funnyness-2.ttf'), 40);

  const root = useMemo(() => [{ translateY: oy }, { scale: k }], [k, oy]);
  const skyTop = -oy / k;

  // -- items, pile and splats: one Atlas draw ---------------------------------------------
  const rects = atlas?.rects;
  const sprites = useRectBuffer(SLOTS, (r, i) => {
    'worklet';
    tick.value;
    if (!rects) return;
    const s = sim.value;
    let idx = SP_BANANA;
    if (i < SLOT_ITEMS) idx = s.iSt[i] === S_FREE ? SP_BANANA : spriteFor(s.iKind[i], s.iPuff[i]);
    else if (i < SLOT_ITEMS + SLOT_PILE) idx = (i - SLOT_ITEMS) % 4 === 3 ? SP_BUNCH : SP_BANANA;
    const src = rects[idx];
    r.setXYWH(src.x, src.y, src.width, src.height);
  });
  const transforms = useRSXformBuffer(SLOTS, (xf, i) => {
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
      size = ITEM_SIZE[kind];
      x = s.iX[i] / SUB;
      y = s.iY[i] / SUB;
      const ageMs = (s.iAge[i] / 256) * 16.67;
      const seed = s.iId[i];
      const spin = (((seed * 73) % 130) + 90) * (seed % 2 === 0 ? 1 : -1);
      rot = reducedMotion ? 0 : ((spin * ageMs) / 1000) * (Math.PI / 180);
      if (kind === K_COIN) rot = Math.sin(ageMs / 180) * 0.25;
      if (kind === K_PUFFER) {
        size = s.iPuff[i] === 0 ? 46 : s.iPuff[i] === 1 ? 58 : 68;
        rot = Math.sin(ageMs / 32) * 0.1;
      }
      if (st === S_RIM) {
        const side = s.iSide[i] >= 0 ? 1 : -1;
        const off = Math.max(-(HALF_ZONE + 4), Math.min(HALF_ZONE + 4, x - bx));
        const roll = s.iT[i] / 256 / 8;
        x = bx + off * (1 - roll * 0.5);
        y = LANE_Y - size * 0.32;
        rot = side * Math.sin(v.t / 40) * 0.14;
      } else if (st === S_DUNK) {
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
      } else if (st === S_PASS || st === S_MISS) {
        // keeps falling past the rim toward the plaza
      }
    } else if (i < SLOT_ITEMS + SLOT_PILE) {
      const n = i - SLOT_ITEMS;
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
      const jig = v.t - v.squashT;
      if (jig >= 0 && jig < 140 && n >= Math.max(0, count - 3)) rot += Math.sin(jig / 18) * 0.1;
      if (count > 40 && n >= 8) y -= 6;
    } else {
      const n = i - SLOT_ITEMS - SLOT_PILE;
      if (v.splatT[n] < -1e5) {
        xf.set(0, 0, -5000, -5000);
        return;
      }
      idx = SP_BANANA;
      x = v.splatX[n];
      y = v.splatY[n];
      size = 50;
      rot = Math.PI / 2 + ((n * 31) % 40) * 0.01;
    }
    const src = rects[idx];
    const sc = size / Math.max(src.width, src.height);
    const c = Math.cos(rot) * sc;
    const sn = Math.sin(rot) * sc;
    const hw = src.width / 2;
    const hh = src.height / 2;
    xf.set(c, sn, x - (c * hw - sn * hh), y - (sn * hw + c * hh));
  });
  const colors = useColorBuffer(SLOTS, (col, i) => {
    'worklet';
    tick.value;
    const s = sim.value;
    const v = vis.value;
    col[0] = 1;
    col[1] = 1;
    col[2] = 1;
    col[3] = 1;
    if (i < SLOT_ITEMS) {
      const st = s.iSt[i];
      const kind = s.iKind[i];
      if (kind === K_LUCKY) {
        col[0] = 1;
        col[1] = 0.86;
        col[2] = 0.35;
      }
      if (st === S_PASS || st === S_MISS) col[3] = 0.85;
      if (st === S_DUNK) col[3] = 1 - clamp01(s.iT[i] / 256 / 6) * 0.3;
      if (st === S_FALL && s.iMust[i] === 1 && s.iOpt[i] === 1) col[3] = 0.92;
    } else if (i >= SLOT_ITEMS + SLOT_PILE) {
      const n = i - SLOT_ITEMS - SLOT_PILE;
      const age = v.t - v.splatT[n];
      col[3] = age < 80 ? 0.9 : 0.55;
      col[0] = 0.95;
      col[1] = 0.85;
      col[2] = 0.55;
    }
  });

  // -- shadows, Excellent rings, puffer shadows, ball arc ----------------------------------
  const shadows = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    const p = Skia.Path.Make();
    for (let i = 0; i < MAX_ITEMS; i++) {
      if (s.iSt[i] !== S_FALL || s.iKind[i] === K_PUFFER) continue;
      const prog = clamp01(s.iAge[i] / 256 / Math.max(1, s.iLand[i]));
      const w = 20 + 36 * prog;
      const x = s.iX[i] / SUB + (s.iVx[i] / SUB) * Math.max(0, s.iLand[i] - s.iAge[i] / 256);
      p.addOval(rect(x - w / 2, LANE_Y + 22 - w * 0.14, w, w * 0.28));
    }
    return p;
  });
  const shadowOpacity = 0.18;
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
  const arc = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    const p = Skia.Path.Make();
    if (s.bOn !== 1 || s.bRun >= BALL_ARC_BOUNCES || s.bVy >= 0) return p;
    let x = s.bX;
    let y = s.bY;
    let vx = s.bVx;
    let vy = s.bVy;
    for (let n = 1; n <= 28; n++) {
      vy += s.bG;
      y += vy;
      x += vx;
      if (n % 4 === 0) p.addCircle(x / SUB, y / SUB, 4.5);
    }
    return p;
  });

  // -- shark and basket ---------------------------------------------------------------------
  const sharkTransform = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    const v = vis.value;
    const bx = s.bx / SUB;
    const speed = Math.abs(s.bv) / SUB;
    const walkBob = speed > 1 && !reducedMotion ? Math.abs(Math.sin(v.t / (70 - Math.min(40, speed * 2)))) * -3 : 0;
    const breathe = speed <= 1 ? 1 + 0.015 * Math.sin(v.t / 320) : 1;
    const sq = squash(v);
    const hop = v.pose === POSE_FIST ? -Math.abs(Math.sin((v.t - v.timeT) / 180)) * 14 : 0;
    const dip = v.pose === POSE_BONKED ? 6 : 0;
    return [
      { translateX: bx },
      { translateY: LANE_Y + 64 + walkBob + hop + dip },
      { rotate: (v.lean * Math.PI) / 180 },
      { scaleX: (1 / sq) },
      { scaleY: sq * breathe },
      { translateX: -SHARK_W / 2 },
      { translateY: -SHARK_H },
    ];
  });
  const basketTransform = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    const v = vis.value;
    const bx = s.bx / SUB;
    const sq = squash(v);
    const sag = Math.min(10, Math.floor(s.catches / 10) * 2) * 0.4;
    const hitTilt = v.t - v.silhouetteT < 400 ? Math.sin((v.t - v.silhouetteT) / 50) * 0.3 * (1 - (v.t - v.silhouetteT) / 400) : 0;
    return [
      { translateX: bx },
      { translateY: LANE_Y + BASKET_H * (1 - BASKET_RIM) + sag },
      { rotate: (v.lean * 0.5 * Math.PI) / 180 + hitTilt },
      { scaleX: 1 / sq },
      { scaleY: sq },
      { translateX: -BASKET_W / 2 },
      { translateY: -BASKET_H },
    ];
  });
  const poseOp = (pose: number) => useDerivedValue(() => {
    tick.value;
    const p = vis.value.pose;
    return p === pose || (pose === POSE_IDLE && p === POSE_IDLE) ? 1 : 0;
  });
  const opIdle = poseOp(POSE_IDLE);
  const opCheer = poseOp(POSE_CHEER);
  const opBonked = poseOp(POSE_BONKED);
  const opDizzy = poseOp(POSE_DIZZY);
  const opFist = poseOp(POSE_FIST);
  const flashOp = useDerivedValue(() => {
    tick.value;
    const v = vis.value;
    const sil = v.t - v.silhouetteT;
    if (sil >= 0 && sil < 34) return 0.95;
    const f = v.t - v.flashT;
    return f >= 0 && f < 34 ? (reducedMotion ? 0.15 : 0.55) : 0;
  });

  // -- ball -------------------------------------------------------------------------------------
  const ballTransform = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    const v = vis.value;
    if (s.bOn !== 1) return [{ translateX: -500 }, { translateY: -500 }];
    const t = v.t - v.ballSquashT;
    const sq = t >= 0 && t < 140 ? 1 - 0.2 * Math.sin((t / 140) * Math.PI) : 1;
    return [
      { translateX: s.bX / SUB },
      { translateY: s.bY / SUB },
      { rotate: (s.bX / SUB) / BALL_R },
      { scaleX: 2 - sq },
      { scaleY: sq },
      { translateX: -BALL_R },
      { translateY: -BALL_R },
    ];
  });
  const goldBallOp = useDerivedValue(() => {
    tick.value;
    return sim.value.bOn === 1 && sim.value.bGold ? 1 : 0;
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
  const track = useMemo(() => {
    const p = Skia.Path.Make();
    p.moveTo(-20, 98);
    p.cubicTo(80, 84, 150, 110, 210, 96);
    p.cubicTo(270, 82, 330, 104, 420, 92);
    return p;
  }, []);
  const ties = useMemo(() => {
    const p = Skia.Path.Make();
    for (let x = -10; x < 420; x += 22) {
      const y = 96 + Math.sin(x / 40) * 5;
      p.addRect(rect(x, y - 2, 6, 14));
    }
    return p;
  }, []);

  // -- Golden Hour and Rush ------------------------------------------------------------------
  const goldAmt = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    const v = vis.value;
    if (s.ghQ > 0) {
      const inT = clamp01((v.t - v.ghStartT) / 300);
      const left = s.ghQ / 256;
      const blink = left < 90 ? (Math.floor(v.t / 125) % 2 === 0 ? 0.6 : 1) : 1;
      return inT * blink;
    }
    return clamp01(1 - (v.t - v.ghEndT) / 300);
  });
  const burstTransform = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    const v = vis.value;
    const g = goldAmt.value;
    const sc = g * (1.4 * Math.min(1, easeOutBack(clamp01((v.t - v.ghStartT) / 350))));
    return [
      { translateX: s.bx / SUB },
      { translateY: LANE_Y - 10 },
      { rotate: reducedMotion ? 0 : (v.t / 1000) * 0.52 },
      { scale: Math.max(0.001, sc * 0.5) },
      { translateX: -395 },
      { translateY: -397 },
    ];
  });
  const burstOpacity = useDerivedValue(() => goldAmt.value * 0.45);
  const frameOpacity = useDerivedValue(() => goldAmt.value);

  // -- HUD ---------------------------------------------------------------------------------
  const timeFrac = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    const lt = s.clock - s.setStart;
    return clamp01(1 - lt / Math.max(1, s.setLen));
  });
  const timeFillW = useDerivedValue(() => 176 * timeFrac.value);
  const timeColor = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    if (s.rushOn) return CORAL;
    return s.ghQ > 0 ? '#ffd23f' : GOLD;
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
    return ((v.cloudT / 1200) % 1) * 240 - 40;
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
    return [{ translateX: cx }, { translateY: 26 }, { scale: sc }, { translateX: -13 }, { translateY: -12 }];
  });
  const h0 = heartOp(0);
  const h1 = heartOp(1);
  const h2 = heartOp(2);
  const hs0 = heartScale(0);
  const hs1 = heartScale(1);
  const hs2 = heartScale(2);
  const pipOp = (i: number) => useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    return s.ghQ > 0 || s.meter > i ? 1 : 0;
  });
  const p0 = pipOp(0);
  const p1 = pipOp(1);
  const p2 = pipOp(2);
  const bankText = useDerivedValue(() => {
    tick.value;
    const b = sim.value.banked;
    return b > 0 ? `+${b * 250}` : '';
  });

  // Chain badge.
  const badgeText = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    const t = tierOf(s.chain) + (s.bOn === 1 && s.bN > 0 ? 1 : 0);
    return s.chain >= TIER_AT[1] || t > 1 ? `x${t}  ${s.chain}` : `${s.chain}`;
  });
  const badgeColor = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    if (s.chainFreezeQ > 0) return '#9fdcff';
    const t = tierOf(s.chain) + (s.bOn === 1 && s.bN > 0 ? 1 : 0);
    return TIER_COLORS[t];
  });
  const badgeTransform = useDerivedValue(() => {
    tick.value;
    const v = vis.value;
    const bt = v.t - v.badgeT;
    const pop = bt >= 0 && bt < 260 ? 1 + 0.45 * Math.sin((bt / 260) * Math.PI) * (1 - bt / 520) : 1;
    const st = v.t - v.badgeShakeT;
    const shake = st >= 0 && st < 180 && !reducedMotion ? Math.sin(st / 15) * 6 * (1 - st / 180) : 0;
    return [{ translateX: 200 + shake }, { translateY: 62 }, { scale: pop }];
  });
  const ballBadgeText = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    return s.bOn === 1 && s.bN > 0 ? `${s.bN}` : '';
  });
  const ballBadgeOp = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    return s.bOn === 1 && s.bN > 0 ? 1 : 0;
  });
  const flameOp = useDerivedValue(() => {
    tick.value;
    return tierOf(sim.value.chain) >= 4 ? 1 : 0;
  });

  // Score chip on the basket lip.
  const chipText = useDerivedValue(() => {
    tick.value;
    const v = vis.value;
    if (v.t - v.chipT < 600 && v.chipGain > 0) return `+${v.chipGain}`;
    return `${v.scoreShown}`;
  });
  const chipColor = useDerivedValue(() => {
    tick.value;
    const v = vis.value;
    if (v.t - v.chipT < 600 && v.chipGain > 0) return TIER_COLORS[Math.min(5, v.chipTier)];
    return INK;
  });
  const chipTransform = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    const v = vis.value;
    const t = v.t - v.chipT;
    const pop = t >= 0 && t < 180 ? 1 + 0.12 * Math.sin((t / 180) * Math.PI) : 1;
    return [{ translateX: s.bx / SUB }, { translateY: LANE_Y + 70 }, { scale: pop }];
  });
  const chipX = useDerivedValue(() => {
    const t = chipText.value;
    return fontSmall ? -fontSmall.measureText(t).width / 2 : -10;
  });
  const chipPillW = useDerivedValue(() => {
    const t = chipText.value;
    return (fontSmall ? fontSmall.measureText(t).width : 20) + 18;
  });
  const chipPillX = useDerivedValue(() => -chipPillW.value / 2);

  // Stamps.
  const stampText = useDerivedValue(() => {
    tick.value;
    const v = vis.value;
    const age = v.t - v.stampT;
    const hold = v.stamp === ST_TIME || v.stamp === ST_OUT ? 100000 : v.stamp === ST_GOLDEN || v.stamp === ST_RUSH ? 1450 : 900;
    if (v.stamp === ST_NONE || age > hold) return '';
    const base = STAMP_TEXT[v.stamp] ?? '';
    return v.stamp === ST_PERFECT && v.stampSuffix >= 3 ? `${base} x${v.stampSuffix}` : base;
  });
  const stampTransform = useDerivedValue(() => {
    tick.value;
    const v = vis.value;
    const age = v.t - v.stampT;
    const big = v.stamp === ST_TIME || v.stamp === ST_OUT || v.stamp === ST_GOLDEN || v.stamp === ST_RUSH;
    let sc = 1;
    if (age < 110) sc = 0.5 + 0.7 * easeOutBack(age / 110) * (big ? 1.1 : 1);
    else if (age < 180) sc = 1.2 - 0.2 * ((age - 110) / 70);
    if (big && age < 180 && (v.stamp === ST_TIME || v.stamp === ST_OUT)) sc = 2 - easeOutBack(age / 180);
    const w = fontStamp ? fontStamp.measureText(stampText.value).width : 100;
    const scaleFit = Math.min(1, 360 / Math.max(1, w));
    return [{ translateX: 200 }, { translateY: big ? 300 : 250 }, { scale: sc * scaleFit * (big ? 1.1 : 0.72) }, { translateX: -w / 2 }];
  });
  const stampColor = useDerivedValue(() => {
    tick.value;
    const st = vis.value.stamp;
    if (st === ST_GOLDEN) return GOLD;
    if (st === ST_RUSH || st === ST_OUT) return CORAL;
    return '#ffffff';
  });
  const stampOpacity = useDerivedValue(() => {
    tick.value;
    const v = vis.value;
    const age = v.t - v.stampT;
    const hold = v.stamp === ST_TIME || v.stamp === ST_OUT ? 100000 : v.stamp === ST_GOLDEN || v.stamp === ST_RUSH ? 1450 : 900;
    if (age > hold) return 0;
    if (age > hold - 150) return (hold - age) / 150;
    return 1;
  });

  // Frozen: a pulsing prompt above the basket after 600 ms.
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

  // Power-up ring (Foam Finger).
  const powerOp = useDerivedValue(() => {
    tick.value;
    return sim.value.fingerQ > 0 ? 1 : 0;
  });
  const powerArc = useDerivedValue(() => {
    tick.value;
    const f = sim.value.fingerQ / 256 / 360;
    const p = Skia.Path.Make();
    p.addArc(rect(12, LANE_Y + 150, 44, 44), -90, 360 * clamp01(f));
    return p;
  });
  const fingerMagnet = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    const p = Skia.Path.Make();
    if (s.fingerQ <= 0 && s.ghQ <= 0) return p;
    const r = s.fingerQ > 0 ? 120 : 60;
    p.addOval(rect(s.bx / SUB - r, LANE_Y - 60, r * 2, 80));
    return p;
  });

  // Rival strip (ghost).
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
    return 360 * f;
  });
  const ghostTickX = useDerivedValue(() => ghostX.value - 3);
  const ghostBasketTransform = useDerivedValue(() => [
    { translateX: ghostX.value * 0.9 + 20 - 18 },
    { translateY: 58 },
  ]);

  const splashLines = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    const v = vis.value;
    const p = Skia.Path.Make();
    if (s.sSt === 1) {
      const x = s.sX / SUB;
      const u = (s.sQ / 256) / 54;
      for (let r = 0; r < 3; r++) {
        const rr = ((u * 3 + r / 3) % 1) * 55;
        p.addOval(rect(x - rr, PLAZA_Y - 10 - rr * 0.25, rr * 2, rr * 0.5));
      }
    }
    void v;
    return p;
  });
  const splashColor = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    const u = (s.sQ / 256) / 54;
    return u < 0.5 ? '#ffffff' : u < 0.85 ? GOLD : CORAL;
  });

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
              <SkImage image={im.cloud} x={c1} y={150} width={116} height={77} opacity={0.95} />
              <SkImage image={im.cloud} x={c2} y={210} width={82} height={54} opacity={0.9} />
              <SkImage image={im.cloud} x={c3} y={128} width={62} height={41} opacity={0.85} />
            </>
          ) : null}
          {/* Hills and plaza (environment shapes, navy ink) */}
          <Oval x={-120} y={392} width={360} height={170} color="#8fdc7a" />
          <Oval x={170} y={402} width={360} height={170} color="#7bd06a" />
          <Rect x={-40} y={470} width={FIELD_W + 80} height={FIELD_H - 470 + 200} color="#f6d9a6" />
          <Rect x={-40} y={470} width={FIELD_W + 80} height={6} color="#e8b979" />
          <Rect x={-40} y={LANE_Y + 14} width={FIELD_W + 80} height={20} color="#ffffff" opacity={0.55} />
          <Rect x={-40} y={PLAZA_Y - 4} width={FIELD_W + 80} height={4} color="#e0a868" />
          {/* Coaster track with the snack cart line */}
          <Path path={ties} color="#c9563f" />
          <Path path={track} style="stroke" strokeWidth={7} color={INK} />
          <Path path={track} style="stroke" strokeWidth={4} color="#ff7a59" />
          {/* Splash ripples (water decks) */}
          <Path path={splashLines} style="stroke" strokeWidth={3} color={splashColor} />
          {/* Landing shadows, puffer coral shadows, Excellent rings */}
          <Path path={shadows} color="#0b2a55" opacity={shadowOpacity} />
          <Path path={pufferShadows} color={CORAL} opacity={pufferPulse} />
          <Path path={pufferShadows} style="stroke" strokeWidth={3} color={INK} opacity={0.7} />
          <Path path={ringsWhite} style="stroke" strokeWidth={5} color={INK} opacity={0.6} />
          <Path path={ringsWhite} style="stroke" strokeWidth={2.5} color="#ffffff" />
          <Path path={ringsGold} style="stroke" strokeWidth={5} color={INK} />
          <Path path={ringsGold} style="stroke" strokeWidth={3} color={GOLD} />
          {/* Golden Hour starburst behind the basket band */}
          {im.starburst ? (
            <Group transform={burstTransform} opacity={burstOpacity}>
              <SkImage image={im.starburst} x={0} y={0} width={790} height={794} />
            </Group>
          ) : null}
          <Path path={fingerMagnet} style="stroke" strokeWidth={2} color={GOLD} opacity={0.6} />
          {/* The shark (pose layers) */}
          <Group transform={sharkTransform}>
            {im.sharkHold ? <SkImage image={im.sharkHold} x={0} y={0} width={SHARK_W} height={SHARK_H} opacity={opIdle} /> : null}
            {im.sharkCheer ? <SkImage image={im.sharkCheer} x={-8} y={-6} width={SHARK_W * 1.07} height={SHARK_H} opacity={opCheer} /> : null}
            {im.sharkBonked ? <SkImage image={im.sharkBonked} x={0} y={0} width={SHARK_W} height={SHARK_H} opacity={opBonked} /> : null}
            {im.sharkDizzy ? <SkImage image={im.sharkDizzy} x={0} y={0} width={SHARK_W * 0.96} height={SHARK_H} opacity={opDizzy} /> : null}
            {im.sharkFist ? <SkImage image={im.sharkFist} x={0} y={0} width={SHARK_W} height={SHARK_H} opacity={opFist} /> : null}
            {im.sharkHold ? (
              <SkImage image={im.sharkHold} x={0} y={0} width={SHARK_W} height={SHARK_H} opacity={flashOp}>
                <BlendColor color="#ffffff" mode="srcIn" />
              </SkImage>
            ) : null}
          </Group>
          {/* Items, pile, splats: one Atlas draw */}
          <Atlas image={atlas.image} sprites={sprites} transforms={transforms} colors={colors} blendMode="modulate" />
          {/* Basket in front of the pile */}
          <Group transform={basketTransform}>
            {im.basket ? <SkImage image={im.basket} x={0} y={0} width={BASKET_W} height={BASKET_H} /> : null}
            {im.basket ? (
              <SkImage image={im.basket} x={0} y={0} width={BASKET_W} height={BASKET_H} opacity={goldAmt}>
                <BlendColor color="rgba(255,205,40,0.55)" mode="srcATop" />
              </SkImage>
            ) : null}
            {im.basket ? (
              <SkImage image={im.basket} x={0} y={0} width={BASKET_W} height={BASKET_H} opacity={flashOp}>
                <BlendColor color="#ffffff" mode="srcIn" />
              </SkImage>
            ) : null}
          </Group>
          {/* Ball + predicted arc (first 3 bounces of the run) */}
          <Path path={arc} color="#ffffff" />
          <Path path={arc} style="stroke" strokeWidth={2} color={INK} />
          {im.ball ? (
            <Group transform={ballTransform}>
              <SkImage image={im.ball} x={0} y={0} width={BALL_R * 2} height={BALL_R * 2} />
              <Circle cx={BALL_R} cy={BALL_R} r={BALL_R - 1} style="stroke" strokeWidth={4} color={GOLD} opacity={goldBallOp} />
            </Group>
          ) : null}
          {/* Score chip on the basket lip */}
          {fontSmall ? (
            <Group transform={chipTransform}>
              <RoundedRect x={chipPillX} y={-14} width={chipPillW} height={26} r={13} color="#ffffff" />
              <RoundedRect x={chipPillX} y={-14} width={chipPillW} height={26} r={13} style="stroke" strokeWidth={3} color={INK} />
              <Text x={chipX} y={6} text={chipText} font={fontSmall} color={chipColor} />
            </Group>
          ) : null}
          {/* Frozen prompt */}
          <Group opacity={frozenOp}>
            <Circle cx={frozenX} cy={LANE_Y - 120} r={frozenRingR} style="stroke" strokeWidth={4} color="#ffffff" />
            <Circle cx={frozenX} cy={LANE_Y - 120} r={12} color="#ffffff" />
            <Circle cx={frozenX} cy={LANE_Y - 120} r={12} style="stroke" strokeWidth={3} color={INK} />
          </Group>
        </Group>

        {/* Golden Hour frame (HUD layer: never shakes) */}
        <Group opacity={frameOpacity}>
          <Rect x={0} y={skyTop} width={FIELD_W} height={FIELD_H - skyTop} style="stroke" strokeWidth={10} color={GOLD} />
          <Rect x={5} y={skyTop + 5} width={FIELD_W - 10} height={FIELD_H - skyTop - 10} style="stroke" strokeWidth={3} color="#fff1c4" />
        </Group>

        {/* HUD row: hearts, time bar, coin meter */}
        {im.heart ? (
          <>
            <Group transform={hs0} opacity={h0}><SkImage image={im.heart} x={0} y={0} width={26} height={24} /></Group>
            <Group transform={hs1} opacity={h1}><SkImage image={im.heart} x={0} y={0} width={26} height={24} /></Group>
            <Group transform={hs2} opacity={h2}><SkImage image={im.heart} x={0} y={0} width={26} height={24} /></Group>
          </>
        ) : null}
        <RoundedRect x={112} y={17} width={180} height={18} r={9} color="#ffffff" />
        <Group transform={timePulse} origin={vec(200, 26)}>
          <RoundedRect x={114} y={19} width={timeFillW} height={14} r={7} color={timeColor} />
        </Group>
        <Group clip={rect(114, 19, 176, 14)}>
          <Rect x={frozenShimmer} y={19} width={30} height={14} color="#ffffff" opacity={0.7} />
        </Group>
        <RoundedRect x={112} y={17} width={180} height={18} r={9} style="stroke" strokeWidth={3} color={INK} />
        {im.timer ? <SkImage image={im.timer} x={92} y={12} width={28} height={28} /> : null}
        <Group opacity={isQueue}>
          <Circle cx={184} cy={42} r={4} color="#ffffff" opacity={set0} />
          <Circle cx={200} cy={42} r={4} color="#ffffff" opacity={set1} />
          <Circle cx={216} cy={42} r={4} color="#ffffff" opacity={set2} />
        </Group>
        {[0, 1, 2].slice(0, METER_PIPS).map((i) => (
          <Group key={i}>
            <Circle cx={322 + i * 26} cy={26} r={12} color="#ffffff" opacity={0.85} />
            <Circle cx={322 + i * 26} cy={26} r={12} style="stroke" strokeWidth={3} color={INK} />
          </Group>
        ))}
        {im.coin ? (
          <>
            <SkImage image={im.coin} x={310} y={14} width={24} height={24} opacity={p0} />
            <SkImage image={im.coin} x={336} y={14} width={24} height={24} opacity={p1} />
            <SkImage image={im.coin} x={362} y={14} width={24} height={24} opacity={p2} />
          </>
        ) : null}
        {fontSmall ? <Text x={330} y={56} text={bankText} font={fontSmall} color={GOLD} /> : null}

        {/* Chain badge */}
        {font ? (
          <Group transform={badgeTransform}>
            {im.streak ? <SkImage image={im.streak} x={-70} y={-22} width={30} height={30} opacity={flameOp} /> : null}
            <RoundedRect x={-40} y={-16} width={80} height={30} r={15} color={badgeColor} />
            <RoundedRect x={-40} y={-16} width={80} height={30} r={15} style="stroke" strokeWidth={3} color={INK} />
            {fontSmall ? <Text x={-30} y={6} text={badgeText} font={fontSmall} color="#ffffff" /> : null}
            <Group opacity={ballBadgeOp}>
              {im.ball ? <SkImage image={im.ball} x={44} y={-12} width={22} height={22} /> : null}
              {fontSmall ? <Text x={68} y={6} text={ballBadgeText} font={fontSmall} color="#ffffff" /> : null}
            </Group>
          </Group>
        ) : null}

        {/* Power-up ring */}
        <Group opacity={powerOp}>
          <Circle cx={34} cy={LANE_Y + 172} r={22} color="#ffffff" />
          <Path path={powerArc} style="stroke" strokeWidth={5} color={GOLD} />
        </Group>

        {/* Rival strip: ghost mini basket, score, lane-rail tick, tug-of-war */}
        <Group opacity={ghostOp}>
          <RoundedRect x={20} y={78} width={360} height={8} r={4} color="#ffffff" opacity={0.7} />
          <RoundedRect x={20} y={78} width={tugW} height={8} r={4} color="#2d9cff" />
          {im.basket ? (
            <Group transform={ghostBasketTransform}>
              <SkImage image={im.basket} x={0} y={0} width={36} height={31} opacity={0.9} />
            </Group>
          ) : null}
          {fontSmall ? <Text x={300} y={70} text={ghostScoreText} font={fontSmall} color="#ffffff" /> : null}
          {fontSmall ? <Text x={20} y={70} text={ghostName} font={fontSmall} color="#ffffff" /> : null}
          <RoundedRect x={ghostTickX} y={LANE_Y + 36} width={6} height={16} r={3} color={CORAL} />
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
  const amt = 0.14 * v.squashAmt;
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

export { CARD_SET_BASE };
