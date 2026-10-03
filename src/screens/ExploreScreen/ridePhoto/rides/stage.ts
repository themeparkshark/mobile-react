import { BlendMode, Skia, type SkCanvas, type SkImage, type SkPaint, type SkPicture } from '@shopify/react-native-skia';
import type { RideSpec } from '../../ridePhoto';
import type { RideKind, SceneVariant, Sky } from './catalog';

/**
 * One ride, built for one open. Everything static (sky, backdrop, track,
 * platform, decorations) is recorded once into Pictures; everything that moves
 * is drawn by `paint`, a worklet that runs on the UI thread every frame (into a
 * recorded Picture) and on the JS thread for the photo (into an offscreen
 * surface). The live scene and the photo can never disagree.
 */

export interface Box { readonly x: number; readonly y: number; readonly w: number; readonly h: number }

/** The on-ride camera: head, lens, its three built-in lamps, and the pole to the ground. */
export interface CamRig {
  readonly x: number; readonly y: number; readonly w: number; readonly h: number;
  readonly lens: { readonly x: number; readonly y: number };
  /** Centres of the red, yellow and green lamps on the camera art, and their radius. */
  readonly lamps: readonly { readonly x: number; readonly y: number }[];
  readonly lampR: number;
  readonly pole: Box;
  /** The camera faces left (sits right of the frame) or right. */
  readonly facing: 'left' | 'right';
}

export interface SceneArt {
  readonly [key: string]: SkImage | null;
}

/** Per-frame inputs to a ride's paint. Plain numbers only (worklet-safe). */
export interface PaintState {
  /** 0..1 of the pass. */
  readonly t: number;
  /** Seconds of scene clock (for loops that are not tied to the pass: spray, bulbs, bob). */
  readonly clock: number;
  readonly rock: number;
  /** 0 before the find has hopped in, then 1 (with a little squash on landing). */
  readonly riderIn: number;
  /** Vehicle opacity (fades out on a miss, back in for the next pass). */
  readonly alpha: number;
  /** Draw as the translucent miss replay (no effects). */
  readonly ghost: boolean;
  /** The photo render: freeze loops at the moment, skip UI-only effects. */
  readonly photo: boolean;
}

export type RidePaint = (canvas: SkCanvas, s: PaintState, data: RideData, art: SceneArt) => void;
export type RideData = Record<string, unknown>;

export interface RideStage {
  readonly kind: RideKind;
  readonly width: number;
  readonly height: number;
  readonly sky: Sky;
  /** The scene variety this ride was built with (photobombs, season, weather). */
  readonly variant: SceneVariant;
  /** Pass time (0..1) of the camera moment; grading is ms around frameT * passMs. */
  readonly frameT: number;
  /** Where the vehicle waits while the find hops in. */
  readonly stationT: number;
  /** The camera window (lit frame) and the camera. */
  readonly box: Box;
  readonly cam: CamRig;
  /** The photo's crop of the scene. */
  readonly crop: Box;
  /** The seat at the station (scene points) and the rider's size, for the hop. */
  readonly seat: { readonly x: number; readonly y: number };
  readonly riderSize: number;
  readonly backdrop: SkPicture;
  /** Static parts drawn over the vehicles (a flume trough's front wall), or null. */
  readonly foreground: SkPicture | null;
  readonly data: RideData;
  readonly paint: RidePaint;
  /** Where the vehicle is at pass time t (scene points), so the grade plate can sit opposite it. */
  readonly vehicleAt?: (t: number) => { x: number; y: number };
  /** Moving parts drawn over the foreground (the flume's splash crown), or undefined. */
  readonly front?: RidePaint;
  /** Lights that glow at night (bulbs), drawn after the night grade, or null. */
  readonly emissive: RidePaint | null;
  /** Spotlight beat (Epic): the scene outside the window sits dark; the window lights as the car arrives. */
  readonly spotlight: boolean;
}

export interface BuildCtx {
  readonly width: number;
  readonly height: number;
  /** Safe top inset: nothing important above it. */
  readonly top: number;
  readonly spec: RideSpec;
  readonly tier: number;
  readonly variant: SceneVariant;
  readonly art: SceneArt;
}

// ── Lighting: one grade for every sprite in a sky (the backdrops are painted for their sky) ──

const ID = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0];
/** Cool moonlit rim: darker, bluer, a little desaturated. */
const NIGHT = [0.5, 0.06, 0.08, 0, 0.0, 0.04, 0.56, 0.1, 0, 0.01, 0.08, 0.12, 0.72, 0, 0.04, 0, 0, 0, 1, 0];
const SUNSET = [1.02, 0.08, 0, 0, 0.02, 0.02, 0.9, 0.04, 0, 0.0, 0, 0.02, 0.78, 0, 0.0, 0, 0, 0, 1, 0];
const GOLDEN = [1.05, 0.1, 0, 0, 0.04, 0.03, 0.95, 0.03, 0, 0.02, 0, 0.02, 0.74, 0, 0, 0, 0, 0, 1, 0];

export function gradeMatrix(sky: Sky, golden: boolean): number[] {
  'worklet';
  if (golden) return GOLDEN;
  return sky === 'night' ? NIGHT : sky === 'sunset' ? SUNSET : ID;
}

/** A paint that draws sprites under the sky's grade. */
export function spritePaint(matrix: number[] | null, alpha = 1): SkPaint {
  'worklet';
  const paint = Skia.Paint();
  paint.setAntiAlias(true);
  if (alpha < 1) paint.setAlphaf(Math.max(0, alpha));
  if (matrix && matrix !== ID) paint.setColorFilter(Skia.ColorFilter.MakeMatrix(matrix));
  return paint;
}

/** Draw an image into a box (fill). */
export function drawImg(canvas: SkCanvas, image: SkImage | null, x: number, y: number, w: number, h: number, paint: SkPaint): void {
  'worklet';
  if (!image) return;
  canvas.drawImageRect(image, Skia.XYWHRect(0, 0, image.width(), image.height()), Skia.XYWHRect(x, y, w, h), paint);
}

/** Draw an image to cover a box, cropping the source to the box's aspect. */
export function drawCover(canvas: SkCanvas, image: SkImage | null, x: number, y: number, w: number, h: number, paint: SkPaint): void {
  'worklet';
  if (!image) return;
  const sw = image.width(), sh = image.height(), k = Math.max(w / sw, h / sh);
  const cw = w / k, ch = h / k;
  canvas.drawImageRect(image, Skia.XYWHRect((sw - cw) / 2, (sh - ch) / 2, cw, ch), Skia.XYWHRect(x, y, w, h), paint);
}

/**
 * The find in its seat: bottom-centre at (x, y), `size` tall, a squash and rebound on landing,
 * and a lean against the vehicle's pitch.
 */
export function drawRider(canvas: SkCanvas, rider: SkImage | null, x: number, y: number, size: number, lean: number,
  riderIn: number, paint: SkPaint, scaleX = 1, rim = false): void {
  'worklet';
  if (!rider || riderIn <= 0) return;
  // riderIn runs 1.15 (squash on landing), 0.92 (rebound), then 1: wide and short, tall and thin, rest.
  const k = Math.max(0.85, Math.min(1.2, riderIn));
  canvas.save();
  canvas.translate(x, y);
  canvas.rotate((lean * 180) / Math.PI, 0, 0);
  canvas.scale(scaleX * k, 2 - k);
  if (rim) {
    // Night: a 2 pt warm rim light so the find reads on a dark vehicle.
    const halo = Skia.Paint(); halo.setAntiAlias(true);
    halo.setColorFilter(Skia.ColorFilter.MakeBlend(Skia.Color('#ffd98a'), BlendMode.SrcIn));
    const g = 2.2;
    canvas.drawImageRect(rider, Skia.XYWHRect(0, 0, rider.width(), rider.height()),
      Skia.XYWHRect(-size / 2 - g, -size * 0.92 - g, size + g * 2, size + g * 2), halo);
  }
  canvas.drawImageRect(rider, Skia.XYWHRect(0, 0, rider.width(), rider.height()),
    Skia.XYWHRect(-size / 2, -size * 0.92, size, size), paint);
  canvas.restore();
}

/** Warm additive bulb glow (a soft sprite with a hot core), for night lights. */
export function drawBulb(canvas: SkCanvas, glow: SkImage | null, x: number, y: number, r: number, on: number): void {
  'worklet';
  const paint = Skia.Paint();
  paint.setAntiAlias(true);
  if (glow && on > 0) {
    paint.setBlendMode(BlendMode.Plus);
    paint.setAlphaf(0.9 * on);
    canvas.drawImageRect(glow, Skia.XYWHRect(0, 0, glow.width(), glow.height()), Skia.XYWHRect(x - r, y - r, r * 2, r * 2), paint);
    paint.setBlendMode(BlendMode.SrcOver);
  }
  paint.setAlphaf(1);
  paint.setColor(Skia.Color(on > 0.5 ? '#fff4b8' : '#c9a24a'));
  canvas.drawCircle(x, y, Math.max(1.6, r * 0.2), paint);
}

/** Camera rig placed beside the window, kept 16 pt inside the screen edge, clear of the frame. */
export function cameraRig(box: Box, width: number, height: number, top: number, preferRight = false, mount: 'pole' | 'hang' = 'pole'): CamRig {
  const w = Math.min(width * 0.25, 104), h = w * (190 / 200);
  const inset = 16;
  // Clear of the brackets even at their 1.3x approach size.
  const gap = box.w * 0.15 + 8;
  const roomRight = width - inset - (box.x + box.w + gap);
  const roomLeft = box.x - gap - inset;
  let facing: 'left' | 'right' = 'left';
  let x: number;
  let y = Math.max(top + 64, box.y - h * 0.7);
  if (roomRight >= w) x = box.x + box.w + gap;
  else if (roomLeft >= w && !preferRight) { facing = 'right'; x = box.x - gap - w; }
  else {
    // No room beside the window: the camera rides above it, at the roomier side, pole beside the window.
    facing = preferRight || roomRight >= roomLeft ? 'left' : 'right';
    x = facing === 'left' ? width - inset - w : inset;
    y = Math.max(top + 64, box.y - h * 0.15 - box.h * 0.15 - h);
  }
  // The art's own lamps (red, yellow, green), measured on camera.webp (200 x 190).
  const flip = (fx: number) => (facing === 'left' ? fx : 1 - fx);
  const lamps = [[0.835, 0.4], [0.823, 0.558], [0.812, 0.717]].map(([fx, fy]) => ({ x: x + w * flip(fx), y: y + h * fy }));
  const lens = { x: x + w * flip(0.25), y: y + h * 0.51 };
  const poleW = w * 0.3;
  const poleTop = y + h * 0.9;
  const poleX = facing === 'left' ? Math.min(x + w * 0.8, Math.max(x + w * 0.5, box.x + box.w + gap))
    : Math.max(x + w * 0.2, Math.min(x + w * 0.5, box.x - gap));
  return { x, y, w, h, lens, lamps, lampR: Math.max(9, w * 0.07), facing,
    // Two mounts: on a pole to the ground, or hung from a beam above the scene.
    pole: mount === 'hang' ? { x: x + w * 0.5 - poleW / 2, y: -4, w: poleW, h: y + h * 0.12 + 4 }
      : { x: poleX - poleW / 2, y: poleTop, w: poleW, h: height - poleTop + 4 } };
}

/** Photo crop: the window and a margin, kept inside the scene. */
export function photoCrop(box: Box, width: number, height: number, aspect: number): Box {
  const w = Math.min(width, box.w * 1.9);
  const h = w * aspect;
  const x = Math.max(0, Math.min(width - w, box.x + box.w / 2 - w / 2));
  const y = Math.max(0, Math.min(height - h, box.y + box.h * 0.5 - h / 2));
  return { x, y, w, h };
}
