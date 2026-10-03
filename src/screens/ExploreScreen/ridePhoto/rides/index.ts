import { Skia, TileMode, type SkImage } from '@shopify/react-native-skia';
import { RIDES, type RideKind } from './catalog';
import { buildCoaster } from './coaster';
import { buildFlume } from './flume';
import { buildTeacups } from './teacups';
import type { BuildCtx, RideStage, SceneArt } from './stage';

export * from './catalog';
export type { RideStage, BuildCtx, SceneArt, CamRig, Box, PaintState } from './stage';

const BUILDERS: Partial<Record<RideKind, (ctx: BuildCtx) => RideStage>> = {
  coaster: buildCoaster,
  flume: buildFlume,
  teacups: buildTeacups,
};

/** Build one ride for one open. A ride that is not built yet uses its ready fallback. */
export function buildStage(kind: RideKind, ctx: BuildCtx): RideStage {
  const ready = RIDES[kind].ready && BUILDERS[kind] ? kind : RIDES[kind].fallback;
  return (BUILDERS[ready] ?? buildCoaster)(ctx);
}

/**
 * The photo at pass time t: only the crop, at `scale` pixels per point, drawn by
 * the same paint the live scene uses (no camera rig, no telegraph).
 */
export function drawStagePhoto(stage: RideStage, art: SceneArt, t: number, scale: number, blurry = false): SkImage | null {
  const { crop } = stage;
  const pw = Math.max(1, Math.round(crop.w * scale)), ph = Math.max(1, Math.round(crop.h * scale));
  const surface = Skia.Surface.MakeOffscreen(pw, ph) ?? Skia.Surface.Make(pw, ph);
  if (!surface) return null;
  const canvas = surface.getCanvas();
  canvas.scale(scale, scale);
  canvas.translate(-crop.x, -crop.y);
  const state = { t, clock: 0, rock: 0, riderIn: 1, alpha: 1, ghost: false, photo: true };
  if (blurry) {
    // A Blurry looks blurry before you read the plate: a directional motion blur along the travel,
    // the vehicle smeared toward where it should have been, at 85% saturation.
    const layer = Skia.Paint();
    layer.setImageFilter(Skia.ImageFilter.MakeBlur(7 * scale, 1.2 * scale, TileMode.Clamp, null));
    layer.setColorFilter(Skia.ColorFilter.MakeMatrix(saturation(0.85)));
    canvas.saveLayer(layer);
    canvas.drawPicture(stage.backdrop);
    for (let k = 4; k >= 1; k--) {
      const tk = t + (stage.frameT - t) * (k / 7);
      stage.paint(canvas, { ...state, t: tk, alpha: 0.18 + 0.05 * (4 - k), ghost: true }, stage.data, art);
    }
    stage.paint(canvas, state, stage.data, art);
    if (stage.foreground) canvas.drawPicture(stage.foreground);
    stage.front?.(canvas, state, stage.data, art);
    canvas.restore();
  } else {
    canvas.drawPicture(stage.backdrop);
    stage.paint(canvas, state, stage.data, art);
    if (stage.foreground) canvas.drawPicture(stage.foreground);
    stage.front?.(canvas, state, stage.data, art);
    if (stage.emissive) stage.emissive(canvas, state, stage.data, art);
  }
  surface.flush();
  const shot = surface.makeImageSnapshot();
  return shot.makeNonTextureImage?.() ?? shot;
}

function saturation(s: number): number[] {
  const r = 0.2126 * (1 - s), g = 0.7152 * (1 - s), b = 0.0722 * (1 - s);
  return [r + s, g, b, 0, 0, r, g + s, b, 0, 0, r, g, b + s, 0, 0, 0, 0, 0, 1, 0];
}
