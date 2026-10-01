/**
 * boxes.ts: per-frame content boxes (x0, y0, x1, y1, aspect) for the current
 * theme, indexed by frame code, plus the key-pose size multipliers. The
 * renderer base-anchors every sprite with these so Finn sits in the well
 * instead of floating above it.
 */

import { ART_BOX, THEME_BOX, type WhackTheme } from '../assets';
import { KEY_POSE_BOX } from '../art.generated';
import {
  FRAME_COUNT, F_ANGLER, F_ANGLER_ANGRY, F_ANGLER_PEEK, F_BRUISER, F_BRUISER_DAZED, F_CONTACT, F_DAZED, F_DUCK, F_GLANCE, F_GOLDEN,
  F_GOLDEN_DAZED, F_HATOFF, F_PEEK, F_POP, F_PUFFED, F_PUFFER, F_SPIRAL, F_TONGUE,
} from './renderState';

export function boxesFor(theme: WhackTheme): number[][] {
  const t = THEME_BOX[theme];
  const p = KEY_POSE_BOX[theme];
  const b: number[][] = [];
  b[F_PEEK] = [...t[0]];
  b[F_POP] = [...t[1]];
  b[F_DAZED] = [...t[2]];
  b[F_GOLDEN] = [...ART_BOX.golden];
  b[F_ANGLER] = [...ART_BOX.angler];
  b[F_BRUISER] = [...ART_BOX.bruiser];
  b[F_BRUISER_DAZED] = [...ART_BOX.bruiserDazed];
  b[F_PUFFER] = [...ART_BOX.puffer];
  b[F_PUFFED] = [...ART_BOX.pufferPuffed];
  b[F_ANGLER_PEEK] = [...ART_BOX.anglerPeek];
  b[F_ANGLER_ANGRY] = [...ART_BOX.anglerAngry];
  b[F_GOLDEN_DAZED] = [...ART_BOX.goldenDazed];
  b[F_GLANCE] = [...p.glance];
  b[F_CONTACT] = [...p.contact];
  b[F_SPIRAL] = [...p.bonked_spiral];
  b[F_TONGUE] = [...p.bonked_tongue];
  b[F_HATOFF] = [...p.bonked_hatoff];
  b[F_DUCK] = [...p.duck];
  return b;
}

/**
 * Key-pose canvas width relative to the theme's pop canvas (measured on the
 * gate sheets: the poses share the pop's framing, except where noted).
 */
const POSE_SCALE: Partial<Record<WhackTheme, Partial<Record<number, number>>>> = {
  // The space hat-off pose was re-rolled as a single and drawn smaller in its canvas.
  space: { [F_HATOFF]: 1.25 },
};

export function poseScaleFor(theme: WhackTheme): number[] {
  const out: number[] = [];
  for (let f = 0; f < FRAME_COUNT; f++) out.push(1);
  const o = POSE_SCALE[theme];
  if (o) for (const k of Object.keys(o)) out[Number(k)] = o[Number(k)] ?? 1;
  return out;
}
