/**
 * ParadeField: the Parade Beat scene in one Skia canvas (design 3.1, 6).
 *
 *   World group (moves: bop, shake, zoom, Fever tint)
 *     parade plaza, bunting, crowd of Alex sharks, drum major, count-in,
 *     moment ribbons, Groove and Fever meters
 *   Reading surface (never moves)
 *     lane bed in 1/z perspective, bar and beat lines, rails (armed glow),
 *     notes (one Atlas draw), ROLL tails, target ring, judgment-line flash,
 *     judgment text with FAST/SLOW, hit-error bar
 *   Drum (touch zone, below the line)
 *     the big parade drum (centre = DRUM) between two gold hoops (RIM)
 *
 * All animation reads the round's SharedValues (view, judge, draw list) on
 * the UI thread; React never re-renders during play.
 */

import React, { useMemo } from 'react';
import {
  Atlas,
  Canvas,
  Circle,
  ColorMatrix,
  DashPathEffect,
  Group,
  Image,
  Line,
  Path,
  Rect,
  RoundedRect,
  Skia,
  Text as SkText,
  useColorBuffer,
  useFont,
  useImage,
  useRSXformBuffer,
  useRectBuffer,
  vec,
  type SkFont,
  type SkImage,
} from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { useSpriteAtlas } from '../../../gamekit/fx/SpriteAtlas';
import type { JudgeState } from '../core/judge';
import { J_GOOD, J_GREAT, J_PERFECT, J_SHARP } from '../core/types';
import { MAX_LINES, MAX_NOTES, MAX_TAILS, type DrawList, type LaneGeom } from './layout';
import { JUDGE_TEXT, RIBBON_TEXT, TXT_GOOD, TXT_GREAT, type ParadeView } from './view';

const NAVY = '#0b3a6b';
const GOLD = '#ffcf3b';
const SKY = '#4fd2ff';
const CREAM = '#fff8e4';

const ART = {
  bg: require('../../../assets/games/rhythm/bg_parade_plaza.jpg'),
  major: require('../../../assets/games/rhythm/shark_drum_major.png'),
  drum: require('../../../assets/games/rhythm/parade_drum.png'),
  noteDrum: require('../../../assets/games/rhythm/note_drum.png'),
  noteRim: require('../../../assets/games/rhythm/note_rim.png'),
  noteBig: require('../../../assets/games/rhythm/note_star_drum.png'),
  noteCymbal: require('../../../assets/games/rhythm/note_cymbal.png'),
  notePopper: require('../../../assets/games/rhythm/note_popper.png'),
  noteFreeze: require('../../../assets/games/rhythm/note_freeze.png'),
  ribbon: require('../../../../assets/images/ribbon.png'),
  starburst: require('../../../../assets/images/screens/explore/starburst.png'),
  crowd: [
    require('../../../assets/games/rhythm/crowd/shark_classic.png'),
    require('../../../assets/games/rhythm/crowd/shark_blue.png'),
    require('../../../assets/games/rhythm/crowd/shark_green.png'),
    require('../../../assets/games/rhythm/crowd/shark_orange.png'),
    require('../../../assets/games/rhythm/crowd/shark_pink.png'),
    require('../../../assets/games/rhythm/crowd/shark_red.png'),
    require('../../../assets/games/rhythm/crowd/shark_black.png'),
  ],
};
const FONT = require('../../../../assets/fonts/shark-random-funnyness-2.ttf');

export interface FieldGeom extends LaneGeom {
  width: number;
  height: number;
  touchTop: number;
}

export function fieldGeom(width: number, height: number): FieldGeom {
  const yLine = Math.round(height * 0.55);
  const k = width / 390;
  return {
    width,
    height,
    cx: width / 2,
    yLine,
    yHorizon: -Math.round(height * 0.12),
    halfW: 75 * k,
    noteSize: 62 * k,
    touchTop: yLine + 34,
  };
}

/** Zone of a touch x (design 3.1): centre 40%, rims 30% each, 16pt dead bands. */
export function zoneOfX(x: number, width: number): number {
  'worklet';
  const l = width * 0.3;
  const r = width * 0.7;
  if (x < l - 8) return 1;
  if (x <= l + 8) return 3;
  if (x < r - 8) return 0;
  if (x <= r + 8) return 4;
  return 2;
}

interface Props {
  geom: FieldGeom;
  judge: SharedValue<JudgeState>;
  view: SharedValue<ParadeView>;
  draw: SharedValue<DrawList>;
  tick: SharedValue<number>;
  reducedMotion: boolean;
  /** Rival / ghost rails: colours (max 3). */
  rails: string[];
  railFlash: SharedValue<number[]>;
}

// Crowd slots: side (0 left, 1 right), row (0 back, 1 front), x fraction inside the side band.
const CROWD_SLOTS: [number, number, number][] = [
  [0, 1, 0.55], [1, 1, 0.45], [0, 0, 0.3], [1, 0, 0.7], [0, 1, 0.15], [1, 1, 0.9],
  [0, 0, 0.7], [1, 0, 0.3], [0, 1, 0.85], [1, 1, 0.15], [0, 0, 0.05], [1, 0, 0.95],
  [0, 0, 0.5], [1, 0, 0.5], [0, 1, 0.35], [1, 1, 0.65], [0, 0, 0.9], [1, 0, 0.1],
  [0, 1, 0.02], [1, 1, 0.98], [0, 0, 0.18], [1, 0, 0.82], [0, 1, 0.7], [1, 1, 0.3],
];
const CROWD_N = CROWD_SLOTS.length;

function measure(font: SkFont | null, text: string, px: number): number {
  if (!font) return text.length * px * 0.55;
  try {
    return font.measureText(text).width;
  } catch {
    return text.length * px * 0.55;
  }
}

/** Bop curve with anticipation (design 6.1): pre-dip, snap, overshoot, settle. */
function bop(phase: number): number {
  'worklet';
  if (phase > 0.875) return -0.3 * ((phase - 0.875) / 0.125);
  if (phase < 0.06) return 1.08 * (phase / 0.06);
  if (phase < 0.3) {
    const u = (phase - 0.06) / 0.24;
    return 1.08 - 0.08 * u + Math.sin(u * Math.PI) * 0.04;
  }
  const u = (phase - 0.3) / 0.575;
  return 1 - u;
}

function rnd(a: number, b: number): number {
  'worklet';
  let h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function addStar(p: SkPathLike, x: number, y: number, r: number, rot: number): void {
  'worklet';
  for (let i = 0; i < 10; i++) {
    const a = rot + (i * Math.PI) / 5 - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.45;
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr;
    if (i === 0) p.moveTo(px, py);
    else p.lineTo(px, py);
  }
  p.close();
}

type SkPathLike = ReturnType<typeof Skia.Path.Make>;

/**
 * Analytic bursts (closed-form motion, no simulation): hit stars flying up
 * and away from the thumb, Fever fireworks with stepped trails, confetti and
 * grey puffs. Paths per colour, navy outline on the stars (Alex's cel look).
 */
function buildBursts(v: ParadeView): SkPathLike[] {
  'worklet';
  const gold = Skia.Path.Make();
  const sky = Skia.Path.Make();
  const white = Skia.Path.Make();
  const coral = Skia.Path.Make();
  const grey = Skia.Path.Make();
  const outline = Skia.Path.Make();
  for (let k = 0; k < v.bAt.length; k++) {
    const age = v.wt - v.bAt[k];
    const type = v.bType[k];
    const life = type === 3 ? 950 : type === 4 ? 1500 : type === 5 ? 260 : 420;
    if (age < 0 || age > life) continue;
    const t = age / 1000;
    const u = age / life;
    const n = v.bN[k];
    const bx = v.bX[k];
    const by = v.bY[k];
    for (let j = 0; j < n; j++) {
      const r1 = rnd(k * 131 + Math.floor(v.bAt[k]), j);
      const r2 = rnd(j * 17 + 3, Math.floor(v.bAt[k]) + k);
      if (type <= 2 || type === 6) {
        const ang = ((-165 + (150 * (j + 0.5)) / n + (r1 - 0.5) * 16) * Math.PI) / 180;
        const sp = 420 + 260 * r2;
        const x = bx + Math.cos(ang) * sp * t;
        const y = by + Math.sin(ang) * sp * t + 0.5 * 950 * t * t;
        const r = (type === 2 ? 8 : 11.5) * (1 - 0.55 * u);
        const path = type === 0 ? (j % 3 === 2 ? white : gold) : type === 1 ? (j % 3 === 2 ? white : sky) : type === 2 ? white : j % 3 === 0 ? white : j % 3 === 1 ? sky : coral;
        addStar(path, x, y, r, age * 0.01 * (r1 - 0.5));
        addStar(outline, x, y, r, age * 0.01 * (r1 - 0.5));
      } else if (type === 3) {
        const ang = (j / n) * Math.PI * 2 + r1 * 0.2;
        const sp = 240 + 150 * r2;
        const path = j % 3 === 0 ? white : j % 3 === 1 ? sky : coral;
        for (let s = 0; s < 3; s++) {
          const ts = Math.max(0, t - s * 0.035);
          const d = (sp * (1 - Math.exp(-2.2 * ts))) / 2.2;
          const x = bx + Math.cos(ang) * d;
          const y = by + Math.sin(ang) * d + 0.5 * 220 * ts * ts;
          const r = (s === 0 ? 4.2 : s === 1 ? 3 : 2) * (1 - 0.7 * u);
          if (r > 0.4) path.addCircle(x, y, r);
        }
      } else if (type === 4) {
        const ang = ((-90 + (r1 - 0.5) * 120) * Math.PI) / 180;
        const sp = 260 + 280 * r2;
        const d = (sp * (1 - Math.exp(-1.8 * t))) / 1.8;
        const x = bx + Math.cos(ang) * d + Math.sin(t * 9 + j) * 8;
        const y = by + Math.sin(ang) * d + 0.5 * 420 * t * t;
        const rot = t * (6 + 8 * r1) + j;
        const w = 5;
        const h = 3.2 * Math.abs(Math.cos(t * 10 + j));
        const c = Math.cos(rot);
        const sn = Math.sin(rot);
        const path = j % 4 === 0 ? gold : j % 4 === 1 ? sky : j % 4 === 2 ? coral : white;
        path.moveTo(x - c * w + sn * h, y - sn * w - c * h);
        path.lineTo(x + c * w + sn * h, y + sn * w - c * h);
        path.lineTo(x + c * w - sn * h, y + sn * w + c * h);
        path.lineTo(x - c * w - sn * h, y - sn * w + c * h);
        path.close();
      } else if (type === 5) {
        const ang = (j / Math.max(1, n)) * Math.PI * 2 + r1;
        grey.addCircle(bx + Math.cos(ang) * 14 * u, by + Math.sin(ang) * 10 * u - 10 * u, 5 + 9 * u);
      }
    }
  }
  return [gold, sky, white, coral, grey, outline];
}

export const ParadeField = React.memo(function ParadeField({ geom, judge, view, draw, tick, reducedMotion, rails, railFlash }: Props) {
  const { width: W, height: H, cx, yLine, halfW, touchTop, yHorizon } = geom;
  const font = useFont(FONT, 22);
  const bigFont = useFont(FONT, 96);
  const smallFont = useFont(FONT, 12);
  const ribbonFont = useFont(FONT, 26);

  const bg = useImage(ART.bg);
  const major = useImage(ART.major);
  const drum = useImage(ART.drum);
  const ribbonImg = useImage(ART.ribbon);
  const starburst = useImage(ART.starburst);
  const n0 = useImage(ART.noteDrum);
  const n1 = useImage(ART.noteRim);
  const n2 = useImage(ART.noteBig);
  const n3 = useImage(ART.noteCymbal);
  const n4 = useImage(ART.notePopper);
  const n5 = useImage(ART.noteFreeze);
  const c0 = useImage(ART.crowd[0]);
  const c1 = useImage(ART.crowd[1]);
  const c2 = useImage(ART.crowd[2]);
  const c3 = useImage(ART.crowd[3]);
  const c4 = useImage(ART.crowd[4]);
  const c5 = useImage(ART.crowd[5]);
  const c6 = useImage(ART.crowd[6]);
  const noteAtlas = useSpriteAtlas([n0, n1, n2, n3, n4, n5], { cell: 192 });
  const crowdAtlas = useSpriteAtlas([c0, c1, c2, c3, c4, c5, c6], { cell: 160, anchors: ['base', 'base', 'base', 'base', 'base', 'base', 'base'] });

  const noteRects = useMemo(() => (noteAtlas ? noteAtlas.rects.map((r) => [r.x, r.y, r.width, r.height]) : null), [noteAtlas]);
  const crowdRects = useMemo(() => (crowdAtlas ? crowdAtlas.rects.map((r) => [r.x, r.y, r.width, r.height]) : null), [crowdAtlas]);
  const judgeWidths = useMemo(() => JUDGE_TEXT.map((t) => measure(font, t, 22)), [font]);
  const ribbonWidths = useMemo(() => RIBBON_TEXT.map((t) => measure(ribbonFont, t, 26)), [ribbonFont]);
  const numWidths = useMemo(() => ['4', '3', '2', '1'].map((t) => measure(bigFont, t, 96)), [bigFont]);
  const fastW = useMemo(() => [measure(smallFont, 'FAST', 12), measure(smallFont, 'SLOW', 12)], [smallFont]);

  // ---------------------------------------------------------------- world
  const worldTransform = useDerivedValue(() => {
    tick.value;
    const v = view.value;
    let dx = 0;
    let dy = 0;
    let z = 1;
    if (!reducedMotion) {
      const ts = v.wt - v.shakeAt;
      if (ts >= 0 && ts < 140) {
        const k = (1 - ts / 140) * v.shakeAmp;
        dx = Math.sin(ts * 0.9) * k;
        dy = Math.cos(ts * 1.3) * k * 0.6;
      }
      const tz = v.wt - v.zoomAt;
      if (tz >= 0 && tz < 520) {
        const u = tz < 120 ? tz / 120 : 1 - (tz - 120) / 400;
        z = 1 + v.zoomAmt * Math.max(0, u);
      }
    }
    return [{ translateX: dx + cx * (1 - z) }, { translateY: dy + (yLine * 0.6) * (1 - z) }, { scale: z }];
  });
  const feverMatrix = useDerivedValue(() => {
    tick.value;
    const f = view.value.fever;
    // Golden hour: lift red and green, cool the blue a little. Never purple.
    return [
      1 + 0.1 * f, 0.08 * f, 0, 0, 0.06 * f,
      0.02 * f, 1 + 0.02 * f, 0, 0, 0.03 * f,
      0, 0, 1 - 0.28 * f, 0, 0,
      0, 0, 0, 1, 0,
    ];
  });
  const bgRect = useMemo(() => {
    if (!bg) return { x: 0, y: 0, w: W, h: H };
    const s = Math.max(W / bg.width(), H / bg.height());
    const w = bg.width() * s;
    const h = bg.height() * s;
    return { x: (W - w) / 2, y: H - h, w, h };
  }, [bg, W, H]);

  // Bunting (environment shape, navy-outlined pennants) sways on half beats.
  const bunting = useMemo(() => {
    const fills = [GOLD, '#7fd4ff', '#ff8a6b', '#ffffff'];
    const paths = fills.map(() => Skia.Path.Make());
    const outline = Skia.Path.Make();
    const n = 11;
    for (let i = 0; i < n; i++) {
      const x0 = (i / n) * W;
      const x1 = ((i + 1) / n) * W;
      const sag = (x: number) => 14 + 10 * Math.sin((x / W) * Math.PI);
      const p = paths[i % fills.length];
      p.moveTo(x0 + 3, sag(x0));
      p.lineTo(x1 - 3, sag(x1));
      p.lineTo((x0 + x1) / 2, sag((x0 + x1) / 2) + 26);
      p.close();
      outline.moveTo(x0 + 3, sag(x0));
      outline.lineTo(x1 - 3, sag(x1));
      outline.lineTo((x0 + x1) / 2, sag((x0 + x1) / 2) + 26);
      outline.close();
    }
    const cord = Skia.Path.Make();
    cord.moveTo(0, 14);
    for (let x = 0; x <= W; x += 8) cord.lineTo(x, 14 + 10 * Math.sin((x / W) * Math.PI));
    return { fills, paths, outline, cord };
  }, [W]);
  const buntingTransform = useDerivedValue(() => {
    tick.value;
    const d = draw.value;
    const half = (d.beatPhase * 2) % 1;
    const sway = reducedMotion ? 0 : (half < 0.5 ? 1 : -1) * 0.012 * (1 - half);
    return [{ rotate: sway }];
  });

  // Crowd: Atlas of Alex's sharks, bopping with seeded phase jitter.
  const crowdSize = 60 * (W / 390);
  const crowdSprites = useRectBuffer(CROWD_N, (rect, i) => {
    'worklet';
    const a = crowdRects;
    if (!a) return;
    const r = a[(i * 5 + 3) % 7];
    rect.setXYWH(r[0], r[1], r[2], r[3]);
  });
  const crowdXf = useRSXformBuffer(CROWD_N, (xf, i) => {
    'worklet';
    tick.value;
    const a = crowdRects;
    const v = view.value;
    const d = draw.value;
    if (!a || i >= Math.round(v.crowd)) {
      xf.set(0, 0, -5000, -5000);
      return;
    }
    const slot = CROWD_SLOTS[i];
    const r0 = a[(i * 5 + 3) % 7];
    const r = { width: r0[2], height: r0[3] };
    const row = slot[1];
    const baseY = row === 0 ? yLine * 0.84 : yLine + 34;
    const size = crowdSize * (row === 0 ? 0.9 : 1.12);
    // Side band: between the screen edge and the lane edge at that depth.
    const laneEdge = halfW * ((baseY - yHorizon) / (yLine - yHorizon)) + 18;
    const x = slot[0] === 0 ? (cx - laneEdge) * slot[2] + size * 0.1 : cx + laneEdge + (W - cx - laneEdge) * slot[2] - size * 0.1;
    const jitter = ((i * 37) % 7) / 7 / 16 + row / 16;
    let ph = d.beatPhase - jitter;
    if (ph < 0) ph += 1;
    const amp = (reducedMotion ? 3 : 6) * (v.march > 0.5 ? 1.2 : 1);
    let y = baseY - bop(ph) * amp;
    // Tiers: downbeat jumps at 25+, a wave every bar at 50+ (design 6.4).
    const combo = judge.value.combo;
    if (!reducedMotion && combo >= 25 && d.beatIdx % 4 === 0) y -= (combo >= 50 ? 18 : 12) * Math.max(0, 1 - ph * 3);
    // One shark sits down on a MISS.
    if (i === 0 && v.wt - v.crowdSitAt < 600) y += 10;
    const sway = combo >= 10 ? Math.sin((d.beatIdx + d.beatPhase) * Math.PI) * 0.05 : 0;
    const flip = slot[0] === 0 ? 1 : -1;
    const sc = size / Math.max(r.width, r.height);
    const c = Math.cos(sway) * sc;
    const s = Math.sin(sway) * sc;
    const w = r.width;
    const h = r.height;
    // Anchor bottom-centre. RSXform cannot mirror; right side faces in by art.
    void flip;
    xf.set(c, s, x - (c * w / 2 - s * h), y - (s * w / 2 + c * h));
  });

  // Drum major: idle bop, anticipation (sticks cocked) before notes, strike on hits.
  const majorH = 150 * (W / 390);
  const majorW = major ? majorH * (major.width() / major.height()) : majorH * 0.75;
  const majorX = W - majorW * 0.62;
  const majorBase = yLine - 6;
  const majorTransform = useDerivedValue(() => {
    tick.value;
    const v = view.value;
    const d = draw.value;
    let sy = 1;
    let sx = 1;
    let rot = 0;
    let ty = 0;
    const ts = v.wt - v.strikeAt;
    const tst = v.wt - v.stumbleAt;
    if (tst >= 0 && tst < 420) {
      const u = tst / 420;
      rot = Math.sin(u * Math.PI * 3) * 0.12 * (1 - u);
      sy = 1 - 0.08 * Math.sin(u * Math.PI);
    } else if (ts >= 0 && ts < 170) {
      // Strike: squash down hard, then recover (hit-stop hold of 2 frames).
      const u = ts < 34 ? 0 : (ts - 34) / 136;
      sy = 0.9 + 0.1 * u;
      sx = 1.06 - 0.06 * u;
      rot = 0.06 * (1 - u);
      ty = 4 * (1 - u);
    } else {
      const ph = d.beatPhase;
      const b = bop(ph);
      sy = 1 + 0.02 * b - (ph > 0.875 ? 0.03 : 0);
      sx = 1 - 0.01 * b;
      if (v.march > 0.5) rot = (d.beatIdx % 2 === 0 ? 1 : -1) * 0.04 * b;
      else rot = -0.03 * Math.max(0, b);
    }
    return [
      { translateX: majorX },
      { translateY: majorBase + ty },
      { rotate: rot },
      { scaleX: sx },
      { scaleY: sy },
      { translateX: -majorW / 2 },
      { translateY: -majorH },
    ];
  });
  const dazeOpacity = useDerivedValue(() => {
    tick.value;
    const t = view.value.wt - view.value.bonkAt;
    return t >= 0 && t < 700 ? 1 - t / 700 : 0;
  });

  // Count-in numerals over the far lane during pre-roll bar 2 (and resume pre-roll).
  const countText = useDerivedValue(() => {
    tick.value;
    const now = view.value.now;
    const b = view.value.countBeats;
    for (let k = 0; k < 4; k++) {
      if (now >= b[k] && now < b[k + 1]) return String(4 - k);
    }
    return '';
  });
  const countTransform = useDerivedValue(() => {
    tick.value;
    const now = view.value.now;
    const b = view.value.countBeats;
    let k = -1;
    for (let q = 0; q < 4; q++) if (now >= b[q] && now < b[q + 1]) k = q;
    if (k < 0) return [{ translateX: -1000 }];
    const len = b[k + 1] - b[k];
    const t = now - b[k];
    const pop = t < 120 ? 1.25 * (t / 120) : 1.25 - 0.25 * Math.min(1, (t - 120) / 100);
    const w = numWidths[3 - k] ?? 50;
    void len;
    return [{ translateX: cx }, { translateY: H * 0.24 }, { scale: Math.max(0.01, pop) }, { translateX: -w / 2 }, { translateY: 34 }];
  });
  const countOpacity = useDerivedValue(() => {
    tick.value;
    const now = view.value.now;
    const b = view.value.countBeats;
    for (let k = 0; k < 4; k++) {
      if (now >= b[k] && now < b[k + 1]) {
        const u = (now - b[k]) / (b[k + 1] - b[k]);
        return u < 0.8 ? 1 : Math.max(0, 1 - (u - 0.8) / 0.2);
      }
    }
    return 0;
  });

  // Moment ribbon (world layer, y 70-120, never over the read zone's last 40%).
  const ribbonW = Math.min(W * 0.78, 300);
  const ribbonH = ribbonW * (222 / 872);
  const ribbonTransform = useDerivedValue(() => {
    tick.value;
    const v = view.value;
    const t = v.wt - v.ribbonAt;
    let k = 0;
    if (t >= 0 && t < 90) k = 0.4 + 0.75 * (t / 90);
    else if (t >= 90 && t < 250) k = 1.15 - 0.15 * ((t - 90) / 160);
    else if (t >= 250) k = 1;
    const rise = t > 0 ? Math.min(24, (t / 500) * 24) : 0;
    return [{ translateX: cx }, { translateY: H * 0.3 - rise }, { scale: Math.max(0.01, k) }];
  });
  const ribbonOpacity = useDerivedValue(() => {
    tick.value;
    const v = view.value;
    const t = v.wt - v.ribbonAt;
    if (v.ribbon === 0 || t < 0) return 0;
    const hold = v.ribbon === 1 ? 1300 : 820;
    if (t < hold) return 1;
    return Math.max(0, 1 - (t - hold) / 180);
  });
  const ribbonText = useDerivedValue(() => {
    tick.value;
    return RIBBON_TEXT[view.value.ribbon] ?? '';
  });
  const ribbonTextX = useDerivedValue(() => {
    tick.value;
    return -(ribbonWidths[view.value.ribbon] ?? 0) / 2;
  });

  // Meters: Groove (left) and Fever (right) arcs.
  const meterR = 22;
  const grooveArc = useDerivedValue(() => {
    tick.value;
    const p = Skia.Path.Make();
    const g = Math.max(0, Math.min(100, judge.value.groove)) / 100;
    p.addArc({ x: 14, y: 42, width: meterR * 2, height: meterR * 2 }, 135, 270 * g);
    return p;
  });
  const feverArc = useDerivedValue(() => {
    tick.value;
    const p = Skia.Path.Make();
    const m = Math.max(0, Math.min(100, judge.value.meter)) / 100;
    const f = view.value.fever;
    p.addArc({ x: W - 14 - meterR * 2, y: 42, width: meterR * 2, height: meterR * 2 }, 135, 270 * Math.max(m, f > 0.5 ? 1 : 0));
    return p;
  });
  const trackArcL = useMemo(() => {
    const p = Skia.Path.Make();
    p.addArc({ x: 14, y: 42, width: meterR * 2, height: meterR * 2 }, 135, 270);
    return p;
  }, []);
  const trackArcR = useMemo(() => {
    const p = Skia.Path.Make();
    p.addArc({ x: W - 14 - meterR * 2, y: 42, width: meterR * 2, height: meterR * 2 }, 135, 270);
    return p;
  }, [W]);
  const feverArcColor = useDerivedValue(() => {
    tick.value;
    const v = view.value;
    if (v.armed) return Math.floor(v.wt / 180) % 2 === 0 ? GOLD : '#fff3b0';
    return v.fever > 0.5 ? '#ff8a6b' : GOLD;
  });
  const grooveColor = useDerivedValue(() => {
    tick.value;
    const g = judge.value.groove;
    return g < 25 ? '#ff7a59' : g < 50 ? GOLD : '#35c46a';
  });
  const feverBulge = useDerivedValue(() => {
    tick.value;
    const v = view.value;
    const k = v.armed ? 1 + 0.06 * Math.sin(v.wt / 90) : 1;
    const ox = W - 14 - meterR;
    const oy = 42 + meterR;
    return [{ translateX: ox }, { translateY: oy }, { scale: k }, { translateX: -ox }, { translateY: -oy }];
  });

  // ---------------------------------------------------------- reading surface
  const laneTop = yHorizon + (yLine - yHorizon) * 0.35; // spawn y
  const lanePath = useDerivedValue(() => {
    tick.value;
    const m = view.value.march;
    const widen = 1 + 0.17 * m;
    const p = Skia.Path.Make();
    const topHalf = halfW * widen * 0.35;
    const botHalf = halfW * widen;
    p.moveTo(cx - topHalf, laneTop);
    p.lineTo(cx + topHalf, laneTop);
    p.lineTo(cx + botHalf, yLine + 10);
    p.lineTo(cx - botHalf, yLine + 10);
    p.close();
    return p;
  });
  const lanePlateOpacity = useDerivedValue(() => {
    tick.value;
    return 0.55 * view.value.fever;
  });
  const railPath = useDerivedValue(() => {
    tick.value;
    const m = view.value.march;
    const widen = 1 + 0.17 * m;
    const p = Skia.Path.Make();
    const topHalf = halfW * widen * 0.35;
    const botHalf = halfW * widen;
    p.moveTo(cx - topHalf, laneTop);
    p.lineTo(cx - botHalf, yLine + 10);
    p.moveTo(cx + topHalf, laneTop);
    p.lineTo(cx + botHalf, yLine + 10);
    return p;
  });
  const railColor = useDerivedValue(() => {
    tick.value;
    const v = view.value;
    if (v.armed) return SKY;
    return v.fever > 0.5 ? '#ffffff' : GOLD;
  });
  const railWidth = useDerivedValue(() => {
    tick.value;
    const v = view.value;
    if (!v.armed) return 4;
    const ph = draw.value.beatPhase;
    return 2 + 3 * Math.max(0, 1 - ph * 3);
  });
  const beatLines = useDerivedValue(() => {
    tick.value;
    const d = draw.value;
    const p = Skia.Path.Make();
    for (let i = 0; i < d.lineN; i++) {
      if (d.lineBar[i]) continue;
      p.moveTo(cx - d.lineHalf[i], d.lineY[i]);
      p.lineTo(cx + d.lineHalf[i], d.lineY[i]);
    }
    return p;
  });
  const barLines = useDerivedValue(() => {
    tick.value;
    const d = draw.value;
    const p = Skia.Path.Make();
    for (let i = 0; i < d.lineN; i++) {
      if (!d.lineBar[i]) continue;
      p.moveTo(cx - d.lineHalf[i], d.lineY[i]);
      p.lineTo(cx + d.lineHalf[i], d.lineY[i]);
    }
    return p;
  });
  const beatLineWidth = useDerivedValue(() => (view.value.pocket ? 2.5 : 1.5));
  const beatLineOpacity = useDerivedValue(() => (view.value.pocket ? 0.6 : 0.4));

  // ROLL tails: candy stripes (dashed) in one path per tail.
  const tailPath = useDerivedValue(() => {
    tick.value;
    const d = draw.value;
    const p = Skia.Path.Make();
    for (let i = 0; i < d.tailN; i++) {
      p.moveTo(cx - d.tailW0[i], d.tailY0[i]);
      p.lineTo(cx - d.tailW1[i], d.tailY1[i]);
      p.lineTo(cx + d.tailW1[i], d.tailY1[i]);
      p.lineTo(cx + d.tailW0[i], d.tailY0[i]);
      p.close();
    }
    return p;
  });
  const tailStripePhase = useDerivedValue(() => {
    tick.value;
    return -(view.value.wt * 0.08) % 20;
  });

  // Notes: one Atlas draw, far notes first.
  const noteSprites = useRectBuffer(MAX_NOTES, (rect, i) => {
    'worklet';
    tick.value;
    const a = noteRects;
    const d = draw.value;
    if (!a) return;
    const j = d.n - 1 - i;
    const r = a[j >= 0 ? d.spr[j] : 0];
    rect.setXYWH(r[0], r[1], r[2], r[3]);
  });
  const noteXf = useRSXformBuffer(MAX_NOTES, (xf, i) => {
    'worklet';
    tick.value;
    const a = noteRects;
    const d = draw.value;
    const j = d.n - 1 - i;
    if (!a || j < 0 || d.echo[j]) {
      xf.set(0, 0, -5000, -5000);
      return;
    }
    const r0 = a[d.spr[j]];
    const r = { width: r0[2], height: r0[3] };
    const sc = d.size[j] / Math.max(r.width, r.height);
    const c = Math.cos(d.rot[j]) * sc;
    const s = Math.sin(d.rot[j]) * sc;
    const w = r.width;
    const h = r.height;
    xf.set(c, s, d.x[j] - (c * w / 2 - s * h / 2), d.y[j] - (s * w / 2 + c * h / 2));
  });
  const noteColors = useColorBuffer(MAX_NOTES, (col, i) => {
    'worklet';
    tick.value;
    const d = draw.value;
    const j = d.n - 1 - i;
    col[0] = 1;
    col[1] = 1;
    col[2] = 1;
    col[3] = j >= 0 ? d.alpha[j] : 0;
  });
  // ECHO (d2): dotted outlines where the notes will be.
  const echoPath = useDerivedValue(() => {
    tick.value;
    const d = draw.value;
    const p = Skia.Path.Make();
    for (let j = 0; j < d.n; j++) {
      if (!d.echo[j]) continue;
      p.addCircle(d.x[j], d.y[j], d.size[j] * 0.42);
    }
    return p;
  });

  // Target ring on the judgment line: pulses in stroke only (never moves).
  const ringStroke = useDerivedValue(() => {
    tick.value;
    const ph = draw.value.beatPhase;
    const pocket = view.value.pocket;
    const k = Math.max(0, 1 - ph * 4);
    return pocket ? 4 + 4 * k : 3 + 2 * k;
  });
  const ringR = useDerivedValue(() => {
    tick.value;
    return 34 * (W / 390) * (1 + 0.15 * view.value.march);
  });
  // Hit ring (cel ring expanding from the target ring).
  const hitRingR = useDerivedValue(() => {
    tick.value;
    const v = view.value;
    const t = v.wt - v.ringAt;
    const to = v.ringGrade <= J_PERFECT ? 120 : v.ringGrade === J_GREAT ? 95 : 75;
    const dur = v.ringGrade <= J_PERFECT ? 260 : 220;
    if (t < 0 || t > dur) return 0;
    const u = 1 - Math.pow(1 - t / dur, 3);
    return 40 + (to - 40) * u + Math.sin(v.wt * 0.7) * 1.5;
  });
  const hitRingOpacity = useDerivedValue(() => {
    tick.value;
    const v = view.value;
    const dur = v.ringGrade <= J_PERFECT ? 260 : 220;
    const t = v.wt - v.ringAt;
    return t < 0 || t > dur ? 0 : 1 - t / dur;
  });
  const hitRingColor = useDerivedValue(() => {
    tick.value;
    const g = view.value.ringGrade;
    return g === J_SHARP || g === J_PERFECT ? GOLD : g === J_GREAT ? '#6cc8ff' : '#ffffff';
  });
  // Judgment-line flash: cel bar, 90 ms (SHARP: full width, 120 ms).
  const lineFlashOpacity = useDerivedValue(() => {
    tick.value;
    const v = view.value;
    const dur = v.lineFull ? 120 : 90;
    const t = v.wt - v.lineAt;
    if (t < 0 || t > dur) return 0;
    const u = t / dur;
    return 0.6 * (1 - u * u);
  });
  const lineFlashX = useDerivedValue(() => (view.value.lineFull ? 0 : cx - halfW * 1.1));
  const lineFlashW = useDerivedValue(() => (view.value.lineFull ? W : halfW * 2.2));

  // Judgment text (220 ms, newest only) + FAST/SLOW.
  const judgText = useDerivedValue(() => {
    tick.value;
    const v = view.value;
    return v.wt - v.judgAt < 260 ? JUDGE_TEXT[v.judgTxt] : '';
  });
  const judgColor = useDerivedValue(() => {
    tick.value;
    const t = view.value.judgTxt;
    return t === 1 || t === 2 ? '#ffe27a' : t === TXT_GREAT ? '#bfe9ff' : t === TXT_GOOD ? '#ffffff' : t >= 5 && t <= 8 ? '#dfe7ef' : '#ffffff';
  });
  const judgTransform = useDerivedValue(() => {
    tick.value;
    const v = view.value;
    const t = v.wt - v.judgAt;
    const k = t < 60 ? 0.8 + 0.2 * (t / 60) : 1;
    const rise = Math.min(8, (t / 220) * 8);
    const w = judgeWidths[v.judgTxt] ?? 0;
    return [{ translateX: cx }, { translateY: yLine - 44 - rise }, { scale: k }, { translateX: -w / 2 }];
  });
  const judgOpacity = useDerivedValue(() => {
    tick.value;
    const t = view.value.wt - view.value.judgAt;
    return t < 180 ? 1 : Math.max(0, 1 - (t - 180) / 80);
  });
  const fsText = useDerivedValue(() => {
    tick.value;
    const v = view.value;
    return v.wt - v.judgAt < 260 && v.judgFS ? (v.judgFS === 1 ? 'FAST' : 'SLOW') : '';
  });
  const fsColor = useDerivedValue(() => (view.value.judgFS === 1 ? '#2f9be8' : '#ff7a59'));
  const fsX = useDerivedValue(() => cx - (fastW[view.value.judgFS === 1 ? 0 : 1] ?? 20) / 2);

  // Hit-error bar (120 x 6 on the hoop band) with ticks and the mean chevron.
  const errBarY = yLine + 16;
  const errPath = useDerivedValue(() => {
    tick.value;
    const v = view.value;
    const p = Skia.Path.Make();
    for (let i = 0; i < v.errV.length; i++) {
      const age = v.wt - v.errT[i];
      if (age < 0 || age > 2000) continue;
      const x = cx + Math.max(-60, Math.min(60, (v.errV[i] / 150) * 60));
      p.addRect({ x: x - 1, y: errBarY - 5, width: 2, height: 10 });
    }
    return p;
  });
  const errMeanX = useDerivedValue(() => {
    tick.value;
    const v = view.value;
    let s = 0;
    let n = 0;
    for (let i = 0; i < v.errV.length; i++) {
      if (v.wt - v.errT[i] <= 4000) {
        s += v.errV[i];
        n++;
      }
    }
    return n ? cx + Math.max(-60, Math.min(60, (s / n / 150) * 60)) : -100;
  });
  const errMeanPath = useDerivedValue(() => {
    const x = errMeanX.value;
    const p = Skia.Path.Make();
    p.moveTo(x - 5, errBarY + 12);
    p.lineTo(x + 5, errBarY + 12);
    p.lineTo(x, errBarY + 6);
    p.close();
    return p;
  });

  // POPPER pips.
  const popPips = useDerivedValue(() => {
    tick.value;
    const d = draw.value;
    const v = view.value;
    const p = Skia.Path.Make();
    if (d.popY < 0) return p;
    const need = judge.value.popperNeed;
    const done = v.popperTaps;
    const w = need * 12;
    for (let i = done; i < need; i++) p.addCircle(cx - w / 2 + i * 12 + 6, d.popY - 42, 4.5);
    return p;
  });

  // Rival / ghost rails outside the lane edges (design 11.2).
  const railPaths = useMemo(() => rails.slice(0, 3).map((_, i) => {
    const side = i % 2 === 0 ? -1 : 1;
    const off = 10 + Math.floor(i / 2) * 6;
    const p = Skia.Path.Make();
    p.moveTo(cx + side * (halfW * 0.35 + off * 0.35), laneTop);
    p.lineTo(cx + side * (halfW + off), yLine + 10);
    return p;
  }), [rails, cx, halfW, laneTop, yLine]);

  // ------------------------------------------------------------------ drum
  const zoneH = H - touchTop;
  const drumW = W * 0.4;
  const drumH = drum ? drumW * (drum.height() / drum.width()) : drumW;
  const drumY = touchTop + Math.max(0, (zoneH - drumH) * 0.42);
  const rimW = W * 0.24;
  const rimH = n1 ? rimW * (n1.height() / n1.width()) : rimW;
  const rimY = touchTop + Math.max(0, (zoneH - rimH) * 0.45);
  const drumTransform = useDerivedValue(() => {
    tick.value;
    const v = view.value;
    const t = v.wt - v.drumAt;
    let sy = 1;
    let sx = 1;
    if (t >= 0 && t < 160) {
      // Damped spring back from the squash (design 6.3).
      const u = t / 160;
      const amt = v.drumAmt * Math.exp(-u * 3.2) * Math.cos(u * Math.PI * 1.6);
      sy = 1 - amt;
      sx = 1 + amt * 0.5;
    }
    const oy = drumY + drumH;
    return [{ translateX: cx }, { translateY: oy }, { scaleX: sx }, { scaleY: sy }, { translateX: -cx }, { translateY: -oy }];
  });
  const drumOpacity = useDerivedValue(() => (view.value.wt < view.value.drumDimUntil ? 0.7 : 1));
  const rimLeftFlash = useDerivedValue(() => {
    tick.value;
    const v = view.value;
    const t = v.wt - v.rimAt;
    return t >= 0 && t < 120 && v.rimSide === 0 ? 1 - t / 120 : 0;
  });
  const rimRightFlash = useDerivedValue(() => {
    tick.value;
    const v = view.value;
    const t = v.wt - v.rimAt;
    return t >= 0 && t < 120 && v.rimSide === 1 ? 1 - t / 120 : 0;
  });
  const rimWobbleL = useDerivedValue(() => {
    tick.value;
    const v = view.value;
    const t = v.wt - v.rimAt;
    const k = t >= 0 && t < 160 && v.rimSide === 0 ? Math.sin(t / 18) * 0.08 * (1 - t / 160) : 0;
    const ox = rimW * 0.62;
    const oy = rimY + rimH / 2;
    return [{ translateX: ox }, { translateY: oy }, { rotate: k }, { translateX: -ox }, { translateY: -oy }];
  });
  const rimWobbleR = useDerivedValue(() => {
    tick.value;
    const v = view.value;
    const t = v.wt - v.rimAt;
    const k = t >= 0 && t < 160 && v.rimSide === 1 ? Math.sin(t / 18) * 0.08 * (1 - t / 160) : 0;
    const ox = W - rimW * 0.62;
    const oy = rimY + rimH / 2;
    return [{ translateX: ox }, { translateY: oy }, { rotate: k }, { translateX: -ox }, { translateY: -oy }];
  });
  // March: a gold rim flash on the drum every beat (stronger on downbeats).
  const marchRimOpacity = useDerivedValue(() => {
    tick.value;
    const v = view.value;
    const d = draw.value;
    if (v.march < 0.5 && !v.pocket) return 0;
    const t = d.beatPhase;
    return (d.beatIdx % 4 === 0 ? 0.9 : 0.6) * Math.max(0, 1 - t * 2.5);
  });
  const starburstTransform = useDerivedValue(() => {
    tick.value;
    const rot = (view.value.wt / 1000) * (20 * Math.PI / 180);
    const oy = drumY + drumH / 2;
    return [{ translateX: cx }, { translateY: oy }, { rotate: rot }, { translateX: -drumW * 0.9 }, { translateY: -drumW * 0.9 }];
  });
  const starburstOpacity = useDerivedValue(() => 0.35 * view.value.fever);

  const bursts = useDerivedValue(() => {
    tick.value;
    return buildBursts(view.value);
  });
  const bGold = useDerivedValue(() => bursts.value[0]);
  const bSky = useDerivedValue(() => bursts.value[1]);
  const bWhite = useDerivedValue(() => bursts.value[2]);
  const bCoral = useDerivedValue(() => bursts.value[3]);
  const bGrey = useDerivedValue(() => bursts.value[4]);
  const bOutline = useDerivedValue(() => bursts.value[5]);
  const worldFlash = useDerivedValue(() => {
    tick.value;
    const v = view.value;
    const t = v.wt - v.flashAt;
    if (t < 0 || t > 260) return 0;
    const peak = reducedMotion ? Math.min(0.15, v.flashPeak) : v.flashPeak;
    return t < 60 ? peak * (t / 60) : peak * (1 - (t - 60) / 200);
  });
  // 1-frame white flash inside the ring on SHARP/PERFECT (Supercell hit flash).
  const coreFlash = useDerivedValue(() => {
    tick.value;
    const v = view.value;
    const t = v.wt - v.ringAt;
    return t >= 0 && t < 50 && v.ringGrade <= J_PERFECT ? 0.85 : t >= 0 && t < 40 ? 0.5 : 0;
  });

  const railFlashOpacity = [0, 1, 2].map((i) => useDerivedValue(() => {
    tick.value;
    const t = view.value.wt - (railFlash.value[i] ?? -1e9);
    return t >= 0 && t < 160 ? 1 : 0.45;
  }));

  return (
    <Canvas style={{ width: W, height: H, position: 'absolute', left: 0, top: 0 }} pointerEvents="none">
      {/* ------------------------------ WORLD ------------------------------ */}
      <Group transform={worldTransform}>
        <Group>
          <ColorMatrix matrix={feverMatrix} />
          {bg ? <Image image={bg} x={bgRect.x} y={bgRect.y} width={bgRect.w} height={bgRect.h} fit="fill" /> : <Rect x={0} y={0} width={W} height={H} color="#4fc3ff" />}
        </Group>
        <Group transform={buntingTransform} origin={vec(W / 2, 0)}>
          <Path path={bunting.cord} color={NAVY} style="stroke" strokeWidth={2.5} />
          {bunting.paths.map((p, i) => <Path key={i} path={p} color={bunting.fills[i]} />)}
          <Path path={bunting.outline} color={NAVY} style="stroke" strokeWidth={2.5} strokeJoin="round" />
        </Group>
        {crowdAtlas ? <Atlas image={crowdAtlas.image} sprites={crowdSprites} transforms={crowdXf} /> : null}
        {major ? (
          <Group transform={majorTransform}>
            <Image image={major} x={0} y={0} width={majorW} height={majorH} fit="contain" />
          </Group>
        ) : null}
        <Group opacity={dazeOpacity}>
          <Circle cx={majorX - 8} cy={majorBase - majorH * 0.98} r={5} color={GOLD} />
          <Circle cx={majorX + 10} cy={majorBase - majorH * 1.02} r={4} color="#ffffff" />
          <Circle cx={majorX + 24} cy={majorBase - majorH * 0.96} r={5} color={GOLD} />
        </Group>
        {/* Meters */}
        <Path path={trackArcL} color="rgba(11,58,107,0.35)" style="stroke" strokeWidth={9} strokeCap="round" />
        <Path path={grooveArc} color={grooveColor} style="stroke" strokeWidth={7} strokeCap="round" />
        <Group transform={feverBulge}>
          <Path path={trackArcR} color="rgba(11,58,107,0.35)" style="stroke" strokeWidth={9} strokeCap="round" />
          <Path path={feverArc} color={feverArcColor} style="stroke" strokeWidth={7} strokeCap="round" />
        </Group>
        <Rect x={0} y={0} width={W} height={H} color="#fff6d8" opacity={worldFlash} />
        {/* Count-in */}
        {bigFont ? (
          <Group transform={countTransform} opacity={countOpacity}>
            <SkText x={0} y={0} text={countText} font={bigFont} color={NAVY} style="stroke" strokeWidth={10} strokeJoin="round" />
            <SkText x={0} y={0} text={countText} font={bigFont} color={GOLD} />
          </Group>
        ) : null}
      </Group>

      {/* ------------------------- READING SURFACE ------------------------- */}
      <Path path={lanePath} color="rgba(236,248,255,0.9)" />
      <Path path={lanePath} color="#1f7fe0" opacity={lanePlateOpacity} />
      <Path path={beatLines} color={NAVY} style="stroke" strokeWidth={beatLineWidth} opacity={beatLineOpacity} />
      <Path path={barLines} color={NAVY} style="stroke" strokeWidth={3} opacity={0.7} />
      <Path path={lanePath} color={NAVY} style="stroke" strokeWidth={3} strokeJoin="round" />
      <Path path={railPath} color={railColor} style="stroke" strokeWidth={railWidth} strokeCap="round" />
      {railPaths.map((p, i) => (
        <Path key={i} path={p} color={rails[i]} style="stroke" strokeWidth={4} strokeCap="round" opacity={railFlashOpacity[i]} />
      ))}
      <Path path={tailPath} color="#ff8a6b" />
      <Path path={tailPath} color="#ffffff" style="stroke" strokeWidth={6}>
        <DashPathEffect intervals={[10, 10]} phase={tailStripePhase} />
      </Path>
      <Path path={tailPath} color={NAVY} style="stroke" strokeWidth={2.5} />
      {/* judgment line = the drum's top hoop */}
      <Line p1={vec(cx - halfW - 6, yLine)} p2={vec(cx + halfW + 6, yLine)} color={GOLD} strokeWidth={4} />
      <Circle cx={cx} cy={yLine} r={ringR} color={NAVY} style="stroke" strokeWidth={ringStroke} />
      <Circle cx={cx} cy={yLine} r={ringR} color="rgba(255,207,59,0.55)" style="stroke" strokeWidth={2} />
      {noteAtlas ? <Atlas image={noteAtlas.image} sprites={noteSprites} transforms={noteXf} /> : null}
      <Path path={echoPath} color={NAVY} style="stroke" strokeWidth={3}>
        <DashPathEffect intervals={[6, 4]} />
      </Path>
      <Path path={popPips} color={GOLD} />
      {/* hit ring + line flash (screen-ish white bar with gold edge) */}
      <Circle cx={cx} cy={yLine} r={hitRingR} color={NAVY} style="stroke" strokeWidth={9} opacity={hitRingOpacity} />
      <Circle cx={cx} cy={yLine} r={hitRingR} color={hitRingColor} style="stroke" strokeWidth={5.5} opacity={hitRingOpacity} />
      <Circle cx={cx} cy={yLine} r={ringR} color="#ffffff" opacity={coreFlash} />
      <Group opacity={lineFlashOpacity}>
        <Rect x={lineFlashX} y={yLine - 5} width={lineFlashW} height={10} color="#ffffff" />
        <Rect x={lineFlashX} y={yLine + 4} width={lineFlashW} height={2} color={GOLD} />
      </Group>
      {font ? (
        <Group transform={judgTransform} opacity={judgOpacity}>
          <SkText x={0} y={0} text={judgText} font={font} color={NAVY} style="stroke" strokeWidth={6} strokeJoin="round" />
          <SkText x={0} y={0} text={judgText} font={font} color={judgColor} />
        </Group>
      ) : null}
      {smallFont ? (
        <Group opacity={judgOpacity}>
          <SkText x={fsX} y={yLine - 26} text={fsText} font={smallFont} color={NAVY} style="stroke" strokeWidth={4} />
          <SkText x={fsX} y={yLine - 26} text={fsText} font={smallFont} color={fsColor} />
        </Group>
      ) : null}
      <Path path={bGrey} color="rgba(214,223,232,0.8)" />
      <Path path={bCoral} color="#ff8a6b" />
      <Path path={bSky} color="#7fd4ff" />
      <Path path={bGold} color={GOLD} />
      <Path path={bWhite} color="#ffffff" />
      <Path path={bOutline} color={NAVY} style="stroke" strokeWidth={2.2} strokeJoin="round" />
      <RoundedRect x={cx - 60} y={errBarY - 3} width={120} height={6} r={3} color="rgba(11,58,107,0.55)" />
      <Rect x={cx - 1.5} y={errBarY - 6} width={3} height={12} color={GOLD} />
      <Path path={errPath} color="#ffffff" />
      <Path path={errMeanPath} color={NAVY} />

      {/* -------------------------------- DRUM ------------------------------- */}
      {starburst ? (
        <Group transform={starburstTransform} opacity={starburstOpacity}>
          <Image image={starburst} x={0} y={0} width={drumW * 1.8} height={drumW * 1.8} fit="contain" />
        </Group>
      ) : null}
      {n1 ? (
        <>
          <Group transform={rimWobbleL}>
            <Image image={n1} x={rimW * 0.12} y={rimY} width={rimW} height={rimH} fit="contain" />
            <Group opacity={rimLeftFlash}>
              <Circle cx={rimW * 0.62} cy={rimY + rimH / 2} r={rimW * 0.5} color="rgba(255,236,150,0.55)" />
            </Group>
          </Group>
          <Group transform={rimWobbleR}>
            <Image image={n1} x={W - rimW * 1.12} y={rimY} width={rimW} height={rimH} fit="contain" />
            <Group opacity={rimRightFlash}>
              <Circle cx={W - rimW * 0.62} cy={rimY + rimH / 2} r={rimW * 0.5} color="rgba(255,236,150,0.55)" />
            </Group>
          </Group>
        </>
      ) : null}
      {drum ? (
        <Group transform={drumTransform} opacity={drumOpacity}>
          <Image image={drum} x={cx - drumW / 2} y={drumY} width={drumW} height={drumH} fit="contain" />
        </Group>
      ) : null}
      <Group opacity={marchRimOpacity}>
        <Circle cx={cx} cy={drumY + drumH * 0.26} r={drumW * 0.44} color={GOLD} style="stroke" strokeWidth={5} />
      </Group>

      {/* Ribbon moments (world layer copy drawn last so it reads over the crowd) */}
      {ribbonImg && ribbonFont ? (
        <Group transform={ribbonTransform} opacity={ribbonOpacity}>
          <Image image={ribbonImg} x={-ribbonW / 2} y={-ribbonH / 2} width={ribbonW} height={ribbonH} fit="fill" />
          <SkText x={ribbonTextX} y={ribbonH * 0.02 + 9} text={ribbonText} font={ribbonFont} color={NAVY} style="stroke" strokeWidth={5} strokeJoin="round" />
          <SkText x={ribbonTextX} y={ribbonH * 0.02 + 9} text={ribbonText} font={ribbonFont} color="#ffffff" />
        </Group>
      ) : null}
    </Canvas>
  );
});

export const FIELD_COLORS = { NAVY, GOLD, SKY, CREAM };
export type { SkImage };
