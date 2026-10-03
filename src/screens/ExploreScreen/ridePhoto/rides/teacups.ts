import { PaintStyle, Skia, StrokeCap, createPicture, vec, type SkCanvas } from '@shopify/react-native-skia';
import { drawHedge, drawSeason, drawSky, paintExtras } from './backdrop';
import {
  cameraRig, drawBulb, drawImg, drawRider, gradeMatrix, photoCrop, spritePaint,
  type BuildCtx, type PaintState, type RideData, type RideStage, type SceneArt,
} from './stage';

/**
 * Teacups: three cups ride around a turntable while each one spins. The camera
 * moment is when the find's cup comes round to the front AND spins to face the
 * camera. A slow, steady rotation instead of a drop; the same ms windows.
 */

const CUPS = 3;
/** Orbit sweep per pass (radians) and spins per pass of the find's cup. */
const SWEEP = Math.PI * 1.5;
const SPINS = 2.2;
const CUP_SCALE = 0.3;
/** teacup-back/front.webp (512 x 418): the front rim starts at 36% of the height; the find sits at 55%. */
const SEAT_Y = 0.55;
const CUP_ASPECT = 418 / 512;
const STATION_DT = 0.3;

/** The find's cup at pass time t: orbit angle (pi/2 is front centre) and spin (0 faces the camera). */
export function cupPose(t: number, frameT: number): { orbit: number; spin: number } {
  'worklet';
  return { orbit: Math.PI / 2 - (t - frameT) * SWEEP, spin: (t - frameT) * Math.PI * 2 * SPINS };
}

export function buildTeacups(ctx: BuildCtx): RideStage {
  const { width, height, top, spec, variant, art } = ctx;
  const frameT = 0.62 + variant.frameShift * 0.04;
  const stationT = frameT - STATION_DT;
  const cx = width * 0.42, cy = Math.max(top + 120, height * 0.62);
  const rx = width * 0.36, ry = width * 0.13;
  const cupW = Math.round(width * CUP_SCALE), cupH = Math.round(cupW * CUP_ASPECT);
  const riderSize = Math.round(cupW * 0.62);
  // The window frames the front-centre cup and its rider.
  const bw = cupW * 1.3, bh = cupH * 0.95 + riderSize * 0.55;
  const front = { x: cx, y: cy + ry };
  const box = { x: front.x - bw / 2, y: front.y - cupH * 0.92 - riderSize * 0.5, w: bw, h: bh };
  const cam = cameraRig(box, width, height, top);
  const crop = photoCrop(box, width, height, 0.75);
  const grade = gradeMatrix(variant.sky, variant.golden);
  const st = cupPose(stationT, frameT);
  const sScale = 0.78 + 0.22 * Math.sin(st.orbit);
  const seat = { x: cx + rx * Math.cos(st.orbit), y: cy + ry * Math.sin(st.orbit) - cupH * sScale * (1 - SEAT_Y) };

  const backdrop = createPicture((canvas: SkCanvas) => {
    drawSky(canvas, width, height, variant, art);
    const hedgeTop = drawHedge(canvas, width, height, variant, art);
    drawTurntable(canvas, cx, cy, rx, ry, cupW, grade);
    drawSeason(canvas, width, height, variant, hedgeTop, art);
  }, { width, height });

  const bulbs: number[] = [];
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    bulbs.push(cx + (rx + cupW * 0.45) * Math.cos(a), cy + cupW * 0.1 + (ry + cupW * 0.16) * Math.sin(a));
  }
  const data: RideData = {
    cx, cy, rx, ry, cupW, cupH, rider: riderSize, frameT, grade, width, height, sky: variant.sky,
    weather: variant.weather, photobomb: variant.photobomb, box, bulbs,
  };
  return {
    kind: 'teacups', width, height, sky: variant.sky, frameT, stationT, box, cam, crop, seat, riderSize,
    backdrop, foreground: null, data, paint: paintTeacups,
    emissive: variant.sky === 'night' ? paintTeacupBulbs : null,
    spotlight: spec.litMs != null,
  };
}

const CUP_TINTS = [null, [0.75, 0.25, 0, 0, 0, 0.1, 0.85, 0.1, 0, 0, 0.15, 0.3, 0.8, 0, 0, 0, 0, 0, 1, 0],
  [0.6, 0.3, 0.1, 0, 0, 0.1, 0.95, 0.05, 0, 0, 0.3, 0.3, 0.5, 0, 0, 0, 0, 0, 1, 0]];

// Worklet helpers come before the worklets that call them (worklet closures are captured at definition).
/** Multiply two 4x5 colour matrices (a after b). */
function multiply(a: number[], b: number[]): number[] {
  'worklet';
  const out: number[] = [];
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 5; c++) {
      let v = c === 4 ? a[r * 5 + 4] : 0;
      for (let k = 0; k < 4; k++) v += a[r * 5 + k] * b[k * 5 + c];
      out.push(v);
    }
  }
  return out;
}

/** Spin lines: two short white arcs circling the cup; the ones on the near side draw over it. */
function drawSwoosh(canvas: SkCanvas, w: number, h: number, spin: number, front: boolean, alpha: number) {
  'worklet';
  const paint = Skia.Paint(); paint.setAntiAlias(true); paint.setStyle(PaintStyle.Stroke);
  paint.setStrokeCap(StrokeCap.Round); paint.setColor(Skia.Color('#ffffff'));
  const rx = w * 0.62, ry = h * 0.2, cy = -h * 0.5;
  for (let k = 0; k < 2; k++) {
    const a0 = spin + k * Math.PI;
    const mid = Math.sin(a0 + 0.35);
    if ((mid > 0) !== front) continue;
    const path = Skia.Path.Make();
    for (let i = 0; i <= 8; i++) {
      const a = a0 + (i / 8) * 0.7;
      const x = Math.cos(a) * rx, y = cy + Math.sin(a) * ry;
      if (i === 0) path.moveTo(x, y); else path.lineTo(x, y);
    }
    paint.setStrokeWidth(Math.max(2.5, w * 0.03));
    paint.setAlphaf(0.75 * alpha);
    canvas.drawPath(path, paint);
  }
}

function drawHub(canvas: SkCanvas, art: SceneArt, cx: number, cy: number, cupW: number, grade: number[]) {
  'worklet';
  const w = cupW * 1.25;
  drawImg(canvas, art.teapot ?? null, cx - w / 2, cy - w * 0.95, w, w, spritePaint(grade));
}

export function paintTeacups(canvas: SkCanvas, s: PaintState, d: RideData, art: SceneArt): void {
  'worklet';
  const cx = d.cx as number, cy = d.cy as number, rx = d.rx as number, ry = d.ry as number;
  const cupW = d.cupW as number, cupH = d.cupH as number;
  if (!s.ghost) paintExtras(canvas, s.t, s.clock, d.frameT as number, d.width as number, d.height as number,
    d.sky as string, d.weather as string, d.photobomb as string, d.box as { x: number; y: number; w: number; h: number });
  const pose = cupPose(s.t, d.frameT as number);
  // Back to front: cups behind the hub, the teapot hub, cups in front.
  const order: number[] = [];
  for (let i = 0; i < CUPS; i++) order.push(i);
  const orbitOf = (i: number) => pose.orbit + (i * Math.PI * 2) / CUPS;
  order.sort((a, b) => Math.sin(orbitOf(a)) - Math.sin(orbitOf(b)));
  let hubDrawn = false;
  for (let k = 0; k < order.length; k++) {
    const i = order[k];
    if (s.ghost && i !== 0) continue;
    const orbit = orbitOf(i);
    const depth = Math.sin(orbit);
    if (!hubDrawn && depth > 0 && !s.ghost) { drawHub(canvas, art, cx, cy, cupW, d.grade as number[]); hubDrawn = true; }
    const scale = 0.78 + 0.22 * depth;
    const x = cx + rx * Math.cos(orbit), y = cy + ry * depth;
    const w = cupW * scale, h = cupH * scale;
    const spin = pose.spin + i * 1.9;
    const tint = CUP_TINTS[i % CUP_TINTS.length];
    const alpha = i === 0 ? (s.ghost ? 0.45 * s.alpha : s.alpha) : 1;
    const matrix = tint ? multiply(d.grade as number[], tint) : (d.grade as number[]);
    const paint = spritePaint(matrix, alpha);
    canvas.save();
    canvas.translate(x, y);
    canvas.rotate(i === 0 ? s.rock * 3 : 0, 0, 0);
    // Shadow on the turntable.
    if (!s.ghost) {
      const shadow = Skia.Paint(); shadow.setAntiAlias(true); shadow.setColor(Skia.Color('rgba(40,20,70,0.22)'));
      canvas.drawOval(Skia.XYWHRect(-w * 0.42, -h * 0.06, w * 0.84, h * 0.14), shadow);
    }
    if (!s.ghost && !s.photo) drawSwoosh(canvas, w, h, spin, false, alpha);
    drawImg(canvas, art.cupBack ?? null, -w / 2, -h, w, h, paint);
    if (i === 0) {
      // The find faces the camera when the spin comes round (cos = 1); turned away it shows its back.
      const facing = Math.cos(spin);
      const riderPaint = facing >= 0 ? paint : spritePaint([0.35, 0, 0, 0, 0.05, 0, 0.35, 0, 0, 0.07, 0, 0, 0.45, 0, 0.12, 0, 0, 0, 1, 0], alpha);
      drawRider(canvas, art.rider ?? null, 0, -h * (1 - SEAT_Y), (d.rider as number) * scale, 0, s.riderIn, riderPaint,
        Math.max(0.18, Math.abs(facing)));
    }
    drawImg(canvas, art.cupFront ?? null, -w / 2, -h, w, h, paint);
    if (!s.ghost && !s.photo) drawSwoosh(canvas, w, h, spin, true, alpha);
    canvas.restore();
  }
  if (!hubDrawn && !s.ghost) drawHub(canvas, art, cx, cy, cupW, d.grade as number[]);
}

/** Night: bulbs around the turntable rim, chasing slowly. */
export function paintTeacupBulbs(canvas: SkCanvas, s: PaintState, d: RideData, art: SceneArt): void {
  'worklet';
  const bulbs = d.bulbs as number[];
  const head = s.photo ? 0 : Math.floor(s.clock * 5);
  for (let i = 0; i < bulbs.length / 2; i++) {
    drawBulb(canvas, art.glow ?? null, bulbs[i * 2], bulbs[i * 2 + 1], 12, (i + head) % 3 === 0 ? 1 : 0.5);
  }
}

/** The turntable: a striped saucer top with a thick rim, in Alex's flat outlined style. */
function drawTurntable(canvas: SkCanvas, cx: number, cy: number, rx: number, ry: number, cupW: number, grade: number[]) {
  const ox = rx + cupW * 0.55, oy = ry + cupW * 0.2;
  const filter = Skia.ColorFilter.MakeMatrix(grade);
  const fill = Skia.Paint(); fill.setAntiAlias(true); fill.setColorFilter(filter);
  const ink = Skia.Paint(); ink.setAntiAlias(true); ink.setStyle(PaintStyle.Stroke); ink.setStrokeWidth(4);
  ink.setColor(Skia.Color('#6a3f8f')); ink.setColorFilter(filter);
  const rimH = cupW * 0.22;
  // Rim (side band).
  fill.setColor(Skia.Color('#b27ad6'));
  const rim = Skia.Path.Make();
  rim.addOval(Skia.XYWHRect(cx - ox, cy - oy + rimH, ox * 2, oy * 2));
  rim.addRect(Skia.XYWHRect(cx - ox, cy, ox * 2, rimH));
  canvas.drawPath(rim, fill);
  canvas.drawOval(Skia.XYWHRect(cx - ox, cy - oy + rimH, ox * 2, oy * 2), ink);
  // Top: alternating wedges.
  for (let i = 0; i < 16; i++) {
    const a0 = (i / 16) * Math.PI * 2, a1 = ((i + 1) / 16) * Math.PI * 2;
    const wedge = Skia.Path.Make();
    wedge.moveTo(cx, cy);
    for (let k = 0; k <= 6; k++) {
      const a = a0 + (a1 - a0) * (k / 6);
      wedge.lineTo(cx + ox * Math.cos(a), cy + oy * Math.sin(a));
    }
    wedge.close();
    fill.setColor(Skia.Color(i % 2 ? '#ffe9f4' : '#f7b6d8'));
    canvas.drawPath(wedge, fill);
  }
  canvas.drawOval(Skia.XYWHRect(cx - ox, cy - oy, ox * 2, oy * 2), ink);
  // A soft gloss on the far side of the top.
  const gloss = Skia.Paint(); gloss.setAntiAlias(true);
  gloss.setShader(Skia.Shader.MakeLinearGradient(vec(0, cy - oy), vec(0, cy), [Skia.Color('rgba(255,255,255,0.35)'), Skia.Color('rgba(255,255,255,0)')], null, 0));
  canvas.drawOval(Skia.XYWHRect(cx - ox * 0.9, cy - oy * 0.95, ox * 1.8, oy * 0.9), gloss);
}
