import { Skia, type SkImage } from '@shopify/react-native-skia';
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
export function drawStagePhoto(stage: RideStage, art: SceneArt, t: number, scale: number): SkImage | null {
  const { crop } = stage;
  const pw = Math.max(1, Math.round(crop.w * scale)), ph = Math.max(1, Math.round(crop.h * scale));
  const surface = Skia.Surface.MakeOffscreen(pw, ph) ?? Skia.Surface.Make(pw, ph);
  if (!surface) return null;
  const canvas = surface.getCanvas();
  canvas.scale(scale, scale);
  canvas.translate(-crop.x, -crop.y);
  canvas.drawPicture(stage.backdrop);
  const state = { t, clock: 0, rock: 0, riderIn: 1, alpha: 1, ghost: false, photo: true };
  stage.paint(canvas, state, stage.data, art);
  if (stage.foreground) canvas.drawPicture(stage.foreground);
  if (stage.emissive) stage.emissive(canvas, state, stage.data, art);
  surface.flush();
  const shot = surface.makeImageSnapshot();
  return shot.makeNonTextureImage?.() ?? shot;
}
